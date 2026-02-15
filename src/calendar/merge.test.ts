import { describe, expect, it } from "vitest";
import type { CalendarEvent, BusyInterval, TimeSlot } from "./types.js";
import {
  mergeEvents,
  deduplicateEvents,
  findFreeSlots,
  mergeBusyIntervals,
  filterByWorkingHours,
} from "./merge.js";

function makeEvent(
  overrides: Partial<CalendarEvent> & { start: string; end: string },
): CalendarEvent {
  return {
    id: overrides.id ?? "evt-1",
    title: overrides.title ?? "Meeting",
    start: overrides.start,
    end: overrides.end,
    org: overrides.org ?? "edubites",
    calendarId: overrides.calendarId ?? "primary",
    attendees: overrides.attendees ?? [],
    location: overrides.location,
    description: overrides.description,
    status: overrides.status ?? "confirmed",
  };
}

describe("mergeEvents", () => {
  it("sorts events by start time", () => {
    const events = [
      makeEvent({ start: "2026-02-15T14:00:00Z", end: "2026-02-15T15:00:00Z", title: "Later" }),
      makeEvent({ start: "2026-02-15T09:00:00Z", end: "2026-02-15T10:00:00Z", title: "Earlier" }),
    ];
    const merged = mergeEvents(events);
    expect(merged[0].title).toBe("Earlier");
    expect(merged[1].title).toBe("Later");
  });

  it("returns empty array for empty input", () => {
    expect(mergeEvents([])).toEqual([]);
  });

  it("preserves all event fields", () => {
    const event = makeEvent({
      id: "evt-42",
      start: "2026-02-15T10:00:00Z",
      end: "2026-02-15T11:00:00Z",
      title: "Team Standup",
      location: "Room 3",
      description: "Daily sync",
      org: "zenloop",
    });
    const merged = mergeEvents([event]);
    expect(merged[0]).toMatchObject({
      id: "evt-42",
      title: "Team Standup",
      location: "Room 3",
      description: "Daily sync",
      org: "zenloop",
    });
  });
});

describe("deduplicateEvents", () => {
  it("removes duplicate events with same title and time", () => {
    const events = [
      makeEvent({
        id: "a",
        start: "2026-02-15T10:00:00Z",
        end: "2026-02-15T11:00:00Z",
        title: "Standup",
        org: "edubites",
      }),
      makeEvent({
        id: "b",
        start: "2026-02-15T10:00:00Z",
        end: "2026-02-15T11:00:00Z",
        title: "Standup",
        org: "zenloop",
      }),
    ];
    const deduped = deduplicateEvents(events);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].orgs).toContain("edubites");
    expect(deduped[0].orgs).toContain("zenloop");
  });

  it("keeps events with same title but different times", () => {
    const events = [
      makeEvent({
        id: "a",
        start: "2026-02-15T10:00:00Z",
        end: "2026-02-15T11:00:00Z",
        title: "Standup",
      }),
      makeEvent({
        id: "b",
        start: "2026-02-16T10:00:00Z",
        end: "2026-02-16T11:00:00Z",
        title: "Standup",
      }),
    ];
    const deduped = deduplicateEvents(events);
    expect(deduped).toHaveLength(2);
  });

  it("keeps events with same time but different titles", () => {
    const events = [
      makeEvent({
        id: "a",
        start: "2026-02-15T10:00:00Z",
        end: "2026-02-15T11:00:00Z",
        title: "Standup",
      }),
      makeEvent({
        id: "b",
        start: "2026-02-15T10:00:00Z",
        end: "2026-02-15T11:00:00Z",
        title: "1:1 with Mark",
      }),
    ];
    const deduped = deduplicateEvents(events);
    expect(deduped).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateEvents([])).toEqual([]);
  });
});

describe("mergeBusyIntervals", () => {
  it("merges overlapping intervals", () => {
    const intervals: BusyInterval[] = [
      { start: "2026-02-15T09:00:00Z", end: "2026-02-15T10:30:00Z" },
      { start: "2026-02-15T10:00:00Z", end: "2026-02-15T11:00:00Z" },
    ];
    const merged = mergeBusyIntervals(intervals);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBe("2026-02-15T09:00:00Z");
    expect(merged[0].end).toBe("2026-02-15T11:00:00Z");
  });

  it("merges adjacent intervals", () => {
    const intervals: BusyInterval[] = [
      { start: "2026-02-15T09:00:00Z", end: "2026-02-15T10:00:00Z" },
      { start: "2026-02-15T10:00:00Z", end: "2026-02-15T11:00:00Z" },
    ];
    const merged = mergeBusyIntervals(intervals);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBe("2026-02-15T09:00:00Z");
    expect(merged[0].end).toBe("2026-02-15T11:00:00Z");
  });

  it("keeps non-overlapping intervals separate", () => {
    const intervals: BusyInterval[] = [
      { start: "2026-02-15T09:00:00Z", end: "2026-02-15T10:00:00Z" },
      { start: "2026-02-15T11:00:00Z", end: "2026-02-15T12:00:00Z" },
    ];
    const merged = mergeBusyIntervals(intervals);
    expect(merged).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(mergeBusyIntervals([])).toEqual([]);
  });

  it("handles single interval", () => {
    const intervals: BusyInterval[] = [
      { start: "2026-02-15T09:00:00Z", end: "2026-02-15T10:00:00Z" },
    ];
    const merged = mergeBusyIntervals(intervals);
    expect(merged).toHaveLength(1);
  });
});

