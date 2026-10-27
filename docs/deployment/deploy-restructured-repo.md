# Deploying the restructured repository to the existing instance

One-time runbook for deploying the `apps/` + `packages/` + Turborepo layout to the **same EC2 instance that already runs the app**, without changing domains, secrets, data, or how users reach the site.

After this first deployment, normal updates work exactly as before.

---

## 1. What changes and what does not

| Item | Changes? | Notes |
| --- | --- | --- |
| Domains, TLS certificates (Caddy volumes) | No | Same `web` container and same volumes |
| URLs: `/`, `/api/*`, `/widget/loader.js`, `/api/chat/live` (voice), Dograh callback URLs, OAuth redirect URIs | No | Same code and same routes |
| Secrets: SSM `/ai-receptionist/<env>/…` and the host's `server/.env` | No | **Keep the host file at `server/.env`.** The Compose files still read `./server/.env` on the host |
| Root `.env` on the host (`APP_DOMAIN`, `API_DOMAIN`, `DOCKER_USERNAME`, `IMAGE_TAG_*`) | Only the image tags | Same variable names |
| `docker-compose-staging.yml` / `docker-compose-prod.yml` | No | Byte-for-byte unchanged |
| Docker Hub repo and tag names (`ai-receptionist-{server,client}-{staging,prod}-<sha7>`) | No | |
| Database / Supabase migrations | No | Nothing to apply |
| Dograh deployment | No | Only its folder in the repo moved (see §8) |
| How images are built | **Yes** | Dockerfiles are now `apps/api/Dockerfile` and `apps/web/Dockerfile.{staging,prod}`, built from the repository root. GitHub Actions already does this. Matters only if your instance builds images itself (setup B below) |

---

## 2. Identify how your instance is set up (2 minutes)

SSH to the instance (or use SSM Session Manager) and run:

```bash
APP_DIR=/home/ec2-user/ai-receptionist     # adjust if yours differs (e.g. /home/ubuntu/ai-receptionist)
cd "$APP_DIR"
ls -1 docker-compose*.yml
grep -nE '^\s*(image|build):' docker-compose*.yml
git rev-parse --is-inside-work-tree 2>/dev/null && git status --short | head
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

| What you see | Your setup | Follow |
| --- | --- | --- |
| Compose services use `image: ${DOCKER_USERNAME}/recrui8-dockerhub-repo-dev:${IMAGE_TAG_…}` and no `build:` lines | **A: prebuilt images** (GitHub Actions builds and pushes; the instance only pulls) | §4–§5 |
| A `docker-compose.yml` with `build: ./server` / `build: ./client` (or `context: ./server`) | **B: builds on the instance** from a git checkout | §6 |

If `git status` shows local modifications on the instance, stop. Find out who made them before pulling anything.

---

## 3. Before deploying (both setups)

### 3.1 Merge first

Both image workflows only run when dispatched from the `staging` branch (`if: github.ref == 'refs/heads/staging'`). GitHub also runs the workflow file **as it exists on `staging`**. Until the restructure PR is merged, `staging` still has the old `-f server/Dockerfile ./server` steps, and building a new-layout commit with them fails.

1. Merge the restructure PR into `staging`.
2. Copy the full merge commit SHA, referred to below as `<SHA>`; `<sha7>` means its first 7 characters.

### 3.2 Check for paused outbound campaigns

Every API restart (every deploy, not only this one) switches campaigns with status `paused` back to `running` and starts dialing (`apps/api/src/index.ts`, `resumeRunningCampaigns`). Run this in the Supabase SQL editor of the environment you are deploying:

```sql
select id, name, bot_id, status, called_count, total_contacts
from call_campaigns
where status in ('paused', 'running')
order by created_at desc;
```

- **No `paused` rows:** continue.
- **`paused` rows exist:** those campaigns **will start calling** after the restart. Agree a time with the campaign owners, or wait until they are completed. Do not edit their status by hand without the owner's consent.

### 3.3 Record what is running now (needed for rollback)

On the instance:

```bash
cd "$APP_DIR"
grep '^IMAGE_TAG_' .env | tee ~/pre-restructure-tags.txt
cp .env ~/.env.pre-restructure
cp server/.env ~/server.env.pre-restructure
chmod 600 ~/.env.pre-restructure ~/server.env.pre-restructure
docker ps --format '{{.Names}} {{.Image}}' | tee -a ~/pre-restructure-tags.txt
```

The backup files contain secrets. Keep them only on the instance and delete them after a successful deploy (§9).

---

## 4. Setup A, staging: deploy with the existing workflows

In GitHub → **Actions**, always choose **Use workflow from: `staging`** and enter `<SHA>`:

1. **STAGING - Build project.** It must pass. It now runs `pnpm install --frozen-lockfile`, typecheck and build for all workspaces, plus the boundary check.
2. **STAGING - Build and Push Docker Images.** It pushes `ai-receptionist-server-staging-<sha7>` and `ai-receptionist-client-staging-<sha7>`, the same names as always.
3. Check §3.2 again (paused campaigns), then run **STAGING - Deploy via AWS SSM**. It updates `IMAGE_TAG_SERVER` / `IMAGE_TAG_CLIENT` in `.env`, runs `docker-compose -f docker-compose-staging.yml up -d`, and fails if a container exits.
4. Verify (§7).

<details>
<summary>Same deploy by hand on the instance (if you prefer not to use the SSM workflow)</summary>

```bash
cd "$APP_DIR"
SHA7=<sha7>
aws secretsmanager get-secret-value --secret-id dockerhub-ai-receptionist-password \
  --query SecretString --output text | docker login -u "$(grep '^DOCKER_USERNAME=' .env | cut -d= -f2)" --password-stdin
