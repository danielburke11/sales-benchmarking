# End-to-End Workflow: Benchmark Request → Results → Content

**One cycle:** Sales submits → Dev stages & runs benchmark → Script POSTs results → Engineer marks complete → Sales generates content.

**Tools:** App (browser), API (curl or script), your infra (Nirvana + AWS + benchmark runner).

---

## 1. Sales: Submit a request

| Who   | Tool | When |
|-------|------|------|
| Sales | App (browser) | Start of cycle |

**Steps:**

1. Open the app (e.g. `https://your-app.onrender.com`).
2. Fill the form:
   - Company, Company website, Product
   - **Vertical** (Vector DB, Analytical, SQL/OLTP, Key-value, Distributed SQL, Other)
   - **Customer GitHub repo URL** (required)
   - Your email (optional; for “results ready” email)
   - Engineer email (optional; engineer gets instructions email)
3. Click **Submit benchmark request**.
4. In **Request log** at the bottom, click **Refresh** and note your request (e.g. #1, status “Sales requested”).  
   - To remove a request: click **Delete** on that row (confirm when asked).

---

## 2. Dev: Stage the request (GitHub → OSS)

| Who | Tool | When |
|-----|------|------|
| Dev  | API (curl) | After sales submits |

**Steps:**

1. Get the request ID (from engineer email or by listing):
   ```bash
   curl "https://YOUR-APP-URL/api/requests"
   ```
2. Stage the request (replace `YOUR-APP-URL` and `REQUEST_ID`):
   ```bash
   curl -X POST "https://YOUR-APP-URL/api/requests/REQUEST_ID/stage"
   ```
3. Use the response **stagedConfig** (e.g. `dockerImage`, `dockerComposePath`, `githubRepo`) in your deploy.

---

## 3. Dev: Deploy, run benchmark, POST results

| Who | Tool | When |
|-----|------|------|
| Dev  | Your infra (Nirvana + AWS) + API | After staging |

**Steps:**

1. Provision VMs (Nirvana + AWS), same specs per vertical.
2. Deploy the customer OSS using **stagedConfig** from step 2.
3. Run the benchmark tool from the request (e.g. VectorDBBench, sysbench, BenchBase). Collect: QPS, p99, cost/hr, recall (if applicable).
4. When the run finishes, **POST results** (replace `YOUR-APP-URL` and `REQUEST_ID`; use your real numbers):
   ```bash
   curl -X POST "https://YOUR-APP-URL/api/requests/REQUEST_ID/results" \
     -H "Content-Type: application/json" \
     -d '{"nirvanaQps":12300,"awsQps":7900,"nirvanaP99":4.1,"awsP99":7.8,"nirvanaCost":1.8,"awsCost":3.2,"recall":0.99}'
   ```
   Or have your benchmark script call this when the run completes.

---

## 4. Engineer: Mark complete (notify sales)

| Who      | Tool | When |
|----------|------|------|
| Engineer | App (browser) | After results are POSTed (or after run if using auto-fetch) |

**Steps:**

1. Open the app.
2. Scroll to **Engineer: Mark request complete**.
3. In the dropdown, **select the request** (e.g. “1. Acme (Back end deploying)”).
4. Click **Mark complete and notify sales**.
5. If a sales email was set, that person gets an email. In the **Request log**, the request now shows **Completed**.

---

## 5. Sales: Generate content

| Who   | Tool | When |
|-------|------|------|
| Sales | App (browser) | After request is Completed |

**Steps:**

1. Open the app (or use the link from the “results ready” email).
2. In **Request log**, click **Refresh**.
3. **Click the row** of the **Completed** request (row highlights = selected).
4. Use the three buttons:
   - **Generate benchmark summary** → Copy or Download.
   - **Generate metrics block** → Copy or Download.
   - **Generate tweet drafts** → Copy or Download.
5. Use the copied content in blog, social, or internal docs.

To switch to another completed request: click its row (outputs clear; generate again for that request).

---

## API quick reference

| Action        | Method | Endpoint |
|---------------|--------|----------|
| List requests | GET    | `/api/requests` |
| Get one       | GET    | `/api/requests/:id` |
| Stage         | POST   | `/api/requests/:id/stage` |
| Store results | POST   | `/api/requests/:id/results` |
| Update/ready  | PATCH  | `/api/requests/:id` |
| Delete        | DELETE | `/api/requests/:id` |

Base URL = your app URL (e.g. `https://your-app.onrender.com`).

---

## One-page E2E test checklist

**Sales**

- [ ] Open app, fill form (company, website, product, vertical, **GitHub URL**, your email, engineer email).
- [ ] Submit request. Refresh Request log; see new row “Sales requested.”
- [ ] Wait for request to become “Completed” (after dev runs benchmark and engineer marks complete).
- [ ] Click the Completed row; generate summary, metrics, tweets; copy or download each.

**Dev / Engineer**

- [ ] Get request ID: `curl YOUR-APP/api/requests`.
- [ ] Stage: `curl -X POST YOUR-APP/api/requests/REQUEST_ID/stage`.
- [ ] Deploy OSS on Nirvana + AWS; run benchmark tool; collect metrics.
- [ ] POST results: `curl -X POST YOUR-APP/api/requests/REQUEST_ID/results -H "Content-Type: application/json" -d '{...}'`.
- [ ] In app: Engineer section → select request → **Mark complete and notify sales**.
- [ ] (Optional) Remove a request: use **Delete** on that row in the app, or `curl -X DELETE YOUR-APP/api/requests/REQUEST_ID`.

---

**Full details:** `README.md` (API), `DEV_NEXT_STEPS.md` (dev focus), `RENDER.md` (deploy + env vars).
