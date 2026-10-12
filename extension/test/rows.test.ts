import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GONE_MS, STALE_MS, bar, description, groupByRepo, isRow, noteLines, rowForTab, rowForWorkspace, statusText, stepsOf, visibleRows,
  type Row,
} from "../src/rows.ts";

const NOW = 10 * GONE_MS;
const row = (o: Partial<Row>): Row => ({
  id: "x", repo: "r", where: "", plan: "Plan", done: 0, total: 0, now: "", updatedAt: NOW, ...o,
});

test("visibleRows drops ended and day-old rows, keeps idle ones, newest first", () => {
  const rows = [
    row({ id: "old", updatedAt: NOW - GONE_MS }),
    row({ id: "ended", ended: true }),
    row({ id: "idle", updatedAt: NOW - STALE_MS }),
    row({ id: "live", updatedAt: NOW - 1000 }),
  ];
  assert.deepEqual(visibleRows(rows, NOW).map((r) => r.id), ["live", "idle"]);
});

test("groupByRepo orders groups by their newest row", () => {
  const groups = groupByRepo([
    row({ id: "a1", repo: "a", updatedAt: NOW - 5000 }),
    row({ id: "b1", repo: "b", updatedAt: NOW - 1000 }),
    row({ id: "a2", repo: "a", updatedAt: NOW - 9000 }),
    row({ id: "n", repo: "" }),
  ]);
  assert.deepEqual(groups.map((g) => g.repo), ["(no repo)", "b", "a"]);
  assert.deepEqual(groups[2].rows.map((r) => r.id), ["a1", "a2"]);
});

test("description: stage, worktree or feature branch, age; main is left out", () => {
  assert.equal(description(row({ done: 3, total: 7, where: "wt-slug", updatedAt: NOW - 5 * 60000 }), NOW), "3/7 · wt-slug · 5m");
  assert.equal(description(row({ branch: "feat/x" }), NOW), "feat/x · now");
  assert.equal(description(row({ branch: "main" }), NOW), "now");
  assert.equal(description(row({ updatedAt: NOW - 7 * 3600000 }), NOW), "idle 7h");
});

test("stepsOf falls back to the now line for rows without steps", () => {
  assert.deepEqual(stepsOf(row({ now: "doing" })), [{ text: "doing", status: "now" }]);
  assert.deepEqual(stepsOf(row({})), []);
});

test("rowForWorkspace matches cwd inside a folder, any slash or case", () => {
  const rows = [
    row({ id: "other", cwd: "I:/Scratch/other", updatedAt: NOW }),
    row({ id: "mine-old", cwd: "I:\\Scratch\\solaisoft", updatedAt: NOW - 60000 }),
    row({ id: "mine", cwd: "i:/scratch/solaisoft/app", updatedAt: NOW - 1000 }),
  ];
  assert.equal(rowForWorkspace(rows, ["I:\\Scratch\\solaisoft"], NOW)?.id, "mine");
  assert.equal(rowForWorkspace(rows, ["I:/Scratch/solaisoft-wt"], NOW), undefined);
});

test("rowForWorkspace falls back to repo name for rows without cwd, never to a stale row", () => {
  assert.equal(rowForWorkspace([row({ id: "a", repo: "solaisoft" })], ["I:/Scratch/solaisoft"], NOW)?.id, "a");
  assert.equal(rowForWorkspace([row({ repo: "solaisoft", updatedAt: NOW - STALE_MS })], ["I:/Scratch/solaisoft"], NOW), undefined);
});

test("rowForTab matches the recorded title exactly, newest first, never an ended row", () => {
  const rows = [
    row({ id: "a", title: "2/5 Ship it · wt", updatedAt: NOW - 5000 }),
    row({ id: "b", title: "2/5 Ship it · wt", updatedAt: NOW - 1000 }),
    row({ id: "c", title: "1/3 Other", ended: true }),
    row({ id: "d" }),
  ];
  assert.equal(rowForTab(rows, "2/5 Ship it · wt", NOW)?.id, "b");
  assert.equal(rowForTab(rows, "1/3 Other", NOW), undefined);
  assert.equal(rowForTab(rows, "2/5 Ship it", NOW), undefined);
  assert.equal(rowForTab(rows, "", NOW), undefined);
});

test("statusText and bar", () => {
  assert.equal(statusText(row({ done: 2, total: 5, plan: "Ship it", now: "tests" })), "2/5 Ship it · tests");
  assert.equal(statusText(row({ plan: "" })), "(no plan yet)");
  assert.equal(bar(1, 2, 4), "■■□□");
  assert.equal(bar(0, 0), "");
});

test("noteLines: one item per line, markers and blanks dropped", () => {
  assert.deepEqual(noteLines("- first\r\n\n* second\n1. third\nplain\n   \n"), ["first", "second", "third", "plain"]);
  assert.deepEqual(noteLines(""), []);
});

test("isRow rejects junk", () => {
  assert.equal(isRow(null), false);
  assert.equal(isRow({ id: "a" }), false);
  assert.equal(isRow(row({})), true);
});
