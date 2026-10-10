"""Local OmniVoice TTS server (runs in the optional `omnivoice` env).

Loading the model takes a while, so the app keeps one worker alive and renders call
it over localhost instead of loading it per voiceover block. The model holds several GB, so
the worker quits after IDLE_SECONDS without a request; the next render starts it again."""

from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from .events import emit

IDLE_SECONDS = 10 * 60


def serve() -> None:
    import numpy as np
    import soundfile as sf
    import torch
    from omnivoice import OmniVoice

    if torch.cuda.is_available():
        device, dtype = "cuda:0", torch.float16
    elif torch.backends.mps.is_available():
        device, dtype = "mps", torch.float32
    else:
        device, dtype = "cpu", torch.float32
    emit("loading", device=device)
    model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=device, dtype=dtype)

    last = [time.monotonic()]

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 - http.server naming
            last[0] = time.monotonic()
            try:
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                kwargs = {"text": body["text"]}
                if body.get("refAudio"):
                    kwargs["ref_audio"] = body["refAudio"]
                    if body.get("refText"):
                        kwargs["ref_text"] = body["refText"]
                audio = model.generate(**kwargs)[0]
                if hasattr(audio, "detach"):
                    audio = audio.detach().float().cpu().numpy()
                sf.write(body["out"], np.asarray(audio).squeeze(), 24000)
                self._reply(200, {"ok": True})
            except Exception as e:  # noqa: BLE001 - surface any model error to the render
                self._reply(500, {"error": str(e)})
            last[0] = time.monotonic()

        def _reply(self, status: int, payload: dict) -> None:
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    emit("ready", url=f"http://127.0.0.1:{server.server_port}", device=device)
    server.timeout = 30
    while time.monotonic() - last[0] < IDLE_SECONDS:
        server.handle_request()
    emit("done", reason="idle")
