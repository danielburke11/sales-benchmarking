/**
 * Benchmark request API and staging.
 * - Sales submits requests with customer GitHub URL.
 * - Backend stages by resolving the repo to OSS deployment (Docker/compose).
 * - Staged config is used to deploy via Nirvana API + AWS API (Terraform/scripts).
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const DATA_DIR = path.join(__dirname, "..", "data");
const REQUESTS_FILE = path.join(DATA_DIR, "requests.json");
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "https://your-app.onrender.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "notifications@resend.dev";

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadRequests() {
  ensureDataDir();
  if (!fs.existsSync(REQUESTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveRequests(requests) {
  ensureDataDir();
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 2), "utf8");
}

function parseGitHubUrl(url) {
  const trimmed = (url || "").trim();
  const match = trimmed.match(/github\.com[/]([^/]+)[/]([^/?#]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === "https:" ? https : http;
    const headers = { "User-Agent": "Nirvana-Benchmark-Staging", ...(opts.headers || {}) };
    const req = client.get(
      url,
      { headers },
      (res) => {
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (ch) => (body += ch));
          res.on("end", () => reject(new Error(`GitHub API ${res.statusCode}: ${body.slice(0, 200)}`)));
          return;
        }
        let body = "";
        res.on("data", (ch) => (body += ch));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(body || "Invalid JSON"));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/**
 * Resolve GitHub repo and detect OSS deployment (Docker image, docker-compose, etc.).
 * Uses GitHub REST API (public repos work without token; set GITHUB_TOKEN for higher limits).
 */
async function stageFromGitHub(githubUrl) {
  const parsed = parseGitHubUrl(githubUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub URL. Use https://github.com/owner/repo");
  }
  const { owner, repo } = parsed;
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Nirvana-Benchmark-Staging",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const repoInfo = await fetchJson(repoUrl, { headers });
  const defaultBranch = repoInfo.default_branch || "main";

  const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const rootContents = await fetchJson(contentsUrl, { headers });
  const names = Array.isArray(rootContents) ? rootContents.map((e) => e.name) : [];

  const staged = {
    githubRepo: `${owner}/${repo}`,
    githubUrl: `https://github.com/${owner}/${repo}`,
    defaultBranch,
    dockerImage: null,
    dockerComposePath: null,
    dockerfilePath: null,
    readmeUrl: `https://github.com/${owner}/${repo}#readme`,
  };

  if (names.includes("docker-compose.yml")) {
    staged.dockerComposePath = "docker-compose.yml";
  }
  if (names.includes("docker-compose.yaml")) {
    staged.dockerComposePath = staged.dockerComposePath || "docker-compose.yaml";
  }
  if (names.includes("Dockerfile")) {
    staged.dockerfilePath = "Dockerfile";
  }

  // Try to get Docker image from docker-compose or README (simple heuristic)
  if (staged.dockerComposePath) {
    try {
      const composeEntry = rootContents.find((e) => e.name === staged.dockerComposePath);
      const contentUrl = composeEntry.download_url;
      const composeRes = await new Promise((res, rej) => {
        https.get(contentUrl, { headers: { "User-Agent": "Nirvana-Benchmark-Staging" } }, (r) => {
          let b = "";
          r.on("data", (c) => (b += c));
          r.on("end", () => res(b));
          r.on("error", rej);
        });
      });
      const imageMatch = (composeRes || "").match(/image:\s*["']?([^\s"']+)["']?/m);
      if (imageMatch) staged.dockerImage = imageMatch[1].trim();
    } catch (_) {}
  }

  if (!staged.dockerImage && repoInfo.description) {
    const desc = repoInfo.description.toLowerCase();
    if (desc.includes("docker") || desc.includes("container")) {
      staged.deployHint = "Check README for docker run or docker-compose usage.";
    }
  }

  return staged;
}

// ----- HTTP server (minimal, no Express) -----

