"""Google sign-in for the Antigravity CLI (src/main/antigravity.ts, ADR 0031).

The CLI signs in only from its terminal UI, so this runs it in a pseudo-terminal: it picks
"Google OAuth", reports the sign-in link, types the code the user pastes (a line on stdin) and
stops once the CLI has saved its sign-in in its home folder. The app never sees the token: it
only learns that the CLI's token file now exists. macOS and Linux only (Python's pty).
"""

import os
import re
import select
import signal
import sys
import time

from .events import emit

ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[PX^_].*?\x1b\\")
URL = re.compile(r"https://accounts\.google\.com/\S+(?=\s)")  # a whole link: something follows it
TIMEOUT = 10 * 60


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
    env = dict(os.environ, HOME=home, TERM="xterm-256color", AGY_CLI_DISABLE_AUTO_UPDATE="1")
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(work)
        os.execve(binary, [binary], env)
    # A wide terminal keeps the sign-in link on one line.
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 2000, 0, 0))

    screen = ""
    picked = sent_url = False
    end = time.time() + TIMEOUT
    try:
        while time.time() < end:
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
                screen = (screen + ANSI.sub("", chunk.decode("utf-8", "replace")))[-20000:]
                if not picked and "Select login method" in screen:
                    os.write(fd, b"\r")  # 1. Google OAuth
                    picked = True
                url = URL.search(screen)
                if url and not sent_url:
                    emit("url", url=url.group(0), line="Sign in with Google in your browser, then paste the code it shows here.")
                    sent_url = True
            if sys.stdin in ready:
                code = sys.stdin.readline()
                if not code:
                    break
                if code.strip():
                    os.write(fd, code.strip().encode() + b"\r")
        if os.path.exists(token_file(home)):
            emit("done", ok=True)
            return 0
        emit("error", message="The Antigravity sign-in didn’t finish. Try again.")
        return 1
    finally:
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except OSError:
            pass
