import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolInputError } from "./common.js";

// Mock fetch globally
const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

// Import the module under test (does not exist yet -- RED phase)
import { handleMondayAction } from "./monday-actions.js";

describe("handleMondayAction", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.MONDAY_API_TOKEN = "test_monday_token_123";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.MONDAY_API_TOKEN;
  });

  // ── Test 15: Monday boards ──
  describe("action: boards", () => {
    it("returns all boards with item counts", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              { id: "1001", name: "Sprint Board", items_count: 25 },
              { id: "1002", name: "Backlog", items_count: 42 },
            ],
          },
        }),
      });

      const result = await handleMondayAction({ action: "boards" });

      const details = result.details as { boards: Array<Record<string, unknown>> };
      expect(details.boards).toHaveLength(2);
      expect(details.boards[0]).toMatchObject({
        id: "1001",
        name: "Sprint Board",
        itemCount: 25,
      });
    });
  });

  // ── Tests 16, 17, 18: Monday items ──
  describe("action: items", () => {
    const mockItemsResponse = () => ({
      ok: true,
      json: async () => ({
        data: {
          boards: [
            {
              items_page: {
                items: [
                  {
                    id: "2001",
                    name: "Design review",
                    column_values: [
                      { id: "status", text: "Review", type: "status" },
                      { id: "person", text: "leo", type: "people" },
                      { id: "date", text: "2026-02-20", type: "date" },
                    ],
                    updates: [{ id: "u1" }, { id: "u2" }],
                  },
                  {
                    id: "2002",
                    name: "Backend task",
                    column_values: [
                      { id: "status", text: "In Progress", type: "status" },
                      { id: "person", text: "jonas", type: "people" },
                      { id: "date", text: "2026-02-18", type: "date" },
                    ],
                    updates: [{ id: "u3" }],
                  },
                ],
              },
            },
          ],
        },
      }),
    });

    it("returns items for a specific board", async () => {
      fetchMock.mockResolvedValueOnce(mockItemsResponse());

      const result = await handleMondayAction({
        action: "items",
        board: "Sprint Board",
      });

      const details = result.details as { items: Array<Record<string, unknown>> };
      expect(details.items).toHaveLength(2);
      expect(details.items[0]).toMatchObject({
        id: "2001",
        name: "Design review",
      });
    });

    it("filters items by status", async () => {
      fetchMock.mockResolvedValueOnce(mockItemsResponse());

      const result = await handleMondayAction({
        action: "items",
        status: "Review",
      });

      const details = result.details as { items: Array<Record<string, unknown>> };
      expect(details.items).toHaveLength(1);
      expect(details.items[0]).toMatchObject({
        name: "Design review",
        status: "Review",
      });
    });

    it("filters items by assignee", async () => {
      fetchMock.mockResolvedValueOnce(mockItemsResponse());

      const result = await handleMondayAction({
        action: "items",
        assignee: "leo",
      });

      const details = result.details as { items: Array<Record<string, unknown>> };
      expect(details.items).toHaveLength(1);
      expect(details.items[0]).toMatchObject({
        name: "Design review",
        assignee: "leo",
      });
    });
  });

  // ── Tests 19, 20: Monday item detail ──
  describe("action: item_detail", () => {
    it("returns full item with columns and updates", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            items: [
              {
                id: "2001",
                name: "Design review",
                column_values: [
                  { id: "status", title: "Status", text: "Review", type: "status" },
                  { id: "person", title: "Assignee", text: "leo", type: "people" },
                  { id: "date", title: "Due Date", text: "2026-02-20", type: "date" },
                  { id: "text", title: "Notes", text: "Important item", type: "text" },
                ],
                updates: [
                  {
                    id: "u1",
                    body: "Updated the design",
                    creator: { name: "Leo" },
                    created_at: "2026-02-14T10:00:00Z",
                  },
                  {
                    id: "u2",
                    body: "Looks good",
                    creator: { name: "Jonas" },
                    created_at: "2026-02-14T11:00:00Z",
                  },
                ],
              },
            ],
          },
        }),
      });

      const result = await handleMondayAction({
        action: "item_detail",
        item_id: "2001",
      });

      const details = result.details as Record<string, unknown>;
      expect(details.id).toBe("2001");
      expect(details.name).toBe("Design review");
      expect(details.columns).toBeDefined();
      expect(details.updates).toBeDefined();
      expect(details.updates as Array<unknown>).toHaveLength(2);
    });

    it("throws ToolInputError when item_id is missing", async () => {
      await expect(handleMondayAction({ action: "item_detail" })).rejects.toThrow(ToolInputError);
    });
  });

  // ── Tests 21, 22, 23: Monday updates ──
  describe("action: updates", () => {
    const mockUpdatesResponse = () => ({
      ok: true,
      json: async () => ({
        data: {
          boards: [
            {
              updates: [
                {
                  id: "u1",
                  body: "Task completed",
                  creator: { name: "Leo" },
                  created_at: "2026-02-14T15:00:00Z",
                  item_id: "2001",
                },
                {
                  id: "u2",
                  body: "Started work",
                  creator: { name: "Jonas" },
                  created_at: "2026-02-13T09:00:00Z",
                  item_id: "2002",
                },
              ],
            },
          ],
        },
      }),
    });

    it("returns recent updates", async () => {
      fetchMock.mockResolvedValueOnce(mockUpdatesResponse());

      const result = await handleMondayAction({ action: "updates" });

      const details = result.details as { updates: Array<Record<string, unknown>> };
      expect(details.updates).toHaveLength(2);
      expect(details.updates[0]).toMatchObject({
        body: "Task completed",
        creator: "Leo",
      });
    });

    it("filters updates by since date", async () => {
      fetchMock.mockResolvedValueOnce(mockUpdatesResponse());

      const result = await handleMondayAction({
        action: "updates",
        since: "2026-02-14T00:00:00Z",
      });

      const details = result.details as { updates: Array<Record<string, unknown>> };
      expect(details.updates).toHaveLength(1);
      expect(details.updates[0]).toMatchObject({ body: "Task completed" });
    });

    it("filters updates by board", async () => {
      fetchMock.mockResolvedValueOnce(mockUpdatesResponse());

      await handleMondayAction({
        action: "updates",
        board: "Sprint Board",
      });

      // Verify the GraphQL query includes board filter
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.query).toContain("boards");
    });
  });

  // ── Test 24: Missing Monday token ──
  it("returns error payload when MONDAY_API_TOKEN is missing", async () => {
    delete process.env.MONDAY_API_TOKEN;

    const result = await handleMondayAction({ action: "boards" });

    const details = result.details as { error: string };
    expect(details.error).toBeDefined();
    expect(details.error).toContain("missing");
  });

  // ── Test 25: Unknown action ──
  it("throws for unknown action", async () => {
    await expect(handleMondayAction({ action: "nonexistent" })).rejects.toThrow(
      "Unknown action: nonexistent",
    );
  });
});
