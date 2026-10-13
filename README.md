# Session Compass

See where each of your parallel Claude Code sessions is: repo, branch, plan, and which step it is on.

Two parts, installed separately:

| Part | What it does | Where |
|---|---|---|
| **Mod** (Claude Code plugin) | Gives Claude a `compass` tool, sets the tab title, shows a status line, toasts each finished step, and adds `/sessions` and `/compass` | `mod/` |
| **VS Code extension** | A sidebar tree of every live session, grouped by repo, with a status bar that follows the active tab | `extension/` |

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

### Restart note

If `restart-note.md` exists in the same folder, a freshly started session (not one continued by `/clear` or a compact) is told its contents and mentions it in the first reply. The sidebar shows it at the top.

## What it reads and sends

Reads and writes only the folder above, plus `git` in the session's directory to find the repo and branch. Neither part makes a network request.

## Develop

```
cd extension && npm install && npm test && npm run package
```

## Licence

MIT, see [extension/LICENSE](extension/LICENSE).
