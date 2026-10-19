import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Compass, Step } from '../types'
import {
  EMPTY, NOTE_FILE, PANE_POLL_MS, bar, claudeDir, detailText, noteContext, headingOf, newlyDone, paneOpenOf, restoreFrom, rowToWrite, sessionTitleOf, sessionsReport,
  stage, statusText, stepsFromInput, tagOf, title, topicOf, whereFromGit, whereLabel,
} from './lib'
import type { Row } from './lib'

const PLUGIN = 'session-compass'
const PANE = 'compass'
const PLAN_FILE = /[\\/]\.claude[\\/]plans[\\/][^\\/]+\.md$/i
const GIT_MOVE = /\bgit\s+(checkout|switch|worktree)\b|\bcd\s/

const compass = atom({ plugin: 'session-compass', key: 'compass' } as const, EMPTY)

const GUIDE = [
  'Session compass: the person runs many sessions in parallel and orients by a panel fed by the `compass` tool.',
  'Call it (one call, no narration about it) when you start a task of 3+ steps, when a step starts or finishes, and when the plan changes.',
  'Give `plan` as a 3-6 word name of the feature or job, and `steps` as the whole list each time, each step under 8 words.',
  'Add a `detail` (1-2 plain sentences) to a step when its label alone does not say what it covers; resend it with the whole list.',
  'Skip it for one-shot questions.',
].join(' ')

async function git($: EngineInterface, args: string[]) {
  const cwd = await $.session.root()
  const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 }).catch(() => undefined)
  return r && r.exitCode === 0 ? r.stdout.trim() : ''
}

// The status_line option; register sets it on every load
let showStatus = true

// Everything that writes state goes through here: title source, pane, status, shared file
async function save($: EngineInterface, change: (c: Compass) => Compass) {
  const before = await read($, compass)
  const after = { ...change(before), updatedAt: await $.clock.now() }
  await update($, compass, () => after)
  if (showStatus) $.ui.status(statusText(after))
  const { total } = stage(after.steps)
  for (const s of newlyDone(before.steps, after.steps)) {
    $.ui.toast(`Done ${stage(after.steps).done}/${total}: ${s.text}`)
  }
  await writeRow($, after, false)
  return after
}

async function rowsDir($: EngineInterface) {
  const [configDir, home, profile] = await Promise.all([
    $.env.get('CLAUDE_CONFIG_DIR'), $.env.get('HOME'), $.env.get('USERPROFILE'),
  ])
  return claudeDir($.plugin.root, configDir, home || profile)
}

async function readRow($: EngineInterface): Promise<Row | undefined> {
  const dir = await rowsDir($)
  if (!dir) return undefined
  const text = await $.fs.read(`${dir}/session-compass/${await $.session.id()}.json`).catch(() => '')
  try { return JSON.parse(String(text ?? '')) as Row } catch { return undefined }
}

async function writeRow($: EngineInterface, c: Compass, ended: boolean) {
  const dir = await rowsDir($)
  if (!dir) return
  const id = await $.session.id()
  const row = rowToWrite(await readRow($), id, c, ended, await $.session.root())
  await $.fs.write(`${dir}/session-compass/${id}.json`, JSON.stringify(row)).catch(() => undefined)
}

// A reopened session starts with an empty atom; its saved row still holds the plan
async function restoreSaved($: EngineInterface) {
  const saved = await readRow($)
  if (!saved) return
  const now = await read($, compass)
  const back = restoreFrom(now, saved)
  if (back !== now) await update($, compass, () => back)
}

