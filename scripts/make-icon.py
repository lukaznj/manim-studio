# Renders build/icon.png (1024², transparent corners) with manim: the app's parabola mark.
# Run with the app's Python env: <env>/bin/python scripts/make-icon.py "$PWD/build/icon" /tmp/icon-media
import sys
from manim import *

config.pixel_width = config.pixel_height = 1024
config.frame_width = config.frame_height = 8
config.background_opacity = 0
config.transparent = True
config.save_last_frame = True
config.write_to_movie = False
config.media_dir = sys.argv[2]
config.output_file = sys.argv[1]
config.verbosity = "ERROR"

class Icon(Scene):
    def construct(self):
        # macOS icon grid: ~80% artwork square with rounded corners.
        tile = RoundedRectangle(width=6.6, height=6.6, corner_radius=1.45, stroke_width=0)
        tile.set_fill(color=[ "#0E1D33", "#081322"], opacity=1)
        tile.set_sheen_direction(UP)
        grid = VGroup(*[Line([-3.3, y, 0], [3.3, y, 0]) for y in [-1.65, 0, 1.65]],
                      *[Line([x, -3.3, 0], [x, 3.3, 0]) for x in [-1.65, 0, 1.65]])
        grid.set_stroke("#FFFFFF", width=2, opacity=0.05)
        axis = Line([-2.5, -1.35, 0], [2.5, -1.35, 0]).set_stroke("#3A4D6B", width=10)
        curve = ParametricFunction(lambda t: [t, 0.42 * t * t - 1.35, 0], t_range=[-2.45, 2.45])
        curve.set_stroke("#FFD166", width=34)
        dot = Dot([0, -1.35, 0], radius=0.36, color="#6B97FF")
        ring = Circle(radius=0.36, color="#0B1626").set_stroke(width=10).move_to(dot)
        self.add(tile, grid, axis, curve, ring, dot)

Icon().render()
