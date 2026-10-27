# Release runbook: database migrations and image deploy (staging and production)

**For:** whoever releases ai-receptionist. Images are built by GitHub Actions; the EC2 host is updated with the AWS CLI.
**Rule of thumb:** build images → check paused campaigns → apply database migrations → deploy images → verify. Do staging first; production only after staging is verified, with the **same commit**.

Related: [database-migrations.md](database-migrations.md) (how migrations work, one-time baseline), [deploy-restructured-repo.md](deploy-restructured-repo.md) (host layout, Dograh, detailed troubleshooting).

---

## 0. Values used below

| | Staging | Production |
| --- | --- | --- |
| GitHub environment | `staging` | `production` |
| Supabase project | `lckiehhthevtykulfbvw` | `xdwcrsydlzprtldkwqzh` |
| Image build workflow | STAGING - Build and Push Docker Images | PRODUCTION - Build and Push Docker Images |
| Image tags | `ai-receptionist-server-staging-<sha7>`, `ai-receptionist-client-staging-<sha7>` | `ai-receptionist-server-prod-<sha7>`, `ai-receptionist-client-prod-<sha7>` |
| Compose file on host | `docker-compose-staging.yml` | `docker-compose-prod.yml` |
| API container | `ai-receptionist-api` | `ai-receptionist-api-prod` |
| Host folder | `/home/ec2-user/ai-receptionist` | `/home/ec2-user/ai-receptionist` |

`<sha>` is the full merge commit on `staging`; `<sha7>` its first 7 characters. Confirm the project refs with the team before the first run; the CLI-linked project in `supabase/config.toml` (`gatzlksagxpdqqonssfq`) is neither of these.

---

## 1. One-time setup

### 1.1 Database connection secret (both environments)

