import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../../calendar/types.js";

// Mock the calendar client module
const fetchEventsMock = vi.fn();
const fetchFreeBusyMock = vi.fn();
const createEventMock = vi.fn();
const updateEventMock = vi.fn();
const deleteEventMock = vi.fn();

vi.mock("../../calendar/client.js", () => ({
  fetchEvents: (...args: unknown[]) => fetchEventsMock(...args),
  fetchFreeBusy: (...args: unknown[]) => fetchFreeBusyMock(...args),
  createEvent: (...args: unknown[]) => createEventMock(...args),
  updateEvent: (...args: unknown[]) => updateEventMock(...args),
  deleteEvent: (...args: unknown[]) => deleteEventMock(...args),
}));

// Mock accounts module
const resolveCalendarAccountMock = vi.fn();
const resolveAllCalendarAccountsMock = vi.fn();

vi.mock("../../calendar/accounts.js", () => ({
  resolveCalendarAccount: (...args: unknown[]) => resolveCalendarAccountMock(...args),
  resolveAllCalendarAccounts: (...args: unknown[]) => resolveAllCalendarAccountsMock(...args),
}));

// Mock merge module
vi.mock("../../calendar/merge.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../calendar/merge.js")>("../../calendar/merge.js");
  return actual;
});

import { createCalendarTool } from "./calendar-tool.js";

const testConfig = {
  google: {
    accounts: {
      edubites: {
        clientId: "id-1",
        clientSecret: "secret-1",
        refreshToken: "refresh-1",
        calendarId: "primary",
        timezone: "Europe/Berlin",
      },
      protaige: {
        clientId: "id-2",
        clientSecret: "secret-2",
        refreshToken: "refresh-2",
        calendarId: "primary",
        timezone: "Europe/Berlin",
      },
      zenloop: {
        clientId: "id-3",
        clientSecret: "secret-3",
        refreshToken: "refresh-3",
        calendarId: "primary",
        timezone: "Europe/Berlin",
      },
    },
  },
};

function makeCalendarEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: overrides.id ?? "evt-1",
    title: overrides.title ?? "Meeting",
    start: overrides.start ?? "2026-02-16T09:00:00Z",
    end: overrides.end ?? "2026-02-16T10:00:00Z",
    org: overrides.org ?? "edubites",
    calendarId: overrides.calendarId ?? "primary",
    attendees: overrides.attendees ?? [],
    location: overrides.location,
    description: overrides.description,
    status: overrides.status ?? "confirmed",
  };
}

