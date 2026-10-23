# Deploy without a terminal (about 10 minutes, free)

## 1. Put the files on GitHub (all in the browser)
1. Make a free account at github.com and click **New repository** (name it anything, set it to Public).
2. Unzip crimson.zip on your computer.
3. In the new repo click **Add file > Upload files**, then drag in EVERYTHING inside the
   `crimson` folder (server.js, package.json, render.yaml, the `public` folder, etc.).
   Drag the contents, not the folder itself, so package.json sits at the top level.
4. Click **Commit changes**.

## 2. Host it on Render (all in the browser)
1. Make a free account at render.com (sign in with GitHub).
2. Click **New + > Web Service**, pick your repo.
3. Use these settings if it asks:
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance type: **Free**
4. Click **Create Web Service**. Wait for "Live", then open the `https://something.onrender.com` link. That's your proxy.

Notes:
- The free tier sleeps after ~15 min idle, so the first load after a break takes ~30-60 seconds.
- If the page loads but sites fail, open Settings and try another Connection method.
- Railway, Koyeb and Replit work the same way: connect the repo, build `npm install`, start `npm start`.
