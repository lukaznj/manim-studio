"""Render a project's scene.py and describe the result as a timeline.

The timeline is produced by the render itself, never stored separately: every
play()/wait(), section and voiceover block is recorded with the scene.py line that
produced it. The app reads one `done` event (also saved as timeline.json)."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
import time
import traceback
from pathlib import Path

from .events import emit

LONG_UNITS = 8 * 16 / 9  # manim's default frame width, used as the long side
QUALITY = {
    "preview": {"long": 854, "short": 480, "fps": 15},
    "final": {"long": 1920, "short": 1080, "fps": None},
}


def configure(
    project: Path,
    quality: str,
    size: int | None = None,
    fps: int | None = None,
    theme: str | None = None,
    out_name: str | None = None,
    from_anim: int | None = None,
    upto: int | None = None,
    voice_only: bool = False,
) -> tuple[dict, Path]:
    from manim import config

    meta = json.loads((project / "project.json").read_text(encoding="utf-8"))
    portrait = meta.get("aspect") == "9:16"
    q = QUALITY[quality]
    out = project / ".studio" / (out_name or quality)

    short = size or q["short"]
    long = round(short * 16 / 9 / 2) * 2  # even, as video encoders want: 480 -> 854, 720 -> 1280
    config.pixel_width, config.pixel_height = (short, long) if portrait else (long, short)
    config.frame_rate = fps or q["fps"] or int(meta.get("fps", 30))
    config.frame_width, config.frame_height = (8.0, LONG_UNITS) if portrait else (LONG_UNITS, 8.0)
    # An export renders a copy of the project; STUDIO_CACHE_DIR points it at the original's cache.
    config.media_dir = os.environ.get("STUDIO_CACHE_DIR") or str(project / ".studio" / "cache")
    # Finished animations (partial movies) live in the cache, one folder per size and frame rate, so
    # every render of the project reuses them: previews, exports of its copies, and the final pass
    # of a parallel export. A slice of one draws into its own folder (STUDIO_PARTIAL_DIR), and the
    # app moves what it made into the shared one only when it succeeded.
    config.partial_movie_dir = os.environ.get("STUDIO_PARTIAL_DIR") or str(
        Path(config.media_dir) / "partial" / f"{config.pixel_width}x{config.pixel_height}@{int(config.frame_rate)}"
    )
    config.video_dir = str(out)
    config.output_file = str(out / f"video-{int(time.time() * 1000)}")
    config.progress_bar = "none"
    config.verbosity = "WARNING"
    config.write_to_movie = True
    config.save_last_frame = False
    config.preview = False
    # manim deletes the oldest partial movies beyond 100; a long video, or an export split into
    # slices that fill the cache for the final pass, needs them all.
    config.max_files_cached = 100_000
    if from_anim is not None:
        config.from_animation_number = from_anim
    if upto is not None:
        config.upto_animation_number = upto
    if voice_only:
        # Every animation skipped and nothing written: construct still runs, so every voiceover
        # block makes its narration. A remote worker then finds it all in voice/tts/.
        config.dry_run = True
        config.from_animation_number = 10**9
        out.mkdir(parents=True, exist_ok=True)  # manim still writes the subtitles there

    theme = theme or meta.get("theme", "dark")
    background = meta.get("background") or {}
    os.environ["STUDIO_THEME"] = theme
    os.environ["STUDIO_BG"] = background.get(theme) or ""  # a custom colour for this theme
    os.environ["STUDIO_BG_IMAGE"] = str(project / "media" / background["image"]) if background.get("image") else ""
    os.environ["STUDIO_PROJECT"] = str(project)
    from studio.brand import apply_theme

    apply_theme()
    return meta, out


class Recorder:
    """Monkeypatches Scene/VoiceoverScene to log what happened, and when, from which line."""

    def __init__(self, scene_file: Path) -> None:
        from .layout import LayoutChecker

        self.file = str(scene_file)
        self.clips: list[dict] = []
        self.sections: list[dict] = []
        self.voice: list[dict] = []
        self.thumbnail: dict | None = None  # self.thumbnail("hook"): the moment showing the core idea
        self.layout = LayoutChecker()

    def line(self) -> int | None:
        f = sys._getframe(2)
        while f is not None:
            if f.f_code.co_filename == self.file:
                return f.f_lineno
            f = f.f_back
        return None

    def install(self) -> None:
        from manim import Scene, Wait
        from manim_voiceover import VoiceoverScene

        rec = self
        play, next_section, add_voiceover = Scene.play, Scene.next_section, VoiceoverScene._add_voiceover_text

        def recorded_play(scene, *args, **kwargs):
            line = rec.line()
            start = scene.renderer.time
            play(scene, *args, **kwargs)
            end = scene.renderer.time
            kind = "wait" if args and all(isinstance(a, Wait) for a in args) else "play"
            rec.clips.append({"start": start, "end": end, "line": line, "kind": kind, "anims": [_anim(a) for a in args]})
            rec.layout.check(scene, start, end, line)
            emit("progress", clips=len(rec.clips), t=end)

        def recorded_section(scene, name: str = "unnamed", *args, **kwargs):
            rec.sections.append({"name": name, "start": scene.renderer.time, "line": rec.line()})
            return next_section(scene, name, *args, **kwargs)

        def recorded_voiceover(scene, text, *args, **kwargs):
            from studio.voice import USED, spoken, text_key

            line = rec.line()
            tracker = add_voiceover(scene, text, *args, **kwargs)
            key = text_key(text)
            rec.voice.append(
                {
                    "start": tracker.start_t,
                    "end": tracker.end_t,
                    "line": line,
                    "text": spoken(text),
                    "key": key,
                    "source": USED.get(key, "unknown"),
                    "audio": str(Path(tracker.cache_dir) / tracker.data["final_audio"]),
                    "bookmarks": [{"mark": m, "t": t} for m, t in getattr(tracker, "bookmark_times", {}).items()],
                }
            )
            return tracker

        def recorded_thumbnail(scene, text: str | None = None):
            rec.thumbnail = {"t": scene.renderer.time, "text": (text or "").strip() or None, "line": rec.line()}

        from studio import StudioScene

        Scene.play = recorded_play
        Scene.next_section = recorded_section
        VoiceoverScene._add_voiceover_text = recorded_voiceover
        StudioScene.thumbnail = recorded_thumbnail


def _anim(a) -> dict:
    from manim import Animation

    if isinstance(a, Animation):
        from .layout import describe

        target = getattr(a, "mobject", None)
        return {"name": type(a).__name__, "target": describe(target) if target is not None else None}
    return {"name": "animate" if type(a).__name__ == "_AnimationBuilder" else type(a).__name__, "target": None}


def load_scene_class(scene_file: Path, wanted: str | None):
    from manim import Scene

    sys.path.insert(0, str(scene_file.parent))
    spec = importlib.util.spec_from_file_location("scene", scene_file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    classes = [
        c for c in vars(module).values() if isinstance(c, type) and issubclass(c, Scene) and c.__module__ == "scene"
    ]
    if not classes:
        raise RuntimeError("scene.py defines no Scene class (expected: class Video(StudioScene): ...)")
    if wanted:
        for c in classes:
            if c.__name__ == wanted:
                return c
    return classes[0]


def render(project: Path, quality: str, **options) -> int:
    project = project.resolve()
    scene_file = project / "scene.py"
    source = scene_file.read_text(encoding="utf-8")
    started = time.time()
    try:
        meta, out = configure(project, quality, **options)
        recorder = Recorder(scene_file)
        recorder.install()
        scene = load_scene_class(scene_file, meta.get("scene"))()
        emit("start", scene=type(scene).__name__)
        scene.render()
    except BaseException as e:  # noqa: BLE001 - report every failure, including SystemExit from manim
        emit("error", **_error_info(e, scene_file))
        return 1

    from studio.voice import WARNINGS

    from . import source as source_map

    source_map.annotate(source, recorder.clips)
    writer = scene.renderer.file_writer
    duration = scene.renderer.time
    result = {
        "video": str(getattr(writer, "movie_file_path", "")),  # none in a voice-only render
        "quality": quality,
        "duration": duration,
        "width": config_value("pixel_width"),
        "height": config_value("pixel_height"),
        "fps": config_value("frame_rate"),
        "sourceHash": hashlib.sha1(source.encode("utf-8")).hexdigest(),
        "renderedAt": time.time(),
        "renderSeconds": round(time.time() - started, 2),
        "sections": _close_sections(recorder.sections, duration),
        "thumbnail": recorder.thumbnail,
        "clips": recorder.clips,
        "voice": recorder.voice,
        "subtitles": [
            {"start": s.start.total_seconds(), "end": s.end.total_seconds(), "text": s.content}
            for s in writer.subcaptions
        ],
        "warnings": recorder.layout.results(),
        "voiceWarnings": WARNINGS,
        # The voice this render spoke with; the app offers to re-voice when the project's differs.
        "voiceSettings": json.loads(os.environ.get("STUDIO_VOICE") or "{}"),
    }
    (out / "timeline.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    _prune_old_videos(out, keep=Path(result["video"]))
    emit("done", result=result)
    return 0


def config_value(name: str):
    from manim import config

    return config[name]


def _close_sections(sections: list[dict], duration: float) -> list[dict]:
    # manim starts with an implicit unnamed section; drop it when it's empty.
    out = []
    for i, s in enumerate(sections):
        end = sections[i + 1]["start"] if i + 1 < len(sections) else duration
        out.append({**s, "end": end})
    if out and out[0]["start"] > 0:
        out.insert(0, {"name": "", "start": 0.0, "end": out[0]["start"], "line": None})
    return out


def _prune_old_videos(out: Path, keep: Path) -> None:
    # Each render writes a fresh file so the player never reads a half-written one.
    videos = sorted(out.glob("video-*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in videos[2:]:
        if old != keep:
            old.unlink(missing_ok=True)
            old.with_suffix(".srt").unlink(missing_ok=True)


def _error_info(e: BaseException, scene_file: Path) -> dict:
    line = None
    if isinstance(e, SyntaxError) and e.filename and Path(e.filename).resolve() == scene_file:
        line = e.lineno
    for frame in traceback.extract_tb(e.__traceback__):
        if Path(frame.filename).resolve() == scene_file:
            line = frame.lineno
    message = str(e) or type(e).__name__
    if "latex" in message.lower() or "dvisvgm" in message.lower():
        message += " (check that LaTeX is installed: Settings → Environment)"
    return {
        "message": f"{type(e).__name__}: {message}",
        "line": line,
        "traceback": "".join(traceback.format_exception(e)),
    }
