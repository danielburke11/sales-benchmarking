# Nirvana Benchmark Assistant (Sales + Backend)

Front-end and backend for the **Benchmark-Driven Outbound Sales Playbook**. Sales submits benchmark requests with the customer’s **GitHub URL**; the backend resolves the repo to the open-source offering and stages deployment on **Nirvana API** and **AWS API**.

## Flow

1. **Sales** enters company, website, product, **customer GitHub repo URL**, vertical, and (optional) email for “results ready” notification.
2. **Submit** sends the request to the backend. The backend stores it and returns an id.
3. **Backend team** runs **stage** for that request: the server resolves the GitHub repo (default branch, root files), detects OSS deployment (e.g. `Dockerfile`, `docker-compose.yml`, Docker image from compose).
4. **Staged config** is used to deploy via **Nirvana API** (Nirvana Terraform/API keys) and **AWS API** (AWS credentials and scripts). Your scripts/Terraform consume `stagedConfig` (e.g. `dockerImage`, `dockerComposePath`, `githubRepo`).
5. After the benchmark run, the backend updates the request with `status: "ready"` and `results` (metrics). Optionally send an email to the sales email.
6. **Sales** uses the UI to generate **Benchmark summary**, **Metrics block**, and **Tweet drafts** (Copy / Download).

## Run the app

**Single server (frontend + API):**

```bash
npm start
```

Then open **http://localhost:3001**. The same origin serves the UI and `/api/requests`, so the frontend talks to the backend without CORS.

- **Static only (no backend):** `npm run static` — then set `<html data-api-base="http://localhost:3001">` if you run the API elsewhere.

## Backend API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/requests` | Create request (company, companyWebsite, product, vertical, **githubUrl**, twitterHandle, salesEmail, benchmarkToolId, benchmarkToolLabel, benchmarkToolRepo). |
| `GET` | `/api/requests` | List all requests. |
| `GET` | `/api/requests/:id` | Get one request. |
| `POST` | `/api/requests/:id/stage` | Resolve GitHub URL → repo info + root contents; detect Docker/compose; set `stagedConfig` and `status: "staged"`. |
| `POST` | `/api/requests/:id/results` | Store benchmark results (e.g. from your benchmark script). Body: `{ nirvanaQps, awsQps, nirvanaP99, awsP99, nirvanaCost, awsCost, recall }`. |
| `PATCH` | `/api/requests/:id` | Update `status` or `results`. When setting `status: "ready"`, backend uses stored results or auto-fetches if configured (see below). |

Data is stored in **`data/requests.json`**.

**Automated results:** Have your benchmark script POST to `/api/requests/:id/results` when the run finishes. The engineer can then click “Mark complete” in the app without typing numbers. Optional env: **`BENCHMARK_RESULTS_URL`** (GET URL that returns JSON with results for `?requestId=...`) or **`BENCHMARK_FETCH_RESULTS_SCRIPT`** (script run with `REQUEST_ID` in env; stdout = JSON) so the backend can fetch results when the engineer marks complete.

## Staging (GitHub → OSS)

`POST /api/requests/:id/stage`:

1. Parses the request’s `githubUrl` to `owner/repo`.
2. Calls GitHub REST API: repo details (default branch), root directory contents.
3. Detects `docker-compose.yml` / `docker-compose.yaml`, `Dockerfile`.
4. If a compose file exists, tries to read it and extract `image:`.
5. Saves `stagedConfig`: `githubRepo`, `githubUrl`, `defaultBranch`, `dockerImage`, `dockerComposePath`, `dockerfilePath`, `readmeUrl`.

Optional: set **`GITHUB_TOKEN`** for higher rate limits (e.g. a personal access token).

## Deployment (Nirvana + AWS)

The backend only **stages** the request; it does not call Nirvana or AWS. Your deployment pipeline should:

- Read the request (and `stagedConfig`) from the API or from `data/requests.json`.
- Use **Nirvana API / Terraform** (e.g. `NIRVANA_API_KEY`) to provision VMs and run the OSS from the GitHub repo (using `stagedConfig.dockerImage` or `stagedConfig.dockerComposePath`, clone repo, etc.).
- Use **AWS API / Terraform** (AWS credentials) to provision matching VMs and run the same workload.
- Run the benchmark tool for the chosen vertical (e.g. VectorDBBench, ClickBench, memtier_benchmark).
- When done, **PATCH** the request with `status: "ready"` and `results: { nirvanaQps, awsQps, nirvanaP99, awsP99, nirvanaCost, awsCost, recall, ... }`, and optionally email the `salesEmail`.

## UI: Generate assets

Once a request has `status: "ready"` and `results`, sales can use **Generate benchmark summary**, **Generate metrics block**, and **Generate tweet drafts**. The generators use playbook templates and merge in `results` from the backend. Use **Copy** or **Download** to export.

---

Built from the *Benchmark-Driven Outbound Sales Playbook*. VM spec and dataset defaults come from the pre-selected benchmark tool per vertical (e.g. Vector DB → VectorDBBench).
