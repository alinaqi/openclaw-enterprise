import type { TemplateResult } from "lit";
import { html, nothing } from "lit";
import type { WorkspaceConfig, Workspace } from "../workspace.ts";

export type WorkspaceSwitcherProps = {
  config: WorkspaceConfig;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (workspaceId: string | null) => void;
  onAddWorkspace: () => void;
  onSettingsOpen: (workspaceId: string) => void;
};

function renderWorkspaceDot(color: string): TemplateResult {
  return html`<span
    class="workspace-dot"
    style="background: ${color};"
  ></span>`;
}

function renderCheckmark(): TemplateResult {
  return html`
    <svg
      class="workspace-check"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;
}

function renderGlobeIcon(): TemplateResult {
  return html`
    <svg
      class="workspace-globe"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M2 12h20"></path>
      <path
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
      ></path>
    </svg>
  `;
}

function renderPlusIcon(): TemplateResult {
  return html`
    <svg
      class="workspace-plus"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  `;
}

function renderGearIcon(): TemplateResult {
  return html`
    <svg
      class="workspace-gear"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      ></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}

function renderChevronIcon(): TemplateResult {
  return html`
    <svg
      class="workspace-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
}

function resolveActiveLabel(config: WorkspaceConfig): string {
  if (config.activeId == null) {
    return "Global Overview";
  }
  const ws = config.workspaces.find((w) => w.id === config.activeId);
  return ws?.name ?? "Global Overview";
}

function resolveActiveColor(config: WorkspaceConfig): string | null {
  if (config.activeId == null) {
    return null;
  }
  const ws = config.workspaces.find((w) => w.id === config.activeId);
  return ws?.color ?? null;
}

export function renderWorkspaceSwitcher(props: WorkspaceSwitcherProps): TemplateResult {
  const activeLabel = resolveActiveLabel(props.config);
  const activeColor = resolveActiveColor(props.config);

  return html`
    <div class="workspace-switcher ${props.isOpen ? "workspace-switcher--open" : ""}">
      <button
        class="workspace-trigger"
        @click=${(e: Event) => {
          e.stopPropagation();
          props.onToggle();
        }}
        aria-expanded=${props.isOpen}
        aria-haspopup="listbox"
        title="Switch workspace"
      >
        ${
          activeColor
            ? renderWorkspaceDot(activeColor)
            : html`<span class="workspace-trigger__globe">${renderGlobeIcon()}</span>`
        }
        <span class="workspace-trigger__label">${activeLabel}</span>
        ${renderChevronIcon()}
      </button>
      ${
        props.isOpen
          ? html`
            <div class="workspace-dropdown" role="listbox" aria-label="Workspaces">
              <button
                class="workspace-item ${props.config.activeId == null ? "workspace-item--active" : ""}"
                role="option"
                aria-selected=${props.config.activeId == null}
                @click=${() => props.onSelect(null)}
              >
                <span class="workspace-item__icon">${renderGlobeIcon()}</span>
                <span class="workspace-item__name">Global Overview</span>
                ${props.config.activeId == null ? renderCheckmark() : nothing}
              </button>
              <div class="workspace-dropdown__divider"></div>
              ${props.config.workspaces.map(
                (ws: Workspace) => html`
                  <div class="workspace-item-row">
                    <button
                      class="workspace-item ${props.config.activeId === ws.id ? "workspace-item--active" : ""}"
                      role="option"
                      aria-selected=${props.config.activeId === ws.id}
                      @click=${() => props.onSelect(ws.id)}
                    >
                      ${renderWorkspaceDot(ws.color)}
                      <span class="workspace-item__name">${ws.name}</span>
                      ${props.config.activeId === ws.id ? renderCheckmark() : nothing}
                    </button>
                    <button
                      class="workspace-item__settings"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        props.onSettingsOpen(ws.id);
                      }}
                      title="Configure ${ws.name}"
                    >
                      ${renderGearIcon()}
                    </button>
                  </div>
                `,
              )}
              <div class="workspace-dropdown__divider"></div>
              <button
                class="workspace-item workspace-item--add"
                @click=${() => props.onAddWorkspace()}
              >
                <span class="workspace-item__icon">${renderPlusIcon()}</span>
                <span class="workspace-item__name">Add Workspace</span>
              </button>
            </div>
          `
          : nothing
      }
    </div>
  `;
}
