import { engine } from "./engine.js";
import { resolveInput, display, hostOf } from "./url.js";

/* ---------- storage ---------- */
const load = (k, d) => {
  try { return JSON.parse(localStorage.getItem("crimson:" + k)) ?? d; } catch { return d; }
};
const save = (k, v) => localStorage.setItem("crimson:" + k, JSON.stringify(v));
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ENGINES = {
  duckduckgo: ["DuckDuckGo", "https://duckduckgo.com/?q=%s"],
  google: ["Google", "https://www.google.com/search?q=%s"],
  bing: ["Bing", "https://www.bing.com/search?q=%s"],
  brave: ["Brave Search", "https://search.brave.com/search?q=%s"],
};
const QUICK = [
  ["Wikipedia", "https://www.wikipedia.org/"],
  ["YouTube", "https://www.youtube.com/"],
  ["Reddit", "https://www.reddit.com/"],
  ["GitHub", "https://github.com/"],
  ["Twitch", "https://www.twitch.tv/"],
  ["Spotify", "https://open.spotify.com/"],
];
const DEFAULTS = { engine: "duckduckgo", transport: "libcurl", wisp: "", bare: "", accent: "#e11d48", cloakTitle: "", saveHistory: true };

let settings = { ...DEFAULTS, ...load("settings", {}) };
let bookmarks = load("bookmarks", []);
let visits = load("history", []);

const applyAppearance = () => {
  document.documentElement.style.setProperty("--accent", settings.accent);
  document.title = settings.cloakTitle || "Crimson";
};
applyAppearance();

/* ---------- status toast ---------- */
const statusEl = $("#status");
let statusTimer;
const toast = (msg) => {
  statusEl.textContent = msg;
  statusEl.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.hidden = true), 3500);
};

/* ---------- tabs ---------- */
let seq = 0;
const viewport = $("#viewport");
const homeView = $("#home-view");

class Tab {
  constructor(url = "") {
    this.id = ++seq;
    this.url = "";
    this.title = "New tab";
    this.loading = false;
    this.hist = [];
    this.idx = -1;
    this.session = null;
    this.pending = null;
    this.dead = false;
    this.el = document.createElement("iframe");
    this.el.className = "frame";
    this.el.setAttribute("sandbox", "allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock allow-orientation-lock");
    this.el.setAttribute("allow", "autoplay; fullscreen; clipboard-read; clipboard-write; gamepad");
    viewport.append(this.el);
    if (url) this.go(url);
  }

  get isHome() { return !this.url; }

  async ensure() {
    if (this.session) return this.session;
    this.pending ??= engine.createSession(this.el, {
      url: (u) => { this.record(u); this.title = hostOf(u); this.logVisit(u); render(); },
      loading: () => { this.loading = true; render(); },
      ready: () => { this.loading = false; this.readTitle(); render(); },
      error: () => { this.loading = false; render(); },
      escape: (u) => openTab(u),
    });
    try {
      const s = await this.pending;
      if (this.dead) s.destroy(); else this.session = s;
    } finally { this.pending = null; }
    return this.session;
  }

  readTitle() {
    try {
      const t = this.el.contentDocument?.title?.trim();
      if (t) this.title = t;
    } catch {}
  }

  logVisit(u) {
    if (!settings.saveHistory) return;
    if (visits[0]?.url === u) return;
    visits.unshift({ url: u, title: hostOf(u), at: Date.now() });
    visits = visits.slice(0, 300);
    save("history", visits);
  }

  record(u) {
    if (this.hist[this.idx] === u) { this.url = u; return; }
    const back = this.hist.lastIndexOf(u, this.idx - 1);
    if (back >= 0) { this.idx = back; this.url = u; return; }
    this.hist.splice(this.idx + 1);
    this.hist.push(u);
    this.idx = this.hist.length - 1;
    this.url = u;
  }

  async go(u) {
    if (this.dead) return;
    this.record(u);
    this.title = hostOf(u);
    render();
    const s = await this.ensure();
    if (!this.dead) s.go(u);
  }

  async jump(delta) {
    const i = this.idx + delta;
    if (i < 0 || i >= this.hist.length) return;
    this.idx = i;
    this.url = this.hist[i];
    render();
    (await this.ensure()).go(this.url);
  }

  goHome() {
    this.url = "";
    this.title = "New tab";
    this.loading = false;
    render();
  }

