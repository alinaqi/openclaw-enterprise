import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Asana client -- module doesn't exist yet, will cause RED phase failure
const fetchAsanaTasksMock = vi.fn();
const fetchAsanaTaskDetailMock = vi.fn();
const fetchAsanaProjectsMock = vi.fn();
const searchAsanaTasksMock = vi.fn();
const fetchAsanaSubtasksMock = vi.fn();
const fetchAsanaStoriesMock = vi.fn();

vi.mock("../../asana/client.js", () => ({
  fetchAsanaTasks: (...args: unknown[]) => fetchAsanaTasksMock(...args),
  fetchAsanaTaskDetail: (...args: unknown[]) => fetchAsanaTaskDetailMock(...args),
  fetchAsanaProjects: (...args: unknown[]) => fetchAsanaProjectsMock(...args),
  searchAsanaTasks: (...args: unknown[]) => searchAsanaTasksMock(...args),
  fetchAsanaSubtasks: (...args: unknown[]) => fetchAsanaSubtasksMock(...args),
  fetchAsanaStories: (...args: unknown[]) => fetchAsanaStoriesMock(...args),
}));

// Import tool factories -- module doesn't exist yet
import {
  createAsanaTasksTool,
  createAsanaTaskDetailTool,
  createAsanaProjectsTool,
  createAsanaSearchTool,
  createAsanaSprintStatusTool,
} from "./asana-tools.js";

const BASE_CONFIG = {
  tools: {
    asana: {
      enabled: true,
      apiKey: "test-pat-token",
      workspaceGid: "workspace-123",
    },
  },
};

const SAMPLE_TASKS = [
  {
    gid: "1001",
    name: "Implement auth flow",
    assignee: { gid: "u1", name: "Verena Schmidt", email: "verena@zenloop.com" },
    completed: false,
    due_on: "2026-02-20",
    tags: [{ name: "backend" }],
    memberships: [{ section: { name: "In Progress" } }],
  },
  {
    gid: "1002",
    name: "Fix login bug",
    assignee: { gid: "u2", name: "Jonas Müller", email: "jonas@zenloop.com" },
    completed: true,
    due_on: "2026-02-15",
    tags: [{ name: "bugfix" }],
    memberships: [{ section: { name: "Done" } }],
  },
  {
    gid: "1003",
    name: "Update API docs",
    assignee: { gid: "u1", name: "Verena Schmidt", email: "verena@zenloop.com" },
    completed: false,
    due_on: null,
    tags: [],
    memberships: [{ section: { name: "To Do" } }],
  },
];

const SAMPLE_PROJECTS = [
  { gid: "p1", name: "Sprint 42", color: "light-green", current_status: { text: "On Track" } },
  { gid: "p2", name: "Sprint 43", color: "light-blue", current_status: null },
  { gid: "p3", name: "Backlog", color: "light-orange", current_status: null },
];

describe("asana_tasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test Case #1: List tasks default
  it("returns tasks with title, assignee, status, and due_on", async () => {
    fetchAsanaTasksMock.mockResolvedValue(SAMPLE_TASKS);

    const tool = createAsanaTasksTool({ config: BASE_CONFIG });
    expect(tool).not.toBeNull();

    const result = await tool!.execute("call-1", {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty("tasks");
    expect(parsed.tasks).toHaveLength(3);
    expect(parsed.tasks[0]).toMatchObject({
      title: "Implement auth flow",
      assignee: "Verena Schmidt",
      due_on: "2026-02-20",
    });
  });

  // Test Case #2: List tasks with limit
  it("returns at most the specified number of tasks", async () => {
    fetchAsanaTasksMock.mockResolvedValue(SAMPLE_TASKS);

    const tool = createAsanaTasksTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-2", { limit: 2 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.tasks.length).toBeLessThanOrEqual(2);
  });

  // Test Case #3: Filter by assignee email
  it("filters tasks by assignee email", async () => {
    const vTasks = SAMPLE_TASKS.filter((t) => t.assignee?.email === "verena@zenloop.com");
    fetchAsanaTasksMock.mockResolvedValue(vTasks);

    const tool = createAsanaTasksTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-3", {
      assignee: "verena@zenloop.com",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.tasks).toHaveLength(2);
    for (const task of parsed.tasks) {
      expect(task.assignee).toBe("Verena Schmidt");
    }
  });

  // Test Case #4: Filter by assignee name
  it("filters tasks by assignee name via people index lookup", async () => {
    const vTasks = SAMPLE_TASKS.filter((t) => t.assignee?.name?.toLowerCase().includes("verena"));
    fetchAsanaTasksMock.mockResolvedValue(vTasks);

    const tool = createAsanaTasksTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-4", { assignee: "verena" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.tasks).toHaveLength(2);
    for (const task of parsed.tasks) {
      expect(task.assignee).toBe("Verena Schmidt");
    }
  });

  // Test Case #5: Filter by status
  it("filters tasks by completion status", async () => {
    const completed = SAMPLE_TASKS.filter((t) => t.completed);
    fetchAsanaTasksMock.mockResolvedValue(completed);

    const tool = createAsanaTasksTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-5", { status: "completed" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe("Fix login bug");
  });

  // Test Case #6: Filter by project
  it("filters tasks by project name", async () => {
    fetchAsanaTasksMock.mockResolvedValue([SAMPLE_TASKS[0]]);

    const tool = createAsanaTasksTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-6", { project: "Sprint 42" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.tasks).toHaveLength(1);
    expect(fetchAsanaTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({ project: "Sprint 42" }),
    );
  });
});

