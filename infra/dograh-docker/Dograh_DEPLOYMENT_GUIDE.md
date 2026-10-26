# Dograh Deployment Guide — AWS EC2

Simple step-by-step guide to deploy Dograh on AWS EC2.

---

## Step 1: Prepare Dograh Project Locally

Get the dograh-docker folder with all source files ready on your machine.

---

## Step 2: Create AWS Security Group

1. AWS Console → EC2 → Security Groups
2. Click **Create security group**
3. Name: `dograh-sg`
4. Add inbound rules:
   - SSH (22) — 0.0.0.0/0
   - HTTP (80) — 0.0.0.0/0
   - HTTPS (443) — 0.0.0.0/0
   - Custom TCP (8000) — 0.0.0.0/0
   - Custom TCP (38080) — 0.0.0.0/0
   - Custom TCP (9000) — 0.0.0.0/0 — **MinIO** (`MINIO_PUBLIC_ENDPOINT` in Step 7). Easy to
     miss since nothing in this guide calls it out separately, but without it transcripts and
     recordings are unreachable from outside the instance - call ingestion in the AI Receptionist
     app (or any external consumer) fails with a connect timeout on every single call, even
     though the call itself completes fine on the Dograh side.

     **This security group rule alone is not enough.** The `minio` service in
     `docker-compose.yaml` binds its port to `127.0.0.1` explicitly:

     ```yaml
     ports:
       - "127.0.0.1:9000:9000"  # <- blocks ALL external traffic, security group or not
       - "127.0.0.1:9001:9001"
     ```

     Docker's own port binding is enforced before traffic ever reaches AWS's firewall layer, so
     even a perfectly correct security group does nothing here - it's a different failure mode
     entirely (the security group's silent timeout vs. Docker's own immediate connection
     refusal, both of which look identical from the outside: every call ingests/syncs fine on
     the Dograh UI, but fails everywhere else). Change the first line to `"9000:9000"` (binds
     `0.0.0.0`) and leave `9001` (the admin console - nothing external needs it) on
     `127.0.0.1`. Then `docker compose up -d minio` to apply it. See Step 9 for how to verify
     this actually worked before moving on.

---

## Step 3: Create SSH Key Pair

1. AWS Console → EC2 → Key Pairs
2. Click **Create key pair**
3. Name: `dograh-key`
4. Type: RSA
5. Format: .pem
6. Download and save securely

---

## Step 4: Launch EC2 Instance

1. AWS Console → EC2 → Instances → **Launch instances**
2. Configure:
   - **Name**: `dograh-server`
   - **AMI**: Ubuntu 22.04 LTS (latest)
   - **Instance type**: `m7i-flex.large`
   - **Key pair**: `dograh-key`
   - **Security group**: `dograh-sg`
   - **Storage**: 30 GB gp3
3. Click **Launch instance**
4. Wait for **Running** state
5. Copy **Public IPv4 address**

---

## Step 5: Connect and Install Docker

```bash
ssh -i /path/to/dograh-key.pem ubuntu@<PUBLIC_IP>
```

Install Docker:

```bash
sudo apt-get update -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
exit
```

Reconnect:

```bash
ssh -i /path/to/dograh-key.pem ubuntu@<PUBLIC_IP>
```

Install Docker Compose:

```bash
sudo apt-get install -y docker-compose-plugin
```

---

## Step 6: Upload Dograh

From your local machine:

```bash
scp -i /path/to/dograh-key.pem -r ./dograh-docker ubuntu@<PUBLIC_IP>:~/dograh-docker
```

---

## Step 7: Configure Environment

SSH into instance:

```bash
ssh -i /path/to/dograh-key.pem ubuntu@<PUBLIC_IP>
cd ~/dograh-docker
```

Create `.env`:

```bash
cat > .env <<'EOF'
ENVIRONMENT=remote
POSTGRES_PASSWORD=SecurePass123!
REDIS_PASSWORD=SecurePass123!
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=SecurePass123!
OSS_JWT_SECRET=dograh-jwt-secret-secure-32-chars-min
BACKEND_API_ENDPOINT=http://<PUBLIC_IP>:8000
BACKEND_URL=http://api:8000
MINIO_PUBLIC_ENDPOINT=http://<PUBLIC_IP>:9000
ENABLE_TELEMETRY=true
FASTAPI_WORKERS=2
LOG_LEVEL=INFO
EOF
```

Replace `<PUBLIC_IP>` with actual IP.

---

## Step 8: Start Services

```bash
docker compose up -d
sleep 30
docker compose ps
```

All containers should show **Up (healthy)**.

---

## Step 9: Verify

Test API:

```bash
curl http://localhost:8000/api/v1/health
```

Should return:

```json
{"status":"ok","version":"1.39.0",...}
```

**Also verify MinIO is actually externally reachable, not just running.** This is the step
that's easy to skip because everything above will report healthy either way -
`docker compose ps` shows MinIO as `Up (healthy)` regardless of which interface it's bound to,
and Dograh's own UI/API never need to reach MinIO from outside the Docker network, so calls
will look completely fine from inside Dograh while every external consumer (the AI Receptionist
app, anything else fetching transcripts/recordings) gets connect failures on 100% of calls.

From a machine OUTSIDE the EC2 instance (your laptop, not an SSH session into the box):

```bash
curl http://<PUBLIC_IP>:9000/minio/health/live
```

Should return `200`. If it times out or refuses, check `docker compose ps` for the `minio`
line - it must show `0.0.0.0:9000->9000/tcp`, not `127.0.0.1:9000->9000/tcp`. See the Step 2
note above for the fix.

---

## Access Points

**API**: `http://<PUBLIC_IP>:8000`  
**UI**: `http://<PUBLIC_IP>:38080`  
**MinIO**: `http://<PUBLIC_IP>:9000`

---

Done.
