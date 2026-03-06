# The Benchmark-Driven Outbound Sales Playbook: Nirvana Cloud

## Executive Summary

Traditional outbound sales (cold emails, cold calls) has declining effectiveness for cloud infrastructure companies. This playbook details a "show, don't tell" strategy: deploy a target company's open-source software on Nirvana Cloud, run their own benchmarking tools against it (and against AWS as a baseline), publish the results, and use those results to engage employees of the target company on social media. The approach creates genuine value before any sales conversation, leveraging Nirvana Cloud's performance advantages — 42% average cost savings, >3x performance, sub-millisecond storage latency, and up to 600,000 burst IOPS.[^1][^2]

***

## The Core Strategy

The playbook follows a five-phase loop for each target company:

1. **Identify** — Find an open-source company with self-hosted software AND a public benchmarking tool.
2. **Deploy** — Run their OSS product on both Nirvana Cloud and AWS (identical specs).
3. **Benchmark** — Use *their own* benchmarking framework to generate comparable results.
4. **Publish** — Write up results on a blog or GitHub repo with reproducible instructions.
5. **Engage** — Condense into tweet-sized insights and tag employees of the target company.

The key insight: by using the target's own benchmark tooling and terminology, the results are credible within their community. Employees see real work, not a pitch.[^3]

***

## Phase 1: Target Identification

### Selection Criteria

The ideal target company must have:

- An **open-source product** that can be self-hosted via Docker or binary
- A **public benchmarking tool** (their own or a well-known community tool)
- **Active employees on Twitter/X** who engage with technical content
- A **workload profile** that benefits from Nirvana's strengths (high IOPS, low latency, high clock-speed CPU)

### Priority Target List

| Company | OSS Product | Benchmark Tool | Docker Deploy | Key Metrics | Nirvana Edge |
|---------|------------|----------------|---------------|-------------|--------------|
| **Qdrant** | Qdrant vector DB | vector-db-benchmark[^4] | `docker run -p 6333:6333 qdrant/qdrant`[^5] | QPS, latency, recall | High IOPS for vector indexing |
| **Zilliz (Milvus)** | Milvus | VectorDBBench[^6] | Docker Compose | QPS, QP$, latency | Cost-effectiveness ratio |
| **ClickHouse** | ClickHouse | ClickBench[^7] + `clickhouse-benchmark`[^8] | Docker | Query time across 43 queries | High clock speed for analytics |
| **ScyllaDB** | ScyllaDB | cassandra-stress / cql-stress[^9][^10] | Docker | ops/sec, p99 latency | Low-latency storage, high IOPS |
| **DragonflyDB** | Dragonfly | memtier_benchmark / dfly_bench[^11] | Docker | ops/sec, latency | Multi-threaded, CPU clock speed |
| **CockroachDB** | CockroachDB | TPC-C workload[^12] | Docker / binary | tpmC, latency | Distributed SQL on fast storage |
| **Weaviate** | Weaviate | VectorDBBench[^6] | Docker | QPS, recall, latency | Vector search performance |
| **Redis / Valkey** | Redis OSS / Valkey | redis-benchmark, memtier_benchmark[^13] | Docker | ops/sec, latency | In-memory workloads |

### Where to Start

Begin with **Qdrant** as the first target — it has the most complete open-source benchmarking ecosystem, a highly engaged team on Twitter, and vector databases are a hot category where performance differentiation matters.[^14][^3]

***

## Phase 2: Infrastructure Deployment

### Architecture Overview

Each benchmark run requires two parallel environments with **identical specs**:

