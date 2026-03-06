# End-to-End Workflow: One Benchmark Cycle

This playbook describes one full cycle of the benchmark-driven outbound process — from sales submitting a request to dev running the benchmark and sales generating content. **Sales** and **Dev** sections are labeled so each team knows their steps.

---

## Overview (one cycle)

```
Sales submits request  →  Dev stages & deploys  →  Dev runs benchmark  →  Dev marks ready  →  Sales generates & exports content
```

---

## Phase 1: Sales submits a benchmark request

**Who:** Sales  
**Where:** App URL (e.g. `https://your-app.onrender.com`)

### Steps

1. **Open the app** and fill in the form:
   - **Company** — e.g. Qdrant
   - **Company website** — e.g. https://qdrant.tech
   - **Product** — e.g. Qdrant vector DB
   - **Vertical** — choose the type (Vector database, Analytical database, SQL/OLTP, Key-value store, Distributed SQL, or Other)
   - **Company Twitter/X** — e.g. @qdrant_engine (optional)
   - **Customer GitHub repo URL** — the customer’s OSS repo, e.g. https://github.com/qdrant/qdrant
   - **Your email** — so you can be notified when the benchmark is ready (optional)

2. **Check the vetted benchmark tool** (bottom of the page). It’s pre-filled from the vertical; change the name or repo URL only if you’re using a different tool.

3. **Click “Submit benchmark request.”**

### What happens

- The app sends the request to the backend.
- You see a message like: *“Request #req_xxx submitted. Backend will take the OSS from GitHub and stage deployment (Nirvana + AWS).”*
- The request is stored with status **pending_approval**. The dev team can see it in the API.

### What sales does next

- **Request log:** Scroll to the **Request log** at the bottom of the page. Click **Refresh** to load the latest list. Your new request appears with status **“Sales requested.”** Use this log to avoid submitting duplicates.
- As the backend works on the request, click **Refresh** periodically. Status will move to **“Back end deploying”** (staged) and then **“Completed”** (ready).
- When a request shows **“Completed,”** you can generate summary, metrics, and tweet drafts (see Phase 4). On Render, reload the page or click Refresh to see the latest status.

---

## Phase 2: Dev stages the request (resolve OSS from GitHub)

**Who:** Dev team  
**Where:** API (same base URL as the app)

### Steps

1. **List requests** (optional):
   ```http
   GET /api/requests
   ```
   Find the request by `id` (e.g. `req_172..._abc123`) or by `company` / `githubUrl`.

2. **Stage the request** — resolve the customer’s GitHub repo and detect how to run their OSS (Docker image, docker-compose, etc.):
   ```http
   POST /api/requests/{request_id}/stage
   ```
   Example (replace with your app URL and real request id):
   ```bash
   curl -X POST "https://your-app.onrender.com/api/requests/req_1234567890_abc123/stage"
   ```

3. **Check the response.** The API returns a **stagedConfig** object, for example:
   - `githubRepo` — e.g. `qdrant/qdrant`
   - `defaultBranch` — e.g. `master`
   - `dockerImage` — e.g. `qdrant/qdrant:latest` (if detected)
   - `dockerComposePath` — e.g. `docker-compose.yml` (if present)
   - `dockerfilePath` — e.g. `Dockerfile` (if present)

### What dev does with this

- Use **stagedConfig** in your automation:
  - Clone the repo (or use `dockerImage`) to run the customer’s OSS on **Nirvana** (Terraform/API) and **AWS** (Terraform/API).
  - Use the **benchmark tool** from the request (`benchmarkToolLabel`, `benchmarkToolRepo`) — e.g. VectorDBBench, ClickBench, sysbench, BenchBase — and run it with the same config on both clouds.
- Request status becomes **staged**; you’re ready to deploy and run the benchmark.

---

## Phase 3: Dev deploys and runs the benchmark

**Who:** Dev team  
**Where:** Your infra (Nirvana + AWS + benchmark runner)

### Steps

1. **Provision infra** (Nirvana + AWS) using your existing Terraform/scripts. Use the same VM specs per vertical (e.g. 8 vCPU, 32 GB server + 8 vCPU, 16 GB client for vector DB).

