# Changelog

All notable changes to the Session Compass mod and VS Code extension. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The mod and the extension are versioned separately.

## [Unreleased]

### Added
- Hovering a session lists every step, and clicking a step shows its detail (#25).
- The `compass` tool takes an optional `detail` per step: one or two plain sentences on what the step covers (#25).
- The guide covers resumed sessions: after `/clear`, a handover or a restart note, the first tool call is `compass` (#25).

### Fixed
- The status bar and footer no longer guess between sessions that share a folder. A tab with no matching session now shows nothing instead of the newest session in that folder, so a click can no longer toggle another session's pane (#25).

## Mod 0.5.0 and extension 0.4.0 - 2026-10-18

### Added
- The extension shows parent plans from the worktree registry, with a resume action per slice (#21).

### Changed
- The Compass pane is off by default and is turned on per session from the hover card. The `status_line` option controls the status line (#23, #24).

## Mod 0.4.4 - 2026-10-15

### Added
- The session title leads with the first six characters of the session ID (#15).
- The tooltip shows the full session ID with a Copy link and a context-menu command (#16).

### Fixed
- Tabs without a plan show the first prompt, sent only when it changes (#13).
- Injected prompts stay out of the tab title, and a saved plan survives reopening a session (#10).

## 0.4.0 to 0.4.3 - 2026-10-12 to 2026-10-13

### Added
- The VS Code sidebar of live sessions, a status-bar summary that follows the focused Claude tab, and a restart note in the sidebar and in every fresh session (#1, #2).

### Fixed
- The status bar follows a tab whose label VS Code cut short (#7).
- Sessions that never got a message or a plan are hidden (#8).
- Rows are written to `~/.claude` when the mod lives outside it.

## Initial release - 2026-10-12

- The Session Compass mod, moved out of a private dev-mods folder into its own repository. Session rows carry steps, branch and working directory for the sidebar.
