from manim import *
from studio import *


class Video(StudioScene, ThreeDScene):
    def construct(self):
        self.next_section("Surface")
        self.set_camera_orientation(phi=65 * DEGREES, theta=-45 * DEGREES, zoom=0.8)
        axes = ThreeDAxes(x_range=[-3, 3], y_range=[-3, 3], z_range=[-1, 1], x_length=6, y_length=6, z_length=2.5)
        surface = Surface(
            lambda u, v: axes.c2p(u, v, 0.8 * np.sin(u) * np.cos(v)),
            u_range=[-3, 3], v_range=[-3, 3], resolution=(10, 10),
            fill_opacity=0.8, checkerboard_colors=[BLUE_D, BLUE_E],
        )
        label = Text("z = sin x cos y", font_size=36).to_corner(UL)
        self.add_fixed_in_frame_mobjects(label)
        self.remove(label)
        with self.voiceover(text="A surface over the plane.") as tracker:
            self.play(Create(axes), Write(label), run_time=1)
            self.play(Create(surface), run_time=tracker.duration)
        self.move_camera(theta=30 * DEGREES, run_time=1.5)
        self.next_section("Too far")
        far = Sphere(radius=0.3).move_to(axes.c2p(0, 0, 9))
        self.play(FadeIn(far), run_time=0.5)
        self.play(FadeOut(far), run_time=0.5)
