# Remote STT Latest Status - 2026-07-02

## Current Verdict

- `npm.cmd run voice:runtime-flow:probe-remote-stt-configured` was executed after user authorization.
- Remote STT proxy routing is code-ready.
- Current active blocker is not "API key disappeared"; it is `remote_stt_api_key` for the configured STT host.
- The existing general chat provider key is not reused for STT because `statusDialogueStt.baseURL` points to a different host.

## Evidence

- `npm.cmd run voice:remote-stt-config:validate`
  - `ready_for_remote_probe=false`
  - `missing=remote_stt_api_key`
  - `provider_api_key_fallback_blocked=chatProvider.config.apiKey host does not match statusDialogueStt.baseURL`
- `npm.cmd run voice:runtime-flow:probe-remote-stt-configured`
  - `fallback_reason=remote_stt_not_configured`
  - `next_action=configure_remote_stt_api_key`
- `npm.cmd run voice:goal:audit`
  - `result=incomplete`
  - `cloud_stt_stability=partial`
  - `remote_config_missing=remote_stt_api_key`
- `npm.cmd run voice:cloud-stt-stability:validate` passed.
- `npm.cmd run build` passed.

## Implemented Corrections

- Configured remote STT probe no longer treats host health as a hard blocker after user-authorized real probe execution.
- Remote STT POST now supports `HTTPS_PROXY` / `ALL_PROXY` with `NO_PROXY` respected.
- Added explicit `https-proxy-agent` dependency.
- General provider key fallback is allowed only when STT baseURL host matches `chatProvider.config.baseURL`.

## Next Action

- Configure a real STT-specific OpenAI-compatible key in one of:
  - `chatProvider.config.statusDialogueStt.apiKey`
  - `SIGHTFLOW_STATUS_DIALOGUE_STT_API_KEY`
  - `STATUS_DIALOGUE_STT_API_KEY`
  - `OPENAI_STT_API_KEY`
  - `OPENAI_API_KEY`
- Then rerun:
  - `npm.cmd run voice:remote-stt-config:validate`
  - `npm.cmd run voice:runtime-flow:probe-remote-stt-configured`
  - `npm.cmd run voice:goal:audit`

## Boundary

- No world model write.
- No `requirement_packet.v1`.
- No raw audio persistence.
- No API key value stored in reports or documentation.

## Added Free Provider Candidate

- Added provider preset: `cloudflare_workers_ai`
- Default model: `@cf/openai/whisper-large-v3-turbo`
- Latest provider doc:
  - `free-stt-provider-cloudflare-workers-ai-2026-07-02.md`
- New commands:
  - `npm.cmd run voice:remote-stt-config:prepare-cloudflare`
  - `npm.cmd run voice:remote-stt-config:apply-cloudflare-defaults`
- Current Cloudflare gate:
  - `remote_stt_api_key`
  - `remote_stt_cloudflare_account_id`
- Verification:
  - Cloudflare dry-run command passed.
  - Cloudflare env preflight reports correct missing fields and does not reuse the existing chat provider key.
  - `npm.cmd run build` passed.
  - `npm.cmd run voice:cloud-stt-stability:validate` passed.

## 2026-07-02 Cloudflare Real Probe Result

- User-provided Cloudflare Account API Token was tested only through process environment variables.
- No API key value was written to source files, reports, or documentation.
- Cloudflare account lookup succeeded and supplied the required Account ID for this probe.
- Direct endpoint checks:
  - `@cf/openai/whisper` returned HTTP 200 with transcript payload.
  - `@cf/openai/whisper-large-v3-turbo` returned HTTP 200 with transcript payload when sent JSON/base64 without UTF-8 BOM.
- Application chain issue found and fixed:
  - `buildStatusDialogueRemoteSttUrl` previously dropped baseURL path segments such as `/client/v4` and `/v1` when endpoint paths started with `/`.
  - Added path-preserving URL join through `buildStatusDialogueRelativeUrl`.
  - Applied the same URL join to the TTS URL builder to avoid the same class of path-loss bug.
- Verification after fix:
  - `npm.cmd run typecheck` passed.
  - `npm.cmd run build` passed.
  - `npm.cmd run voice:runtime-flow:probe-remote-stt-configured` passed with Cloudflare Workers AI.
  - Latest report: `runtime/verification-reports/status-dialogue-remote-stt-wait-1782964893998.json`
  - Result: `success=true`, `transcript_length=27`, remote transcription latency about `2961ms`, total configured probe latency about `4197ms`.
