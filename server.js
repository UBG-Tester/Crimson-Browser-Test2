import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import express from "express";
import ipaddr from "ipaddr.js";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));

try {
  wisp.options.allow_loopback_ips = false;
  wisp.options.allow_private_ips = false;
} catch {}

const app = express();

app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use("/scram/", express.static(scramjetPath));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/libcurl/", express.static(dirOf("@mercuryworkshop/libcurl-transport")));
app.use("/epoxy/", express.static(dirOf("@mercuryworkshop/epoxy-transport")));
app.use("/baremod/", express.static(dirOf("@mercuryworkshop/bare-transport")));
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (filePath.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
  },
}));

const bare = createBareServer("/bare/", {
  filterRemote(url) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (ipaddr.isValid(host) && ipaddr.parse(host).range() !== "unicast") {
      throw new RangeError("Forbidden IP");
    }
  },
});

const server = http.createServer((req, res) => {
  if (bare.shouldRoute(req)) bare.routeRequest(req, res);
  else app(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (bare.shouldRoute(req)) return bare.routeUpgrade(req, socket, head);
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname === "/wisp/") {
    req.url = pathname;
    return wisp.routeRequest(req, socket, head);
  }
  socket.end();
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, () => console.log(`Crimson running on port ${port}`));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
