import type { CalendarAccount, CalendarAccountConfig } from "./types.js";

const KNOWN_ORGS: Record<string, { calendarId: string; timezone: string }> = {
  protaige: { calendarId: "ali@protaige.com", timezone: "Asia/Dubai" },
  edubites: { calendarId: "ali.shaheen@edubites.com", timezone: "Asia/Dubai" },
  zenloop: { calendarId: "ali.shaheen@zenloop.com", timezone: "Europe/Berlin" },
};

function resolveAccountFromEnv(org: string): CalendarAccountConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env[`GOOGLE_REFRESH_TOKEN_${org.toUpperCase()}`]?.trim();
  const orgInfo = KNOWN_ORGS[org];

  if (!clientId || !clientSecret || !refreshToken || !orgInfo) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId: orgInfo.calendarId,
    timezone: orgInfo.timezone,
  };
}

export type GoogleConfig = {
  google?: {
    accounts?: Record<string, CalendarAccountConfig>;
  };
};

export function resolveCalendarAccount(
  cfg: GoogleConfig,
  org: string,
): CalendarAccountConfig | null {
  // Try config first, then env vars
  const fromConfig = cfg.google?.accounts?.[org] ?? null;
  if (fromConfig) {
    return fromConfig;
  }
  return resolveAccountFromEnv(org);
}

export function resolveAllCalendarAccounts(cfg: GoogleConfig): CalendarAccount[] {
  const configAccounts = cfg.google?.accounts;
  if (configAccounts && Object.keys(configAccounts).length > 0) {
    return Object.entries(configAccounts).map(([org, account]) => ({
      org,
      ...account,
    }));
  }

  // Fall back to env vars for known orgs
  const accounts: CalendarAccount[] = [];
  for (const org of Object.keys(KNOWN_ORGS)) {
    const account = resolveAccountFromEnv(org);
    if (account) {
      accounts.push({ org, ...account });
    }
  }
  return accounts;
}
