const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

async function getAccessToken(creds: GmailCredentials): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail OAuth token refresh failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// --- List messages ---

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
};

type GmailMessageResource = {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string; size?: number };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; size?: number };
      parts?: Array<{
        mimeType: string;
        body?: { data?: string; size?: number };
      }>;
    }>;
  };
};

function getHeader(msg: GmailMessageResource, name: string): string {
  const header = msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractTextBody(msg: GmailMessageResource): string {
  // Try top-level body
  if (msg.payload.body?.data) {
    return decodeBase64Url(msg.payload.body.data);
  }

  // Search parts for text/plain or text/html
  const parts = msg.payload.parts ?? [];
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    // Check nested parts (multipart/alternative inside multipart/mixed)
    if (part.parts) {
      for (const sub of part.parts) {
        if (sub.mimeType === "text/plain" && sub.body?.data) {
          return decodeBase64Url(sub.body.data);
        }
      }
    }
  }

  // Fall back to html
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      for (const sub of part.parts) {
        if (sub.mimeType === "text/html" && sub.body?.data) {
          return decodeBase64Url(sub.body.data);
        }
      }
    }
  }

  return "";
}

export type ListMessagesParams = {
  maxResults?: number;
  query?: string;
  labelIds?: string[];
};

export type MessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
};

export async function listMessages(
  creds: GmailCredentials,
  params: ListMessagesParams,
): Promise<MessageSummary[]> {
  const token = await getAccessToken(creds);
  const url = new URL(`${GMAIL_API_BASE}/messages`);
  url.searchParams.set("maxResults", String(params.maxResults ?? 10));

  const queryParts: string[] = [];
  if (params.query) {
    queryParts.push(params.query);
  }
  if (params.labelIds?.length) {
    for (const label of params.labelIds) {
      url.searchParams.append("labelIds", label);
    }
  }
  if (queryParts.length > 0) {
    url.searchParams.set("q", queryParts.join(" "));
  }

  const listRes = await fetch(url.toString(), { headers: authHeaders(token) });
  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`Gmail list error: ${listRes.status} ${text}`);
  }
  const listData = (await listRes.json()) as GmailListResponse;
  const messageIds = listData.messages ?? [];

  if (messageIds.length === 0) {
    return [];
  }

  // Fetch metadata for each message (batch with format=metadata)
  const summaries: MessageSummary[] = [];
  for (const { id } of messageIds) {
    const msgUrl = `${GMAIL_API_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
    const msgRes = await fetch(msgUrl, { headers: authHeaders(token) });
    if (!msgRes.ok) {
      continue;
    }
    const msg = (await msgRes.json()) as GmailMessageResource;
    summaries.push({
      id: msg.id,
      threadId: msg.threadId,
      from: getHeader(msg, "From"),
      subject: getHeader(msg, "Subject"),
      snippet: msg.snippet,
      date: getHeader(msg, "Date") || new Date(Number(msg.internalDate)).toISOString(),
    });
  }

  return summaries;
}

// --- Get full message ---

export type FullMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  attachments: Array<{ filename: string; mimeType: string }>;
};

export async function getMessage(creds: GmailCredentials, messageId: string): Promise<FullMessage> {
  const token = await getAccessToken(creds);
  const url = `${GMAIL_API_BASE}/messages/${messageId}?format=full`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail get error: ${res.status} ${text}`);
  }
  const msg = (await res.json()) as GmailMessageResource;

  const attachments: Array<{ filename: string; mimeType: string }> = [];
  for (const part of msg.payload.parts ?? []) {
    if (
      part.body?.size &&
      part.body.size > 0 &&
      part.mimeType !== "text/plain" &&
      part.mimeType !== "text/html"
    ) {
      attachments.push({
        filename: (part as unknown as { filename?: string }).filename ?? "unnamed",
        mimeType: part.mimeType,
      });
    }
  }

  return {
    id: msg.id,
    from: getHeader(msg, "From"),
    to: getHeader(msg, "To"),
    subject: getHeader(msg, "Subject"),
    date: getHeader(msg, "Date") || new Date(Number(msg.internalDate)).toISOString(),
    body: extractTextBody(msg),
    attachments,
  };
}

// --- Send message ---

export type SendMessageParams = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  replyToMessageId?: string;
  fromEmail?: string;
};

function buildRawEmail(params: SendMessageParams): string {
  const lines: string[] = [];
  if (params.fromEmail) {
    lines.push(`From: ${params.fromEmail}`);
  }
  lines.push(`To: ${params.to}`);
  if (params.cc) {
    lines.push(`Cc: ${params.cc}`);
  }
  lines.push(`Subject: ${params.subject}`);
  lines.push("Content-Type: text/plain; charset=utf-8");
  if (params.replyToMessageId) {
    lines.push(`In-Reply-To: ${params.replyToMessageId}`);
    lines.push(`References: ${params.replyToMessageId}`);
  }
  lines.push("");
  lines.push(params.body);

  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

export async function sendMessage(
  creds: GmailCredentials,
  params: SendMessageParams,
): Promise<{ id: string; threadId: string }> {
  const token = await getAccessToken(creds);
  const url = `${GMAIL_API_BASE}/messages/send`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: buildRawEmail(params) }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail send error: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { id: string; threadId: string };
  return { id: data.id, threadId: data.threadId };
}
