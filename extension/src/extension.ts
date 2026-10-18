import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  COPY_RESUME_COMMAND, DEFAULT_RESUME, OPEN_WORKTREE_COMMAND, openSlices, planOnlyRepos, plansForRepo, plansFromRegistry, planSummary, resumeFromArg,
  sliceDescription, sliceLabel, worktreeFromArg, type ParentPlan, type RegistryEntry, type Slice, type SliceState,
} from "./plans";
import {
  bar, COPY_ID_COMMAND, copyIdLink, description, groupByRepo, isInWorkspace, isRow, isStale, NOTE_FILE, noteLines, PANE_COMMAND, paneLink, paneOpenOf, planOf,
  rowForTab, rowForWorkspace,
  sessionIdFromArg, statusText, stepsOf, visibleRows, type Group, type Row, type Step,
} from "./rows";

const VIEW = "sessionCompass.sessions";
// Ages in the tree and staleness tick on with no file change
const TICK_MS = 30_000;

/** Same folder the mod writes to: CLAUDE_CONFIG_DIR, else ~/.claude. */
const rowsDir = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "session-compass");

function readRows(): Row[] {
  let names: string[];
  try {
    names = readdirSync(rowsDir()).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const rows: Row[] = [];
  for (const n of names) {
    try {
      const v: unknown = JSON.parse(readFileSync(join(rowsDir(), n), "utf8"));
      if (isRow(v)) rows.push(v);
    } catch {
      // half-written file; the next change event reads it whole
    }
  }
  return rows;
}

// One flag per session; the mod polls it and opens or closes its Compass pane
const paneFlag = (id: string) => join(rowsDir(), "panes", `${id}.json`);

function isPaneOpen(id: string) {
  try {
    return paneOpenOf(readFileSync(paneFlag(id), "utf8"));
  } catch {
    return false;
  }
}

function setPaneOpen(id: string, open: boolean) {
  mkdirSync(join(rowsDir(), "panes"), { recursive: true });
  writeFileSync(paneFlag(id), JSON.stringify({ open }));
}

const notePath = () => join(rowsDir(), NOTE_FILE);

function readNote(): string[] {
  try {
    return noteLines(readFileSync(notePath(), "utf8"));
  } catch {
    return [];
  }
}

const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);

const expandHome = (p: string) => (p.startsWith("~/") || p === "~" ? join(homedir(), p.slice(1)) : p);

/** The worktree registry: the setting, else workspaces/registry.json beside the session rows. */
const registryPath = () => {
  const set = vscode.workspace.getConfiguration("sessionCompass").get<string>("registryPath")?.trim();
  return set ? expandHome(set) : join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "workspaces", "registry.json");
};

// The registry runs to megabytes: parse it again only when the file changes
let registryCache: { path: string; mtimeMs: number; entries: RegistryEntry[] } | undefined;

function readRegistry(): RegistryEntry[] {
  const path = registryPath();
  try {
    const { mtimeMs } = statSync(path);
    if (registryCache?.path === path && registryCache.mtimeMs === mtimeMs) return registryCache.entries;
    const v = JSON.parse(readFileSync(path, "utf8")) as { entries?: unknown };
    const entries = Array.isArray(v.entries) ? (v.entries as RegistryEntry[]) : [];
    registryCache = { path, mtimeMs, entries };
    return entries;
  } catch {
    // no registry (plans are optional), or one being rewritten: keep what was read last
    return registryCache?.path === path ? registryCache.entries : [];
  }
}

function readPlans(): ParentPlan[] {
  const resumeCommand = vscode.workspace.getConfiguration("sessionCompass").get<string>("resumeCommand")?.trim() || DEFAULT_RESUME;
  return plansFromRegistry(readRegistry(), { exists: existsSync, resumeCommand });
}

type Node =
  | { kind: "note"; lines: string[] }
  | { kind: "noteLine"; text: string }
  | { kind: "repo"; group: Group }
  | { kind: "plan"; plan: ParentPlan }
  | { kind: "slice"; slice: Slice }
  | { kind: "session"; row: Row }
  | { kind: "step"; step: Step; row: Row };

const SLICE_ICON: Record<SliceState, vscode.ThemeIcon> = {
  done: new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed")),
  working: new vscode.ThemeIcon("play-circle", new vscode.ThemeColor("charts.blue")),
  blocked: new vscode.ThemeIcon("error", new vscode.ThemeColor("charts.red")),
  due: new vscode.ThemeIcon("bell-dot", new vscode.ThemeColor("charts.yellow")),
  held: new vscode.ThemeIcon("lock", new vscode.ThemeColor("disabledForeground")),
  ready: new vscode.ThemeIcon("circle-large-outline"),
};