```
┌─────────────────────┐    ┌─────────────────────┐
│   NIRVANA CLOUD     │    │       AWS EC2        │
│                     │    │                      │
│  Server VM          │    │  Server Instance     │
│  - 8 vCPU           │    │  - 8 vCPU            │
│  - 32 GB RAM        │    │  - 32 GB RAM         │
│  - ABS Storage      │    │  - gp3/io2 EBS       │
│  - Docker + OSS DB  │    │  - Docker + OSS DB   │
│                     │    │                      │
│  Client VM          │    │  Client Instance     │
│  - 8 vCPU           │    │  - 8 vCPU            │
│  - 16 GB RAM        │    │  - 16 GB RAM         │
│  - Benchmark Tool   │    │  - Benchmark Tool    │
└─────────────────────┘    └─────────────────────┘
```

The client and server should be in the same region/DC to minimize network variance. Qdrant's own benchmarks use 8 vCPU / 32 GB for the server and 8 vCPU / 16 GB for the client.[^14]

### Nirvana Cloud Deployment (via Terraform)

Nirvana Labs provides an official Terraform provider (`nirvana-labs/nirvana`) and SDKs in TypeScript and Go.[^15][^16]

```hcl
# main.tf — Nirvana Cloud benchmark infrastructure

terraform {
  required_providers {
    nirvana = {
      source = "nirvana-labs/nirvana"
    }
  }
}

data "nirvana_compute_vm_os_images" "os_images" {}

resource "nirvana_compute_vm" "benchmark_server" {
  name             = "benchmark-server"
  os_image_name    = data.nirvana_compute_vm_os_images.os_images.items.name
  cpu_config       = { vcpu = 8 }
  memory_config    = { size = 32768 }  # 32 GB
  public_ip_enabled = true
  ssh_key          = { public_key = file("~/.ssh/id_rsa.pub") }
  # Region: match to target (e.g., us-east for fair comparison)
}

resource "nirvana_compute_vm" "benchmark_client" {
  name             = "benchmark-client"
  os_image_name    = data.nirvana_compute_vm_os_images.os_images.items.name
  cpu_config       = { vcpu = 8 }
  memory_config    = { size = 16384 }  # 16 GB
  public_ip_enabled = true
  ssh_key          = { public_key = file("~/.ssh/id_rsa.pub") }
}
```

Nirvana VMs run Ubuntu 22.04 with configurable CPU, RAM, and storage volumes. Accelerated Block Storage (ABS) provides 20,000 baseline IOPS with burst up to 600,000, sub-millisecond latency, and flat pricing at $0.00013/GB/hr.[^17][^18][^2]

### AWS Deployment (via Terraform)

```hcl
# aws.tf — AWS EC2 benchmark infrastructure

provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "benchmark_server" {
  ami           = "ami-0c7217cdde317cfec"  # Ubuntu 22.04
  instance_type = "m6i.2xlarge"            # 8 vCPU, 32 GB
  key_name      = var.key_name

  root_block_device {
    volume_size = 100
    volume_type = "gp3"
    iops        = 16000
    throughput   = 1000
  }
}

resource "aws_instance" "benchmark_client" {
  ami           = "ami-0c7217cdde317cfec"
  instance_type = "m6i.2xlarge"
  key_name      = var.key_name
}
```

### Post-Provisioning Setup Script

After VMs are provisioned on both clouds, run this setup script via SSH:

```bash
#!/bin/bash
# setup.sh — Run on both server and client VMs

# Install Docker
sudo apt-get update && sudo apt-get install -y docker.io docker-compose
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker $USER

# Install Python (for benchmark tools)
sudo apt-get install -y python3 python3-pip python3-venv

# System tuning for benchmarks
echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
sudo sysctl -p
```

***

## Phase 3: Benchmark Execution

### Example: Qdrant Benchmark Walkthrough

This is the detailed reference implementation using Qdrant. The same pattern applies to every target.

#### Step 1: Deploy Qdrant on the Server VM

```bash
# On the SERVER VM (both Nirvana and AWS)
docker run -d --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  --memory="25g" \
  -v "$(pwd)/qdrant_storage:/qdrant/storage" \
  qdrant/qdrant:latest
```

