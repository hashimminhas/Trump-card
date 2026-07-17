# Monitoring

Trump Card's observability stack runs on a dedicated EC2 instance (`13.50.245.101`) separate from the app server, so monitoring tools don't compete for RAM with the game.

---

## Stack

| Tool | Purpose | URL |
|---|---|---|
| Prometheus | Scrapes and stores metrics | `http://13.50.245.101:9090` |
| Grafana | Dashboard and visualization | `http://13.50.245.101:3000` |
| node-exporter | EC2 OS-level metrics (CPU, RAM, disk, network) | Internal only |

---

## What gets monitored

**App metrics (from `/api/metrics`):**

| Metric | Description |
|---|---|
| `trump_card_active_sockets` | Live WebSocket connections |
| `trump_card_games_started_total` | Total matches started |
| `trump_card_api_requests_total` | API requests by route, method, status |
| `trump_card_api_request_duration_seconds` | Request latency histogram |
| `trump_card_nodejs_heap_size_used_bytes` | Node.js heap memory |
| `trump_card_nodejs_eventloop_lag_seconds` | Event loop lag |
| `trump_card_process_cpu_seconds_total` | Process CPU usage |
| `trump_card_nodejs_gc_duration_seconds` | Garbage collection duration |

**EC2 OS metrics (from node-exporter):**

| Metric | Description |
|---|---|
| `node_cpu_seconds_total` | EC2 CPU utilization |
| `node_memory_MemAvailable_bytes` | Available RAM |
| `node_filesystem_avail_bytes` | Disk space |
| `node_network_receive_bytes_total` | Network traffic in |

---

## Architecture

```
App server (13.50.114.92)
  └── Node.js backend exposes /api/metrics (Prometheus text format)

Monitoring server (13.50.245.101)
  ├── Prometheus scrapes app server :3001/api/metrics every 15s
  ├── Prometheus scrapes node-exporter :9100 every 15s (local OS metrics)
  └── Grafana reads from Prometheus and renders dashboards
```

---

## Prometheus config (`infra/docker/prometheus.yml`)

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'trump-card'
    static_configs:
      - targets: ['13.50.114.92:3001']
    metrics_path: '/api/metrics'

  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
```

---

## Grafana dashboard panels

14 panels covering app and infrastructure:

**App:** Active connections, API requests, Games started, Heap memory, API latency (p95), CPU usage, Event loop lag, Active handles, GC duration, Open file descriptors

**EC2:** CPU %, RAM used, Disk used %, Network traffic

---

## Deploying the monitoring stack

```bash
# From WSL
ansible-playbook -i ansible/inventory.ini ansible/playbook-monitoring.yml \
  --extra-vars "gf_admin_password=YOUR_PASSWORD"
```

Grafana login: `admin` / your `GF_ADMIN_PASSWORD` secret.

---

## Why two instances?

A `t3.micro` has 1GB RAM. Running api + web + prometheus + grafana + node-exporter on one instance causes CPU throttling and OOM kills. Splitting the monitoring stack to its own instance keeps the game responsive and the dashboard accurate.