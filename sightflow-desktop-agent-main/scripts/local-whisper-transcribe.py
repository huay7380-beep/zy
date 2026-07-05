import argparse
import json
import math
import os
import sys
import time

import numpy as np
import soundfile as sf


def _resample_linear(audio: np.ndarray, source_rate: int, target_rate: int = 16000) -> np.ndarray:
    if source_rate == target_rate:
        return audio.astype(np.float32, copy=False)
    if len(audio) == 0:
        return audio.astype(np.float32, copy=False)

    duration = len(audio) / float(source_rate)
    target_len = max(1, int(math.ceil(duration * target_rate)))
    source_x = np.linspace(0.0, duration, num=len(audio), endpoint=False)
    target_x = np.linspace(0.0, duration, num=target_len, endpoint=False)
    return np.interp(target_x, source_x, audio).astype(np.float32)


def _load_wav_as_16k(path: str) -> np.ndarray:
    audio, sample_rate = sf.read(path, always_2d=False, dtype="float32")
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    audio = np.clip(audio, -1.0, 1.0).astype(np.float32, copy=False)
    return _resample_linear(audio, int(sample_rate), 16000)


def main() -> int:
    parser = argparse.ArgumentParser(description="Local Whisper transcription for status dialogue STT.")
    parser.add_argument("--audio", required=True, help="Path to a transient WAV audio file.")
    parser.add_argument("--language", default="zh", help="Whisper language code, e.g. zh or en.")
    parser.add_argument("--model", default=os.environ.get("ZHINENG_STT_WHISPER_MODEL", "base"))
    args = parser.parse_args()

    started_at = time.time()
    try:
      import torch
      import whisper

      audio = _load_wav_as_16k(args.audio)
      if audio.size < 1600:
          raise RuntimeError("audio sample is too short")

      device = "cuda" if torch.cuda.is_available() else "cpu"
      download_root = os.environ.get("WHISPER_CACHE_DIR") or None
      model = whisper.load_model(args.model, device=device, download_root=download_root)
      result = model.transcribe(
          audio,
          language=args.language or None,
          task="transcribe",
          fp16=(device == "cuda"),
          verbose=False,
      )
      transcript = str(result.get("text") or "").strip()
      print(
          json.dumps(
              {
                  "success": bool(transcript),
                  "transcript": transcript,
                  "language": result.get("language") or args.language,
                  "model": args.model,
                  "device": device,
                  "latency_ms": int((time.time() - started_at) * 1000),
              },
              ensure_ascii=False,
          )
      )
      return 0
    except Exception as exc:
      print(
          json.dumps(
              {
                  "success": False,
                  "error": str(exc),
                  "language": args.language,
                  "model": args.model,
                  "latency_ms": int((time.time() - started_at) * 1000),
              },
              ensure_ascii=False,
          )
      )
      return 1


if __name__ == "__main__":
    sys.exit(main())
