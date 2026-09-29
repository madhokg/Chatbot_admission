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
    form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e4e1d8; }
    input { flex: 1; padding: 10px; border: 1px solid #cfcbbf; border-radius: 8px; font-size: 14px; }
    form button { background: ${COLOR}; color: #fff; border: 0; border-radius: 8px; padding: 0 16px; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 3px solid #f2a900; outline-offset: 2px; }
  </style>
  <button class="fab" aria-label="Open chat">Ask admissions</button>
  <section class="panel" role="dialog" aria-label="${TITLE}">
    <header><span>${TITLE}</span><button class="close" aria-label="Close chat">×</button></header>
    <div class="log" aria-live="polite"></div>
    <form><input placeholder="Type your question" aria-label="Your question" maxlength="500" /><button>Send</button></form>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const panel = $(".panel"), log = $(".log"), input = $("input");

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
  $("form").onsubmit = (e) => { e.preventDefault(); const t = input.value; input.value = ""; send(t); };
})();