  destroy() {
    this.dead = true;
    this.session?.destroy();
    this.el.remove();
  }
}

const tabs = [];
let active = null;

function openTab(url = "") {
  const t = new Tab(url);
  tabs.push(t);
  active = t;
  render();
  if (!url) $("#address").focus();
  return t;
}

function closeTab(t) {
  const i = tabs.indexOf(t);
  if (i < 0) return;
  tabs.splice(i, 1);
  t.destroy();
  if (!tabs.length) return openTab();
  if (active === t) active = tabs[i] ?? tabs[i - 1];
  render();
}

function navigate(input, tab = active) {
  const r = resolveInput(input, ENGINES[settings.engine][1]);
  if (r.kind === "empty") return;
  if (r.kind === "blocked") return toast("That address can't be opened.");
  tab.go(r.url);
}

/* ---------- render ---------- */
const tabsEl = $("#tabs");
const addr = $("#address");

function render() {
  tabsEl.innerHTML = "";
  for (const t of tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (t === active ? " active" : "");
    el.setAttribute("role", "tab");
    el.innerHTML = `<span class="dot">${esc((t.isHome ? "C" : t.title[0] || "?").toUpperCase())}</span><span class="title">${esc(t.isHome ? "New tab" : t.title)}</span><button class="x" aria-label="Close tab">✕</button>`;
    el.onclick = () => { active = t; render(); };
    el.querySelector(".x").onclick = (e) => { e.stopPropagation(); closeTab(t); };
    tabsEl.append(el);
  }
  for (const t of tabs) t.el.classList.toggle("active", t === active && !t.isHome);
  homeView.classList.toggle("active", !!active?.isHome);

  if (document.activeElement !== addr) addr.value = active?.isHome ? "" : display(active?.url ?? "");
  $("#back").disabled = !active || active.idx <= 0;
  $("#forward").disabled = !active || active.idx >= active.hist.length - 1;
  $("#loadbar").classList.toggle("on", !!active?.loading);
  const marked = !!active && !active.isHome && bookmarks.some((b) => b.url === active.url);
  const star = $("#star");
  star.setAttribute("aria-pressed", String(marked));
  star.textContent = marked ? "★" : "☆";
}

/* ---------- home page ---------- */
function renderQuick() {
  const items = [...bookmarks.slice(0, 6).map((b) => [b.title, b.url]), ...QUICK].slice(0, 12);
  const box = $("#quick");
  box.innerHTML = "";
  for (const [name, url] of items) {
    const el = document.createElement("div");
    el.className = "tile";
    el.innerHTML = `<div class="ic">${esc(name[0].toUpperCase())}</div><div class="nm">${esc(name)}</div>`;
    el.onclick = () => active.go(url);
    box.append(el);
  }
}

/* ---------- panels ---------- */
const panel = $("#panel");
const panelBody = $("#panel-body");
const openPanel = (title, fill) => {
  $("#panel-title").textContent = title;
  panelBody.innerHTML = "";
  fill(panelBody);
  if (!panel.open) panel.showModal();
};
$("#panel-close").onclick = () => panel.close();
panel.addEventListener("click", (e) => { if (e.target === panel) panel.close(); });

