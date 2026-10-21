import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel, parseMessage } from "../src/model.ts";
import { GONE_MS, STALE_MS, type Row } from "../src/rows.ts";
import type { ParentPlan } from "../src/plans.ts";

const NOW = 10 * GONE_MS;
const row = (o: Partial<Row>): Row => ({ id: "x", repo: "r", where: "", plan: "Plan", done: 0, total: 0, now: "", updatedAt: NOW, ...o });
const input = (rows: Row[], extra: { plans?: ParentPlan[]; focusedId?: string } = {}) => ({ rows, plans: extra.plans ?? [], note: [], now: NOW, focusedId: extra.focusedId });

test("buildModel marks the focused live session here and opens it", () => {
  const m = buildModel(input([row({ id: "a", total: 2, done: 1, steps: [{ status: "now", text: "go" }, { status: "todo", text: "later" }] }), row({ id: "b" })], { focusedId: "a" }));
  const cards = m.groups.flatMap((g) => g.cards);
  assert.equal(cards.find((c) => c.id === "a")?.state, "here");
  assert.equal(cards.find((c) => c.id === "a")?.open, true);
  assert.equal(cards.find((c) => c.id === "b")?.state, "run");
  assert.deepEqual(m.summary, { sessions: 2, here: 1, running: 1, held: 0, idle: 0 });
});

test("buildModel carries the step in progress for a collapsed card, none when idle", () => {
  const steps = [{ status: "done" as const, text: "a" }, { status: "now" as const, text: "b" }];
  const live = buildModel(input([row({ id: "a", total: 2, done: 1, steps })])).groups[0].cards[0];
  assert.equal(live.now, "b");
  const idle = buildModel(input([row({ id: "a", total: 2, done: 1, steps, updatedAt: NOW - STALE_MS })])).groups[0].cards[0];
  assert.equal(idle.now, "");
});

test("buildModel shows a stale finished session as idle, never here, even when focused", () => {
  const m = buildModel(input([row({ id: "a", total: 3, done: 3, updatedAt: NOW - STALE_MS })], { focusedId: "a" }));
  const c = m.groups[0].cards[0];
  assert.equal(c.state, "idle");
  assert.equal(c.open, false);
  assert.match(c.age, /^idle /);
});

test("buildModel shows a stale unfinished session as held and paused", () => {
  const m = buildModel(input([row({ id: "a", total: 3, done: 1, updatedAt: NOW - 3 * GONE_MS })], { focusedId: "a" }));
  const c = m.groups[0].cards[0];
  assert.equal(c.state, "held");
  assert.match(c.age, /^paused /);
  assert.equal(c.open, false);
});

test("buildModel marks a finished session done", () => {
  const m = buildModel(input([row({ total: 3, done: 3 })]));
  assert.equal(m.groups[0].cards[0].state, "done");
});

test("buildModel gives a plan with no session its own repo group", () => {
  const plan: ParentPlan = { name: "Big job", repo: "other", slices: [] };
  const m = buildModel(input([row({ repo: "r" })], { plans: [plan] }));
  assert.deepEqual(m.groups.map((g) => g.repo).sort(), ["other", "r"]);
});

test("buildModel gives a working slice both a copyable resume and an open-worktree path", () => {
  const plan: ParentPlan = { name: "Big job", repo: "r", slices: [
    { slug: "a", label: "a", wave: "1", state: "working", why: "building", resume: "I:/wt/a", worktree: "I:/wt/a" },
    { slug: "b", label: "b", wave: "1", state: "ready", why: "next", resume: "mint b", worktree: "" },
  ] };
  const steps = buildModel(input([row({ repo: "r" })], { plans: [plan] })).groups[0].cards.find((c) => c.kind === "plan")!.steps;
  assert.equal(steps[0].worktree, "I:/wt/a");
  assert.equal(steps[1].worktree, undefined);
  assert.equal(steps[1].resume, "mint b");
});

test("parseMessage accepts known shapes and drops the rest", () => {
  assert.deepEqual(parseMessage({ type: "ready" }), { type: "ready" });
  assert.deepEqual(parseMessage({ type: "details", id: "a" }), { type: "details", id: "a" });
  assert.deepEqual(parseMessage({ type: "copyResume", text: "cmd" }), { type: "copyResume", text: "cmd" });
  assert.deepEqual(parseMessage({ type: "openWorktree", path: "C:/w" }), { type: "openWorktree", path: "C:/w" });
  assert.deepEqual(parseMessage({ type: "dismiss", id: "a" }), { type: "dismiss", id: "a" });
  assert.equal(parseMessage({ type: "dismiss" }), undefined);
  assert.equal(parseMessage({ type: "openWorktree" }), undefined);
  assert.equal(parseMessage({ type: "details" }), undefined);
  assert.equal(parseMessage({ type: "copyResume", text: "" }), undefined);
  assert.equal(parseMessage({ type: "nope" }), undefined);
  assert.equal(parseMessage(null), undefined);
});
