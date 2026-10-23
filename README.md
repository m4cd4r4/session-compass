# Session Compass

Six Claude Code sessions open. One is mid-refactor, one is waiting on you, one finished twenty minutes ago. Which is which?

Session Compass tells you at a glance: the repo, the branch, the plan, and the step each session is on.

![All your Claude sessions, grouped by project](docs/demo/sessions-by-project.png)

## One glance, no scrolling

Look at the bottom of VS Code. It says 3/5 and what Claude is doing right now.

![Status bar showing 3/5 Add checkout flow](docs/demo/status-bar-crop.png)

![The current step shows in your status bar](docs/demo/status-bar.gif)

## Every tab knows its own plan

Click a different Claude tab and the bottom bar switches to that session's step. No hunting through chats.

![Three Claude tabs and the status bar below them](docs/demo/follows-tab-crop.png)

![The footer follows whichever tab you are in](docs/demo/follows-tab.gif)

## Watch Claude tick things off

Each session is a card with its plan. The bar fills and finished steps get crossed out as it works.

![One session card with all five steps ticked](docs/demo/plan-ticks-crop.png)

![Claude writes a plan, then ticks steps off as it goes](docs/demo/plan-ticks.gif)

A finished plan stays in the footer as 5/5.

![A finished plan stays in the footer as 5/5](docs/demo/finished-plan.png)

## Three chats in the same repo?

They sit together. Open the project to see each session's branch and which step it's on.

![The demo-shop group with three sessions](docs/demo/open-project-crop.png)

![Open a project to see every session's steps](docs/demo/open-project.gif)

## One click for the full plan

Click the status bar item and every step opens right next to your chat.

![The status bar item you click](docs/demo/footer-pane-crop.png)

![Click the footer to open the plan beside your chat](docs/demo/footer-pane.gif)

## Everything about one session

Open a card for its steps, its folder and its ID.

![A session's details: steps, folder and ID](docs/demo/session-details-crop.png)

![Open any session's details](docs/demo/session-details.gif)

## Prefer typing?

`/sessions` lists every session right in the chat: branch, plan, step, how long ago.

![The /sessions list](docs/demo/sessions-command-crop.png)

![The /sessions command lists every session in the chat](docs/demo/sessions-command.gif)

## Install

Compass is two parts. The **mod** (a Claude Code plugin, in `mod/`) gives Claude a `compass` tool, sets the tab title, shows a status line, toasts each finished step, and adds `/sessions` and `/compass`. The **VS Code extension** (in `extension/`) adds the sidebar and the status bar item. The mod works without the extension; the extension shows nothing without the mod.

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
3. The extension watches that folder and shows each session as a card in the Sessions view. A finished session, or one with no plan steps yet, that goes quiet for 6 hours is marked idle and dropped after 24 hours. One with plan steps left that goes quiet for 6 hours shows as paused (amber, "paused 3d") and stays for 7 days. Hover a card and click x to hide it; it comes back if the session updates (hidden entries live in `~/.claude/session-compass/dismissed.json`). Ended sessions, and sessions that never got a message or a plan, are hidden.

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
