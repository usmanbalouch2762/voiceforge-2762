"""
VoiceForge 2762 — TTS engine.

Wraps the public `pocket-tts` package (Kyutai Pocket TTS) for
text-to-speech generation and zero-shot voice cloning.

Written from scratch for the 2762 AI project. Uses only the
library's public API: TTSModel.load_model, get_state_for_audio_prompt,
generate_audio, export_model_state / import_model_state.
"""
import logging
import re
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import numpy as np

logger = logging.getLogger("voiceforge2762.engine")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CLONED_DIR = DATA_DIR / "cloned"
OUTPUT_DIR = DATA_DIR / "output"

# Built-in voice prompts shipped with Pocket TTS.
BUILTIN_VOICES = [
    "cosette", "marius", "javert", "alba", "jean", "anna", "vera",
    "fantine", "charles", "paul", "eponine", "azelma", "george", "mary",
    "jane", "michael", "eve", "bill_boerst", "peter_yearsley",
    "stuart_bell", "caro_davy", "giovanni", "lola", "juergen", "rafael",
    "estelle",
]


def _split_text(text: str, max_chars: int = 1000) -> list[str]:
    """Split long text into chunks at sentence boundaries.

    Short texts come back as a single chunk. A very long sentence is
    split at word boundaries so no chunk exceeds max_chars.
    """
    sentences = re.split(r"(?<=[.!?\n])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(current) + len(sentence) + 1 <= max_chars:
            current = f"{current} {sentence}".strip()
            continue
        if current:
            chunks.append(current)
        while len(sentence) > max_chars:
            cut = sentence.rfind(" ", 0, max_chars)
            if cut <= 0:
                cut = max_chars
            chunks.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        current = sentence
    if current:
        chunks.append(current)
    return chunks or [text]


def _clean_reference_audio(raw_path: Path, ref_path: Path) -> bool:
    """Convert the cloning reference to 24 kHz mono and strip background noise.

    Reference recordings often carry room noise, hum or music behind the
    voice — without cleaning, that noise gets cloned along with the voice.
    afftdn (FFT denoiser) + a high-pass remove it. Returns True on success;
    on failure the caller falls back to a plain conversion so cloning
    still works.
    """
    res = subprocess.run(
        ["ffmpeg", "-y", "-i", str(raw_path),
         "-af", "highpass=f=80,afftdn=nr=12:nf=-25",
         "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(ref_path)],
        capture_output=True, text=True, check=False,
    )
    if res.returncode:
        logger.warning("Reference denoise failed (%s); using plain convert",
                       res.stderr[-200:])
    return res.returncode == 0


class TTSEngine:
    """Pocket TTS engine with voice cloning support."""

    def __init__(self):
        self.model = None
        self.model_loaded = False
        self.loading = False
        self.setup_progress = 0
        self.setup_status = "idle"
        self.voice_cloning_available = False
        self._voice_states = {}

    def get_status(self) -> dict:
        return {
            "model_loaded": self.model_loaded,
            "loading": self.loading,
            "setup_progress": self.setup_progress,
            "setup_status": self.setup_status,
            "voice_cloning": self.voice_cloning_available,
        }

    async def load_model(self):
        """Load the Pocket TTS model (downloads weights on first run)."""
        if self.model_loaded or self.loading:
            return
        self.loading = True
        self.setup_status = "Pocket TTS load ho raha hai…"
        self.setup_progress = 10
        try:
            from pocket_tts import TTSModel

            self.setup_status = "Model load ho raha hai…"
            self.setup_progress = 60
            self.model = TTSModel.load_model()
            self.setup_status = "Model ready"
            self.setup_progress = 100
            self.model_loaded = True
            self.voice_cloning_available = bool(
                getattr(self.model, "has_voice_cloning", False)
            )
            logger.info(
                "Pocket TTS loaded. Voice cloning available: %s",
                self.voice_cloning_available,
            )
        except ImportError:
            self.setup_status = "Pocket TTS install nahi hai. requirements install karo."
            self.setup_progress = -1
            logger.exception("Pocket TTS import failed")
        except Exception as exc:
            self.setup_status = f"Model load error: {exc}"
            self.setup_progress = -1
            logger.exception("Failed to load TTS model")
        finally:
            self.loading = False

    # -- voice states ----------------------------------------------------

    def _get_voice_state(self, voice_id: str):
        """Resolve a voice id to a Pocket TTS voice state (cached)."""
        if voice_id in self._voice_states:
            return self._voice_states[voice_id]

        if voice_id in BUILTIN_VOICES:
            try:
                state = self.model.get_state_for_audio_prompt(voice_id)
                self._voice_states[voice_id] = state
                return state
            except Exception:
                logger.exception("Built-in voice load failed: %s", voice_id)
                return None

        if self.voice_cloning_available:
            state_path = CLONED_DIR / f"{voice_id}.safetensors"
            if state_path.exists():
                try:
                    from pocket_tts import import_model_state

                    state = import_model_state(str(state_path))
                    self._voice_states[voice_id] = state
                    return state
                except Exception:
                    logger.exception("Cloned voice state load failed")
            audio_path = CLONED_DIR / f"{voice_id}_reference.wav"
            if audio_path.exists():
                try:
                    state = self.model.get_state_for_audio_prompt(str(audio_path))
                    self._voice_states[voice_id] = state
                    return state
                except Exception:
                    logger.exception("Voice load from reference audio failed")

        logger.warning("Voice %s not found; falling back to alba", voice_id)
        if "alba" not in self._voice_states:
            try:
                self._voice_states["alba"] = self.model.get_state_for_audio_prompt("alba")
            except Exception:
                logger.exception("Fallback voice load failed")
                return None
        return self._voice_states.get("alba")

    # -- generation ------------------------------------------------------

    async def generate(self, text: str, voice_id: str = "alba", speed: float = 1.0,
                       language: str = "en", pitch: float = 1.0, reverb: float = 0.0,
                       bgm_path: str = None, output_format: str = "wav") -> tuple[bytes, float]:
        if output_format not in {"wav", "mp3"}:
            raise ValueError("output_format must be wav or mp3")
        if not self.model_loaded:
            await self.load_model()
        if not self.model_loaded:
            raise RuntimeError("TTS model load nahi hua")

        start = time.time()
        try:
            voice_state = self._get_voice_state(voice_id)
            sample_rate = int(getattr(self.model, "sample_rate", 24000))
            # Long texts: generate in sentence-sized chunks so a 30+ min
            # voiceover never goes through the model as one giant call.
            chunks = _split_text(text)
            parts: list[np.ndarray] = []
            for index, chunk in enumerate(chunks):
                audio = self.model.generate_audio(voice_state, chunk)
                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().numpy()
                elif hasattr(audio, "numpy"):
                    audio = audio.numpy()
                parts.append(np.asarray(audio).squeeze().astype(np.float32))
                if index < len(chunks) - 1:
                    parts.append(np.zeros(int(0.2 * sample_rate), dtype=np.float32))
            audio_np = np.concatenate(parts) if len(parts) > 1 else parts[0]

            # speed: resample by linear interpolation
            if speed != 1.0 and speed > 0:
                n = len(audio_np)
                new_len = int(n / speed)
                if new_len > 0:
                    audio_np = np.interp(
                        np.linspace(0, n - 1, new_len), np.arange(n), audio_np
                    )

            duration = len(audio_np) / sample_rate

            import soundfile as sf

            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            temp_id = uuid.uuid4().hex[:8]
            temp_wav = OUTPUT_DIR / f"temp_{temp_id}.wav"
            out_file = OUTPUT_DIR / f"temp_out_{temp_id}.{output_format}"
            sf.write(str(temp_wav), audio_np, sample_rate, format="WAV", subtype="PCM_16")

            filters = []
            if pitch != 1.0:
                filters.append(f"rubberband=pitch={pitch}")
            if reverb > 0.0:
                decay = 0.2 + (reverb * 0.4)
                filters.append(f"aecho=0.8:0.9:60:{decay}")
            filter_str = ",".join(filters)

            cmd = ["ffmpeg", "-y", "-i", str(temp_wav)]
            if bgm_path and Path(bgm_path).is_file():
                cmd.extend(["-i", str(bgm_path)])
                if filter_str:
                    complex_filter = (
                        f"[0:a]{filter_str}[voice];"
                        f"[1:a]volume=0.8[bg];"
                        f"[bg][voice]sidechaincompress=threshold=0.03:ratio=4:attack=5:release=50[ducked];"
                        f"[voice][ducked]amix=inputs=2:duration=first[out]"
                    )
                else:
                    complex_filter = (
                        f"[1:a]volume=0.8[bg];"
                        f"[bg][0:a]sidechaincompress=threshold=0.03:ratio=4:attack=5:release=50[ducked];"
                        f"[0:a][ducked]amix=inputs=2:duration=first[out]"
                    )
                cmd.extend(["-filter_complex", complex_filter, "-map", "[out]"])
            elif filter_str:
                cmd.extend(["-af", filter_str])
            if output_format == "mp3":
                cmd.extend(["-c:a", "libmp3lame", "-q:a", "2"])
            else:
                cmd.extend(["-c:a", "pcm_s16le"])
            cmd.append(str(out_file))

            try:
                subprocess.run(cmd, check=True, capture_output=True)
                result = out_file.read_bytes()
            except (FileNotFoundError, subprocess.CalledProcessError):
                logger.exception("FFmpeg processing failed; returning raw WAV")
                result = temp_wav.read_bytes()
            finally:
                temp_wav.unlink(missing_ok=True)
                out_file.unlink(missing_ok=True)

            logger.info(
                "Generated %.1fs audio in %.2fs (voice=%s)",
                duration, time.time() - start, voice_id,
            )
            return result, duration
        except Exception as exc:
            logger.exception("Speech generation failed")
            raise RuntimeError(f"Speech generation failed: {exc}") from exc

    # -- cloning ---------------------------------------------------------

    async def clone_voice(self, audio_bytes: bytes, voice_id: str,
                          filename: str = "upload.wav") -> str:
        """Create a cloned voice from a reference recording.

        Only the speaker's own voice or a recording you have permission
        to clone should be used.
        """
        if not self.model_loaded:
            await self.load_model()
        if not self.model_loaded:
            raise RuntimeError("TTS model load nahi hua")
        if not self.voice_cloning_available:
            raise RuntimeError(
                "Voice cloning available nahi hai. Pocket TTS access / HF token check karo."
            )
        try:
            CLONED_DIR.mkdir(parents=True, exist_ok=True)
            raw_path = CLONED_DIR / f"{voice_id}_raw{Path(filename).suffix or '.wav'}"
            raw_path.write_bytes(audio_bytes)
            ref_path = CLONED_DIR / f"{voice_id}_reference.wav"
            try:
                cleaned = _clean_reference_audio(raw_path, ref_path)
                if not cleaned:
                    res = subprocess.run(
                        ["ffmpeg", "-y", "-i", str(raw_path), "-ar", "24000",
                         "-ac", "1", "-c:a", "pcm_s16le", str(ref_path)],
                        capture_output=True, text=True, check=False,
                    )
                    if res.returncode:
                        raise RuntimeError(
                            "FFmpeg reference audio convert nahi kar saka: "
                            + res.stderr[-500:]
                        )
            finally:
                raw_path.unlink(missing_ok=True)

            voice_state = self.model.get_state_for_audio_prompt(str(ref_path))
            from pocket_tts import export_model_state

            state_path = str(CLONED_DIR / f"{voice_id}.safetensors")
            export_model_state(voice_state, state_path)
            self._voice_states[voice_id] = voice_state
            logger.info("Voice cloned: %s", voice_id)
            return state_path
        except Exception as exc:
            logger.exception("Voice cloning failed")
            raise RuntimeError(f"Voice cloning failed: {exc}") from exc

    async def generate_preview(self, voice_id: str) -> bytes | None:
        preview_text = (
            "Hello, this is a preview of my voice. "
            "I can bring your text to life with natural speech."
        )
        try:
            wav_bytes, _ = await self.generate(preview_text, voice_id)
            return wav_bytes
        except Exception:
            logger.exception("Preview generation failed for %s", voice_id)
            return None
