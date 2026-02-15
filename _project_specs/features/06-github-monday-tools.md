# Feature: GitHub + Monday.com Tools

## Priority: 3

## Status: Spec Written

## Description

GitHub tools for protaige (and zenloop) code activity tracking, and Monday.com
tools for edubites project management. These complete Leo's view across all
work tracking systems.

Implements 8 tool action handlers following the existing OpenClaw tool pattern
(see `src/agents/tools/slack-actions.ts` and `src/agents/tools/discord-actions.ts`):

- **GitHub tools** (`github_action`): `prs`, `pr_detail`, `commits`, `search`
- **Monday.com tools** (`monday_action`): `boards`, `items`, `item_detail`, `updates`

Both tool families use the same pattern as existing action tools: a single
`handle*Action` function that dispatches on an `action` string parameter,
reads typed params via `readStringParam`/`readNumberParam` from `common.ts`,
calls external APIs, and returns `jsonResult(...)`.

## User Stories

- As a user, I can ask "any PRs waiting for review at protaige?" and get a list
- As a user, I can ask "what shipped this week?" and see merged PRs + commits
- As a user, I can ask "what needs my sign-off on Monday?" and see edubites items
- As a user, Leo includes GitHub + Monday data in activity summaries

## Acceptance Criteria

1. `handleGithubAction({ action: "prs", org: "protaige", state: "open" })` returns a list of open PRs with title, author, state, reviewStatus, age, and filesChanged
2. `handleGithubAction({ action: "prs", org: "protaige", author: "jonas" })` filters PRs to only those by author "jonas"
3. `handleGithubAction({ action: "pr_detail", org: "protaige", repo: "core", pr_number: 42 })` returns full PR detail including description, reviews, ciStatus, and diffStats
4. `handleGithubAction({ action: "commits", org: "zenloop", since: "<ISO date>" })` returns commits since the given date
5. `handleGithubAction({ action: "commits", org: "protaige", author: "jonas" })` filters commits by author
6. `handleGithubAction({ action: "search", org: "protaige", query: "bugfix", type: "prs" })` returns matching search results
7. `handleMondayAction({ action: "boards" })` returns all boards with id, name, and itemCount
8. `handleMondayAction({ action: "items", board: "Sprint Board", status: "Review" })` returns items matching the status filter
9. `handleMondayAction({ action: "items", assignee: "leo" })` returns items assigned to "leo"
10. `handleMondayAction({ action: "item_detail", item_id: "12345" })` returns full item with columns and updates
11. `handleMondayAction({ action: "updates", since: "<ISO date>" })` returns updates since the given date
12. Missing API token returns a descriptive error (not a crash)
13. Invalid org parameter throws `ToolInputError`
14. Authors in GitHub responses include a `resolvedPerson` field when people index is available

## Test Cases

