// Workspace types, defaults, and localStorage persistence.

export type GithubToolConfig = {
  org?: string;
  repo?: string;
};

export type AsanaToolConfig = {
  workspaceGid?: string;
  apiKey?: string;
};

export type MondayToolConfig = {
  workspace?: string;
  apiKey?: string;
};

/** Supported project-management tools. */
export type PmToolType = "github-issues" | "asana" | "monday" | "jira" | "linear" | "none";

export const PM_TOOL_LABELS: Record<PmToolType, string> = {
  none: "None",
  "github-issues": "GitHub Issues",
  asana: "Asana",
  monday: "Monday.com",
  jira: "Jira",
  linear: "Linear",
};

export type PmToolConfig = {
  tool: PmToolType;
  apiKey?: string;
  workspace?: string; // Asana GID, Monday workspace, Jira domain, Linear team
};

export type WorkspaceToolMapping = {
  gmail?: string;
  github?: string | GithubToolConfig;
  slack?: string;
  pm?: PmToolConfig;
  /** @deprecated Use pm instead. Kept for backward compat. */
  asana?: string | AsanaToolConfig;
  /** @deprecated Use pm instead. Kept for backward compat. */
  monday?: string | MondayToolConfig;
};

export type WorkspaceService = {
  name: string;
  url?: string;
  projectRef?: string;
  connected: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  color: string;
  tools: WorkspaceToolMapping;
  services: WorkspaceService[];
};

export type WorkspaceConfig = {
  workspaces: Workspace[];
  activeId: string | null;
};

// Helper accessors for tool configs

export function resolveGithubConfig(tools: WorkspaceToolMapping): GithubToolConfig {
  const gh = tools.github;
  if (!gh) {
    return {};
  }
  if (typeof gh === "string") {
    return { org: gh };
  }
  return gh;
}

export function resolveAsanaConfig(tools: WorkspaceToolMapping): AsanaToolConfig {
  const asana = tools.asana;
  if (!asana) {
    return {};
  }
  if (typeof asana === "string") {
    return { workspaceGid: asana };
  }
  return asana;
}

export function resolveMondayConfig(tools: WorkspaceToolMapping): MondayToolConfig {
  const monday = tools.monday;
  if (!monday) {
    return {};
  }
  if (typeof monday === "string") {
    return { workspace: monday };
  }
  return monday;
}

/** Resolve the PM tool config, migrating from legacy asana/monday fields. */
export function resolvePmConfig(tools: WorkspaceToolMapping): PmToolConfig {
  if (tools.pm) {
    return tools.pm;
  }
  // Migrate legacy fields
  if (tools.asana) {
    const a = resolveAsanaConfig(tools);
    return { tool: "asana", apiKey: a.apiKey, workspace: a.workspaceGid };
  }
  if (tools.monday) {
    const m = resolveMondayConfig(tools);
    return { tool: "monday", apiKey: m.apiKey, workspace: m.workspace };
  }
  return { tool: "none" };
}

export function updateWorkspace(
  config: WorkspaceConfig,
  workspaceId: string,
  patch: Partial<Workspace>,
): WorkspaceConfig {
  return {
    ...config,
    workspaces: config.workspaces.map((ws) => (ws.id === workspaceId ? { ...ws, ...patch } : ws)),
  };
}

const STORAGE_KEY = "openclaw.workspaces.v1";

export const DEFAULT_WORKSPACES: Workspace[] = [
  {
    id: "protaige",
    name: "Protaige",
    color: "#4F46E5",
    tools: {
      gmail: "protaige",
      github: { org: "protaige" },
      slack: "protaige",
      pm: { tool: "github-issues" },
    },
    services: [],
  },
  {
    id: "edubites",
    name: "Edubites",
    color: "#059669",
    tools: {
      gmail: "edubites",
      slack: "edubites",
      pm: { tool: "monday", workspace: "edubites" },
    },
    services: [],
  },
  {
    id: "zenloop",
    name: "Zenloop",
    color: "#D97706",
    tools: {
      gmail: "zenloop",
      github: { org: "zenloop" },
      slack: "zenloop",
      pm: { tool: "asana", workspace: "zenloop" },
    },
    services: [],
  },
];

function defaultConfig(): WorkspaceConfig {
  return {
    workspaces: DEFAULT_WORKSPACES.map((ws) => ({
      ...ws,
      tools: { ...ws.tools },
      services: [...ws.services],
    })),
    activeId: null,
  };
}

export function loadWorkspaceConfig(): WorkspaceConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultConfig();
    }
    const parsed = JSON.parse(raw) as Partial<WorkspaceConfig>;
    if (!Array.isArray(parsed.workspaces) || parsed.workspaces.length === 0) {
      return defaultConfig();
    }
    return {
      workspaces: parsed.workspaces,
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
    };
  } catch {
    return defaultConfig();
  }
}

export function saveWorkspaceConfig(config: WorkspaceConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getActiveWorkspace(config: WorkspaceConfig): Workspace | null {
  if (config.activeId == null) {
    return null;
  }
  return config.workspaces.find((ws) => ws.id === config.activeId) ?? null;
}

export function addWorkspace(config: WorkspaceConfig, workspace: Workspace): WorkspaceConfig {
  return {
    ...config,
    workspaces: [...config.workspaces, workspace],
  };
}

export function removeWorkspace(config: WorkspaceConfig, workspaceId: string): WorkspaceConfig {
  return {
    workspaces: config.workspaces.filter((ws) => ws.id !== workspaceId),
    activeId: config.activeId === workspaceId ? null : config.activeId,
  };
}