const STEP_ICON: Record<Step["status"], vscode.ThemeIcon> = {
  done: new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed")),
  now: new vscode.ThemeIcon("arrow-right", new vscode.ThemeColor("charts.blue")),
  todo: new vscode.ThemeIcon("circle-large-outline", new vscode.ThemeColor("disabledForeground")),
};

const STEP_MARK: Record<Step["status"], string> = {
  done: "$(pass-filled)",
  now: "$(arrow-right)",
  todo: "$(circle-large-outline)",
};
const STEP_WORD: Record<Step["status"], string> = { done: "Done", now: "Now", todo: "To do" };
const MAX_TOOLTIP_STEPS = 25;
const SHOW_DETAILS_COMMAND = "sessionCompass.showDetails";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Read-only page for one session, drawn in VS Code's own colours. */
function detailsHtml(r: Row, now: number) {
  const mark = { done: "&#10003;", now: "&#8594;", todo: "&#9675;" } as const;
  const steps = stepsOf(r)
    .map((s) => `<li class="${s.status}"><span class="m">${mark[s.status]}</span>${esc(s.text)}</li>`)
    .join("");
  const where = [r.repo, r.where || r.branch].filter(Boolean).join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:16px 20px;line-height:1.5}
h1{font-size:1.4em;margin:0 0 4px}
.meta{color:var(--vscode-descriptionForeground);margin:0 0 14px}
code{font-family:var(--vscode-editor-font-family)}
ul{list-style:none;padding:0;margin:12px 0 0}
li{padding:4px 0;display:flex;gap:10px}
.m{width:1.2em;text-align:center;flex:none}
li.done{color:var(--vscode-descriptionForeground)}
li.now{font-weight:600;color:var(--vscode-textLink-foreground)}
</style></head><body>
<h1>${esc(planOf(r))}</h1>
<p class="meta">${r.total > 0 ? `${r.done}/${r.total} done` : "no steps yet"}${isStale(r, now) ? " · idle" : ""}<br>${esc(where)}<br><code>${esc(r.cwd || "")}</code><br>Session <code>${esc(r.id)}</code> · updated ${esc(new Date(r.updatedAt).toLocaleTimeString())}</p>
<ul>${steps}</ul>
</body></html>`;
}

class SessionsTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  rows: Row[] = [];
  note: string[] = [];
  plans: ParentPlan[] = [];
  /** The session whose tab last had focus in this window; sticky while a file has focus. */
  focusedId: string | undefined;

  fire() {
    this.changed.fire();
  }

  getChildren(node?: Node): Node[] {
    const now = Date.now();
    if (!node) {
      const sessionGroups = groupByRepo(visibleRows(this.rows, now));
      // A plan stays reachable when no session is running in its repo: its repo gets a group of its own
      const planGroups = planOnlyRepos(this.plans, sessionGroups.map((g) => g.repo)).map((repo) => ({ repo, rows: [] }));
      const groups: Node[] = [...sessionGroups, ...planGroups].map((group) => ({ kind: "repo", group }));
      return this.note.length > 0 ? [{ kind: "note", lines: this.note }, ...groups] : groups;
    }
    if (node.kind === "note") return node.lines.map((text) => ({ kind: "noteLine", text }));
    if (node.kind === "repo") {
      return [
        ...plansForRepo(this.plans, node.group.repo).map((plan): Node => ({ kind: "plan", plan })),
        ...node.group.rows.map((row): Node => ({ kind: "session", row })),
      ];
    }
    if (node.kind === "plan") return openSlices(node.plan).map((slice) => ({ kind: "slice", slice }));
    if (node.kind === "session") return stepsOf(node.row).map((step) => ({ kind: "step", step, row: node.row }));
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const now = Date.now();
    const openNote = { command: "vscode.open", title: "Open restart note", arguments: [vscode.Uri.file(notePath())] };
    if (node.kind === "note") {
      const item = new vscode.TreeItem("Restart note", vscode.TreeItemCollapsibleState.Expanded);
      item.id = "note";
      item.iconPath = new vscode.ThemeIcon("note", new vscode.ThemeColor("charts.yellow"));
      item.description = `${node.lines.length}`;
      item.tooltip = "Where to start after restarting. Ask Claude to add or clear items.";
      item.command = openNote;
      return item;
    }
    if (node.kind === "noteLine") {
      const item = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("circle-small-filled", new vscode.ThemeColor("charts.yellow"));
      item.tooltip = node.text;
      item.command = openNote;
      return item;
    }
    if (node.kind === "repo") {
      const item = new vscode.TreeItem(node.group.repo, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `repo:${node.group.repo}`;
      item.iconPath = new vscode.ThemeIcon("repo");
      item.description = node.group.rows.length > 0 ? `${node.group.rows.length}` : "no live session";
      return item;
    }
    if (node.kind === "plan") {
      const p = node.plan;
      const item = new vscode.TreeItem(p.name, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `plan:${p.repo}:${p.name}`;
      item.iconPath = new vscode.ThemeIcon("milestone");
      item.description = planSummary(p);
      item.tooltip = `Parent plan ${p.name} (${planSummary(p)}), from the worktree registry. Click a slice to copy its resume command.`;
      return item;
    }
    if (node.kind === "slice") {
      const s = node.slice;
      const item = new vscode.TreeItem(sliceLabel(s), vscode.TreeItemCollapsibleState.None);
      item.iconPath = SLICE_ICON[s.state];
      item.description = sliceDescription(s);
      item.contextValue = s.worktree ? "slice-worktree" : s.resume ? "slice-resume" : "slice";
      item.tooltip = sliceTooltip(s);
      if (s.resume) item.command = { command: COPY_RESUME_COMMAND, title: "Copy resume command", arguments: [s.resume] };
      return item;
    }
    if (node.kind === "step") {
      const item = new vscode.TreeItem(node.step.text, vscode.TreeItemCollapsibleState.None);
      item.iconPath = STEP_ICON[node.step.status];
      item.tooltip = new vscode.MarkdownString(`**${STEP_WORD[node.step.status]}**\n\n`).appendText(node.step.text);
      item.command = { command: SHOW_DETAILS_COMMAND, title: "Show session details", arguments: [node.row.id] };
      return item;
    }
    const r = node.row;
    const stale = isStale(r, now);
    const focused = r.id === this.focusedId;
    const hasSteps = stepsOf(r).length > 0;
    const item = new vscode.TreeItem(
      planOf(r),
      hasSteps
        ? focused && !stale ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = `session:${r.id}`;
    item.contextValue = "session";
    item.description = description(r, now);
    item.iconPath = stale
      ? new vscode.ThemeIcon("debug-pause", new vscode.ThemeColor("disabledForeground"))
      : r.total > 0 && r.done === r.total
        ? new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"))
        : new vscode.ThemeIcon(focused ? "compass-active" : "compass", focused ? new vscode.ThemeColor("charts.blue") : undefined);
    item.tooltip = tooltip(r, now, focused ? "this tab" : isInWorkspace(r, folders()) ? "this window" : "");
    item.command = { command: SHOW_DETAILS_COMMAND, title: "Show session details", arguments: [r.id] };
    return item;
  }
}

function sliceTooltip(s: Slice) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${sliceLabel(s)}** · ${s.state}${s.wave ? ` · wave ${s.wave}` : ""}\n\n`);
  md.appendText(s.why);
  md.appendMarkdown("\n\n");
  if (s.resume) {
    md.appendMarkdown(s.worktree ? "Click to copy the worktree path:\n\n" : "Click to copy the resume command:\n\n");
    md.appendCodeblock(s.resume, "sh");
  }
  return md;
}

