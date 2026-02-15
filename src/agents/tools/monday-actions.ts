import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { ToolInputError, jsonResult, readStringParam } from "./common.js";

const MONDAY_API = "https://api.monday.com/v2";

function resolveToken(): string | undefined {
  const token = process.env.MONDAY_API_TOKEN?.trim();
  return token || undefined;
}

function mondayHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: token,
  };
}

async function mondayQuery(query: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: mondayHeaders(token),
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Monday.com API error (${res.status})`);
  }
  return (await res.json()) as Record<string, unknown>;
}

type MondayBoard = {
  id: string;
  name: string;
  items_count: number;
};

type MondayColumnValue = {
  id: string;
  title?: string;
  text: string;
  type: string;
};

type MondayItem = {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
  updates?: Array<{ id: string }>;
};

type MondayUpdate = {
  id: string;
  body: string;
  creator: { name: string };
  created_at: string;
  item_id?: string;
};

function extractStatus(columns: MondayColumnValue[]): string {
  const col = columns.find((c) => c.type === "status");
  return col?.text ?? "";
}

function extractAssignee(columns: MondayColumnValue[]): string {
  const col = columns.find((c) => c.type === "people");
  return col?.text ?? "";
}

function extractDueDate(columns: MondayColumnValue[]): string {
  const col = columns.find((c) => c.type === "date");
  return col?.text ?? "";
}

function mapItem(item: MondayItem) {
  return {
    id: item.id,
    name: item.name,
    status: extractStatus(item.column_values),
    assignee: extractAssignee(item.column_values),
    dueDate: extractDueDate(item.column_values),
    updatesCount: item.updates?.length ?? 0,
  };
}

async function handleBoards(token: string): Promise<AgentToolResult<unknown>> {
  const query = "{ boards { id name items_count } }";
  const data = await mondayQuery(query, token);
  const root = data.data as { boards: MondayBoard[] };
  const boards = (root.boards ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.items_count,
  }));
  return jsonResult({ boards });
}

async function handleItems(
  params: Record<string, unknown>,
  token: string,
): Promise<AgentToolResult<unknown>> {
  const board = readStringParam(params, "board");
  const status = readStringParam(params, "status");
  const assignee = readStringParam(params, "assignee");

  const boardFilter = board && /^\d+$/.test(board) ? `(ids: [${board}])` : "";
  const query = `{ boards${boardFilter} { items_page (limit: 100) { items { id name column_values { id title text type } updates { id } } } } }`;
  const data = await mondayQuery(query, token);
  const root = data.data as {
    boards: Array<{ items_page: { items: MondayItem[] } }>;
  };
  const rawItems = root.boards?.flatMap((b) => b.items_page?.items ?? []) ?? [];
  let items = rawItems.map(mapItem);

  if (status) {
    items = items.filter((i) => i.status === status);
  }
  if (assignee) {
    items = items.filter((i) => i.assignee === assignee);
  }

  return jsonResult({ items });
}

async function handleItemDetail(
  params: Record<string, unknown>,
  token: string,
): Promise<AgentToolResult<unknown>> {
  const itemId = readStringParam(params, "item_id", { required: true });
  if (!/^\d+$/.test(itemId)) {
    throw new ToolInputError("item_id must be a numeric string");
  }
  const query = `{ items (ids: [${itemId}]) { id name column_values { id title text type } updates { id body creator { name } created_at } } }`;
  const data = await mondayQuery(query, token);
  const root = data.data as {
    items: Array<{
      id: string;
      name: string;
      column_values: MondayColumnValue[];
      updates: MondayUpdate[];
    }>;
  };
  const item = root.items?.[0];
  if (!item) {
    return jsonResult({
      error: "not_found",
      message: `Item ${itemId} not found`,
    });
  }

  const columns = item.column_values.map((c) => ({
    id: c.id,
    title: c.title,
    value: c.text,
    type: c.type,
  }));

  const updates = (item.updates ?? []).map((u) => ({
    id: u.id,
    body: u.body,
    creator: u.creator?.name,
    createdAt: u.created_at,
  }));

  return jsonResult({
    id: item.id,
    name: item.name,
    columns,
    updates,
  });
}

async function handleUpdates(
  params: Record<string, unknown>,
  token: string,
): Promise<AgentToolResult<unknown>> {
  const board = readStringParam(params, "board");
  const since = readStringParam(params, "since");

  const boardFilter = board && /^\d+$/.test(board) ? `(ids: [${board}])` : "";
  const query = `{ boards${boardFilter} { updates (limit: 100) { id body creator { name } created_at item_id } } }`;
  const data = await mondayQuery(query, token);
  const root = data.data as {
    boards: Array<{ updates: MondayUpdate[] }>;
  };
  const rawUpdates = root.boards?.flatMap((b) => b.updates ?? []) ?? [];

  let updates = rawUpdates.map((u) => ({
    id: u.id,
    body: u.body,
    creator: u.creator?.name,
    createdAt: u.created_at,
    itemId: u.item_id,
  }));

  if (since) {
    const sinceMs = new Date(since).getTime();
    updates = updates.filter((u) => new Date(u.createdAt).getTime() >= sinceMs);
  }

  return jsonResult({ updates });
}

export async function handleMondayAction(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const action = readStringParam(params, "action", { required: true });
  const token = resolveToken();

  if (!token) {
    return jsonResult({
      error: "missing_monday_token",
      message: "Monday.com tools require a MONDAY_API_TOKEN environment variable.",
    });
  }

  switch (action) {
    case "boards":
      return await handleBoards(token);
    case "items":
      return await handleItems(params, token);
    case "item_detail":
      return await handleItemDetail(params, token);
    case "updates":
      return await handleUpdates(params, token);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
