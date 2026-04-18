# Fork Maintenance Guide

This is the enterprise fork of [OpenClaw](https://github.com/openclaw/openclaw).

**Upstream:** `origin` = `openclaw/openclaw` (read-only, fetch/merge only)
**Fork:** `fork` = `alinaqi/openclaw` (push target)

**Branch Strategy:**
```
main          (stable releases, PRs from develop)
  └── develop   (active development, PRs from feature/*)
        ├── feature/09-xxx
        └── feature/10-xxx
```
- `develop` — all feature branches PR into here
- `main` — stable releases; merge develop via PR when ready
- `origin/main` — upstream sync target (merge into develop)

## Sync Procedure

```bash
# 1. Switch to develop
git checkout develop

# 2. Tag before sync (rollback safety net)
git tag pre-sync-$(date +%Y-%m-%d)

# 3. Fetch upstream
git fetch origin

# 4. Merge upstream main into develop
git merge origin/main

# 5. Resolve conflicts (see conflict-prone files below)

# 6. Push to fork
git push fork develop
```

**Cadence:** Weekly or biweekly. Don't sync daily — upstream moves fast.
**Releases:** When develop is stable, create a PR from `develop` → `main`.

## Modified Upstream Files (Conflict Risk)

These 10 files are modified from upstream and will likely conflict on sync.
Listed by blast radius (highest risk first):

### Critical (core integration points)

| File | What We Changed | Why |
|------|----------------|-----|
| `src/agents/openclaw-tools.ts` | Added Leo tool registrations (Gmail, Calendar, GitHub, Monday, Briefing, Slack, Asana) inline | Entry point for all agent tools; upstream refactors this often |
| `ui/src/ui/app.ts` | Added workspace state, click-outside/escape handlers, workspace imports | Main app component; upstream adds features here frequently |
| `ui/src/ui/app-view-state.ts` | Added workspace fields to AppViewState type + workspace handler methods | Central type definition; upstream expands this with every UI feature |

### High (UI integration)

| File | What We Changed | Why |
|------|----------------|-----|
| `ui/src/ui/app-render.ts` | Added workspace switcher + settings rendering in topbar and footer | Main render function; upstream restructures views here |
| `ui/src/ui/app-chat.ts` | Added `activeWorkspace` to ChatHost, workspace context injection in messages | Chat pipeline; upstream adds slash commands and chat features |
| `ui/src/ui/storage.ts` | Added `activeWorkspaceId` to UiSettings | Settings type; upstream adds new settings |

### Medium (styling)

| File | What We Changed | Why |
|------|----------------|-----|
| `ui/src/styles/layout.css` | Added workspace switcher + settings modal CSS (~360 lines) | Main stylesheet; upstream adds component styles |
| `ui/src/styles/layout.mobile.css` | Added workspace mobile responsive styles | Mobile overrides; less frequently changed |

### Low (cosmetic)

| File | What We Changed | Why |
|------|----------------|-----|
| `README.md` | Enterprise branding, feature list | Upstream updates docs/badges |
| `ui/index.html` | Title change | Rarely changes |

## Added Files (Zero Conflict Risk)

78 files added by Leo. These never conflict with upstream.

### Leo Tools (`src/agents/tools/`)
- `asana-tools.ts` + test
- `briefing-tool.ts` + config/format/sections + test
- `calendar-tool.ts` + test
- `github-actions.ts` + test
- `gmail-actions.ts` + test
- `monday-actions.ts` + test
- `people-tool.ts` + test
- `slack-reader-tool.ts` + test

### Service Clients
- `src/asana/` — Asana API client + types
- `src/calendar/` — Google Calendar client, merge, accounts + tests
- `src/gmail/` — Gmail client, accounts, actions, token + tests
- `src/leo/` — Leo config, system prompt, tool registry + tests
- `src/people/` — People index (embeddings, schema, store, sync) + tests
- `src/slack/reader/` — Slack reader (channels, history, search, thread, summarize) + tests

### UI Components
- `ui/src/ui/views/workspace-switcher.ts` + test
- `ui/src/ui/views/workspace-settings.ts`
- `ui/src/ui/workspace.ts` + test

### Specs
- `_project_specs/` — Feature specs, overview

## Reducing Future Conflicts

### Priority 1: Move tools to plugin system
The biggest conflict source is `src/agents/openclaw-tools.ts`. OpenClaw has a plugin
system in `extensions/`. Moving Leo tools to `extensions/leo/` would eliminate this
conflict entirely. Tools would register via manifest instead of inline edits.

### Priority 2: UI extension points
Workspace switcher touches 6 upstream UI files. If OpenClaw adds a topbar extension
API or slot system, migrate to that. Until then, keep workspace logic in isolated
components (`workspace-switcher.ts`, `workspace-settings.ts`, `workspace.ts`) and
minimize the glue code in upstream files.

### Priority 3: Type isolation
`app-view-state.ts` conflicts happen because we add workspace fields to the central
type. Consider a `WorkspaceViewState` intersection type in a separate file that
extends `AppViewState`.

## Tools

### git rerere
Enabled. Git remembers conflict resolutions and auto-applies them on repeated merges.

### iCPG (Incremental Code Property Graph)
`codebase-memory-mcp` is installed and configured. Use it for:
- **Blast radius analysis:** Before syncing, run `detect_changes` on the upstream diff
  to see which Leo symbols are affected
- **Dependency tracing:** `trace_call_path` to understand what breaks if upstream
  changes a function signature
- **Architecture overview:** `get_architecture` for quick repo orientation

### Update Code Index
After each sync, re-index: run `/update-code-index` or use the `index_repository` MCP tool.

## Safety Checklist (Pre-Sync)

- [ ] Tag current state: `git tag pre-sync-YYYY-MM-DD`
- [ ] Run iCPG `detect_changes` on upstream diff
- [ ] Review upstream changelog for breaking changes
- [ ] `git fetch origin && git merge origin/main`
- [ ] Resolve conflicts using this guide
- [ ] Verify no conflict markers: `grep -rn "<<<<<<" --include="*.ts" --include="*.css"`
- [ ] Run `pnpm check` on touched files (ignore pre-existing upstream lint errors)
- [ ] Push to fork: `git push`
- [ ] Re-index: `/update-code-index`
