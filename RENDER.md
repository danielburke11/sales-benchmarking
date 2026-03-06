# Deploy on Render (Free Tier)

Use this guide to get the app live at a public URL using [Render](https://render.com).

---

## 1. Push this repo to GitHub

From your project folder (replace with your repo if you already pushed):

```bash
cd "/path/to/perplexity- sales pb"

# If this folder isn’t a git repo yet:
git init
git add .
git commit -m "Initial commit: Nirvana benchmark playbook app"

# Point at your GitHub repo
git remote add origin https://github.com/danielburke11/sales-benchmarking.git
git branch -M main
git push -u origin main
```

If you already have a different `origin`, fix it and push:

```bash
git remote set-url origin https://github.com/danielburke11/sales-benchmarking.git
git push -u origin main
```

---

## 2. Create a Render account and connect GitHub

1. Go to **[render.com](https://render.com)** and sign up (or log in).
2. Click **Sign in with GitHub** and authorize Render to access your GitHub account.

---

## 3. Create a new Web Service

1. In the Render dashboard, click **New +** → **Web Service**.
2. Under **Connect a repository**, find **danielburke11/sales-benchmarking** and click **Connect** (or **Connect account** if you need to grant access to that org/user first).

---

## 4. Configure the Web Service

Use these settings:

| Field | Value |
|--------|--------|
| **Name** | `sales-benchmarking` (or any name you like) |
| **Region** | Choose the closest to your team |
| **Branch** | `main` |
| **Runtime** | **Node** |
| **Build Command** | Leave **empty** (the app has no build step) |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

---

## 5. Environment variables (optional)

In the same screen, open **Environment** (or **Environment Variables**):

- **PORT** — Do **not** set this; Render sets it automatically.
- **GITHUB_TOKEN** — Optional. If you want better rate limits when using “Stage from GitHub,” add a [GitHub Personal Access Token](https://github.com/settings/tokens) (no scopes needed for public repos). If you skip it, staging still works but may hit rate limits under heavy use.

Click **Add** for each variable you use.

---

## 6. Deploy

1. Click **Create Web Service**.
2. Render will clone the repo and run `npm start`. The first deploy may take 1–2 minutes.
3. When the deploy succeeds, Render shows a URL like:
   ```text
   https://sales-benchmarking-xxxx.onrender.com
   ```

That URL is your app: same host for the UI and the API.

---

## 7. Use and share the app

- **Sales / stakeholders:** Open the URL in a browser to use the form and generate summary / metrics / tweets.
- **Developers / API:**  
  - Base URL: same as above (e.g. `https://sales-benchmarking-xxxx.onrender.com`).  
  - Endpoints: `POST /api/requests`, `GET /api/requests`, `GET /api/requests/:id`, `POST /api/requests/:id/stage`, `PATCH /api/requests/:id`.  
  - Health: `GET /health` returns `{"ok":true}`.

---

## Free tier notes

- The service may **spin down after ~15 minutes** of no traffic. The first request after that can take 30–60 seconds (cold start).
- **Persistent disk:** Render free tier does not add a persistent disk by default. Request data is stored in `data/requests.json` in the service filesystem; it **persists across deploys** but can be reset if Render recreates the instance. For long-term production you’d later move to a database.
- To avoid spin-down on free tier, you can use a cron job or uptime checker to hit your URL (e.g. `/health`) every 10–15 minutes.

---

## Updating the app later

Push changes to the `main` branch on GitHub; Render will automatically redeploy:

```bash
git add .
git commit -m "Describe your change"
git push
```
