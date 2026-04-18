/**
 * SQLite-backed tenant registry.
 *
 * Manages the platform-level database that stores tenant definitions,
 * user accounts, and memberships. This is the "control plane" database —
 * each tenant also gets its own isolated data database (see tenant-db.ts).
 *
 * Uses Node.js built-in `node:sqlite` (DatabaseSync) following the same
 * pattern as `src/tasks/task-registry.store.sqlite.ts`.
 */

import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import type {
  Tenant,
  TenantId,
  TenantMembership,
  TenantRole,
  TenantSettings,
  User,
  UserId,
} from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  settings_json: string;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  status: string;
  auth_method: string;
  mfa_enabled: number;
  password_hash: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

type MembershipRow = {
  user_id: string;
  tenant_id: string;
  team_id: string | null;
  role: string;
  joined_at: string;
};

type PlatformStatements = {
  // Tenants
  insertTenant: StatementSync;
  selectTenantById: StatementSync;
  selectTenantBySlug: StatementSync;
  selectAllTenants: StatementSync;
  updateTenant: StatementSync;
  deleteTenant: StatementSync;

  // Users
  insertUser: StatementSync;
  selectUserById: StatementSync;
  selectUserByEmail: StatementSync;
  updateUser: StatementSync;
  updateLastLogin: StatementSync;
  selectPasswordHash: StatementSync;
  updatePasswordHash: StatementSync;

  // Memberships
  insertMembership: StatementSync;
  selectMembershipsByTenant: StatementSync;
  selectMembershipsByUser: StatementSync;
  selectMembership: StatementSync;
  updateMembershipRole: StatementSync;
  deleteMembership: StatementSync;
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    auth_method TEXT NOT NULL DEFAULT 'password',
    mfa_enabled INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS memberships (
    user_id TEXT NOT NULL REFERENCES users(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    team_id TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    PRIMARY KEY (user_id, tenant_id)
  );

  CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type TenantStore = {
  // Tenants
  createTenant(input: {
    name: string;
    slug: string;
    plan?: string;
    settings?: Partial<TenantSettings>;
  }): Tenant;
  getTenant(id: TenantId): Tenant | null;
  getTenantBySlug(slug: string): Tenant | null;
  listTenants(): Tenant[];
  updateTenant(
    id: TenantId,
    patch: Partial<Pick<Tenant, "name" | "slug" | "plan" | "status" | "settings">>,
  ): Tenant | null;
  deleteTenant(id: TenantId): boolean;

  // Users
  createUser(input: {
    email: string;
    name: string;
    authMethod?: string;
    passwordHash?: string;
  }): User;
  getUser(id: UserId): User | null;
  getUserByEmail(email: string): User | null;
  updateUser(
    id: UserId,
    patch: Partial<Pick<User, "name" | "email" | "status" | "mfaEnabled" | "avatarUrl">>,
  ): User | null;
  updateLastLogin(id: UserId): void;
  getPasswordHash(id: UserId): string | null;
  setPasswordHash(id: UserId, hash: string): void;

  // Memberships
  addMembership(
    userId: UserId,
    tenantId: TenantId,
    role: TenantRole,
    teamId?: string,
  ): TenantMembership;
  getMembership(userId: UserId, tenantId: TenantId): TenantMembership | null;
  listTenantMembers(tenantId: TenantId): (TenantMembership & { user: User })[];
  listUserTenants(userId: UserId): (TenantMembership & { tenant: Tenant })[];
  updateMembershipRole(userId: UserId, tenantId: TenantId, role: TenantRole): boolean;
  removeMembership(userId: UserId, tenantId: TenantId): boolean;

  close(): void;
};

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function tenantFromRow(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan as Tenant["plan"],
    status: row.status as Tenant["status"],
    settings: JSON.parse(row.settings_json) as TenantSettings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url ?? undefined,
    status: row.status as User["status"],
    authMethod: row.auth_method as User["authMethod"],
    mfaEnabled: row.mfa_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

function membershipFromRow(row: MembershipRow): TenantMembership {
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    teamId: row.team_id ?? undefined,
    role: row.role as TenantRole,
    joinedAt: row.joined_at,
  };
}

// Alias-aware mappers for JOIN results where column names are prefixed
type UserJoinRow = {
  uid: string;
  email: string;
  uname: string;
  avatar_url: string | null;
  ustatus: string;
  auth_method: string;
  mfa_enabled: number;
  ucreated: string;
  uupdated: string;
  last_login_at: string | null;
};

function userFromJoinRow(row: UserJoinRow): User {
  return {
    id: row.uid,
    email: row.email,
    name: row.uname,
    avatarUrl: row.avatar_url ?? undefined,
    status: row.ustatus as User["status"],
    authMethod: row.auth_method as User["authMethod"],
    mfaEnabled: row.mfa_enabled === 1,
    createdAt: row.ucreated,
    updatedAt: row.uupdated,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

type TenantJoinRow = {
  tid2: string;
  tname: string;
  slug: string;
  plan: string;
  tstatus: string;
  settings_json: string;
  tcreated: string;
  tupdated: string;
};

function tenantFromJoinRow(row: TenantJoinRow): Tenant {
  return {
    id: row.tid2,
    name: row.tname,
    slug: row.slug,
    plan: row.plan as Tenant["plan"],
    status: row.tstatus as Tenant["status"],
    settings: JSON.parse(row.settings_json) as TenantSettings,
    createdAt: row.tcreated,
    updatedAt: row.tupdated,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTenantStore(dbPath: string): TenantStore {
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const { DatabaseSync: SqliteDb } = requireNodeSqlite();
  const db: DatabaseSync = new SqliteDb(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  const stmts: PlatformStatements = {
    insertTenant: db.prepare(
      "INSERT INTO tenants (id, name, slug, plan, status, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
    ),
    selectTenantById: db.prepare("SELECT * FROM tenants WHERE id = ?"),
    selectTenantBySlug: db.prepare("SELECT * FROM tenants WHERE slug = ?"),
    selectAllTenants: db.prepare("SELECT * FROM tenants WHERE status != 'archived' ORDER BY name"),
    updateTenant: db.prepare(
      "UPDATE tenants SET name = ?, slug = ?, plan = ?, status = ?, settings_json = ?, updated_at = ? WHERE id = ?",
    ),
    deleteTenant: db.prepare("UPDATE tenants SET status = 'archived', updated_at = ? WHERE id = ?"),

    insertUser: db.prepare(
      "INSERT INTO users (id, email, name, status, auth_method, mfa_enabled, password_hash, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, 0, ?, ?, ?)",
    ),
    selectUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
    selectUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
    updateUser: db.prepare(
      "UPDATE users SET name = ?, email = ?, status = ?, mfa_enabled = ?, avatar_url = ?, updated_at = ? WHERE id = ?",
    ),
    updateLastLogin: db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?"),
    selectPasswordHash: db.prepare("SELECT password_hash FROM users WHERE id = ?"),
    updatePasswordHash: db.prepare(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    ),

    insertMembership: db.prepare(
      "INSERT INTO memberships (user_id, tenant_id, team_id, role, joined_at) VALUES (?, ?, ?, ?, ?)",
    ),
    selectMembershipsByTenant: db.prepare(
      "SELECT m.*, u.id as uid, u.email, u.name as uname, u.avatar_url, u.status as ustatus, u.auth_method, u.mfa_enabled, u.created_at as ucreated, u.updated_at as uupdated, u.last_login_at FROM memberships m JOIN users u ON m.user_id = u.id WHERE m.tenant_id = ?",
    ),
    selectMembershipsByUser: db.prepare(
      "SELECT m.*, t.id as tid2, t.name as tname, t.slug, t.plan, t.status as tstatus, t.settings_json, t.created_at as tcreated, t.updated_at as tupdated FROM memberships m JOIN tenants t ON m.tenant_id = t.id WHERE m.user_id = ?",
    ),
    selectMembership: db.prepare("SELECT * FROM memberships WHERE user_id = ? AND tenant_id = ?"),
    updateMembershipRole: db.prepare(
      "UPDATE memberships SET role = ? WHERE user_id = ? AND tenant_id = ?",
    ),
    deleteMembership: db.prepare("DELETE FROM memberships WHERE user_id = ? AND tenant_id = ?"),
  };

  const now = () => new Date().toISOString();

  return {
    createTenant(input) {
      const id = randomUUID();
      const settings = { ...({} as TenantSettings), ...input.settings };
      const ts = now();
      stmts.insertTenant.run(
        id,
        input.name,
        input.slug,
        input.plan ?? "free",
        JSON.stringify(settings),
        ts,
        ts,
      );
      return this.getTenant(id)!;
    },

    getTenant(id) {
      const row = stmts.selectTenantById.get(id) as TenantRow | undefined;
      return row ? tenantFromRow(row) : null;
    },

    getTenantBySlug(slug) {
      const row = stmts.selectTenantBySlug.get(slug) as TenantRow | undefined;
      return row ? tenantFromRow(row) : null;
    },

    listTenants() {
      const rows = stmts.selectAllTenants.all() as TenantRow[];
      return rows.map(tenantFromRow);
    },

    updateTenant(id, patch) {
      const existing = this.getTenant(id);
      if (!existing) {
        return null;
      }
      const updated = {
        name: patch.name ?? existing.name,
        slug: patch.slug ?? existing.slug,
        plan: patch.plan ?? existing.plan,
        status: patch.status ?? existing.status,
        settings: patch.settings ? { ...existing.settings, ...patch.settings } : existing.settings,
      };
      stmts.updateTenant.run(
        updated.name,
        updated.slug,
        updated.plan,
        updated.status,
        JSON.stringify(updated.settings),
        now(),
        id,
      );
      return this.getTenant(id);
    },

    deleteTenant(id) {
      const result = stmts.deleteTenant.run(now(), id);
      return (result as { changes: number }).changes > 0;
    },

    createUser(input) {
      const id = randomUUID();
      const ts = now();
      stmts.insertUser.run(
        id,
        input.email,
        input.name,
        input.authMethod ?? "password",
        input.passwordHash ?? null,
        ts,
        ts,
      );
      return this.getUser(id)!;
    },

    getUser(id) {
      const row = stmts.selectUserById.get(id) as UserRow | undefined;
      return row ? userFromRow(row) : null;
    },

    getUserByEmail(email) {
      const row = stmts.selectUserByEmail.get(email) as UserRow | undefined;
      return row ? userFromRow(row) : null;
    },

    updateUser(id, patch) {
      const existing = this.getUser(id);
      if (!existing) {
        return null;
      }
      stmts.updateUser.run(
        patch.name ?? existing.name,
        patch.email ?? existing.email,
        patch.status ?? existing.status,
        (patch.mfaEnabled ?? existing.mfaEnabled) ? 1 : 0,
        patch.avatarUrl ?? existing.avatarUrl ?? null,
        now(),
        id,
      );
      return this.getUser(id);
    },

    updateLastLogin(id) {
      stmts.updateLastLogin.run(now(), id);
    },

    getPasswordHash(id) {
      const row = stmts.selectPasswordHash.get(id) as { password_hash: string | null } | undefined;
      return row?.password_hash ?? null;
    },

    setPasswordHash(id, hash) {
      stmts.updatePasswordHash.run(hash, now(), id);
    },

    addMembership(userId, tenantId, role, teamId) {
      const ts = now();
      stmts.insertMembership.run(userId, tenantId, teamId ?? null, role, ts);
      return { userId, tenantId, teamId, role, joinedAt: ts };
    },

    getMembership(userId, tenantId) {
      const row = stmts.selectMembership.get(userId, tenantId) as MembershipRow | undefined;
      return row ? membershipFromRow(row) : null;
    },

    listTenantMembers(tenantId) {
      const rows = stmts.selectMembershipsByTenant.all(tenantId) as (MembershipRow & UserJoinRow)[];
      return rows.map((row) =>
        Object.assign(membershipFromRow(row), { user: userFromJoinRow(row) }),
      );
    },

    listUserTenants(userId) {
      const rows = stmts.selectMembershipsByUser.all(userId) as (MembershipRow & TenantJoinRow)[];
      return rows.map((row) =>
        Object.assign(membershipFromRow(row), { tenant: tenantFromJoinRow(row) }),
      );
    },

    updateMembershipRole(userId, tenantId, role) {
      const result = stmts.updateMembershipRole.run(role, userId, tenantId);
      return (result as { changes: number }).changes > 0;
    },

    removeMembership(userId, tenantId) {
      const result = stmts.deleteMembership.run(userId, tenantId);
      return (result as { changes: number }).changes > 0;
    },

    close() {
      db.close();
    },
  };
}
