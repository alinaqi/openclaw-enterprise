import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarAccountConfig } from "./types.js";
import { fetchEvents, fetchFreeBusy, createEvent, updateEvent, deleteEvent } from "./client.js";

const fetchMock = vi.fn();

const testAccount: CalendarAccountConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  refreshToken: "test-refresh-token",
  calendarId: "primary",
  timezone: "Europe/Berlin",
};

function mockTokenResponse() {
  return {
    ok: true,
    json: async () => ({ access_token: "mock-access-token" }),
  };
}

describe("fetchEvents", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-expect-error mock fetch
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches events for a date range", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse()).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "evt-1",
            summary: "Team Standup",
            start: { dateTime: "2026-02-16T09:00:00+01:00" },
            end: { dateTime: "2026-02-16T09:30:00+01:00" },
            attendees: [{ email: "ali@edubites.com" }],
            status: "confirmed",
          },
        ],
      }),
    });

    const events = await fetchEvents(testAccount, {
      start: "2026-02-16",
      end: "2026-02-17",
    });

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Team Standup");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when no events", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse()).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const events = await fetchEvents(testAccount, {
      start: "2026-02-16",
      end: "2026-02-17",
    });

    expect(events).toHaveLength(0);
  });

  it("throws on API error", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse()).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid credentials",
    });

    await expect(
      fetchEvents(testAccount, { start: "2026-02-16", end: "2026-02-17" }),
    ).rejects.toThrow();
  });
});

describe("fetchFreeBusy", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-expect-error mock fetch
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns busy intervals for a calendar", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse()).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calendars: {
          primary: {
            busy: [
              { start: "2026-02-16T09:00:00Z", end: "2026-02-16T10:00:00Z" },
              { start: "2026-02-16T14:00:00Z", end: "2026-02-16T15:00:00Z" },
            ],
          },
        },
      }),
    });

    const busy = await fetchFreeBusy(testAccount, {
      start: "2026-02-16T00:00:00Z",
      end: "2026-02-17T00:00:00Z",
    });

    expect(busy).toHaveLength(2);
    expect(busy[0].start).toBe("2026-02-16T09:00:00Z");
    expect(busy[1].start).toBe("2026-02-16T14:00:00Z");
  });

  it("returns empty array when calendar is free", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse()).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calendars: {
          primary: { busy: [] },
        },
      }),
    });

    const busy = await fetchFreeBusy(testAccount, {
      start: "2026-02-16T00:00:00Z",
      end: "2026-02-17T00:00:00Z",
    });

    expect(busy).toHaveLength(0);
  });
});

describe("createEvent", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-expect-error mock fetch
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an event and returns event ID", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse()).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "new-evt-1",
        summary: "New Meeting",
        start: { dateTime: "2026-02-16T10:00:00Z" },
        end: { dateTime: "2026-02-16T11:00:00Z" },
        htmlLink: "https://calendar.google.com/event/new-evt-1",
      }),
    });

    const result = await createEvent(testAccount, {
      title: "New Meeting",
      start: "2026-02-16T10:00:00Z",
      end: "2026-02-16T11:00:00Z",
      attendees: ["mark@edubites.com"],
    });

    expect(result.id).toBe("new-evt-1");
    expect(result.title).toBe("New Meeting");
  });

  it("includes attendees in the request", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse()).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "new-evt-2",
        summary: "With Attendees",
        start: { dateTime: "2026-02-16T10:00:00Z" },
        end: { dateTime: "2026-02-16T11:00:00Z" },
      }),
    });

    await createEvent(testAccount, {
      title: "With Attendees",
      start: "2026-02-16T10:00:00Z",
      end: "2026-02-16T11:00:00Z",
      attendees: ["mark@edubites.com", "verena@zenloop.com"],
    });

    // calls[0] is OAuth token, calls[1] is the actual API call
    const [, init] = fetchMock.mock.calls[1];
    const body = JSON.parse(init.body);
    expect(body.attendees).toEqual([
      { email: "mark@edubites.com" },
      { email: "verena@zenloop.com" },
    ]);
  });
});

describe("updateEvent", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-expect-error mock fetch
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates event title", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse()).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "evt-1",
        summary: "Updated Title",
        start: { dateTime: "2026-02-16T10:00:00Z" },
        end: { dateTime: "2026-02-16T11:00:00Z" },
      }),
    });

    const result = await updateEvent(testAccount, "evt-1", {
      title: "Updated Title",
    });

    expect(result.title).toBe("Updated Title");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("deleteEvent", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-expect-error mock fetch
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes an event with attendee notification", async () => {
    fetchMock
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce({ ok: true, status: 204 });

    await deleteEvent(testAccount, "evt-1", { notifyAttendees: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // calls[1] is the DELETE call
    const [url] = fetchMock.mock.calls[1];
    expect(url).toContain("sendUpdates=all");
  });

  it("deletes an event without attendee notification", async () => {
    fetchMock
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce({ ok: true, status: 204 });

    await deleteEvent(testAccount, "evt-1", { notifyAttendees: false });

    // calls[1] is the DELETE call
    const [url] = fetchMock.mock.calls[1];
    expect(url).toContain("sendUpdates=none");
  });
});
