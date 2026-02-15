import type { BusyInterval, CalendarEvent, DeduplicatedEvent, TimeSlot } from "./types.js";

export function mergeEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.toSorted((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function deduplicateEvents(events: CalendarEvent[]): DeduplicatedEvent[] {
  if (events.length === 0) {
    return [];
  }
  const map = new Map<string, DeduplicatedEvent>();
  for (const event of events) {
    const key = `${event.title}|${event.start}|${event.end}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.orgs.includes(event.org)) {
        existing.orgs.push(event.org);
      }
    } else {
      map.set(key, { ...event, orgs: [event.org] });
    }
  }
  return Array.from(map.values());
}

export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = intervals.toSorted(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const result: BusyInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];
    if (new Date(current.start).getTime() <= new Date(last.end).getTime()) {
      last.end = new Date(current.end) > new Date(last.end) ? current.end : last.end;
    } else {
      result.push({ ...current });
    }
  }
  return result;
}

type FindFreeSlotsParams = {
  busyByPerson: Record<string, BusyInterval[]>;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  workingHoursOnly: boolean;
};

export function findFreeSlots(params: FindFreeSlotsParams): TimeSlot[] {
  const { busyByPerson, durationMinutes, startDate, endDate } = params;
  const dayStartMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const dayEndMs = new Date(`${endDate}T23:59:59Z`).getTime();
  const durationMs = durationMinutes * 60_000;

  // Merge all persons' busy intervals into a single timeline
  const allBusy: BusyInterval[] = [];
  for (const intervals of Object.values(busyByPerson)) {
    allBusy.push(...intervals);
  }
  const merged = mergeBusyIntervals(allBusy);

  // Find gaps between busy intervals
  const slots: TimeSlot[] = [];
  let cursor = dayStartMs;

  for (const interval of merged) {
    const busyStart = new Date(interval.start).getTime();
    const busyEnd = new Date(interval.end).getTime();
    if (busyStart > cursor) {
      addSlotsInWindow(cursor, busyStart, durationMs, slots);
    }
    cursor = Math.max(cursor, busyEnd);
  }

  // After the last busy interval to end of day
  if (cursor < dayEndMs) {
    addSlotsInWindow(cursor, dayEndMs, durationMs, slots);
  }

  return slots;
}

function addSlotsInWindow(
  windowStart: number,
  windowEnd: number,
  durationMs: number,
  slots: TimeSlot[],
): void {
  const slotStep = 30 * 60_000; // 30-minute increments
  let slotStart = windowStart;
  while (slotStart + durationMs <= windowEnd) {
    slots.push({
      start: new Date(slotStart).toISOString(),
      end: new Date(slotStart + durationMs).toISOString(),
    });
    slotStart += slotStep;
  }
}

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

export function filterByWorkingHours(slots: TimeSlot[], timezone: string): TimeSlot[] {
  return slots.filter((slot) => {
    const startHour = getHourInTimezone(slot.start, timezone);
    const endHour = getHourInTimezone(slot.end, timezone);
    return startHour >= WORK_START_HOUR && startHour < WORK_END_HOUR && endHour <= WORK_END_HOUR;
  });
}

function getHourInTimezone(isoDate: string, timezone: string): number {
  const date = new Date(isoDate);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return Number(hourPart?.value ?? 0);
}
