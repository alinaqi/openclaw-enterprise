# Feature: Calendar Tools

## Priority: 2

## Status: Spec Written

## Description

Multi-account Google Calendar tools that allow Leo to check availability, find
free slots across multiple people and orgs, and create/update/cancel events. The
killer feature is cross-org availability -- Leo can find a time when Ali (across
all 3 org calendars), Mark (edubites), and Verena (zenloop) are all free.

Implemented as an OpenClaw agent tool following the existing `create*Tool` pattern
(TypeBox schema, `jsonResult` responses, `readStringParam` helpers).

## Acceptance Criteria

1. `calendar.today` with `org="all"` returns merged, deduplicated, time-sorted events across all configured Google Calendar accounts
2. `calendar.events` returns events in a given date range for a single org or all orgs
3. `calendar.find_slots` finds mutual free windows across multiple attendees, merging each person's calendars from all their orgs
4. `calendar.find_slots` filters by working hours (9am-6pm) in each attendee's timezone when `working_hours_only=true`
5. `calendar.create` creates an event on the specified org's calendar and returns the event ID
6. `calendar.update` updates an existing event's title, time, attendees, description, or location
7. `calendar.cancel` deletes an event and optionally notifies attendees
8. Cross-org busy blocking: if the user is busy on ANY org calendar, that slot is marked busy
9. Deduplication: the same event appearing on multiple org calendars (e.g. a cross-org meeting) is returned only once
10. All datetime handling is timezone-aware using IANA timezone identifiers
11. When no availability is found, returns an empty slots array with a `suggestion` field recommending a wider date range

## Test Cases

| #   | Test                           | Input                                                                                                              | Expected Output                                               |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1   | Today's events single org      | `action=today, org=edubites`                                                                                       | Events for today from edubites calendar, sorted by start time |
| 2   | Today's events all orgs        | `action=today, org=all`                                                                                            | Merged events from all org calendars, deduplicated and sorted |
| 3   | Events in date range           | `action=events, org=edubites, start=2026-02-16, end=2026-02-20`                                                    | Events within range                                           |
| 4   | Find slots basic               | `action=find_slots, attendees=[a@x.com, b@y.com], duration_minutes=30, start_date=2026-02-16, end_date=2026-02-20` | Available 30-min slots when both are free                     |
| 5   | Find slots cross-org busy      | User busy in zenloop cal 10-11am, free in edubites                                                                 | 10-11am slot NOT available                                    |
| 6   | Find slots working hours       | `working_hours_only=true`, attendee in Europe/Berlin                                                               | Slots only between 9am-6pm Berlin time                        |
| 7   | Find slots no availability     | All time slots occupied                                                                                            | Empty slots array with suggestion to widen range              |
| 8   | Create event                   | `action=create, org=edubites, title=Standup, start=..., end=..., attendees=[...]`                                  | Event created, returns event ID and confirmation              |
| 9   | Update event                   | `action=update, org=edubites, event_id=abc, title=New Title`                                                       | Event updated, returns updated event                          |
| 10  | Cancel event with notification | `action=cancel, org=edubites, event_id=abc, notify_attendees=true`                                                 | Event cancelled, attendees notified                           |
| 11  | Cancel event silently          | `action=cancel, org=edubites, event_id=abc, notify_attendees=false`                                                | Event cancelled, no notification                              |
| 12  | Missing required param         | `action=today` (no org)                                                                                            | ToolInputError: org required                                  |
| 13  | Invalid action                 | `action=bogus`                                                                                                     | Error: Unknown action                                         |
| 14  | Deduplication                  | Same event on 2 org calendars                                                                                      | Returned once in merged results                               |
| 15  | Today custom date              | `action=today, org=all, date=2026-02-20`                                                                           | Events for Feb 20, not today                                  |

## Dependencies

- Feature 01 (People Index) -- for attendee email -> calendar account resolution in `find_slots`
- Google Calendar API v3 client (`googleapis` npm package or direct REST calls)
- OAuth 2.0 per Google Workspace account (configured in OpenClaw config under `google.accounts`)

## Files

### New Files

- `src/calendar/client.ts` -- Google Calendar API client wrapper (OAuth token resolution, API calls)
- `src/calendar/types.ts` -- TypeScript types for calendar events, time slots, config
- `src/calendar/merge.ts` -- Event merging, deduplication, and time-slot intersection logic
- `src/calendar/accounts.ts` -- Multi-account resolution from OpenClaw config
- `src/agents/tools/calendar-tool.ts` -- Agent tool definition (schema + execute)
- `src/calendar/client.test.ts` -- Unit tests for API client
- `src/calendar/merge.test.ts` -- Unit tests for merge/dedup/slot-finding logic
- `src/agents/tools/calendar-tool.test.ts` -- Unit tests for the tool handler

### Modified Files

- `src/agents/pi-tools.ts` -- Register calendar tool in the tools list

## Architecture

### Tool Schema (single tool with action discriminator)

Following the cron-tool and gateway-tool pattern, calendar uses a single tool
with an `action` field:

```typescript
const CALENDAR_ACTIONS = ["today", "events", "find_slots", "create", "update", "cancel"] as const;

const CalendarToolSchema = Type.Object({
  action: stringEnum(CALENDAR_ACTIONS),
  org: Type.Optional(Type.String()), // enum: edubites|protaige|zenloop|all
  date: Type.Optional(Type.String()), // ISO date for today action
  start: Type.Optional(Type.String()), // ISO date/datetime
  end: Type.Optional(Type.String()), // ISO date/datetime
  attendees: Type.Optional(Type.Array(Type.String())),
  duration_minutes: Type.Optional(Type.Number()),
  start_date: Type.Optional(Type.String()), // ISO date for find_slots
  end_date: Type.Optional(Type.String()), // ISO date for find_slots
  working_hours_only: Type.Optional(Type.Boolean()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  location: Type.Optional(Type.String()),
  event_id: Type.Optional(Type.String()),
  notify_attendees: Type.Optional(Type.Boolean()),
});
```

### Config Structure

```yaml
google:
  accounts:
    edubites:
      client_id: "..."
      client_secret: "..."
      refresh_token: "..."
      calendar_id: "primary"
      timezone: "Europe/Berlin"
    protaige:
      # same structure
    zenloop:
      # same structure
```

### Cross-Org Availability Algorithm

1. For each attendee email, resolve to person via People Index
2. For each person, identify which org calendars they have access to
3. Query Google Calendar freebusy API for each calendar
4. Per person: merge all their org busy times into a single busy timeline
5. Across all attendees: find time windows where ALL attendees are free
6. Filter by working hours (convert 9am-6pm in each person's timezone)
7. Return slots >= requested duration_minutes

### Deduplication Strategy

Events are deduplicated by `(title, start_time, end_time)` tuple. When the same
meeting appears on multiple org calendars, keep the first occurrence and annotate
with `orgs: string[]` to show which calendars it was found on.

## Notes

- Google Calendar API rate limit: 1M queries/day per project, but 100 requests/100 seconds per user. Use batch requests where possible.
- OAuth tokens are stored in the OpenClaw config, same pattern as Gmail tools.
- The `find_slots` action is the most complex -- it needs to handle timezone math carefully. Use `Temporal` or `luxon` for timezone conversions if available, otherwise `Intl.DateTimeFormat`.
- For the MVP, `calendar.create` does NOT require user approval (that can be added later as a safety gate). The tool returns the event data and the agent can ask for confirmation in its response.
