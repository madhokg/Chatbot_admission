import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fs from "node:fs";

const app = express();
app.set("trust proxy", 1); // needed on hosts like Render so rate limiting sees each visitor's real IP
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY; // key stays on the server
const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4";
const KB = JSON.parse(fs.readFileSync("./knowledge.json", "utf8"));
const SCHOOL = process.env.SCHOOL_NAME || "our school";
const CONTACT = process.env.ADMISSIONS_CONTACT || "the admissions office";
const HOOK = process.env.LEADS_WEBHOOK_URL; // Google Apps Script web app URL (see google-apps-script.gs)
const HOOK_SECRET = process.env.LEADS_WEBHOOK_SECRET || "";

app.use(express.json({ limit: "20kb" }));
// ALLOWED_ORIGIN can hold several addresses separated by commas
const origins = (process.env.ALLOWED_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : false }));
app.use(express.static("public")); // serves /widget.js
app.use("/api/", rateLimit({ windowMs: 60_000, max: 20 })); // 20 requests/min per IP
const leadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5, // 5 callback requests per hour per IP
  message: { error: "Too many requests. Please try again later." },
});

// Send a record (lead or question) to the Google Sheet webhook. Never breaks the chat.
async function record(payload) {
  if (!HOOK) return false;
  try {
    const r = await fetch(HOOK, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret: HOOK_SECRET }),
    });
    const text = (await r.text()).trim();
    if (text !== "ok") console.error("Webhook replied:", r.status, text.slice(0, 200)); // e.g. "forbidden" = secret mismatch
    return r.ok && text === "ok";
  } catch (e) {
    console.error("Webhook error:", e.message);
    return false;
  }
}

// Remove emails and phone-like numbers before a question is logged
const redact = (s) =>
  s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/\+?\d[\d\s-]{7,}\d/g, "[number]");

// Simple keyword retrieval. Replace with embeddings + a vector DB if your content grows large.
function retrieve(question, k = 4) {
  const words = question.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  return KB.map((c) => {
    const hay = (c.topic + " " + c.text).toLowerCase();
    return { c, score: words.filter((w) => hay.includes(w)).length };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((r) => r.score > 0)
    .map((r) => `[${r.c.topic}] ${r.c.text}`);
}

app.post("/api/chat", async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages = raw
      .slice(-8) // keep recent history only
      .filter((m) => ["user", "assistant"].includes(m.role) && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return res.status(400).json({ error: "Send at least one user message." });
    }

    const question = messages[messages.length - 1].content;
    const context = retrieve(question);
    const system = `You are the admissions assistant for ${SCHOOL}. Answer parents' questions in a friendly, concise way.
Use ONLY the admission information below. If the answer is not there, say you don't have that detail and give this contact: ${CONTACT}.
Never guess fees, dates or eligibility. Never promise or predict admission outcomes. Don't ask for sensitive personal data (ID numbers, health details).
Reply in the language the user writes in.

ADMISSION INFORMATION:
${context.length ? context.join("\n") : "(No matching information found.)"}`;

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "X-Title": `${SCHOOL} admissions chatbot`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("OpenRouter error:", r.status, JSON.stringify(data));
      return res.status(500).json({ error: `Something went wrong. Please contact ${CONTACT}.` });
    }
    const reply = data.choices?.[0]?.message?.content || `Sorry, I could not answer that. Please contact ${CONTACT}.`;

    // Question logging (redacted). Not awaited so the parent gets the answer immediately.
    const entry = { type: "question", time: new Date().toISOString(), question: redact(question).slice(0, 500), reply: reply.slice(0, 1500) };
    if (HOOK) record(entry);
    else console.log("QUESTION:", JSON.stringify(entry));

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Something went wrong. Please contact ${CONTACT}.` });
  }
});

// Callback request / lead capture
app.post("/api/lead", leadLimiter, async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // hidden honeypot field: bots fill it, people don't
  const clean = (v, n) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const lead = {
    type: "lead",
    time: new Date().toISOString(),
    name: clean(b.name, 80),
    phone: clean(b.phone, 20),
    email: clean(b.email, 100),
    message: clean(b.message, 500),
  };
  const digits = lead.phone.replace(/\D/g, "");
  if (lead.name.length < 2 || digits.length < 8 || digits.length > 15) {
    return res.status(400).json({ error: "Please enter your name and a valid phone number." });
  }
  if (lead.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) {
    return res.status(400).json({ error: "Please enter a valid email address or leave it empty." });
  }
  if (b.consent !== true) {
    return res.status(400).json({ error: "Please tick the box to allow the school to contact you." });
  }

  if (!HOOK) {
    console.log("LEAD (no webhook configured):", JSON.stringify(lead)); // visible in your host's logs
    return res.json({ ok: true });
  }
  const saved = await record(lead);
  if (!saved) {
    console.error("LEAD NOT SAVED, recover it from here:", JSON.stringify(lead));
    return res.status(502).json({ error: `Sorry, we could not send your details. Please contact ${CONTACT}.` });
  }
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, () => console.log("Chatbot running on port", process.env.PORT || 3000));
