# Free STT Provider Candidate - Cloudflare Workers AI

## Verdict

- Selected provider: `cloudflare_workers_ai`
- Default model: `@cf/openai/whisper-large-v3-turbo`
- Reason:
  - Cloudflare provides Workers AI with a free-start/free-allocation path.
  - Whisper / Whisper Large v3 Turbo are official Workers AI ASR models.
  - The REST API requires only an API token and Account ID.
  - It can fit the existing `statusDialogueStt` remote STT lane without creating a new same-level module.

## Required Secrets

- `SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY=<cloudflare_api_token>`
- `SIGHTFLOW_STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID=<cloudflare_account_id>`

Alternative env aliases are supported:

- API token:
  - `STATUS_DIALOGUE_STT_API_KEY`
  - `CLOUDFLARE_API_TOKEN`
- Account ID:
  - `STATUS_DIALOGUE_STT_CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_ACCOUNT_ID`

## Provider Preset

```json
{
  "enabled": true,
  "provider": "cloudflare_workers_ai",
  "apiKey": "<cloudflare_api_token>",
  "accountId": "<cloudflare_account_id>",
  "baseURL": "https://api.cloudflare.com/client/v4",
  "model": "@cf/openai/whisper-large-v3-turbo",
  "timeoutMs": 30000
}
```

The runtime builds the endpoint as:

```text
https://api.cloudflare.com/client/v4/accounts/<account_id>/ai/run/@cf/openai/whisper-large-v3-turbo
```

## Commands

Dry-run Cloudflare preset:

```powershell
node scripts/configure-status-dialogue-remote-stt.cjs --provider cloudflare_workers_ai
```

Apply non-secret Cloudflare defaults:

```powershell
node scripts/configure-status-dialogue-remote-stt.cjs --apply --apply-nonsecret-defaults --provider cloudflare_workers_ai
```

After token and account ID are configured:

```powershell
npm.cmd run voice:remote-stt-config:validate
npm.cmd run voice:runtime-flow:probe-remote-stt-configured
npm.cmd run voice:goal:audit
```

## Boundary

- No API key is stored in this document.
- No world model write.
- No `requirement_packet.v1`.
- No raw audio persistence.
- Real audio upload happens only during explicit remote STT probe or explicit remote STT selection.
