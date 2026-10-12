import { expect, test } from 'claude-code/testing'

import { EMPTY, STALE_MS, claudeDir, claudeDirOf, headingOf, newlyDone, rowOf, sessionsReport, statusText, title, topicOf, whereFromGit } from './lib'
import type { Row } from './lib'

const steps = [
  { text: 'Spike', status: 'done' as const },
  { text: 'State and sources', status: 'done' as const },
  { text: 'Pane render', status: 'now' as const },
  { text: 'Tests', status: 'todo' as const },
]

test('title: repo, worktree slug, plan and stage', () => {
  const t = title({ ...EMPTY, repo: 'solaisoft', branch: 'feat/x', slug: 'pricing-wave3', plan: 'Pricing wave 3', steps })
  expect(t).toBe('2/4 Pricing wave 3 · pricing-wave3')
})

test('title: main branch is left out, a feature branch is shown', () => {
  expect(title({ ...EMPTY, repo: 'solaisoft', branch: 'main', plan: 'Fix nav' })).toBe('Fix nav')
  expect(title({ ...EMPTY, repo: 'solaisoft', branch: 'feat/nav', plan: 'Fix nav' })).toBe('Fix nav · feat/nav')
})

test('title: the plan is trimmed first and the stage survives the cap', () => {
  const t = title({ ...EMPTY, repo: 'solaisoft', slug: 'a-long-worktree-slug', plan: 'A very long plan name that runs on and on and on', steps }, 60)
  expect(t.length <= 60).toBe(true)
  expect(t.startsWith('2/4 A very')).toBe(true)
  expect(t.endsWith(' · a-long-worktree-slug')).toBe(true)
})

test('title: falls back to the first real prompt when there is no plan', () => {
  expect(title({ ...EMPTY, repo: 'solaisoft', topic: 'Fix the pricing table on mobile' })).toBe('Fix the pricing table on mobile')
})

test('topicOf: "go" is not a topic', () => {
  expect(topicOf('go')).toBe('')
  expect(topicOf('continue from the handover')).toBe('continue from the handover')
})

test('statusText and newlyDone', () => {
  expect(statusText({ ...EMPTY, steps })).toBe('2/4 · Now: Pane render')
  expect(statusText(EMPTY)).toBe(undefined)
  const after = steps.map(s => (s.text === 'Pane render' ? { ...s, status: 'done' as const } : s))
  expect(newlyDone(steps, after).map(s => s.text)).toEqual(['Pane render'])
})

test('whereFromGit: main checkout vs linked worktree, both slash styles', () => {
  expect(whereFromGit('I:/Scratch/solaisoft', 'I:/Scratch/solaisoft/.git')).toEqual({ repo: 'solaisoft', slug: '' })
  expect(whereFromGit('I:/Scratch/solaisoft-pricing-wave3', 'I:/Scratch/solaisoft/.git')).toEqual({ repo: 'solaisoft', slug: 'pricing-wave3' })
  expect(whereFromGit('I:\\Scratch\\other', 'I:\\Scratch\\solaisoft\\.git')).toEqual({ repo: 'solaisoft', slug: 'other' })
})

test('headingOf and claudeDirOf', () => {
  expect(headingOf('intro\n# Session Compass\n## Context')).toBe('Session Compass')
  expect(claudeDirOf('C:/Users/me/.claude/dev-mods/x/session-compass')).toBe('C:/Users/me/.claude')
  expect(claudeDirOf('C:\\Users\\me\\.claude\\plugins\\cache\\x')).toBe('C:\\Users\\me\\.claude')
})

test('claudeDir: config dir, then the plugin path, then home', () => {
  expect(claudeDir('I:/Scratch/session-compass/mod', 'D:/cfg', 'C:/Users/me')).toBe('D:/cfg')
  expect(claudeDir('C:/Users/me/.claude/dev-mods/x/m', undefined, 'C:/Users/other')).toBe('C:/Users/me/.claude')
  expect(claudeDir('I:/Scratch/session-compass/mod', undefined, 'C:/Users/me')).toBe('C:/Users/me/.claude')
  expect(claudeDir('I:/Scratch/session-compass/mod')).toBe('')
})

test('sessionsReport: drops ended and stale rows, groups by repo, marks self', () => {
  const now = 10 * STALE_MS
  const row = (o: Partial<Row>): Row => ({ id: 'a', repo: 'solaisoft', where: '', plan: 'P', done: 0, total: 0, now: '', updatedAt: now - 60000, ...o })
  const report = sessionsReport([
    row({ id: 'self', where: 'pricing', plan: 'Pricing', done: 2, total: 5, now: 'Tests' }),
    row({ id: 'b', repo: 'azureprep', plan: 'Redis move' }),
    row({ id: 'old', plan: 'Stale one', updatedAt: now - STALE_MS - 1 }),
    row({ id: 'gone', plan: 'Ended one', ended: true }),
  ], 'self', now)
  expect(report).toBe([
    'azureprep',
    '    main · Redis move · 1m ago',
    'solaisoft',
    '  ▶ pricing · Pricing · 2/5 · now: Tests · 1m ago',
  ].join('\n'))
  expect(sessionsReport([], 'x', now)).toBe('No live sessions recorded.')
})

test('title: repo stands in when there is no plan or topic', () => {
  expect(title({ ...EMPTY, repo: 'solaisoft', branch: 'main' })).toBe('solaisoft')
})

test('rowOf: carries steps, branch and cwd for the sidebar', () => {
  const steps = [{ text: 'a', status: 'done' as const }, { text: 'b', status: 'now' as const }]
  const row = rowOf('id1', { ...EMPTY, repo: 'r', branch: 'feat/x', plan: 'P', steps, updatedAt: 5 }, false, 'I:/r')
  expect(row).toMatchObject({ id: 'id1', repo: 'r', plan: 'P', done: 1, total: 2, now: 'b', steps, branch: 'feat/x', cwd: 'I:/r' })
})