- Current persistence state:
  - The Cloudflare token was not persisted by this probe.
  - The right-bottom GUI will keep using the existing active STT adapter unless Cloudflare settings are explicitly applied.

## 2026-07-02 Cloudflare Settings Applied

- Cloudflare STT was formally written to app settings:
  - settings path: `C:\Users\zhang\AppData\Roaming\zhineng-social-assistant-desktop\settings.json`
  - backup path: `C:\Users\zhang\AppData\Roaming\zhineng-social-assistant-desktop\settings.json.status-dialogue-stt-backup-1782983767737.bak`
  - provider: `cloudflare_workers_ai`
  - model: `@cf/openai/whisper-large-v3-turbo`
  - base URL: `https://api.cloudflare.com/client/v4`
  - endpoint path: `/accounts/<account_id>/ai/run/@cf/openai/whisper-large-v3-turbo`
- Validation after applying settings:
  - `npm.cmd run voice:remote-stt-config:validate` passed.
  - Validation sources were settings-only:
    - `settings.chatProvider.config.statusDialogueStt.provider`
    - `settings.chatProvider.config.statusDialogueStt.apiKey`
    - `settings.chatProvider.config.statusDialogueStt.accountId`
    - `settings.chatProvider.config.statusDialogueStt.baseURL`
    - `settings.chatProvider.config.statusDialogueStt.endpointPath`
    - `settings.chatProvider.config.statusDialogueStt.model`
  - No environment variable was needed after persistence.
- GUI/Electron configured remote STT probe:
  - `npm.cmd run voice:runtime-flow:probe-remote-stt-configured` passed.
  - Latest report: `runtime/verification-reports/status-dialogue-remote-stt-wait-1782983958836.json`
  - Result: `success=true`, `transcript_length=27`, remote transcription latency about `3121ms`, total configured probe latency about `5392ms`.
- Normal GUI restart after probe:
  - `node scripts/prepare-status-dialogue-real-gui-retest.cjs --execute` passed.
  - Latest preflight: `runtime/verification-reports/status-dialogue-real-gui-retest-preflight-1782983967918.json`
  - GUI loaded at `2026-07-02T09:19:37.253Z`.
  - Remote STT health returned ready at about `1299ms`.
  - GUI then emitted `stt_default_remote_configured` and selected `remote` with reason `configured_remote_stt_default`.
- Remaining proof gap:
  - The configured-audio GUI/Electron remote STT path is proven.
  - A real operator microphone turn is still unproved until the operator clicks STT and speaks in the right-bottom GUI.
  - `voice:goal:audit` remains incomplete for `cloud_stt_stability` and `dialogue_input_queue` until fresh real voice turns are recorded.

## 2026-07-02 Real Operator Log Review And Default Adapter Fix

- User performed a real right-bottom GUI STT turn after Cloudflare settings were applied.
- Log review found the turn did not use Cloudflare STT:
  - latest real marker: `2026-07-02T09:24:32.597Z`
  - `stt_button_click`: selected adapter was `local`
  - `local_stt_transcribe_result`: success, transcript length `4`, latency about `552ms`
  - no `remote_stt_complete` existed in that real window
- Root cause:
  - GUI startup still initialized STT as `local`.
  - Remote health became ready later and switched to `remote`, but the user had already clicked STT.
  - This was a race between startup remote health probing and the operator's first STT click.
- Fix applied:
  - Normal GUI now initializes selected STT adapter as `remote`.
  - If remote STT is later known unavailable, GUI falls back to `local` without opening the microphone or uploading audio.
- Verification after fix:
  - `npm.cmd run typecheck` passed.
  - `npm.cmd run build` passed.
  - Normal GUI restart passed with `node scripts/prepare-status-dialogue-real-gui-retest.cjs --execute`.
  - Latest real marker: `2026-07-02T12:59:03.854Z`
  - `default_stt_adapter=remote`
  - post-mount STT snapshot: `selected_adapter=remote`
  - Cloudflare remote STT health: ready, configured, reachable, host `api.cloudflare.com`.
- Remaining proof gap:
  - One more real operator STT click is needed to prove actual microphone audio now routes to Cloudflare STT.
- Additional observed issue:
  - Current real TTS output was slow in the same test window:
    - latest queue `end_to_end_ms=32215`
    - `total_tts_ms=3484`
    - `total_playback_ms=12243`
  - The main bottleneck is not STT; it is post-response spoken event insertion/playback length.