Qdrant exposes REST on port 6333 and gRPC on 6334. Memory is limited to 25 GB to match the standard benchmark configuration used in official Qdrant benchmarks.[^19][^14]

#### Step 2: Set Up the Benchmark Tool on the Client VM

**Option A: Qdrant's vector-db-benchmark** (recommended for credibility)

```bash
# On the CLIENT VM
git clone https://github.com/qdrant/vector-db-benchmark.git
cd vector-db-benchmark
pip install poetry
poetry install
```

This framework requires Python >=3.9, Poetry, and supports multiple engines via Docker Compose.[^20]

**Option B: VectorDBBench by Zilliz** (broader comparison)

```bash
pip install vectordb-bench[qdrant]
```

VectorDBBench provides a visual interface and supports multiple vector databases including Qdrant, Milvus, Weaviate, pgvector, and others.[^6]

#### Step 3: Run the Benchmark

```bash
# Using vector-db-benchmark
# Configure the Qdrant connection in experiments/configurations/
# Then run:
python run.py --engine qdrant --host <SERVER_IP>
```

Standard datasets include SIFT (128-dim), GIST (960-dim), and OpenAI embeddings (1536-dim). Run the same benchmark configuration against both the Nirvana-hosted and AWS-hosted Qdrant instances.[^4][^6]

#### Step 4: Collect Results

Key metrics to capture for vector databases:

| Metric | What It Measures | Why It Matters |
|--------|-----------------|----------------|
| **QPS** (Queries Per Second) | Search throughput | Higher = serves more users |
| **Latency (p50, p95, p99)** | Response time distribution | Lower = better UX |
| **Recall@k** | Search accuracy | Must stay above 0.95 for valid comparison |
| **Upload Speed** | Data ingestion rate | Faster indexing = faster iteration |
| **QP$** (Queries Per Dollar) | Cost-effectiveness | Nirvana's key selling point |

The QP$ metric is calculated as QPS divided by hourly infrastructure cost — this is where Nirvana Cloud's pricing advantage becomes most visible.[^18][^6]

### Benchmark Templates for Other Targets

#### ClickHouse (ClickBench)

```bash
# Deploy ClickHouse
docker run -d --name clickhouse -p 8123:8123 -p 9000:9000 \
  clickhouse/clickhouse-server:latest

# Download ClickBench dataset
curl -O https://datasets.clickhouse.com/hits_compatible/hits.tsv.gz
gzip -d hits.tsv.gz

# Create schema and load data (see ClickBench repo for SQL)
# Run the 43 standard queries and record cold/hot times
```

ClickBench compares ~50 database systems with a real-world web traffic analysis dataset of 104 columns.[^21][^7]

#### DragonflyDB (memtier_benchmark)

```bash
# Deploy Dragonfly
docker run -d --name dragonfly -p 6379:6379 \
  docker.dragonflydb.io/dragonflydb/dragonfly

# Run benchmark from client
memtier_benchmark -s <SERVER_IP> -p 6379 \
  --threads=8 --clients=50 --requests=1000000 \
  --data-size=256 --ratio=1:1
```

Dragonfly recommends running client and server on separate machines in the same availability zone for accurate results.[^11]

#### ScyllaDB (cassandra-stress)

```bash
# Deploy ScyllaDB
docker run -d --name scylla -p 9042:9042 \
  scylladb/scylla --smp 8

# Run cassandra-stress
cassandra-stress write n=1000000 -rate threads=64 \
  -node <SERVER_IP>
cassandra-stress mixed ratio\(write=1,read=3\) n=1000000 \
  -rate threads=64 -node <SERVER_IP>
```

The cassandra-stress tool is the standard for benchmarking both ScyllaDB and Cassandra clusters.[^9]

***

## Phase 4: Content Publication

### Blog Post Template

Each benchmark should produce a blog post with this structure:

```markdown
Title: "Running [Product] on Nirvana Cloud: A Performance Benchmark vs. AWS"

1. Introduction
   - What we tested and why
   - Link to the OSS product
   - Link to the benchmark tool used

2. Test Setup
   - Exact VM specs (CPU, RAM, storage) on both clouds
   - Software versions (Docker image tags)
   - Configuration files used
   - Cost per hour on each cloud

3. Results
   - Tables and charts comparing key metrics
   - QPS, latency percentiles, recall (for vector DBs)
   - Cost-effectiveness analysis (QP$)

4. Reproducibility
   - Terraform configs and scripts in a GitHub repo
   - Step-by-step instructions to reproduce

5. Key Takeaways
   - Where Nirvana excels (highlight IOPS, latency, cost)
   - Fair acknowledgment of any trade-offs
```

### GitHub Repository Structure

Create a public repo for each benchmark:

```
nirvana-benchmarks/
├── qdrant/
│   ├── terraform/
│   │   ├── nirvana/main.tf
│   │   └── aws/main.tf
│   ├── scripts/
│   │   ├── setup.sh
│   │   ├── deploy-qdrant.sh
│   │   └── run-benchmark.sh
│   ├── results/
│   │   ├── nirvana-results.json
│   │   └── aws-results.json
│   ├── charts/
│   │   └── comparison.png
│   └── README.md
├── clickhouse/
│   └── ...
├── dragonfly/
│   └── ...
└── README.md
```

***

## Phase 5: Social Engagement

### Tweet Framework

Each benchmark produces a thread of 3-5 tweets:

**Tweet 1 (The Hook)**
> We deployed @qdrant_engine on @NirvanaLabs cloud and ran their own vector-db-benchmark against it.
>
> Results: [X]% higher QPS at [Y]% lower cost vs AWS.
>
> Full benchmark + repro instructions 👇

**Tweet 2 (The Data)**
> Test setup: 8 vCPU, 32GB RAM, same config on both clouds.
>
> Dataset: [dataset name], [X]M vectors, [Y] dimensions.
>
> | Metric | Nirvana | AWS |
> | QPS | X | Y |
> | p99 Latency | Xms | Yms |
> | Cost/hr | $X | $Y |

**Tweet 3 (The Cost Story)**
> The QP$ (queries per dollar) difference is where it gets interesting.
>
> Nirvana ABS storage: 20K baseline IOPS, bursting to 600K — flat rate, no burst credits.
>
> That's the kind of storage vector indexing actually needs.

**Tweet 4 (The CTA)**
> Full results, Terraform configs, and step-by-step repro instructions:
> [link to blog/GitHub]
>
> cc @qdrant_employee_1 @qdrant_employee_2

### Who to Tag

For each target company, identify 3-5 employees to engage:

- **CTO / VP Engineering** — cares about infrastructure performance
- **DevRel / Developer Advocates** — most likely to engage publicly
- **Engineering leads** — will appreciate technical depth
- **CEO / Founders** — if they're active on Twitter

Use LinkedIn and Twitter search to build this list before publishing.

### Engagement Rules

- **Be genuine, not salesy** — share the results as interesting technical work, not as an ad
- **Credit their work** — praise the quality of their OSS product and benchmark tooling
- **Invite collaboration** — "We'd love your feedback on our methodology"
- **Follow up thoughtfully** — if they engage, offer to run additional tests with their guidance
- **Volume matters** — aim for 2-3 new benchmark publications per week across different targets

***

## Automation: Building the Benchmark Agent

### Agent Architecture

The internal tool should automate the repeatable parts of this workflow:

