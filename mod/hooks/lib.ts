import type { Compass, Step } from '../types'

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
// and stands in only when there is no plan
export const title = (c: Compass, max = 60) => {
  const { done, total } = stage(c.steps)
  const head = total > 0 ? `${done}/${total} ` : ''
  const label = c.plan || c.topic || c.repo
  const where = whereLabel(c)
  const tail = where ? ` · ${where}` : ''
  const room = max - head.length - tail.length
  if (room < 8) return cut(`${head}${label}`, max)
  return `${head}${cut(label, room)}${tail}`
}

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

export const newlyDone = (before: readonly Step[], after: readonly Step[]) =>
  after.filter(s => s.status === 'done' && !before.some(b => b.text === s.text && b.status === 'done'))

// A prompt only counts as a topic when it says something: "go" does not
export const topicOf = (prompt: string) => {
  const line = prompt.trim().split(/\r?\n/)[0] ?? ''
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
}

export const STALE_MS = 6 * 60 * 60 * 1000

export const rowOf = (id: string, c: Compass, ended = false): Row => {
  const { done, total, now } = stage(c.steps)
  return { id, repo: c.repo, where: whereLabel(c), plan: c.plan || c.topic, done, total, now, updatedAt: c.updatedAt, ended }
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
