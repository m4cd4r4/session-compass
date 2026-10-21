// Pure view model for the webview: no vscode import, so node --test runs it directly.
import { ago, groupByRepo, hasWorkLeft, isFinished, isStale, planOf, stepsOf, visibleRows, type Dismissed, type Row, type Step } from "./rows.ts";
import { openSlices, plansForRepo, planOnlyRepos, sliceLabel, type ParentPlan, type SliceState } from "./plans.ts";

export type CardState = "here" | "run" | "idle" | "done" | "held";

export type CardStep = { status: Step["status"]; text: string; detail?: string; resume?: string; worktree?: string };

export type Card = {
  id: string;
  kind: "session" | "plan";
  title: string;
  state: CardState;
  /** Right-aligned age ("5m", "idle 3h"); empty for plans. */
  age: string;
  done: number;
  total: number;
  held: number;
  where: string;
  /** The step in progress, shown on a collapsed card; empty when none. */
  now: string;
  steps: CardStep[];
  /** Expanded on first draw: the session in the focused tab. */
  open: boolean;
};

export type GroupModel = { repo: string; cards: Card[] };

export type Summary = { sessions: number; here: number; running: number; held: number; idle: number };

export type ViewModel = { summary: Summary; groups: GroupModel[]; note: string[] };

const SLICE_STEP: Record<SliceState, CardStep["status"]> = { done: "done", working: "now", blocked: "now", due: "todo", held: "todo", ready: "todo" };

export type ModelInput = {
  rows: readonly Row[];
  plans: readonly ParentPlan[];
  note: readonly string[];
  now: number;
  focusedId?: string;
  dismissed?: Dismissed;
};

const sessionCard = (r: Row, now: number, focusedId?: string): Card => {
  const stale = isStale(r, now);
  const here = r.id === focusedId && !stale;
  const steps = stepsOf(r);
  // A stale session with work left is paused (its window was probably closed); a stale finished one is just idle
  const state: CardState = stale ? (hasWorkLeft(r) ? "held" : "idle") : isFinished(r) ? "done" : here ? "here" : "run";
  const where = r.where || (r.branch && r.branch !== "main" && r.branch !== "master" ? r.branch : "");
  return {
    id: r.id,
    kind: "session",
    title: planOf(r),
    state,
    age: stale ? `${state === "held" ? "paused" : "idle"} ${ago(now - r.updatedAt)}` : ago(now - r.updatedAt),
    done: r.done,
    total: r.total,
    held: 0,
    where,
    now: stale ? "" : steps.find((s) => s.status === "now")?.text ?? r.now,
    steps: steps.map((s) => ({ status: s.status, text: s.text, detail: s.detail })),
    open: here && steps.length > 0,
  };
};

const planCard = (p: ParentPlan): Card => {
  const slices = openSlices(p);
  const count = (s: SliceState) => p.slices.filter((x) => x.state === s).length;
  const working = count("working") + count("blocked");
  return {
    id: `plan:${p.repo}:${p.name}`,
    kind: "plan",
    title: p.name,
    state: working > 0 ? "run" : "held",
    age: "",
    done: count("done"),
    total: p.slices.length,
    held: count("held"),
    where: "",
    now: "",
    steps: slices.map((s) => ({ status: SLICE_STEP[s.state], text: sliceLabel(s), detail: s.why, resume: s.worktree || s.resume || undefined, worktree: s.worktree || undefined })),
    open: false,
  };
};

export const buildModel = ({ rows, plans, note, now, focusedId, dismissed }: ModelInput): ViewModel => {
  const visible = visibleRows(rows, now, dismissed);
  const sessionGroups = groupByRepo(visible);
  const repos = [...sessionGroups.map((g) => g.repo), ...planOnlyRepos(plans, sessionGroups.map((g) => g.repo))];
  const groups: GroupModel[] = repos.map((repo) => {
    const rs = sessionGroups.find((g) => g.repo === repo)?.rows ?? [];
    return { repo, cards: [...plansForRepo(plans, repo).map(planCard), ...rs.map((r) => sessionCard(r, now, focusedId))] };
  });
  const cards = groups.flatMap((g) => g.cards);
  const sessionCards = cards.filter((c) => c.kind === "session");
  const count = (s: CardState) => sessionCards.filter((c) => c.state === s).length;
  return {
    summary: { sessions: sessionCards.length, here: count("here"), running: count("run"), held: count("held"), idle: count("idle") },
    groups,
    note: [...note],
  };
};

/** The webview messages the host honours; anything else is dropped. */
export type WebMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "details"; id: string }
  | { type: "copyId"; id: string }
  | { type: "dismiss"; id: string }
  | { type: "pane"; id: string }
  | { type: "copyResume"; text: string }
  | { type: "openWorktree"; path: string }
  | { type: "openNote" };

export const parseMessage = (v: unknown): WebMessage | undefined => {
  const m = v as { type?: unknown; id?: unknown; text?: unknown } | null;
  if (!m || typeof m.type !== "string") return undefined;
  const str = (x: unknown) => (typeof x === "string" && x ? x : undefined);
  switch (m.type) {
    case "ready":
    case "refresh":
    case "openNote":
      return { type: m.type };
    case "details":
    case "copyId":
    case "dismiss":
    case "pane": {
      const id = str(m.id);
      return id ? { type: m.type, id } : undefined;
    }
    case "copyResume": {
      const text = str(m.text);
      return text ? { type: "copyResume", text } : undefined;
    }
    case "openWorktree": {
      const path = str((m as { path?: unknown }).path);
      return path ? { type: "openWorktree", path } : undefined;
    }
    default:
      return undefined;
  }
};
