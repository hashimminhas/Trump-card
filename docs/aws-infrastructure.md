# AWS Infrastructure

Trump Card runs on two dedicated AWS EC2 instances in `eu-north-1` (Stockholm), both provisioned with Terraform.

**Live at [https://trumpcard.online](https://trumpcard.online)**

---

## Two-Instance Architecture

| Instance | IP | Purpose |
|---|---|---|
| App server | `13.50.114.92` | api + web (nginx) |
| Monitoring server | `13.50.245.101` | Prometheus + Grafana + node-exporter |

Separating the monitoring stack from the application prevents observability tools from competing for RAM with the game — a `t3.micro` has 1GB RAM and running all 5 containers on one instance causes CPU throttling.

---

## What Terraform provisions

| Resource | Purpose |
|---|---|
| `aws_instance` | `t3.micro` running Ubuntu 24.04 |
| `aws_security_group` | Firewall rules per instance |
| `aws_eip` | Elastic (static) IP — survives stop/start |
| `aws_key_pair` | SSH public key — no password auth |
| `data.aws_ami` | Looks up current Ubuntu 24.04 AMI dynamically |

Terraform provisions infrastructure only. Docker and the app are handled by [Ansible](ansible-deployment.md).

---

## Security Groups

**App server:**

| Port | Purpose |
|---|---|
| 22 | SSH |
| 80 | HTTP (redirects to HTTPS) |
| 443 | HTTPS |
| 3001 | Backend API (direct access for Prometheus scraping) |

**Monitoring server:**

| Port | Purpose |
|---|---|
| 22 | SSH |
| 3000 | Grafana UI |
| 9090 | Prometheus |

---

## Running Terraform

```bash
cd infra/terraform
terraform init
terraform plan      # always read before apply
terraform apply
terraform output -raw instance_public_ip
```

Destroy when not in use to avoid charges:
```bash
terraform destroy
```

---

## Elastic IP

Both instances use Elastic IPs so the domain DNS records stay stable across reboots. Without a static IP, the public IP changes every time the instance stops.

`trumpcard.online` A record → `13.50.114.92`

---

## Cost

`t3.micro` in `eu-north-1` costs roughly **$0.012/hour** (~$9/month per instance). Two instances = ~$18/month. The project currently runs on AWS credits.

---

## Design decisions

- **SSH is open to `0.0.0.0/0`** — key-based auth protects the server. For stricter setups, restrict to your IP via `var.my_ip_cidr`.
- **State is local** — S3 backend adds overhead for a single-developer project. Worth adding for team environments.
- **Secrets never touch the repo** — AWS credentials live in `aws configure`, SSH key stays on disk only, `terraform.tfvars` is git-ignored.