import type {
  AsanaConfig,
  AsanaProject,
  AsanaStory,
  AsanaSubtask,
  AsanaTask,
  AsanaTaskDetail,
} from "./types.js";

const ASANA_BASE_URL = "https://app.asana.com/api/1.0";

type FetchTasksParams = {
  config: AsanaConfig;
  project?: string;
  assignee?: string;
  status?: string;
  limit?: number;
};

type SearchParams = {
  config: AsanaConfig;
  query: string;
  project?: string;
};

async function asanaFetch<T>(
  path: string,
  config: AsanaConfig,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${ASANA_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Asana API error (${res.status}): ${detail || res.statusText}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export async function fetchAsanaTasks(params: FetchTasksParams): Promise<AsanaTask[]> {
  const { config, project, assignee, status, limit } = params;
  const gid = config.workspaceGid;
  if (!gid) {
    throw new Error("Asana workspace GID is required");
  }
  const query: Record<string, string> = {
    opt_fields:
      "name,assignee.name,assignee.email,completed,due_on,tags.name,memberships.section.name",
    limit: String(limit ?? 100),
  };
  if (assignee) {
    query.assignee = assignee;
  }
  if (project) {
    query.project = project;
  }
  let tasks = await asanaFetch<AsanaTask[]>(`/workspaces/${gid}/tasks`, config, query);
  if (status === "completed") {
    tasks = tasks.filter((t) => t.completed);
  } else if (status === "not_started" || status === "in_progress") {
    tasks = tasks.filter((t) => !t.completed);
  }
  return tasks;
}

export async function fetchAsanaTaskDetail(
  taskGid: string,
  config: AsanaConfig,
): Promise<AsanaTaskDetail> {
  return asanaFetch<AsanaTaskDetail>(`/tasks/${taskGid}`, config, {
    opt_fields:
      "name,notes,assignee.name,assignee.email,completed,due_on,custom_fields.name,custom_fields.number_value,custom_fields.text_value,custom_fields.enum_value.name",
  });
}

export async function fetchAsanaSubtasks(
  taskGid: string,
  config: AsanaConfig,
): Promise<AsanaSubtask[]> {
  return asanaFetch<AsanaSubtask[]>(`/tasks/${taskGid}/subtasks`, config, {
    opt_fields: "name,completed",
  });
}

export async function fetchAsanaStories(
  taskGid: string,
  config: AsanaConfig,
): Promise<AsanaStory[]> {
  const stories = await asanaFetch<AsanaStory[]>(`/tasks/${taskGid}/stories`, config);
  return stories.filter((s) => s.type === "comment");
}

export async function fetchAsanaProjects(config: AsanaConfig): Promise<AsanaProject[]> {
  const gid = config.workspaceGid;
  if (!gid) {
    throw new Error("Asana workspace GID is required");
  }
  return asanaFetch<AsanaProject[]>(`/workspaces/${gid}/projects`, config, {
    opt_fields: "name,color,current_status.text",
  });
}

export async function searchAsanaTasks(params: SearchParams): Promise<AsanaTask[]> {
  const { config, query, project } = params;
  const gid = config.workspaceGid;
  if (!gid) {
    throw new Error("Asana workspace GID is required");
  }
  const searchParams: Record<string, string> = {
    type: "task",
    query,
    opt_fields:
      "name,assignee.name,assignee.email,completed,due_on,tags.name,memberships.section.name",
  };
  if (project) {
    searchParams["projects.any"] = project;
  }
  return asanaFetch<AsanaTask[]>(`/workspaces/${gid}/typeahead`, config, searchParams);
}
