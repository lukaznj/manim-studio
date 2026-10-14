"""The render worker's HTTP server (ADR 0021). Standard library only.

    python -m studio_worker          serve on STUDIO_WORKER_PORT (7400), data in STUDIO_WORKER_DATA (/data)
    python -m studio_worker code     print the pairing code again

Every request needs the token (Authorization: Bearer …). The app pastes the pairing code, which
holds the address and the token. A job is a project (tar.gz, uploaded) plus its export choices:
the worker renders each theme (slices in parallel, then one final render, like the app does), runs
`studio_runner export`, and keeps the files until the app downloads them. Narration comes made by
the app (voice/tts/): the worker has no voice of its own and never generates any.

The token lets whoever has it run a scene's Python code in this container: share it only with
people you trust, and keep the port on a private network (Tailscale, a LAN) or behind a tunnel.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tarfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = os.environ.get("STUDIO_VERSION", "dev")
DATA = Path(os.environ.get("STUDIO_WORKER_DATA", "/data"))
PORT = int(os.environ.get("STUDIO_WORKER_PORT", "7400"))
PYTHON_DIR = Path(__file__).resolve().parent.parent  # holds studio/ and studio_runner/
PREFIX = "@@studio "
MAX_UPLOAD = 4 << 30
KEEP_SECONDS = 24 * 3600


@dataclass
class Job:
    id: str
    options: dict
    dir: Path
    state: str = "waiting"  # waiting, running, done, failed, cancelled
    stage: str = ""
    percent: float | None = None
    error: str = ""
    files: list[str] = field(default_factory=list)
    finished: float = 0.0
    procs: list[subprocess.Popen] = field(default_factory=list)

    def public(self) -> dict:
        return {"id": self.id, "state": self.state, "stage": self.stage, "percent": self.percent, "error": self.error, "files": self.files}


jobs: dict[str, Job] = {}
queue = threading.Condition()


# --- the token and the pairing code ----------------------------------------------------------


def token() -> str:
    file = DATA / "token"
    if not file.exists():
        DATA.mkdir(parents=True, exist_ok=True)
        file.write_text(secrets.token_urlsafe(24))
        file.chmod(0o600)
    return file.read_text().strip()


def public_url() -> str:
    return os.environ.get("STUDIO_WORKER_URL") or f"http://{socket.gethostname()}:{PORT}"


def pairing_code() -> str:
    raw = json.dumps({"url": public_url(), "token": token()}, separators=(",", ":")).encode()
    return "msw1." + base64.urlsafe_b64encode(raw).decode().rstrip("=")


# --- rendering --------------------------------------------------------------------------------


def runner(args: list[str], env: dict, job: Job, on_event=None) -> tuple[int, dict | None]:
    """Runs `studio_runner` like the app does; returns its exit code and its last done/error event."""
    proc = subprocess.Popen(
        [sys.executable, "-m", "studio_runner", *args],
        cwd=PYTHON_DIR,
        env={**os.environ, "PYTHONPATH": str(PYTHON_DIR), "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", **env},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    job.procs.append(proc)
    final = None
    for line in proc.stdout:
        if not line.startswith(PREFIX):
            continue
        event = json.loads(line[len(PREFIX) :])
        if event.get("type") in ("done", "error"):
            final = event
        elif on_event:
            on_event(event)
    proc.wait()
    job.procs.remove(proc)
    return proc.returncode, final


def slice_count(animations: int) -> int:
    """As the app counts them (src/main/export.ts sliceCount): two cores and 2.5 GB each, 8+ animations each, at most 6."""
    if os.environ.get("STUDIO_WORKER_SLICES"):
        return max(1, int(os.environ["STUDIO_WORKER_SLICES"]))
    memory = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") if hasattr(os, "sysconf") else 8e9
    return max(1, min((os.cpu_count() or 2) // 2, int(memory // 2.5e9), animations // 8, 6))


def render_slices(job: Job, project: Path, env: dict, theme_args: list[str], animations: int, cache: Path) -> None:
    """Fills the cache with slices drawn in parallel, as the app's renderSlices does (ADR 0020)."""
    count = slice_count(animations)
    if count < 2:
        return
    size = -(-animations // count)
    results: list[tuple[int, dict | None, Path]] = [None] * count  # type: ignore[list-item]

    def one(i: int) -> None:
        own = project / ".studio" / f"slice-{i}"
        for kind in ("texts", "Tex"):
            if (cache / kind).exists():
                shutil.copytree(cache / kind, own / "cache" / kind, dirs_exist_ok=True)
        args = [*theme_args, "--out", f"slice-{i}", "--from", str(i * size)]
        if i < count - 1:
            args += ["--upto", str((i + 1) * size - 1)]
        code, final = runner(args, {**env, "STUDIO_CACHE_DIR": str(own / "cache"), "STUDIO_PARTIAL_DIR": str(own / "partial")}, job)
        results[i] = (code, final, own / "partial")

    threads = [threading.Thread(target=one, args=(i,)) for i in range(count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for code, final, pieces in results:
        if code != 0 or not final or final.get("type") != "done" or not pieces.exists():
            continue
        r = final["result"]
        shared = cache / "partial" / f"{r['width']}x{r['height']}@{round(r['fps'])}"
        shared.mkdir(parents=True, exist_ok=True)
        for piece in pieces.glob("*.mp4"):
            if not (shared / piece.name).exists():
                shutil.copyfile(piece, shared / piece.name)


def run(job: Job) -> None:
    o = job.options
    project = job.dir / "project"
    out = job.dir / "out"
    out.mkdir(exist_ok=True)
    # One cache per project, kept between jobs: unchanged animations aren't drawn again.
    cache = DATA / "cache" / "".join(c for c in str(o.get("cacheKey", job.id)) if c.isalnum() or c in "-_")[:80]
    env = {"STUDIO_VOICE": json.dumps(o.get("voice", {})), "STUDIO_VOICE_OFFLINE": "1"}
    themes = o.get("themes") or ["dark"]
    slug = o.get("slug") or "video"
    duration = float(o.get("duration") or 0)
    for theme in themes:
        if job.state == "cancelled":
            return
        label = f"Rendering the {theme} version" if len(themes) > 1 else "Rendering at full quality"
        theme_args = ["render", str(project), "--quality", "final", "--theme", theme]
        theme_args += ["--size", str(o["size"])] if o.get("size") else []
        theme_args += ["--fps", str(o["fps"])] if o.get("fps") else []
        job.stage, job.percent = f"{label}: in parallel parts", None
        render_slices(job, project, env, theme_args, int(o.get("animations") or 0), cache)

        def progress(e: dict, label=label) -> None:
            if e.get("type") == "progress":
                job.stage, job.percent = label, (min(float(e["t"]) / duration, 1.0) if duration else None)

        job.stage, job.percent = label, 0.0
        code, final = runner([*theme_args, "--out", f"final-{theme}"], {**env, "STUDIO_CACHE_DIR": str(cache)}, job, progress)
        if job.state == "cancelled":
            return
        if code != 0 or not final or final.get("type") != "done":
            raise RuntimeError((final or {}).get("message") or f"The render stopped (exit {code})")
        job.stage, job.percent = "Saving the video", None
        timeline = project / ".studio" / f"final-{theme}" / "timeline.json"
        base = out / (f"{slug}.{theme}" if len(themes) > 1 else slug)
        code, final = runner(["export", str(timeline), str(base)], {}, job)
        if code != 0 or not final or final.get("type") != "done":
            raise RuntimeError((final or {}).get("message") or "Saving the video failed")
        shutil.copyfile(timeline, out / f"timeline.{theme}.json")
    job.files = sorted(p.name for p in out.iterdir() if p.is_file())


def work() -> None:
    """Runs jobs one at a time; a worker serves one person's exports, or a few friends'."""
    while True:
        with queue:
            while not (job := next((j for j in jobs.values() if j.state == "waiting"), None)):
                queue.wait()
            job.state = "running"
        try:
            run(job)
            if job.state != "cancelled":
                job.state, job.stage, job.percent = "done", "", None
        except Exception as e:  # noqa: BLE001 - reported to the app, which shows it
            if job.state != "cancelled":
                job.state, job.error = "failed", str(e)
        finally:
            job.finished = time.time()
            shutil.rmtree(job.dir / "project", ignore_errors=True)


def tidy() -> None:
    """Drops jobs nobody fetched within a day."""
    while True:
        time.sleep(3600)
        for job in list(jobs.values()):
            if job.finished and time.time() - job.finished > KEEP_SECONDS:
                remove(job)


def remove(job: Job) -> None:
    job.state = "cancelled" if job.state in ("waiting", "running") else job.state
    for proc in list(job.procs):
        proc.kill()
    jobs.pop(job.id, None)
    shutil.rmtree(job.dir, ignore_errors=True)


# --- HTTP -------------------------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    server_version = f"ManimStudioWorker/{VERSION}"

    def _authorized(self) -> bool:
        given = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if secrets.compare_digest(given.encode(), token().encode()):
            return True
        self._json(401, {"error": "Wrong or missing token. Pair the app again with this worker's code."})
        return False

    def _json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _job(self, parts: list[str]) -> Job | None:
        job = jobs.get(parts[1]) if len(parts) > 1 else None
        if not job:
            self._json(404, {"error": "No such job; the worker may have restarted."})
        return job

    def do_GET(self) -> None:  # noqa: N802 - http.server naming
        if not self._authorized():
            return
        parts = self.path.strip("/").split("/")
        if parts == ["info"]:
            waiting = sum(j.state == "waiting" for j in jobs.values())
            busy = any(j.state == "running" for j in jobs.values())
            return self._json(200, {"version": VERSION, "cores": os.cpu_count(), "slices": slice_count(10**6), "busy": busy, "waiting": waiting})
        if parts[0] == "jobs" and len(parts) == 2:
            if job := self._job(parts):
                self._json(200, job.public())
            return
        if parts[0] == "jobs" and len(parts) == 4 and parts[2] == "files":
            job = self._job(parts)
            if not job:
                return
            name = parts[3]
            if name not in job.files:
                return self._json(404, {"error": f"No file {name}"})
            path = job.dir / "out" / name
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(path.stat().st_size))
            self.end_headers()
            with path.open("rb") as f:
                shutil.copyfileobj(f, self.wfile, 1 << 20)
            return
        self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            return
        if self.path.strip("/") != "jobs":
            return self._json(404, {"error": "Not found"})
        try:
            options = json.loads(base64.b64decode(self.headers.get("X-Studio-Job", "")).decode())
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._json(400, {"error": "The job's options weren't readable."})
        if not 0 < length <= MAX_UPLOAD:
            return self._json(413, {"error": "The project is empty or larger than 4 GB."})
        job_id = uuid.uuid4().hex
        job = Job(id=job_id, options=options, dir=DATA / "jobs" / job_id)
        job.dir.mkdir(parents=True)
        archive = job.dir / "project.tar.gz"
        with archive.open("wb") as f:
            left = length
            while left:
                chunk = self.rfile.read(min(left, 1 << 20))
                if not chunk:
                    break
                f.write(chunk)
                left -= len(chunk)
        try:
            with tarfile.open(archive, "r:gz") as tar:
                tar.extractall(job.dir / "project", filter="data")  # no paths outside, no links out, no devices
        except (tarfile.TarError, OSError) as e:
            shutil.rmtree(job.dir, ignore_errors=True)
            return self._json(400, {"error": f"The upload wasn't a readable project: {e}"})
        archive.unlink()
        with queue:
            jobs[job.id] = job
            queue.notify()
        self._json(200, job.public())

    def do_DELETE(self) -> None:  # noqa: N802
        if not self._authorized():
            return
        parts = self.path.strip("/").split("/")
        if parts[0] == "jobs" and (job := self._job(parts)):
            remove(job)
            self._json(200, {"ok": True})

    def log_message(self, fmt: str, *args) -> None:
        pass


def main() -> int:
    if sys.argv[1:] == ["code"]:
        print(pairing_code())
        return 0
    token()
    threading.Thread(target=work, daemon=True).start()
    threading.Thread(target=tidy, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Manim Studio render worker {VERSION}, on port {PORT}, {os.cpu_count()} cores.", flush=True)
    print(f"Address the app will use: {public_url()} (set STUDIO_WORKER_URL if it reaches this machine differently)", flush=True)
    print(f"Pairing code: paste it in Manim Studio → Settings → General → Render servers, then click Pair.\n\n    {pairing_code()}\n", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
