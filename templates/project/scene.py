from manim import *
from studio import *


class Video(StudioScene):
    def construct(self):
        self.next_section("Uvod")
        title = Text("Kvadratna funkcija", weight=BOLD).scale(1.1)
        subtitle = Text("Gdje je tjeme parabole?", color=MUTED).scale(0.55)
        header = fit(VGroup(title, subtitle).arrange(DOWN, buff=0.3))
        with self.voiceover("Danas gledamo kvadratnu funkciju i njezin graf, parabolu.") as v:
            self.play(Write(title), run_time=1.5)
            self.play(FadeIn(subtitle, shift=UP * 0.2), run_time=1)
        self.play(header.animate.scale(0.75).to_edge(UP, buff=MARGIN), run_time=1)

        self.next_section("Graf")
        axes = Axes(
            x_range=[-3, 3, 1],
            y_range=[-1, 5, 1],
            x_length=SAFE_W * (0.9 if PORTRAIT else 0.55),
            y_length=SAFE_H * (0.4 if PORTRAIT else 0.6),
            axis_config={"color": MUTED},
        ).next_to(header, DOWN, buff=0.6)
        graph = axes.plot(lambda x: x**2, x_range=[-2.2, 2.2], color=ACCENT)
        label = Text("f(x) = x²", color=ACCENT).scale(0.6)
        label.next_to(axes, DOWN if PORTRAIT else RIGHT, buff=0.4)
        vertex = Dot(axes.c2p(0, 0), color=HIGHLIGHT)

        with self.voiceover(
            "Parabola je simetrična, a njezina najniža točka zove se <bookmark mark='tjeme'/>tjeme."
        ) as v:
            self.play(Create(axes), run_time=1.2)
            self.play(Create(graph), FadeIn(label), run_time=1.5)
            self.wait_until_bookmark("tjeme")
            self.play(GrowFromCenter(vertex), Flash(vertex, color=HIGHLIGHT), run_time=0.8)
        self.wait(1)
