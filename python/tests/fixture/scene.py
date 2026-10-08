from manim import *
from studio import *


class Video(StudioScene):
    def construct(self):
        self.next_section("Uvod")
        title = Text("Derivacija")
        with self.voiceover("Pogledajmo <bookmark mark='A'/> derivaciju funkcije.") as v:
            self.wait_until_bookmark("A")
            self.play(Write(title))
        self.wait(0.5)

        self.next_section("Greška")
        wide = Text("Ovaj tekst je predugačak za kadar i izlazi van ruba").scale(2)
        self.play(FadeIn(wide))
        self.play(
            FadeOut(wide),
        )
        for i in range(2):
            self.play(title.animate.shift(UP * 0.2), run_time=0.5)
        self.wait()
