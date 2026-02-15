export type CalendarAccountConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
  timezone: string;
};

export type CalendarAccount = CalendarAccountConfig & {
  org: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  org: string;
  calendarId: string;
  attendees: string[];
  location?: string;
  description?: string;
  status: string;
};

export type DeduplicatedEvent = CalendarEvent & {
  orgs: string[];
};

export type BusyInterval = {
  start: string;
  end: string;
};

export type TimeSlot = {
  start: string;
  end: string;
};