function tooltip(r: Row, now: number, scope: string) {
  const md = new vscode.MarkdownString(undefined, true);
  md.appendMarkdown(`**${planOf(r)}**${scope ? ` · ${scope}` : ""}\n\n`);
  if (r.total > 0) md.appendMarkdown(`\`${bar(r.done, r.total)}\` ${r.done}/${r.total}\n\n`);
  if (r.now) md.appendMarkdown(`Now: ${r.now}\n\n`);
  const steps = stepsOf(r);
  steps.slice(0, MAX_TOOLTIP_STEPS).forEach((s, i) => {
    md.appendMarkdown(`${STEP_MARK[s.status]} `);
    md.appendText(s.text);
    md.appendMarkdown(i === Math.min(steps.length, MAX_TOOLTIP_STEPS) - 1 ? "\n\n" : "  \n");
  });
  if (steps.length > MAX_TOOLTIP_STEPS) md.appendMarkdown(`and ${steps.length - MAX_TOOLTIP_STEPS} more\n\n`);
  const where = [r.repo, r.where || r.branch].filter(Boolean).join(" · ");
  if (where) md.appendMarkdown(`${where}\n\n`);
  if (r.cwd) md.appendMarkdown(`\`${r.cwd}\`\n\n`);
  md.appendMarkdown(`Session \`${r.id}\` [Copy](${copyIdLink(r.id)}) · [${isPaneOpen(r.id) ? "Hide panel" : "Show panel"}](${paneLink(r.id)})\n\n`);
  md.isTrusted = { enabledCommands: [COPY_ID_COMMAND, PANE_COMMAND] };
  md.appendMarkdown(`Updated ${new Date(r.updatedAt).toLocaleTimeString()}${isStale(r, now) ? " (idle)" : ""}`);
  return md;
}