```
┌──────────────────────────────────────────────────────────┐
│                    BENCHMARK AGENT                        │
│                                                          │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌───────┐ │
│  │ Target   │──▶│ Infra    │──▶│ Benchmark│──▶│ Report│ │
│  │ Config   │   │ Provision│   │ Runner   │   │ Gen   │ │
│  │ (YAML)   │   │ (Terraform)│ │ (Python) │   │       │ │
│  └─────────┘   └──────────┘   └──────────┘   └───────┘ │
│       │              │              │              │      │
│       ▼              ▼              ▼              ▼      │
│  target.yaml    VMs created    results.json   blog.md    │
│                 on Nirvana     with metrics    tweets.md  │
│                 + AWS                                     │
└──────────────────────────────────────────────────────────┘
```

### Target Configuration File

Each target gets a YAML config:

```yaml
# targets/qdrant.yaml
target:
  company: Qdrant
  product: qdrant
  website: https://qdrant.tech
  twitter: "@qdrant_engine"
  
deployment:
  docker_image: "qdrant/qdrant:latest"
  ports: [6333, 6334]
  memory_limit: "25g"
  server_config:
    vcpu: 8
    ram_gb: 32
    storage_gb: 100
    storage_type: abs  # Nirvana ABS
  client_config:
    vcpu: 8
    ram_gb: 16
  region: us-east

benchmark:
  tool: vector-db-benchmark
  repo: "https://github.com/qdrant/vector-db-benchmark"
  install: "poetry install"
  run_command: "python run.py --engine qdrant --host {server_ip}"
  datasets:
    - name: "glove-100-angular"
      dimensions: 100
      vectors: 1183514
    - name: "dbpedia-openai-1M-1536-angular"
      dimensions: 1536
      vectors: 1000000
  metrics:
    - qps
    - latency_p50
    - latency_p95
    - latency_p99
    - recall
    - upload_speed

engagement:
  employees:
    - name: "Andre Zayarni"
      twitter: "@andre_zayarni"
      role: "CEO"
    - name: "Andrey Vasnetsov"  
      twitter: "@generall931"
      role: "CTO"
  hashtags: ["#vectordatabase", "#qdrant", "#benchmarks"]
```

### Agent Workflow Script

```python
#!/usr/bin/env python3
"""
benchmark_agent.py — Orchestrates the full benchmark pipeline.
Designed to be run by your dev team for each target.
"""

import yaml
import subprocess
import json
import os
from pathlib import Path

class BenchmarkAgent:
    def __init__(self, target_config_path: str):
        with open(target_config_path) as f:
            self.config = yaml.safe_load(f)
        self.target = self.config["target"]
        self.deployment = self.config["deployment"]
        self.benchmark = self.config["benchmark"]
        
    def provision_infrastructure(self):
        """Phase 2: Create VMs on Nirvana + AWS via Terraform."""
        for cloud in ["nirvana", "aws"]:
            tf_dir = f"terraform/{cloud}/{self.target['product']}"
            subprocess.run(["terraform", "init"], cwd=tf_dir)
            subprocess.run(["terraform", "apply", "-auto-approve"], cwd=tf_dir)
            
    def deploy_product(self, server_ip: str):
        """Deploy the OSS product via Docker on the server VM."""
        image = self.deployment["docker_image"]
        ports = " ".join(f"-p {p}:{p}" for p in self.deployment["ports"])
        mem = self.deployment.get("memory_limit", "25g")
        
        cmd = f"docker run -d --name {self.target['product']} "
        cmd += f"--memory={mem} {ports} {image}"
        
        subprocess.run(
            ["ssh", f"ubuntu@{server_ip}", cmd],
            check=True
        )
        
    def run_benchmark(self, client_ip: str, server_ip: str):
        """Execute the benchmark from the client VM."""
        tool = self.benchmark["tool"]
        repo = self.benchmark["repo"]
        
        # Clone and install benchmark tool
        subprocess.run(["ssh", f"ubuntu@{client_ip}",
            f"git clone {repo} && cd {tool} && {self.benchmark['install']}"
        ])
        
        # Run benchmark
        run_cmd = self.benchmark["run_command"].format(server_ip=server_ip)
        subprocess.run(["ssh", f"ubuntu@{client_ip}",
            f"cd {tool} && {run_cmd}"
        ])
        
    def collect_results(self, client_ip: str, cloud_name: str):
        """Pull results from client VM."""
        results_dir = f"results/{self.target['product']}"
        os.makedirs(results_dir, exist_ok=True)
        subprocess.run([
            "scp", "-r",
            f"ubuntu@{client_ip}:~/results/*",
            f"{results_dir}/{cloud_name}/"
        ])
        
    def generate_report(self):
        """Generate blog post and tweets from results."""
        results_dir = f"results/{self.target['product']}"
        nirvana = json.load(open(f"{results_dir}/nirvana/results.json"))
        aws = json.load(open(f"{results_dir}/aws/results.json"))
        
        # Generate comparison tables, charts, blog markdown
        # Generate tweet thread
        # (Template rendering logic here)
        
    def teardown(self):
        """Destroy infrastructure after benchmark."""
        for cloud in ["nirvana", "aws"]:
            tf_dir = f"terraform/{cloud}/{self.target['product']}"
            subprocess.run(["terraform", "destroy", "-auto-approve"], cwd=tf_dir)

    def run_full_pipeline(self):
        """Execute the complete benchmark pipeline."""
        print(f"🎯 Target: {self.target['company']}")
        self.provision_infrastructure()
        # Get IPs from Terraform output
        # self.deploy_product(nirvana_server_ip)
        # self.deploy_product(aws_server_ip)
        # self.run_benchmark(nirvana_client_ip, nirvana_server_ip)
        # self.run_benchmark(aws_client_ip, aws_server_ip)
        # self.collect_results(nirvana_client_ip, "nirvana")
        # self.collect_results(aws_client_ip, "aws")
        # self.generate_report()
        # self.teardown()


if __name__ == "__main__":
    import sys
    agent = BenchmarkAgent(sys.argv[^1])
    agent.run_full_pipeline()
```

