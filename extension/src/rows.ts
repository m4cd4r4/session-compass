// Pure logic for the sidebar: no vscode import, so node --test runs it directly.

export type StepStatus = "done" | "now" | "todo";
export type Step = { text: string; status: StepStatus };

/** One file per session in ~/.claude/session-compass/, written by the mod (lib.ts rowOf). */
export type Row = {
  id: string;
  repo: string;
  where: string;
  plan: string;
  done: number;
  total: number;
  now: string;
  updatedAt: number;
  ended?: boolean;
  steps?: Step[];
  branch?: string;
  cwd?: string;
  /** The tab title the mod last set; the active tab's label is matched to it. */
  title?: string;
};

export const STALE_MS = 6 * 60 * 60 * 1000;
/** Rows older than this are dropped from the view entirely. */
export const GONE_MS = 24 * 60 * 60 * 1000;

export const isRow = (v: unknown): v is Row => {
  const r = v as Row;
  return !!r && typeof r.id === "string" && typeof r.updatedAt === "number";
};

export const isStale = (r: Row, nowMs: number) => nowMs - r.updatedAt >= STALE_MS;

/**
 * Live and recently idle rows, newest first. Dropped: ended, day-old, and sessions that never got a
 * message or a plan (the mod's plan falls back to the first message, so an empty plan with no steps
 * is a window that was opened and left).
 */
export const visibleRows = (rows: readonly Row[], nowMs: number) =>
  rows
    .filter((r) => !r.ended && nowMs - r.updatedAt < GONE_MS && (r.plan || r.total > 0))
    .sort((a, b) => b.updatedAt - a.updatedAt);

export type Group = { repo: string; rows: Row[] };

/** Groups by repo; a group's order is its newest row's, so the busiest repo is on top. */
export const groupByRepo = (rows: readonly Row[]): Group[] => {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.repo || "(no repo)";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([repo, rs]) => ({ repo, rows: [...rs].sort((a, b) => b.updatedAt - a.updatedAt) }))
    .sort((a, b) => b.rows[0].updatedAt - a.rows[0].updatedAt);
};

export const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
};

export const bar = (done: number, total: number, width = 8) => {
  if (total <= 0) return "";
  const full = Math.round((done / total) * width);
  return "■".repeat(full) + "□".repeat(width - full);
};

const cut = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

export const planOf = (r: Row) => r.plan || "(no plan yet)";

/** The tree row's grey text: stage, branch or worktree, age. */
export const description = (r: Row, nowMs: number) => {
  const parts: string[] = [];
  if (r.total > 0) parts.push(`${r.done}/${r.total}`);
  const where = r.where || (r.branch && r.branch !== "main" && r.branch !== "master" ? r.branch : "");
  if (where) parts.push(where);
  parts.push(isStale(r, nowMs) ? `idle ${ago(nowMs - r.updatedAt)}` : ago(nowMs - r.updatedAt));
  return parts.join(" · ");
};

/** Steps, falling back to the one "now" line older rows carry. */
export const stepsOf = (r: Row): Step[] =>
  r.steps && r.steps.length > 0 ? r.steps : r.now ? [{ text: r.now, status: "now" }] : [];

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

const inside = (path: string, folder: string) => {
  const p = norm(path);
  const f = norm(folder);
  return p === f || p.startsWith(`${f}/`);
};

/** The newest live row whose cwd sits in one of the window's folders, else one whose repo names a folder. */
export const rowForWorkspace = (rows: readonly Row[], folders: readonly string[], nowMs: number): Row | undefined => {
  const live = visibleRows(rows, nowMs).filter((r) => !isStale(r, nowMs));
  const byCwd = live.find((r) => r.cwd && folders.some((f) => inside(r.cwd!, f)));
  if (byCwd) return byCwd;
  const names = folders.map((f) => norm(f).split("/").pop());
  return live.find((r) => !r.cwd && r.repo && names.includes(r.repo.toLowerCase()));
};

/**
 * The row whose recorded title is this tab's label; newest wins when two sessions share a title.
 * VS Code cuts a long tab label to ~24 characters plus "…", so a cut label matches the title it starts.
 */
export const rowForTab = (rows: readonly Row[], label: string, nowMs: number): Row | undefined => {
  const l = label.trim();
  const cutAt = l.endsWith("…") ? l.slice(0, -1).trimEnd() : undefined;
  if (!l || cutAt === "") return undefined;
  return visibleRows(rows, nowMs).find((r) => {
    const t = r.title?.trim();
    if (!t) return false;
    return cutAt === undefined ? t === l : t === l || t.startsWith(cutAt);
  });
};

export const isInWorkspace =(r: Row, folders: readonly string[]) =>
  !!r.cwd && folders.some((f) => inside(r.cwd!, f));

export const NOTE_FILE = "restart-note.md";

/** The note's items: one per non-blank line, list markers dropped. */
export const noteLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim())
    .filter(Boolean);

/** Status bar text for this window's session. */
export const statusText = (r: Row) => {
  const stage = r.total > 0 ? `${r.done}/${r.total} ` : "";
  const now = r.now ? ` · ${cut(r.now, 32)}` : "";
  return `${stage}${cut(planOf(r), 36)}${now}`;
};
