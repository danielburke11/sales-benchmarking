# Deploying the Benchmark Playbook App to Production

This guide gets the app live so you can share a URL with your developers. Pick one path below.

---

## Option A: Railway (easiest — free tier, ~5 min)

1. **Push your code to GitHub** (if not already).
   ```bash
   git init
   git add .
   git commit -m "Benchmark playbook app"
   git remote add origin https://github.com/YOUR_ORG/nirvana-benchmark-playbook.git
   git push -u origin main
   ```

2. **Sign up at [railway.app](https://railway.app)** (GitHub login).

3. **New Project → Deploy from GitHub repo**  
   Select the repo. Railway will detect Node and use `npm start` (which runs `node server/index.js`).

4. **Settings**
   - **Root directory**: leave default (repo root).
   - **Build command**: leave empty (no build).
   - **Start command**: `npm start` or `node server/index.js`.
   - **Variables** (optional):
     - `PORT` — Railway sets this automatically.
     - `GITHUB_TOKEN` — optional; add a [GitHub personal access token](https://github.com/settings/tokens) (no scopes needed for public repos) for higher rate limits when staging from GitHub.

5. **Deploy**  
   Railway builds and runs the app, then gives you a URL like `https://your-app.up.railway.app`. Open it — the UI and API are on the same origin.

6. **Share with developers**  
   Send them:
   - **App URL**: `https://your-app.up.railway.app` (sales form + generate buttons).
   - **API base**: same URL (e.g. `GET https://your-app.up.railway.app/api/requests`).

**Persistence:** Railway persists the filesystem between deploys on the same environment, so `data/requests.json` survives restarts. For long-term production you may later move to a real database.

---

## Option B: Render (free tier, similar to Railway)

1. **Push code to GitHub** (same as above).

2. **Sign up at [render.com](https://render.com)** (GitHub login).

3. **New → Web Service** → connect repo.

4. **Configure**
   - **Runtime**: Node.
   - **Build command**: leave empty or `npm install` (optional; app has no install step).
   - **Start command**: `npm start`.
   - **Instance type**: Free.

5. **Environment**
   - `PORT` is set by Render.
   - Optionally add `GITHUB_TOKEN` for staging.

6. **Create Web Service**  
   Render assigns a URL like `https://nirvana-benchmark-xxxx.onrender.com`. Use that as the app + API base.

**Note:** On the free tier, the service may spin down after inactivity; the first request can be slow.

---

## Option C: Docker (run anywhere — your server, AWS, GCP, etc.)

1. **Build the image**
   ```bash
   docker build -t nirvana-benchmark-app .
   ```

2. **Run the container**
   ```bash
   docker run -p 3000:3000 \
     -e PORT=3000 \
     -v $(pwd)/data:/app/data \
     nirvana-benchmark-app
   ```
   - `-v $(pwd)/data:/app/data` keeps `data/requests.json` on your host so it survives container restarts.
   - Optional: `-e GITHUB_TOKEN=ghp_xxx` for staging.

3. **Open**  
   `http://localhost:3000` (or your server’s hostname). Share that URL with developers.

4. **Production behind HTTPS**  
   Put a reverse proxy (e.g. **Caddy** or **nginx**) in front and terminate TLS:
   - **Caddy**: add a line like `your-domain.com { reverse_proxy localhost:3000 }` and Caddy will get a certificate automatically.
   - **nginx**: proxy to `http://127.0.0.1:3000` and use Let’s Encrypt (e.g. certbot).

---

## Option D: Your own VPS (Ubuntu / Debian) without Docker

1. **On the server**
   ```bash
   sudo apt update && sudo apt install -y nodejs npm
   git clone https://github.com/YOUR_ORG/nirvana-benchmark-playbook.git
   cd nirvana-benchmark-playbook
   npm start
   ```
   To run in the background: use `pm2` (`npm install -g pm2 && pm2 start server/index.js --name benchmark-app`) or a systemd service.

2. **Port**
   - Default is 3001; set `PORT=80` if you want to listen on 80, or keep 3001 and put Caddy/nginx in front (recommended for HTTPS).

3. **HTTPS**
   - Use Caddy or nginx + Let’s Encrypt so the app is served over `https://your-domain.com`.

---

## Environment variables (all options)

| Variable        | Required | Description |
|----------------|----------|-------------|
| `PORT`         | No       | Port to listen on (default 3001; PaaS usually sets this). |
| `HOST`         | No       | Bind address (default `0.0.0.0`; leave default in production). |
| `GITHUB_TOKEN` | No       | GitHub token for `/api/requests/:id/stage` (higher rate limits for public repos). |

---

## After deploy — what to give developers

1. **App URL**  
   The URL where the app is hosted (e.g. `https://your-app.up.railway.app`). Sales and stakeholders use this for the form and for generating summary / metrics / tweets.

2. **API base**  
   Same URL. Document the endpoints:
   - `POST /api/requests` — create request (sales submit).
   - `GET /api/requests` — list requests.
   - `GET /api/requests/:id` — get one request.
   - `POST /api/requests/:id/stage` — stage from GitHub (OSS + Docker/compose).
   - `PATCH /api/requests/:id` — set `status: "ready"` and `results` when the benchmark run is done.

3. **Health check**  
   `GET /health` returns `{"ok":true}` for load balancers and monitoring.

4. **Data**  
   Requests are stored in `data/requests.json`. With Docker, mount a volume so this file persists. On Railway/Render, the filesystem is persistent for the lifecycle of the service.

---

## Checklist before calling it “production”

- [ ] Code is in a Git repo (e.g. GitHub).
- [ ] App is deployed and the app URL loads (form + static assets).
- [ ] `GET /health` returns 200.
- [ ] You can submit a test request and see it in `GET /api/requests`.
- [ ] (Optional) `GITHUB_TOKEN` is set where you run staging; staging is tested with a real repo.
- [ ] Developers have the app URL and short API notes (above).
- [ ] If you use Docker or a VPS, `data/` is persisted (volume or path outside the container).

Once this is done, you can share the single app URL with your team; they get both the sales UI and the API from one place.