describe("asana_task_detail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test Case #7: Task detail
  it("returns full task with description, subtasks, comments, custom_fields", async () => {
    fetchAsanaTaskDetailMock.mockResolvedValue({
      gid: "12345",
      name: "Implement auth flow",
      notes: "Detailed description of the auth implementation",
      assignee: { gid: "u1", name: "Verena Schmidt" },
      completed: false,
      due_on: "2026-02-20",
      custom_fields: [{ name: "Points", number_value: 5 }],
    });
    fetchAsanaSubtasksMock.mockResolvedValue([
      { gid: "s1", name: "Design auth schema", completed: true },
      { gid: "s2", name: "Implement JWT", completed: false },
    ]);
    fetchAsanaStoriesMock.mockResolvedValue([
      {
        gid: "c1",
        text: "Started working on this",
        type: "comment",
        created_by: { name: "Verena" },
      },
    ]);

    const tool = createAsanaTaskDetailTool({ config: BASE_CONFIG });
    expect(tool).not.toBeNull();

    const result = await tool!.execute("call-7", { task_gid: "12345" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toMatchObject({
      gid: "12345",
      title: "Implement auth flow",
      description: "Detailed description of the auth implementation",
    });
    expect(parsed.subtasks).toHaveLength(2);
    expect(parsed.comments).toHaveLength(1);
    expect(parsed.custom_fields).toHaveLength(1);
  });

  // Test Case #8: Task detail not found
  it("returns error result when task is not found", async () => {
    fetchAsanaTaskDetailMock.mockRejectedValue(new Error("Asana API error (404): Not Found"));

    const tool = createAsanaTaskDetailTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-8", { task_gid: "invalid" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty("error");
    expect(parsed.message).toContain("Not Found");
  });
});

describe("asana_projects", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test Case #9: List projects
  it("returns array of projects with name, gid, and status", async () => {
    fetchAsanaProjectsMock.mockResolvedValue(SAMPLE_PROJECTS);

    const tool = createAsanaProjectsTool({ config: BASE_CONFIG });
    expect(tool).not.toBeNull();

    const result = await tool!.execute("call-9", {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty("projects");
    expect(parsed.projects).toHaveLength(3);
    expect(parsed.projects[0]).toMatchObject({
      gid: "p1",
      name: "Sprint 42",
    });
  });
});

describe("asana_search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test Case #10: Search tasks
  it("returns tasks matching a text query", async () => {
    const searchResults = [SAMPLE_TASKS[0]]; // "Implement auth flow"
    searchAsanaTasksMock.mockResolvedValue(searchResults);

    const tool = createAsanaSearchTool({ config: BASE_CONFIG });
    expect(tool).not.toBeNull();

    const result = await tool!.execute("call-10", { query: "auth migration" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty("tasks");
    expect(parsed.tasks.length).toBeGreaterThan(0);
    expect(searchAsanaTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: "auth migration" }),
    );
  });

  // Test Case #11: Search within project
  it("scopes search to a specific project", async () => {
    searchAsanaTasksMock.mockResolvedValue([]);

    const tool = createAsanaSearchTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-11", {
      query: "bug",
      project: "Sprint 42",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty("tasks");
    expect(searchAsanaTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: "bug", project: "Sprint 42" }),
    );
  });
});

describe("asana_sprint_status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test Case #12: Sprint status default
  it("returns sprint metrics with total, completed, incomplete, and blocked counts", async () => {
    fetchAsanaTasksMock.mockResolvedValue(SAMPLE_TASKS);

    const tool = createAsanaSprintStatusTool({ config: BASE_CONFIG });
    expect(tool).not.toBeNull();

    const result = await tool!.execute("call-12", {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toMatchObject({
      total: 3,
      completed: 1,
      incomplete: 2,
    });
    expect(parsed).toHaveProperty("blocked");
  });

  // Test Case #13: Sprint status for specific project
  it("returns metrics for a specified project", async () => {
    fetchAsanaTasksMock.mockResolvedValue([SAMPLE_TASKS[0]]);

    const tool = createAsanaSprintStatusTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-13", { project: "Sprint 42" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty("total");
    expect(parsed).toHaveProperty("completed");
    expect(parsed).toHaveProperty("incomplete");
  });
});

describe("asana tools - error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test Case #14: Missing API token
  it("returns structured error when API token is missing", async () => {
    const noTokenConfig = { tools: { asana: { enabled: true } } };
    const tool = createAsanaTasksTool({ config: noTokenConfig });

    // Tool should either be null or return an error on execute
    if (tool === null) {
      // Acceptable: tool not created without config
      expect(tool).toBeNull();
    } else {
      const result = await tool.execute("call-14", {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty("error", "missing_asana_config");
      expect(parsed.message).toContain("ASANA_PAT");
    }
  });

  // Test Case #15: API error handling (401)
  it("returns structured error on API 401 response", async () => {
    fetchAsanaTasksMock.mockRejectedValue(new Error("Asana API error (401): Unauthorized"));

    const tool = createAsanaTasksTool({ config: BASE_CONFIG });
    const result = await tool!.execute("call-15", {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveProperty("error", "asana_api_error");
    expect(parsed).toHaveProperty("message");
    expect(parsed.message).toContain("401");
  });
});

describe("asana tool factory - disabled", () => {
  it("returns null when asana is not configured", () => {
    const tool = createAsanaTasksTool({ config: {} });
    expect(tool).toBeNull();
  });

  it("returns null when asana is explicitly disabled", () => {
    const tool = createAsanaTasksTool({
      config: { tools: { asana: { enabled: false } } },
    });
    expect(tool).toBeNull();
  });
});
