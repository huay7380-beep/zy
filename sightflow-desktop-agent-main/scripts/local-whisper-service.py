import argparse
import json
import math
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Tuple

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


class WhisperRuntime:
    def __init__(self, default_model: str):
        self.default_model = default_model
        self.started_at = time.time()
        self.models: Dict[str, Any] = {}
        self.device = "unknown"
        self.load_error = ""

    def load_model(self, model_name: str) -> Tuple[Any, int]:
        started = time.time()
        model_key = model_name or self.default_model
        if model_key in self.models:
            return self.models[model_key], 0
        import torch
        import whisper

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        download_root = os.environ.get("WHISPER_CACHE_DIR") or None
        model = whisper.load_model(model_key, device=self.device, download_root=download_root)
        self.models[model_key] = model
        return model, int((time.time() - started) * 1000)

    def transcribe(self, audio_path: str, language: str, model_name: str) -> Dict[str, Any]:
        started = time.time()
        model_key = model_name or self.default_model
        model, model_load_ms = self.load_model(model_key)
        audio = _load_wav_as_16k(audio_path)
        if audio.size < 1600:
            raise RuntimeError("audio sample is too short")
        result = model.transcribe(
            audio,
            language=language or None,
            task="transcribe",
            fp16=(self.device == "cuda"),
            verbose=False,
        )
        transcript = str(result.get("text") or "").strip()
        return {
            "success": bool(transcript),
            "transcript": transcript,
            "language": result.get("language") or language,
            "model": model_key,
            "device": self.device,
            "model_load_ms": model_load_ms,
            "latency_ms": int((time.time() - started) * 1000),
            "adapter_id": "local_whisper_persistent_service",
        }


def make_handler(runtime: WhisperRuntime):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ZhinengLocalWhisperService/1.0"

        def _json(self, status: int, payload: Dict[str, Any]) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, _format: str, *args: Any) -> None:
            return

        def do_GET(self) -> None:
            if self.path != "/health":
                self._json(404, {"ok": False, "reason": "not_found"})
                return
            self._json(
                200,
                {
                    "ok": True,
                    "schema": "local_whisper_persistent_service_health.v1",
                    "adapter_id": "local_whisper_persistent_service",
                    "uptime_ms": int((time.time() - runtime.started_at) * 1000),
                    "loaded_models": sorted(runtime.models.keys()),
                    "default_model": runtime.default_model,
                    "device": runtime.device,
                },
            )

        def do_POST(self) -> None:
            if self.path != "/transcribe":
                self._json(404, {"ok": False, "reason": "not_found"})
                return
            started = time.time()
            try:
                length = int(self.headers.get("content-length", "0"))
                if length <= 0 or length > 64 * 1024:
                    raise RuntimeError("invalid request body length")
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                audio_path = str(payload.get("audio_path") or "")
                language = str(payload.get("language") or "zh")
                model = str(payload.get("model") or runtime.default_model)
                if not audio_path or not os.path.exists(audio_path):
                    raise RuntimeError("audio_path does not exist")
                result = runtime.transcribe(audio_path, language, model)
                result["request_latency_ms"] = int((time.time() - started) * 1000)
                self._json(200, result)
            except Exception as exc:
                self._json(
                    200,
                    {
                        "success": False,
                        "error": str(exc),
                        "adapter_id": "local_whisper_persistent_service",
                        "latency_ms": int((time.time() - started) * 1000),
                    },
                )

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description="Persistent local Whisper STT service.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("ZHINENG_STT_SERVICE_PORT", "17858")))
    parser.add_argument("--model", default=os.environ.get("ZHINENG_STT_WHISPER_MODEL", "base"))
    parser.add_argument("--preload", action="store_true")
    args = parser.parse_args()

    runtime = WhisperRuntime(args.model)
    if args.preload:
        try:
            runtime.load_model(args.model)
        except Exception as exc:
            runtime.load_error = str(exc)
            print(json.dumps({"ready": False, "error": str(exc)}, ensure_ascii=False), flush=True)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(runtime))
    print(
        json.dumps(
            {
                "ready": True,
                "schema": "local_whisper_persistent_service_ready.v1",
                "host": args.host,
                "port": args.port,
                "model": args.model,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
