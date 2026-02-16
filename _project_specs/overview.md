# Project Overview — OpenClaw Enterprise (Leo)

## Vision

OpenClaw Enterprise is a fork of OpenClaw being made enterprise-ready for
multi-organization management. Leo is the AI chief of staff that aggregates
work context across multiple organizations (edubites, protaige, zenloop) into a
single conversational interface with workspace isolation. Leo understands org
structures, monitors email, tracks engineering activity, manages calendars, and
can act autonomously on behalf of the user — all scoped to the correct workspace.

## Goals

- [x] Workspace switcher with per-org session isolation (Stripe-style UI)
- [x] Dynamic PM tool selection per workspace (GitHub Issues, Asana, Monday.com, Jira, Linear)
- [x] Workspace-scoped chat sessions (no cross-org message bleed)
- [x] WebSocket reconnect resilience (auto-recovery of chat state)
- [ ] Unified people directory across all orgs with role/team awareness
- [ ] Gmail monitoring with intelligent triage and auto-reply capability
- [ ] Cross-org calendar management and availability finding
- [ ] Engineering activity summaries (Asana + GitHub + Slack for zenloop)
- [ ] Project tracking via Monday.com (edubites) and Asana (zenloop)
- [ ] Daily morning briefings and weekly engineering recaps
- [ ] Accessible via WhatsApp, Slack, and Web UI
- [ ] Per-workspace service configuration (Render, Supabase, Vercel)

## Non-Goals

- Building a traditional visual dashboard with widgets/charts
- Replacing individual tools (Asana, Monday, GitHub) — Leo summarizes, not replaces
- Managing other people's workflows — Leo serves only the user
- Real-time streaming of all activity — Leo provides periodic summaries and on-demand queries

## Organizations

### edubites

- **Email:** Google Workspace
- **Project management:** Monday.com
- **Communication:** Slack (edubites workspace)
- **Calendar:** Google Calendar

### protaige

- **Email:** Google Workspace
- **Code:** GitHub
- **Communication:** Slack (protaige workspace)
- **Calendar:** Google Calendar

### zenloop

- **Email:** Google Workspace
- **Project management:** Asana
- **Code:** GitHub
- **Communication:** Slack (zenloop workspace)
- **Calendar:** Google Calendar

### saasgroup

- **Communication:** Slack (saasgroup workspace, shared/parent org)

## Success Metrics

- Leo can answer "what's happening in zenloop engineering?" with accurate, current data
- Leo can find meeting availability across people in different orgs within 10 seconds
- Leo can process incoming emails and draft contextually aware replies
- Leo correctly identifies who a person is across orgs (by email cross-reference)
- Morning briefing is delivered by 8am with actionable summary