2. **Deploy the OSS** on both clouds using the request’s **stagedConfig** (e.g. run the detected Docker image or docker-compose from the customer repo).

3. **Run the benchmark tool** (from the request’s benchmark tool name/repo) against both environments. Collect metrics such as:
   - QPS (or equivalent throughput)
   - p99 latency
   - Recall (if applicable)
   - Cost per hour (Nirvana vs AWS)

4. **When the run is complete**, update the request with status **ready** and **results**:
   ```http
   PATCH /api/requests/{request_id}
   Content-Type: application/json

   {
     "status": "ready",
     "results": {
       "nirvanaQps": 12300,
       "awsQps": 7900,
       "nirvanaP99": 4.1,
       "awsP99": 7.8,
       "nirvanaCost": 1.8,
       "awsCost": 3.2,
       "recall": 0.99
     }
   }
   ```
   Example with curl:
   ```bash
   curl -X PATCH "https://your-app.onrender.com/api/requests/req_1234567890_abc123" \
     -H "Content-Type: application/json" \
     -d '{"status":"ready","results":{"nirvanaQps":12300,"awsQps":7900,"nirvanaP99":4.1,"awsP99":7.8,"nirvanaCost":1.8,"awsCost":3.2,"recall":0.99}}'
   ```

5. **(Optional)** Send an email to the request’s **salesEmail** to tell them the benchmark is ready (implement in your own pipeline; the app does not send email).

---

## Phase 4: Sales generates and exports content

**Who:** Sales  
**Where:** App URL (same as Phase 1)

### Steps

1. **Open the app** and (if the UI supports it) refresh or re-open the request. Once the request has **status: ready** and **results**, the three buttons unlock:
   - **Generate benchmark summary**
   - **Generate metrics block**
   - **Generate tweet drafts**

2. **Generate each asset:**
   - Click **Generate benchmark summary** → narrative summary appears in the text area. Use **Copy** or **Download** to save (e.g. `benchmark-summary.md`).
   - Click **Generate metrics block** → Markdown table for blog posts. **Copy** or **Download** (e.g. `benchmark-metrics.md`).
   - Click **Generate tweet drafts** → Tweet thread (hook, data, cost story, CTA). **Copy** or **Download** (e.g. `tweet-thread.md`).

3. **Use the content** — paste into blog, X/Twitter, or internal docs as needed.

### If the buttons don’t unlock

- The UI may need to “see” the updated request. If you have a **Refresh status** or similar, use it after dev has PATCHed the request.
- Alternatively, dev can share the **results** object with you; a developer can then call `window.__benchmarkUI.setReady(results)` in the browser console on the app page to unlock the buttons and generate from that data.

---

## Quick reference: API endpoints (for dev)

| Action              | Method | Endpoint                          |
|---------------------|--------|-----------------------------------|
| List requests       | GET    | `/api/requests`                   |
| Get one request     | GET    | `/api/requests/:id`               |
| Create request      | POST   | `/api/requests` (sales submit)    |
| Stage from GitHub   | POST   | `/api/requests/:id/stage`         |
| Update status/results | PATCH | `/api/requests/:id`            |
| Health check        | GET    | `/health`                         |

---

## One-page checklist (print or share)

**Sales**

- [ ] Fill form (company, website, product, vertical, customer GitHub URL).
- [ ] Submit benchmark request.
- [ ] Wait for dev to run benchmark and mark ready (or for email).
- [ ] Open app, generate summary / metrics / tweets.
- [ ] Copy or download each asset and use in blog/social/internal docs.

**Dev**

- [ ] List or find the new request (`GET /api/requests`).
- [ ] Stage request (`POST /api/requests/:id/stage`).
- [ ] Use stagedConfig + benchmark tool from request to deploy OSS on Nirvana and AWS.
- [ ] Run benchmark, collect metrics.
- [ ] PATCH request with `status: "ready"` and `results`.
- [ ] (Optional) Notify sales (e.g. email to `salesEmail`).

---

This is one full cycle. Repeat for each new target account; sales submits, dev stages and runs, sales generates content from the same app.
