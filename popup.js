// MindPrint — popup UI.

const SITES = [
  "www.bbc.com",
  "www.bbc.co.uk",
  "www.reuters.com",
  "www.theguardian.com",
  "news.ycombinator.com",
];

const els = {
  enabled: document.getElementById("enabled"),
  engineRadios: document.querySelectorAll('input[name="engine"]'),
  tribeSection: document.getElementById("tribe-section"),
  claudeSection: document.getElementById("claude-section"),
  backendUrl: document.getElementById("backendUrl"),
  saveBackend: document.getElementById("saveBackend"),
  testBackend: document.getElementById("testBackend"),
  fallbackToClaude: document.getElementById("fallbackToClaude"),
  backendStatus: document.getElementById("backendStatus"),
  apiKey: document.getElementById("apiKey"),
  saveKey: document.getElementById("saveKey"),
  keyStatus: document.getElementById("keyStatus"),
  sites: document.getElementById("sites"),
  today: document.getElementById("today"),
  clearCache: document.getElementById("clearCache"),
};

function setStatus(el, msg, kind = "") {
  el.textContent = msg;
  el.className = "status " + kind;
  if (msg) setTimeout(() => {
    if (el.textContent === msg) { el.textContent = ""; el.className = "status"; }
  }, 3500);
}

function send(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

function renderSites(siteMap) {
  els.sites.innerHTML = "";
  for (const host of SITES) {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `site-${host}`;
    cb.checked = siteMap[host] !== false;
    cb.addEventListener("change", async () => {
      const settings = await send({ type: "getSettings" });
      const next = { ...(settings.sites || {}), [host]: cb.checked };
      await send({ type: "saveSettings", patch: { sites: next } });
    });
    const label = document.createElement("label");
    label.htmlFor = cb.id;
    label.textContent = host.replace(/^www\./, "");
    li.append(cb, label);
    els.sites.appendChild(li);
  }
}

function applyEngineUI(engine) {
  for (const r of els.engineRadios) r.checked = r.value === engine;
  els.tribeSection.style.display  = engine === "tribe"  ? "" : "none";
  els.claudeSection.style.display = engine === "claude" || document.getElementById("fallbackToClaude")?.checked ? "" : "none";
}

async function load() {
  const s = await send({ type: "getSettings" });
  els.enabled.checked = !!s.enabled;
  els.fallbackToClaude.checked = !!s.fallbackToClaude;
  els.backendUrl.value = s.backendUrl || "";
  els.apiKey.value = "";
  els.apiKey.placeholder = s.apiKey ? "••• key saved (overwrite to replace)" : "sk-ant-…";
  renderSites(s.sites || {});
  els.today.textContent = `${s.analyzedToday || 0} analyzed today`;
  applyEngineUI(s.engine || "tribe");
}

// ---- handlers ----

els.enabled.addEventListener("change", async () => {
  await send({ type: "saveSettings", patch: { enabled: els.enabled.checked } });
});

for (const r of els.engineRadios) {
  r.addEventListener("change", async () => {
    if (!r.checked) return;
    await send({ type: "saveSettings", patch: { engine: r.value } });
    applyEngineUI(r.value);
  });
}

els.fallbackToClaude.addEventListener("change", async () => {
  await send({ type: "saveSettings", patch: { fallbackToClaude: els.fallbackToClaude.checked } });
  const engine = [...els.engineRadios].find(r => r.checked)?.value || "tribe";
  applyEngineUI(engine);
});

els.saveBackend.addEventListener("click", async () => {
  const v = els.backendUrl.value.trim().replace(/\/+$/, "");
  if (!v) { setStatus(els.backendStatus, "Enter a URL first.", "err"); return; }
  if (!/^https?:\/\//.test(v)) { setStatus(els.backendStatus, "URL must start with http(s)://", "err"); return; }
  // Request runtime host permission for user-supplied URLs.
  try {
    const origin = new URL(v).origin + "/*";
    const already = await chrome.permissions.contains({ origins: [origin] });
    if (!already) {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) { setStatus(els.backendStatus, "Permission denied.", "err"); return; }
    }
  } catch (e) {
    setStatus(els.backendStatus, "Invalid URL.", "err"); return;
  }
  await send({ type: "saveSettings", patch: { backendUrl: v } });
  setStatus(els.backendStatus, "Saved.", "ok");
});

els.testBackend.addEventListener("click", async () => {
  const url = els.backendUrl.value.trim().replace(/\/+$/, "");
  if (!url) { setStatus(els.backendStatus, "Enter a URL first.", "err"); return; }
  setStatus(els.backendStatus, "Testing…");
  const r = await send({ type: "testBackend", url });
  if (r?.ok) setStatus(els.backendStatus, `OK (${r.status || 200})`, "ok");
  else setStatus(els.backendStatus, `Failed: ${r?.error || r?.status || "unknown"}`, "err");
});

els.saveKey.addEventListener("click", async () => {
  const v = els.apiKey.value.trim();
  if (!v) { setStatus(els.keyStatus, "Enter a key first.", "err"); return; }
  if (!v.startsWith("sk-ant-")) { setStatus(els.keyStatus, "That doesn't look like an Anthropic key.", "err"); return; }
  await send({ type: "saveSettings", patch: { apiKey: v } });
  els.apiKey.value = "";
  els.apiKey.placeholder = "••• key saved (overwrite to replace)";
  setStatus(els.keyStatus, "Saved.", "ok");
});

els.clearCache.addEventListener("click", async () => {
  const resp = await send({ type: "clearCache" });
  if (resp?.ok) setStatus(els.backendStatus, `Cleared ${resp.cleared} cached labels.`, "ok");
});

load();
