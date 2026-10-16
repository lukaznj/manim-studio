import assert from 'node:assert/strict'
import { test } from 'node:test'
import { momentNote } from './moment.ts'

const voice = (start: number, end: number, text: string) => ({ start, end, text, line: null, key: '', source: 'elevenlabs' as const, audio: '', bookmarks: [] })
const t = {
  sections: [
    { name: 'Uvod', start: 0, end: 10, line: null },
    { name: 'Kirchhoff', start: 10, end: 200, line: null },
  ],
  voice: [voice(0, 8, 'Dobar dan.'), voice(10, 20, 'Struja se dijeli.'), voice(20, 30, 'Kroz R dva tri teče manje.')],
}

test('a moment names its time, section and the narration there and just before', () => {
  assert.equal(momentNote(t, 192.4), 'at 3:12, in the section "Kirchhoff", where the narration says: "Struja se dijeli. Kroz R dva tri teče manje."')
  assert.equal(momentNote(t, 25), 'at 0:25, in the section "Kirchhoff", where the narration says: "Struja se dijeli. Kroz R dva tri teče manje."')
  assert.equal(momentNote(t, 3), 'at 0:03, in the section "Uvod", where the narration says: "Dobar dan."')
  assert.equal(momentNote(null, 65), 'at 1:05')
})