1. Supabase dashboard → the environment's project → **Connect** → **Session pooler** → copy the URI and put the database password in it:
   `postgresql://postgres.<project-ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
2. GitHub → **Settings → Environments → `staging`** → add secret **`SUPABASE_DB_URL`**. Repeat for **`production`**.
3. **`production`** environment → **Deployment protection rules** → tick **Required reviewers** (every production migration then needs an approval click).

Do not put this URL in any `.env` committed to git, in the API's `server/.env`, or in chat.

### 1.2 Baseline the migration history (once per database)

If earlier migrations were pasted into the dashboard by hand, the database does not know they ran, and the first automatic run would try to run them again.

1. GitHub → Actions → **Database - Migrate (Supabase)** → *Use workflow from* `staging` → environment, action **`status`**, commit `<sha>`.
2. In the log table, every file that shows **Local** but not **Remote**, and whose tables already exist in the database, must be marked as applied (this records it; it does **not** run it). From a terminal with Node 20+:

   ```bash
   export SUPABASE_DB_URL='postgresql://...'      # PowerShell: $env:SUPABASE_DB_URL = '...'
   npx supabase@2.106.0 migration repair --status applied \
     001 002 003 004 20260616132045 20260617115219 20260618120000 20260618121000 \
     20260626120000 20260626130000 20260627140000 20260630120000 20260716000000 \
     20260716100000 20260720120000 20260723120000 20261008120000 \
     --db-url "$SUPABASE_DB_URL"
   ```

   List only the versions the status table showed as missing. Never include a file whose tables do **not** exist yet.
3. Run **status** again: only genuinely new files may be pending.

### 1.3 Tools for the AWS CLI deploy

AWS CLI v2 with permission for `ssm:SendCommand` / `ssm:GetCommandInvocation` on the instance, and the instance ID of each environment.

---

## 2. Every release: staging

### Step 1. Build images (GitHub)

Actions → **STAGING - Build project** (must pass) → **STAGING - Build and Push Docker Images**, both with *Use workflow from* `staging` and commit `<sha>`.

### Step 2. Check for paused outbound campaigns

Every API restart switches `paused` campaigns back to `running` and starts dialing real numbers. In the Supabase SQL editor of the staging project:

```sql
select id, name, bot_id, status, called_count, total_contacts
from call_campaigns
where status in ('paused', 'running')
order by created_at desc;
```

- No `paused` rows → continue.
- `paused` rows → agree a time with the campaign owners before Step 4. Do not change their status by hand.

### Step 3. Apply database migrations

Pick **one** of the two ways; both run the same `supabase db push`, which applies only files the database has not recorded and never drops data.

**A. GitHub (recommended)**: Actions → **Database - Migrate (Supabase)** → *Use workflow from* `staging` → environment `staging`, commit `<sha>`:

1. action **`status`** → read which files are pending.
2. action **`apply`** → it prints a dry run, applies, then the final table.

**B. Terminal**:

```bash
git checkout <sha>
export SUPABASE_DB_URL='postgresql://...staging...'
npx supabase@2.106.0 migration list --db-url "$SUPABASE_DB_URL"
npx supabase@2.106.0 db push --db-url "$SUPABASE_DB_URL" --dry-run   # must list only the expected new files
npx supabase@2.106.0 db push --db-url "$SUPABASE_DB_URL"
npx supabase@2.106.0 migration list --db-url "$SUPABASE_DB_URL"       # every file now Local + Remote
```

If a migration fails: **stop, do not deploy**. The running version keeps working (migrations are additive). Send the log to the developers.

If there are no pending migrations, Step 3 is a no-op; run it anyway, it is how you find out.

### Step 4. Deploy images (AWS CLI)

```bash
SHA7=<sha7>
INSTANCE_ID=<staging instance id>

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "ai-receptionist staging $SHA7" \
  --parameters commands="[
    \"set -e\",
    \"cd /home/ec2-user/ai-receptionist\",
    \"grep '^IMAGE_TAG_' .env | tee -a ~/release-history.txt\",
    \"sed -i 's/^IMAGE_TAG_SERVER=.*/IMAGE_TAG_SERVER=ai-receptionist-server-staging-$SHA7/' .env\",
    \"sed -i 's/^IMAGE_TAG_CLIENT=.*/IMAGE_TAG_CLIENT=ai-receptionist-client-staging-$SHA7/' .env\",
    \"docker-compose -f docker-compose-staging.yml pull\",
    \"docker-compose -f docker-compose-staging.yml up -d\",
    \"sleep 30\",
    \"docker-compose -f docker-compose-staging.yml ps\",
    \"if docker-compose -f docker-compose-staging.yml ps | grep -q Exit; then echo DEPLOY_FAILED; exit 1; fi\",
    \"echo DEPLOY_OK\"
  ]" \
  --query Command.CommandId --output text)

aws ssm wait command-executed --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" || true
aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}'
```

Log in to Docker Hub on the host first if it is not already logged in (see `deploy-restructured-repo.md` §4). The first command appends the previous image tags to `~/release-history.txt` on the host, which is what you roll back to.

### Step 5. Verify (5 minutes)

```bash
curl -s -o /dev/null -w 'SPA %{http_code}\n'           https://<staging domain>/
curl -s -o /dev/null -w 'widget %{http_code}\n'        https://<staging domain>/widget/loader.js
```

On the host: `docker exec ai-receptionist-api wget -qO- http://127.0.0.1:4000/health` → `{"status":"ok",…}`, and `docker logs --tail 50 ai-receptionist-api` shows `AI Receptionist Brain API running on port 4000` with no errors.

In a browser: sign in, open dashboard / leads / calls; submit the **Get started** form once (a new request appears in the admin console).

---

## 3. Every release: production

Same steps, production values, **same `<sha>`** that passed staging:

1. **PRODUCTION - Build and Push Docker Images** (*Use workflow from* `staging`, commit `<sha>`).
2. Paused-campaign query in the **production** Supabase project.
3. **Database - Migrate** with environment **`production`**: `status`, then `apply` (approve when GitHub asks). Or the terminal commands with the production `SUPABASE_DB_URL`.
4. AWS CLI deploy with the production instance ID, `docker-compose-prod.yml` and the `-prod-` tags:

   ```bash
   \"sed -i 's/^IMAGE_TAG_SERVER=.*/IMAGE_TAG_SERVER=ai-receptionist-server-prod-$SHA7/' .env\",
   \"sed -i 's/^IMAGE_TAG_CLIENT=.*/IMAGE_TAG_CLIENT=ai-receptionist-client-prod-$SHA7/' .env\",
   \"docker-compose -f docker-compose-prod.yml pull\",
   \"docker-compose -f docker-compose-prod.yml up -d\",
   ```

5. Verify with `ai-receptionist-api-prod` and the production domain.

---

## 4. Rollback

- **Images**: run Step 4 again with the previous tags from `~/release-history.txt` on the host. Also a restart, so the paused-campaign check applies.
- **Database**: migrations are forward-only and additive, so the previous image keeps working on the newer schema; nothing to undo. If a migration ever has to be reverted, the developers write a new migration for it. Never delete rows from `supabase_migrations.schema_migrations` by hand.

---

## 5. Rules for developers writing migrations

Migrations are applied just **before** the new images start, while the old version is still serving. So every migration must work with both the old and the new code:

- add tables, columns (nullable or with a default), indexes, functions: fine;
- rename or drop a column/table that running code uses: never in the same release; add the new one, ship code that uses it, drop the old one in a later release;
- one change per file, named `YYYYMMDDHHMMSS_description.sql` (`npx supabase@2.106.0 migration new <description>`), never edited after it has run anywhere;
- the PR says "contains a migration" and what it does.

---

## 6. This release (gated access + admin console): one-off items

In addition to the steps above, the first release of branch `feat/admin-auth` needs:

| Where | Action |
| --- | --- |
| Migrations | `20261027120000_admin_auth`, `20261027130000_access_requests`, `20261027140000_customer_accounts`, `20261028120000_billing`, `20261028130000_paid_signup` (Step 3). `customer_accounts` adds a row for every existing login so current customers keep working; `billing` creates plans, coupons and orders and seeds the four launch plans; `paid_signup` adds the checkout password hash and abandoned-checkout fields. |
| Host `server/.env` (both) | `EMAIL_FROM`, `EMAIL_FROM_NAME`, `ADMIN_NOTIFICATION_EMAILS`, `AUTH_LINK_EXPIRY_HOURS`, `RAZORPAY_KEY_ID`, and `ADMIN_ORIGIN=https://<app domain>` (the same origin as `CLIENT_URL`, because the admin console is served at `/super-admin/` on the app domain). See `apps/api/.env.example`. |
| SSM `/ai-receptionist/<env>/` | `TURNSTILE_SECRET_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (live keys in production, test keys in staging). |
| Razorpay dashboard | Webhook `https://<api domain>/api/public/razorpay/webhook`, events `payment.captured` and `order.paid`, secret = `RAZORPAY_WEBHOOK_SECRET`. Enable International Payments if USD prices are offered. |
| Web Dockerfiles | `VITE_TURNSTILE_SITE_KEY` for that environment's domain in `apps/web/Dockerfile.staging` / `.prod`. |
| AWS | SES: verified sending domain, production access, `ses:SendEmail` on the EC2 instance role. |
| Supabase Auth (both) | Turn off "Allow new users to sign up"; disable the Google and Azure providers. |
| First admin (after Step 3) | `pnpm --filter @ai-receptionist/api admin:create --email … --name … --role super_admin --confirm-project <project-ref>` from a machine whose `apps/api/.env` points at that project. Prints a one-time password. |

The admin console ships inside the web image and is served by the same Caddy at **`https://<app domain>/super-admin/`**: no extra container, port, DNS record or compose change. Its API calls go to `/api/admin/*` through the existing `/api/*` proxy (including the live-update WebSocket). After deploying, open `/super-admin/` and sign in with the account from `admin:create`.
