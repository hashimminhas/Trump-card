# Deployment (Ansible)

Once [Terraform](aws-infrastructure.md) has provisioned the EC2 instance,
Ansible configures it and deploys the app — installing Docker and running
the containers, without ever touching the AWS resources themselves.

---

## What the playbook does

1. Installs Docker Engine from Docker's official apt repository (not a
   piped shell script) — idempotent, so re-running the playbook is a safe
   no-op if nothing changed.
2. Adds the `ubuntu` user to the `docker` group.
3. Copies `infra/docker/docker-compose.prod.yml` to the server.
4. Writes a `.env` file containing the JWT secret (permissions locked to
   the owner only, and never printed to the console via Ansible's own
   `no_log`).
5. Pulls the pre-built, pre-tested, pre-scanned images from `ghcr.io` —
   the server never sees or needs the application source code.
6. Starts the app with `docker compose up -d`.
7. Actually waits for and checks the backend's `/api/health` endpoint and
   the frontend's root page, instead of declaring success the moment the
   containers start.

Since the container images are public on `ghcr.io`, no registry login step
is needed — one less credential to manage on the server.

---

## Running it

Ansible does not run on native Windows — it needs a real Linux environment.
On Windows, that means WSL:

```bash
# inside WSL (Ubuntu)
cd ansible
cp inventory.ini.example inventory.ini
# edit inventory.ini with the real IP from:
#   terraform output -raw instance_public_ip   (run from infra/terraform, on Windows)

ansible-playbook -i inventory.ini playbook.yml \
  --extra-vars "ec_jwt_secret=YOUR_REAL_SECRET"
```

Check `PLAY RECAP` at the end — `failed=0` is the bar, not just "it printed
something."

## Verifying a deploy actually worked

Don't trust the recap alone — confirm from outside the box:

```bash
curl http://<server-ip>/api/health
ssh -i ~/.ssh/trump-card-aws ubuntu@<server-ip> "docker ps"
```

Both containers should show `Up`, ideally `healthy`.

## Real issues hit and fixed while building this

- **Ansible cannot run on native Windows PowerShell** — it depends on
  Unix-only OS features and crashes on startup (`WinError 1: Incorrect
  function`). WSL is required as the control machine.
- **`--extra-vars` needs `key=value`**, not a bare value — an easy typo
  that fails silently with a confusing error otherwise.
- **SSH private keys must live inside WSL's own filesystem**, not on the
  Windows-mounted `/mnt/c/` drive — SSH strictly checks file permissions,
  and Windows-mounted files can't represent them correctly.
- **`ansible.cfg` gets silently ignored** if the project folder is under
  `/mnt/c/...` (WSL treats NTFS mounts as world-writable). Use an
  environment variable (`ANSIBLE_HOST_KEY_CHECKING=False`) instead of
  relying on the config file for anything security-relevant in that setup.
- **A container can serve real traffic correctly while Docker reports it
  `unhealthy`** — our frontend's healthcheck used `wget http://localhost/`
  *inside* the container, which tried IPv6 (`::1`) first and got
  `Connection refused` since nginx only bound IPv4. Fixed by pointing the
  healthcheck at `127.0.0.1` explicitly, sidestepping hostname resolution
  entirely.