| #   | Test                          | Input                                                                   | Expected Output                                                                |
| --- | ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | List open PRs                 | `{ action: "prs", org: "protaige", state: "open" }`                     | Array of PR objects with title, author, state, reviewStatus, age, filesChanged |
| 2   | PRs filtered by author        | `{ action: "prs", org: "protaige", author: "jonas" }`                   | Only PRs where author matches "jonas"                                          |
| 3   | PRs filtered by reviewer      | `{ action: "prs", org: "protaige", reviewer: "leo" }`                   | Only PRs where requested_reviewer matches "leo"                                |
| 4   | PRs default state is open     | `{ action: "prs", org: "protaige" }`                                    | Fetches with state=open                                                        |
| 5   | PR detail                     | `{ action: "pr_detail", org: "protaige", repo: "core", pr_number: 42 }` | Full PR with description, reviews, ciStatus, diffStats                         |
| 6   | PR detail missing repo        | `{ action: "pr_detail", org: "protaige", pr_number: 42 }`               | Throws ToolInputError (repo required)                                          |
| 7   | Commits since date            | `{ action: "commits", org: "zenloop", since: "2026-02-01T00:00:00Z" }`  | Commits after the given date                                                   |
| 8   | Commits filtered by author    | `{ action: "commits", org: "protaige", author: "jonas" }`               | Only commits by "jonas"                                                        |
| 9   | Commits for specific repo     | `{ action: "commits", org: "protaige", repo: "core" }`                  | Commits from protaige/core only                                                |
| 10  | Search PRs                    | `{ action: "search", org: "protaige", query: "bugfix", type: "prs" }`   | Search results with title, url, state                                          |
| 11  | Search code                   | `{ action: "search", org: "protaige", query: "TODO", type: "code" }`    | Code search results with path, repo                                            |
| 12  | Search issues                 | `{ action: "search", org: "protaige", query: "crash", type: "issues" }` | Issue search results                                                           |
| 13  | Invalid org                   | `{ action: "prs", org: "unknown" }`                                     | Throws ToolInputError                                                          |
| 14  | Missing GitHub token          | (no GITHUB_TOKEN env)                                                   | Returns error payload, does not throw                                          |
| 15  | Monday boards                 | `{ action: "boards" }`                                                  | Array of boards with id, name, itemCount                                       |
| 16  | Monday items by board         | `{ action: "items", board: "Sprint Board" }`                            | Items from "Sprint Board"                                                      |
| 17  | Monday items by status        | `{ action: "items", status: "Review" }`                                 | Items with status "Review"                                                     |
| 18  | Monday items by assignee      | `{ action: "items", assignee: "leo" }`                                  | Items assigned to "leo"                                                        |
| 19  | Monday item detail            | `{ action: "item_detail", item_id: "12345" }`                           | Full item with columns, updates                                                |
| 20  | Monday item detail missing id | `{ action: "item_detail" }`                                             | Throws ToolInputError                                                          |
| 21  | Monday updates                | `{ action: "updates" }`                                                 | Recent updates across all boards                                               |
| 22  | Monday updates since date     | `{ action: "updates", since: "2026-02-14T00:00:00Z" }`                  | Updates filtered by date                                                       |
| 23  | Monday updates by board       | `{ action: "updates", board: "Sprint Board" }`                          | Updates for specific board                                                     |
| 24  | Missing Monday token          | (no MONDAY_API_TOKEN env)                                               | Returns error payload, does not throw                                          |
| 25  | Unknown action                | `{ action: "nonexistent" }`                                             | Throws Error("Unknown action: nonexistent")                                    |
| 26  | Author resolution             | PR response with GitHub username                                        | resolvedPerson field populated from people index                               |

## Dependencies

- Feature 01 (People Index) -- for author/assignee resolution (optional; tools work without it)
- GitHub PAT (`GITHUB_TOKEN` env var) with `repo`, `read:org` scopes
- Monday.com API token (`MONDAY_API_TOKEN` env var)

## Files

### New files

- `src/agents/tools/github-actions.ts` -- GitHub action handler (`handleGithubAction`)
- `src/agents/tools/github-actions.test.ts` -- Unit tests for GitHub actions
- `src/agents/tools/monday-actions.ts` -- Monday.com action handler (`handleMondayAction`)
- `src/agents/tools/monday-actions.test.ts` -- Unit tests for Monday.com actions

### Modified files

- None required for core functionality (tool registration happens via config/channels)

## Notes

- Follow the existing tool action pattern: single `handle*Action(params, cfg)` export
- Use `readStringParam` / `readNumberParam` from `common.ts` for param extraction
- Use `jsonResult(...)` from `common.ts` for return values
- GitHub API calls use `fetch()` with Bearer token auth
- Monday.com API uses GraphQL via `fetch()` POST to `https://api.monday.com/v2`
- Both tools gracefully degrade when API tokens are missing (return error payload)
- The `org` parameter for GitHub tools maps to GitHub organization names in config
- `ToolInputError` from `common.ts` is used for invalid input (consistent with other tools)
- People index resolution is optional -- if the people index module is not available, the `resolvedPerson` field is omitted

## Blocks

- Feature 07 (Briefings) -- GitHub + Monday data needed for summaries

## External APIs

- GitHub REST API v3: `/repos/{owner}/{repo}/pulls`, `/repos/{owner}/{repo}/commits`, `/search/code`, `/search/issues`
- Monday.com API v2 (GraphQL): `boards`, `items_page_by_column_values`, `updates`
