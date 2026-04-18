/**
 * Role-based access control for enterprise tenants.
 *
 * Implements a role hierarchy (owner > admin > member > guest) with
 * resource-based permission checks. Each role has a set of default
 * permissions, and higher roles inherit all permissions from lower roles.
 *
 * This module is pure/side-effect-free — it takes role and resource info
 * and returns allow/deny decisions.
 */

import type { Action, Permission, ResourceType, TenantRole } from "./types.js";
import { ROLE_HIERARCHY } from "./types.js";

// ---------------------------------------------------------------------------
// Default permission matrix
// ---------------------------------------------------------------------------

type RolePermissions = Permission[];

const GUEST_PERMISSIONS: RolePermissions = [
  { resource: "conversation", action: "read" },
  { resource: "tool", action: "read" },
];

const MEMBER_PERMISSIONS: RolePermissions = [
  ...GUEST_PERMISSIONS,
  { resource: "conversation", action: "create" },
  { resource: "conversation", action: "update" },
  { resource: "conversation", action: "delete" },
  { resource: "tool", action: "invoke" },
  { resource: "user", action: "read" },
  { resource: "team", action: "read" },
];

const ADMIN_PERMISSIONS: RolePermissions = [
  ...MEMBER_PERMISSIONS,
  { resource: "user", action: "create" },
  { resource: "user", action: "update" },
  { resource: "user", action: "delete" },
  { resource: "user", action: "manage" },
  { resource: "team", action: "create" },
  { resource: "team", action: "update" },
  { resource: "team", action: "delete" },
  { resource: "config", action: "read" },
  { resource: "config", action: "update" },
  { resource: "audit", action: "read" },
  { resource: "audit", action: "export" },
  { resource: "integration", action: "manage" },
  { resource: "tool", action: "manage" },
];

const OWNER_PERMISSIONS: RolePermissions = [
  ...ADMIN_PERMISSIONS,
  { resource: "tenant", action: "read" },
  { resource: "tenant", action: "update" },
  { resource: "tenant", action: "delete" },
  { resource: "tenant", action: "manage" },
  { resource: "config", action: "manage" },
  { resource: "audit", action: "manage" },
];

const ROLE_PERMISSION_MAP: Record<TenantRole, RolePermissions> = {
  guest: GUEST_PERMISSIONS,
  member: MEMBER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  owner: OWNER_PERMISSIONS,
};

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

/**
 * Get the full set of permissions for a role.
 */
export function getPermissionsForRole(role: TenantRole): Permission[] {
  return ROLE_PERMISSION_MAP[role] ?? [];
}

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: TenantRole, resource: ResourceType, action: Action): boolean {
  const permissions = getPermissionsForRole(role);
  return permissions.some((p) => p.resource === resource && p.action === action);
}

/**
 * Check if roleA is higher than or equal to roleB in the hierarchy.
 */
export function isRoleAtLeast(role: TenantRole, minimumRole: TenantRole): boolean {
  return (ROLE_HIERARCHY[role] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 0);
}

/**
 * Check if a role can manage another role.
 * A role can only manage roles strictly below it in the hierarchy.
 */
export function canManageRole(managerRole: TenantRole, targetRole: TenantRole): boolean {
  return (ROLE_HIERARCHY[managerRole] ?? 0) > (ROLE_HIERARCHY[targetRole] ?? 0);
}

/**
 * Require a permission — throws if denied.
 */
export function requirePermission(role: TenantRole, resource: ResourceType, action: Action): void {
  if (!hasPermission(role, resource, action)) {
    throw new PermissionDeniedError(role, resource, action);
  }
}

// ---------------------------------------------------------------------------
// Tool access control
// ---------------------------------------------------------------------------

export type ToolPolicy = {
  tool: string;
  allowedRoles: TenantRole[];
};

const DEFAULT_TOOL_POLICIES: ToolPolicy[] = [
  { tool: "web_search", allowedRoles: ["owner", "admin", "member", "guest"] },
  { tool: "web_fetch", allowedRoles: ["owner", "admin", "member", "guest"] },
  { tool: "gmail", allowedRoles: ["owner", "admin", "member"] },
  { tool: "calendar", allowedRoles: ["owner", "admin", "member"] },
  { tool: "slack_read", allowedRoles: ["owner", "admin", "member"] },
  { tool: "github", allowedRoles: ["owner", "admin", "member"] },
  { tool: "asana", allowedRoles: ["owner", "admin", "member"] },
  { tool: "monday", allowedRoles: ["owner", "admin", "member"] },
  { tool: "people", allowedRoles: ["owner", "admin", "member"] },
  { tool: "briefing", allowedRoles: ["owner", "admin", "member"] },
];

/**
 * Check if a role can access a specific tool.
 */
export function canAccessTool(
  role: TenantRole,
  toolName: string,
  policies: ToolPolicy[] = DEFAULT_TOOL_POLICIES,
): boolean {
  const policy = policies.find((p) => p.tool === toolName);
  if (!policy) {
    // Tools without explicit policy: allow member+ by default
    return isRoleAtLeast(role, "member");
  }
  return policy.allowedRoles.includes(role);
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PermissionDeniedError extends Error {
  readonly role: TenantRole;
  readonly resource: ResourceType;
  readonly action: Action;

  constructor(role: TenantRole, resource: ResourceType, action: Action) {
    super(`Permission denied: role '${role}' cannot '${action}' on '${resource}'`);
    this.name = "PermissionDeniedError";
    this.role = role;
    this.resource = resource;
    this.action = action;
  }
}