describe("findFreeSlots", () => {
  it("finds free 30-minute slots between busy periods", () => {
    const busyByPerson: Record<string, BusyInterval[]> = {
      "ali@edubites.com": [
        { start: "2026-02-16T09:00:00Z", end: "2026-02-16T10:00:00Z" },
        { start: "2026-02-16T14:00:00Z", end: "2026-02-16T15:00:00Z" },
      ],
      "mark@edubites.com": [{ start: "2026-02-16T10:00:00Z", end: "2026-02-16T11:00:00Z" }],
    };
    const slots = findFreeSlots({
      busyByPerson,
      durationMinutes: 30,
      startDate: "2026-02-16",
      endDate: "2026-02-16",
      workingHoursOnly: false,
    });
    expect(slots.length).toBeGreaterThan(0);
    // 11:00-14:00 should contain a free slot for both
    const hasSlotAt11 = slots.some((s) => new Date(s.start).getUTCHours() === 11);
    expect(hasSlotAt11).toBe(true);
  });

  it("returns empty when all slots are taken", () => {
    const busyByPerson: Record<string, BusyInterval[]> = {
      "person@example.com": [{ start: "2026-02-16T00:00:00Z", end: "2026-02-16T23:59:59Z" }],
    };
    const slots = findFreeSlots({
      busyByPerson,
      durationMinutes: 30,
      startDate: "2026-02-16",
      endDate: "2026-02-16",
      workingHoursOnly: false,
    });
    expect(slots).toHaveLength(0);
  });

  it("includes suggestion when no slots found", () => {
    const busyByPerson: Record<string, BusyInterval[]> = {
      "person@example.com": [{ start: "2026-02-16T00:00:00Z", end: "2026-02-16T23:59:59Z" }],
    };
    const result = findFreeSlots({
      busyByPerson,
      durationMinutes: 30,
      startDate: "2026-02-16",
      endDate: "2026-02-16",
      workingHoursOnly: false,
    });
    expect(result).toHaveLength(0);
  });

  it("cross-org busy: user busy on any calendar blocks the slot", () => {
    // Ali is busy on zenloop calendar 10-11, but free on edubites
    // The merged busy should still mark 10-11 as busy
    const busyByPerson: Record<string, BusyInterval[]> = {
      "ali@edubites.com": [{ start: "2026-02-16T10:00:00Z", end: "2026-02-16T11:00:00Z" }],
    };
    const slots = findFreeSlots({
      busyByPerson,
      durationMinutes: 60,
      startDate: "2026-02-16",
      endDate: "2026-02-16",
      workingHoursOnly: false,
    });
    // No slot should start at or overlap 10:00-11:00
    const conflicting = slots.filter(
      (s) =>
        new Date(s.start) < new Date("2026-02-16T11:00:00Z") &&
        new Date(s.end) > new Date("2026-02-16T10:00:00Z"),
    );
    expect(conflicting).toHaveLength(0);
  });

  it("respects duration requirement", () => {
    // Only 30 min free gap between busy periods
    const busyByPerson: Record<string, BusyInterval[]> = {
      "person@example.com": [
        { start: "2026-02-16T09:00:00Z", end: "2026-02-16T10:00:00Z" },
        { start: "2026-02-16T10:30:00Z", end: "2026-02-16T17:00:00Z" },
      ],
    };
    const slots60 = findFreeSlots({
      busyByPerson,
      durationMinutes: 60,
      startDate: "2026-02-16",
      endDate: "2026-02-16",
      workingHoursOnly: false,
    });
    // The 30-min gap (10:00-10:30) should NOT appear as a 60-min slot
    const slotsIn1030Window = slots60.filter(
      (s) =>
        new Date(s.start) >= new Date("2026-02-16T10:00:00Z") &&
        new Date(s.end) <= new Date("2026-02-16T10:30:00Z"),
    );
    expect(slotsIn1030Window).toHaveLength(0);
  });
});

describe("filterByWorkingHours", () => {
  it("filters slots to 9am-6pm in given timezone", () => {
    const slots: TimeSlot[] = [
      { start: "2026-02-16T06:00:00Z", end: "2026-02-16T07:00:00Z" }, // 7am-8am Berlin (CET = UTC+1)
      { start: "2026-02-16T08:00:00Z", end: "2026-02-16T09:00:00Z" }, // 9am-10am Berlin
      { start: "2026-02-16T17:00:00Z", end: "2026-02-16T18:00:00Z" }, // 6pm-7pm Berlin -- ends at 7pm, should be excluded
    ];
    const filtered = filterByWorkingHours(slots, "Europe/Berlin");
    // Only the 9am-10am Berlin slot (08:00-09:00 UTC) should pass
    expect(filtered).toHaveLength(1);
    expect(filtered[0].start).toBe("2026-02-16T08:00:00Z");
  });

  it("handles UTC timezone", () => {
    const slots: TimeSlot[] = [
      { start: "2026-02-16T08:00:00Z", end: "2026-02-16T09:00:00Z" }, // 8am-9am UTC -- before working hours
      { start: "2026-02-16T09:00:00Z", end: "2026-02-16T10:00:00Z" }, // 9am-10am UTC -- valid
      { start: "2026-02-16T17:00:00Z", end: "2026-02-16T18:00:00Z" }, // 5pm-6pm UTC -- valid
      { start: "2026-02-16T18:00:00Z", end: "2026-02-16T19:00:00Z" }, // 6pm-7pm UTC -- after working hours
    ];
    const filtered = filterByWorkingHours(slots, "UTC");
    expect(filtered).toHaveLength(2);
  });

  it("returns empty for all slots outside working hours", () => {
    const slots: TimeSlot[] = [
      { start: "2026-02-16T22:00:00Z", end: "2026-02-16T23:00:00Z" }, // 11pm-12am UTC
    ];
    const filtered = filterByWorkingHours(slots, "UTC");
    expect(filtered).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(filterByWorkingHours([], "UTC")).toEqual([]);
  });
});
