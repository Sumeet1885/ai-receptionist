# Post-Deployment Verification

Run through this after `docs/AWS_DEPLOYMENT.md` is done. Don't call the deployment finished
until every item here passes.

## Core app

1. Open `https://api.yourdomain.com/health` — returns `{"status":"ok",...}`.
2. Open `https://app.yourdomain.com` — loads over HTTPS with a valid certificate (no browser
   warning).
3. Sign in (Google sign-in via Supabase Auth).
4. Create or open a bot/agent.
5. Add allowed domains for `app.yourdomain.com` and a test customer site.
6. Copy the widget script from the install page, inject it into a page on an allowed domain.
7. Confirm the chat bubble appears and a text message produces a lead in the dashboard.
8. Click the microphone button, confirm the live-voice WebSocket connects and the agent
   responds (this is the thing that breaks first if Caddy/anything in front of the API doesn't
   support WebSocket upgrades correctly).
9. Connect Google Calendar from the dashboard and confirm OAuth returns successfully to the app.
10. Ask the agent (web voice) for appointment slots and confirm it checks availability before
    offering to book.

## Phone calls (Dograh)

Only run this section if Dograh was deployed (`docs/01_CONFIGURE_DOGRAH.md`).

11. On a bot's **Calls** tab, click **Provision phone agent**. Confirm it succeeds (this also
    creates the `check_availability`/`book_appointment`/`get_call_time_remaining` tools on the
    Dograh side - if `PHONE_TOOLS_API_KEY`/`PHONE_TOOLS_CALLBACK_BASE_URL` are wrong, this step
    still "succeeds" but the tools silently won't work later - so don't skip step 14).
12. Assign a phone number to the bot.
13. Call the assigned number from an external phone. Confirm the agent answers and stays
    on-topic.
14. If a calendar is connected, ask the agent to book an appointment during the call. Confirm it
    checks availability, books a real slot, and the booking appears in the dashboard afterward
    under that bot's leads/appointments. This is the step that actually proves Dograh can reach
    back into this server (`PHONE_TOOLS_CALLBACK_BASE_URL` correct, security group allows it,
    `PHONE_TOOLS_API_KEY` matches).
15. Place an outbound call from the **Calls** tab's "Call a number" field. Confirm it rings and
    the agent introduces itself correctly.
16. Stay on a call past 4.5 minutes. Confirm the agent gives a spoken warning and wraps up
    gracefully rather than the call silently dropping at 5 minutes.

## If something fails

- **Live voice WebSocket won't connect**: check that Caddy is actually proxying (not just
  serving static files) on `API_DOMAIN` — `docker compose logs web`.
- **Phone calls don't ring at all / "currently busy"**: the Plivo Application's `answer_url` is
  probably pointing at a stale or unreachable Dograh URL. Re-run "Assign number" for the
  affected bot to force Dograh to resync it, and confirm Dograh's own public URL
  (`DOGRAH_API_URL`) is actually reachable from the public internet, not just from this
  instance.
- **Calendar tools silently don't work during a call but check_availability/book_appointment
  exist in the Dograh UI**: `PHONE_TOOLS_CALLBACK_BASE_URL` likely doesn't match this instance's
  real public domain, or the security group is blocking inbound traffic on 443 from Dograh's
  IP. Test directly: `curl -X POST https://api.yourdomain.com/api/phone-tools/<botId>/check-availability -H "X-API-Key: <PHONE_TOOLS_API_KEY>" -H "Content-Type: application/json" -d '{"date":"2026-01-01"}'` from your own machine - if that fails, fix it before blaming Dograh.
- **Google sign-in fails**: double check the Supabase callback URL is in the Google OAuth
  client's authorized redirect URIs, and that `https://app.yourdomain.com` is in Supabase Auth's
  redirect URL allowlist (`docs/setup.md`, step 5).
- **Calls show as "Unknown caller / FAILED" with no transcript, leads/emails never appear even
  though the call itself worked fine on the phone**: check this server's logs for
  `Failed to ingest Dograh run N: ... fetch failed` pointing at port `9000` - that's Dograh's
  MinIO storage. Two independent things both have to be right before transcripts/recordings are
  reachable from outside the Dograh EC2 instance, and either one alone being wrong produces the
  exact same symptom:
  1. The EC2 **security group** needs a `Custom TCP 9000` inbound rule (see
     `Call/dograh-docker/Dograh_DEPLOYMENT_GUIDE.md`, Step 2).
  2. The `minio` service in `docker-compose.yaml` needs to actually publish that port to all
     interfaces - `docker compose ps` should show `0.0.0.0:9000->9000/tcp`, not
     `127.0.0.1:9000->9000/tcp`. A correct security group does nothing if Docker itself never
     lets the traffic past localhost (see the Step 2 note in the same guide for the fix).

  Check both with `curl http://<DOGRAH_PUBLIC_IP>:9000/minio/health/live` from a machine outside
  the EC2 instance - it must return `200`. Already-failed calls don't retry on their own *during*
  the outage, but once the fix lands, the next poller cycle (~60s) retries every call still
  marked `failed` and they resolve automatically - no manual cleanup needed.
