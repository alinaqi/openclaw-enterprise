import { Type } from "@sinclair/typebox";
import type { CalendarEvent } from "../../calendar/types.js";
import {
  type GoogleConfig,
  resolveAllCalendarAccounts,
  resolveCalendarAccount,
} from "../../calendar/accounts.js";
import {
  createEvent,
  deleteEvent,
  fetchEvents,
  fetchFreeBusy,
  updateEvent,
} from "../../calendar/client.js";
import {
  deduplicateEvents,
  findFreeSlots,
  filterByWorkingHours,
  mergeEvents,
  mergeBusyIntervals,
} from "../../calendar/merge.js";
import { stringEnum } from "../schema/typebox.js";
import {
  type AnyAgentTool,
  ToolInputError,
  jsonResult,
  readStringParam,
  readNumberParam,
  readStringArrayParam,
} from "./common.js";

const CALENDAR_ACTIONS = ["today", "events", "find_slots", "create", "update", "cancel"] as const;

const CalendarToolSchema = Type.Object({
  action: stringEnum(CALENDAR_ACTIONS),
  org: Type.Optional(Type.String()),
  date: Type.Optional(Type.String()),
  start: Type.Optional(Type.String()),
  end: Type.Optional(Type.String()),
  attendees: Type.Optional(Type.Array(Type.String())),
  duration_minutes: Type.Optional(Type.Number()),
  start_date: Type.Optional(Type.String()),
  end_date: Type.Optional(Type.String()),
  working_hours_only: Type.Optional(Type.Boolean()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  location: Type.Optional(Type.String()),
  event_id: Type.Optional(Type.String()),
  notify_attendees: Type.Optional(Type.Boolean()),
});

type CalendarToolOptions = {
  config?: GoogleConfig;
};

function nextDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createCalendarTool(opts?: CalendarToolOptions): AnyAgentTool {
  const cfg: GoogleConfig = opts?.config ?? {};

  return {
    label: "Calendar",
    name: "calendar",
    description: `Manage Google Calendar events across multiple orgs.

ACTIONS:
- today: Get today's events (or a specific date)
- events: Get events in a date range
- find_slots: Find mutual availability across attendees
- create: Create a new event with attendees
- update: Update an existing event
- cancel: Cancel/delete an event

Parameters vary by action. org is required for most actions (use "all" to query all orgs).`,
    parameters: CalendarToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });

      switch (action) {
        case "today":
          return await handleToday(params, cfg);
        case "events":
          return await handleEvents(params, cfg);
        case "find_slots":
          return await handleFindSlots(params, cfg);
        case "create":
          return await handleCreate(params, cfg);
        case "update":
          return await handleUpdate(params, cfg);
        case "cancel":
          return await handleCancel(params, cfg);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}

async function handleToday(params: Record<string, unknown>, cfg: GoogleConfig) {
  const org = readStringParam(params, "org", { required: true });
  const date = readStringParam(params, "date") ?? todayIso();
  const dateRange = { start: date, end: nextDay(date) };

  if (org === "all") {
    const accounts = resolveAllCalendarAccounts(cfg);
    const allEvents: CalendarEvent[] = [];
    for (const account of accounts) {
      const events = await fetchEvents(account, dateRange);
      allEvents.push(...events.map((e) => ({ ...e, org: account.org })));
    }
    const sorted = mergeEvents(allEvents);
    const deduped = deduplicateEvents(sorted);
    return jsonResult({ events: deduped });
  }

  const account = resolveCalendarAccount(cfg, org);
  if (!account) {
    throw new ToolInputError(`No calendar account configured for org: ${org}`);
  }
  const events = await fetchEvents(account, dateRange);
  return jsonResult({ events: mergeEvents(events) });
}

async function handleEvents(params: Record<string, unknown>, cfg: GoogleConfig) {
  const org = readStringParam(params, "org", { required: true });
  const start = readStringParam(params, "start", { required: true });
  const end = readStringParam(params, "end", { required: true });

  if (org === "all") {
    const accounts = resolveAllCalendarAccounts(cfg);
    const allEvents: CalendarEvent[] = [];
    for (const account of accounts) {
      const events = await fetchEvents(account, { start, end });
      allEvents.push(...events.map((e) => ({ ...e, org: account.org })));
    }
    const sorted = mergeEvents(allEvents);
    const deduped = deduplicateEvents(sorted);
    return jsonResult({ events: deduped });
  }

  const account = resolveCalendarAccount(cfg, org);
  if (!account) {
    throw new ToolInputError(`No calendar account configured for org: ${org}`);
  }
  const events = await fetchEvents(account, { start, end });
  return jsonResult({ events: mergeEvents(events) });
}

async function handleFindSlots(params: Record<string, unknown>, cfg: GoogleConfig) {
  const attendees = readStringArrayParam(params, "attendees", { required: true });
  const durationMinutes = readNumberParam(params, "duration_minutes", { required: true }) ?? 30;
  const startDate = readStringParam(params, "start_date", { required: true });
  const endDate = readStringParam(params, "end_date", { required: true });
  const workingHoursOnly = params.working_hours_only === true;

  const accounts = resolveAllCalendarAccounts(cfg);

  // Fetch freebusy for each attendee across all accounts
  const busyByPerson: Record<string, import("../../calendar/types.js").BusyInterval[]> = {};
  const timeRange = {
    start: `${startDate}T00:00:00Z`,
    end: `${endDate}T23:59:59Z`,
  };

  for (const email of attendees) {
    const personBusy: import("../../calendar/types.js").BusyInterval[] = [];
    for (const account of accounts) {
      const busy = await fetchFreeBusy(account, timeRange);
      personBusy.push(...busy);
    }
    busyByPerson[email] = mergeBusyIntervals(personBusy);
  }

  let slots = findFreeSlots({
    busyByPerson,
    durationMinutes,
    startDate,
    endDate,
    workingHoursOnly: false,
  });

  if (workingHoursOnly && accounts.length > 0) {
    const timezone = accounts[0].timezone ?? "UTC";
    slots = filterByWorkingHours(slots, timezone);
  }

  if (slots.length === 0) {
    return jsonResult({
      slots: [],
      suggestion:
        "No available slots found. Try to widen the date range or reduce the meeting duration.",
    });
  }

  return jsonResult({ slots });
}

async function handleCreate(params: Record<string, unknown>, cfg: GoogleConfig) {
  const org = readStringParam(params, "org", { required: true });
  const title = readStringParam(params, "title", { required: true });
  const start = readStringParam(params, "start", { required: true });
  const end = readStringParam(params, "end", { required: true });
  const attendees = readStringArrayParam(params, "attendees");
  const description = readStringParam(params, "description");
  const location = readStringParam(params, "location");

  const account = resolveCalendarAccount(cfg, org);
  if (!account) {
    throw new ToolInputError(`No calendar account configured for org: ${org}`);
  }

  const event = await createEvent(account, {
    title,
    start,
    end,
    attendees,
    description,
    location,
  });

  return jsonResult({ event: { ...event, org } });
}

async function handleUpdate(params: Record<string, unknown>, cfg: GoogleConfig) {
  const org = readStringParam(params, "org", { required: true });
  const eventId = readStringParam(params, "event_id", { required: true });
  const title = readStringParam(params, "title");
  const start = readStringParam(params, "start");
  const end = readStringParam(params, "end");
  const attendees = readStringArrayParam(params, "attendees");
  const description = readStringParam(params, "description");
  const location = readStringParam(params, "location");

  const account = resolveCalendarAccount(cfg, org);
  if (!account) {
    throw new ToolInputError(`No calendar account configured for org: ${org}`);
  }

  const event = await updateEvent(account, eventId, {
    title,
    start,
    end,
    attendees,
    description,
    location,
  });

  return jsonResult({ event: { ...event, org } });
}

async function handleCancel(params: Record<string, unknown>, cfg: GoogleConfig) {
  const org = readStringParam(params, "org", { required: true });
  const eventId = readStringParam(params, "event_id", { required: true });
  const notifyAttendees = params.notify_attendees !== false;

  const account = resolveCalendarAccount(cfg, org);
  if (!account) {
    throw new ToolInputError(`No calendar account configured for org: ${org}`);
  }

  await deleteEvent(account, eventId, { notifyAttendees });

  return jsonResult({ ok: true, cancelled: eventId });
}
