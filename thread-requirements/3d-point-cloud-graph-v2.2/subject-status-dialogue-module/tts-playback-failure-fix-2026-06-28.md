# TTS Playback Failure Fix - 2026-06-28

## Symptom

- User reported voice playback failed in both browser preview and the right-bottom GUI.
- Browser preview showed no audible playback after text dialogue and voice test.

## Findings

- Old dev server was still bound to `::1:5173` from 2026-06-27, so the browser and GUI could be testing stale renderer code.
- CosyVoice local HTTP service was healthy on `127.0.0.1:8000`, but the browser preview could not call it directly before CORS was enabled.
- Browser preview has no Electron IPC, so it cannot use `zhineng:status-dialogue:tts:synthesize`.
- Browser preview reached CosyVoice after the CORS fix, but asynchronous `audio.play()` was blocked with `not-allowed` / `user didn't interact with the document first`.
- Electron GUI process is launched with `--autoplay-policy=no-user-gesture-required`, so GUI playback should use the normal IPC path after restart; browser preview still needs an explicit fallback/replay surface.

## Changes

- Added local CORS to `scripts/cosyvoice-openai-compatible-server.py` for:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
  - `http://[::1]:5173`
- Added browser-preview CosyVoice direct HTTP fallback in `ZhinengConsole.tsx` when Electron IPC is unavailable.
- Added voice playback unlock attempts on user actions:
  - voice on/off
  - send
  - speech input start
  - voice test
  - completion notice play
- Reused the unlocked audio element for CosyVoice playback instead of creating a fresh `Audio` object each time.
- Added `replay` button for the latest generated voice audio so browser preview can recover from autoplay blocking after audio is already synthesized.

## Verification

- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- Restarted stale Node/Electron/CosyVoice processes.
- New listeners:
  - `::1:5173`
  - `127.0.0.1:8000`
- CORS preflight to `http://127.0.0.1:8000/api/v1/audio/speech` from `http://[::1]:5173`: passed.
- Browser preview reached CosyVoice and generated TTS audio; in-app browser automation still reports autoplay `not-allowed`, so browser preview uses visible `replay` fallback.

## Boundary

- No STT provider changes.
- No model provider changes.
- No world model writes.
- No requirement packet creation.
- No real people/event graph data access.
