import type { Compass, Step, StepStatus } from '../types'

export const EMPTY: Compass = { repo: '', branch: '', slug: '', plan: '', topic: '', steps: [], updatedAt: 0 }

export const stage = (steps: readonly Step[]) => ({
  done: steps.filter(s => s.status === 'done').length,
  total: steps.length,
  now: steps.find(s => s.status === 'now')?.text ?? '',
})

const cut = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`

export const whereLabel = (c: Compass) =>
  c.slug || (c.branch && c.branch !== 'main' && c.branch !== 'master' ? c.branch : '')

// 3/7 plan · branch-or-slug, capped; the plan gives way first. Stage leads because
// the tab cuts at ~22 characters; the repo is left out (Peacock tells workspaces apart)
// and stands in only when there is no plan. A session tag leads ("[7b19a4] "), so it survives
// the tab cut; with a tag and nothing else to say, the tag alone is the title
export const title = (c: Compass, max = 60, tag = ''): string => {
  if (tag) {
    if (!c.plan && !c.topic) return `[${tag}]`
    const lead = `[${tag}] `
    return `${lead}${title(c, max - lead.length)}`
  }
  const { done, total } = stage(c.steps)
  const head = total > 0 ? `${done}/${total} ` : ''
  const label = c.plan || c.topic || c.repo
  const where = whereLabel(c)
  const tail = where ? ` · ${where}` : ''
  const room = max - head.length - tail.length
  if (room < 8) return cut(`${head}${label}`, max)
  return `${head}${cut(label, room)}${tail}`
}

// The tab title is a rename of the session: the plan, else the first real prompt. It is sent
// only when it differs from the last one shown, so a name set by hand survives later prompts,
// and the bare repo name never stands in (it would label every plan-less tab the same)
export const sessionTitleOf = (c: Compass, previous: string | undefined, tag = '', max = 60) => {
  if (!c.plan && !c.topic && !tag) return undefined
  const next = title(c, max, tag)
  return next && next !== previous ? next : undefined
}

// First 6 characters of the session UUID: what the title, the row and who-owns can all show
export const tagOf = (sessionId: string) => sessionId.replace(/-/g, '').slice(0, 6).toLowerCase()

export const detailText = (c: Compass) => {
  const { done, total, now } = stage(c.steps)
  const lines = [
    [c.repo || '?', whereLabel(c) || c.branch].filter(Boolean).join(' · '),
    c.plan || c.topic || 'No plan reported yet',
  ]
  if (total > 0) lines.push(`${bar(done, total)} ${done}/${total}`)
  if (now) lines.push(`▶ Now: ${now}`)
  for (const s of c.steps) if (s.status === 'done') lines.push(`✓ ${s.text}`)
  for (const s of c.steps) if (s.status === 'todo') lines.push(`○ ${s.text}`)
  return lines.join('\n')
}

export const statusText = (c: Compass) => {
  const { done, total, now } = stage(c.steps)
  if (total === 0) return undefined
  return now ? `${done}/${total} · Now: ${cut(now, 50)}` : `${done}/${total}`
}

export const bar = (done: number, total: number, width = 12) => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// The tool's `steps` input as clean Steps: text capped, bad status falls to todo, detail kept only when it says something
export const stepsFromInput = (input: unknown): Step[] =>
  Array.isArray(input)
    ? input
        .filter((s: any) => s && typeof s.text === 'string')
        .map((s: any): Step => {
          const step: Step = {
            text: String(s.text).slice(0, 120),
            status: (['done', 'now', 'todo'].includes(s.status) ? s.status : 'todo') as StepStatus,
          }
          const detail = typeof s.detail === 'string' ? s.detail.trim().slice(0, 400) : ''
          return detail ? { ...step, detail } : step
        })
    : []

export const newlyDone =(before: readonly Step[], after: readonly Step[]) =>
  after.filter(s => s.status === 'done' && !before.some(b => b.text === s.text && b.status === 'done'))

// A prompt only counts as a topic when it says something: "go" does not
// Injected blocks (<system-reminder>, <browser_instruction>) are not what the person typed
export const topicOf = (prompt: string) => {
  const typed = prompt
    .replace(/<([a-z][\w-]*)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[a-z][\w-]*>[\s\S]*$/i, '')
  const line = typed.trim().split(/\r?\n/)[0] ?? ''
  return line.split(/\s+/).filter(Boolean).length >= 4 ? cut(line, 48) : ''
}

export const headingOf = (markdown: string) => {
  const m = /^#\s+(.+)$/m.exec(markdown)
  return m?.[1]?.trim() ?? ''
}

const base = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''

export const whereFromGit = (toplevel: string, commonDir: string) => {
  const repoRoot = commonDir.replace(/[\\/]+\.git[\\/]*$/, '')
  const repo = base(repoRoot) || base(toplevel)
  const top = base(toplevel)
  const slug = top && top !== repo ? (top.startsWith(`${repo}-`) ? top.slice(repo.length + 1) : top) : ''
  return { repo, slug }
}

export const claudeDirOf = (path: string) => /^(.*?[\\/]\.claude)[\\/]/.exec(path)?.[1] ?? ''

// A mod installed from its own repo has no .claude in its path: fall back to the config dir, then home
export const claudeDir = (root: string, configDir?: string, home?: string) =>
  configDir || claudeDirOf(root) || (home ? `${home}/.claude` : '')

export const NOTE_FILE = 'restart-note.md'

/** What a fresh session is told about the restart note; empty when there is no note. */
export const noteContext = (text: string, path: string) => {
  const note = text.trim()
  if (!note) return ''
  return [
    `Restart note (the person's reminder of where to start after restarting their sessions; file ${path}):`,
    note,
    'Tell the person this note in the first line of your first reply, before anything else.',
    'Edit the file only when they ask: add a line when they say "add a restart note", remove a line when they say that item is done.',
  ].join('\n')
}

