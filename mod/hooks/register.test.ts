/**
 * The pane toggle in register.tsx, run against the engine: claude plugin test mod
 * The flag file the extension writes, the session and git are faked beneath the plugin.
 */
import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const FLAG = 'C:/cfg/session-compass/panes/sess-1.json'

type World = { flag?: string, open: string[], closed: string[], writes: { path: string, text: string }[], statuses: (string | undefined)[] }

function world(on: On, w: World) {
  mock.env(on, { CLAUDE_CONFIG_DIR: 'C:/cfg' })
  const shown = new Set<string>()
  on('session.id', async () => ({ value: 'sess-1' }))
  on('session.root', async () => ({ value: 'C:/work/repo' }))
  on('process.run', async () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never)
  on('fs.read', async (_$, e) => {
    const path = e.path.split(String.fromCharCode(92)).join('/')
    if (path === FLAG && w.flag !== undefined) return { value: w.flag }
    return { deny: `ENOENT ${e.path}` }
  })
  on('fs.write', async (_$, e) => {
    const path = e.path.split(String.fromCharCode(92)).join('/')
    w.writes.push({ path, text: e.text })
    if (path === FLAG) w.flag = e.text
    return { value: undefined }
  })
  on('fs.list', async () => ({ value: [] }))
  on('tool.register', async () => ({ value: undefined }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.status', async (_$, e) => { w.statuses.push(e.text); return { value: undefined } })
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [...shown].map(id => ({ id, title: 'Compass', isShown: true, isFocused: false, isPlaced: true })) }) as never)
  on('ui.open', async (_$, e) => { shown.add(e.id); w.open.push(e.id); return { value: { isPlaced: true } } as never })
  on('ui.close', async (_$, e) => { shown.delete(e.id); w.closed.push(e.id); return { value: undefined } as never })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
}

const fresh = (): World => ({ open: [], closed: [], writes: [], statuses: [] })
const start = { cwd: 'C:/work/repo', surface: 'terminal', isInteractive: true } as const

test('no flag: the pane stays closed, at start and on the poll', async ($, on) => {
  const w = fresh()
  const clock = mock.clock(on)
  world(on, w)
  await $.session.start(start)
  await clock.settle()
  await clock.advance(10_000)
  expect(w.open).toEqual([])
})

test('the flag turned on opens the pane on the next poll; turned off closes it', async ($, on) => {
  const w = fresh()
  const clock = mock.clock(on)
  world(on, w)
  await $.session.start(start)
  await clock.settle()
  w.flag = '{"open":true}'
  await clock.advance(2_000)
  expect(w.open).toEqual(['compass'])
  await clock.advance(4_000)
  expect(w.open).toEqual(['compass'])
  w.flag = '{"open":false}'
  await clock.advance(2_000)
  expect(w.closed).toEqual(['compass'])
})

test('status_line off: no status line from a compass update', { options: { status_line: false } }, async ($, on) => {
  const w = fresh()
  const clock = mock.clock(on)
  world(on, w)
  await $.session.start(start)
  await clock.settle()
  await $.tool.call({ tool: 'mcp__session-compass__compass', tool_use_id: 't1', plan: 'P', steps: [{ text: 'a', status: 'now' }] } as never)
  expect(w.statuses).toEqual([])
})

test('status_line on (default): a compass update writes the status line', async ($, on) => {
  const w = fresh()
  const clock = mock.clock(on)
  world(on, w)
  await $.session.start(start)
  await clock.settle()
  await $.tool.call({ tool: 'mcp__session-compass__compass', tool_use_id: 't1', plan: 'P', steps: [{ text: 'a', status: 'now' }] } as never)
  expect(w.statuses.length).toBeGreaterThan(0)
})
