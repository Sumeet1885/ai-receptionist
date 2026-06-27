# AI Receptionist Production Setup Runbook

## Purpose

This document is the deployment setup runbook for the DevOps engineer responsible for deploying `Recrui8/ai-receptionist`.

Repository:

```txt
https://github.com/Recrui8/ai-receptionist
```

This document is intentionally focused on production configuration and credential collection. It does not explain product workflow or local developer onboarding unless a local step is required to complete deployment.

Use this document for:

- creating or verifying the Supabase project
- collecting Supabase credentials
- configuring Google OAuth correctly
- collecting Google credentials
- preparing frontend build variables
- preparing backend runtime variables
- handing the correct values into the AWS deployment process

For AWS infrastructure and runtime deployment details, use:

```txt
docs/AWS_DEPLOYMENT.md
```

## Deployment Order

Perform the deployment setup in this order:

1. Clone the GitHub repository.
2. Create or confirm the target Supabase project.
3. Collect the Supabase URL and keys.
4. Configure Supabase Auth URL settings.
5. Configure Google sign-in inside Supabase.
6. Configure the Google OAuth consent screen and OAuth web client in Google Cloud.
7. Collect the Gemini API key.
8. Prepare the frontend and backend production environment values.
9. Apply the Supabase migrations.
10. Hand the values into the AWS deployment described in `docs/AWS_DEPLOYMENT.md`.
11. Run the post-deployment smoke test.

## 1. Clone the Repository

```bash
git clone https://github.com/Recrui8/ai-receptionist.git
cd ai-receptionist
```

Install dependencies:

```bash
npm run install:all
```

## 2. Confirm the Production Architecture

This repository currently deploys as:

- frontend static build from `client/`
- backend Node/Express server from `server/`
- Supabase for Auth and Postgres
- Google OAuth for sign-in and calendar connection

The current codebase is not designed to deploy without Supabase Auth. The schema and RLS policies depend on:

- `auth.users`
- `auth.uid()`

The DevOps task is therefore to deploy the application around Supabase, not to replace Supabase during deployment.

## 3. Create or Confirm the Supabase Project

### Step 3.1: Open Supabase

Open the Supabase dashboard and either:

- create a new project for this deployment, or
- confirm the existing production project that will back this application

### Step 3.2: Record the Project Reference

From the repository, note that `server/supabase/config.toml` currently contains:

```txt
project_id = "gatzlksagxpdqqonssfq"
```

If the deployment is intended to use that existing Supabase project, confirm that the dashboard project reference matches it.

If a new Supabase project is being used, update the deployment values accordingly and make sure migrations are applied to the new project.

## 4. Collect Supabase Credentials

### Step 4.1: Get the Supabase Project URL

In Supabase Dashboard:

1. Open the target project.
2. Go to `Project Settings`.
3. Open `API`.
4. Copy `Project URL`.

This value becomes:

```txt
VITE_SUPABASE_URL
SUPABASE_URL
```

### Step 4.2: Get the Supabase Publishable Key

In the same `Project Settings > API` page:

1. Locate the project API keys section.
2. Copy the `publishable` key.

This value becomes:

```txt
VITE_SUPABASE_PUBLISHABLE_KEY
```

### Step 4.3: Get the Supabase Service Role Key

In the same `Project Settings > API` page:

1. Locate the `service_role` key.
2. Copy it carefully.
3. Store it in the secret manager used for backend runtime configuration.

This value becomes:

```txt
SUPABASE_SERVICE_ROLE_KEY
```

Important:

- this key must never be placed in frontend build variables
- this key must never be exposed to the browser
- this key belongs only in backend runtime secrets

## 5. Configure Supabase Authentication URLs

The frontend uses Supabase Auth for sign-in and sign-up. The redirect settings must be configured before OAuth sign-in will work correctly.

In Supabase Dashboard:

1. Open the target project.
2. Go to `Authentication`.
3. Open `URL Configuration`.
4. Set `Site URL`.
5. Add the required `Redirect URLs`.

### Required Production Values

Set:

```txt
Site URL = https://app.yourdomain.com
```

Add these redirect URLs:

```txt
https://app.yourdomain.com
https://app.yourdomain.com/auth
```

If staging is used, add the exact staging frontend URL as well.

Do not leave the production project pointed at `localhost`.

## 6. Configure Google Sign-In in Supabase

The application uses Google sign-in through Supabase Auth.

In Supabase Dashboard:

1. Open the target project.
2. Go to `Authentication`.
3. Open `Providers`.
4. Open `Google`.
5. Turn on `Enable Sign in with Google`.
6. Do not save yet unless the Google client credentials are already available.

You will return to this page after creating the OAuth client in Google Cloud.

### Record the Supabase Callback URL