***

## Vertical-Specific Benchmark Terminology

Using the correct terminology is critical for credibility. Each vertical has its own language.

### Vector Databases

| Term | Definition | Use In Content |
|------|-----------|----------------|
| **QPS** | Queries per second at a given recall level | "Qdrant on Nirvana achieves X QPS at 0.99 recall" |
| **Recall@k** | % of true nearest neighbors found in top-k results | "We maintained 0.99 recall across all tests" |
| **HNSW** | Hierarchical Navigable Small World (index algorithm) | "Using HNSW with ef=128, m=16" |
| **Quantization** | Compressing vectors to reduce memory (scalar, binary, product) | "Tested with and without scalar quantization" |
| **p99 latency** | 99th percentile response time | "p99 latency dropped from Xms to Yms on Nirvana" |
| **QP$** | Queries per dollar — throughput normalized by cost | "2.3x better QP$ on Nirvana vs AWS"[^6] |

### Analytical Databases (ClickHouse)

| Term | Definition | Use In Content |
|------|-----------|----------------|
| **Cold run** | Query time on first execution (no cache) | "Cold run times 30% faster on Nirvana" |
| **Hot run** | Query time after warming up caches | "Hot run average: Xms vs Yms" |
| **MergeTree** | ClickHouse's primary table engine | "Using MergeTree with ORDER BY" |
| **Compression ratio** | How much data is compressed on disk | "Better IOPS means faster decompression throughput" |

### Key-Value Stores (Dragonfly, Redis)

| Term | Definition | Use In Content |
|------|-----------|----------------|
| **ops/sec** | Operations per second (GET + SET) | "Dragonfly on Nirvana: X ops/sec" |
| **Pipeline depth** | Number of commands sent without waiting for reply | "Tested at pipeline depth 1, 10, 50" |
| **p99 latency** | 99th percentile response time | "p99 GET latency: Xμs vs Yμs"[^11] |

***

## Execution Cadence

### Weekly Rhythm

