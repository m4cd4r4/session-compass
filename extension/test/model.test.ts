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

test("buildModel shows an idle session as idle, never here, even when focused", () => {
  const m = buildModel(input([row({ id: "a", updatedAt: NOW - STALE_MS })], { focusedId: "a" }));
  const c = m.groups[0].cards[0];
  assert.equal(c.state, "idle");
  assert.equal(c.open, false);
  assert.match(c.age, /^idle /);
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

test("parseMessage accepts known shapes and drops the rest", () => {
  assert.deepEqual(parseMessage({ type: "ready" }), { type: "ready" });
  assert.deepEqual(parseMessage({ type: "details", id: "a" }), { type: "details", id: "a" });
  assert.deepEqual(parseMessage({ type: "copyResume", text: "cmd" }), { type: "copyResume", text: "cmd" });
  assert.equal(parseMessage({ type: "details" }), undefined);
  assert.equal(parseMessage({ type: "copyResume", text: "" }), undefined);
  assert.equal(parseMessage({ type: "nope" }), undefined);
  assert.equal(parseMessage(null), undefined);
});
