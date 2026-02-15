# Feature: Asana Tools (zenloop)

## Priority: 3

## Status: Spec Written

## Description

Asana tools for tracking zenloop engineering work. Provides read-only access to
tasks, projects, sprints, and assignees via the Asana REST API. The tools follow
the same `createXxxTool` factory pattern used by existing OpenClaw tools (e.g.,
`web-search`, `memory-tool`). Each tool is exposed as an `AgentTool` with a
TypeBox schema, backed by a thin Asana API client that handles authentication,
rate limiting, and response normalization.

Assignee names are resolved via the People Index (Feature 01) when available,
falling back to Asana's own user display names.

## Acceptance Criteria

1. `asana_tasks` returns zenloop tasks with title, assignee name, status, due date, and tags
2. `asana_tasks` with `assignee` param filters to a single person (resolved via people index email or Asana display name)
3. `asana_tasks` with `status` param filters by completion state (not_started, in_progress, completed)
4. `asana_task_detail` returns full task including description, subtasks, comments, and custom fields
5. `asana_projects` returns all projects in the configured workspace with name, status, and color
6. `asana_search` returns tasks matching a text query, optionally scoped to a project
7. `asana_sprint_status` returns sprint metrics: total tasks, completed count, incomplete count, and blocked tasks
8. All tools return `jsonResult` format matching OpenClaw conventions
9. Missing or invalid API token returns a helpful error (not a crash)
10. API errors (4xx/5xx) are caught and returned as structured error results

## Test Cases

| #   | Test                      | Input                                                  | Expected Output                                               |
| --- | ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| 1   | List tasks default        | `asana_tasks({})`                                      | Returns array of tasks with title, assignee, status, due_on   |
| 2   | List tasks with limit     | `asana_tasks({ limit: 5 })`                            | Returns at most 5 tasks                                       |
| 3   | Filter by assignee email  | `asana_tasks({ assignee: "verena@zenloop.com" })`      | Only tasks assigned to Verena                                 |
| 4   | Filter by assignee name   | `asana_tasks({ assignee: "verena" })`                  | Only tasks assigned to Verena (people index lookup)           |
| 5   | Filter by status          | `asana_tasks({ status: "completed" })`                 | Only completed tasks                                          |
| 6   | Filter by project         | `asana_tasks({ project: "Sprint 42" })`                | Only tasks in Sprint 42 project                               |
| 7   | Task detail               | `asana_task_detail({ task_gid: "12345" })`             | Full task with description, subtasks, comments, custom_fields |
| 8   | Task detail not found     | `asana_task_detail({ task_gid: "invalid" })`           | Error result with "not found" message                         |
| 9   | List projects             | `asana_projects({})`                                   | Array of projects with name, gid, status                      |
| 10  | Search tasks              | `asana_search({ query: "auth migration" })`            | Tasks matching the query                                      |
| 11  | Search within project     | `asana_search({ query: "bug", project: "Sprint 42" })` | Matching tasks scoped to project                              |
| 12  | Sprint status             | `asana_sprint_status({})`                              | Object with total, completed, incomplete, blocked counts      |
| 13  | Sprint status for project | `asana_sprint_status({ project: "Sprint 42" })`        | Metrics for specified project                                 |
| 14  | Missing API token         | Any tool call without ASANA_PAT                        | Structured error with setup instructions                      |
| 15  | API error handling        | API returns 401                                        | Structured error result (not thrown exception)                |

## Dependencies

- Feature 01 (People Index) -- for assignee name resolution (soft dependency: tools work without it, just use Asana display names)
- Asana PAT environment variable (`ASANA_PAT`) or config at `tools.asana.apiKey`
- Asana workspace GID configured at `tools.asana.workspaceGid` or env `ASANA_WORKSPACE_GID`

## Files

- `src/asana/client.ts` -- Asana REST API client (fetch-based, handles auth + rate limits)
- `src/asana/types.ts` -- TypeScript types for Asana API responses
- `src/agents/tools/asana-tools.ts` -- Tool factories (`createAsanaTool`) following OpenClaw pattern
- `src/agents/tools/asana-tools.test.ts` -- Unit tests with mocked API client
- `src/config/types.asana.ts` -- Config types for `tools.asana` section

## Notes

### Tool Names (snake_case, matching OpenClaw convention)

- `asana_tasks` -- list/filter tasks
- `asana_task_detail` -- get full task details
- `asana_projects` -- list workspace projects
- `asana_search` -- search tasks by text
- `asana_sprint_status` -- sprint metrics summary

### Asana API Endpoints Used

- `GET /workspaces/{gid}/tasks` -- list tasks (with opt_fields)
- `GET /tasks/{task_gid}` -- task detail
- `GET /tasks/{task_gid}/subtasks` -- subtasks
- `GET /tasks/{task_gid}/stories` -- comments/activity
- `GET /projects` -- list projects in workspace
- `GET /workspaces/{gid}/typeahead` -- search/typeahead

### Authentication

- Personal Access Token (PAT) passed as Bearer token
- Resolved from: config `tools.asana.apiKey` > env `ASANA_PAT`
- The workspace GID identifies the zenloop workspace

### Config Shape

```typescript
// Added to OpenClawConfig.tools
asana?: {
  enabled?: boolean;
  apiKey?: string;           // PAT (or use ASANA_PAT env)
  workspaceGid?: string;     // zenloop workspace GID (or ASANA_WORKSPACE_GID env)
  defaultProjectGid?: string; // optional default sprint project
  rateLimitPerMinute?: number; // default 1500
}
```

### Rate Limiting

- Asana allows 1500 requests/minute per PAT
- Client tracks remaining quota via `X-Asana-Rate-Limit-*` response headers
- On 429 response, client waits for `Retry-After` seconds before retrying (once)

### Error Handling Pattern

All tools catch API errors and return structured results via `jsonResult`:

```typescript
{ error: "asana_api_error", status: 401, message: "Invalid token" }
{ error: "missing_asana_config", message: "Set ASANA_PAT or configure tools.asana.apiKey" }
```

### Tool Registration

Tools are registered in `openclaw-tools.ts` via a `createAsanaTool()` factory,
following the pattern of `createWebSearchTool()`. The factory returns `null` when
Asana is not configured (no API key), so the tool is simply absent from the
tool list.

## Blocks

- Feature 07 (Briefings) -- Asana data needed for engineering digest
