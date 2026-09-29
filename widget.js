/* Embeddable admissions chat widget.
   Usage: <script src="https://YOUR-SERVER/widget.js" data-title="Admissions" data-color="#1f5c4a"></script> */
(function () {
  const script = document.currentScript;
  const API = (script.dataset.api || new URL(script.src).origin) + "/api/chat";
  const TITLE = script.dataset.title || "Admissions help";
  const COLOR = script.dataset.color || "#1f5c4a";
  const CHIPS = ["Admission dates", "Fees", "Documents needed", "How to apply"];
  const history = [];

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" }); // isolates styles from your site

  root.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .fab { position: fixed; right: 20px; bottom: 20px; z-index: 99999; border: 0; cursor: pointer;
      background: ${COLOR}; color: #fff; padding: 14px 20px; border-radius: 999px; font-size: 15px;
      box-shadow: 0 4px 14px rgba(0,0,0,.25); }
    .panel { position: fixed; right: 20px; bottom: 80px; z-index: 99999; width: 360px; max-width: calc(100vw - 24px);
      height: 500px; max-height: calc(100vh - 110px); background: #fff; border-radius: 14px; display: none;
      flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
    .panel.open { display: flex; }
    header { background: ${COLOR}; color: #fff; padding: 14px 16px; font-weight: 600; display: flex; justify-content: space-between; }
    header button { background: none; border: 0; color: #fff; font-size: 20px; cursor: pointer; }
    .log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f6f5f1; }
    .msg { max-width: 85%; padding: 10px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
    .bot { background: #fff; align-self: flex-start; border: 1px solid #e4e1d8; }
    .me { background: ${COLOR}; color: #fff; align-self: flex-end; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1px solid ${COLOR}; color: ${COLOR}; background: #fff; border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
    form.chat { display: flex; gap: 8px; padding: 10px 10px 4px; border-top: 1px solid #e4e1d8; }
    form.chat input { flex: 1; padding: 10px; border: 1px solid #cfcbbf; border-radius: 8px; font-size: 14px; }
    form.chat button { background: ${COLOR}; color: #fff; border: 0; border-radius: 8px; padding: 0 16px; cursor: pointer; }
    .notice { background: #fff8e1; color: #5f4b00; font-size: 11.5px; padding: 6px 12px; line-height: 1.35; }
    .cta { background: none; border: 0; color: ${COLOR}; text-decoration: underline; font-size: 13px; padding: 4px 10px 10px; cursor: pointer; text-align: center; }
    .lead { position: absolute; inset: 0; background: #fff; display: flex; flex-direction: column; z-index: 2; }
    .lead[hidden] { display: none; }
    .leadform { padding: 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
    .leadform label { font-size: 13px; display: flex; flex-direction: column; gap: 4px; color: #333; }
    .leadform input:not([type=checkbox]), .leadform textarea { padding: 9px; border: 1px solid #cfcbbf; border-radius: 8px; font-size: 14px; font-family: inherit; }
    .leadform .check { flex-direction: row; align-items: flex-start; gap: 8px; font-size: 12px; }
    .hp { position: absolute; left: -9999px; height: 0; width: 0; }
    .err { color: #b3261e; font-size: 13px; min-height: 16px; }
    .submit { background: ${COLOR}; color: #fff; border: 0; border-radius: 8px; padding: 11px; font-size: 14px; cursor: pointer; }
    .submit:disabled { opacity: .6; cursor: default; }
    button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid #f2a900; outline-offset: 2px; }
  </style>
  <button class="fab" aria-label="Open chat">Ask admissions</button>
  <section class="panel" role="dialog" aria-label="${TITLE}">
    <header><span>${TITLE}</span><button class="close" aria-label="Close chat">×</button></header>
    <div class="notice">This assistant can make mistakes. Please confirm important details with the admissions office. Don't share sensitive personal information here. Messages are processed by an AI service and may be saved to improve answers.</div>
    <div class="log" aria-live="polite"></div>
    <form class="chat"><input placeholder="Type your question" aria-label="Your question" maxlength="500" /><button>Send</button></form>
    <button class="cta" type="button">Request a callback from the admissions team</button>
    <div class="lead" hidden>
      <header><span>Request a callback</span><button class="lclose" type="button" aria-label="Back to chat">×</button></header>
      <form class="leadform">
        <label>Parent name *<input name="name" required maxlength="80" autocomplete="name"></label>
        <label>Phone number *<input name="phone" type="tel" required maxlength="20" autocomplete="tel"></label>
        <label>Email (optional)<input name="email" type="email" maxlength="100" autocomplete="email"></label>
        <label>Your question (optional)<textarea name="message" rows="3" maxlength="500"></textarea></label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="check"><input type="checkbox" name="consent" required> I agree that the admissions office may contact me using these details.</label>
        <p class="err" role="alert"></p>
        <button class="submit" type="submit">Send details</button>
      </form>
    </div>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const panel = $(".panel"), log = $(".log"), input = $("form.chat input");

  function add(text, who) {
    const d = document.createElement("div");
    d.className = "msg " + who;
    d.textContent = text; // textContent prevents script injection
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  async function send(text) {
    text = text.trim();
    if (!text) return;
    add(text, "me");
    history.push({ role: "user", content: text });
    const wait = add("Typing…", "bot");
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) });
      const data = await r.json();
      const reply = data.reply || data.error || "Sorry, please try again.";
      wait.textContent = reply;
      if (data.reply) history.push({ role: "assistant", content: reply });
    } catch {
      wait.textContent = "Can't reach the assistant right now. Please contact the admissions office.";
    }
    log.scrollTop = log.scrollHeight;
  }

  function open() {
    panel.classList.add("open");
    if (!log.children.length) {
      add("Hello! I can help with admission dates, fees, documents and the application process.", "bot");
      const chips = document.createElement("div");
      chips.className = "chips";
      CHIPS.forEach((c) => {
        const b = document.createElement("button");
        b.className = "chip"; b.textContent = c;
        b.onclick = () => { chips.remove(); send(c); };
        chips.appendChild(b);
      });
      log.appendChild(chips);
    }
    input.focus();
  }

  $(".fab").onclick = () => (panel.classList.contains("open") ? panel.classList.remove("open") : open());
  $(".close").onclick = () => panel.classList.remove("open");
  root.addEventListener("keydown", (e) => e.key === "Escape" && panel.classList.remove("open"));
  $("form.chat").onsubmit = (e) => { e.preventDefault(); const t = input.value; input.value = ""; send(t); };

  // Callback request (lead capture)
  const LEAD_API = API.replace(/\/chat$/, "/lead");
  const lead = $(".lead"), lform = $(".leadform"), err = $(".err");
  const field = (n) => lform.querySelector(`[name=${n}]`);
  $(".cta").onclick = () => { lead.hidden = false; field("name").focus(); };
  $(".lclose").onclick = () => { lead.hidden = true; input.focus(); };
  lform.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $(".submit");
    err.textContent = "";
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const r = await fetch(LEAD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: field("name").value, phone: field("phone").value, email: field("email").value,
          message: field("message").value, website: field("website").value, consent: field("consent").checked,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not send. Please try again.");
      lform.reset(); lead.hidden = true;
      add("Thank you! Your details have been sent to the admissions team. They will contact you soon.", "bot");
    } catch (x) {
      err.textContent = x.message || "Could not send. Please try again.";
    }
    btn.disabled = false; btn.textContent = "Send details";
  };
})();
