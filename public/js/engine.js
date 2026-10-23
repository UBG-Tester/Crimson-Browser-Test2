// Scramjet controller + transport wiring.
let controller = null;
let booting = null;

const wispDefault = () =>
  (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/wisp/";
const bareDefault = () => new URL("/bare/", location.href).href;

const MODULES = {
  libcurl: "/libcurl/index.mjs",
  epoxy: "/epoxy/index.mjs",
  bare: "/baremod/index.mjs",
};

let wanted = { kind: "libcurl", wisp: "", bare: "" };
let applied = "";

const resolve = (cfg) => {
  const kind = MODULES[cfg.kind] ? cfg.kind : "libcurl";
  const endpoint = kind === "bare" ? cfg.bare || bareDefault() : cfg.wisp || wispDefault();
  return { kind, path: MODULES[kind], endpoint };
};

async function buildTransport(cfg) {
  const { kind, path, endpoint } = resolve(cfg);
  const mod = await import(path);
  applied = JSON.stringify([path, endpoint]);
  return kind === "bare" ? new mod.default(endpoint) : new mod.default({ wisp: endpoint });
}

const loadScript = (src) =>
  new Promise((ok, fail) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.onload = ok;
    el.onerror = () => fail(new Error("Failed to load " + src));
    document.head.append(el);
  });

async function registerSW() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers need https:// (or localhost).");
  }
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  void reg.update();
  const ready = await navigator.serviceWorker.ready;
  const worker = ready.active ?? navigator.serviceWorker.controller;
  if (!worker) throw new Error("Service worker never became active.");
  return worker;
}

async function boot() {
  const [serviceworker] = await Promise.all([
    registerSW(),
    loadScript("/scram/scramjet.js"),
    loadScript("/controller/controller.api.js"),
    loadScript("/utils/scramjet-utils.js"),
  ]);
  controller = new window.$scramjetController.Controller({
    serviceworker,
    transport: await buildTransport(wanted),
    config: {
      scramjetPath: "/scram/scramjet.js",
      wasmPath: "/scram/scramjet.wasm",
      injectPath: "/controller/controller.inject.js",
    },
  });
  await controller.wait();
  // Keeps the service worker from being put to sleep mid-session.
  setInterval(() => navigator.serviceWorker.controller?.postMessage("keepalive"), 15000);
  return controller;
}

const errorPage = (err) => {
  const msg = String(err?.message ?? err ?? "Unknown error").replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page unavailable</title>
<style>html{color-scheme:dark;font:16px/1.5 system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0c;color:#eee}
main{width:min(32rem,calc(100% - 3rem))}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0 0 .75rem;color:#999}code{font-size:.85rem;color:#f87171}</style>
<main><h1>This page could not be loaded</h1><p>The proxy backend was reached but the request failed.</p><p><code>${msg}</code></p></main>`;
};

function makePlugins() {
  const u = window.$scramjetUtils;

  class ErrorPage extends u.ManagedPlugin {
    #cb;
    constructor(cb) {
      super("error-page", []);
      this.#cb = cb;
    }
    install(frame) {
      this.tap(frame.hooks.error.request, (ctx, out) => {
        if (ctx.error?.name === "AbortError") return;
        if (!["document", "iframe", "frame"].includes(ctx.rawrequest?.destination ?? "")) return;
        out.suppressError = true;
        out.setResponse = {
          body: errorPage(ctx.error),
          headers: [["content-type", "text/html; charset=utf-8"]],
          status: 502,
          statusText: "Bad Gateway",
        };
        this.#cb?.(ctx.error);
      });
    }
  }

  // Sites calling history.pushState(x, "", undefined) would otherwise lose their URL.
  class HistoryUrl extends u.ManagedPlugin {
    constructor() {
      super("history-url", []);
    }
    install(frame) {
      this.tap(frame.hooks.init.post, (ctx) => {
        if (!ctx.isTopLevel) return;
        const proto = ctx.window.History.prototype;
        for (const m of ["pushState", "replaceState"]) {
          const orig = proto[m];
          proto[m] = function (data, unused, url) {
            return orig.call(this, data, unused, url ?? ctx.client.url.href);
          };
        }
      });
    }
  }

  return { ErrorPage, HistoryUrl };
}

class Session {
  url = "";
  #frame;
  #h;
  #dead = false;
  #onLoad;
  constructor(frame, handlers) {
    this.#frame = frame;
    this.#h = handlers;
    this.#onLoad = () => !this.#dead && this.#h.ready?.();
    frame.element.addEventListener("load", this.#onLoad);
  }
  go(url) {
    if (this.#dead) return;
    this.#h.loading?.();
    this.#frame.go(url);
  }
  reload() {
    if (!this.#dead) this.#frame.reload();
  }
  destroy() {
    if (this.#dead) return;
    this.#dead = true;
    this.#frame.element.removeEventListener("load", this.#onLoad);
    const i = controller?.frames.indexOf(this.#frame) ?? -1;
    if (i !== -1) controller.frames.splice(i, 1);
    this.#frame.element.remove();
  }
}

export const engine = {
  init() {
    booting ??= boot();
    return booting;
  },

  async createSession(iframe, handlers = {}) {
    await this.init();
    const u = window.$scramjetUtils;
    const { ErrorPage, HistoryUrl } = makePlugins();
    let session;
    const frame = controller.createFrame(iframe, {
      plugins: [
        new u.HttpCachePlugin(),
        new HistoryUrl(),
        new u.UrlWatcherPlugin((url) => {
          session.url = url;
          handlers.url?.(url);
          handlers.ready?.();
        }),
        // Links that try to escape the proxied frame open as a new Crimson tab.
        new u.CatchEscapedLinksPlugin((url) => {
          handlers.escape?.(url.href);
          return new URL(`data:text/html,${encodeURIComponent(errorPage(new Error("Opened in a new tab.")))`);
        }),
        new ErrorPage(handlers.error),
      ],
    });
    session = new Session(frame, handlers);
    return session;
  },

  async setTransport(cfg) {
    wanted = { ...wanted, ...cfg };
    if (!booting) return;
    await booting;
    const { path, endpoint } = resolve(wanted);
    if (JSON.stringify([path, endpoint]) === applied) return;
    controller.setTransport(await buildTransport(wanted));
  },

  transports: [
    ["libcurl", "libcurl — widest site compatibility (needs Wisp)"],
    ["epoxy", "epoxy — lighter TLS stack (needs Wisp)"],
    ["bare", "bare — works on serverless hosts, no WebSocket sites"],
  ],
};