export type Row = {
  id: string
  repo: string
  where: string
  plan: string
  done: number
  total: number
  now: string
  updatedAt: number
  ended?: boolean
  // Read by the VS Code sidebar; rows written before 0.2.0 lack them
  steps?: Step[]
  branch?: string
  cwd?: string
  title?: string
}

export const STALE_MS = 6 * 60 * 60 * 1000

export const rowOf = (id: string, c: Compass, ended = false, cwd = ''): Row => {
  const { done, total, now } = stage(c.steps)
  return {
    id, repo: c.repo, where: whereLabel(c), plan: c.plan || c.topic, done, total, now, updatedAt: c.updatedAt, ended,
    steps: c.steps, branch: c.branch, cwd, title: c.shownTitle ?? '',
  }
}

const isEmpty = (c: Compass) => !c.plan && !c.topic && c.steps.length === 0

// A reopened session starts with an empty compass; its saved row still knows the plan.
// A row's plan may only be the first prompt, so it counts as a plan only when it has steps.
export const restoreFrom = (c: Compass, saved: Row): Compass => {
  if (!isEmpty(c) || !saved.plan) return c
  const steps = saved.steps ?? []
  return {
    ...c,
    branch: c.branch || saved.branch || '',
    shownTitle: saved.title || undefined,
    ...(steps.length > 0 ? { plan: saved.plan, steps } : { topic: saved.plan }),
  }
}

// The row to put on disk: an empty compass must not replace a row that holds a plan
export const rowToWrite = (existing: Row | undefined, id: string, c: Compass, ended: boolean, cwd: string): Row => {
  const wipes = isEmpty(c) && existing && (existing.plan || (existing.steps?.length ?? 0) > 0)
  return wipes ? { ...existing, ended } : rowOf(id, c, ended, cwd)
}

export const sessionsReport = (rows: readonly Row[], selfId: string, nowMs: number) => {
  const live = rows.filter(r => !r.ended && nowMs - r.updatedAt < STALE_MS)
  if (live.length === 0) return 'No live sessions recorded.'
  const ago = (ms: number) => {
    const m = Math.max(0, Math.round(ms / 60000))
    return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`
  }
  const byRepo = new Map<string, Row[]>()
  for (const r of live) byRepo.set(r.repo || '?', [...(byRepo.get(r.repo || '?') ?? []), r])
  const lines: string[] = []
  for (const [repo, list] of [...byRepo].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(repo)
    for (const r of [...list].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const parts = [r.where || 'main', r.plan || '(no plan yet)']
      if (r.total > 0) parts.push(`${r.done}/${r.total}`)
      if (r.now) parts.push(`now: ${r.now}`)
      parts.push(ago(nowMs - r.updatedAt))
      lines.push(`  ${r.id === selfId ? '▶' : ' '} ${parts.join(' · ')}`)
    }
  }
  return lines.join('\n')
}

/** How often a session reads its pane flag, which the extension's hover card writes. */
export const PANE_POLL_MS = 2000

/** Whether the pane flag file asks for the pane; no file or a bad one is off. */
export const paneOpenOf = (text: string) => {
  try { return (JSON.parse(text) as { open?: unknown })?.open === true } catch { return false }
}
