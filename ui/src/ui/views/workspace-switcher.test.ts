import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WORKSPACES, type WorkspaceConfig } from "../workspace.ts";
import { renderWorkspaceSwitcher, type WorkspaceSwitcherProps } from "./workspace-switcher.ts";

function defaultConfig(overrides: Partial<WorkspaceConfig> = {}): WorkspaceConfig {
  return {
    workspaces: [...DEFAULT_WORKSPACES],
    activeId: null,
    ...overrides,
  };
}

function createProps(overrides: Partial<WorkspaceSwitcherProps> = {}): WorkspaceSwitcherProps {
  return {
    config: defaultConfig(),
    isOpen: false,
    onToggle: vi.fn(),
    onSelect: vi.fn(),
    onAddWorkspace: vi.fn(),
    onSettingsOpen: vi.fn(),
    ...overrides,
  };
}

function renderTo(props: WorkspaceSwitcherProps): HTMLElement {
  const container = document.createElement("div");
  render(renderWorkspaceSwitcher(props), container);
  return container;
}

describe("renderWorkspaceSwitcher", () => {
  it("renders brand with active workspace name", () => {
    const el = renderTo(
      createProps({
        config: defaultConfig({ activeId: "protaige" }),
      }),
    );
    const label = el.querySelector(".workspace-trigger__label");
    expect(label?.textContent?.trim()).toBe("Protaige");
  });

  it('renders "Global Overview" when no active workspace', () => {
    const el = renderTo(
      createProps({
        config: defaultConfig({ activeId: null }),
      }),
    );
    const label = el.querySelector(".workspace-trigger__label");
    expect(label?.textContent?.trim()).toBe("Global Overview");
  });

  it("dropdown shows all workspaces when open", () => {
    const el = renderTo(createProps({ isOpen: true }));
    const items = el.querySelectorAll(".workspace-item");
    // Global Overview + 3 workspaces + Add Workspace = 5
    expect(items).toHaveLength(5);
  });

  it("does not render dropdown when closed", () => {
    const el = renderTo(createProps({ isOpen: false }));
    const dropdown = el.querySelector(".workspace-dropdown");
    expect(dropdown).toBeNull();
  });

  it("selecting workspace calls onSelect with id", () => {
    const onSelect = vi.fn();
    const el = renderTo(createProps({ isOpen: true, onSelect }));
    const items = el.querySelectorAll(".workspace-item");
    // items[0] = Global Overview, items[1] = Protaige, items[2] = Edubites, items[3] = Zenloop, items[4] = Add
    (items[1] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith("protaige");
  });

  it("selecting Global calls onSelect with null", () => {
    const onSelect = vi.fn();
    const el = renderTo(createProps({ isOpen: true, onSelect }));
    const items = el.querySelectorAll(".workspace-item");
    (items[0] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("active workspace shows checkmark", () => {
    const el = renderTo(
      createProps({
        isOpen: true,
        config: defaultConfig({ activeId: "protaige" }),
      }),
    );
    const items = el.querySelectorAll(".workspace-item");
    // items[0] = Global, items[1] = Protaige, items[2] = Edubites, items[3] = Zenloop, items[4] = Add
    const protaigeItem = items[1];
    expect(protaigeItem?.querySelector(".workspace-check")).not.toBeNull();
    // Other workspace items should not have checkmark
    expect(items[2]?.querySelector(".workspace-check")).toBeNull();
  });

  it("workspace dots show correct colors", () => {
    const el = renderTo(createProps({ isOpen: true }));
    const dots = el.querySelectorAll(".workspace-dot");
    // One dot per workspace in dropdown (3 workspaces)
    expect(dots).toHaveLength(3);
    expect((dots[0] as HTMLElement).style.background).toBe("rgb(79, 70, 229)");
    expect((dots[1] as HTMLElement).style.background).toBe("rgb(5, 150, 105)");
    expect((dots[2] as HTMLElement).style.background).toBe("rgb(217, 119, 6)");
  });

  it("Add Workspace button calls handler", () => {
    const onAddWorkspace = vi.fn();
    const el = renderTo(createProps({ isOpen: true, onAddWorkspace }));
    const addBtn = el.querySelector(".workspace-item--add") as HTMLElement;
    expect(addBtn).not.toBeNull();
    addBtn.click();
    expect(onAddWorkspace).toHaveBeenCalled();
  });

  it("toggle button calls onToggle", () => {
    const onToggle = vi.fn();
    const el = renderTo(createProps({ onToggle }));
    const trigger = el.querySelector(".workspace-trigger") as HTMLElement;
    trigger.click();
    expect(onToggle).toHaveBeenCalled();
  });

  it("settings gear button calls onSettingsOpen with workspace id", () => {
    const onSettingsOpen = vi.fn();
    const el = renderTo(createProps({ isOpen: true, onSettingsOpen }));
    const gearButtons = el.querySelectorAll(".workspace-item__settings");
    // One gear button per workspace (3)
    expect(gearButtons).toHaveLength(3);
    (gearButtons[0] as HTMLElement).click();
    expect(onSettingsOpen).toHaveBeenCalledWith("protaige");
  });
});
