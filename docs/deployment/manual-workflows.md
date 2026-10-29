# Manual build and deployment

All manual workflows support the GitHub **Use workflow from** branch selector. Choose
the source branch there, then choose **environment: staging or production** in the form.
There is no longer a requirement to dispatch from the staging branch.

1. Run **Build project** for the selected branch and environment.
2. Run **Build and push Docker images** for the same branch, environment and commit.
3. Copy the full resolved commit SHA from its run summary.
4. Run **Deploy via AWS SSM**, selecting the same branch and environment and pasting
   that SHA into **commit_sha**. This prevents a new branch commit from changing the
   revision between image building and deployment.

The optional SHA must be a full 40-character commit SHA belonging to the selected
branch. Leaving it empty uses the branch tip at checkout time. Deployment resolves
it once and uses that exact commit for migrations and image tags. Images must have
already been built for that environment and commit.

| Environment | Image tag suffix | Client Dockerfile | Host Compose file | Site URL variable |
|---|---|---|---|---|
| staging | staging-<sha7> | apps/web/Dockerfile.staging | docker-compose-staging.yml | STAGING_SITE_URL |
| production | prod-<sha7> | apps/web/Dockerfile.prod | docker-compose-prod.yml | PRODUCTION_SITE_URL |

The unified image workflow retains the filename `docker-image-staging.yml`; it now
supports both environments. Separate production workflows have been removed.

GitHub environment secrets retain their existing names: `DOCKER_USERNAME`,
`DOCKER_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
`EC2_INSTANCE_ID`, and `SUPABASE_DB_URL`. Keep staging and production values in
their respective GitHub environments. Build verification uses the selected
environment's existing browser-public `VITE_*` variables.

Existing production environment review rules and permitted deployment branches
still apply. If those GitHub settings restrict branches, update them deliberately
to allow the source branches you intend to deploy; workflow edits do not bypass them.

Deployment applies pending database migrations before restarting containers and
retains the paused-campaign confirmation. Deploys are serialized per environment.
It pulls images before restarting and waits for SSM execution and running-container
checks to succeed. This is not an application-level health check. Host deployment
directory and DockerHub password secret remain unchanged.

**Database - Migrate (Supabase)** also supports branch selection, environment and
an optional SHA. Its default `status` action is read-only; `apply` runs migrations.

These workflow changes take effect after they are committed and available on the
branch selected in GitHub Actions. No workflow is dispatched by editing these files.
