---
status: accepted
date: 2026-10-16
---

# 0034 — Exports encode their video on the GPU

## Context

Exports are slow on a CPU (a 10-minute video took about 30 minutes, [[../02-architecture/render-performance|render performance]]). Part of that is manim encoding every animation with libx264. The final video only joins those partial movies, so the encoder is chosen at one place.

## Decision

- **Which encoders.** Those in the ffmpeg Studio already installs (conda-forge, through PyAV; checked in the locked builds):
  - macOS: `h264_videotoolbox`;
  - Windows: `h264_nvenc` for NVIDIA, then `h264_mf`, Media Foundation's hardware encoder, which AMD's (and Intel's) drivers provide. conda-forge's ffmpeg has no AMF, AMD's own encoder;
  - Linux: `h264_nvenc`. AMD on Linux would need VAAPI and hardware frames, so it stays on the CPU.
- **Detection.** `studio_runner encoders` encodes a few frames with each, in that order; the first that works is the computer's (an encoder can be built in with no hardware behind it). It runs once per app run, and Settings → Environment can check again.
- **The swap.** `render --encoder` makes manim's writer open that encoder instead of libx264 (`encoder.py`'s PyAV wrapper, installed by `render.Recorder`). Quality is about libx264's crf 23: NVENC in constant-quality mode (cq 23), the others at about 0.08 bits per pixel.
- **A cache per encoder.** Pieces from different encoders carry different stream parameters (SPS/PPS) and can't be joined, so a GPU encoder's partial movies have their own folder (`1920x1080@30-nvenc`). The lecture video's join refuses videos from different encoders, asking for an export again.
- **Exports only.** Previews stay on the CPU: they're small, and opening a hardware encoder costs more than it saves there. Render servers keep their own CPU encoding for now.
- **The CPU as the fallback.** If a render with the GPU encoder fails (a driver, NVENC's session limit), the export redoes it on the CPU and warns. Settings → Environment → GPU video encoding turns it off.

## Consequences

- The gain is the encode's share of an export; drawing (Python and Cairo) stays on the CPU. Not measured on a real GPU yet.
- The first GPU export of a project draws everything again: its cache is new.
- Tested here without a GPU: the swap with ffmpeg's mpeg4 encoder (`tests/test_encoder.py`, a full export in the app with `STUDIO_GPU_ENCODER=mpeg4`), and the fallback with `STUDIO_GPU_ENCODER=h264_nvenc`.
