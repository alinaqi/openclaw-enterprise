import type { GmailCredentials } from "./client.js";
import type { GmailMessageSummary, GmailFullMessage, GmailTriageResult } from "./types.js";
import { listMessages, getMessage, sendMessage } from "./client.js";

const KNOWN_GMAIL_ORGS: Record<string, { email: string }> = {
  protaige: { email: "ali@protaige.com" },
  edubites: { email: "ali.shaheen@edubites.com" },
  zenloop: { email: "ali.shaheen@zenloop.com" },
};

function normalizeAccountId(accountId: string): string {
  // If it's already an org name, return as-is
  if (KNOWN_GMAIL_ORGS[accountId]) {
    return accountId;
  }
  // Reverse lookup: email → org name
  for (const [org, info] of Object.entries(KNOWN_GMAIL_ORGS)) {
    if (info.email === accountId) {
      return org;
    }
  }
  // Return original (will fail gracefully in resolveCredentials)
  return accountId;
}

function resolveCredentials(accountId: string): GmailCredentials | null {
  const orgId = normalizeAccountId(accountId);
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env[`GOOGLE_REFRESH_TOKEN_${orgId.toUpperCase()}`]?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return { clientId, clientSecret, refreshToken };
}

function resolveEmail(accountId: string): string | undefined {
  const orgId = normalizeAccountId(accountId);
  return KNOWN_GMAIL_ORGS[orgId]?.email;
}

export type ListOptions = {
  maxResults?: number;
  unreadOnly?: boolean;
  label?: string;
};

export type SendOptions = {
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
  cc?: string;
};

export type DraftOptions = {
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
};

export async function listGmailMessages(
  accountId: string,
  options: ListOptions,
): Promise<GmailMessageSummary[]> {
  const creds = resolveCredentials(accountId);
  if (!creds) {
    throw new Error(`No Gmail credentials for account: ${accountId}`);
  }

  const queryParts: string[] = [];
  if (options.unreadOnly) {
    queryParts.push("is:unread");
  }
  if (options.label) {
    queryParts.push(`label:${options.label}`);
  }

  const results = await listMessages(creds, {
    maxResults: options.maxResults ?? 10,
    query: queryParts.length > 0 ? queryParts.join(" ") : undefined,
  });

  return results.map((msg) => ({
    id: msg.id,
    from: msg.from,
    subject: msg.subject,
    snippet: msg.snippet,
    date: msg.date,
    threadId: msg.threadId,
  }));
}

export async function getGmailMessage(
  accountId: string,
  messageId: string,
): Promise<GmailFullMessage> {
  const creds = resolveCredentials(accountId);
  if (!creds) {
    throw new Error(`No Gmail credentials for account: ${accountId}`);
  }

  const msg = await getMessage(creds, messageId);

  return {
    id: msg.id,
    from: msg.from,
    subject: msg.subject,
    body: msg.body,
    attachments: msg.attachments,
  };
}

export async function searchGmailMessages(
  accountId: string,
  query: string,
): Promise<GmailMessageSummary[]> {
  const creds = resolveCredentials(accountId);
  if (!creds) {
    throw new Error(`No Gmail credentials for account: ${accountId}`);
  }

  const results = await listMessages(creds, {
    maxResults: 20,
    query,
  });

  return results.map((msg) => ({
    id: msg.id,
    from: msg.from,
    subject: msg.subject,
    snippet: msg.snippet,
    date: msg.date,
    threadId: msg.threadId,
  }));
}

export async function sendGmailMessage(
  accountId: string,
  options: SendOptions,
): Promise<{ id: string }> {
  const creds = resolveCredentials(accountId);
  if (!creds) {
    throw new Error(`No Gmail credentials for account: ${accountId}`);
  }

  const fromEmail = resolveEmail(accountId);
  const result = await sendMessage(creds, {
    to: options.to,
    subject: options.subject,
    body: options.body,
    cc: options.cc,
    replyToMessageId: options.replyToMessageId,
    fromEmail,
  });

  return { id: result.id };
}

export async function createGmailDraft(
  accountId: string,
  options: DraftOptions,
): Promise<{ id: string }> {
  // TODO: implement with Gmail API drafts endpoint
  void accountId;
  void options;
  throw new Error("Not implemented");
}

export async function triageGmailMessages(accountId: string): Promise<GmailTriageResult> {
  // TODO: implement with rule-based classification
  void accountId;
  return {
    urgent: [],
    needs_reply: [],
    informational: [],
    can_archive: [],
  };
}