On the same Supabase Google provider page:

1. Find `Callback URL (for OAuth)`.
2. Copy that URL exactly.

For the currently linked project, the callback shown is:

```txt
https://gatzlksagxpdqqonssfq.supabase.co/auth/v1/callback
```

This value must be added to the Google OAuth web client as an authorized redirect URI.

## 7. Configure the Google OAuth Consent Screen

The application requests Google Calendar scopes. That means the Google OAuth consent screen must be configured correctly before production use.

In Google Cloud Console:

1. Open the correct Google Cloud project.
2. Open `Google Auth Platform`.
3. If the auth platform is not configured yet, click `Get Started`.

Then complete these sections:

### Step 7.1: Branding

Enter:

- App name
- User support email

Click `Next`.

### Step 7.2: Audience

Choose the app audience.

For public SaaS use, this is typically:

- `External`

Click `Next`.

### Step 7.3: Contact Information

Enter the contact email address that Google should use for notices about the OAuth app.

Click `Next`.

### Step 7.4: Finish

1. Review the Google API Services User Data Policy.
2. Confirm acceptance.
3. Click `Continue`.
4. Click `Create`.

### Step 7.5: Add Test Users if the App Is Still in Testing

If the app is not yet published:

1. Open `Audience`.
2. Under `Test users`, click `Add users`.
3. Add the internal email addresses that need sign-in access during testing.

### Step 7.6: Configure Data Access

Open:

```txt
Google Auth Platform > Data Access
```

Then:

1. Click `Add or Remove Scopes`.
2. Add only the scopes required by the application.

For this repository, the code requests:

```txt
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.readonly
```

Important:

- the calendar scopes are sensitive scopes
- sensitive scopes may require Google verification before broad public production use

## 8. Create the Google OAuth Web Client

The same Google OAuth web client can be used for:

- Supabase Google sign-in
- backend Google Calendar callback

In Google Cloud Console:

1. Open `Google Auth Platform`.
2. Open `Clients`.
3. Click `Create Client`.
4. Choose `Web application`.
5. Enter a descriptive name, such as:

```txt
AI Receptionist Production Web Client
```

### Step 8.1: Authorized JavaScript Origins

Add the production frontend origin:

```txt
https://app.yourdomain.com
```

If staging is used, add the exact staging frontend origin as well.

### Step 8.2: Authorized Redirect URIs

Add all required redirect URIs:

1. Supabase callback URI
2. Backend Google Calendar callback URI

Use:

```txt
https://gatzlksagxpdqqonssfq.supabase.co/auth/v1/callback
https://api.yourdomain.com/api/calendar/callback/google
```

If staging exists, add the staging backend callback URI too.

### Step 8.3: Save the Credentials

After the client is created:

1. Copy the `Client ID`.
2. Copy the `Client Secret`.
3. Store both securely.

These two values are used in two places:

1. Supabase Google provider settings
2. backend runtime environment variables

## 9. Paste the Google Credentials into Supabase

Return to:

```txt
Supabase Dashboard > Authentication > Providers > Google
```

Then:

1. paste the Google `Client ID`
2. paste the Google `Client Secret`
3. verify that Google sign-in remains enabled
4. click `Save`

### Review the Existing Provider Options

On the current Supabase configuration screen:

- `Allow users without an email` is disabled
- `Skip nonce checks` is enabled

Recommended production position:

- keep `Allow users without an email` disabled
- review `Skip nonce checks` before production sign-off

Unless there is a confirmed compatibility reason, disabling nonce validation is not ideal for a standard web OAuth deployment.

## 10. Get the Gemini API Key

The backend will not start successfully without `GEMINI_API_KEY`.

In Google AI Studio:

1. Open Google AI Studio.
2. Open `Dashboard`.
3. Open `Projects`.
4. Import the Google Cloud project if it is not already visible.
5. Open `API Keys`.
6. Click `Create API key`.
7. Copy the created key.

This value becomes:

```txt
GEMINI_API_KEY
```

Store it as a backend secret.

## 11. Collect All Production Variables

The application uses two groups of deployment variables:

- frontend build variables
- backend runtime variables

The frontend values are injected during the frontend build.
The backend values are supplied to the running container or runtime service.

## 12. Frontend Production Variables

Set these values in the frontend hosting platform or build pipeline.

### Frontend Variables

```txt
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_EXPRESS_SERVER_URL=https://api.yourdomain.com
VITE_WIDGET_BASE_URL=https://api.yourdomain.com
```

### Where Each Frontend Variable Comes From

`VITE_SUPABASE_URL`

- source: `Supabase Dashboard > Project Settings > API > Project URL`

`VITE_SUPABASE_PUBLISHABLE_KEY`

- source: `Supabase Dashboard > Project Settings > API > publishable key`

