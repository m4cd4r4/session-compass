import { expect, test } from 'claude-code/testing'

import { EMPTY, noteContext, STALE_MS, claudeDir, claudeDirOf, headingOf, newlyDone, paneOpenOf, restoreFrom, rowOf, rowToWrite, sessionTitleOf, sessionsReport, tagOf, statusText, title, topicOf, whereFromGit } from './lib'
import type { Row } from './lib'

const steps = [
  { text: 'Spike', status: 'done' as const },
  { text: 'State and sources', status: 'done' as const },
  { text: 'Pane render', status: 'now' as const },
  { text: 'Tests', status: 'todo' as const },
]

test('title: repo, worktree slug, plan and stage', () => {
  const t = title({ ...EMPTY, repo: 'myapp', branch: 'feat/x', slug: 'feature-x', plan: 'Pricing wave 3', steps })
  expect(t).toBe('2/4 Pricing wave 3 · feature-x')
})

test('title: main branch is left out, a feature branch is shown', () => {
  expect(title({ ...EMPTY, repo: 'myapp', branch: 'main', plan: 'Fix nav' })).toBe('Fix nav')
  expect(title({ ...EMPTY, repo: 'myapp', branch: 'feat/nav', plan: 'Fix nav' })).toBe('Fix nav · feat/nav')
})

test('title: the plan is trimmed first and the stage survives the cap', () => {
  const t = title({ ...EMPTY, repo: 'myapp', slug: 'a-long-worktree-slug', plan: 'A very long plan name that runs on and on and on', steps }, 60)
  expect(t.length <= 60).toBe(true)
  expect(t.startsWith('2/4 A very')).toBe(true)
  expect(t.endsWith(' · a-long-worktree-slug')).toBe(true)
})

test('title: falls back to the first real prompt when there is no plan', () => {
  expect(title({ ...EMPTY, repo: 'myapp', topic: 'Fix the pricing table on mobile' })).toBe('Fix the pricing table on mobile')
})

test('title: a session tag leads, the stage and plan follow, the cap still holds', () => {
  const c = { ...EMPTY, repo: 'myapp', plan: 'Pricing table fix', steps: [{ text: 'a', status: 'done' as const }, { text: 'b', status: 'now' as const }] }
  expect(title(c, 60, '7b19a4')).toBe('[7b19a4] 1/2 Pricing table fix')
  expect(title({ ...c, plan: 'x'.repeat(80) }, 40, '7b19a4').length).toBeLessThanOrEqual(40)
  expect(title({ ...c, plan: 'x'.repeat(80) }, 40, '7b19a4').startsWith('[7b19a4] 1/2 ')).toBe(true)
})

test('sessionTitleOf and tagOf: a plan-less session gets the tag alone, once', () => {
  expect(tagOf('7B19A432-4e3e-4760-88d1-c02367218db3')).toBe('7b19a4')
  expect(tagOf('')).toBe('')
  expect(sessionTitleOf({ ...EMPTY, repo: 'myapp' }, '', '7b19a4')).toBe('[7b19a4]')
  expect(sessionTitleOf({ ...EMPTY, repo: 'myapp' }, '[7b19a4]', '7b19a4')).toBeUndefined()
  expect(sessionTitleOf({ ...EMPTY, repo: 'myapp', topic: 'Fix the pricing table on mobile' }, '[7b19a4]', '7b19a4')).toBe('[7b19a4] Fix the pricing table on mobile')
})

test('topicOf: "go" is not a topic', () => {
  expect(topicOf('go')).toBe('')
  expect(topicOf('continue from the handover')).toBe('continue from the handover')
})

test('topicOf: an injected tag block is not a topic', () => {
  expect(topicOf('<browser_instruction># Claude in Chrome browser automation tools are available')).toBe('')
  expect(topicOf('<system-reminder>\nplease keep working on the current task\n</system-reminder>\nfix the pricing table')).toBe('fix the pricing table')
})

test('sessionTitleOf: plan, else topic, sent only when it changes, never the bare repo', () => {
  const planned = { ...EMPTY, repo: 'myapp', plan: 'Pricing table fix', steps: [{ text: 'a', status: 'done' as const }, { text: 'b', status: 'now' as const }] }
  expect(sessionTitleOf(planned, '')).toBe('1/2 Pricing table fix')
  expect(sessionTitleOf(planned, '1/2 Pricing table fix')).toBeUndefined()
  expect(sessionTitleOf({ ...EMPTY, repo: 'myapp', topic: 'Fix the pricing table on mobile' }, '')).toBe('Fix the pricing table on mobile')
  expect(sessionTitleOf({ ...EMPTY, repo: 'myapp' }, '')).toBeUndefined()
})

test('restoreFrom: an empty compass takes the saved plan, steps and branch back', () => {
  const saved: Row = { ...rowOf('s1', { ...EMPTY, repo: 'myapp', branch: 'feat/x', plan: 'Pricing fix', shownTitle: '1/2 Pricing fix', steps: [{ text: 'a', status: 'done' }, { text: 'b', status: 'now' }] }), ended: true }
  const back = restoreFrom(EMPTY, saved)
  expect(back.plan).toBe('Pricing fix')
  // the title already shown is remembered, so a reopened session does not resend it over a hand-set name
  expect(back.shownTitle).toBe('1/2 Pricing fix')
  expect(back.steps).toEqual(saved.steps)
  expect(back.branch).toBe('feat/x')
  // a compass that already has a plan is left alone
  const live = { ...EMPTY, plan: 'Newer plan' }
  expect(restoreFrom(live, saved)).toBe(live)
})

