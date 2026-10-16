"""Videos joined one after another without re-encoding, for an exercise set's lecture video.

The exercises' exports share their codec and size (one set, one export setting), so their packets
can be copied into one file with their timestamps moved along. Videos that don't match are refused
rather than joined into something players choke on: also those encoded by another encoder (a GPU's,
encoder.py), whose stream parameters (SPS/PPS, in the extradata) differ even at the same size."""

from pathlib import Path

import av


def _layout(container) -> tuple:
    v = container.streams.video[0]
    a = container.streams.audio[0] if container.streams.audio else None
    return (
        v.codec_context.name,
        v.codec_context.width,
        v.codec_context.height,
        bytes(v.codec_context.extradata or b""),
        a.codec_context.name if a else None,
        a.codec_context.sample_rate if a else None,
    )


def _first_dts(container, stream) -> float:
    for packet in container.demux(stream):
        if packet.dts is not None:
            container.seek(0)
            return float(packet.dts * packet.time_base)
    container.seek(0)
    return 0.0


def concat(out: Path, videos: list[Path]) -> list[float]:
    """Writes `out` from `videos` in order; returns each video's duration in seconds."""
    with av.open(str(videos[0])) as first:
        layout = _layout(first)
    for path in videos[1:]:
        with av.open(str(path)) as c:
            if _layout(c) != layout:
                raise ValueError(f"{path.name} was exported with other settings (size, codec or video encoder) than {videos[0].name}; export it again")

    out.parent.mkdir(parents=True, exist_ok=True)
    durations: list[float] = []
    offset = 0.0
    with av.open(str(out), "w") as dst:
        with av.open(str(videos[0])) as first:
            v_out = dst.add_stream_from_template(first.streams.video[0])
            a_out = dst.add_stream_from_template(first.streams.audio[0]) if first.streams.audio else None
        for path in videos:
            with av.open(str(path)) as src:
                v_in = src.streams.video[0]
                a_in = src.streams.audio[0] if src.streams.audio else None
                inputs = [s for s in (v_in, a_in) if s is not None]
                # B-frames and AAC priming start a stream a little before 0: one shift for both
                # streams puts the earliest packet at the end of the last video, in sync.
                first = min(_first_dts(src, s) for s in inputs)
                shift = offset - first
                end = offset
                for packet in src.demux(*inputs):
                    if packet.dts is None:  # the flush packet at the end of each stream
                        continue
                    moved = int(round(shift / packet.time_base))
                    packet.pts += moved
                    packet.dts += moved
                    end = max(end, float((packet.dts + (packet.duration or 0)) * packet.time_base))
                    packet.stream = v_out if packet.stream.index == v_in.index else a_out
                    dst.mux(packet)
                durations.append(end - offset)
                offset = end
    return durations