describe("createCalendarTool", () => {
  let tool: ReturnType<typeof createCalendarTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createCalendarTool({ config: testConfig as never });

    resolveCalendarAccountMock.mockImplementation((_cfg: unknown, org: string) => {
      const accounts = testConfig.google.accounts as Record<string, unknown>;
      return accounts[org] ?? null;
    });
    resolveAllCalendarAccountsMock.mockReturnValue(
      Object.entries(testConfig.google.accounts).map(([org, account]) => ({
        org,
        ...account,
      })),
    );
  });

  it("creates a tool with correct name and label", () => {
    expect(tool.name).toBe("calendar");
    expect(tool.label).toBe("Calendar");
  });

  describe("action: today", () => {
    it("returns events for a single org", async () => {
      const events = [
        makeCalendarEvent({
          title: "Standup",
          start: "2026-02-15T09:00:00Z",
          end: "2026-02-15T09:30:00Z",
        }),
      ];
      fetchEventsMock.mockResolvedValue(events);

      const result = await tool.execute("call-1", {
        action: "today",
        org: "edubites",
      });

      expect(result.details).toBeDefined();
      const details = result.details as { events: CalendarEvent[] };
      expect(details.events).toHaveLength(1);
      expect(details.events[0].title).toBe("Standup");
    });

    it("returns merged events for all orgs", async () => {
      fetchEventsMock
        .mockResolvedValueOnce([
          makeCalendarEvent({
            title: "Standup",
            org: "edubites",
            start: "2026-02-15T09:00:00Z",
            end: "2026-02-15T09:30:00Z",
          }),
        ])
        .mockResolvedValueOnce([
          makeCalendarEvent({
            title: "1:1",
            org: "protaige",
            start: "2026-02-15T10:00:00Z",
            end: "2026-02-15T10:30:00Z",
          }),
        ])
        .mockResolvedValueOnce([
          makeCalendarEvent({
            title: "Sprint Review",
            org: "zenloop",
            start: "2026-02-15T14:00:00Z",
            end: "2026-02-15T15:00:00Z",
          }),
        ]);

      const result = await tool.execute("call-2", {
        action: "today",
        org: "all",
      });

      const details = result.details as { events: CalendarEvent[] };
      expect(details.events).toHaveLength(3);
      // Should be sorted by start time
      expect(details.events[0].title).toBe("Standup");
      expect(details.events[2].title).toBe("Sprint Review");
    });

    it("deduplicates events across orgs", async () => {
      // Same meeting on both edubites and zenloop
      const event1 = makeCalendarEvent({
        id: "a",
        title: "Cross-Org Sync",
        org: "edubites",
        start: "2026-02-15T11:00:00Z",
        end: "2026-02-15T12:00:00Z",
      });
      const event2 = makeCalendarEvent({
        id: "b",
        title: "Cross-Org Sync",
        org: "zenloop",
        start: "2026-02-15T11:00:00Z",
        end: "2026-02-15T12:00:00Z",
      });
      fetchEventsMock
        .mockResolvedValueOnce([event1])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([event2]);

      const result = await tool.execute("call-3", {
        action: "today",
        org: "all",
      });

      const details = result.details as { events: unknown[] };
      expect(details.events).toHaveLength(1);
    });

    it("accepts a custom date parameter", async () => {
      fetchEventsMock.mockResolvedValue([]);

      await tool.execute("call-4", {
        action: "today",
        org: "edubites",
        date: "2026-02-20",
      });

      expect(fetchEventsMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ start: "2026-02-20", end: "2026-02-21" }),
      );
    });
  });

  describe("action: events", () => {
    it("returns events in a date range", async () => {
      const events = [
        makeCalendarEvent({ title: "Monday Meeting", start: "2026-02-16T09:00:00Z" }),
        makeCalendarEvent({ title: "Friday Review", start: "2026-02-20T14:00:00Z" }),
      ];
      fetchEventsMock.mockResolvedValue(events);

      const result = await tool.execute("call-5", {
        action: "events",
        org: "edubites",
        start: "2026-02-16",
        end: "2026-02-20",
      });

      const details = result.details as { events: CalendarEvent[] };
      expect(details.events).toHaveLength(2);
    });
  });

  describe("action: find_slots", () => {
    it("returns available time slots", async () => {
      fetchFreeBusyMock.mockResolvedValue([
        { start: "2026-02-16T09:00:00Z", end: "2026-02-16T10:00:00Z" },
      ]);

      const result = await tool.execute("call-6", {
        action: "find_slots",
        attendees: ["ali@edubites.com", "mark@edubites.com"],
        duration_minutes: 30,
        start_date: "2026-02-16",
        end_date: "2026-02-16",
        working_hours_only: false,
      });

      const details = result.details as { slots: unknown[] };
      expect(details.slots).toBeDefined();
      expect(details.slots.length).toBeGreaterThan(0);
    });

    it("returns empty slots with suggestion when no availability", async () => {
      // Everyone busy all day
      fetchFreeBusyMock.mockResolvedValue([
        { start: "2026-02-16T00:00:00Z", end: "2026-02-16T23:59:59Z" },
      ]);

      const result = await tool.execute("call-7", {
        action: "find_slots",
        attendees: ["person@example.com"],
        duration_minutes: 30,
        start_date: "2026-02-16",
        end_date: "2026-02-16",
        working_hours_only: false,
      });

      const details = result.details as { slots: unknown[]; suggestion?: string };
      expect(details.slots).toHaveLength(0);
      expect(details.suggestion).toBeDefined();
      expect(details.suggestion).toContain("widen");
    });

    it("filters by working hours when working_hours_only=true", async () => {
      fetchFreeBusyMock.mockResolvedValue([]);

      const result = await tool.execute("call-8", {
        action: "find_slots",
        attendees: ["ali@edubites.com"],
        duration_minutes: 30,
        start_date: "2026-02-16",
        end_date: "2026-02-16",
        working_hours_only: true,
      });

      const details = result.details as { slots: Array<{ start: string; end: string }> };
      // All slots should be within working hours (9am-6pm in attendee's timezone)
      for (const slot of details.slots) {
        const hour = new Date(slot.start).getUTCHours();
        // Europe/Berlin is UTC+1 in February, so 9am Berlin = 8am UTC
        expect(hour).toBeGreaterThanOrEqual(8);
        expect(hour).toBeLessThan(17);
      }
    });
  });

  describe("action: create", () => {
    it("creates an event and returns confirmation", async () => {
      createEventMock.mockResolvedValue({
        id: "new-evt-1",
        title: "New Meeting",
        start: "2026-02-16T10:00:00Z",
        end: "2026-02-16T11:00:00Z",
      });

      const result = await tool.execute("call-9", {
        action: "create",
        org: "edubites",
        title: "New Meeting",
        start: "2026-02-16T10:00:00Z",
        end: "2026-02-16T11:00:00Z",
        attendees: ["mark@edubites.com"],
      });

      const details = result.details as { event: { id: string } };
      expect(details.event.id).toBe("new-evt-1");
    });
  });

  describe("action: update", () => {
    it("updates an existing event", async () => {
      updateEventMock.mockResolvedValue({
        id: "evt-1",
        title: "Renamed Meeting",
        start: "2026-02-16T10:00:00Z",
        end: "2026-02-16T11:00:00Z",
      });

      const result = await tool.execute("call-10", {
        action: "update",
        org: "edubites",
        event_id: "evt-1",
        title: "Renamed Meeting",
      });

      const details = result.details as { event: { title: string } };
      expect(details.event.title).toBe("Renamed Meeting");
    });
  });

  describe("action: cancel", () => {
    it("cancels an event with notification", async () => {
      deleteEventMock.mockResolvedValue(undefined);

      const result = await tool.execute("call-11", {
        action: "cancel",
        org: "edubites",
        event_id: "evt-1",
        notify_attendees: true,
      });

      const details = result.details as { ok: boolean };
      expect(details.ok).toBe(true);
      expect(deleteEventMock).toHaveBeenCalledWith(
        expect.anything(),
        "evt-1",
        expect.objectContaining({ notifyAttendees: true }),
      );
    });

    it("cancels an event silently", async () => {
      deleteEventMock.mockResolvedValue(undefined);

      await tool.execute("call-12", {
        action: "cancel",
        org: "edubites",
        event_id: "evt-1",
        notify_attendees: false,
      });

      expect(deleteEventMock).toHaveBeenCalledWith(
        expect.anything(),
        "evt-1",
        expect.objectContaining({ notifyAttendees: false }),
      );
    });
  });

  describe("error handling", () => {
    it("throws ToolInputError when org is missing for today action", async () => {
      await expect(tool.execute("call-err-1", { action: "today" })).rejects.toThrow(
        /org required/i,
      );
    });

    it("throws error for unknown action", async () => {
      await expect(
        tool.execute("call-err-2", { action: "bogus", org: "edubites" }),
      ).rejects.toThrow(/unknown action/i);
    });

    it("throws ToolInputError when event_id is missing for update", async () => {
      await expect(
        tool.execute("call-err-3", { action: "update", org: "edubites", title: "New Title" }),
      ).rejects.toThrow(/event_id required/i);
    });

    it("throws ToolInputError when event_id is missing for cancel", async () => {
      await expect(
        tool.execute("call-err-4", { action: "cancel", org: "edubites" }),
      ).rejects.toThrow(/event_id required/i);
    });
  });
});