sed -i "s/^IMAGE_TAG_SERVER=.*/IMAGE_TAG_SERVER=ai-receptionist-server-staging-$SHA7/" .env
sed -i "s/^IMAGE_TAG_CLIENT=.*/IMAGE_TAG_CLIENT=ai-receptionist-client-staging-$SHA7/" .env
docker-compose -f docker-compose-staging.yml pull
docker-compose -f docker-compose-staging.yml up -d
docker-compose -f docker-compose-staging.yml ps
```
</details>

---

## 5. Setup A, production

There is no production deploy workflow; production has always been deployed by hand.

1. In GitHub → **Actions** → **PRODUCTION - Build and Push Docker Images**, select **Use workflow from: `staging`** and enter `<SHA>`. Use the same SHA that passed staging verification. This pushes `ai-receptionist-server-prod-<sha7>` and `ai-receptionist-client-prod-<sha7>`.
2. Do §3.2 and §3.3 on the production database and host.
3. On the production host:

```bash
cd "$APP_DIR"
SHA7=<sha7>
sed -i "s/^IMAGE_TAG_SERVER=.*/IMAGE_TAG_SERVER=ai-receptionist-server-prod-$SHA7/" .env
sed -i "s/^IMAGE_TAG_CLIENT=.*/IMAGE_TAG_CLIENT=ai-receptionist-client-prod-$SHA7/" .env
docker-compose -f docker-compose-prod.yml pull
docker-compose -f docker-compose-prod.yml up -d
docker-compose -f docker-compose-prod.yml ps
```

(Log in to Docker Hub first, as in §4, if the host is not already logged in.)

4. Verify (§7).

---

## 6. Setup B: the instance builds images from a git checkout

The checkout's `server/` and `client/` folders no longer exist, so the instance's Compose `build:` paths must change once. Untracked files such as `server/.env` and the root `.env` are **not** removed by `git pull`. `server/.env` stays where it is, and that is still the path Compose reads.

```bash
cd "$APP_DIR"
git rev-parse HEAD | tee ~/pre-restructure-commit.txt      # for rollback
COMPOSE=docker-compose.yml                                  # the file found in §2
cp "$COMPOSE" ~/"$COMPOSE".pre-restructure
git fetch origin && git checkout staging && git pull --ff-only
ls -la server/.env                                          # must still exist
```

Edit the `build:` entries in `$COMPOSE`. Leave every other line (`env_file`, `ports`, `volumes`, `environment`, `args`) unchanged:

```yaml
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    # env_file: ./server/.env   ← unchanged

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile        # keep your existing `args:` (VITE_*) block as it is
```

Check §3.2 again, then:

```bash
docker compose -f "$COMPOSE" build
docker compose -f "$COMPOSE" up -d
docker compose -f "$COMPOSE" ps
```

Building `web` runs the Vite build. It needs about the same memory as before.

---

## 7. Verify (5 minutes)

Replace the domains with yours.

```bash
# containers up, none restarting
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'

# API started cleanly
docker logs --tail 50 ai-receptionist-api 2>&1 | grep -E 'Brain API running|SSM|Error' # prod: ai-receptionist-api-prod

