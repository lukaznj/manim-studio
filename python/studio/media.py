"""Your own pictures and videos in a scene: the files in the project's media/ folder, which the
app's Media panel adds. `image("photo.png")` gives an ImageMobject; `VideoClip("demo.mp4")` one
whose picture follows the scene's clock (muted)."""

import os
from pathlib import Path

import numpy as np
from manim import ImageMobject


def media_path(name: str) -> str:
    """The absolute path of a file in media/, or an error that lists what is there."""
    folder = Path(os.environ.get("STUDIO_PROJECT", ".")) / "media"
    path = folder / name
    if not path.is_file():
        there = sorted(p.name for p in folder.iterdir()) if folder.is_dir() else []
        raise FileNotFoundError(f'No media file "{name}". In media/: {", ".join(there) or "nothing yet"}')
    return str(path)


def image(name: str) -> ImageMobject:
    """A picture from media/, scaled down to fit the safe area."""
    from . import fit  # here, not at the top: studio/__init__ imports this module

    return fit(ImageMobject(media_path(name)))


class _Playback:
    """A clip's decoder and clock. Kept out of the mobject: manim deep-copies mobjects while
    animating (FadeIn and the like), and a decoder can't be copied. Copies share the playback."""

    def __init__(self, path: str) -> None:
        import av

        self.container = av.open(path)
        stream = self.container.streams.video[0]
        stream.thread_type = "AUTO"
        seconds = stream.duration * stream.time_base if stream.duration else (self.container.duration or 0) / av.time_base
        self.duration = float(seconds)
        self.frames = self.container.decode(stream)
        self.pending = None  # a decoded frame whose time hasn't come
        self.clock = 0.0
        self.running = False

    def advance(self, dt: float):
        """The newest frame due after `dt` more seconds, or None if the picture doesn't change."""
        self.clock += dt
        latest = None
        while True:
            frame = self.pending or next(self.frames, None)
            self.pending = None
            if frame is None or frame.time is None:
                return latest
            if frame.time > self.clock:
                self.pending = frame
                return latest
            latest = frame


_PLAYBACKS: dict[int, _Playback] = {}


class VideoClip(ImageMobject):
    """A video from media/, playing inside the scene without sound. Show it, start it, let it run:

        clip = VideoClip("demo.mp4")
        self.play(FadeIn(clip))
        clip.start()
        self.wait(clip.duration)

    The picture advances with the scene's time while the clip is started; after its last frame
    it holds still."""

    def __init__(self, name: str, **kwargs) -> None:
        from . import fit  # here, not at the top: studio/__init__ imports this module

        playback = _Playback(media_path(name))
        self._playback = id(playback)
        _PLAYBACKS[self._playback] = playback
        self.duration = playback.duration
        super().__init__(next(playback.frames).to_ndarray(format="rgba"), **kwargs)
        fit(self)
        self.add_updater(VideoClip._advance)

    def start(self) -> "VideoClip":
        _PLAYBACKS[self._playback].running = True
        return self

    def stop(self) -> "VideoClip":
        _PLAYBACKS[self._playback].running = False
        return self

    @staticmethod
    def _advance(clip: "VideoClip", dt: float) -> None:
        playback = _PLAYBACKS[clip._playback]
        if playback.running and dt > 0 and (frame := playback.advance(dt)) is not None:
            clip.pixel_array = frame.to_ndarray(format="rgba")
