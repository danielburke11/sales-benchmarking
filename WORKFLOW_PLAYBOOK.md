# End-to-End Workflow: One Benchmark Cycle

This playbook describes one full cycle — from sales submitting a request, to dev staging and running the benchmark, to results being stored automatically and the engineer marking complete, to sales generating content. **Sales** and **Dev/Engineer** sections are labeled so each team knows their steps.

---

## Overview (one cycle)

```
Sales submits request
    → Dev stages from GitHub
    → Dev deploys & runs benchmark (Nirvana + AWS)
    → Benchmark script POSTs results to the API when run finishes
    → Engineer selects request in app and clicks "Mark complete and notify sales"
    → Sales gets email, opens app, selects the completed request, generates summary / metrics / tweets
```

---

## Phase 1: Sales submits a benchmark request

**Who:** Sales  
**Where:** App (e.g. `https://your-app.onrender.com`)

### Steps

1. **Open the app** and fill in the form:
   - **Company** — e.g. Qdrant
   - **Company website** — e.g. https://qdrant.tech
   - **Product** — e.g. Qdrant vector DB
   - **Vertical** — Vector database, Analytical database, SQL/OLTP, Key-value store, Distributed SQL, or Other
   - **Company Twitter/X** — e.g. @qdrant_engine (optional)
   - **Customer GitHub repo URL** — the customer’s OSS repo, e.g. https://github.com/qdrant/qdrant
   - **Your email** — for “results ready” notification (optional)
   - **Engineer email** — so the engineer receives the request and instructions (optional; if set, they get an email with next steps)

2. **Check the vetted benchmark tool** (further down the page). It’s pre-filled from the vertical; edit only if you’re using a different tool.

3. **Click “Submit benchmark request.”**

### What happens

- The request is stored with status **Sales requested** (pending_approval).
- If you entered an **engineer email**, the engineer receives an email with the request ID, company, GitHub, benchmark tool, and instructions (stage → deploy → run benchmark → POST results → mark complete in the app).
- In the **Request log** at the bottom, click **Refresh** to see your request. As the dev team works on it, status will move to **Back end deploying** (staged) and then **Completed** (ready).

### What sales does next

- When the request shows **Completed**, click that row in the Request log (it highlights). The three buttons above unlock: **Generate benchmark summary**, **Generate metrics block**, **Generate tweet drafts**. Use them to create and copy/download content.

---

## Phase 2: Dev stages the request (resolve OSS from GitHub)

**Who:** Dev team  
**Where:** API (same base URL as the app)

### Steps

1. **Find the request** — e.g. from the engineer email, or list requests:
   ```bash
   curl "https://your-app.onrender.com/api/requests"
   ```
   Note the request `id` (e.g. `req_1720123456789_abc123`).

2. **Stage the request** — resolve the customer’s GitHub repo and detect how to run their OSS (Docker image, docker-compose, etc.):
   ```bash
   curl -X POST "https://your-app.onrender.com/api/requests/REQUEST_ID/stage"
   ```
   Replace `REQUEST_ID` and your app URL.

3. **Use the response.** The API returns **stagedConfig**, e.g.:
   - `githubRepo`, `defaultBranch`, `dockerImage`, `dockerComposePath`, `dockerfilePath`  
   Use these in your deploy scripts to run the customer’s OSS on Nirvana and AWS.

---

## Phase 3: Dev deploys, runs the benchmark, and sends results to the API

**Who:** Dev team  
**Where:** Your infra (Nirvana + AWS) and your benchmark runner/scripts

### Steps

1. **Provision infra** (Nirvana + AWS) with your Terraform/API. Use the same VM specs per vertical (see **Benchmark Outbound Playbook** or playbook doc for your org).

2. **Deploy the OSS** on both clouds using the request’s **stagedConfig** (e.g. run the detected Docker image or docker-compose from the customer repo).

3. **Run the benchmark tool** (from the request: `benchmarkToolLabel` / `benchmarkToolRepo`, e.g. VectorDBBench, ClickBench, sysbench, BenchBase) against both environments. Collect:
   - QPS (or equivalent throughput)
   - p99 latency
   - Cost per hour (Nirvana vs AWS)
   - Recall (if applicable)

