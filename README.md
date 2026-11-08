# VoiceForge 2762: AI Text-to-Speech Studio

<div align="center">
  <img src="static/assets/logo.svg" alt="VoiceForge 2762 audio waveform logo" width="112">
  <h2>Local-first speech synthesis powered by Pocket TTS</h2>
  <p>Generate speech from text, manage voices, create authorized voice clones, mix background music, and process multiple text lines through a browser-based interface.</p>
</div>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/API-FastAPI-009688?logo=fastapi">
  <img alt="Engine" src="https://img.shields.io/badge/TTS-Pocket%20TTS-574AE2">
  <img alt="Interface" src="https://img.shields.io/badge/UI-Web%20App-008080">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green">
</p>

VoiceForge 2762 is a desktop-oriented AI text-to-speech application by **2762 AI**. A local FastAPI backend serves a web interface for generating audio and managing voices. It is intended for local use and can be adapted for hosting after adding authentication, abuse controls, and persistent storage.

## Features

- **Text-to-speech studio:** Generate audio from text using the configured Pocket TTS engine.
- **Voice library:** Browse the 26 built-in Pocket TTS voices and search the voice list.
- **Community gate:** First visit asks you to visit the Planet Pulse Facebook page and join the WhatsApp channel, then the tool opens.
- **Voice cloning workflow:** Create a voice profile from reference audio when the installed model supports cloning and required access is available.
- **Batch generation:** Submit multiple text entries and download generated audio as a ZIP archive.
- **Audio options:** Configure supported speed, pitch, reverb, output format, and background music options.
- **Audio history:** View recent generation metadata and download locally generated files.
- **FastAPI backend:** Routes for model status, generation, voices, cloning, history, and background music.
- **Windows setup helpers:** Setup script and launcher are included.

## Quick start on Windows

1. Install a supported Python release and ensure `python` is available in your terminal.
2. Clone this repository:
   ```powershell
   git clone https://github.com/usmanbalouch2762/voiceforge-2762.git
   cd voiceforge-2762
   ```
3. Run `Setup.bat` and follow the prompts.
4. After setup completes, run `VoiceForge2762.vbs` to launch the local server and browser.
5. Open [http://127.0.0.1:7860](http://127.0.0.1:7860).

The first model load may take longer because the engine may need to download model files. Confirm your Python version and the current Pocket TTS installation instructions if setup fails.

## Manual setup

Create a virtual environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python run.py
```

Then open [http://127.0.0.1:7860](http://127.0.0.1:7860). Audio effects and conversions may require FFmpeg installed and available on your PATH.

## Voice cloning setup

Pocket TTS voice cloning uses a gated model on Hugging Face:

1. Create a free account at https://huggingface.co
2. Open the Pocket TTS model page and accept its license
3. Create a token at https://huggingface.co/settings/tokens (`hf_…`)
4. Paste it in the app's **Clone** page (Model access panel) and save

Cloning works only with your own voice or a recording you have permission to clone.

## Project structure

```text
voiceforge-2762/
├── engine/
│   ├── server.py             # FastAPI application and API routes
│   ├── tts_engine.py         # Pocket TTS integration
│   └── voice_registry.py     # Built-in and cloned voice metadata
├── static/
│   ├── index.html            # Web interface entry point
│   ├── css/style.css         # UI styles
│   ├── js/app.js             # Frontend logic
│   └── assets/logo.svg       # App logo
├── data/bgm/                 # Optional local background music
├── tests/
│   └── test_voice_registry.py
├── requirements.txt
├── requirements-dev.txt
├── preload_model.py
├── run.py
├── Setup.bat
├── VoiceForge2762.vbs
└── CLOUD_DEPLOYMENT.md
```

## Privacy and security

- Do not commit tokens, passwords, personal voice recordings, cloned voice-state files, generated audio, local logs, or virtual environments.
- Reference recordings should only be used with the speaker's permission.
- Review model and dependency licenses before redistribution or commercial use.
- The default server is intended for local use. Do not expose it publicly without authentication, restricted origins, request limits, rate limiting, and deployment hardening.
- Do not assume a local verification screen is a security boundary or real authentication.

## Deployment

See [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md). Static hosting can serve the frontend but cannot run the Python TTS backend by itself; a Python-capable service or container is required for full functionality.

## Ads (Adsterra / AdSense)

The UI has 3 live Adsterra ad slots in `static/index.html` (approved site `mani2762-voiceforge-2762.hf.space`):

| Slot | Location |
| --- | --- |
| `#ad-top` | Banner under the menu (all tabs) |
| `#ad-studio` | Under the voice player (Studio tab) |
| `#ad-bottom` | Banner above the footer (all tabs) |

- **Adsterra** (easiest): create a banner unit in Adsterra, paste its `<script>` straight into a slot. No approval wait, works on new sites.
- **AdSense**: uncomment the loader script in `<head>` (replace `ca-pub-XXXXXXXXXXXXXXXX` with your publisher ID), then paste each ad unit's `<ins>` code into a slot. Needs a live site + Google approval; a bare tool page is often rejected, so add a Privacy Policy page first.

Ads only earn once the app is live on a public URL with real visitors.

## Contributing

Issues and pull requests are welcome. For bugs, include the operating system, Python version, relevant steps, and sanitized logs. Never include credentials, private audio, or personal data in an issue.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE).

## Search topics

`text-to-speech` · `tts` · `voice-cloning` · `speech-synthesis` · `fastapi` · `python` · `pocket-tts` · `ai-audio` · `voice-generator` · `batch-audio`