function listPanel(items, empty, onPick, onRemove) {
  return (root) => {
    if (!items().length) { root.innerHTML = `<div class="empty">${empty}</div>`; return; }
    for (const it of items()) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="t"><b>${esc(it.title || hostOf(it.url))}</b><span>${esc(display(it.url))}</span></div><button class="ibtn" title="Remove" aria-label="Remove">✕</button>`;
      row.onclick = () => { panel.close(); onPick(it); };
      row.querySelector("button").onclick = (e) => { e.stopPropagation(); onRemove(it); row.remove(); };
      root.append(row);
    }
  };
}

function showBookmarks() {
  openPanel("Bookmarks", listPanel(
    () => bookmarks, "No bookmarks yet. Press ☆ on any page.",
    (b) => active.go(b.url),
    (b) => { bookmarks = bookmarks.filter((x) => x !== b); save("bookmarks", bookmarks); renderQuick(); render(); }
  ));
}

function showHistory() {
  openPanel("History", (root) => {
    const clear = document.createElement("button");
    clear.className = "btn danger";
    clear.textContent = "Clear history";
    clear.style.marginBottom = "10px";
    clear.onclick = () => { visits = []; save("history", visits); showHistory(); };
    root.append(clear);
    listPanel(() => visits, "Nothing here yet.", (v) => active.go(v.url),
      (v) => { visits = visits.filter((x) => x !== v); save("history", visits); })(root);
  });
}

function showSettings() {
  openPanel("Settings", (root) => {
    root.innerHTML = `
      <div class="field"><label for="s-engine">Search engine</label>
        <select id="s-engine">${Object.entries(ENGINES).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
      <div class="field"><label for="s-transport">Connection method</label>
        <select id="s-transport">${engine.transports.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("")}</select>
        <small>libcurl is the best default. Switch if a site misbehaves.</small></div>
      <div class="field"><label for="s-wisp">Custom Wisp server URL</label>
        <input id="s-wisp" type="text" placeholder="wss://your-server/wisp/ (blank = this server)" />
        <small>Only change this if you run the Wisp backend on a different host.</small></div>
      <div class="field"><label for="s-accent">Accent color</label>
        <div class="inline"><input id="s-accent" type="color" /></div></div>
      <div class="field"><label for="s-title">Tab title</label>
        <input id="s-title" type="text" placeholder="Crimson" />
        <small>Changes this browser tab's title.</small></div>
      <div class="field"><label class="inline"><input id="s-hist" type="checkbox" /> Save browsing history on this device</label></div>
      <div class="field"><button id="s-reset" class="btn danger">Reset everything (settings, bookmarks, history)</button></div>`;
    $("#s-engine", root).value = settings.engine;
    $("#s-transport", root).value = settings.transport;
    $("#s-wisp", root).value = settings.wisp;
    $("#s-accent", root).value = settings.accent;
    $("#s-title", root).value = settings.cloakTitle;
    $("#s-hist", root).checked = settings.saveHistory;

    const commit = async () => {
      settings = {
        ...settings,
        engine: $("#s-engine", root).value,
        transport: $("#s-transport", root).value,
        wisp: $("#s-wisp", root).value.trim(),
        accent: $("#s-accent", root).value,
        cloakTitle: $("#s-title", root).value.trim(),
        saveHistory: $("#s-hist", root).checked,
      };
      save("settings", settings);
      applyAppearance();
      try {
        await engine.setTransport({ kind: settings.transport, wisp: settings.wisp, bare: settings.bare });
      } catch (e) { toast("Could not switch connection: " + e.message); }
    };
    root.querySelectorAll("select, input").forEach((el) => el.addEventListener("change", commit));
    $("#s-reset", root).onclick = () => {
      if (!confirm("Reset all Crimson data on this device?")) return;
      Object.keys(localStorage).filter((k) => k.startsWith("crimson:")).forEach((k) => localStorage.removeItem(k));
      location.reload();
    };
  });
}

/* ---------- wiring ---------- */
$("#newtab").onclick = () => openTab();
$("#back").onclick = () => active?.jump(-1);
$("#forward").onclick = () => active?.jump(1);
$("#reload").onclick = () => (active?.isHome ? null : active?.session?.reload());
$("#home").onclick = () => active?.goHome();
$("#open-bookmarks").onclick = showBookmarks;
$("#open-history").onclick = showHistory;
$("#open-settings").onclick = showSettings;

$("#star").onclick = () => {
  if (!active || active.isHome) return;
  const i = bookmarks.findIndex((b) => b.url === active.url);
  if (i >= 0) bookmarks.splice(i, 1);
  else bookmarks.unshift({ url: active.url, title: active.title });
  save("bookmarks", bookmarks);
  renderQuick();
  render();
};

$("#omnibox").onsubmit = (e) => { e.preventDefault(); navigate(addr.value); addr.blur(); };
addr.addEventListener("focus", () => addr.select());
addr.addEventListener("blur", render);
$("#home-form").onsubmit = (e) => { e.preventDefault(); navigate($("#home-input").value); $("#home-input").value = ""; };

document.addEventListener("keydown", (e) => {
  if (!e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "t") { e.preventDefault(); openTab(); }
  else if (k === "w") { e.preventDefault(); closeTab(active); }
  else if (k === "r") { e.preventDefault(); active?.session?.reload(); }
  else if (k === "l") { e.preventDefault(); addr.focus(); }
});

/* ---------- boot ---------- */
engine.setTransport({ kind: settings.transport, wisp: settings.wisp, bare: settings.bare });
renderQuick();
openTab();
engine.init().catch((e) => toast("Proxy backend failed to start: " + e.message));
