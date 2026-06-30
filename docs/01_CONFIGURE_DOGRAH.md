# Configure Dograh

Do this after `Call/dograh-docker/Dograh_DEPLOYMENT_GUIDE.md` - Dograh needs to actually be
running first. Open `http://<DOGRAH_PUBLIC_IP>:38080` and log in with the
`DOGRAH_EMAIL`/`DOGRAH_PASSWORD` you set in Dograh's `.env`.

These are organization-wide settings - set once, used by every bot's phone workflows.

## 1. Speech-to-speech model (Models tab)

Go to **Models** in the left sidebar. Three tabs appear at the top: *Speech to Speech*,
*Dograh*, *BYOK*. Stay on **Speech to Speech** - this app uses a single realtime model for the
live conversation (no separate transcriber/voice stage), which is what keeps phone-call latency
low.

Under **Realtime Model**:

| Field | Value |
|---|---|
| Provider | `Google Realtime` |
| Model | `gemini-3.1-flash-live-preview` |
| Voice | `Puck` |
| Language | `en` |
| API Key | the project's `GEMINI_API_KEY` (same key used in `server/.env`) |

Switch to the **LLM** tab (next to *Realtime Model* / *Embedding*) and set a model too -
realtime mode still runs a separate LLM pass for variable extraction (pulling the caller's name/
email/etc. out of the conversation) and QA scoring. This deployment uses:

| Field | Value |
|---|---|
| Provider | `Groq` |
| Model | `llama-3.3-70b-versatile` |
| API Key | the project's `GROQ_API_KEY` |

Save. These are exactly the values this app's workflows were built and tested against (see
`server/src/modules/phone-calls/dograhClient.ts` and the model-configurations API it calls) - if
you use a different model, expect to re-verify call quality before relying on it.

## 2. Telephony (Telephony tab)

Go to **Telephony** in the left sidebar → **Add Provider** → **Plivo**.

You need four values: **Auth ID**, **Auth Token**, **App ID**, and the phone number. These are
live production credentials for the business's actual phone line - **do not put them in this
file, a commit, or anywhere in the repository.** Get them from Yash over a secure channel
(1Password, Slack DM) and paste them directly into the form fields below.

| Field | Where it goes |
|---|---|
| Auth ID | Plivo provider form |
| Auth Token | Plivo provider form |
| App ID | Plivo provider form (leave blank to have Dograh auto-create one on save, or paste the existing one if continuing from an existing Plivo setup) |
| Phone number | Imported automatically once the provider saves successfully - shows up under that provider's numbers list |

Save. Dograh will report whether it could sync with Plivo (`provider_sync: { ok: true }` in the
API, or a clear error in the UI if the credentials are wrong).

### Why nothing gets assigned yet

A phone number only gets bound to an inbound workflow when a bot is provisioned from inside AI
Receptionist itself (the **Provision phone agent** / **Assign number** buttons on a bot's Calls
tab - see `client/src/modules/phone-calls/PhoneAgentPanel.tsx`). There's nothing more to do here
in the Dograh UI for that part; it happens automatically once `docs/AWS_DEPLOYMENT.md` is done
and you provision a bot through the app.

## 3. What AI Receptionist needs from this step

Two things carry forward into `server/.env` on the AI Receptionist EC2 instance (see
`docs/AWS_DEPLOYMENT.md`):

```txt
DOGRAH_API_URL=http://<DOGRAH_PUBLIC_IP>:8000
DOGRAH_EMAIL=<the login you used above>
DOGRAH_PASSWORD=<the login you used above>
```

If Plivo rejects inbound call webhooks (a `"... parameter is not valid"` error when placing a
call, or calls failing with "currently busy" before ever reaching the app) and Dograh's own
`Dograh_DEPLOYMENT_GUIDE.md` only sets it up over plain HTTP, put Dograh behind its own HTTPS
domain too - some telephony providers validate that webhook URLs are reachable over HTTPS before
accepting a call. The same Caddy pattern used for AI Receptionist in
`docs/AWS_DEPLOYMENT.md` works here too.
