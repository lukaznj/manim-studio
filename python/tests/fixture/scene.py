from manim import *
from studio import *


class Video(StudioScene):
    def construct(self):
        self.next_section("Intro")
        title = Text("Derivatives")
        with self.voiceover("Let's look <bookmark mark='A'/> at the derivative.") as v:
            self.wait_until_bookmark("A")
            self.play(Write(title))
        self.wait(0.5)

        self.next_section("Mistakes")
        wide = Text("This sentence is far too long for the frame and runs off it").scale(2)
        self.play(FadeIn(wide))
        self.play(
            FadeOut(wide),
        )
        for i in range(2):
            self.play(title.animate.shift(UP * 0.2), run_time=0.5)
        self.wait()