const PORT = Number(process.env.PORT) || 3001;
// Bind to 0.0.0.0 in production so the server is reachable from outside the container
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.join(__dirname, "..");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return Promise.resolve();
  const payload = JSON.stringify({
    from: FROM_EMAIL,
    to: [to],
    subject,
    html,
  });
  return new Promise((resolve) => {
    const req = https.request(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (ch) => (body += ch));
        res.on("end", () => resolve());
      }
    );
    req.on("error", () => resolve());
    req.write(payload);
    req.end();
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (ch) => (buf += ch));
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".ico": "image/x-icon",
  };
  res.setHeader("Content-Type", types[ext] || "application/octet-stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    res.statusCode = 404;
    res.end("Not found");
  });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;
  const idMatch = pathname.match(/^\/api\/requests\/([^/]+)(?:\/(stage))?$/);
  const id = idMatch ? idMatch[1] : null;
  const action = idMatch ? idMatch[2] : null;

  // Health check for load balancers and PaaS
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "nirvana-benchmark-api" }));
    return;
  }

  // Serve frontend (same origin so fetch("/api/...") works)
  if (!pathname.startsWith("/api")) {
    const file = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.join(ROOT, file.replace(/^\//, ""));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      serveStatic(res, filePath);
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain");
    res.end("Not found");
    return;
  }

  try {
    if (pathname === "/api/requests" && req.method === "GET") {
      const requests = loadRequests();
      send(res, 200, requests);
      return;
    }

    if (pathname === "/api/requests" && req.method === "POST") {
      const body = await parseBody(req);
      const requests = loadRequests();
      const newId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const record = {
        id: newId,
        status: "pending_approval",
        createdAt: new Date().toISOString(),
        company: body.company,
        companyWebsite: body.companyWebsite,
        product: body.product,
        vertical: body.vertical,
        githubUrl: body.githubUrl,
        twitterHandle: body.twitterHandle,
        salesEmail: body.salesEmail,
        engineerEmail: body.engineerEmail,
        benchmarkToolId: body.benchmarkToolId,
        benchmarkToolLabel: body.benchmarkToolLabel,
        benchmarkToolRepo: body.benchmarkToolRepo,
        stagedConfig: null,
        results: null,
      };
      requests.push(record);
      saveRequests(requests);
      if (record.engineerEmail) {
        const engineerHtml = `
          <p>A new benchmark request has been submitted and is ready for you to run.</p>
          <p><strong>Request ID:</strong> ${record.id}</p>
          <p><strong>Company:</strong> ${record.company}</p>
          <p><strong>Product:</strong> ${record.product || "—"}</p>
          <p><strong>GitHub:</strong> ${record.githubUrl}</p>
          <p><strong>Benchmark tool:</strong> ${record.benchmarkToolLabel || "—"} (${record.benchmarkToolRepo || "—"})</p>
          <h3>Next steps</h3>
          <ol>
            <li><strong>Stage the request</strong> — Resolve the customer GitHub repo and get deployment details:<br/>
            <code>POST ${APP_URL}/api/requests/${record.id}/stage</code></li>
            <li><strong>Deploy and run</strong> — Use stagedConfig to deploy the OSS on Nirvana + AWS, then run the benchmark tool. Collect metrics (QPS, p99, cost, recall).</li>
            <li><strong>Mark complete and notify sales</strong> — In the app, open "Engineer: Mark request complete", select this request, enter the results, and click "Mark complete and notify sales." Or via API:<br/>
            <code>PATCH ${APP_URL}/api/requests/${record.id}</code> with body: <code>{"status":"ready","results":{"nirvanaQps":...,"awsQps":...,"nirvanaP99":...,"awsP99":...,"nirvanaCost":...,"awsCost":...,"recall":0.99}}</code></li>
          </ol>
          <p>Full instructions: Open <a href="${APP_URL}">${APP_URL}</a> and see DEV_NEXT_STEPS.md in the repo.</p>
        `;
        sendEmail(record.engineerEmail, `Benchmark request: ${record.company} (${record.id})`, engineerHtml).catch(() => {});
      }
      send(res, 201, {
        id: record.id,
        status: record.status,
        createdAt: record.createdAt,
        results: record.results,
      });
      return;
    }

    if (id && req.method === "GET") {
      const requests = loadRequests();
      const record = requests.find((r) => r.id === id);
      if (!record) {
        send(res, 404, { message: "Request not found" });
        return;
      }
      send(res, 200, record);
      return;
    }

    if (id && action === "stage" && req.method === "POST") {
      const requests = loadRequests();
      const record = requests.find((r) => r.id === id);
      if (!record) {
        send(res, 404, { message: "Request not found" });
        return;
      }
      if (!record.githubUrl) {
        send(res, 400, { message: "No githubUrl on request" });
        return;
      }
      try {
        const stagedConfig = await stageFromGitHub(record.githubUrl);
        record.stagedConfig = stagedConfig;
        record.status = "staged";
        record.stagedAt = new Date().toISOString();
        saveRequests(requests);
        send(res, 200, {
          id: record.id,
          status: record.status,
          stagedConfig,
          message:
            "Staged. Use stagedConfig (dockerImage, dockerComposePath, githubRepo) with Nirvana API and AWS API to deploy.",
        });
      } catch (e) {
        send(res, 502, {
          message: "Failed to stage from GitHub",
          error: e.message,
        });
      }
      return;
    }

    if (id && req.method === "PATCH") {
      const body = await parseBody(req);
      const requests = loadRequests();
      const record = requests.find((r) => r.id === id);
      if (!record) {
        send(res, 404, { message: "Request not found" });
        return;
      }
      if (body.status != null) record.status = body.status;
      if (body.results != null) record.results = body.results;
      if (body.stagedConfig != null) record.stagedConfig = body.stagedConfig;
      record.updatedAt = new Date().toISOString();
      saveRequests(requests);
      if (record.status === "ready" && record.salesEmail) {
        const salesHtml = `
          <p>Your benchmark results for <strong>${record.company}</strong> are ready.</p>
          <p>Open the app and click the completed request in the Request log to generate your summary, metrics block, and tweet drafts.</p>
          <p><a href="${APP_URL}">${APP_URL}</a></p>
        `;
        sendEmail(record.salesEmail, `Benchmark results ready: ${record.company}`, salesHtml).catch(() => {});
      }
      send(res, 200, record);
      return;
    }

    send(res, 404, { message: "Not found", path: pathname });
  } catch (e) {
    send(res, 500, { message: e.message || "Internal error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Benchmark API listening on http://${HOST}:${PORT}`);
  console.log("  POST /api/requests        - create request (sales)");
  console.log("  GET  /api/requests        - list requests");
  console.log("  GET  /api/requests/:id    - get one request");
  console.log("  POST /api/requests/:id/stage - resolve GitHub → OSS, stage for Nirvana + AWS");
  console.log("  PATCH /api/requests/:id   - update status/results");
});