`VITE_EXPRESS_SERVER_URL`

- value: the public HTTPS base URL of the deployed backend API
- typical production value: `https://api.yourdomain.com`

`VITE_WIDGET_BASE_URL`

- value: the public HTTPS base URL that will serve `/widget/loader.js`
- typical production value: `https://api.yourdomain.com`

Important:

- `VITE_WIDGET_BASE_URL` must point to the deployed backend, not the frontend site
- the widget script is served by the backend

## 13. Backend Production Variables

Set these values in the backend runtime secret store and task definition.

### Backend Variables

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
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GROQ_API_KEY=YOUR_GROQ_API_KEY

GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/calendar/callback/google

MICROSOFT_CLIENT_ID=YOUR_MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET=YOUR_MICROSOFT_CLIENT_SECRET
MICROSOFT_REDIRECT_URI=https://api.yourdomain.com/api/calendar/callback/outlook
```

### Where Each Backend Variable Comes From

`CLIENT_URL`

- value: public frontend URL

`EXPRESS_SERVER_URL`

- value: public backend API URL

`WIDGET_BASE_URL`

- value: public backend API URL

`SUPABASE_URL`

- source: `Supabase Dashboard > Project Settings > API > Project URL`

`SUPABASE_SERVICE_ROLE_KEY`

- source: `Supabase Dashboard > Project Settings > API > service_role key`

`GEMINI_API_KEY`

- source: `Google AI Studio > Dashboard > API Keys`

`GROQ_API_KEY`

- source: Groq console, if lead analysis is enabled in production

`GOOGLE_CLIENT_ID`

- source: `Google Cloud Console > Google Auth Platform > Clients > selected web client`

`GOOGLE_CLIENT_SECRET`

- source: `Google Cloud Console > Google Auth Platform > Clients > selected web client`

`GOOGLE_REDIRECT_URI`

- value: backend production callback URL
- required exact value:

```txt
https://api.yourdomain.com/api/calendar/callback/google
```

`MICROSOFT_*`

- source: Microsoft Entra / Azure app registration if Outlook integration is enabled

Important:

- keep `ALLOW_ALL_WIDGET_DOMAINS=false`
- do not publish backend secrets into frontend build settings
- do not use `http://` values in production

## 14. Apply Supabase Migrations

The production database must receive the schema in `server/supabase/migrations/`.

### Recommended CLI Method

From the repository:

```bash
cd server
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:migrate
```

If the project is already linked correctly, verify the target before applying migrations.

### Alternative Manual Method

If the organization does not allow Supabase CLI deployment:

1. open `server/supabase/migrations/`
2. execute the SQL files in order through the Supabase SQL Editor

Do not skip later hardening migrations.

## 15. Prepare the AWS Deployment

Once all credentials are collected and the Supabase project is ready, hand off to the AWS deployment process in:

```txt
docs/AWS_DEPLOYMENT.md
```

That file covers:

- frontend hosting
- backend container image
- ECS / Fargate deployment
- Application Load Balancer setup
- DNS and TLS
- production environment injection
- deployment smoke testing

## 16. Production Readiness Warnings

### Google Verification

Because the application requests Google Calendar scopes, Google may require additional OAuth verification before unrestricted public production use.

Ensure the following exist before asking for verification:

- correct app name and branding
- support email
- public home page
- privacy policy URL
- terms of service URL if applicable
- authorized domains verified in Google Search Console

### WebSocket Support

This application uses live voice over WebSockets.

The backend must be deployed behind infrastructure that supports WebSockets. The AWS deployment guide already recommends Application Load Balancer with ECS Fargate, which is appropriate for this repository.

## 17. Final Pre-Deploy Checklist

Before the first production deploy, confirm all of the following:

1. the GitHub repository has been cloned successfully
2. the target Supabase project has been chosen
3. `Project URL`, `publishable key`, and `service_role key` have been collected
4. Supabase `Site URL` is set to the production frontend URL
5. Supabase redirect URLs include the production frontend URLs
6. the Supabase Google callback URL has been copied into the Google OAuth client
7. the backend Google callback URL has been added to the Google OAuth client
8. the Google `Client ID` and `Client Secret` have been pasted into the Supabase Google provider
9. the Gemini API key has been created and stored
10. the frontend build variables have been prepared
11. the backend runtime secrets have been prepared
12. the Supabase migrations have been applied
13. the AWS deployment values match the same domains and callback URIs

## 18. Handoff Summary

The DevOps engineer should leave this setup phase with:

- one configured Supabase project
- one configured Google OAuth web client
- one Gemini API key
- a complete frontend production variable set
- a complete backend production variable set
- a migrated database
- a deployment-ready handoff into `docs/AWS_DEPLOYMENT.md`
