# Crimson

A self-hosted web proxy browser: tabs, omnibox, bookmarks, history, settings.
Powered by Scramjet (service-worker proxy) with Wisp and Bare backends that run
on **your own server**, so nothing depends on someone else's backend staying alive.

## Run it

```sh
npm install
npm start          # http://localhost:8080  (set PORT to change)
```

Needs Node 20.12+.

## Hosting

This must run on a host that keeps a Node process alive and allows WebSockets
(a VPS, Render, Railway, Fly.io, Koyeb, etc.). It will NOT work on
GitHub Pages, Netlify static, or Firebase Hosting: those only serve static
files, which is why static "proxy" sites end up pointing at a random
third-party backend that dies. Service workers also require HTTPS
(localhost is exempt), so put it behind TLS in production.

## Layout

- `server.js` - Express static server + Wisp (`/wisp/`) + Bare (`/bare/`)
- `public/sw.js` - service worker that routes proxied requests
- `public/js/engine.js` - Scramjet controller and transport wiring
- `public/js/app.js` - tabs, toolbar, bookmarks, history, settings
- `public/js/url.js` - address bar parsing (URL vs search, blocks localhost)

## Notes

- The backend refuses loopback/private-network targets so your server can't be
  used to reach its own LAN.
- If a site fails, try Settings > Connection method (libcurl / epoxy / bare).
- Alt+T new tab, Alt+W close, Alt+R reload, Alt+L focus address.
- Wiring approach follows the Lunara project you uploaded (GPL-3.0). If you
  publish this, keep that license in mind.
