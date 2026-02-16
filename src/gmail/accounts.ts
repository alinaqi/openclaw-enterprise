import type { OpenClawConfig } from "../config/config.js";
import type { GmailAccountConfig, GmailActionConfig } from "./types.js";
import { resolveGmailRefreshToken } from "./token.js";

const DEFAULT_ACCOUNT_ID = "default";

const KNOWN_GMAIL_ORGS: Record<string, { email: string }> = {
  protaige: { email: "ali@protaige.com" },
  edubites: { email: "ali.shaheen@edubites.com" },
  zenloop: { email: "ali.shaheen@zenloop.com" },
};

export type ResolvedGmailAccount = {
  accountId: string;
  enabled: boolean;
  refreshToken?: string;
  config: GmailAccountConfig;
  actions?: GmailActionConfig;
};

function getGmailConfig(cfg: OpenClawConfig) {
  return (cfg.channels as Record<string, unknown> | undefined)?.gmail as
    | (GmailAccountConfig & { accounts?: Record<string, GmailAccountConfig> })
    | undefined;
}

function resolveGmailAccountFromEnv(
  org: string,
): { refreshToken: string; clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env[`GOOGLE_REFRESH_TOKEN_${org.toUpperCase()}`]?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return { clientId, clientSecret, refreshToken };
}

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const gmail = getGmailConfig(cfg);
  const accounts = gmail?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

function listEnvAccountIds(): string[] {
  return Object.keys(KNOWN_GMAIL_ORGS).filter((org) => {
    const token = process.env[`GOOGLE_REFRESH_TOKEN_${org.toUpperCase()}`]?.trim();
    return !!token;
  });
}

export function listGmailAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length > 0) {
    return ids.toSorted((a, b) => a.localeCompare(b));
  }
  // Fall back to env var discovery
  const envIds = listEnvAccountIds();
  if (envIds.length > 0) {
    return envIds.toSorted((a, b) => a.localeCompare(b));
  }
  return [DEFAULT_ACCOUNT_ID];
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): GmailAccountConfig | undefined {
  const gmail = getGmailConfig(cfg);
  const accounts = gmail?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId];
}

function mergeGmailAccountConfig(cfg: OpenClawConfig, accountId: string): GmailAccountConfig {
  const gmail = getGmailConfig(cfg);
  const { accounts: _ignored, ...base } = (gmail ?? {}) as GmailAccountConfig & {
    accounts?: unknown;
  };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveGmailAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedGmailAccount {
  const accountId = params.accountId?.trim() || DEFAULT_ACCOUNT_ID;
  const gmail = getGmailConfig(params.cfg);
  const baseEnabled = gmail?.enabled !== false;
  const merged = mergeGmailAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  // Try config token first
  const configToken = resolveGmailRefreshToken(merged.refreshToken);

  // Fall back to env vars: default account uses GMAIL_REFRESH_TOKEN,
  // named accounts use GOOGLE_REFRESH_TOKEN_<ORG>
  let envToken: string | undefined;
  if (accountId === DEFAULT_ACCOUNT_ID) {
    envToken = resolveGmailRefreshToken(process.env.GMAIL_REFRESH_TOKEN);
  } else {
    const fromEnv = resolveGmailAccountFromEnv(accountId);
    envToken = fromEnv?.refreshToken;
  }

  const refreshToken = configToken ?? envToken;

  return {
    accountId,
    enabled,
    refreshToken,
    config: merged,
    actions: merged.actions,
  };
}

export function listEnabledGmailAccounts(cfg: OpenClawConfig): ResolvedGmailAccount[] {
  return listGmailAccountIds(cfg)
    .map((accountId) => resolveGmailAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
