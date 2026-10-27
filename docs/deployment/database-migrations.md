# Database migrations (Supabase)

Schema changes live as SQL files in `supabase/migrations/` (one file per change, never edited after it has been applied). **They are applied automatically by the deploy workflows**, so nobody has to paste SQL into the Supabase dashboard.

This is the same idea as own-crm's `prisma migrate deploy`: the database records which migration files it has applied (table `supabase_migrations.schema_migrations`), and each run applies only the new ones. The difference: it runs as the first job of the deploy workflow, before the containers restart, not inside the API at start-up (an API restart must never change the schema, and the API image does not hold the database password).

```text
STAGING / PRODUCTION - Deploy via AWS SSM
  job 1  migrate   paused-campaign check → migration list → dry run → db push → migration list
  job 2  deploy    (only if job 1 succeeded) update image tags on the host → docker-compose up
```

If a migration fails, the deploy does not happen and the running version keeps serving. Because migrations run just before the new code starts, they must stay backward compatible with the code that is still running (add tables/columns; never rename or drop in the same release).

---

## 1. One-time setup (per environment)

1. In Supabase, open the project → **Connect** → **Session pooler** → copy the connection string and put the database password in it.
2. In GitHub → **Settings → Environments**:
   - `staging` → add secret `SUPABASE_DB_URL` = the staging connection string.
   - `production` → add secret `SUPABASE_DB_URL` = the production connection string, and under **Deployment protection rules** tick **Required reviewers** (so every production apply needs a click from you).

## 2. One-time baseline check (important)

If earlier migrations were applied by pasting SQL into the dashboard, the database does not know they were applied. The first `apply` would then try to run all of them again, and fail on the first one that already exists.

1. Run the workflow with **action = status** for the environment.
2. Look at the table in the log:
   - Every older file shows a value in both **Local** and **Remote** columns → nothing to do.
   - Older files show **Local** only (Remote empty) but their tables already exist in the database → mark them as applied **without running them**, from your machine:

     ```bash
     # repeat for every timestamp that already exists in the database
     pnpm exec supabase migration repair --status applied <timestamp> --db-url "<connection string>"
     ```

     The timestamp is the number at the start of the file name, e.g. `20261027120000` for `20261027120000_admin_auth.sql`; legacy files use `001`, `002`, `003`, `004`.
3. Run **status** again until only the genuinely new files are pending.

Only do this once per environment. After that, never apply SQL by hand again.

## 3. Every release

1. Merge to `staging`.
2. **STAGING - Build project**, then **STAGING - Build and Push Docker Images** for the commit (unchanged).
3. **STAGING - Deploy via AWS SSM** for the commit. It applies pending migrations first, then deploys. Leave **Allow paused campaigns to resume** unticked; if the run stops on paused campaigns, agree it with the campaign owners and re-run with the box ticked.
4. After staging is verified: **PRODUCTION - Build and Push Docker Images**, then **PRODUCTION - Deploy via AWS SSM** for the same commit (dispatch both from `staging`; the production environment asks for approval).

**Database - Migrate** can still be run by hand: `status` to see what is pending (read-only), or `apply` to migrate without deploying.

Production deploy prerequisites (once): the `production` GitHub environment needs `EC2_INSTANCE_ID` (the production instance), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `DOCKER_USERNAME` and `SUPABASE_DB_URL`, and the production host must have the repo files at `/home/ec2-user/ai-receptionist` with `docker-compose-prod.yml` and its `.env` (`IMAGE_TAG_SERVER` / `IMAGE_TAG_CLIENT` lines), the same layout the staging host uses.

Migrations are written to be additive (new tables/columns, `IF NOT EXISTS`). If one needs to remove or rewrite data, its PR says so and is deployed separately.

## 4. Local development

Use the same command with your own development project's connection string:

```bash
pnpm exec supabase migration list --db-url "<connection string>"
pnpm exec supabase db push --db-url "<connection string>"
```

`pnpm db:migrate` still pushes to the CLI-linked project in `supabase/config.toml`, which is **not** the staging or production project. Prefer `--db-url` so the target is explicit.
