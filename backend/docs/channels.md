# WhatsApp "Rule Dost" and phone "Nirmaan Helpline"

Two channels onto the same verified rule-answering pipeline the web app uses. They add no legal content of their own.

## Status: what is and is not verified

| Item | Status |
|---|---|
| Webhook signature checks (Meta HMAC-SHA256, Twilio HMAC-SHA1), duplicate protection, throttling, consent, PII-free storage and logs | **Tested** in `tests/channels` with locally computed signatures and fake provider clients |
| Answers: exact rule number, PDF page, exact quote, abstention, one follow-up question at a time | **Tested** against the real rule corpus |
| Twilio signature algorithm | Matches the worked example from Twilio's docs **as I recalled it** (not re-fetched), and an independent re-derivation of the documented scheme. **Not** checked against a signature Twilio itself produced for this service |
| Real WhatsApp messages (Cloud API) | **Not tested** (no credentials) |
| Real phone calls (Twilio) | **Not tested** |
| Real speech-to-text for voice notes (OpenAI Whisper) | **Not tested** |
| Hindi wording | Written by an AI assistant, **not reviewed by a native speaker** |
| Rule status | All 106 rules are "unverified": every answer says it points at the rule text and is not a verified legal answer |

Do not describe either channel as live until the checklist below has been run with the real providers. Use `POST /api/v1/channels/check-connection` and the status page afterwards; they record real outcomes.

## Safety behaviour (by design)

- Always says it is an AI, never an official, never approves or rejects anything. Final decision: municipal officer.
- Never invents rule numbers, pages or quotes: quotes are checked as exact substrings of the stored rule text; otherwise it abstains.
- Asks one follow-up at a time; STOP silences it (no unsolicited messages); START resumes.
- Phone numbers and call IDs are stored only as keyed hashes (`PII_HASH_SECRET`). Message text, transcripts, photos and documents are never stored or logged. Photos/documents are declined.
- Webhooks are public but rejected unless the provider signature is valid. Operator and demo endpoints use the normal API key.

## Setup

1. Set `PII_HASH_SECRET` (any long random string) and `PUBLIC_BASE_URL` (the exact https origin Meta/Twilio will call). See `.env.example`.
2. **WhatsApp (Meta Cloud API):** set `WHATSAPP_VERIFY_TOKEN` (you choose it), `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. In the Meta console set the callback URL to `<PUBLIC_BASE_URL>/api/v1/channels/whatsapp/webhook` with the same verify token and subscribe to `messages`.
3. **Voice notes:** `STT_PROVIDER=openai`, `OPENAI_API_KEY`. Audio is sent to OpenAI for transcription: tell users, and check this is acceptable for your data policy.
4. **Phone (Twilio):** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`; point the number's Voice webhook (HTTP POST) at `<PUBLIC_BASE_URL>/api/v1/channels/voice/incoming`. Optional written follow-up: `TWILIO_SMS_FROM` (India requires DLT registration) or `WHATSAPP_FOLLOWUP_TEMPLATE` (an approved template; free-form messages are only allowed inside WhatsApp's 24-hour window).
5. Leave the web app's Render service on `AUTH_MODE=api_key`; webhooks are exempt from the API key but not from signatures.

## Real-provider test checklist (not yet done)

1. `POST /api/v1/channels/check-connection` returns `passed` for each configured provider.
2. Register the Meta webhook (the GET handshake must succeed), send a text message from a number you control, check the reply cites a rule and page.
3. Send a voice note; check the transcript echo and answer. Send a photo; check it is declined.
4. Send STOP; confirm silence. Send START.
5. Call the Twilio number; check greeting (AI disclosure), a spoken question, silence handling, and pressing 1 for the written follow-up.
6. Confirm nothing in the database or logs contains the test number or message text.

## Demo mode

`POST /api/v1/channels/demo/whatsapp` and `/demo/call` run the real dialogue and answer logic without any provider. Responses are labelled `SIMULATION`. Enabled by default in development, off in production unless `CHANNELS_DEMO_ENABLED=true`.
