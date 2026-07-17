# Trump Card

> Charge the pile. Hold the Senior seat. Sweep all 52 — or it's a draw.

A custom strategic 4-player card game with full online multiplayer, bots, replays, and statistics.

**Live at [https://trumpcard.online](https://trumpcard.online)**

---

## Features

- Single-player with Easy / Normal / Hard bots and a 60-second turn timer
- Online multiplayer with room codes, friend invites, and spectator mode
- Reconnect — drop mid-match and your seat is held; rejoin with your full hand restored
- Guest mode — play instantly with no account; upgrade later and keep your history
- Match replays — every match is recorded and replayable move-for-move
- Statistics — win rates, average collection size, favorite trump suit, match duration
- Accessibility — color-blind deck, reduced motion, larger text, keyboard support

---

## Running Locally (Docker)

Requires **Docker**.

```bash
cd infra/docker
docker compose up --build
```

- Game: `http://localhost`
- API health: `http://localhost/api/health`

---

## Running Tests

```bash
cd services/trump_card
npm test                # unit tests — banking + engine logic (no server needed)
npm run test:rooms      # integration — requires server running on :3001
npm run test:social     # integration — requires server running on :3001
```

---

## Infrastructure

Deployed to **AWS EC2** (eu-north-1, Stockholm) across two instances:

| Instance | Purpose | Stack |
|---|---|---|
| App server | Game backend + frontend | Node.js, nginx, SQLite |
| Monitoring server | Observability | Prometheus, Grafana, node-exporter |

- **Terraform** provisions EC2 instances, security groups, and Elastic IPs — [details](docs/aws-infrastructure.md)
- **Ansible** installs Docker and deploys containers from `ghcr.io` — [details](docs/ansible-deployment.md)
- **GitHub Actions** runs tests, builds images, scans for CVEs, and auto-deploys on every push to `main`
- **Prometheus + Grafana** monitor app metrics and EC2 OS metrics across both instances — [details](docs/monitoring.md)

---

## Documentation

- [Game Rules](docs/game-rules.md) — full rules, Senior seat, collections, KHOTI
- [Backend](docs/backend.md) — API reference, database schema, environment variables
- [Multiplayer](docs/multiplayer.md) — room architecture, socket events, reconnect, guest mode
- [AWS Infrastructure](docs/aws-infrastructure.md) — Terraform, EC2, Elastic IP
- [Ansible Deployment](docs/ansible-deployment.md) — Docker deployment, playbooks
- [Monitoring](docs/monitoring.md) — Prometheus, Grafana, metrics

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Node.js + Express + Socket.io |
| Database | SQLite via `node:sqlite` |
| Auth | JWT + bcryptjs |
| Containers | Docker + Docker Compose |
| CI/CD | GitHub Actions → Ansible → EC2 |
| Monitoring | Prometheus + Grafana |
| Infrastructure | Terraform + AWS EC2 |