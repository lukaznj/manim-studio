#!/usr/bin/env python3
"""Generate offline UI translation drafts. Run only with permission to send the English catalog to Google.

Only src/shared/locales/en.json leaves the computer. Never use this for project/user content.
No translation service is contacted by the shipped app. Existing translations are kept.
"""
import argparse
import concurrent.futures
import json
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = ROOT / 'src/shared/locales'
ENGLISH = json.loads((DIRECTORY / 'en.json').read_text())
BRANDS = ['Gemini 4 Argon', 'Claude Desktop', 'Manim Studio', 'Claude Code', 'Antigravity', 'ElevenLabs', 'OmniVoice', 'ChatGPT', 'OpenAI', 'Anthropic', 'GitHub', 'Google', 'Gemini', 'Claude', 'Codex', 'Sonnet', 'Opus', 'Haiku', 'TinyTeX', 'Whisper', 'Python', 'Monaco', 'FFmpeg', 'Manim', 'HTML', 'API', 'PDF', 'GPU', 'CPU', 'MCP', 'scene.py', 'script.md', 'project.json', 'series.md', 'CLAUDE.md', 'pixi']
PROTECT = re.compile('|'.join(re.escape(s) for s in BRANDS) + r'|\{\d+\}|https?://[^\s]+|\b[\w-]+\.(?:json|py|md|toml|lock|png|mp4)\b')
PLACEHOLDERS = re.compile(r'\{\d+\}')
lock = threading.Lock()
next_request = 0.0
rate_limited = threading.Event()


def request(text, language):
    global next_request
    target = {'nb': 'no', 'pt': 'pt-PT'}.get(language, language)
    url = 'https://translate.googleapis.com/translate_a/single?' + urllib.parse.urlencode({'client': 'gtx', 'sl': 'en', 'tl': target, 'dt': 't', 'q': text})
    for attempt in range(6):
        if rate_limited.is_set():
            raise RuntimeError('Translation service is rate-limited. No further requests will be made.')
        with lock:
            delay = max(0, next_request - time.monotonic())
            next_request = max(next_request, time.monotonic()) + 0.18
        if delay:
            time.sleep(delay)
        try:
            with urllib.request.urlopen(url, timeout=40) as response:
                data = json.load(response)
            return ''.join(part[0] or '' for part in data[0])
        except (urllib.error.URLError, TimeoutError) as error:
            if isinstance(error, urllib.error.HTTPError) and error.code == 429:
                rate_limited.set()
                raise RuntimeError('Translation service rate limit reached. Pause requests and finish locally or retry later.') from error
            if isinstance(error, urllib.error.HTTPError) and error.code == 400:
                raise
            if attempt == 5:
                raise
            time.sleep(min(30, 2 ** attempt))


def mask(text):
    originals = []
    def replace(match):
        originals.append(match.group())
        return '{' + str(9000 + len(originals) - 1) + '}'
    return PROTECT.sub(replace, text), originals


def restore(text, originals):
    for i, original in enumerate(originals):
        pattern = r'\{\s*' + str(9000 + i) + r'\s*\}'
        if not re.search(pattern, text, re.I):
            raise ValueError(f'Protected token {i} was lost')
        text = re.sub(pattern, lambda _m: original, text, flags=re.I)
    if re.search(r'\{9\d{3}\}', text):
        raise ValueError('Unrestored token')
    return text.strip()


def translate_batch(keys, language):
    encoded = [mask(key.replace('\n', ' ')) for key in keys]
    text = '\n'.join(f'{90000 + i} | {masked}' for i, (masked, _) in enumerate(encoded))
    result = request(text, language)
    pieces = re.split(r'(?:^|\n)\s*(9\d{4})\s*[|｜]', result)
    found = {int(pieces[i]) - 90000: pieces[i + 1] for i in range(1, len(pieces) - 1, 2)}
    translated = {}
    for i, key in enumerate(keys):
        try:
            value = restore(found[i], encoded[i][1])
            if sorted(PLACEHOLDERS.findall(key)) != sorted(PLACEHOLDERS.findall(value)):
                raise ValueError('Placeholder mismatch')
        except (KeyError, ValueError):
            # A small number of messages lose a batch marker; retry those independently.
            value = restore(request(encoded[i][0], language), encoded[i][1])
        if not value or sorted(PLACEHOLDERS.findall(key)) != sorted(PLACEHOLDERS.findall(value)):
            raise ValueError(f'{language}: invalid translation for {key!r}')
        translated[key] = value
    return translated


def latin_script(text):
    lower = dict(zip('абвгдђежзијклљмнњопрстћуфхцчџш', ['a','b','v','g','d','đ','e','ž','z','i','j','k','l','lj','m','n','nj','o','p','r','s','t','ć','u','f','h','c','č','dž','š']))
    upper = {k.upper(): v.capitalize() for k, v in lower.items()}
    return ''.join(lower.get(c, upper.get(c, c)) for c in text)


def generate(language):
    path = DIRECTORY / f'{language}.json'
    catalog = json.loads(path.read_text()) if path.exists() else {}
    missing = [key for key in ENGLISH if key not in catalog]
    batches, batch, length = [], [], 0
    for key in missing:
        size = len(mask(key)[0]) + 12
        if batch and length + size > 2300:
            batches.append(batch)
            batch, length = [], 0
        batch.append(key)
        length += size
    if batch:
        batches.append(batch)
    for i, batch in enumerate(batches):
        values = translate_batch(batch, language)
        if language == 'cnr':
            values = {k: latin_script(v) for k, v in values.items()}
        catalog.update(values)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps({k: catalog[k] for k in ENGLISH if k in catalog}, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(path)
        if (i + 1) % 5 == 0 or i + 1 == len(batches):
            print(f'{language}: {len(catalog)}/{len(ENGLISH)} messages ({i + 1}/{len(batches)} batches)', flush=True)
    return language, len(catalog)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--languages', nargs='+', required=True)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(generate, language): language for language in args.languages}
        for future in concurrent.futures.as_completed(futures):
            try:
                print('Complete:', future.result(), flush=True)
            except Exception as error:
                print('FAILED:', futures[future], repr(error), flush=True)
