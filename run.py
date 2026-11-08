#!/usr/bin/env python3
"""VoiceForge 2762 — start the local voiceover studio server."""
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "engine"))

# Keep HF model cache inside the project so installs stay portable.
os.environ.setdefault("HF_HOME", str(BASE_DIR / "data" / "hf_cache"))

if __name__ == "__main__":
    import uvicorn

    # Hugging Face Spaces (Docker) assigns the port via $PORT and needs
    # 0.0.0.0; locally this still defaults to 7860 on all interfaces.
    port = int(os.environ.get("PORT", "7860"))
    print("VoiceForge 2762 — AI Voiceover Studio")
    print(f"Open: http://127.0.0.1:{port}")
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        log_level="warning",
        access_log=False,
    )
