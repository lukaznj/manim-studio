import assert from 'node:assert/strict'
import { test } from 'node:test'
import { intakeSetTitle, joinVtt, parseIntake, parseSolution, searchScore, snippet, splitTyped, vttToSrt } from './exercise.ts'

test('a solution reads as its front matter and steps', () => {
  const s = parseSolution(
    '---\ntopic: Integration by parts\ntags: [integrals, "calculus"]\nanswer: $x e^x - e^x + C$\n---\n# Integral of x e^x\n\nWe use parts.\n\n## Choose u and dv\nLet $u = x$.\n\n## Integrate\n$$\\int x e^x\\,dx$$\n',
  )
  assert.equal(s.topic, 'Integration by parts')
  assert.deepEqual(s.tags, ['integrals', 'calculus'])
  assert.equal(s.answer, '$x e^x - e^x + C$')
  assert.equal(s.intro, 'We use parts.')
  assert.deepEqual(
    s.steps.map((x) => x.title),
    ['Choose u and dv', 'Integrate'],
  )
  assert.equal(s.steps[1].body, '$$\\int x e^x\\,dx$$')
})

test('the intake answer keeps LaTeX as written and only files that were given', () => {
  const answer = [
    'set: Fractions and motion',
    '=== EXERCISE ===',
    'title: A fraction',
    'file: sheet.pdf',
    'pages: 2-3',
    '---',
    'Simplify $\\frac{a}{b}$.',
    '=== EXERCISE ===',
    'file: other.png',
    '---',
    'A ball is thrown at $v_0 = 12\\,\\mathrm{m/s}$.',
    '=== EXERCISE ===',
    'title: Empty',
    '---',
  ].join('\n')
  const out = parseIntake(answer, ['sheet.pdf'])
  assert.equal(intakeSetTitle(answer), 'Fractions and motion')
  assert.equal(out.length, 2)
  assert.deepEqual(out[0], { title: 'A fraction', statement: 'Simplify $\\frac{a}{b}$.', file: 'sheet.pdf', pages: '2-3' })
  assert.equal(out[1].title, 'Exercise 2')
  assert.equal(out[1].file, undefined)
})

test('typed exercises split on numbers or blank lines', () => {
  assert.deepEqual(splitTyped('1. Solve x+1=2\n2) Find the vertex'), ['Solve x+1=2', 'Find the vertex'])
  assert.deepEqual(splitTyped('Solve x+1=2\n\nFind the vertex\nof y = x^2'), ['Solve x+1=2', 'Find the vertex\nof y = x^2'])
  assert.deepEqual(splitTyped('  '), [])
})

test('search needs every word, ignores accents and ranks titles first', () => {
  const doc = { title: 'Kosi hitac', topic: 'Kinematika', tags: ['fizika'], problem: 'Lopta je bačena brzinom 12 m/s.', solution: 'Domet je 14,7 m.' }
  assert.ok(searchScore('bacena lopta', doc) > 0)
  assert.equal(searchScore('bacena integral', doc), 0)
  assert.ok(searchScore('hitac', doc) > searchScore('domet', doc))
  assert.equal(snippet('domet', 'a '.repeat(200) + 'Domet je 14,7 m.', 40).includes('Domet'), true)
})

test('subtitles of several videos join with their offsets', () => {
  const a = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nHello\n'
  const b = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nAgain\n'
  const joined = joinVtt([
    { text: a, offset: 0 },
    { text: b, offset: 62.5 },
  ])
  assert.equal(joined, 'WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nHello\n\n1\n00:01:03.500 --> 00:01:05.500\nAgain\n')
  assert.equal(vttToSrt(joined), '1\n00:00:00,000 --> 00:00:02,500\nHello\n\n2\n00:01:03,500 --> 00:01:05,500\nAgain\n')
})