| Day | Activity |
|-----|----------|
| **Monday** | Select next target, configure YAML, start provisioning |
| **Tuesday** | Deploy product, run benchmarks on both clouds |
| **Wednesday** | Collect results, generate charts, draft blog post |
| **Thursday** | Review and edit blog, prepare tweet thread |
| **Friday** | Publish blog, post tweet thread, engage with responses |

### Scaling

- **Weeks 1-4:** Qdrant deep dive (the reference implementation)
- **Weeks 5-8:** ClickHouse + DragonflyDB
- **Weeks 9-12:** ScyllaDB + Milvus + CockroachDB
- **Ongoing:** 2-3 new benchmarks per week, re-run for new product versions

***

## Measuring Success

### Engagement Metrics

- **Tweet impressions** per benchmark thread
- **Engagement rate** (likes + replies + retweets / impressions)
- **Reply rate from target company employees** (the #1 KPI)
- **Profile visits and follows** from target company's network

### Pipeline Metrics

- **Conversations started** from benchmark engagement
- **Demo requests** or POC inquiries generated
- **Deals influenced** by benchmark content
- **Time from first tweet to first meeting**

### Content Metrics

- **Blog post views** and time on page
- **GitHub repo stars and forks** (signal of reproducibility)
- **Inbound links** from the target company or their community

***

## Key Nirvana Differentiators to Highlight

Every benchmark should naturally surface these advantages:

| Advantage | Technical Detail | Benchmark Impact |
|-----------|-----------------|------------------|
| **Storage IOPS** | 20K baseline, 600K burst on ABS[^2] | Faster vector indexing, faster query processing |
| **Storage Latency** | Sub-millisecond[^2] | Lower p99 latencies on disk-bound workloads |
| **Flat Storage Pricing** | $0.00013/GB/hr, IOPS included[^18] | Better QP$ (queries per dollar) |
| **High Clock Speed** | Latest AMD chips[^2] | Better single-thread perf for analytical queries |
| **No Burst Credits** | Consistent performance[^18] | Reproducible benchmark results |
| **No Bandwidth Limits** | Metered egress only, ingress free[^18] | Fair benchmark conditions |

***

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Benchmark shows AWS wins on some metric | Be honest — credibility matters more than winning every metric. Highlight where Nirvana does win. |
| Target company ignores tweets | Follow up with a DM linking the blog. Try engaging DevRel first. |
| Results not reproducible | Publish ALL configs, scripts, and Terraform files. Pin Docker image versions. |
| Accused of unfair benchmarking | Use the target's OWN benchmark tool with default configs. Document everything. |
| Company asks to take down results | This is actually a win — it means they're paying attention. Offer to collaborate on a fair re-test. |

***

## Quick-Start Checklist

To launch the first benchmark (Qdrant) this week:

- [ ] Set up Nirvana Cloud account with API key and Terraform provider[^15]
- [ ] Set up AWS account with Terraform credentials
- [ ] Create `targets/qdrant.yaml` configuration file
- [ ] Write Terraform configs for both Nirvana and AWS (8 vCPU / 32 GB server + 8 vCPU / 16 GB client)
- [ ] Provision infrastructure and deploy Qdrant via Docker[^5]
- [ ] Clone and run `vector-db-benchmark` against both environments[^4]
- [ ] Collect results and generate comparison charts
- [ ] Write blog post with full reproducibility instructions
- [ ] Identify 3-5 Qdrant employees on Twitter
- [ ] Publish tweet thread, tag employees, and engage
- [ ] Track responses and iterate

---

## References

1. [Nirvana Cloud](https://nirvanalabs.io/nirvana-cloud)

2. [Product | Nirvana Labs](https://nirvanalabs.io/product) - High Clock Speed Compute. Low Latency Storage. Radically Cheaper Bandwidth.

3. [Benchmarking vector search engines - Hashnode](https://vectorsearch.hashnode.dev/benchmarking-vector-search-engines) - We present the first comparative benchmark and benchmark framework for vector databases / search eng...

4. [qdrant/vector-db-benchmark - GitHub](https://github.com/qdrant/vector-db-benchmark) - All engines are served using docker compose. The configuration is in the servers. To launch the serv...

5. [Qdrant - Vector Database - Qdrant](https://qdrant.tech) - Qdrant is an Open-Source Vector Database and Vector Search Engine written in Rust. It provides fast ...

6. [Top 5 Open Source Vector Databases in 2025 - Zilliz blog](https://zilliz.com/blog/top-5-open-source-vector-search-engines) - Walk through the most popular open-source vector databases available today, compare their strengths ...

7. [ClickBench: a Benchmark For Analytical Databases - GitHub](https://github.com/ClickHouse/ClickBench) - This benchmark represents typical workload in the following areas: clickstream and traffic analysis,...

8. [Output](https://clickhouse.com/docs/operations/utilities/clickhouse-benchmark) - Documentation for clickhouse-benchmark

9. [Cassandra Stress | ScyllaDB Docs](https://docs.scylladb.com/manual/master/operating-scylla/admin-tools/cassandra-stress.html) - The cassandra-stress tool is used for benchmarking and load testing both ScyllaDB and Cassandra clus...

10. [GitHub - scylladb/cql-stress](http://github.com/scylladb/cql-stress) - Contribute to scylladb/cql-stress development by creating an account on GitHub.

11. [Benchmarking Dragonfly](https://www.dragonflydb.io/docs/getting-started/benchmark) - Dragonfly is a high-performance, distributed key-value store designed for scalability

12. [Performance Benchmarking with TPC-C - CockroachDB](https://www.cockroachlabs.com/docs/stable/performance-benchmarking-with-tpcc-large) - Performance Benchmarking with TPC-C · Step 1. Set up the environment · Step 2. Start CockroachDB · S...

13. [centminmod/redis-comparison-benchmarks](https://github.com/centminmod/redis-comparison-benchmarks) - This v5 host-networked benchmark compares four Redis-compatible engines - Redis, KeyDB, Dragonfly, a...

14. [Vector Database Benchmarks - Qdrant](https://qdrant.tech/benchmarks/) - In this article, we will compare how Qdrant performs against the other vector search engines. Here a...

15. [SDKs & Tools | Nirvana Labs Docs](https://docs.nirvanalabs.io/sdks/) - Nirvana Labs provides official SDKs, CLI tools, and infrastructure-as-code integrations to help you ...

16. [Nirvana Labs: Pagination, Terraform Data Sources, and Command ...](https://www.raptorgroup.com/news/nirvana-labs-pagination-terraform-data-sources-and-command-menu-to-strengthen-the-nirvana-control-plane/) - These updates improve how you navigate, query, and automate your infrastructure across compute, netw...

17. [Virtual Machines (VMs) | Nirvana Labs Docs](https://docs.nirvanalabs.io/cloud/compute/vms/) - VMs in Nirvana Cloud can be customized to the user's needs, with the ability to modify key attribute...

18. [Simple Pricing - Nirvana Labs](https://nirvanalabs.io/pricing) - High Clock Speed Compute. Low Latency Storage. Radically Cheaper Bandwidth.

19. [Configuration - Qdrant](https://qdrant.tech/documentation/guides/configuration/) - To customize Qdrant, you can mount your configuration file in any of the following locations. This g...

20. [Getting Started | qdrant/vector-db-benchmark | DeepWiki](https://deepwiki.com/qdrant/vector-db-benchmark/1.2-getting-started) - This document provides a step-by-step guide for setting up and running your first vector database be...

21. [Tutorial: Benchmarking with ClickBench](https://cedardb.com/docs/cookbook/clickbench/) - ClickBench is a popular benchmark for analytical database systems maintained by ClickHouse. ClickBen...

