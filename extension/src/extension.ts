import { readdirSync, readFileSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  bar, description, groupByRepo, isInWorkspace, isRow, isStale, NOTE_FILE, noteLines, planOf, rowForTab, rowForWorkspace, statusText, stepsOf,
  visibleRows, type Group, type Row, type Step,
} from "./rows";

const VIEW = "sessionCompass.sessions";
const COPY_ID = "sessionCompass.copyId";
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

const notePath = () => join(rowsDir(), NOTE_FILE);

function readNote(): string[] {
  try {
    return noteLines(readFileSync(notePath(), "utf8"));
  } catch {
    return [];
  }
}

const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);

type Node =
  | { kind: "note"; lines: string[] }
  | { kind: "noteLine"; text: string }
  | { kind: "repo"; group: Group }
  | { kind: "session"; row: Row }
  | { kind: "step"; step: Step };

const STEP_ICON: Record<Step["status"], vscode.ThemeIcon> = {
  done: new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed")),
  now: new vscode.ThemeIcon("arrow-right", new vscode.ThemeColor("charts.blue")),
  todo: new vscode.ThemeIcon("circle-large-outline", new vscode.ThemeColor("disabledForeground")),
};

class SessionsTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  rows: Row[] = [];
  note: string[] = [];
  /** The session whose tab last had focus in this window; sticky while a file has focus. */
  focusedId: string | undefined;

  fire() {
    this.changed.fire();
  }

  getChildren(node?: Node): Node[] {
    const now = Date.now();
    if (!node) {
      const groups: Node[] = groupByRepo(visibleRows(this.rows, now)).map((group) => ({ kind: "repo", group }));
      return this.note.length > 0 ? [{ kind: "note", lines: this.note }, ...groups] : groups;
    }
    if (node.kind === "note") return node.lines.map((text) => ({ kind: "noteLine", text }));
    if (node.kind === "repo") return node.group.rows.map((row) => ({ kind: "session", row }));
    if (node.kind === "session") return stepsOf(node.row).map((step) => ({ kind: "step", step }));
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
      item.description = `${node.group.rows.length}`;
      return item;
    }
    if (node.kind === "step") {
      const item = new vscode.TreeItem(node.step.text, vscode.TreeItemCollapsibleState.None);
      item.iconPath = STEP_ICON[node.step.status];
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
    item.description = description(r, now);
    item.iconPath = stale
      ? new vscode.ThemeIcon("debug-pause", new vscode.ThemeColor("disabledForeground"))
      : r.total > 0 && r.done === r.total
        ? new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"))
        : new vscode.ThemeIcon(focused ? "compass-active" : "compass", focused ? new vscode.ThemeColor("charts.blue") : undefined);
    item.tooltip = tooltip(r, now, focused ? "this tab" : isInWorkspace(r, folders()) ? "this window" : "");
    return item;
  }
}

function tooltip(r: Row, now: number, scope: string) {
  const md = new vscode.MarkdownString(undefined, true);
  md.appendMarkdown(`**${planOf(r)}**${scope ? ` · ${scope}` : ""}\n\n`);
  if (r.total > 0) md.appendMarkdown(`\`${bar(r.done, r.total)}\` ${r.done}/${r.total}\n\n`);
  if (r.now) md.appendMarkdown(`Now: ${r.now}\n\n`);
  const where = [r.repo, r.where || r.branch].filter(Boolean).join(" · ");
  if (where) md.appendMarkdown(`${where}\n\n`);
  if (r.cwd) md.appendMarkdown(`\`${r.cwd}\`\n\n`);
  const copy = `command:${COPY_ID}?${encodeURIComponent(JSON.stringify([r.id]))}`;
  md.isTrusted = { enabledCommands: [COPY_ID] };
  md.appendMarkdown(`Session \`${r.id}\` · [Copy](${copy})\n\n`);
  md.appendMarkdown(`Updated ${new Date(r.updatedAt).toLocaleTimeString()}${isStale(r, now) ? " (idle)" : ""}`);
  return md;
}

export function activate(context: vscode.ExtensionContext) {
  const tree = new SessionsTree();
  const view = vscode.window.createTreeView(VIEW, { treeDataProvider: tree, showCollapseAll: true });

  const status = vscode.window.createStatusBarItem("sessionCompass.status", vscode.StatusBarAlignment.Left, 50);
  status.name = "Session Compass";
  status.command = `${VIEW}.focus`;

  const update = () => {
    tree.rows = readRows();
    tree.note = readNote();
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
    vscode.commands.registerCommand(COPY_ID, async (id?: string) => {
      if (typeof id !== "string" || !id) return;
      await vscode.env.clipboard.writeText(id);
      vscode.window.setStatusBarMessage(`Copied session ID ${id}`, 3000);
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
