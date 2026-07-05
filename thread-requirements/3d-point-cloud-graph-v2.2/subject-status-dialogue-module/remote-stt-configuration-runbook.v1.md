# Remote STT Configuration Runbook v1

## Scope

This runbook belongs to `status-dialogue-system`.

Current purpose:

- Enable a real OpenAI-compatible remote STT path for the Subject Status Dialogue module.
- Keep local Whisper as the protected fallback.
- Prove remote/cloud STT stability separately from fallback success.

Current boundary:

- No world model write.
- No `requirement_packet.v1`.
- No raw audio persistence.
- No external action channel.

## Supported Configuration Sources

The main process reads remote STT config from:

1. Environment variables.
2. App settings:
   - `chatProvider.config.statusDialogueStt`
   - `chatProvider.config.status_dialogue_stt`

The validation script now checks both sources.

## Environment Variable Template

Minimum remote STT configuration:

```powershell
$env:SIGHTFLOW_STATUS_DIALOGUE_STT_REMOTE_ENABLED = "1"
$env:SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY = "<redacted>"
$env:SIGHTFLOW_STATUS_DIALOGUE_STT_BASE_URL = "https://api.openai.com/v1"
$env:SIGHTFLOW_STATUS_DIALOGUE_STT_ENDPOINT = "/audio/transcriptions"
$env:SIGHTFLOW_STATUS_DIALOGUE_STT_MODEL = "whisper-1"
$env:SIGHTFLOW_STATUS_DIALOGUE_STT_TIMEOUT_MS = "30000"
```

Equivalent fallback names are also accepted:

- `STATUS_DIALOGUE_STT_REMOTE_ENABLED`
- `STATUS_DIALOGUE_STT_API_KEY`
- `STATUS_DIALOGUE_STT_BASE_URL`
- `STATUS_DIALOGUE_STT_ENDPOINT`
- `STATUS_DIALOGUE_STT_MODEL`
- `STATUS_DIALOGUE_STT_TIMEOUT_MS`
- `OPENAI_STT_REMOTE_ENABLED`
- `OPENAI_STT_API_KEY`
- `OPENAI_STT_BASE_URL`
- `OPENAI_STT_ENDPOINT`
- `OPENAI_STT_MODEL`
- `OPENAI_STT_TIMEOUT_MS`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT`
- `OPENAI_AUDIO_MODEL`

## App Settings Template

Equivalent app settings shape:

```json
{
  "chatProvider": {
    "config": {
      "statusDialogueStt": {
        "enabled": true,
        "apiKey": "<redacted>",
        "baseURL": "https://api.openai.com/v1",
        "endpointPath": "/audio/transcriptions",
        "model": "whisper-1",
        "timeoutMs": 30000
      }
    }
  }
}
```

## Verification Commands

Read-only config check:

```powershell
npm.cmd run voice:remote-stt-config:validate
```

Safe acceptance gate:

```powershell
npm.cmd run voice:remote-stt-config:acceptance
```

This command first runs the read-only config check. It only starts the runtime remote STT network probe when `ready_for_remote_probe=true`. If the API key, enable flag, or base URL is missing, it writes `status-dialogue-remote-stt-acceptance-*.json` with `network_probe_started=false` and uploads no audio.

Dry-run app settings preparation:

```powershell
npm.cmd run voice:remote-stt-config:prepare
```

Apply app settings with an API key stored in an environment variable:

```powershell
$env:SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY = "<redacted>"
npm.cmd run voice:remote-stt-config:apply -- --api-key-env SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY
```

The apply command:

- writes `chatProvider.config.statusDialogueStt`;
- creates a `settings.json.status-dialogue-stt-backup-*.bak` backup first;
- redacts the API key in reports;
- performs no network request and uploads no audio.

Configured remote probe:

```powershell
npm.cmd run voice:runtime-flow:probe-remote-stt-configured
```

Goal audit:

```powershell
npm.cmd run voice:goal:audit
```

The goal audit now embeds:

- `remote_stt_config_preflight`
- `manual_retest_readiness.real_voice_turns`

Use this as the high-level stop/go gate before claiming the STT specialist objective is complete.

Real voice-turn check after GUI testing:

```powershell
npm.cmd run voice:runtime-flow:check-real-turns
```

## Completion Evidence

Remote STT is not complete until current evidence proves:

- `voice:remote-stt-config:validate` reports `ready_for_remote_probe=true`.
- `voice:remote-stt-config:acceptance` starts the network probe only after config readiness and returns a passed acceptance report.
- `voice:runtime-flow:probe-remote-stt-configured` succeeds.
- Runtime logs include current-window:
  - `remote_stt_health_check`
  - `remote_stt_start`
  - `remote_stt_complete`
  - `status_dialogue_remote_stt_configured_probe_complete`
- `remote_stt_complete.success=true`.
- Transcript length is greater than `0`.
- `voice:goal:audit` no longer lists `cloud_stt_stability` as partial.

Fallback success alone is not remote STT stability.

## Current Status

As of the current implementation checkpoint:

- Local Whisper persistent service is ready in the real GUI.
- The real GUI is loaded with `tts-spoken-budget-2026-07-01-v2`.
- Remote STT is code-ready but not configured.
- Missing configuration is currently:
  - `remote_stt_enable_flag`
  - `remote_stt_api_key`
  - `remote_stt_base_url_or_full_endpoint`
- `voice:remote-stt-config:acceptance` currently returns `remote_stt_config_not_ready` and skips the network probe.
