function getNumberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function collectFormData() {
  const form = document.getElementById("benchmark-form");
  const fd = new FormData(form);

  const company = (fd.get("company") || "").toString().trim();
  const companyWebsite = (fd.get("companyWebsite") || "").toString().trim();
  const product = (fd.get("product") || "").toString().trim();
  const vertical = (fd.get("vertical") || "").toString();
  const twitterHandle = (fd.get("twitterHandle") || "").toString().trim();
  const githubUrl = (fd.get("githubUrl") || "").toString().trim();
  const salesEmail = (fd.get("salesEmail") || "").toString().trim();
  const engineerEmail = (fd.get("engineerEmail") || "").toString().trim();

  const benchmarkToolLabelEl = document.getElementById("benchmark-tool-label");
  const benchmarkToolRepoEl = document.getElementById("benchmark-tool-repo");
  const benchmarkToolLabel = (benchmarkToolLabelEl?.value || "").toString().trim();
  const benchmarkToolRepo = (benchmarkToolRepoEl?.value || "").toString().trim();

  const nirvanaQps = getNumberValue(fd.get("nirvanaQps"));
  const awsQps = getNumberValue(fd.get("awsQps"));
  const nirvanaP99 = getNumberValue(fd.get("nirvanaP99"));
  const awsP99 = getNumberValue(fd.get("awsP99"));
  const recall = getNumberValue(fd.get("recall"));

  const nirvanaCost = getNumberValue(fd.get("nirvanaCost"));
  const awsCost = getNumberValue(fd.get("awsCost"));

  return {
    company: company || "Qdrant",
    companyWebsite,
    product: product || "Qdrant vector DB",
    vertical,
    twitterHandle: twitterHandle || "@qdrant_engine",
    githubUrl,
    salesEmail,
    engineerEmail,
    benchmarkToolLabel,
    benchmarkToolRepo,
    // Dataset + VM spec now come from the benchmark tool defaults,
    // not from sales input.
    datasetName: null,
    datasetVectors: null,
    datasetDimensions: null,
    vmSpec: null,
    nirvanaQps,
    awsQps,
    nirvanaP99,
    awsP99,
    recall: recall ?? 0.99,
    nirvanaCost,
    awsCost,
  };
}

// --- Vertical → benchmark tool mapping ---

function getBenchmarkToolForVertical(vertical) {
  switch (vertical) {
    case "vector-db":
      return {
        id: "vector-dbbench",
        label: "VectorDBBench",
        repo: "https://github.com/zilliztech/VectorDBBench",
        defaults: {
          datasetName: "glove-100-angular",
          datasetVectors: 1183514,
          datasetDimensions: 100,
          vmSpec:
            "8 vCPU, 32 GB RAM server + 8 vCPU, 16 GB RAM client (ABS on Nirvana, gp3/io2 on AWS)",
        },
      };
    case "analytics-db":
      return {
        id: "clickbench",
        label: "ClickBench (+ clickhouse-benchmark)",
        repo: "https://github.com/ClickHouse/ClickBench",
        defaults: {
          datasetName: "ClickBench hits",
          datasetVectors: 100000000, // large web traffic dataset, approximate
          datasetDimensions: 100, // ~100 columns
          vmSpec:
            "8 vCPU, 32 GB RAM ClickHouse server + separate 8 vCPU, 16 GB RAM client",
        },
      };
    case "sql-oltp":
      return {
        id: "sysbench",
        label: "sysbench (OLTP workloads)",
        repo: "https://github.com/akopytov/sysbench",
        defaults: {
          datasetName: "sysbench oltp_read_write",
          datasetVectors: 1000000,
          datasetDimensions: 10,
          vmSpec:
            "Single 8 vCPU, 32 GB RAM DB server + 8 vCPU, 16 GB RAM sysbench client",
        },
      };
    case "kv-store":
      return {
        id: "memtier",
        label: "memtier_benchmark",
        repo: "https://github.com/RedisLabs/memtier_benchmark",
        defaults: {
          datasetName: "memtier 1M requests, 256B values",
          datasetVectors: 1000000,
          datasetDimensions: 1,
          vmSpec:
            "8 vCPU, 32 GB RAM server (Dragonfly/Redis) + 8 vCPU, 16 GB RAM client in same AZ",
        },
      };
    case "distributed-sql":
      return {
        id: "benchbase",
        label: "BenchBase (TPC-C / TPCC-style)",
        repo: "https://github.com/cmu-db/benchbase",
        defaults: {
          datasetName: "BenchBase TPC-C (1000 warehouses)",
          datasetVectors: 1000000,
          datasetDimensions: 10,
          vmSpec:
            "3-node 8 vCPU, 32 GB RAM distributed SQL cluster + 8 vCPU, 16 GB RAM BenchBase load generator",
        },
      };
    default:
      return {
        id: "custom",
        label: "Custom / per-target benchmark",
        repo: "",
      };
  }
}

