"""Antigravity sign-in's terminal protocol; no network or real credentials."""

import json
import os
import select
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

from studio_runner.agy_login import REPLIES, TerminalOutput

PYTHON_DIR = Path(__file__).resolve().parents[1]
LOGIN_URL = "https://accounts.google.com/o/oauth2/auth?client_id=test&state=test"


class TerminalProtocol(unittest.TestCase):
    def test_terminal_queries_split_at_every_byte_are_answered_once(self):
        terminal = TerminalOutput()
        replies = []
        for byte in b"hello" + b"".join(REPLIES) + b"world":
            replies.extend(terminal.feed(bytes([byte])))
        self.assertEqual(replies, list(REPLIES.values()))
        self.assertEqual(terminal.feed(b"more output"), [])

    def test_prompt_utf8_and_escapes_split_between_reads(self):
        terminal = TerminalOutput()
        for byte in "č\x1b[1mSelect login method\x1b[0m".encode():
            terminal.feed(bytes([byte]))
        self.assertEqual(terminal.screen, "čSelect login method")

    def test_url_waits_for_a_delimiter(self):
        terminal = TerminalOutput()
        terminal.feed(LOGIN_URL[:40].encode())
        self.assertIsNone(terminal.url)
        terminal.feed(LOGIN_URL[40:].encode())
        self.assertIsNone(terminal.url)
        terminal.feed(b"\r\n")
        self.assertEqual(terminal.url, LOGIN_URL)

    def test_url_in_hyperlink_with_both_terminal_terminators(self):
        for terminator in (b"\x07", b"\x1b\\"):
            with self.subTest(terminator=terminator):
                terminal = TerminalOutput()
                for byte in b"\x1b]8;;" + LOGIN_URL.encode() + terminator + b"Click here\x1b]8;;" + terminator:
                    terminal.feed(bytes([byte]))
                self.assertEqual(terminal.url, LOGIN_URL)
                self.assertEqual(terminal.screen, "Click here")


