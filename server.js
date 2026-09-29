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

app.use(express.json({ limit: "20kb" }));
// ALLOWED_ORIGIN can hold several addresses separated by commas
const origins = (process.env.ALLOWED_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : false }));
app.use(express.static("public")); // serves /widget.js
app.use("/api/", rateLimit({ windowMs: 60_000, max: 20 })); // 20 requests/min per IP

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

    const context = retrieve(messages[messages.length - 1].content);
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
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Something went wrong. Please contact ${CONTACT}.` });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Chatbot running on port", process.env.PORT || 3000));
