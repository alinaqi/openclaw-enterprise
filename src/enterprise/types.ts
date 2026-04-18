/**
 * Core enterprise types for multi-tenancy, identity, and RBAC.
 *
 * These types are the foundation of OpenClaw Enterprise's tenant model.
 * A Tenant represents an organization. Users belong to tenants via
 * TenantMembership, which includes their role. Roles govern what
 * resources and tools a user can access.
 */

// ---------------------------------------------------------------------------
// Branded ID types
// ---------------------------------------------------------------------------

export type TenantId = string;
export type UserId = string;
export type TeamId = string;

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export type TenantStatus = "active" | "suspended" | "archived";
export type TenantPlan = "free" | "team" | "enterprise";

export type TenantSettings = {
  maxUsers: number;
  maxStorageMb: number;
  allowedTools: string[];
  allowPersonalMode: boolean;
  dataRetentionDays: number;
  requireMfa: boolean;
};

export type Tenant = {
  id: TenantId;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
  settings: TenantSettings;
};

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  maxUsers: 10,
  maxStorageMb: 1024,
  allowedTools: [],
  allowPersonalMode: true,
  dataRetentionDays: 365,
  requireMfa: false,
};

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type UserStatus = "active" | "invited" | "suspended" | "deleted";
export type AuthMethod = "password" | "oidc" | "saml";

export type User = {
  id: UserId;
  email: string;
  name: string;
  avatarUrl?: string;
  status: UserStatus;
  authMethod: AuthMethod;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export type Team = {
  id: TeamId;
  tenantId: TenantId;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Roles & Permissions
// ---------------------------------------------------------------------------

export type TenantRole = "owner" | "admin" | "member" | "guest";

export const ROLE_HIERARCHY: Record<TenantRole, number> = {
  owner: 40,
  admin: 30,
  member: 20,
  guest: 10,
};

export type ResourceType =
  | "tenant"
  | "user"
  | "team"
  | "conversation"
  | "tool"
  | "config"
  | "audit"
  | "integration";

export type Action = "create" | "read" | "update" | "delete" | "invoke" | "manage" | "export";

export type Permission = {
  resource: ResourceType;
  action: Action;
  scope?: string;
};

// ---------------------------------------------------------------------------
// Tenant Membership
// ---------------------------------------------------------------------------

export type TenantMembership = {
  userId: UserId;
  tenantId: TenantId;
  teamId?: TeamId;
  role: TenantRole;
  joinedAt: string;
};

// ---------------------------------------------------------------------------
// Conversation context
// ---------------------------------------------------------------------------

export type ConversationContext = "work" | "personal";

// ---------------------------------------------------------------------------
// JWT payload
// ---------------------------------------------------------------------------

export type JwtPayload = {
  sub: UserId;
  tid: TenantId;
  role: TenantRole;
  scopes: string[];
  iat: number;
  exp: number;
  jti: string;
};

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditOutcome = "success" | "failure" | "denied";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "auth.mfa_setup"
  | "auth.mfa_verify"
  | "auth.mfa_failed"
  | "auth.token_refresh"
  | "auth.token_revoked"
  | "auth.password_changed"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "user.invited"
  | "user.role_changed"
  | "user.suspended"
  | "tool.invoked"
  | "tool.failed"
  | "tool.denied"
  | "data.read"
  | "data.export"
  | "data.delete"
  | "conversation.created"
  | "conversation.deleted"
  | "config.updated"
  | "config.tool_enabled"
  | "config.tool_disabled"
  | "tenant.created"
  | "tenant.updated"
  | "tenant.suspended"
  | "tenant.deleted"
  | "security.rate_limited"
  | "security.cross_tenant_blocked"
  | "security.permission_denied";

export type AuditEvent = {
  id: string;
  timestamp: string;
  tenantId: TenantId;
  userId?: UserId;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
};
