// Turns whatever the user typed into something navigable.
const looksLikeUrl =
  /^(?:(?:(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^\s/?#@]+\.[^\s/?#@.]{2,})(?::\d+)?(?:[/?#]\S*)?)$/iu;

const isLoopback = (hostname) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "::") return true;
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return false;
  return Number(parts[0]) === 127 || host === "0.0.0.0";
};

export function resolveInput(input, searchTemplate) {
  const text = String(input ?? "").trim();
  if (!text) return { kind: "empty", url: "" };

  if (looksLikeUrl.test(text)) {
    try {
      const u = new URL(`https://${text}`);
      if (isLoopback(u.hostname)) return { kind: "blocked", url: "" };
      if (!u.username && !u.password) return { kind: "url", url: u.href };
    } catch {}
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || isLoopback(u.hostname)) {
        return { kind: "blocked", url: "" };
      }
      return { kind: "url", url: u.href };
    } catch {
      return { kind: "blocked", url: "" };
    }
  }

  return { kind: "search", url: searchTemplate.replace("%s", encodeURIComponent(text)) };
}

export function display(url) {
  try {
    const u = new URL(url);
    const rest = u.pathname === "/" ? "" : u.pathname;
    return u.host.replace(/^www\./, "") + rest + u.search + u.hash;
  } catch {
    return url;
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