test('rowToWrite: an empty compass never wipes a saved plan, it only marks the row ended', () => {
  const saved: Row = rowOf('s1', { ...EMPTY, plan: 'Pricing fix', steps: [{ text: 'a', status: 'now' }], updatedAt: 5 })
  const kept = rowToWrite(saved, 's1', { ...EMPTY, updatedAt: 9 }, true, '/w')
  expect(kept.plan).toBe('Pricing fix')
  expect(kept.steps).toEqual(saved.steps)
  expect(kept.ended).toBe(true)
  // a compass with content, or no saved row, writes as usual
  expect(rowToWrite(saved, 's1', { ...EMPTY, plan: 'Other', updatedAt: 9 }, false, '/w').plan).toBe('Other')
  expect(rowToWrite(undefined, 's1', EMPTY, false, '/w').plan).toBe('')
})

test('statusText and newlyDone', () => {
  expect(statusText({ ...EMPTY, steps })).toBe('2/4 · Now: Pane render')
  expect(statusText(EMPTY)).toBe(undefined)
  const after = steps.map(s => (s.text === 'Pane render' ? { ...s, status: 'done' as const } : s))
  expect(newlyDone(steps, after).map(s => s.text)).toEqual(['Pane render'])
})

test('whereFromGit: main checkout vs linked worktree, both slash styles', () => {
  expect(whereFromGit('C:/work/myapp', 'C:/work/myapp/.git')).toEqual({ repo: 'myapp', slug: '' })
  expect(whereFromGit('C:/work/myapp-feature-x', 'C:/work/myapp/.git')).toEqual({ repo: 'myapp', slug: 'feature-x' })
  expect(whereFromGit('C:\\work\\other', 'C:\\work\\myapp\\.git')).toEqual({ repo: 'myapp', slug: 'other' })
})

test('headingOf and claudeDirOf', () => {
  expect(headingOf('intro\n# Session Compass\n## Context')).toBe('Session Compass')
  expect(claudeDirOf('C:/Users/me/.claude/dev-mods/x/session-compass')).toBe('C:/Users/me/.claude')
  expect(claudeDirOf('C:\\Users\\me\\.claude\\plugins\\cache\\x')).toBe('C:\\Users\\me\\.claude')
})

test('claudeDir: config dir, then the plugin path, then home', () => {
  expect(claudeDir('C:/work/session-compass/mod', 'D:/cfg', 'C:/Users/me')).toBe('D:/cfg')
  expect(claudeDir('C:/Users/me/.claude/dev-mods/x/m', undefined, 'C:/Users/other')).toBe('C:/Users/me/.claude')
  expect(claudeDir('C:/work/session-compass/mod', undefined, 'C:/Users/me')).toBe('C:/Users/me/.claude')
  expect(claudeDir('C:/work/session-compass/mod')).toBe('')
})

test('sessionsReport: drops ended and stale rows, groups by repo, marks self', () => {
  const now = 10 * STALE_MS
  const row = (o: Partial<Row>): Row => ({ id: 'a', repo: 'myapp', where: '', plan: 'P', done: 0, total: 0, now: '', updatedAt: now - 60000, ...o })
  const report = sessionsReport([
    row({ id: 'self', where: 'pricing', plan: 'Pricing', done: 2, total: 5, now: 'Tests' }),
    row({ id: 'b', repo: 'azureprep', plan: 'Redis move' }),
    row({ id: 'old', plan: 'Stale one', updatedAt: now - STALE_MS - 1 }),
    row({ id: 'gone', plan: 'Ended one', ended: true }),
  ], 'self', now)
  expect(report).toBe([
    'azureprep',
    '    main · Redis move · 1m ago',
    'myapp',
    '  ▶ pricing · Pricing · 2/5 · now: Tests · 1m ago',
  ].join('\n'))
  expect(sessionsReport([], 'x', now)).toBe('No live sessions recorded.')
})

test('title: repo stands in when there is no plan or topic', () => {
  expect(title({ ...EMPTY, repo: 'myapp', branch: 'main' })).toBe('myapp')
})

test('rowOf: carries steps, branch and cwd for the sidebar', () => {
  const steps = [{ text: 'a', status: 'done' as const }, { text: 'b', status: 'now' as const }]
  const row = rowOf('id1', { ...EMPTY, repo: 'r', branch: 'feat/x', plan: 'P', steps, updatedAt: 5, shownTitle: '1/2 P' }, false, 'I:/r')
  expect(row).toMatchObject({ id: 'id1', repo: 'r', plan: 'P', done: 1, total: 2, now: 'b', steps, branch: 'feat/x', cwd: 'I:/r', title: '1/2 P' })
  expect(rowOf('id2', EMPTY).title).toBe('')
})

test('noteContext: empty note says nothing, a note carries its text and path', () => {
  expect(noteContext('  \n ', '/n.md')).toBe('')
  const c = noteContext('- test the tab switch\n', 'C:/x/restart-note.md')
  expect(c).toContain('- test the tab switch')
  expect(c).toContain('C:/x/restart-note.md')
  expect(c).toContain('first reply')
})

test('paneOpenOf: only an explicit open:true opens the pane', () => {
  expect(paneOpenOf('{"open":true}')).toBe(true)
  expect(paneOpenOf('{"open":false}')).toBe(false)
  expect(paneOpenOf('')).toBe(false)
  expect(paneOpenOf('{"open":"yes"}')).toBe(false)
  expect(paneOpenOf('not json')).toBe(false)
})
