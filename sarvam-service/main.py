"""
Sarvam AI Speech-to-Text Service
FastAPI wrapper for Sarvam's saaras:v3 model
"""

import os
import base64
import logging
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from sarvamai import AsyncSarvamAI

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Sarvam Speech-to-Text Service",
    description="Speech-to-text powered by Sarvam AI saaras:v3",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
if not SARVAM_API_KEY:
    logger.warning("SARVAM_API_KEY is not set — transcription requests will fail")


class TranscriptionResponse(BaseModel):
    transcript: str
    language_code: str


class HealthResponse(BaseModel):
    status: str
    model: str
    api_key_configured: bool


def extract_transcript(response) -> str:
    """Extract transcript string from Sarvam response.

    The streaming response shape is:
        response.type == 'data'
        response.data  == SpeechToTextTranscriptionData(transcript=..., language_code=...)
    """
    logger.debug(f"Raw Sarvam response: {response!r}")
    # Primary shape: response.data.transcript
    if hasattr(response, "data"):
        inner = response.data
        if hasattr(inner, "transcript"):
            return inner.transcript
    # Flat shape (future-proofing)
    if hasattr(response, "transcript"):
        return response.transcript
    # Dict shapes
    if isinstance(response, dict):
        data = response.get("data", response)
        if isinstance(data, dict):
            return data.get("transcript", str(response))
        return response.get("transcript", str(response))
    return str(response)


def extract_language(response) -> str:
    """Extract detected language code from Sarvam response."""
    if hasattr(response, "data") and hasattr(response.data, "language_code"):
        return response.data.language_code
    if hasattr(response, "language_code"):
        return response.language_code
    if isinstance(response, dict):
        data = response.get("data", response)
        if isinstance(data, dict):
            return data.get("language_code", "unknown")
        return response.get("language_code", "unknown")
    return "unknown"


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        model="saaras:v3",
        api_key_configured=bool(SARVAM_API_KEY),
    )


@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default="unknown"),
):
    """
    Transcribe an audio file using Sarvam AI saaras:v3.

    - **file**: Audio file (wav, mp3, m4a, ogg, webm)
    - **language**: BCP-47 language code (e.g. 'en-IN', 'hi-IN'). Use 'unknown' for auto-detection.
    """
    if not SARVAM_API_KEY:
        raise HTTPException(status_code=500, detail="SARVAM_API_KEY is not configured")

    allowed_content_types = {
        "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3",
        "audio/mp4", "audio/m4a", "audio/x-m4a",
        "audio/ogg", "audio/webm", "video/webm",
    }
    if file.content_type and file.content_type not in allowed_content_types:
        logger.warning(f"Unexpected content type: {file.content_type} — proceeding anyway")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    audio_b64 = base64.b64encode(content).decode("utf-8")
    logger.info(f"Transcribing {len(content)} bytes, language={language!r}")

    try:
        client = AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY)
        async with client.speech_to_text_streaming.connect(
            model="saaras:v3",
            mode="transcribe",
            language_code=language,
            high_vad_sensitivity=True,
        ) as ws:
            await ws.transcribe(audio=audio_b64)
            response = await ws.recv()

        transcript = extract_transcript(response)
        detected_language = extract_language(response)
        logger.info(f"Transcription complete: {transcript[:80]!r}")

        return TranscriptionResponse(transcript=transcript, language_code=detected_language)

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@app.get("/")
async def root():
    return {
        "service": "Sarvam Speech-to-Text Service",
        "version": "1.0.0",
        "model": "saaras:v3",
        "endpoints": {
            "POST /transcribe": "Transcribe audio file",
            "GET /health": "Health check",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=48002)
