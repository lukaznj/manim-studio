"""Google sign-in for the Antigravity CLI (src/main/antigravity.ts, ADR 0031).

The CLI signs in only from its terminal UI, so this runs it in a pseudo-terminal: it handles
the theme picker, asks the user about first-run terms/sharing, picks "Google OAuth", reports
the sign-in link, types the code the user pastes (a line on stdin) and
stops once the CLI has saved its sign-in in its home folder. The app never sees the token: it
only learns that the CLI's token file now exists. macOS and Linux only (Python's pty).
"""

import json
import os
import re
import select
import signal
import sys
import time

from .events import emit

ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[PX^_].*?\x1b\\", re.DOTALL)
URL = re.compile(r"https://accounts\.google\.com/[^\s\x1b\x07]+(?=[\s\x1b\x07])")
QUERIES = re.compile(rb"\x1b\[(?:>0?c|0?c|6n)")
REPLIES = {
    b"\x1b[>c": b"\x1b[>0;0;0c", b"\x1b[>0c": b"\x1b[>0;0;0c",
    b"\x1b[c": b"\x1b[?1;2c", b"\x1b[0c": b"\x1b[?1;2c", b"\x1b[6n": b"\x1b[1;1R",
}
STARTUP_TIMEOUT = 45
TIMEOUT = 10 * 60


class TerminalOutput:
    """A pty has no terminal emulator to answer the CLI's device/cursor queries."""

    def __init__(self):
        self.raw = b""
        self.pending = b""

    def feed(self, chunk: bytes) -> list[bytes]:
        self.raw = (self.raw + chunk)[-40000:]
        self.pending += chunk
        replies = []
        end = 0
        for query in QUERIES.finditer(self.pending):
            replies.append(REPLIES[query.group()])
            end = query.end()
        self.pending = self.pending[end:][-16:]  # retain a query split across reads, without replying twice
        return replies

    @property
    def screen(self) -> str:
        # Strip after joining reads: both UTF-8 and escape sequences can straddle a read.
        return ANSI.sub("", self.raw.decode("utf-8", "replace"))

    @property
    def url(self) -> str | None:
        # OSC hyperlinks may end in BEL/ESC instead of whitespace. Keep their URL even when
        # the visible label is just "Click here to authenticate".
        match = URL.search(self.raw.decode("utf-8", "replace"))
        return match.group() if match else None


def token_file(home: str) -> str:
    return os.path.join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token")


def run(binary: str, home: str) -> int:
    try:
        import fcntl
        import pty
        import struct
        import termios
    except ImportError:
        emit("error", message="Google sign-in for Antigravity needs macOS or Linux here. Use a Gemini API key instead.")
        return 1

    work = os.path.join(home, "login")
    os.makedirs(work, exist_ok=True)
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("GEMINI_", "GOOGLE_", "AGY_", "ANTIGRAVITY_", "JETSKI_", "CLOUDSDK_"))}
    env.update(HOME=home, TERM="xterm-256color", AGY_CLI_DISABLE_AUTO_UPDATE="1")
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(work)
        os.execve(binary, [binary], env)
    # A wide terminal keeps the sign-in link on one line.
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 2000, 0, 0))

    terminal = TerminalOutput()
    pending_input = b""
    picked_theme = picked = sent_url = requested_consent = awaiting_consent = False
    consent_checked = False
    started = time.monotonic()
    end = started + TIMEOUT
    previous_term = signal.signal(signal.SIGTERM, lambda *_: sys.exit(1))
    try:
        while time.monotonic() < end:
            if not sent_url and not awaiting_consent and time.monotonic() - started >= STARTUP_TIMEOUT:
                emit("error", message="Antigravity couldn’t start Google sign-in. Try again, or restart Studio.")
                return 1
            if os.path.exists(token_file(home)):
                emit("done", ok=True)
                return 0
            ready, _, _ = select.select([fd, sys.stdin], [], [], 0.3)
            if fd in ready:
                try:
                    chunk = os.read(fd, 65536)
                except OSError:
                    break  # the CLI exited
                if not chunk:
                    break
                for reply in terminal.feed(chunk):
                    os.write(fd, reply)
                if not picked_theme and "Choose your color scheme" in terminal.screen:
                    os.write(fd, b"\r")  # the CLI's default terminal theme, before its login picker
                    picked_theme = True
                if not requested_consent and "Terms of Service & Data Use" in terminal.screen and "[Done]" in terminal.screen:
                    checkbox = re.search(r"\[([ xX])\]\s*Yes, I agree", terminal.screen)
                    if checkbox:
                        consent_checked = checkbox.group(1).lower() == "x"
                        emit("consent")
                        requested_consent = awaiting_consent = True
                if not picked and "Select login method" in terminal.screen:
                    os.write(fd, b"\r")  # 1. Google OAuth
                    picked = True
                url = terminal.url
                if url and not sent_url:
                    emit("url", url=url, line="Sign in with Google in your browser, then paste the code it shows here.")
                    sent_url = True
            if sys.stdin in ready:
                incoming = os.read(sys.stdin.fileno(), 4096)
                if not incoming:
                    break
                lines = (pending_input + incoming).split(b"\n")
                pending_input = lines.pop()
                for line in lines:
                    code = line.decode("utf-8", "replace")
                    if awaiting_consent:
                        try:
                            choice = json.loads(code)
                        except ValueError:
                            continue
                        if not isinstance(choice, dict) or choice.get("type") != "consent" or not isinstance(choice.get("shareData"), bool):
                            continue
                        # Apply the user's choice, then move from the checkbox to Previous,
                        # Done, and confirm the first-run setup.
                        if choice["shareData"] != consent_checked:
                            os.write(fd, b"\r")
                        os.write(fd, b"\x1b[B\x1b[C\r")
                        awaiting_consent = False
                        started = time.monotonic()
                        continue
                    if code.strip():
                        os.write(fd, code.strip().encode() + b"\r")
        if os.path.exists(token_file(home)):
            emit("done", ok=True)
            return 0
        emit("error", message="The Antigravity sign-in didn’t finish. Try again.")
        return 1
    finally:
        signal.signal(signal.SIGTERM, previous_term)
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except OSError:
            pass
        os.close(fd)
