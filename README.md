# Session Compass

See where each of your parallel Claude Code sessions is: repo, branch, plan, and which step it is on.

Two parts, installed separately:

| Part | What it does | Where |
|---|---|---|
| **Mod** (Claude Code plugin) | Gives Claude a `compass` tool, sets the tab title, shows a status line, toasts each finished step, and adds `/sessions` and `/compass` | `mod/` |
| **VS Code extension** | A sidebar of every live session as cards, grouped by repo, with a status bar that follows the active tab | `extension/` |

The extension reads what the mod writes. The mod works without the extension; the extension shows nothing without the mod.

## Install

Mod (in your terminal):

```
claude plugin marketplace add m4cd4r4/session-compass
claude plugin install session-compass@session-compass
```

Extension: search "Session Compass" in VS Code, or

```
code --install-extension macdara.session-compass
```

It is also on [Open VSX](https://open-vsx.org/extension/macdara/session-compass) for VSCodium and Cursor.

## How it works

1. The mod tells Claude to call `compass` when a task has 3 or more steps, when a step starts or finishes, and when the plan changes. A call carries a 3 to 6 word plan name and the whole step list, each step marked `done`, `now` or `todo`.
2. Each call updates the tab title, the status line, and one JSON file per session in `~/.claude/session-compass/` (or `$CLAUDE_CONFIG_DIR/session-compass/`).
3. The extension watches that folder and draws the tree. A session with no update for 6 hours is marked idle and dropped from the view after 24 hours. Ended sessions, and sessions that never got a message or a plan, are hidden.

`/sessions` lists every live session in the terminal. `/compass` prints the plan, stage, done, now and todo of the current one.

### Parent plans

If a worktree registry exists (`workspaces/registry.json` in the same Claude folder, or the `sessionCompass.registryPath` setting), the sidebar shows each parent plan above the sessions of its repo: entries that share a `plan`, ordered by `wave`. A plan shows while it has two or more slices, at least one still open, and one touched in the last 14 days or with a worktree on disk. A repo with a plan but no live session gets a group of its own, so the plan stays reachable.

Each open slice is one of: working (worktree on disk), blocked, due (its `gate_date` has passed), held (a `gate_reason` with no date or a date ahead, or a `depends_on` slug still open), or ready. Done slices are counted in the plan's summary, not listed. Open a slice and press **Copy resume** to copy its resume action: the worktree path for a working slice, else `sessionCompass.resumeCommand` with `{slug}` filled in. A working slice also has **Open worktree**, which opens its folder in a new window. The extension only reads the registry; it never writes it.

### Restart note

If `restart-note.md` exists in the same folder, a freshly started session (not one continued by `/clear` or a compact) is told its contents and mentions it in the first reply. The sidebar shows it at the top.

## Themes

The sidebar uses your VS Code theme colours, so it follows dark, light and high contrast. Shown with sample data.

| Dark | Light | High contrast |
|---|---|---|
| ![Session Compass in a dark theme](docs/img/theme-dark.png) | ![Session Compass in a light theme](docs/img/theme-light.png) | ![Session Compass in a high contrast theme](docs/img/theme-high-contrast.png) |

## What it reads and sends

Reads and writes only the folder above, plus `git` in the session's directory to find the repo and branch. Neither part makes a network request.

## Develop

```
cd extension && npm install && npm test && npm run package
```

## Licence

MIT, see [extension/LICENSE](extension/LICENSE).
