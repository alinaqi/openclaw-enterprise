import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACES,
  addWorkspace,
  getActiveWorkspace,
  loadWorkspaceConfig,
  removeWorkspace,
  saveWorkspaceConfig,
  updateWorkspace,
  resolveGithubConfig,
  resolveAsanaConfig,
  resolveMondayConfig,
  resolvePmConfig,
  type Workspace,
  type WorkspaceConfig,
} from "./workspace.ts";

describe("workspace", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("loadWorkspaceConfig", () => {
    it("returns defaults when no localStorage", () => {
      const config = loadWorkspaceConfig();
      expect(config.workspaces).toHaveLength(3);
      expect(config.activeId).toBeNull();
      expect(config.workspaces[0].id).toBe("protaige");
      expect(config.workspaces[1].id).toBe("edubites");
      expect(config.workspaces[2].id).toBe("zenloop");
    });

    it("loads saved config from localStorage", () => {
      const saved: WorkspaceConfig = {
        workspaces: [{ id: "test", name: "Test", color: "#000", tools: {}, services: [] }],
        activeId: "test",
      };
      localStorage.setItem("openclaw.workspaces.v1", JSON.stringify(saved));

      const config = loadWorkspaceConfig();
      expect(config.workspaces).toHaveLength(1);
      expect(config.workspaces[0].id).toBe("test");
      expect(config.activeId).toBe("test");
    });

    it("falls back to defaults on corrupt localStorage", () => {
      localStorage.setItem("openclaw.workspaces.v1", "{invalid json!!!");

      const config = loadWorkspaceConfig();
      expect(config.workspaces).toHaveLength(3);
      expect(config.activeId).toBeNull();
    });

    it("falls back to defaults when workspaces array is empty", () => {
      localStorage.setItem(
        "openclaw.workspaces.v1",
        JSON.stringify({ workspaces: [], activeId: null }),
      );

      const config = loadWorkspaceConfig();
      expect(config.workspaces).toHaveLength(3);
    });
  });

  describe("saveWorkspaceConfig", () => {
    it("saves and reloads roundtrip", () => {
      const config: WorkspaceConfig = {
        workspaces: [
          { id: "foo", name: "Foo", color: "#f00", tools: { gmail: "foo" }, services: [] },
        ],
        activeId: "foo",
      };

      saveWorkspaceConfig(config);
      const loaded = loadWorkspaceConfig();

      expect(loaded.workspaces).toHaveLength(1);
      expect(loaded.workspaces[0].id).toBe("foo");
      expect(loaded.workspaces[0].tools.gmail).toBe("foo");
      expect(loaded.activeId).toBe("foo");
    });
  });

  describe("getActiveWorkspace", () => {
    it("returns workspace when activeId matches", () => {
      const config: WorkspaceConfig = {
        workspaces: DEFAULT_WORKSPACES,
        activeId: "protaige",
      };

      const active = getActiveWorkspace(config);
      expect(active).not.toBeNull();
      expect(active!.id).toBe("protaige");
      expect(active!.name).toBe("Protaige");
    });

    it("returns null when activeId is null (global)", () => {
      const config: WorkspaceConfig = {
        workspaces: DEFAULT_WORKSPACES,
        activeId: null,
      };

      expect(getActiveWorkspace(config)).toBeNull();
    });

    it("returns null when activeId does not match any workspace", () => {
      const config: WorkspaceConfig = {
        workspaces: DEFAULT_WORKSPACES,
        activeId: "nonexistent",
      };

      expect(getActiveWorkspace(config)).toBeNull();
    });
  });

  describe("addWorkspace", () => {
    it("adds a workspace to the config", () => {
      const config = loadWorkspaceConfig();
      const newWs: Workspace = {
        id: "saasgroup",
        name: "SaaS Group",
        color: "#7C3AED",
        tools: { slack: "saasgroup" },
        services: [],
      };

      const updated = addWorkspace(config, newWs);
      expect(updated.workspaces).toHaveLength(4);
      expect(updated.workspaces[3].id).toBe("saasgroup");
    });
  });

  describe("removeWorkspace", () => {
    it("removes a workspace from the config", () => {
      const config = loadWorkspaceConfig();
      const updated = removeWorkspace(config, "edubites");

      expect(updated.workspaces).toHaveLength(2);
      expect(updated.workspaces.find((ws) => ws.id === "edubites")).toBeUndefined();
    });

    it("resets activeId when active workspace is removed", () => {
      const config: WorkspaceConfig = {
        workspaces: DEFAULT_WORKSPACES,
        activeId: "edubites",
      };

      const updated = removeWorkspace(config, "edubites");
      expect(updated.activeId).toBeNull();
    });

    it("preserves activeId when a different workspace is removed", () => {
      const config: WorkspaceConfig = {
        workspaces: DEFAULT_WORKSPACES,
        activeId: "protaige",
      };

      const updated = removeWorkspace(config, "edubites");
      expect(updated.activeId).toBe("protaige");
    });
  });

  describe("updateWorkspace", () => {
    it("updates tools for a specific workspace", () => {
      const config = loadWorkspaceConfig();
      const updated = updateWorkspace(config, "protaige", {
        tools: {
          gmail: "protaige",
          github: { org: "protaige", repo: "my-app" },
          slack: "protaige",
        },
      });

      const ws = updated.workspaces.find((w) => w.id === "protaige");
      expect(ws).toBeDefined();
      const gh = resolveGithubConfig(ws!.tools);
      expect(gh.org).toBe("protaige");
      expect(gh.repo).toBe("my-app");
    });

    it("does not modify other workspaces", () => {
      const config = loadWorkspaceConfig();
      const updated = updateWorkspace(config, "protaige", {
        tools: { gmail: "protaige", github: { org: "protaige", repo: "changed" } },
      });

      const edubites = updated.workspaces.find((w) => w.id === "edubites");
      expect(edubites!.tools.gmail).toBe("edubites");
    });
  });

  describe("resolveGithubConfig", () => {
    it("resolves string github to org", () => {
      const result = resolveGithubConfig({ github: "myorg" });
      expect(result.org).toBe("myorg");
      expect(result.repo).toBeUndefined();
    });

    it("resolves object github config", () => {
      const result = resolveGithubConfig({ github: { org: "myorg", repo: "myrepo" } });
      expect(result.org).toBe("myorg");
      expect(result.repo).toBe("myrepo");
    });

    it("returns empty config when github is undefined", () => {
      const result = resolveGithubConfig({});
      expect(result.org).toBeUndefined();
      expect(result.repo).toBeUndefined();
    });
  });

  describe("resolveAsanaConfig", () => {
    it("resolves string asana to workspaceGid", () => {
      const result = resolveAsanaConfig({ asana: "zenloop" });
      expect(result.workspaceGid).toBe("zenloop");
      expect(result.apiKey).toBeUndefined();
    });

    it("resolves object asana config with key", () => {
      const result = resolveAsanaConfig({
        asana: { workspaceGid: "12345", apiKey: "secret-key" },
      });
      expect(result.workspaceGid).toBe("12345");
      expect(result.apiKey).toBe("secret-key");
    });

    it("returns empty config when asana is undefined", () => {
      const result = resolveAsanaConfig({});
      expect(result.workspaceGid).toBeUndefined();
    });
  });

  describe("resolveMondayConfig", () => {
    it("resolves string monday to workspace", () => {
      const result = resolveMondayConfig({ monday: "edubites" });
      expect(result.workspace).toBe("edubites");
      expect(result.apiKey).toBeUndefined();
    });

    it("resolves object monday config with key", () => {
      const result = resolveMondayConfig({
        monday: { workspace: "edubites", apiKey: "monday-token" },
      });
      expect(result.workspace).toBe("edubites");
      expect(result.apiKey).toBe("monday-token");
    });

    it("returns empty config when monday is undefined", () => {
      const result = resolveMondayConfig({});
      expect(result.workspace).toBeUndefined();
    });
  });

  describe("resolvePmConfig", () => {
    it("returns pm config when present", () => {
      const result = resolvePmConfig({
        pm: { tool: "jira", apiKey: "jira-key", workspace: "mycompany.atlassian.net" },
      });
      expect(result.tool).toBe("jira");
      expect(result.apiKey).toBe("jira-key");
      expect(result.workspace).toBe("mycompany.atlassian.net");
    });

    it("returns github-issues when pm tool is github-issues", () => {
      const result = resolvePmConfig({ pm: { tool: "github-issues" } });
      expect(result.tool).toBe("github-issues");
      expect(result.apiKey).toBeUndefined();
    });

    it("migrates legacy asana field to pm config", () => {
      const result = resolvePmConfig({
        asana: { workspaceGid: "12345", apiKey: "asana-pat" },
      });
      expect(result.tool).toBe("asana");
      expect(result.apiKey).toBe("asana-pat");
      expect(result.workspace).toBe("12345");
    });

    it("migrates legacy monday field to pm config", () => {
      const result = resolvePmConfig({
        monday: { workspace: "edubites", apiKey: "monday-tok" },
      });
      expect(result.tool).toBe("monday");
      expect(result.apiKey).toBe("monday-tok");
      expect(result.workspace).toBe("edubites");
    });

    it("returns none when no pm tool configured", () => {
      const result = resolvePmConfig({});
      expect(result.tool).toBe("none");
    });

    it("prefers pm field over legacy asana/monday", () => {
      const result = resolvePmConfig({
        pm: { tool: "linear", workspace: "my-team" },
        asana: { workspaceGid: "should-be-ignored" },
      });
      expect(result.tool).toBe("linear");
      expect(result.workspace).toBe("my-team");
    });
  });

  describe("rich config roundtrip", () => {
    it("saves and loads workspace with pm config", () => {
      const config: WorkspaceConfig = {
        workspaces: [
          {
            id: "test",
            name: "Test",
            color: "#000",
            tools: {
              github: { org: "testorg", repo: "testrepo" },
              pm: { tool: "asana", apiKey: "asana-pat-token", workspace: "99999" },
            },
            services: [],
          },
        ],
        activeId: "test",
      };

      saveWorkspaceConfig(config);
      const loaded = loadWorkspaceConfig();

      const ws = loaded.workspaces[0];
      const gh = resolveGithubConfig(ws.tools);
      const pm = resolvePmConfig(ws.tools);

      expect(gh.org).toBe("testorg");
      expect(gh.repo).toBe("testrepo");
      expect(pm.tool).toBe("asana");
      expect(pm.workspace).toBe("99999");
      expect(pm.apiKey).toBe("asana-pat-token");
    });

    it("saves and loads workspace with legacy fields", () => {
      const config: WorkspaceConfig = {
        workspaces: [
          {
            id: "test",
            name: "Test",
            color: "#000",
            tools: {
              asana: { workspaceGid: "99999", apiKey: "asana-pat-token" },
              monday: { workspace: "testws", apiKey: "monday-api-token" },
            },
            services: [],
          },
        ],
        activeId: "test",
      };

      saveWorkspaceConfig(config);
      const loaded = loadWorkspaceConfig();

      const ws = loaded.workspaces[0];
      const asana = resolveAsanaConfig(ws.tools);
      const monday = resolveMondayConfig(ws.tools);

      expect(asana.workspaceGid).toBe("99999");
      expect(asana.apiKey).toBe("asana-pat-token");
      expect(monday.workspace).toBe("testws");
      expect(monday.apiKey).toBe("monday-api-token");
    });
  });
});