/** Tool for this request: from editable fields if set, else from vertical default. */
function getBenchmarkToolForRequest(data) {
  const label = (data.benchmarkToolLabel || "").trim();
  const repo = (data.benchmarkToolRepo || "").trim();
  if (label || repo) {
    return {
      id: "custom",
      label: label || "Custom benchmark",
      repo: repo || "",
    };
  }
  return getBenchmarkToolForVertical(data.vertical);
}

function syncBenchmarkToolFromVertical() {
  const verticalEl = document.getElementById("vertical");
  const labelEl = document.getElementById("benchmark-tool-label");
  const repoEl = document.getElementById("benchmark-tool-repo");
  if (!verticalEl || !labelEl || !repoEl) return;
  const vertical = verticalEl.value;
  const tool = getBenchmarkToolForVertical(vertical);
  if (tool) {
    labelEl.value = tool.label || "";
    repoEl.value = tool.repo || "";
  }
}

// --- Sales workflow state ---

let currentRequest = null;
let selectedRequestId = null;

/** Map API status to display label for the request log */
function getStatusLabel(status) {
  switch (status) {
    case "pending_approval":
      return { label: "Sales requested", className: "request-log-status--requested" };
    case "staged":
      return { label: "Back end deploying", className: "request-log-status--deploying" };
    case "ready":
      return { label: "Completed", className: "request-log-status--completed" };
    default:
      return { label: status || "Unknown", className: "" };
  }
}

function formatRequestDate(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoString;
  }
}

