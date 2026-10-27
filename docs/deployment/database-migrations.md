# Database migrations (Supabase)

Schema changes live as SQL files in `supabase/migrations/` (one file per change, never edited after it has been applied). The **Database - Migrate (Supabase)** GitHub workflow applies them, so nobody has to paste SQL into the Supabase dashboard.

This is the same idea as own-crm's `prisma migrate deploy`: the database records which migration files it has applied (table `supabase_migrations.schema_migrations`), and each run applies only the new ones. The difference: here it is a separate workflow you run **before** deploying, not something the API does when it starts (an API restart must never change the schema).

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
     npx supabase migration repair --status applied <timestamp> --db-url "<connection string>"
     ```

     The timestamp is the number at the start of the file name, e.g. `20261027120000` for `20261027120000_staff_auth.sql`; legacy files use `001`, `002`, `003`, `004`.
3. Run **status** again until only the genuinely new files are pending.

Only do this once per environment. After that, never apply SQL by hand again.

## 3. Every release

1. Merge to `staging`.
2. **Database - Migrate**: environment `staging`, action `status` → check which files are pending.
3. Same workflow, action `apply`. It shows a dry run, applies, then lists the result.
4. Deploy images as usual (`docs/deployment/deploy-restructured-repo.md`).
5. Repeat 2–4 for `production` after staging is verified.

Migrations are written to be additive (new tables/columns, `IF NOT EXISTS`). If one needs to remove or rewrite data, its PR says so and is deployed separately.

## 4. Local development

Use the same command with your own development project's connection string:

```bash
npx supabase migration list --db-url "<connection string>"
npx supabase db push --db-url "<connection string>"
```

`npm run db:migrate` still pushes to the CLI-linked project in `supabase/config.toml`, which is **not** the staging or production project. Prefer `--db-url` so the target is explicit.
