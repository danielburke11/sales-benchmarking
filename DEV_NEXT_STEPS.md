# Dev: What to Do When a Request Shows "Sales requested"

When a benchmark request appears in the app’s **Request log** with status **"Sales requested"**, the backend has stored it. Your job is to **stage** it, then **deploy and run** the benchmark, then **mark it ready** with results.

---

## 1. Where to start (files in this repo)

| Goal | File / place |
|------|----------------|
| **Full step-by-step (sales + dev)** | **`WORKFLOW_PLAYBOOK.md`** — read **Phase 2** and **Phase 3** for your steps. |
| **API reference and staging logic** | **`README.md`** — Backend API table, staging behavior, and deployment notes. |
| **Backend that stores requests and does staging** | **`server/index.js`** — the Node server; staging is `POST /api/requests/:id/stage`. |
| **Strategy and benchmark tools** | **`Benchmark Outbound Playbook (1).md`** — full playbook (Terraform, benchmark tools per vertical, etc.). |

Start with **`WORKFLOW_PLAYBOOK.md`** (Phase 2 and 3).

---

## 2. Get the request ID

- **Option A:** Sales sends you the request ID from the app (e.g. `req_1720123456789_abc123`).
- **Option B:** Call the API to list requests and pick the one that’s `"status": "pending_approval"`:

```bash
curl "https://YOUR-RENDER-APP-URL.onrender.com/api/requests"
```

Replace `YOUR-RENDER-APP-URL` with your actual Render URL (e.g. `sales-benchmarking-xxxx`).

---

## 3. Stage the request (resolve GitHub → OSS)

This calls our backend to hit the GitHub API and fill in `stagedConfig` (repo, branch, Docker image, docker-compose path, etc.) for that request.

```bash
curl -X POST "https://YOUR-RENDER-APP-URL.onrender.com/api/requests/REQUEST_ID/stage"
```

Replace:
- `YOUR-RENDER-APP-URL` with your Render URL.
- `REQUEST_ID` with the real id (e.g. `req_1720123456789_abc123`).

The response includes **`stagedConfig`** (e.g. `dockerImage`, `dockerComposePath`, `githubRepo`). Use that in your deploy scripts.

---

## 4. Deploy and run the benchmark (your infra)

- Use **Nirvana API / Terraform** and **AWS API / Terraform** to provision VMs (same specs on both).
- Deploy the customer’s OSS using **`stagedConfig`** (e.g. run `stagedConfig.dockerImage` or clone `stagedConfig.githubRepo` and use compose).
- Run the **benchmark tool** from the request (`benchmarkToolLabel` / `benchmarkToolRepo` — e.g. VectorDBBench, ClickBench, sysbench, BenchBase).
- Collect metrics: QPS, p99 latency, recall (if applicable), cost per hour (Nirvana vs AWS).

Details and VM specs per vertical are in **`Benchmark Outbound Playbook (1).md`**.

---

## 5. Send results to the backend (automated)

So the engineer doesn’t have to type numbers in, have your benchmark script **POST results** when the run finishes:

```bash
curl -X POST "https://YOUR-RENDER-APP-URL.onrender.com/api/requests/REQUEST_ID/results" \
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

Replace `YOUR-RENDER-APP-URL` and `REQUEST_ID`. Snake_case keys (`nirvana_qps`, etc.) are also accepted. After this, the request has results stored; the engineer can mark it complete in the app (see step 6).

**Optional:** Set **`BENCHMARK_RESULTS_URL`** or **`BENCHMARK_FETCH_RESULTS_SCRIPT`** so the backend can fetch results automatically when the engineer clicks “Mark complete” (see README).

---

## 6. Mark the request ready (so sales can generate content)

- **In the app:** Open “Engineer: Mark request complete”, select the request, and click **“Mark complete and notify sales”**. The backend uses stored results (from step 5) or fetches them if you configured `BENCHMARK_RESULTS_URL` / `BENCHMARK_FETCH_RESULTS_SCRIPT`.
- **Or via API:** `PATCH /api/requests/REQUEST_ID` with `{"status":"ready"}` (results already stored or auto-fetched).

After this, the request shows **“Completed”** and sales can use **Generate benchmark summary**, **Generate metrics block**, and **Generate tweet drafts**.

---

## Quick reference

| Step | Action | Endpoint |
|------|--------|----------|
| List requests | GET | `/api/requests` |
| Get one request | GET | `/api/requests/:id` |
| Stage (GitHub → OSS) | POST | `/api/requests/:id/stage` |
| Push results (from benchmark script) | POST | `/api/requests/:id/results` |
| Mark ready (engineer or API) | PATCH | `/api/requests/:id` |

Base URL = your Render app URL (e.g. `https://sales-benchmarking-xxxx.onrender.com`).
