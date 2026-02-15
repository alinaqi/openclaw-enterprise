import type { BusyInterval, CalendarAccountConfig, CalendarEvent } from "./types.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

async function getAccessToken(account: CalendarAccountConfig): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: account.clientId,
      client_secret: account.clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token refresh failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

function parseGoogleEvent(raw: Record<string, unknown>): {
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
  description?: string;
  status: string;
} {
  const startObj = raw.start as { dateTime?: string; date?: string } | undefined;
  const endObj = raw.end as { dateTime?: string; date?: string } | undefined;
  const attendeesRaw = Array.isArray(raw.attendees) ? raw.attendees : [];

  return {
    title: typeof raw.summary === "string" ? raw.summary : "",
    start: startObj?.dateTime ?? startObj?.date ?? "",
    end: endObj?.dateTime ?? endObj?.date ?? "",
    attendees: attendeesRaw
      .filter((a): a is { email: string } => typeof (a as { email?: unknown }).email === "string")
      .map((a) => a.email),
    location: typeof raw.location === "string" ? raw.location : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    status: typeof raw.status === "string" ? raw.status : "confirmed",
  };
}

export async function fetchEvents(
  account: CalendarAccountConfig,
  params: { start: string; end: string },
): Promise<CalendarEvent[]> {
  const token = await getAccessToken(account);
  const calendarId = encodeURIComponent(account.calendarId);
  const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events`);
  url.searchParams.set("timeMin", toRfc3339(params.start));
  url.searchParams.set("timeMax", toRfc3339(params.end));
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Calendar API error: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { items?: Array<Record<string, unknown>> };
  const items = data.items ?? [];

  return items.map((item) => {
    const parsed = parseGoogleEvent(item);
    return {
      id: typeof item.id === "string" ? item.id : "",
      calendarId: account.calendarId,
      org: "",
      ...parsed,
    };
  });
}

export async function fetchFreeBusy(
  account: CalendarAccountConfig,
  params: { start: string; end: string },
): Promise<BusyInterval[]> {
  const token = await getAccessToken(account);
  const url = `${GOOGLE_CALENDAR_BASE}/freeBusy`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: params.start,
      timeMax: params.end,
      items: [{ id: account.calendarId }],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FreeBusy API error: ${response.status} ${text}`);
  }
  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  const calendarData = data.calendars?.[account.calendarId];
  return (calendarData?.busy ?? []).map((b) => ({
    start: b.start,
    end: b.end,
  }));
}

type CreateEventParams = {
  title: string;
  start: string;
  end: string;
  attendees?: string[];
  description?: string;
  location?: string;
};

export async function createEvent(
  account: CalendarAccountConfig,
  params: CreateEventParams,
): Promise<CalendarEvent> {
  const token = await getAccessToken(account);
  const calendarId = encodeURIComponent(account.calendarId);
  const url = `${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events?sendUpdates=all`;

  const body: Record<string, unknown> = {
    summary: params.title,
    start: { dateTime: params.start },
    end: { dateTime: params.end },
  };
  if (params.attendees?.length) {
    body.attendees = params.attendees.map((email) => ({ email }));
  }
  if (params.description) {
    body.description = params.description;
  }
  if (params.location) {
    body.location = params.location;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Create event failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const parsed = parseGoogleEvent(data);
  return {
    id: typeof data.id === "string" ? data.id : "",
    calendarId: account.calendarId,
    org: "",
    ...parsed,
  };
}

type UpdateEventParams = {
  title?: string;
  start?: string;
  end?: string;
  attendees?: string[];
  description?: string;
  location?: string;
};

export async function updateEvent(
  account: CalendarAccountConfig,
  eventId: string,
  params: UpdateEventParams,
): Promise<CalendarEvent> {
  const token = await getAccessToken(account);
  const calendarId = encodeURIComponent(account.calendarId);
  const url = `${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;

  const body: Record<string, unknown> = {};
  if (params.title !== undefined) {
    body.summary = params.title;
  }
  if (params.start !== undefined) {
    body.start = { dateTime: params.start };
  }
  if (params.end !== undefined) {
    body.end = { dateTime: params.end };
  }
  if (params.attendees !== undefined) {
    body.attendees = params.attendees.map((email) => ({ email }));
  }
  if (params.description !== undefined) {
    body.description = params.description;
  }
  if (params.location !== undefined) {
    body.location = params.location;
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Update event failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const parsed = parseGoogleEvent(data);
  return {
    id: typeof data.id === "string" ? data.id : "",
    calendarId: account.calendarId,
    org: "",
    ...parsed,
  };
}

export async function deleteEvent(
  account: CalendarAccountConfig,
  eventId: string,
  options: { notifyAttendees: boolean },
): Promise<void> {
  const token = await getAccessToken(account);
  const calendarId = encodeURIComponent(account.calendarId);
  const sendUpdates = options.notifyAttendees ? "all" : "none";
  const url = `${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Delete event failed: ${response.status} ${text}`);
  }
}

function toRfc3339(date: string): string {
  if (date.includes("T")) {
    return date;
  }
  return `${date}T00:00:00Z`;
}
