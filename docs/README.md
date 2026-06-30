# Deployment Documentation

This is the entry point for deploying AI Receptionist + its phone-calls feature to production.
Two separate EC2 instances are deployed: one for Dograh (the phone-calls voice engine), one for
this app (the dashboard, widget, and API). Go through these documents **in order** - each step
depends on values collected in the previous one.

| # | Document | What it does |
|---|---|---|
| 1 | [`Call/dograh-docker/Dograh_DEPLOYMENT_GUIDE.md`](../Call/dograh-docker/Dograh_DEPLOYMENT_GUIDE.md) | Deploys Dograh itself on its own EC2 instance. |
| 2 | [`01_CONFIGURE_DOGRAH.md`](01_CONFIGURE_DOGRAH.md) | Configures the Dograh UI: the speech-to-speech model and the Plivo telephony connection. |
| 3 | [`setup.md`](setup.md) | Creates the Supabase project, Google OAuth client, and collects every credential the app needs. |
| 4 | [`AWS_DEPLOYMENT.md`](AWS_DEPLOYMENT.md) | Deploys AI Receptionist itself on its own EC2 instance, using the credentials from step 3. |
| 5 | [`05_VERIFY.md`](05_VERIFY.md) | End-to-end smoke test - confirms the whole thing actually works before calling it done. |

Skip step 1 and 2 entirely if this deployment doesn't include phone calls - everything else
works standalone.

## Why this order

Dograh has to exist and be reachable before AI Receptionist's `.env` can reference it
(`DOGRAH_API_URL`). Supabase has to exist before AI Receptionist's containers can start at all -
the backend refuses to boot without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (see
`server/src/config.ts`). So: Dograh first, then credentials, then AI Receptionist itself.

## What you end up with

Three things running, on three different hosts:

```
EC2 #1  Dograh           http(s)://<dograh-domain-or-ip>:8000
EC2 #2  AI Receptionist  https://app.yourdomain.com   (dashboard + widget host pages)
                         https://api.yourdomain.com   (API, widget loader, live voice WS,
                                                        the endpoints Dograh calls back into)
Supabase (managed)       Auth + Postgres for both the dashboard and the phone-calls tables
```

Both EC2 deployments use the same pattern: one instance, Docker installed, `docker compose up
-d`. No load balancer, no container registry, no orchestration platform. If that ever needs to
change (multi-instance scaling, blue/green deploys), that's a deliberate follow-up - not
something to reach for by default.

## A note on credentials

Some values referenced in step 2 (Plivo Auth ID, Auth Token, App ID, phone number) are live
production secrets. They are **not** written into any file in this repository. Get them from
Yash directly over a secure channel (1Password, Slack DM, etc.) and paste them straight into the
Dograh UI - never into a `.md` file, `.env.example`, or a commit.
