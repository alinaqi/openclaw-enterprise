import type { CalendarAccount, CalendarAccountConfig } from "./types.js";

export type GoogleConfig = {
  google?: {
    accounts?: Record<string, CalendarAccountConfig>;
  };
};

export function resolveCalendarAccount(
  cfg: GoogleConfig,
  org: string,
): CalendarAccountConfig | null {
  const accounts = cfg.google?.accounts;
  if (!accounts) {
    return null;
  }
  return accounts[org] ?? null;
}

export function resolveAllCalendarAccounts(cfg: GoogleConfig): CalendarAccount[] {
  const accounts = cfg.google?.accounts;
  if (!accounts) {
    return [];
  }
  return Object.entries(accounts).map(([org, account]) => ({
    org,
    ...account,
  }));
}
