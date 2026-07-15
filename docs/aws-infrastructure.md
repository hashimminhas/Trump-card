# AWS Infrastructure (Terraform)

Trump Card's backend and frontend run on a real AWS EC2 instance, provisioned
entirely as code with Terraform — not clicked together in the console.

**Live app:** http://13.62.198.38

---

## What Terraform provisions

| Resource | Purpose |
|---|---|
| `aws_instance` | 1x `t3.micro` running Ubuntu 24.04, in `eu-north-1` (Stockholm) |
| `aws_security_group` | Firewall — SSH (22) restricted to one trusted IP, HTTP (80) and HTTPS (443) open |
| `aws_eip` | Static public IP, so it survives instance stop/start |
| `aws_key_pair` | Uploads a local SSH public key for access — no password auth |
| `data.aws_ami` | Looks up the *current* official Ubuntu 24.04 AMI dynamically, instead of a hardcoded ID that would go stale |

Terraform's own job stops there — it provisions infrastructure only. It does
not install Docker or run the app; that's [Ansible's job](ansible-deployment.md).

---

## Design decisions worth noting

- **SSH is not open to the internet.** `0.0.0.0/0` on port 22 gets scanned by
  bots within minutes of going live. The security group only allows SSH from
  one IP (`var.my_ip_cidr`), updated in `terraform.tfvars` whenever it changes.
- **State is local**, not in S3, deliberately. Remote state is worth adding
  later if this becomes a multi-person or multi-machine project; for a single
  developer on one laptop, S3 backend adds a bootstrapping step (the bucket
  must exist before Terraform can use it) for no real benefit yet.
- **Secrets never touch this repo.** AWS credentials live in `aws configure`'s
  local file, the SSH private key stays on-disk only, and `terraform.tfvars`
  (the file with the real IP) is git-ignored — only `terraform.tfvars.example`
  is committed.

---

## Running it

```bash
cd infra/terraform
terraform init
terraform plan     # always read this before apply
terraform apply
```

Destroy everything when not actively using it, to avoid unnecessary spend:
```bash
terraform destroy
```

## Cost

`t3.micro` in `eu-north-1` runs roughly **$0.012–0.013/hour** (~$9/month if
left running 24/7), plus negligible EBS storage cost. This draws against a
new AWS account's standard sign-up credit rather than a separate perpetual
free tier — check current AWS Free Tier terms, as they change.

## Real issues hit and fixed while building this

- AWS Security Group `description` fields reject non-ASCII characters
  (em-dashes included) — caught by `terraform plan`/`apply`, not `validate`.
- A changed home IP silently breaks SSH access (`Connection timed out`, not
  a clear auth error) until `terraform apply` re-applies the updated
  `my_ip_cidr` — worth checking first if SSH suddenly stops connecting.