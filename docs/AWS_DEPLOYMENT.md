# AWS Deployment Guide

This guide is for the AWS DevOps engineer deploying AI Receptionist to production.

Repository:

```txt
https://github.com/Recrui8/ai-receptionist
```

Before using this document, complete the production credential and provider setup in:

```txt
docs/setup.md
```

That document covers Supabase setup, Google OAuth setup, and collection of the environment values referenced below.

## Deployment Order

For this repository, deploy in the following order:

1. Complete `docs/setup.md`.
2. Deploy the backend first.
3. Verify the backend health endpoint and public API domain.
4. Confirm the backend callback URLs and widget base URL are final.
5. Build and deploy the frontend with the final backend HTTPS URL.
6. Run the smoke tests.

Backend-first deployment is recommended because:

- the frontend build embeds `VITE_EXPRESS_SERVER_URL` and `VITE_WIDGET_BASE_URL`
- the widget loader is served by the backend
- Google Calendar backend callbacks depend on the final API domain
- the frontend should not be built against a temporary or incorrect backend URL

## AWS Services Used

This deployment guide uses the following AWS services:

- Route 53 for DNS
- ACM for TLS certificates
- S3 and CloudFront, or AWS Amplify Hosting, for the frontend
- ECR for storing the backend container image
- ECS Fargate for running the backend container
- Application Load Balancer for public HTTPS ingress and WebSocket support
- Secrets Manager or SSM Parameter Store for backend secrets
- CloudWatch Logs for backend logs

## Simplicity Assessment

This AWS design is reasonable and production-capable, but it is not the simplest possible deployment.

It is simple enough for an AWS-based production deployment because:

- the frontend is static
- the backend is a single containerized service
- ALB supports the required WebSocket traffic
- Supabase remains the managed Auth and Postgres layer

However, it is still a moderate-complexity setup because it requires:

- DNS and TLS configuration
- container image build and push
- ECS task and service setup
- ALB listener and target group configuration
- frontend hosting configuration
- secret management across services

If the requirement is to stay on AWS, this is a sensible approach.
If the requirement is the absolute easiest deployment regardless of vendor, platforms such as Railway or Render would generally be simpler than ECS + ALB.

## Current Production Shape

The app has two deployable parts:

- Frontend: React/Vite SPA in `client/`
- Backend: Express + WebSocket server in `server/`

The backend serves:

- REST API under `/api/*`
- Live voice WebSocket at `/api/chat/live`
- Embeddable website widget at `/widget/loader.js` and `/widget/:botId`
- Health check at `/health`

The project is AWS-compatible with the recommended AWS layout below. The current application still depends on Supabase for Auth, Postgres, and authenticated dashboard access protected by RLS. Anonymous widget and hosted-chat traffic goes through Express. Moving Supabase fully into AWS means a separate migration project to RDS/Postgres plus Cognito or a custom auth layer.

## Recommended AWS Architecture

Use:

- Route 53 for DNS
- ACM for TLS certificates
- CloudFront + S3, or AWS Amplify Hosting, for the frontend
- ECR for the backend container image
- ECS Fargate behind an Application Load Balancer for the backend
- AWS Secrets Manager or SSM Parameter Store for secrets
- CloudWatch Logs for backend logs

Use two production domains:

- `https://app.yourdomain.com` for the frontend
- `https://api.yourdomain.com` for the backend

ECS Fargate + ALB is recommended because the app needs WebSocket support for live voice. Configure the ALB idle timeout high enough for voice sessions, for example 300 seconds.

## Frontend Deployment

Build from `client/`.

Required build environment variables:

```txt
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_EXPRESS_SERVER_URL=https://api.yourdomain.com
VITE_WIDGET_BASE_URL=https://api.yourdomain.com
```

Build commands:

```bash
cd client
npm ci
npm run build
```

Deploy the generated `client/dist/` directory to S3 + CloudFront or Amplify Hosting.

For S3 + CloudFront, configure SPA fallback:

- 403 response -> `/index.html`, status 200
- 404 response -> `/index.html`, status 200

This is required so routes like `/dashboard`, `/agents/:id/install`, and `/chats/:subdomain` work after refresh.

## Backend Deployment

Use the Dockerfile at `server/Dockerfile`.

Build and push image:

```bash
aws ecr create-repository --repository-name ai-receptionist-server

aws ecr get-login-password --region YOUR_REGION \
  | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com

docker build -t ai-receptionist-server ./server
docker tag ai-receptionist-server:latest YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/ai-receptionist-server:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/ai-receptionist-server:latest
```

ECS task settings:

- Container port: `4000`
- Health check path: `/health`
- Protocol: HTTP from ALB to target
- Public listener: HTTPS 443 on `api.yourdomain.com`
- CPU/memory: start with `0.5 vCPU / 1 GB`, increase if live voice traffic grows
- Desired tasks: 1 until Gemini concurrency and rate-limit coordination use a shared store. Running multiple tasks currently multiplies those in-memory limits.

Required backend environment variables:

```txt
PORT=4000
CLIENT_URL=https://app.yourdomain.com
EXPRESS_SERVER_URL=https://api.yourdomain.com
WIDGET_BASE_URL=https://api.yourdomain.com

ALLOW_ALL_WIDGET_DOMAINS=false
WIDGET_RATE_LIMIT_PER_MINUTE=120
CHAT_RATE_LIMIT_PER_MINUTE=60
LIVE_VOICE_RATE_LIMIT_PER_MINUTE=20

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

GEMINI_API_KEY=...
GROQ_API_KEY=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/calendar/callback/google

MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=https://api.yourdomain.com/api/calendar/callback/outlook
```

Store secrets such as `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`, and `MICROSOFT_CLIENT_SECRET` in Secrets Manager or SSM Parameter Store. Do not bake them into the image.

`ALLOW_ALL_WIDGET_DOMAINS` must stay `false` in production. It exists only as an emergency/debug escape hatch.

## DNS And TLS

Create ACM certificates for:

```txt
app.yourdomain.com
api.yourdomain.com
```

Create Route 53 records:

```txt
app.yourdomain.com -> CloudFront distribution or Amplify app
api.yourdomain.com -> ALB DNS name
```

## OAuth Configuration

Google OAuth authorized redirect URI:

```txt
https://api.yourdomain.com/api/calendar/callback/google
```

Microsoft OAuth redirect URI:

```txt
https://api.yourdomain.com/api/calendar/callback/outlook
```

Supabase Auth configuration:

- Site URL: `https://app.yourdomain.com`
- Redirect URLs should include:

```txt
https://app.yourdomain.com
https://app.yourdomain.com/auth
```

Add development URLs only in non-production projects.

## Supabase Database

Apply migrations from:

```txt
server/supabase/migrations/
```

The app expects these tables and policies to exist:

- `bots`
- `chat_sessions`
- `messages`
- `leads`
- `calendar_connections`
- `appointments`

Important: the frontend uses the Supabase publishable key and RLS policies for logged-in dashboard reads/writes. Anonymous chat sessions and messages are created through Express. The backend uses the service role key for trusted operations.

Supabase Edge Functions under `server/supabase/functions/` are not the primary production path when the Express backend is deployed. The current frontend and widget call the Express API through `VITE_EXPRESS_SERVER_URL`.

## Widget Installation

In production, the install page should generate:

```html
<script src="https://api.yourdomain.com/widget/loader.js" data-bot-id="BOT_ID"></script>
```

Allowed domains are configured per agent in the dashboard. Use hostnames only:

```txt
customerwebsite.com
www.customerwebsite.com
app.yourdomain.com
```

Do not use `localhost` in production agent settings.

The backend accepts domain-only values and compares by hostname, so `customerwebsite.com` and `https://customerwebsite.com` both authorize the same host.

The widget loader JavaScript is public, but the iframe HTML, chat APIs, and live voice WebSocket validate browser `Origin` / `Referer` headers against the agent's allowed domains, the backend runtime origin, and `CLIENT_URL`. Public requests are also rate-limited by IP.

## Smoke Test Checklist

After deploy:

1. Open `https://api.yourdomain.com/health`.
2. Open `https://app.yourdomain.com`.
3. Sign in.
4. Create or open an agent.
5. Add allowed domains for `app.yourdomain.com` and the test customer website.
6. Copy the widget script from the install page.
7. Inject it into a test page on an allowed domain.
8. Confirm the chat bubble appears.
9. Send a text message and confirm a lead appears in the dashboard.
10. Click the microphone button and confirm WebSocket voice connects.
11. Connect Google Calendar and confirm OAuth returns to the app.
12. Ask the agent for appointment slots and verify it checks availability before booking.

## AWS Compatibility Notes

- The backend binds to `PORT`, so it works with ECS, Elastic Beanstalk, or other AWS runtimes.
- Live voice requires WebSocket support. Prefer ECS Fargate behind ALB.
- The widget must be served from the backend API domain, not the frontend domain.
- The frontend must be built with the production API URL because Vite embeds `VITE_*` values at build time.
- Keep frontend and backend on HTTPS. Browser microphone access and OAuth flows will not be reliable over plain HTTP.
- If replacing Supabase with AWS-native services, plan a separate migration for Auth, Postgres schema/RLS, storage of refresh tokens, and frontend data access patterns.
