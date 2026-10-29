# Database migrations (Supabase)

Schema changes live as SQL files in `supabase/migrations/` (one file per change, never edited after it has been applied). They are applied with `supabase db push` as a release step, so nobody has to paste SQL into the Supabase dashboard. **Step-by-step release instructions for staging and production: [release-runbook.md](release-runbook.md).**

This is the same idea as own-crm's `prisma migrate deploy`: the database records which migration files it has applied (table `supabase_migrations.schema_migrations`), and each run applies only the new ones. The difference: it runs as a release step before the new containers start, not inside the API at start-up (an API restart must never change the schema, and the API image does not hold the database password). Because migrations land just before the new code starts, they must stay backward compatible with the running code.

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

Follow [release-runbook.md](release-runbook.md): build images → check paused campaigns → **Database - Migrate** (`status`, then `apply`) → deploy images with the AWS CLI → verify.

Optional automation in the repo: the **Deploy via AWS SSM** workflow (select staging or production) runs the same migration (with the paused-campaign check) as their first job and only deploy if it succeeds. Use them instead of the manual AWS CLI step if you prefer; production needs the production deploy secrets listed in the runbook.

## 4. Local development

Use the same command with your own development project's connection string:

```bash
pnpm exec supabase migration list --db-url "<connection string>"
pnpm exec supabase db push --db-url "<connection string>"
```

`pnpm db:migrate` still pushes to the CLI-linked project in `supabase/config.toml`, which is **not** the staging or production project. Prefer `--db-url` so the target is explicit.
