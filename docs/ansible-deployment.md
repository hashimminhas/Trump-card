# Ansible Deployment

Ansible configures both EC2 instances and keeps them in sync — installing Docker, copying config files, and running containers from pre-built images on `ghcr.io`.

---

## Two Playbooks

| Playbook | Target | Purpose |
|---|---|---|
| `ansible/playbook.yml` | App server (`13.50.114.92`) | Deploys api + web containers |
| `ansible/playbook-monitoring.yml` | Monitoring server (`13.50.245.101`) | Deploys Prometheus + Grafana + node-exporter |

---

## What the app playbook does

1. Installs Docker Engine from Docker's official apt repository (idempotent — safe to re-run)
2. Adds the `ubuntu` user to the `docker` group
3. Copies `infra/docker/docker-compose.prod.yml` and `infra/docker/prometheus.yml` to the server
4. Writes a `.env` file with secrets (locked to owner only, never printed to console)
5. Pulls pre-built images from `ghcr.io` — the server never needs the source code
6. Starts containers with `docker compose up -d`
7. Waits for the backend `/api/health` endpoint and frontend to confirm they're up

---

## CI/CD — automatic deployment

Every push to `main` triggers the full pipeline:

```
git push → main
  → tests pass (147 checks)
  → backend image built + pushed to ghcr.io
  → frontend image built + pushed to ghcr.io
  → Trivy security scan
  → Ansible SSHes into app server
  → docker compose pull + up -d
  → health checks pass
  → live at https://trumpcard.online (~3 minutes)
```

The monitoring server is deployed manually (see below) since it doesn't change with every code push.

---

## Running manually from local (WSL)

Ansible does not run on Windows PowerShell — use WSL:

```bash
# Inside WSL
cd "/mnt/c/Users/YourName/Desktop/Trump card"

# Set up inventory
cp ansible/inventory.ini.example ansible/inventory.ini
# Edit inventory.ini with real IPs

# Deploy app server
ansible-playbook -i ansible/inventory.ini ansible/playbook.yml \
  --extra-vars "ec_jwt_secret=YOUR_SECRET"

# Deploy monitoring server
ansible-playbook -i ansible/inventory.ini ansible/playbook-monitoring.yml \
  --extra-vars "gf_admin_password=YOUR_PASSWORD"
```

---

## Inventory file structure

```ini
[trump_card]
13.50.114.92 ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/trump-card-aws ansible_ssh_common_args='-o StrictHostKeyChecking=no'

[monitoring]
13.50.245.101 ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/trump-card-aws ansible_ssh_common_args='-o StrictHostKeyChecking=no'
```

---

## Verifying a deploy

```bash
# Check containers are running
ssh -i ~/.ssh/trump-card-aws ubuntu@13.50.114.92 "docker ps"

# Check app is responding
curl https://trumpcard.online/api/health

# Check monitoring
curl http://13.50.245.101:3000   # Grafana
curl http://13.50.245.101:9090   # Prometheus
```

---

## Known issues and fixes

- **Ansible won't run on Windows PowerShell** — use WSL (Ubuntu)
- **SSH keys on `/mnt/c/` fail permission checks** — copy the key inside WSL's own filesystem if needed
- **`ansible.cfg` is ignored on NTFS mounts** — use `ANSIBLE_HOST_KEY_CHECKING=False` env var instead
- **After adding HTTPS**, the frontend health check must use `follow_redirects: none` and accept `status_code: [301]` — HTTP now redirects to HTTPS