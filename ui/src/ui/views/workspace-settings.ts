import type { TemplateResult } from "lit";
import { html, nothing } from "lit";
import { PM_TOOL_LABELS, type PmToolType, type Workspace } from "../workspace.ts";

/** Ordered list of PM tools for the dropdown. */
const PM_TOOL_OPTIONS: PmToolType[] = [
  "none",
  "github-issues",
  "asana",
  "monday",
  "jira",
  "linear",
];

export type WorkspaceSettingsDraft = {
  githubOrg: string;
  githubRepo: string;
  pmTool: PmToolType;
  pmApiKey: string;
  pmWorkspace: string;
};

export type WorkspaceSettingsProps = {
  workspace: Workspace | null;
  draft: WorkspaceSettingsDraft | null;
  isOpen: boolean;
  onClose: () => void;
  onDraftChange: (field: string, value: string) => void;
  onSave: () => void;
};

export function createDraftFromWorkspace(ws: Workspace): WorkspaceSettingsDraft {
  const gh = ws.tools.github;

  // Resolve PM config (supports new pm field and legacy asana/monday)
  let pmTool: PmToolType = "none";
  let pmApiKey = "";
  let pmWorkspace = "";

  if (ws.tools.pm) {
    pmTool = ws.tools.pm.tool;
    pmApiKey = ws.tools.pm.apiKey ?? "";
    pmWorkspace = ws.tools.pm.workspace ?? "";
  } else if (ws.tools.asana) {
    pmTool = "asana";
    const a = ws.tools.asana;
    pmApiKey = typeof a === "string" ? "" : (a?.apiKey ?? "");
    pmWorkspace = typeof a === "string" ? a : (a?.workspaceGid ?? "");
  } else if (ws.tools.monday) {
    pmTool = "monday";
    const m = ws.tools.monday;
    pmApiKey = typeof m === "string" ? "" : (m?.apiKey ?? "");
    pmWorkspace = typeof m === "string" ? m : (m?.workspace ?? "");
  }

  return {
    githubOrg: typeof gh === "string" ? gh : (gh?.org ?? ""),
    githubRepo: typeof gh === "string" ? "" : (gh?.repo ?? ""),
    pmTool,
    pmApiKey,
    pmWorkspace,
  };
}