async function fetchRequestLog() {
  const apiBase = getApiBase();
  const listEl = document.getElementById("request-log-list");
  const emptyEl = document.getElementById("request-log-empty");
  const refreshBtn = document.getElementById("refresh-request-log");

  if (!listEl) return;

  const apiUrl = apiBase ? `${apiBase}/api/requests` : "/api/requests";

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing…";
  }

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Failed to load requests");
    const requests = await res.json();

    emptyEl.style.display = Array.isArray(requests) && requests.length > 0 ? "none" : "block";

    if (!Array.isArray(requests) || requests.length === 0) {
      listEl.innerHTML = "";
      listEl.appendChild(emptyEl);
      emptyEl.style.display = "block";
      emptyEl.textContent = "No requests yet. Submit a benchmark request above.";
      return;
    }

    emptyEl.style.display = "none";
    const sorted = [...requests].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    listEl.innerHTML = "";
    sorted.forEach((r, idx) => {
      const num = idx + 1;
      const { label: statusLabel, className: statusClass } = getStatusLabel(r.status);
      const row = document.createElement("div");
      row.className = "request-log-row";
      row.setAttribute("data-request-id", r.id);
      if (r.status === "ready" && r.results) {
        row.setAttribute("data-ready", "1");
        row.style.cursor = "pointer";
        row.title = "Click to select and generate summary/metrics/tweets";
      } else {
        row.style.cursor = "pointer";
        row.title = "Click to select this request";
      }
      const company = r.company || "—";
      const product = r.product ? ` · ${r.product}` : "";
      const repo = r.githubUrl ? r.githubUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
      row.innerHTML = `
        <div>
          <span class="request-log-num">${num}.</span>
          <span class="request-log-company">${escapeHtml(company)}${escapeHtml(product)}</span>
          <div class="request-log-meta request-log-id">${escapeHtml(r.id)}</div>
          ${repo ? `<div class="request-log-meta">${escapeHtml(repo)}</div>` : ""}
        </div>
        <span class="request-log-status ${statusClass}">${escapeHtml(statusLabel)}</span>
        <span class="request-log-date">${escapeHtml(formatRequestDate(r.createdAt))}</span>
      `;
      row.addEventListener("click", () => {
        ["summary-output", "metrics-output", "tweets-output"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
        listEl.querySelectorAll(".request-log-row--selected").forEach((el) => el.classList.remove("request-log-row--selected"));
        row.classList.add("request-log-row--selected");
        selectedRequestId = r.id;
        if (r.status === "ready" && r.results) {
          currentRequest = { id: r.id, status: r.status, salesInputs: { company: r.company, product: r.product, vertical: r.vertical, twitterHandle: r.twitterHandle, githubUrl: r.githubUrl, salesEmail: r.salesEmail, benchmarkToolLabel: r.benchmarkToolLabel, benchmarkToolRepo: r.benchmarkToolRepo }, results: r.results };
          setResultsReady(r.results);
        } else {
          currentRequest = null;
          ["generate-summary", "generate-metrics", "generate-tweets"].forEach((id) => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = true;
          });
          const resultsStatus = document.getElementById("results-status-text");
          if (resultsStatus) resultsStatus.textContent = "Select a completed request from the log below to generate content.";
        }
      });
      listEl.appendChild(row);
      if (selectedRequestId === r.id) row.classList.add("request-log-row--selected");
    });
    populateEngineerSelect(requests);
  } catch (_) {
    emptyEl.style.display = "block";
    emptyEl.textContent = "Could not load requests. Check the app URL and try Refresh again.";
    listEl.innerHTML = "";
    listEl.appendChild(emptyEl);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    }
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function populateEngineerSelect(requests) {
  const sel = document.getElementById("engineer-select-request");
  if (!sel) return;
  const sorted = [...(requests || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  sel.innerHTML = '<option value="">— Select a request —</option>';
  sorted.forEach((r, idx) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    const status = r.status === "ready" ? "Completed" : r.status === "staged" ? "Back end deploying" : "Sales requested";
    opt.textContent = `${idx + 1}. ${r.company || "—"} (${status})`;
    sel.appendChild(opt);
  });
}

async function loadRequestById(id) {
  const apiBase = getApiBase();
  if (!apiBase) return;
  try {
    const res = await fetch(apiBase ? `${apiBase}/api/requests/${id}` : `/api/requests/${id}`);
    if (!res.ok) return;
    const record = await res.json();
    if (record.status !== "ready" || !record.results) return;
    selectedRequestId = record.id;
    currentRequest = {
      id: record.id,
      status: record.status,
      salesInputs: {
        company: record.company,
        product: record.product,
        vertical: record.vertical,
        twitterHandle: record.twitterHandle,
        githubUrl: record.githubUrl,
        salesEmail: record.salesEmail,
        benchmarkToolLabel: record.benchmarkToolLabel,
        benchmarkToolRepo: record.benchmarkToolRepo,
      },
      results: record.results,
    };
    setResultsReady(record.results);
    const listEl = document.getElementById("request-log-list");
    if (listEl) {
      listEl.querySelectorAll(".request-log-row--selected").forEach((el) => el.classList.remove("request-log-row--selected"));
      const row = listEl.querySelector(`[data-request-id="${record.id}"]`);
      if (row) row.classList.add("request-log-row--selected");
    }
  } catch (_) {}
}

function getApiBase() {
  const base = document.documentElement.getAttribute("data-api-base");
  if (base) return base.replace(/\/$/, "");
  return "";
}

function withBenchmarkDefaults(data) {
  const tool = getBenchmarkToolForVertical(data.vertical);
  const defaults = tool && tool.defaults ? tool.defaults : {};

  return {
    ...data,
    datasetName: data.datasetName || defaults.datasetName || "benchmark dataset",
    datasetVectors:
      data.datasetVectors ??
      defaults.datasetVectors ??
      1000000,
    datasetDimensions:
      data.datasetDimensions ??
      defaults.datasetDimensions ??
      100,
    vmSpec:
      data.vmSpec ||
      defaults.vmSpec ||
      "8 vCPU, 32 GB RAM server + 8 vCPU, 16 GB RAM client",
  };
}

function formatNumber(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function computeRatios(data) {
  const { nirvanaQps, awsQps, nirvanaCost, awsCost } = data;

  const qpsLift =
    nirvanaQps && awsQps && awsQps > 0
      ? ((nirvanaQps - awsQps) / awsQps) * 100
      : null;

  const qpsRatio =
    nirvanaQps && awsQps && awsQps > 0 ? nirvanaQps / awsQps : null;

  const qpDollarNirvana =
    nirvanaQps && nirvanaCost && nirvanaCost > 0
      ? nirvanaQps / nirvanaCost
      : null;
  const qpDollarAws =
    awsQps && awsCost && awsCost > 0 ? awsQps / awsCost : null;

  const qpDollarRatio =
    qpDollarNirvana && qpDollarAws && qpDollarAws > 0
      ? qpDollarNirvana / qpDollarAws
      : null;

  const costDelta =
    nirvanaCost && awsCost
      ? ((nirvanaCost - awsCost) / awsCost) * 100
      : null;

  return {
    qpsLift,
    qpsRatio,
    qpDollarNirvana,
    qpDollarAws,
    qpDollarRatio,
    costDelta,
  };
}

function generateBenchmarkSummary(data) {
  const enriched = withBenchmarkDefaults(data);
  const {
    company,
    product,
    vertical,
    twitterHandle,
    datasetName,
    datasetVectors,
    datasetDimensions,
    vmSpec,
    nirvanaQps,
    awsQps,
    nirvanaP99,
    awsP99,
    recall,
    nirvanaCost,
    awsCost,
  } = enriched;

  const {
    qpsLift,
    qpsRatio,
    qpDollarRatio,
  } = computeRatios(enriched);

  const verticalLabel =
    vertical === "analytics-db"
      ? "analytical database"
      : vertical === "kv-store"
      ? "key-value store"
      : vertical === "other"
      ? "workload"
      : "vector database";

  const twitterDisplay = twitterHandle.startsWith("@")
    ? twitterHandle
    : `@${twitterHandle}`;

  const parts = [];

  parts.push(
    `We deployed ${product} from ${company} on Nirvana Cloud and AWS using the same ${vmSpec}, then ran their own benchmark workload to keep the comparison apples-to-apples.`
  );

  parts.push(
    `The test used the ${datasetName} dataset (${datasetVectors.toLocaleString()} vectors, ${datasetDimensions} dimensions), which is representative of a real-world ${verticalLabel} deployment.`
  );

  if (nirvanaQps && awsQps) {
    const ratioText =
      qpsRatio && qpsRatio > 0
        ? `${formatNumber(qpsRatio, 2)}× higher QPS`
        : "higher QPS";
    const liftText =
      qpsLift !== null ? `${formatNumber(qpsLift, 0)}% lift in throughput` : "";
    parts.push(
      `On throughput, Nirvana sustained ${formatNumber(
        nirvanaQps
      )} QPS vs ${formatNumber(
        awsQps
      )} on AWS (${ratioText}${liftText ? `, ~${liftText}` : ""}).`
    );
  }

  if (nirvanaP99 && awsP99) {
    const latencyDelta = awsP99 - nirvanaP99;
    const better =
      latencyDelta > 0
        ? `${formatNumber(latencyDelta, 1)} ms faster at p99`
        : "lower p99 latency";
    parts.push(
      `Tail latency also improved: Nirvana delivered p99=${formatNumber(
        nirvanaP99
      )} ms vs AWS at ${formatNumber(
        awsP99
      )} ms (${better}), while keeping recall@k at ~${formatNumber(
        recall,
        3
      )}.`
    );
  } else {
    parts.push(
      `Latency stayed within the same recall target (≈${formatNumber(
        recall,
        3
      )}), with consistently tighter p99 tails on Nirvana due to lower storage latency.`
    );
  }

  if (nirvanaCost && awsCost) {
    const costText = nirvanaCost < awsCost ? "lower" : "comparable";
    const savingsPct =
      nirvanaCost < awsCost
        ? ((awsCost - nirvanaCost) / awsCost) * 100
        : null;
    const savingsFragment =
      savingsPct && savingsPct > 0
        ? ` (~${formatNumber(savingsPct, 0)}% cheaper)`
        : "";
    parts.push(
      `Infrastructure cost was ${costText}: $${formatNumber(
        nirvanaCost,
        2
      )}/hr on Nirvana vs $${formatNumber(
        awsCost,
        2
      )}/hr on AWS${savingsFragment}, with storage backed by Nirvana’s Accelerated Block Storage (20K baseline IOPS, up to 600K burst).`
    );
  }

  if (qpDollarRatio && qpDollarRatio > 0) {
    parts.push(
      `Normalizing for cost, Nirvana delivered about ${formatNumber(
        qpDollarRatio,
        2
      )}× better QP$ (queries per dollar), which is the core story for ${verticalLabel} teams trying to balance performance and spend.`
    );
  }

  parts.push(
    `Full Terraform configs, benchmark scripts, and reproducible instructions are published alongside this summary so ${company} and the ${twitterDisplay} community can validate, extend, or challenge the results.`
  );

  return parts.join("\n\n");
}

function generateMetricsBlock(data) {
  const enriched = withBenchmarkDefaults(data);
  const {
    company,
    product,
    datasetName,
    datasetVectors,
    datasetDimensions,
    vmSpec,
    nirvanaQps,
    awsQps,
    nirvanaP99,
    awsP99,
    recall,
    nirvanaCost,
    awsCost,
  } = enriched;

  const {
    qpDollarNirvana,
    qpDollarAws,
    qpDollarRatio,
  } = computeRatios(enriched);

  const header = `### Results\n\nWe ran ${product} from ${company} on Nirvana Cloud and AWS using identical infrastructure (${vmSpec}) and the same benchmark configuration.\n\n**Dataset:** ${datasetName} (${datasetVectors.toLocaleString()} vectors, ${datasetDimensions} dimensions)\n\n`;

  const lines = [];
  lines.push("| Metric | Nirvana Cloud | AWS | Notes |");
  lines.push("|--------|---------------|-----|-------|");

  if (nirvanaQps || awsQps) {
    lines.push(
      `| **QPS** (throughput) | ${formatNumber(
        nirvanaQps
      )} | ${formatNumber(
        awsQps
      )} | Measured at ~${formatNumber(recall, 3)} recall@k |`
    );
  }

  if (nirvanaP99 || awsP99) {
    lines.push(
      `| **p99 latency** (ms) | ${formatNumber(
        nirvanaP99
      )} | ${formatNumber(
        awsP99
      )} | End-to-end query latency at the 99th percentile |`
    );
  }

  if (nirvanaCost || awsCost) {
    lines.push(
      `| **Cost / hour** (USD) | $${formatNumber(
        nirvanaCost,
        2
      )} | $${formatNumber(
        awsCost,
        2
      )} | VM + storage only, excluding egress |`
    );
  }

  if (qpDollarNirvana || qpDollarAws) {
    lines.push(
      `| **QP$** (queries per dollar) | ${formatNumber(
        qpDollarNirvana
      )} | ${formatNumber(
        qpDollarAws
      )} | Higher is better; Nirvana ≈ ${formatNumber(
        qpDollarRatio || 1,
        2
      )}× vs AWS |`
    );
  }

  const footer =
    "\nWe used the target’s own benchmark tooling and configuration, pinned Docker image versions, and published Terraform + scripts to keep the results reproducible and fair.";

  return header + lines.join("\n") + footer;
}

function generateTweetDrafts(data) {
  const enriched = withBenchmarkDefaults(data);
  const {
    company,
    product,
    twitterHandle,
    datasetName,
    datasetVectors,
    datasetDimensions,
    vmSpec,
    nirvanaQps,
    awsQps,
    nirvanaP99,
    awsP99,
    nirvanaCost,
    awsCost,
  } = enriched;

  const {
    qpsLift,
    qpDollarRatio,
  } = computeRatios(enriched);

  const twitterDisplay = twitterHandle.startsWith("@")
    ? twitterHandle
    : `@${twitterHandle}`;

  const liftText =
    qpsLift !== null ? `${formatNumber(qpsLift, 0)}% higher QPS` : "higher QPS";
  const costText =
    nirvanaCost && awsCost
      ? `${formatNumber(
          ((awsCost - nirvanaCost) / awsCost) * 100,
          0
        )}% lower cost`
      : "lower cost";

  const tweet1 = [
    "Tweet 1 — Hook",
    "",
    `We deployed ${product} from ${company} on @NirvanaLabs and ran ${company}'s own benchmark against it (with an identical setup on AWS).`,
    "",
    `Results: ${liftText} at ${costText} vs AWS.`,
    "",
    "Full benchmark + repro instructions 👇",
  ].join("\n");

  const tweet2 = [
    "Tweet 2 — Setup & table",
    "",
    `Test setup: ${vmSpec}.`,
    "",
    `Dataset: ${datasetName}, ${datasetVectors.toLocaleString()} vectors, ${datasetDimensions} dimensions.`,
    "",
    "| Metric | Nirvana | AWS |",
    "| --- | --- | --- |",
    `| QPS | ${formatNumber(nirvanaQps)} | ${formatNumber(awsQps)} |`,
    `| p99 latency | ${formatNumber(
      nirvanaP99
    )} ms | ${formatNumber(awsP99)} ms |`,
    `| Cost/hr | $${formatNumber(nirvanaCost, 2)} | $${formatNumber(
      awsCost,
      2
    )} |`,
  ].join("\n");

  const tweet3 = [
    "Tweet 3 — Cost / QP$ story",
    "",
    `The QP$ (queries per dollar) gap is where it gets interesting.`,
    "",
    qpDollarRatio && qpDollarRatio > 0
      ? `Nirvana delivered ≈${formatNumber(
          qpDollarRatio,
          2
        )}× better QP$ vs AWS on this run.`
      : "Normalizing for cost, Nirvana pushes significantly more queries per dollar vs AWS on this workload.",
    "",
    "Nirvana ABS storage: 20K baseline IOPS, bursting to 600K — flat rate, no burst credits.",
    "",
    "Exactly the kind of storage this workload wants.",
  ].join("\n");

  const tweet4 = [
    "Tweet 4 — CTA",
    "",
    "Full results, Terraform configs, and step-by-step repro instructions:",
    "",
    "[link to blog / GitHub]",
    "",
    `cc ${twitterDisplay} engineers & DevRel — happy to iterate on methodology or rerun any scenario you care about.`,
  ].join("\n");

  return [tweet1, "", tweet2, "", tweet3, "", tweet4].join("\n");
}

function copyOutput(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const value = el.value.trim();
  if (!value) return;
  navigator.clipboard
    .writeText(value)
    .catch(() => {
      // Best effort only
    });
}

function downloadOutput(targetId, filename) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const value = el.value.trim();
  if (!value) return;
  const blob = new Blob([value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function submitBenchmarkRequest() {
  const data = collectFormData();
  if (!data.company || !data.companyWebsite || !data.vertical || !data.githubUrl) {
    alert("Please fill in company name, website, vertical, and customer GitHub URL.");
    return;
  }

  const tool = getBenchmarkToolForRequest(data);
  const apiBase = getApiBase();
  const statusEl = document.getElementById("request-status-text");
  const btn = document.getElementById("submit-request");

  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = "Submitting…";

  const apiUrl = apiBase ? `${apiBase}/api/requests` : "/api/requests";
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: data.company,
        companyWebsite: data.companyWebsite,
        product: data.product,
        vertical: data.vertical,
        githubUrl: data.githubUrl,
        twitterHandle: data.twitterHandle,
        salesEmail: data.salesEmail,
        engineerEmail: data.engineerEmail,
        benchmarkToolId: tool.id,
        benchmarkToolLabel: data.benchmarkToolLabel || tool.label,
        benchmarkToolRepo: data.benchmarkToolRepo || tool.repo,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || res.statusText || "Request failed");
    }
    const created = await res.json();
    currentRequest = {
      id: created.id,
      status: created.status,
      createdAt: created.createdAt,
      salesInputs: data,
      benchmarkTool: tool,
      results: created.results,
    };
    if (created.status === "ready" && created.results) {
      setResultsReady(created.results);
    }
    if (statusEl) {
      statusEl.textContent = `Request #${created.id} submitted. Backend will take the OSS from GitHub and stage deployment (Nirvana + AWS).`;
    }
    fetchRequestLog();
  } catch (e) {
    currentRequest = {
      id: `req_${Date.now()}`,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
      salesInputs: data,
      benchmarkTool: tool,
    };
    if (statusEl) {
      statusEl.textContent = `Request saved locally only. (API not reached: ${e.message}. On Render, the request should reach the backend — check the Request log and click Refresh.)`;
    }
  } finally {
    if (btn) setTimeout(() => { btn.disabled = false; }, 500);
  }
}

function setResultsReady(mockResults) {
  if (!currentRequest) return;
  currentRequest.status = "ready";
  currentRequest.results = mockResults || currentRequest.results || {};

  ["generate-summary", "generate-metrics", "generate-tweets"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = false;
  });

  const resultsStatus = document.getElementById("results-status-text");
  if (resultsStatus) {
    resultsStatus.textContent =
      "Benchmark marked as complete by backend. You can now generate summary, metrics, and tweet drafts.";
  }
}