4. **When the run finishes, POST results to the API** so the engineer doesn’t have to type them in. Have your benchmark script (or a small wrapper) call:
   ```bash
   curl -X POST "https://your-app.onrender.com/api/requests/REQUEST_ID/results" \
     -H "Content-Type: application/json" \
     -d '{
       "nirvanaQps": 12300,
       "awsQps": 7900,
       "nirvanaP99": 4.1,
       "awsP99": 7.8,
       "nirvanaCost": 1.8,
       "awsCost": 3.2,
       "recall": 0.99
     }'
   ```
   Replace `REQUEST_ID` and your app URL. Use your actual metric values. Snake_case keys (`nirvana_qps`, `aws_qps`, etc.) are also accepted.

   After this, the request has results stored. The engineer (or you) can mark it complete in the app (Phase 3b).

---

## Phase 3b: Engineer marks the request complete (notify sales)

**Who:** Engineer / Dev  
**Where:** App (same URL)

### Steps

1. **Open the app** and scroll to **“Engineer: Mark request complete.”**

2. **Select the request** in the dropdown (e.g. “1. Acme (Back end deploying)” or “2. Qdrant (Sales requested)”).

3. **Click “Mark complete and notify sales.”**

### What happens

- The backend sets the request status to **ready** and uses the results already stored (from the benchmark script’s POST in Phase 3). If you configured **BENCHMARK_RESULTS_URL** or **BENCHMARK_FETCH_RESULTS_SCRIPT**, the backend can also fetch results automatically when none are stored.
- If the request has a **sales email**, that person receives an email that the benchmark results are ready, with a link to the app.
- In the **Request log**, the request now shows **Completed**. Sales can click it to select it and use the three generate buttons.

**Alternative (API only):** If you prefer not to use the app, you can mark ready via API:
```bash
curl -X PATCH "https://your-app.onrender.com/api/requests/REQUEST_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"ready"}'
```
Results must already be stored (from POST in Phase 3) or the backend will try to fetch them if you configured the optional env vars.

---

## Phase 4: Sales generates and exports content

**Who:** Sales  
**Where:** App (same URL as Phase 1)

### Steps

1. **Open the app.** If you got an email that results are ready, use the link in the email.

2. **In the Request log** at the bottom, find the request that shows **Completed** and **click that row.** The row highlights to show it’s selected.

3. **Generate each asset** (the three buttons use the selected request’s results):
   - **Generate benchmark summary** — narrative summary. Use **Copy** or **Download** (e.g. `benchmark-summary.md`).
   - **Generate metrics block** — Markdown table for blog posts. **Copy** or **Download** (e.g. `benchmark-metrics.md`).
   - **Generate tweet drafts** — Tweet thread (hook, data, cost, CTA). **Copy** or **Download** (e.g. `tweet-thread.md`).

4. **Use the content** in blog, X/Twitter, or internal docs as needed.

### Tips

- You can click different completed requests in the log to switch selection; the output areas clear and the buttons use the newly selected request.
- If the buttons stay disabled, make sure you clicked a row with status **Completed** and click **Refresh** if the list is stale.

---

## Quick reference: API endpoints (for dev)

| Action | Method | Endpoint |
|--------|--------|----------|
| List requests | GET | `/api/requests` |
| Get one request | GET | `/api/requests/:id` |
| Create request | POST | `/api/requests` (sales submit) |
| Stage from GitHub | POST | `/api/requests/:id/stage` |
| **Store results** (from benchmark script) | **POST** | **`/api/requests/:id/results`** |
| Mark ready / update | PATCH | `/api/requests/:id` |
| Health check | GET | `/health` |

Base URL = your app URL (e.g. `https://your-app.onrender.com`).

---

## One-page checklist (print or share)

**Sales**

- [ ] Fill form (company, website, product, vertical, customer GitHub URL, your email, optional engineer email).
- [ ] Submit benchmark request.
- [ ] Wait for “results ready” email or for the request to show **Completed** in the Request log.
- [ ] Open app, click the **Completed** request in the log (row highlights).
- [ ] Generate benchmark summary, metrics block, and tweet drafts; copy or download each.

**Dev / Engineer**

- [ ] Find the new request (email or `GET /api/requests`).
- [ ] Stage request: `POST /api/requests/:id/stage`.
- [ ] Deploy OSS on Nirvana + AWS using stagedConfig; run the benchmark tool from the request.
- [ ] When the benchmark run finishes, **POST results**: `POST /api/requests/:id/results` with JSON body (nirvanaQps, awsQps, nirvanaP99, awsP99, nirvanaCost, awsCost, recall).
- [ ] In the app: open “Engineer: Mark request complete,” select the request, click **“Mark complete and notify sales.”** (Or `PATCH /api/requests/:id` with `{"status":"ready"}`.)

---

This is one full cycle. Repeat for each new target: sales submits, dev stages and runs the benchmark and POSTs results, engineer marks complete, sales generates content from the app.
