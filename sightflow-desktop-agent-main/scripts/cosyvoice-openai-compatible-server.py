from __future__ import annotations

import argparse
import io
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field


DEFAULT_COSYVOICE_ROOT = Path(r"D:\zhineng\third_party\CosyVoice")
DEFAULT_MODEL_DIR = DEFAULT_COSYVOICE_ROOT / "pretrained_models" / "CosyVoice-300M-SFT"


class SpeechRequest(BaseModel):
    model: str = "cosyvoice"
    input: str = Field(default="", min_length=0)
    voice: str = "default"
    response_format: str = "wav"
    stream: bool = False
    speed: float = Field(default=1.0, gt=0.2, le=3.0)


def configure_import_paths(cosyvoice_root: Path) -> None:
    sys.path.insert(0, str(cosyvoice_root))
    sys.path.insert(0, str(cosyvoice_root / "third_party" / "Matcha-TTS"))


def tensor_to_numpy(audio: torch.Tensor) -> np.ndarray:
    value = audio.detach().cpu()
    if value.ndim == 2:
        value = value.squeeze(0)
    return value.numpy().astype(np.float32)


def build_wav_bytes(chunks: list[np.ndarray], sample_rate: int) -> bytes:
    if not chunks:
        raise ValueError("CosyVoice returned no audio chunks")
    audio = np.concatenate(chunks)
    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


def audio_to_pcm16_bytes(audio: np.ndarray) -> bytes:
    clipped = np.clip(audio, -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2").tobytes()


def build_streaming_wav_header(sample_rate: int, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    # The final data size is not known while streaming. A max-size header keeps
    # the body valid enough for stream consumers, while non-stream requests keep
    # using an exact WAV header from soundfile.
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    data_size = 0xFFFFFFFF
    riff_size = 0xFFFFFFFF
    return b"".join(
        [
            b"RIFF",
            riff_size.to_bytes(4, "little"),
            b"WAVE",
            b"fmt ",
            (16).to_bytes(4, "little"),
            (1).to_bytes(2, "little"),
            channels.to_bytes(2, "little"),
            sample_rate.to_bytes(4, "little"),
            byte_rate.to_bytes(4, "little"),
            block_align.to_bytes(2, "little"),
            bits_per_sample.to_bytes(2, "little"),
            b"data",
            data_size.to_bytes(4, "little"),
        ]
    )


def create_app(args: argparse.Namespace) -> FastAPI:
    cosyvoice_root = Path(args.cosyvoice_root).resolve()
    configure_import_paths(cosyvoice_root)

    from cosyvoice.cli.cosyvoice import AutoModel

    app = FastAPI(title="Status Dialogue CosyVoice Adapter", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://[::1]:5173",
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["content-type", "authorization"],
    )
    model_lock = threading.Lock()
    started_at = time.time()
    cosyvoice = AutoModel(
        model_dir=str(Path(args.model_dir).resolve()),
        load_jit=args.load_jit,
        load_trt=args.load_trt,
        fp16=args.fp16,
    )
    speakers = cosyvoice.list_available_spks()
    default_speaker = args.default_speaker if args.default_speaker in speakers else (speakers[0] if speakers else "")

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "adapter": "cosyvoice_openai_compatible",
            "model_dir": str(Path(args.model_dir).resolve()),
            "sample_rate": cosyvoice.sample_rate,
            "speaker_count": len(speakers),
            "default_speaker": default_speaker,
            "cuda": torch.cuda.is_available(),
            "uptime_s": round(time.time() - started_at, 3),
        }

    @app.get("/voices")
    def voices() -> dict[str, Any]:
        return {
            "default": default_speaker,
            "voices": speakers,
        }

    @app.post("/api/v1/audio/speech")
    def speech(request: SpeechRequest) -> Response:
        text = request.input.strip()
        if not text:
            raise HTTPException(status_code=400, detail="input text is required")
        if request.response_format not in {"wav", "mp3", "opus", "pcm"}:
            raise HTTPException(status_code=400, detail="only wav-compatible output is enabled in this adapter")
        speaker = request.voice if request.voice in speakers else default_speaker
        if not speaker:
            raise HTTPException(status_code=500, detail="CosyVoice model exposes no SFT speakers")

        if request.stream:
            if request.response_format not in {"wav", "pcm"}:
                raise HTTPException(status_code=400, detail="streaming output is enabled for wav and pcm only")

            def iter_audio_stream():
                with model_lock, torch.inference_mode():
                    if request.response_format == "wav":
                        yield build_streaming_wav_header(cosyvoice.sample_rate)
                    for item in cosyvoice.inference_sft(
                        text,
                        speaker,
                        stream=True,
                        speed=request.speed,
                        text_frontend=args.text_frontend,
                    ):
                        pcm = audio_to_pcm16_bytes(tensor_to_numpy(item["tts_speech"]))
                        if pcm:
                            yield pcm

            media_type = "audio/pcm" if request.response_format == "pcm" else "audio/wav"
            return StreamingResponse(
                iter_audio_stream(),
                media_type=media_type,
                headers={
                    "x-cosyvoice-sample-rate": str(cosyvoice.sample_rate),
                    "x-cosyvoice-streaming": "true",
                },
            )

        try:
            with model_lock, torch.inference_mode():
                chunks = [
                    tensor_to_numpy(item["tts_speech"])
                    for item in cosyvoice.inference_sft(
                        text,
                        speaker,
                        stream=False,
                        speed=request.speed,
                        text_frontend=args.text_frontend,
                    )
                ]
            wav_bytes = build_wav_bytes(chunks, cosyvoice.sample_rate)
            return Response(
                content=wav_bytes,
                media_type="audio/wav",
                headers={
                    "x-cosyvoice-sample-rate": str(cosyvoice.sample_rate),
                },
            )
        except Exception as error:  # noqa: BLE001 - return a concise synthesis error to the local caller
            raise HTTPException(status_code=500, detail=f"CosyVoice synthesis failed: {error}") from error

    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OpenAI-compatible local HTTP adapter for CosyVoice SFT output.")
    parser.add_argument("--host", default=os.getenv("COSYVOICE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("COSYVOICE_PORT", "8000")))
    parser.add_argument("--cosyvoice-root", default=os.getenv("COSYVOICE_ROOT", str(DEFAULT_COSYVOICE_ROOT)))
    parser.add_argument("--model-dir", default=os.getenv("COSYVOICE_MODEL_DIR", str(DEFAULT_MODEL_DIR)))
    parser.add_argument("--default-speaker", default=os.getenv("COSYVOICE_DEFAULT_SPEAKER", ""))
    parser.add_argument("--load-jit", action="store_true", default=os.getenv("COSYVOICE_LOAD_JIT") == "1")
    parser.add_argument("--load-trt", action="store_true", default=os.getenv("COSYVOICE_LOAD_TRT") == "1")
    parser.add_argument("--fp16", action="store_true", default=os.getenv("COSYVOICE_FP16") == "1")
    parser.add_argument(
        "--text-frontend",
        action="store_true",
        default=os.getenv("COSYVOICE_TEXT_FRONTEND") == "1",
        help="Enable CosyVoice text frontend. Disabled by default on Windows to preserve Chinese input.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    parsed_args = parse_args()
    app = create_app(parsed_args)
    uvicorn.run(app, host=parsed_args.host, port=parsed_args.port, log_level="info")