async function refreshWhere($: EngineInterface) {
  const [top, common, branch] = await Promise.all([
    git($, ['rev-parse', '--show-toplevel']),
    git($, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
    git($, ['rev-parse', '--abbrev-ref', 'HEAD']),
  ])
  const cwd: string = await $.session.root()
  const where = top ? whereFromGit(top, common || `${top}/.git`) : whereFromGit(cwd, '')
  const now = await read($, compass)
  if (now.repo === where.repo && now.slug === where.slug && now.branch === branch) return now
  return save($, c => ({ ...c, ...where, branch }))
}

// The pane is off until the person turns it on from the extension's hover card, per session
async function paneFile($: EngineInterface) {
  const dir = await rowsDir($)
  return dir ? `${dir}/session-compass/panes/${await $.session.id()}.json` : ''
}

async function writePaneFlag($: EngineInterface, open: boolean) {
  const path = await paneFile($)
  if (path) await $.fs.write(path, JSON.stringify({ open })).catch(() => undefined)
}

async function syncPane($: EngineInterface) {
  const path = await paneFile($)
  if (!path) return
  const want = paneOpenOf(String((await $.fs.read(path).catch(() => '')) ?? ''))
  const panes = await $.ui.panes().catch(() => [])
  const shown = panes.some((p: { id: string }) => p.id === PANE)
  if (want && !shown) await $.ui.open({ id: PANE, title: 'Compass' })
  if (!want && shown) await $.ui.close({ id: PANE })
}

let paneTick: { cancel: () => void } | undefined

export const register: Register = (on, options) => {
  showStatus = options.status_line !== false
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'compass',
      description:
        'Report where this session is so the person can orient across parallel sessions. ' +
        'Send the plan name and the WHOLE step list each call; status is done, now or todo (at most one now).',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: '3-6 word name of the feature or job' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                status: { type: 'string', enum: ['done', 'now', 'todo'] },
                detail: { type: 'string', description: 'Optional, 1-2 plain sentences: what this step covers or its sub-steps. Shown when the person clicks the step.' },
              },
              required: ['text', 'status'],
            },
          },
        },
      },
    })
    await $.command.register({ name: 'sessions', description: 'List every live Claude session: repo, branch, plan, stage, now' })
    await $.command.register({ name: 'compass', description: 'Print the plan, stage, done, now and todo of this session' })
    await restoreSaved($)
    await refreshWhere($)
    paneTick?.cancel()
    paneTick = $.clock.every(PANE_POLL_MS, () => syncPane($).catch(() => undefined))
    await syncPane($).catch(() => undefined)
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return { sections: [...r.sections, { id: `${PLUGIN}:guide`, text: GUIDE, scope: 'session' as const }] }
  })

  // The restart note reaches a session started fresh, not one continued by /clear or a compact
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const source = (e as { source?: string }).source
    if (source === 'clear' || source === 'compact') return r
    const dir = await rowsDir($)
    if (!dir) return r
    const path = `${dir}/session-compass/${NOTE_FILE}`
    const text = await $.fs.read(path).catch(() => '')
    const context = noteContext(String(text ?? ''), path)
    return context ? { ...r, additionalContext: [...(r.additionalContext ?? []), context] } : r
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const r = await next(e)
    const topic = topicOf(e.prompt ?? '')
    let c = await refreshWhere($)
    if (topic && !c.topic) c = await save($, x => ({ ...x, topic }))
    const previous = c.shownTitle
    const tag = tagOf(await $.session.id())
    const shownTitle = title(c, 60, tag)
    const sessionTitle = sessionTitleOf(c, previous, tag)
    if (shownTitle !== previous) c = await save($, x => ({ ...x, shownTitle }))
    return { ...r, sessionTitle }
  }).catch(($, e, next) => next(e))

  // The cast: the generated tool types list MCP servers' tools, not this mod's own
  on('tool.call', { tool: 'mcp__session-compass__compass' as 'Bash' }, async ($, e: any) => {
    const input = (e.input ?? e) as { plan?: unknown; steps?: unknown }
    const steps: Step[] = stepsFromInput(input.steps)
    const c = await save($, x => ({
      ...x,
      plan: typeof input.plan === 'string' && input.plan.trim() ? input.plan.trim().slice(0, 80) : x.plan,
      steps: Array.isArray(input.steps) ? steps : x.steps,
    }))
    const { done, total } = stage(c.steps)
    return { result: `Compass updated: ${c.plan || '(no plan)'} ${done}/${total}` }
  }).catch(() => ({ result: 'Compass update failed; carry on.' }))

  // A plan written in plan mode names the plan, unless the model already did
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (!ran.isError && !ran.deny && PLAN_FILE.test(e.file_path)) {
      const heading = headingOf(e.content)
      if (heading) await save($, c => (c.plan ? c : { ...c, plan: heading }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (GIT_MOVE.test(e.command)) await refreshWhere($)
    return ran
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'sessions' }, async $ => {
    const dir = await rowsDir($)
    const self = await $.session.id()
    await writeRow($, await read($, compass), false)
    const files = await $.fs.list(`${dir}/session-compass`).catch(() => [])
    const rows: Row[] = []
    for (const f of files) {
      if (!f.name.endsWith('.json')) continue
      const text = await $.fs.read(`${dir}/session-compass/${f.name}`).catch(() => '')
      try { rows.push(JSON.parse(text as string)) } catch { /* half-written file */ }
    }
    return { text: sessionsReport(rows, self, await $.clock.now()) }
  })

  // The Pane does not draw in the VS Code panel, so the detail is printed on demand
  on('command.run', { command: 'compass' }, async $ => {
    return { text: detailText(await read($, compass)) }
  })

  // Closed by hand: record it, or the next poll opens it again
  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') await writePaneFlag($, false)
    return r
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    paneTick?.cancel()
    await writeRow($, await read($, compass), true)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const c = await read($, compass)
    const { done, total, now } = stage(c.steps)
    const doneSteps = c.steps.filter(s => s.status === 'done')
    const todo = c.steps.filter(s => s.status === 'todo')
    const where = [c.repo || '?', whereLabel(c) || c.branch].filter(Boolean).join(' · ')

    return (
      <Box flexDirection="column">
        <Text bold>{where}</Text>
        <Text>{c.plan || c.topic || 'No plan reported yet'}</Text>
        {total > 0 && <Text>{bar(done, total)} {done}/{total}</Text>}
        {now && <Text>▶ Now: {now}</Text>}
        {doneSteps.length > 3 && <Text dimColor>✓ {doneSteps.length - 3} earlier done</Text>}
        {doneSteps.slice(-3).map(s => <Text dimColor>✓ {s.text}</Text>)}
        {todo.slice(0, 5).map(s => <Text>○ {s.text}</Text>)}
        {todo.length > 5 && <Text dimColor>+{todo.length - 5} more</Text>}
      </Box>
    )
  })
}
