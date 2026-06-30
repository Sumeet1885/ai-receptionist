# AWS Deployment Guide — AI Receptionist

Simple step-by-step guide to deploy AI Receptionist (dashboard + API + widget) on a single AWS
EC2 instance. Mirrors the exact pattern used for Dograh's own deployment
(`Call/dograh-docker/Dograh_DEPLOYMENT_GUIDE.md`) - one instance, Docker Compose, no ECS/ALB/
CloudFront/Route 53 layer to manage.

**Do this after** `docs/setup.md` - that document creates the Supabase project, the Google OAuth
client, and every credential referenced below. Without those values, the containers in this
guide will start but the app will not actually work (Supabase calls will fail, Google sign-in
will fail).

You need two DNS records pointing at this instance before you start (see Step 2):

```txt
app.yourdomain.com  ->  this instance's IP   (the dashboard, widget host pages)
api.yourdomain.com   ->  this instance's IP   (the API, widget loader, live voice, Dograh callbacks)
```

---

## Step 1: Create AWS Security Group

1. AWS Console → EC2 → Security Groups
2. Click **Create security group**
3. Name: `ai-receptionist-sg`
4. Add inbound rules:
   - SSH (22) — 0.0.0.0/0 (or your office IP only)
   - HTTP (80) — 0.0.0.0/0 (needed for Caddy's automatic HTTPS certificate issuance)
   - HTTPS (443) — 0.0.0.0/0

No other ports need to be open publicly - the API and the static site are both served through
Caddy on 80/443.

---

## Step 2: Create SSH Key Pair

1. AWS Console → EC2 → Key Pairs
2. Click **Create key pair**
3. Name: `ai-receptionist-key`
4. Type: RSA
5. Format: .pem
6. Download and save securely

---

## Step 3: Launch EC2 Instance

1. AWS Console → EC2 → Instances → **Launch instances**
2. Configure:
   - **Name**: `ai-receptionist-server`
   - **AMI**: Ubuntu 22.04 LTS (latest)
   - **Instance type**: `t3.small` is enough to start (the API is one Node process; bump to
     `t3.medium` if live-voice traffic gets heavy)
   - **Key pair**: `ai-receptionist-key`
   - **Security group**: `ai-receptionist-sg`
   - **Storage**: 20 GB gp3
3. Click **Launch instance**
4. Wait for **Running** state
5. Copy the **Public IPv4 address**

Now point `app.yourdomain.com` and `api.yourdomain.com` at this IP (two `A` records, same IP) in
your DNS provider. Caddy (Step 6) won't be able to get TLS certificates until these resolve.

---

## Step 4: Connect and Install Docker

```bash
ssh -i /path/to/ai-receptionist-key.pem ubuntu@<PUBLIC_IP>
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
ssh -i /path/to/ai-receptionist-key.pem ubuntu@<PUBLIC_IP>
```

Install Docker Compose:

```bash
sudo apt-get install -y docker-compose-plugin
```

---

## Step 5: Upload the Repository

From your local machine:

```bash
git clone https://github.com/Recrui8/ai-receptionist.git
scp -i /path/to/ai-receptionist-key.pem -r ./ai-receptionist ubuntu@<PUBLIC_IP>:~/ai-receptionist
```

(Or, if the EC2 instance has its own GitHub access, just `git clone` directly on the instance.)

---

## Step 6: Configure Environment

SSH into the instance:

```bash
ssh -i /path/to/ai-receptionist-key.pem ubuntu@<PUBLIC_IP>
cd ~/ai-receptionist
```

There are **two separate env files** - don't mix them up:

- `.env` (repo root) - only the two domains and the four `VITE_*` build values. Read by `docker
  compose build` to bake the frontend.
- `server/.env` - every backend secret (Supabase, Gemini, Groq, Google OAuth, Dograh, phone
  tools). Read at container *runtime*, not build time.

Create the root `.env`:

```bash
cp .env.example .env
nano .env
```

Fill in (values come from `docs/setup.md`):

```txt
APP_DOMAIN=app.yourdomain.com
API_DOMAIN=api.yourdomain.com

VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_EXPRESS_SERVER_URL=https://api.yourdomain.com
VITE_WIDGET_BASE_URL=https://api.yourdomain.com
```

Create `server/.env`:

```bash
cp server/.env.example server/.env
nano server/.env
```

Fill in every value (see `docs/setup.md` for where each one comes from, and
`docs/01_CONFIGURE_DOGRAH.md` for the Dograh-specific ones):

```txt
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GROQ_API_KEY=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/calendar/callback/google

PORT=4000
CLIENT_URL=https://app.yourdomain.com
EXPRESS_SERVER_URL=https://api.yourdomain.com
WIDGET_BASE_URL=https://api.yourdomain.com

ALLOW_ALL_WIDGET_DOMAINS=false
WIDGET_RATE_LIMIT_PER_MINUTE=120
CHAT_RATE_LIMIT_PER_MINUTE=60
LIVE_VOICE_RATE_LIMIT_PER_MINUTE=20

DOGRAH_API_URL=http://<DOGRAH_PUBLIC_IP>:8000
DOGRAH_EMAIL=...
DOGRAH_PASSWORD=...

PHONE_TOOLS_API_KEY=<generate with: openssl rand -hex 24>
PHONE_TOOLS_CALLBACK_BASE_URL=https://api.yourdomain.com
```

`ALLOW_ALL_WIDGET_DOMAINS` must stay `false` in production - it's a debug escape hatch, not a
production setting.

---

## Step 7: Apply Supabase Migrations

If this wasn't already done in `docs/setup.md`, do it now from the instance (or from your local
machine, before this step - either works, it just has to happen before bots/leads/calls can be
read or written):

```bash
cd ~/ai-receptionist/server
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:migrate
cd ~/ai-receptionist
```

---

## Step 8: Start Services

```bash
docker compose build
docker compose up -d
sleep 15
docker compose ps
```

Both `api` and `web` should show **Up**. Caddy (inside `web`) will automatically request TLS
certificates for `APP_DOMAIN` and `API_DOMAIN` from Let's Encrypt on first request - this takes
a few seconds and only happens once DNS is actually pointed at this instance (Step 3).

Check Caddy got certificates cleanly:

```bash
docker compose logs web | grep -i certificate
```

---

## Step 9: Verify

```bash
curl https://api.yourdomain.com/health
```

Should return:

```json
{"status":"ok","geminiGuard":{...}}
```

Open `https://app.yourdomain.com` in a browser - the dashboard should load over HTTPS with a
valid certificate.

For the full functional checklist (sign-in, widget, live voice, calendar booking, phone calls),
go to `docs/05_VERIFY.md` next.

---

## Access Points

**Dashboard**: `https://app.yourdomain.com`
**API / widget loader / live voice**: `https://api.yourdomain.com`

---

## Updating a deployment

```bash
cd ~/ai-receptionist
git pull
docker compose build
docker compose up -d
```

`server/.env` and the root `.env` are not touched by `git pull` (they're untracked), so this is
safe to repeat any time the code changes.

---

## Why not ECS/ALB/CloudFront/Route 53

That's a perfectly valid AWS-native architecture and was the original design of this document,
but it's a lot of moving parts (container registry, load balancer, CDN distribution, multiple
DNS records, secrets manager wiring) for an app that is, today, one Node process and one static
site. A single EC2 instance with Docker Compose and Caddy for automatic HTTPS gets the same
production outcome - HTTPS, WebSocket support for live voice, restart-on-crash - with one host
to manage instead of five AWS services. Revisit this if traffic genuinely outgrows a single
instance; don't pre-build for that case.