function wireEvents() {
  const summaryBtn = document.getElementById("generate-summary");
  const metricsBtn = document.getElementById("generate-metrics");
  const tweetsBtn = document.getElementById("generate-tweets");
  const submitBtn = document.getElementById("submit-request");

  submitBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    submitBenchmarkRequest();
  });

  function getDataForGeneration() {
    const form = collectFormData();
    if (currentRequest && currentRequest.results && typeof currentRequest.results === "object") {
      return { ...form, ...currentRequest.results };
    }
    return form;
  }

  summaryBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const data = getDataForGeneration();
    const summary = generateBenchmarkSummary(data);
    const output = document.getElementById("summary-output");
    if (output) output.value = summary;
  });

  metricsBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const data = getDataForGeneration();
    const metrics = generateMetricsBlock(data);
    const output = document.getElementById("metrics-output");
    if (output) output.value = metrics;
  });

  tweetsBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const data = getDataForGeneration();
    const tweets = generateTweetDrafts(data);
    const output = document.getElementById("tweets-output");
    if (output) output.value = tweets;
  });

  document.querySelectorAll("[data-copy-target]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const target = btn.getAttribute("data-copy-target");
      if (target) copyOutput(target);
    });
  });

  document.querySelectorAll("[data-download-target]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const target = btn.getAttribute("data-download-target");
      const filename = btn.getAttribute("data-filename") || "export.md";
      if (target) downloadOutput(target, filename);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  syncBenchmarkToolFromVertical();
  const verticalEl = document.getElementById("vertical");
  verticalEl?.addEventListener("change", syncBenchmarkToolFromVertical);

  const refreshLogBtn = document.getElementById("refresh-request-log");
  refreshLogBtn?.addEventListener("click", () => fetchRequestLog());

  const engineerMarkBtn = document.getElementById("engineer-mark-complete");
  const engineerStatus = document.getElementById("engineer-status");
  engineerMarkBtn?.addEventListener("click", async () => {
    const sel = document.getElementById("engineer-select-request");
    const id = sel?.value;
    if (!id) {
      if (engineerStatus) engineerStatus.textContent = "Select a request first.";
      return;
    }
    const apiBase = getApiBase();
    const url = apiBase ? `${apiBase}/api/requests/${id}` : `/api/requests/${id}`;
    if (engineerStatus) engineerStatus.textContent = "Marking complete and fetching results…";
    if (engineerMarkBtn) engineerMarkBtn.disabled = true;
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (engineerStatus) engineerStatus.textContent = "Marked complete. Sales will receive an email that results are ready.";
      fetchRequestLog();
    } catch (e) {
      if (engineerStatus) engineerStatus.textContent = `Error: ${e.message}`;
    } finally {
      if (engineerMarkBtn) engineerMarkBtn.disabled = false;
    }
  });

  fetchRequestLog();
});

// Allow backend/devs to mark a request as ready from the console:
//   window.__benchmarkUI.setReady({ nirvanaQps: ..., awsQps: ... })
window.__benchmarkUI = {
  setReady: setResultsReady,
};