@unittest.skipIf(os.name == "nt", "The login pty is used on macOS and Linux only")
class LoginProcess(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.child = None
        self.pending = b""
        self.diagnostics = []

    def tearDown(self):
        if self.child:
            if self.child.poll() is None:
                self.child.terminate()
            self.child.communicate(timeout=5)
        self.tmp.cleanup()

    def start(self, script, startup_timeout=5):
        self.pending = b""
        binary = self.home / "fake-agy"
        binary.write_text(f"#!{sys.executable}\n" + textwrap.dedent(script))
        binary.chmod(0o755)
        env = {**os.environ, "PYTHONPATH": str(PYTHON_DIR), "GEMINI_API_KEY": "test-key", "GOOGLE_CLOUD_PROJECT": "test-project"}
        entry = "import sys; from studio_runner import agy_login; agy_login.STARTUP_TIMEOUT=float(sys.argv[3]); sys.exit(agy_login.run(sys.argv[1], sys.argv[2]))"
        self.child = subprocess.Popen(
            [sys.executable, "-c", entry, str(binary), str(self.home), str(startup_timeout)],
            env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        child = self.child
        def cleanup():
            if child.poll() is None:
                child.terminate()
            child.communicate(timeout=5)
        self.addCleanup(cleanup)

    def event(self):
        while True:
            while b"\n" not in self.pending:
                self.assertTrue(select.select([self.child.stdout], [], [], 8)[0], "No login event")
                chunk = os.read(self.child.stdout.fileno(), 65536)
                self.assertTrue(chunk, "Login helper exited without an event")
                self.pending += chunk
            line, self.pending = self.pending.split(b"\n", 1)
            self.assertTrue(line.startswith(b"@@studio "), line)
            event = json.loads(line[len(b"@@studio "):])
            if event["type"] == "diagnostic":
                self.diagnostics.append(event["line"])
            else:
                return event

    def test_cli_startup_error_is_in_the_diagnostic_log(self):
        self.start('print("Failed to start: callback port is unavailable", flush=True); raise SystemExit(1)')
        self.assertEqual(self.event()["type"], "error")
        self.assertIn("Failed to start: callback port is unavailable", "\n".join(self.diagnostics))

    def test_terminal_output_is_not_logged_after_code_submission(self):
        self.start(r'''
            import os, tty
            tty.setraw(0)
            os.write(1, b"https://accounts.google.com/auth?state=private\r\n")
            code = b""
            while not code.endswith(b"\r"):
                code += os.read(0, 100)
            os.write(1, b"Echo: " + code + b"\r\n")
        ''')
        self.assertEqual(self.event()["type"], "url")
        self.child.stdin.write("private-code\n")
        self.child.stdin.flush()
        self.assertEqual(self.event()["type"], "error")
        log = "\n".join(self.diagnostics)
        self.assertNotIn("private-code", log)
        self.assertNotIn("state=private", log)
        self.assertIn("omitted after authorization code", log)

    def test_login_answers_terminal_queries_and_forwards_the_code(self):
        self.start(r'''
            import os, select, sys, time, tty
            from pathlib import Path
            tty.setraw(0)
            def read_until(expected):
                got = b""
                while not got.endswith(expected):
                    assert select.select([0], [], [], 3)[0], "No terminal reply"
                    got += os.read(0, 100)
            assert "GEMINI_API_KEY" not in os.environ
            assert "GOOGLE_CLOUD_PROJECT" not in os.environ
            assert os.environ["AGY_CLI_DISABLE_AUTO_UPDATE"] == "1"
            os.write(1, b"\x1b[>")
            time.sleep(0.02)
            os.write(1, b"c")
            read_until(b"\x1b[>0;0;0c")
            os.write(1, b"Select login method")
            read_until(b"\r")
            os.write(1, b"\x1b]8;;https://accounts.google.com/o/oauth2/auth?client_id=test&state=test\x1b\\Click here\x1b]8;;\x1b\\")
            read_until(b"test-code\r")
            token = Path.home() / ".gemini/antigravity-cli/antigravity-oauth-token"
            token.parent.mkdir(parents=True)
            token.write_text("test-only sign-in marker")
            time.sleep(30)
        ''')
        event = self.event()
        self.assertEqual(event["type"], "url")
        self.assertEqual(event["url"], LOGIN_URL)
        self.child.stdin.write("test-code\n")
        self.child.stdin.flush()
        self.assertEqual(self.event(), {"type": "done", "ok": True})
        self.assertEqual(self.child.wait(timeout=5), 0)

    def test_trusts_only_the_dedicated_login_workspace_before_selecting_google(self):
        self.start(r'''
            import os, select, time, tty
            tty.setraw(0)
            os.write(1, ("Accessing workspace:\r\n" + os.getcwd() + "\r\nDo you trust the contents of this project?\r\n> Yes, I trust this folder\r\n  No, exit\r\n").encode())
            assert select.select([0], [], [], 3)[0], "Trust prompt was not answered"
            assert os.read(0, 100) == b"\r"
            os.write(1, b"Select login method")
            assert select.select([0], [], [], 3)[0], "Google selection was not answered"
            assert os.read(0, 100) == b"\r"
            os.write(1, b"https://accounts.google.com/test\r\n")
            time.sleep(30)
        ''')
        self.assertEqual(self.event()["type"], "url")
        self.assertIn("dedicated sign-in folder", "\n".join(self.diagnostics))

    def test_does_not_trust_an_unrelated_workspace(self):
        self.start(r'''
            import os, select, time, tty
            tty.setraw(0)
            os.write(1, ("Accessing workspace:\r\n" + os.getcwd() + "-unrelated\r\nDo you trust the contents of this project?\r\n> Yes, I trust this folder\r\n  No, exit\r\n").encode())
            if select.select([0], [], [], 1)[0]:
                raise RuntimeError("An unrelated workspace was trusted")
            time.sleep(30)
        ''', startup_timeout=0.5)
        self.assertEqual(self.event()["type"], "error")
        self.assertNotIn("Confirming trust", "\n".join(self.diagnostics))

    def test_startup_timeout_reports_failure_and_reaps_the_cli(self):
        self.start('''
            import os, time
            from pathlib import Path
            (Path.home() / "cli.pid").write_text(str(os.getpid()))
            time.sleep(30)
        ''', startup_timeout=0.5)
        event = self.event()
        self.assertEqual(event["type"], "error")
        self.assertIn("couldn’t start Google sign-in", event["message"])
        self.assertEqual(self.child.wait(timeout=5), 1)
        with self.assertRaises(ProcessLookupError):
            os.kill(int((self.home / "cli.pid").read_text()), 0)

    def test_first_run_waits_for_each_explicit_sharing_choice(self):
        for checked, share_data in ((True, False), (True, True), (False, False), (False, True)):
            with self.subTest(checked=checked, share_data=share_data):
                self.start(r'''
                    import os, select, time, tty
                    from pathlib import Path
                    tty.setraw(0)
                    def read_until(expected):
                        got = b""
                        while not got.endswith(expected):
                            assert select.select([0], [], [], 3)[0], "No terminal reply"
                            got += os.read(0, 100)
                        return got
                    os.write(1, b"Choose your color scheme: [Next]")
                    assert read_until(b"\r") == b"\r"
                    os.write(1, b"Terms of Service & Data Use\r\n > [x] Yes, I agree\r\n[Previous] [Done]")
                    choice = read_until(b"\x1b[B\x1b[C\r")
                    (Path.home() / "choice").write_bytes(choice)
                    os.write(1, b"Select login method")
                    assert read_until(b"\r") == b"\r"
                    os.write(1, b"https://accounts.google.com/test\r\n")
                    time.sleep(30)
                '''.replace("[x]", "[x]" if checked else "[ ]"), startup_timeout=1)
                self.assertEqual(self.event(), {"type": "consent"})
                time.sleep(1.2)  # waiting for the user must not hit the startup deadline
                self.assertIsNone(self.child.poll())
                self.assertFalse((self.home / "choice").exists())
                self.child.stdin.write("not a consent response\n" + json.dumps({"type": "consent", "shareData": share_data}) + "\n")
                self.child.stdin.flush()
                self.assertEqual(self.event()["type"], "url")
                expected = (b"\r" if share_data != checked else b"") + b"\x1b[B\x1b[C\r"
                self.assertEqual((self.home / "choice").read_bytes(), expected)
                self.child.terminate()
                self.child.communicate(timeout=5)
                (self.home / "choice").unlink()

    def test_terminating_the_helper_reaps_the_cli(self):
        self.start('''
            import os, time
            from pathlib import Path
            (Path.home() / "cli.pid").write_text(str(os.getpid()))
            print("https://accounts.google.com/test", flush=True)
            time.sleep(30)
        ''')
        self.assertEqual(self.event()["type"], "url")
        self.child.terminate()
        self.child.wait(timeout=5)
        with self.assertRaises(ProcessLookupError):
            os.kill(int((self.home / "cli.pid").read_text()), 0)


if __name__ == "__main__":
    unittest.main()