function maskApiKey(key: string | undefined): string {
  if (!key) {
    return "";
  }
  if (key.length <= 8) {
    return key;
  }
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function renderField(opts: {
  label: string;
  id: string;
  value: string;
  placeholder: string;
  type?: string;
  helpText?: string;
  onInput: (value: string) => void;
}): TemplateResult {
  return html`
    <div class="ws-settings-field">
      <label class="ws-settings-label" for=${opts.id}>${opts.label}</label>
      <input
        class="ws-settings-input"
        id=${opts.id}
        type=${opts.type ?? "text"}
        .value=${opts.value}
        placeholder=${opts.placeholder}
        @input=${(e: Event) => opts.onInput((e.target as HTMLInputElement).value)}
      />
      ${opts.helpText ? html`<div class="ws-settings-help">${opts.helpText}</div>` : nothing}
    </div>
  `;
}

function renderSectionHeader(title: string, connected: boolean): TemplateResult {
  return html`
    <div class="ws-settings-section-header">
      <span class="ws-settings-section-title">${title}</span>
      <span class="ws-settings-section-badge ${connected ? "ws-settings-section-badge--ok" : ""}">
        ${connected ? "Configured" : "Not configured"}
      </span>
    </div>
  `;
}

/** Whether a PM tool needs an API key field. */
function pmToolNeedsApiKey(tool: PmToolType): boolean {
  return tool === "asana" || tool === "monday" || tool === "jira" || tool === "linear";
}

/** Whether a PM tool needs a workspace/project identifier field. */
function pmToolNeedsWorkspace(tool: PmToolType): boolean {
  return tool !== "none" && tool !== "github-issues";
}

/** Label for the workspace/project field depending on PM tool. */
function pmWorkspaceLabel(tool: PmToolType): string {
  switch (tool) {
    case "asana":
      return "Workspace GID";
    case "monday":
      return "Workspace";
    case "jira":
      return "Domain";
    case "linear":
      return "Team";
    default:
      return "Workspace";
  }
}

/** Placeholder for the workspace/project field. */
function pmWorkspacePlaceholder(tool: PmToolType): string {
  switch (tool) {
    case "asana":
      return "e.g. 123456789";
    case "monday":
      return "e.g. edubites";
    case "jira":
      return "e.g. mycompany.atlassian.net";
    case "linear":
      return "e.g. my-team";
    default:
      return "";
  }
}

/** Help text for the API key field. */
function pmApiKeyHelp(tool: PmToolType, currentKey: string): string {
  if (currentKey) {
    return `Key set: ${maskApiKey(currentKey)}`;
  }
  switch (tool) {
    case "asana":
      return "Get from: My Settings > Apps > Personal Access Tokens";
    case "monday":
      return "Get from: Profile > Developers > My Access Tokens";
    case "jira":
      return "Get from: Manage Account > Security > API Tokens";
    case "linear":
      return "Get from: Settings > API > Personal API Keys";
    default:
      return "";
  }
}

function renderPmToolSection(
  wsId: string,
  d: WorkspaceSettingsDraft,
  onChange: (field: string, value: string) => void,
): TemplateResult {
  const tool = d.pmTool;
  const isConfigured =
    tool !== "none" && (tool === "github-issues" || Boolean(d.pmApiKey || d.pmWorkspace));

  return html`
    <div class="ws-settings-section">
      ${renderSectionHeader("Project Management", isConfigured)}

      <div class="ws-settings-field">
        <label class="ws-settings-label" for="ws-pm-tool-${wsId}">Tool</label>
        <select
          class="ws-settings-input"
          id="ws-pm-tool-${wsId}"
          .value=${tool}
          @change=${(e: Event) => onChange("pmTool", (e.target as HTMLSelectElement).value)}
        >
          ${PM_TOOL_OPTIONS.map(
            (key) => html`
            <option value=${key}>${PM_TOOL_LABELS[key]}</option>
          `,
          )}
        </select>
        ${
          tool === "github-issues"
            ? html`
                <div class="ws-settings-help">Uses GitHub Issues from the org/repo configured above</div>
              `
            : nothing
        }
      </div>

      ${
        pmToolNeedsApiKey(tool)
          ? renderField({
              label: "API Key",
              id: `ws-pm-key-${wsId}`,
              value: d.pmApiKey,
              placeholder: `${PM_TOOL_LABELS[tool]} API token`,
              type: "password",
              helpText: pmApiKeyHelp(tool, d.pmApiKey),
              onInput: (v) => onChange("pmApiKey", v),
            })
          : nothing
      }

      ${
        pmToolNeedsWorkspace(tool)
          ? renderField({
              label: pmWorkspaceLabel(tool),
              id: `ws-pm-workspace-${wsId}`,
              value: d.pmWorkspace,
              placeholder: pmWorkspacePlaceholder(tool),
              onInput: (v) => onChange("pmWorkspace", v),
            })
          : nothing
      }
    </div>
  `;
}

export function renderWorkspaceSettings(props: WorkspaceSettingsProps): TemplateResult {
  if (!props.isOpen || !props.workspace || !props.draft) {
    return html`${nothing}`;
  }

  const ws = props.workspace;
  const d = props.draft;
  const onChange = props.onDraftChange;

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("exec-approval-overlay")) {
        props.onClose();
      }
    }}>
      <div class="ws-settings-card">
        <div class="ws-settings-header">
          <div>
            <div class="ws-settings-title">Workspace Settings</div>
            <div class="ws-settings-subtitle">${ws.name}</div>
          </div>
          <button class="btn btn--sm" @click=${() => props.onClose()} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="ws-settings-body">

          <!-- GitHub Section -->
          <div class="ws-settings-section">
            ${renderSectionHeader("GitHub", Boolean(d.githubOrg))}
            ${renderField({
              label: "Organization",
              id: `ws-github-org-${ws.id}`,
              value: d.githubOrg,
              placeholder: "e.g. protaige",
              helpText: "GitHub org name for API queries",
              onInput: (v) => onChange("githubOrg", v),
            })}
            ${renderField({
              label: "Repository",
              id: `ws-github-repo-${ws.id}`,
              value: d.githubRepo,
              placeholder: "e.g. my-app (optional, all repos if empty)",
              helpText: d.githubRepo
                ? `Tracking: ${d.githubRepo}`
                : "Leave empty to query all repos in the org",
              onInput: (v) => onChange("githubRepo", v),
            })}
          </div>

          <!-- Project Management Section (dynamic) -->
          ${renderPmToolSection(ws.id, d, onChange)}

          <!-- Gmail & Slack (read-only display) -->
          <div class="ws-settings-section">
            ${renderSectionHeader("Other Connections", Boolean(ws.tools.gmail || ws.tools.slack))}
            <div class="ws-settings-connections">
              ${
                ws.tools.gmail
                  ? html`<div class="ws-settings-connection">
                    <span class="ws-settings-connection__label">Gmail</span>
                    <span class="ws-settings-connection__value">${typeof ws.tools.gmail === "string" ? ws.tools.gmail : "configured"}</span>
                  </div>`
                  : nothing
              }
              ${
                ws.tools.slack
                  ? html`<div class="ws-settings-connection">
                    <span class="ws-settings-connection__label">Slack</span>
                    <span class="ws-settings-connection__value">${ws.tools.slack}</span>
                  </div>`
                  : nothing
              }
              ${
                !ws.tools.gmail && !ws.tools.slack
                  ? html`
                      <div class="ws-settings-help">No Gmail or Slack connections configured.</div>
                    `
                  : nothing
              }
            </div>
          </div>
        </div>

        <div class="ws-settings-footer">
          <button class="btn" @click=${() => props.onClose()}>Cancel</button>
          <button class="btn primary" @click=${() => props.onSave()}>Save Changes</button>
        </div>
      </div>
    </div>
  `;
}
