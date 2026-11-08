# VoiceForge 2762 — Docker image for Hugging Face Spaces (Docker SDK)
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# ffmpeg is needed for MP3 output / audio effects
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# CPU-only torch first (much smaller/faster than the default CUDA wheel);
# pocket-tts then reuses it instead of pulling its own torch.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY engine/ engine/
COPY static/ static/
COPY run.py preload_model.py ./

# Writable model cache (first run downloads the Pocket TTS weights here)
RUN mkdir -p data/hf_cache

EXPOSE 7860
CMD ["python", "run.py"]
