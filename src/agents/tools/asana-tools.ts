import { Type } from "@sinclair/typebox";
import type { AsanaConfig, AsanaTask } from "../../asana/types.js";
import type { AnyAgentTool } from "./common.js";
import {
  fetchAsanaProjects,
  fetchAsanaStories,
  fetchAsanaSubtasks,
  fetchAsanaTaskDetail,
  fetchAsanaTasks,
  searchAsanaTasks,
} from "../../asana/client.js";
import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

type AsanaToolOptions = {
  config?: { tools?: { asana?: AsanaConfig } };
};

function resolveAsanaConfig(options: AsanaToolOptions): AsanaConfig | null {
  const asana = options.config?.tools?.asana;
  if (!asana) {
    return null;
  }
  if (asana.enabled === false) {
    return null;
  }
  const apiKey =
    normalizeSecretInput(asana.apiKey) || normalizeSecretInput(process.env.ASANA_PAT) || undefined;
  const workspaceGid = asana.workspaceGid || process.env.ASANA_WORKSPACE_GID || undefined;
  if (!apiKey) {
    return null;
  }
  return { ...asana, apiKey, workspaceGid };
}

function apiErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return jsonResult({
    error: "asana_api_error",
    message,
  });
}

function formatTask(task: AsanaTask) {
  return {
    gid: task.gid,
    title: task.name,
    assignee: task.assignee?.name ?? null,
    completed: task.completed,
    due_on: task.due_on,
    tags: task.tags?.map((t) => t.name) ?? [],
    section: task.memberships?.[0]?.section?.name ?? null,
  };
}

const AsanaTasksSchema = Type.Object({
  project: Type.Optional(Type.String()),
  assignee: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
});

const AsanaTaskDetailSchema = Type.Object({
  task_gid: Type.String(),
});

const AsanaSearchSchema = Type.Object({
  query: Type.String(),
  project: Type.Optional(Type.String()),
});

const AsanaSprintStatusSchema = Type.Object({
  project: Type.Optional(Type.String()),
});

export function createAsanaTasksTool(options: AsanaToolOptions): AnyAgentTool | null {
  const config = resolveAsanaConfig(options);
  if (!config) {
    return null;
  }
  return {
    label: "Asana Tasks",
    name: "asana_tasks",
    description:
      "List and filter Asana tasks in the zenloop workspace. Filter by project, assignee, or status.",
    parameters: AsanaTasksSchema,
    execute: async (_toolCallId, params) => {
      const p = params as Record<string, unknown>;
      const project = readStringParam(p, "project");
      const assignee = readStringParam(p, "assignee");
      const status = readStringParam(p, "status");
      const limit = readNumberParam(p, "limit", { integer: true });
      try {
        const tasks = await fetchAsanaTasks({
          config,
          project,
          assignee,
          status,
          limit: limit ?? undefined,
        });
        const formatted = tasks.map(formatTask);
        const limited = limit && limit > 0 ? formatted.slice(0, limit) : formatted;
        return jsonResult({ tasks: limited });
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  };
}

export function createAsanaTaskDetailTool(options: AsanaToolOptions): AnyAgentTool | null {
  const config = resolveAsanaConfig(options);
  if (!config) {
    return null;
  }
  return {
    label: "Asana Task Detail",
    name: "asana_task_detail",
    description:
      "Get full details for an Asana task including description, subtasks, comments, and custom fields.",
    parameters: AsanaTaskDetailSchema,
    execute: async (_toolCallId, params) => {
      const p = params as Record<string, unknown>;
      const taskGid = readStringParam(p, "task_gid", {
        required: true,
      });
      try {
        const [task, subtasks, stories] = await Promise.all([
          fetchAsanaTaskDetail(taskGid, config),
          fetchAsanaSubtasks(taskGid, config),
          fetchAsanaStories(taskGid, config),
        ]);
        return jsonResult({
          gid: task.gid,
          title: task.name,
          description: task.notes,
          assignee: task.assignee?.name ?? null,
          completed: task.completed,
          due_on: task.due_on,
          custom_fields: task.custom_fields,
          subtasks: subtasks.map((s) => ({
            gid: s.gid,
            title: s.name,
            completed: s.completed,
          })),
          comments: stories.map((s) => ({
            gid: s.gid,
            text: s.text,
            author: s.created_by?.name ?? null,
          })),
        });
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  };
}

export function createAsanaProjectsTool(options: AsanaToolOptions): AnyAgentTool | null {
  const config = resolveAsanaConfig(options);
  if (!config) {
    return null;
  }
  return {
    label: "Asana Projects",
    name: "asana_projects",
    description: "List all projects in the zenloop Asana workspace.",
    parameters: Type.Object({}),
    execute: async () => {
      try {
        const projects = await fetchAsanaProjects(config);
        return jsonResult({
          projects: projects.map((p) => ({
            gid: p.gid,
            name: p.name,
            color: p.color,
            status: p.current_status?.text ?? null,
          })),
        });
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  };
}

export function createAsanaSearchTool(options: AsanaToolOptions): AnyAgentTool | null {
  const config = resolveAsanaConfig(options);
  if (!config) {
    return null;
  }
  return {
    label: "Asana Search",
    name: "asana_search",
    description: "Search Asana tasks by text query, optionally scoped to a project.",
    parameters: AsanaSearchSchema,
    execute: async (_toolCallId, params) => {
      const p = params as Record<string, unknown>;
      const query = readStringParam(p, "query", {
        required: true,
      });
      const project = readStringParam(p, "project");
      try {
        const tasks = await searchAsanaTasks({
          config,
          query,
          project,
        });
        return jsonResult({
          tasks: tasks.map(formatTask),
        });
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  };
}

export function createAsanaSprintStatusTool(options: AsanaToolOptions): AnyAgentTool | null {
  const config = resolveAsanaConfig(options);
  if (!config) {
    return null;
  }
  return {
    label: "Asana Sprint Status",
    name: "asana_sprint_status",
    description:
      "Get sprint status metrics: total tasks, completed, incomplete, and blocked counts.",
    parameters: AsanaSprintStatusSchema,
    execute: async (_toolCallId, params) => {
      const p = params as Record<string, unknown>;
      const project = readStringParam(p, "project");
      try {
        const tasks = await fetchAsanaTasks({
          config,
          project: project ?? config.defaultProjectGid,
        });
        const completed = tasks.filter((t) => t.completed);
        const incomplete = tasks.filter((t) => !t.completed);
        const blocked = incomplete.filter((t) =>
          t.tags?.some((tag) => tag.name.toLowerCase() === "blocked"),
        );
        return jsonResult({
          total: tasks.length,
          completed: completed.length,
          incomplete: incomplete.length,
          blocked: blocked.length,
          blockedTasks: blocked.map(formatTask),
        });
      } catch (err) {
        return apiErrorResult(err);
      }
    },
  };
}
