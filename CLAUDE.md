# CLAUDE.md

## Skills
Read and follow these skills before writing any code:
- .claude/skills/base/SKILL.md
- .claude/skills/security/SKILL.md
- .claude/skills/project-tooling/SKILL.md
- .claude/skills/session-management/SKILL.md
- .claude/skills/typescript/SKILL.md
- .claude/skills/existing-repo/SKILL.md
- .claude/skills/llm-patterns/SKILL.md
- .claude/skills/agent-teams/SKILL.md

## Upstream Reference
OpenClaw's own agent instructions are in AGENTS.md. Read it for codebase conventions.

## Project Overview
**Leo** — A personal AI chief of staff built on top of OpenClaw. Leo aggregates
work context across three organizations (edubites, protaige, zenloop) and acts
as an intelligent assistant that can read emails, check calendars, summarize
engineering activity, understand org structures, and act on behalf of the user.

Leo is implemented as a set of custom OpenClaw agent tools and extensions that
plug into OpenClaw's existing gateway, agent runtime, and channel system.

## Organizations

| Org | Domain | Services |
|-----|--------|----------|
| edubites | Google Workspace | Slack, Monday.com, Google Calendar, Gmail |
| protaige | Google Workspace | Slack, GitHub, Google Calendar, Gmail |
| zenloop | Google Workspace | Slack, Asana, GitHub, Google Calendar, Gmail |
| saasgroup | — | Slack (shared workspace) |

## Tech Stack
- **Runtime:** Node.js 22+ (TypeScript, ESM)
- **Base platform:** OpenClaw (multi-channel AI gateway)
- **Package manager:** pnpm 10.23.0
- **Build:** tsdown
- **Testing:** Vitest
- **Linting:** OxLint + oxfmt
- **AI providers:** Anthropic (Claude), OpenAI, Google Gemini
- **Channels:** WhatsApp, Slack (3 workspaces), Web UI
- **External APIs:** Gmail API, Google Calendar API, Slack Web API, Asana REST API, Monday.com API, GitHub REST API

## Architecture

Leo's tools are built as OpenClaw agent tools in `src/agents/tools/` following
OpenClaw's existing tool patterns. The people index uses OpenClaw's SQLite +
sqlite-vec infrastructure for storage and semantic search.

```
User (WhatsApp / Slack / Web UI)
    │
    ▼
OpenClaw Gateway (ws://localhost:18789)
    │
    ▼
AI Agent (Claude) + Leo Tools:
    ├── gmail.*        → Google Gmail API (multi-account)
    ├── calendar.*     → Google Calendar API (multi-account)
    ├── slack_read.*   → Slack Web API (3 workspaces)
    ├── asana.*        → Asana REST API (zenloop)
    ├── monday.*       → Monday.com API (edubites)
    ├── github.*       → GitHub REST API (protaige + zenloop)
    ├── people.*       → People index (SQLite + embeddings)
    └── briefing.*     → Automated summaries (cron)
```

## Key Commands
```bash
# Verify tooling
./scripts/verify-tooling.sh

# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test:fast

# Lint + format + typecheck
pnpm check

# Run OpenClaw locally
pnpm dev

# Run gateway (skip external channels)
pnpm gateway:dev

# Run TUI
pnpm tui
```

## Documentation
- `AGENTS.md` - OpenClaw's upstream agent instructions
- `docs/` - OpenClaw documentation
- `_project_specs/` - Leo project specifications and todos

## Atomic Todos
All work is tracked in `_project_specs/todos/`:
- `active.md` - Current work
- `backlog.md` - Future work
- `completed.md` - Done (for reference)

Every todo must have validation criteria and test cases. See base.md skill for format.

## Session Management

### State Tracking
Maintain session state in `_project_specs/session/`:
- `current-state.md` - Live session state (update every 15-20 tool calls)
- `decisions.md` - Key architectural/implementation decisions (append-only)
- `code-landmarks.md` - Important code locations for quick reference
- `archive/` - Past session summaries

### Automatic Updates
Update `current-state.md`:
- After completing any todo item
- Every 15-20 tool calls during active work
- Before any significant context shift
- When encountering blockers

### Decision Logging
Log to `decisions.md` when:
- Choosing between architectural approaches
- Selecting libraries or tools
- Making security-related choices
- Deviating from standard patterns

### Session Handoff
When ending a session or approaching context limits, update current-state.md with:
- What was completed this session
- Current state of work
- Immediate next steps (numbered, specific)
- Open questions or blockers
- Files to review first when resuming

### Resuming Work
When starting a new session:
1. Read `_project_specs/session/current-state.md`
2. Check `_project_specs/todos/active.md`
3. Review recent entries in `decisions.md` if context needed
4. Continue from "Next Steps" in current-state.md

## Agent Teams (Default Workflow)

This project uses Claude Code Agent Teams as the default development workflow.
Every feature is implemented by a dedicated agent following a strict TDD pipeline.

### Strict Pipeline (per feature)
Spec > Spec Review > Tests > RED Verify > Implement > GREEN Verify > Validate > Code Review > Security Scan > Branch + PR

### Team Roster
- **Team Lead**: Orchestrates, breaks work into features, assigns tasks (NEVER writes code)
- **Quality Agent**: Verifies TDD discipline - RED/GREEN phases, coverage >= 80%
- **Security Agent**: OWASP scanning, secrets detection, dependency audit
- **Code Review Agent**: Multi-engine code reviews (Claude/Codex/Gemini)
- **Merger Agent**: Creates feature branches and PRs via gh CLI
- **Feature Agents**: One per feature, follows strict TDD pipeline

### Commands
- `/spawn-team` - Spawn the agent team

### Required Environment
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

## Project-Specific Patterns

### Tool Development Pattern
All Leo tools follow OpenClaw's existing tool conventions in `src/agents/tools/`.
Each tool:
- Exports a tool definition with name, description, parameters (Zod schema)
- Implements an async handler function
- Uses OpenClaw's existing auth/config system for API credentials
- Includes colocated `*.test.ts` tests

### Multi-Account Pattern
Services that span multiple orgs (Gmail, Calendar, Slack) use an account
registry pattern where each org's credentials are stored in OpenClaw config
and tools accept an `org` parameter to select which account to use.

### People Index Pattern
The people index is a SQLite table with vector embeddings, synced daily via
cron from Slack user directories, enriched with data from GitHub, Asana,
Monday.com, and email headers. Cross-referenced by email address.