export function activate(context: vscode.ExtensionContext) {
  const tree = new SessionsTree();
  const view = vscode.window.createTreeView(VIEW, { treeDataProvider: tree, showCollapseAll: true });

  const status = vscode.window.createStatusBarItem("sessionCompass.status", vscode.StatusBarAlignment.Left, 50);
  status.name = "Session Compass";

  let details: vscode.WebviewPanel | undefined;
  let detailsId = "";
  const drawDetails = () => {
    const row = tree.rows.find((x) => x.id === detailsId);
    if (details && row) details.webview.html = detailsHtml(row, Date.now());
  };

  const update = () => {
    tree.rows = readRows();
    drawDetails();
    tree.note = readNote();
    tree.plans = readPlans();
    const now = Date.now();
    // A Claude tab's label is the title the mod set, which its row records
    const tab = rowForTab(tree.rows, vscode.window.tabGroups.activeTabGroup.activeTab?.label ?? "", now);
    if (tab) tree.focusedId = tab.id;
    const focused = visibleRows(tree.rows, now).find((r) => r.id === tree.focusedId);
    const shown = focused ?? rowForWorkspace(tree.rows, folders(), now);
    tree.fire();
    const live = visibleRows(tree.rows, now).filter((r) => !isStale(r, now));
    view.badge = live.length > 0 ? { value: live.length, tooltip: `${live.length} live sessions` } : undefined;
    if (shown) {
      status.text = `$(compass) ${statusText(shown)}`;
      status.tooltip = tooltip(shown, now, focused ? "this tab" : "this window");
      status.command = { title: "Show or hide the compass panel", command: PANE_COMMAND, arguments: [shown.id] };
      status.show();
    } else {
      status.hide();
    }
  };

  // fs.watch fires several events per write; one refresh per burst
  let timer: NodeJS.Timeout | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  };
  let watcher: FSWatcher | undefined;
  const startWatch = () => {
    if (watcher) return;
    try {
      watcher = watch(rowsDir(), soon);
      watcher.on("error", () => {
        watcher?.close();
        watcher = undefined;
      });
    } catch {
      // folder not made yet: the tick retries
    }
  };
  startWatch();
  const tick = setInterval(() => {
    startWatch();
    update();
  }, TICK_MS);

  context.subscriptions.push(
    view,
    status,
    vscode.commands.registerCommand("sessionCompass.refresh", update),
    vscode.commands.registerCommand(SHOW_DETAILS_COMMAND, (arg?: unknown) => {
      const id = sessionIdFromArg(arg);
      const row = tree.rows.find((x) => x.id === id);
      if (!row) return;
      detailsId = row.id;
      if (!details) {
        details = vscode.window.createWebviewPanel("sessionCompass.details", "Session", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {});
        details.onDidDispose(() => {
          details = undefined;
        });
        context.subscriptions.push(details);
      }
      details.title = planOf(row);
      details.reveal(vscode.ViewColumn.Beside, true);
      drawDetails();
    }),
    vscode.commands.registerCommand(COPY_ID_COMMAND, async (arg?: unknown) => {
      const id = sessionIdFromArg(arg);
      if (!id) return;
      await vscode.env.clipboard.writeText(id);
      vscode.window.setStatusBarMessage(`Copied session ID ${id}`, 3000);
    }),
    vscode.commands.registerCommand(PANE_COMMAND, (arg?: unknown) => {
      const id = sessionIdFromArg(arg);
      if (!id) return;
      const open = !isPaneOpen(id);
      setPaneOpen(id, open);
      vscode.window.setStatusBarMessage(open ? "Compass panel on for this session" : "Compass panel off for this session", 3000);
      update();
    }),
    vscode.commands.registerCommand(COPY_RESUME_COMMAND, async (arg?: unknown) => {
      const text = resumeFromArg(arg);
      if (!text) return;
      await vscode.env.clipboard.writeText(text);
      vscode.window.setStatusBarMessage(`Copied: ${text}`, 4000);
    }),
    vscode.commands.registerCommand(OPEN_WORKTREE_COMMAND, async (arg?: unknown) => {
      const path = worktreeFromArg(arg);
      if (path) await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(path), { forceNewWindow: true });
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("sessionCompass")) update();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(update),
    // Fires on focus moves and on label changes, so a retitled tab is picked up too
    vscode.window.tabGroups.onDidChangeTabs(update),
    vscode.window.tabGroups.onDidChangeTabGroups(update),
    { dispose: () => { clearInterval(tick); clearTimeout(timer); watcher?.close(); } },
  );
  update();
}

export function deactivate() {}