# Through Caddy (these paths reach the API)
curl -s -o /dev/null -w 'widget loader: %{http_code}\n' https://APP_DOMAIN/widget/loader.js
curl -s -o /dev/null -w 'SPA:           %{http_code}\n' https://APP_DOMAIN/

# Directly inside the API container (Caddy does NOT proxy /health; a public /health URL returns the SPA page)
docker exec ai-receptionist-api wget -qO- http://127.0.0.1:4000/health   # prod: ai-receptionist-api-prod
```

Expected results: widget loader `200`; SPA `200`; `/health` returns `{"status":"ok",…}`; the log shows `[SSM] ✅ Loaded …` (staging/production) and `AI Receptionist Brain API running on port 4000`.

Then, in a browser:

1. Sign in to the dashboard. The agents, leads, inbox and calls pages load.
2. Open `/chats/<subdomain>` for one agent and send one text message.
3. Start one browser voice session (checks the `/api/chat/live` WebSocket).
4. Load a site that embeds the widget. It opens, and a domain that is not allowed is still refused.
5. Place one inbound test call to a provisioned number. Afterwards a `phone_calls` row appears within the poll interval (default 60 s).

For the full checklist, see [`docs/05_VERIFY.md`](../05_VERIFY.md).

---

## 8. Dograh: only if Dograh runs on this same instance from this checkout

Running Dograh containers are not affected by any of the steps above. The repository folder moved from `Call/dograh-docker/` to `infra/dograh-docker/` **with the same folder name on purpose**, because Docker Compose names the project and its volumes after the folder (`dograh-docker_postgres_data`, …).

Only if you `git pull`ed on a host that runs Dograh from `Call/dograh-docker/`:

```bash
cd "$APP_DIR"
ls -la Call/dograh-docker/                        # untracked leftovers: .env, certs/, scripts/, deploy/ …
cp -a Call/dograh-docker/. infra/dograh-docker/   # copies untracked files; does not touch running containers
cd infra/dograh-docker && docker compose ls       # project name must still be "dograh-docker"
```

Run future Dograh commands from `infra/dograh-docker/`. **Never** run `docker compose down -v` there, because it deletes Dograh's database volume.

---

## 9. Rollback

No database changes were made, so rollback only means running the previous images or code again.

**Setup A:**

```bash
cd "$APP_DIR"
cat ~/pre-restructure-tags.txt                    # previous IMAGE_TAG_SERVER / IMAGE_TAG_CLIENT
sed -i "s/^IMAGE_TAG_SERVER=.*/IMAGE_TAG_SERVER=<previous server tag>/" .env
sed -i "s/^IMAGE_TAG_CLIENT=.*/IMAGE_TAG_CLIENT=<previous client tag>/" .env
docker-compose -f docker-compose-staging.yml pull   # prod: docker-compose-prod.yml
docker-compose -f docker-compose-staging.yml up -d
```

The deploy workflow prunes old local images, so `pull` fetches the previous tags from Docker Hub again.

**Setup B:**

```bash
cd "$APP_DIR"
git checkout "$(cat ~/pre-restructure-commit.txt)"
cp ~/"$COMPOSE".pre-restructure "$COMPOSE"
docker compose -f "$COMPOSE" build && docker compose -f "$COMPOSE" up -d
```

The paused-campaign warning in §3.2 applies to rollbacks too, because a rollback is also a restart.

**After a successful deploy**, remove the secret backups:

```bash
shred -u ~/.env.pre-restructure ~/server.env.pre-restructure
```

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Image workflow fails with `server/Dockerfile` or `./server` not found | Workflow was dispatched before the PR was merged into `staging` | Merge first (§3.1), then dispatch from `staging` |
| Image workflow: `pnpm install --frozen-lockfile` error | A workspace `package.json` changed without updating the root `pnpm-lock.yaml` | Run `pnpm install` at the repo root locally and commit the lockfile |
| `api` container restarts; log says `Missing required environment variable` | Host `server/.env` missing or moved | It must stay at `$APP_DIR/server/.env`; restore it from the backup in §3.3 |
| Dashboard loads but API calls fail | `api` not running or crashed | `docker logs ai-receptionist-api`; check `/health` from inside the container (§7) |
| Public `https://…/health` returns HTML | Expected: Caddy serves the SPA for paths other than `/api/*` and `/widget/*` | Use the in-container check in §7 |
| Dograh database looks empty after a move | Compose ran from a folder with a different name, so a new project with new volumes was created | Run from `infra/dograh-docker/` (exact name) and confirm `docker compose ls` shows `dograh-docker`; the old volumes are still there |
