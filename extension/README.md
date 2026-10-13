# Session Compass

A sidebar for the parallel Claude Code sessions you have running: which repo, which branch, what plan, which step.

Click the compass icon in the Activity Bar to open **Sessions**. Sessions are grouped by repo. Each shows its plan, a progress bar, and the step it is on. The status bar shows the stage of the session in the active tab.

## Needs the mod

This extension only reads what the **session-compass mod** writes to `~/.claude/session-compass/` (or `$CLAUDE_CONFIG_DIR/session-compass/`). Without the mod the view is empty. Install the mod from your terminal:

```
claude plugin marketplace add m4cd4r4/session-compass
claude plugin install session-compass@session-compass
```

## Details

- A session appears once Claude calls the `compass` tool, which the mod adds and asks Claude to use for tasks of 3 or more steps.
- A session with no update for 6 hours is marked idle and dropped after 24 hours. Ended sessions, and sessions that never got a message or a plan, are hidden.
- If `restart-note.md` exists in the same folder, it is shown at the top of the tree.
- The **Refresh** button re-reads the folder.
- No network requests. The extension only reads local files.

Source and mod: [github.com/m4cd4r4/session-compass](https://github.com/m4cd4r4/session-compass). Licence: MIT.
