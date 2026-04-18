/**
 * Immutable audit log writer.
 *
 * Records all significant actions (auth events, tool invocations,
 * config changes, data access) to an append-only SQLite table.
 * Each tenant gets audit entries in the platform database.
 *
 * Design:
 * - Append-only: no UPDATE or DELETE on audit_log table
 * - Structured metadata: JSON for action-specific details
 * - Indexed: by timestamp, userId, action for efficient queries
 */

import { randomUUID } from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { requireNodeSqlite } from "../../infra/node-sqlite.js";
import type { AuditAction, AuditEvent, AuditOutcome, TenantId, UserId } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditLogInput = {
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

export type AuditQueryFilters = {
  userId?: UserId;
  action?: AuditAction;
  resource?: string;
  outcome?: AuditOutcome;
  startDate?: string;
  endDate?: string;
};

export type AuditQueryResult = {
  events: AuditEvent[];
  total: number;
};

export type AuditLogger = {
  log(input: AuditLogInput): AuditEvent;
  query(
    tenantId: TenantId,
    filters: AuditQueryFilters,
    offset: number,
    limit: number,
  ): AuditQueryResult;
  count(tenantId: TenantId, filters?: AuditQueryFilters): number;
  close(): void;
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const AUDIT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id TEXT,
    outcome TEXT NOT NULL,
    metadata_json TEXT,
    ip TEXT,
    user_agent TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
  CREATE INDEX IF NOT EXISTS idx_audit_tenant_timestamp ON audit_log(tenant_id, timestamp);
`;

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

type AuditRow = {
  id: string;
  timestamp: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  outcome: string;
  metadata_json: string | null;
  ip: string | null;
  user_agent: string | null;
};

function eventFromRow(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    tenantId: row.tenant_id,
    userId: row.user_id ?? undefined,
    action: row.action as AuditAction,
    resource: row.resource,
    resourceId: row.resource_id ?? undefined,
    outcome: row.outcome as AuditOutcome,
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : undefined,
    ip: row.ip ?? undefined,
    userAgent: row.user_agent ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAuditLogger(dbPath: string): AuditLogger {
  const { DatabaseSync: SqliteDb } = requireNodeSqlite();
  const db: DatabaseSync = new SqliteDb(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(AUDIT_SCHEMA_SQL);

  const insertStmt: StatementSync = db.prepare(
    `INSERT INTO audit_log (id, timestamp, tenant_id, user_id, action, resource, resource_id, outcome, metadata_json, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return {
    log(input) {
      const event: AuditEvent = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        outcome: input.outcome,
        metadata: input.metadata,
        ip: input.ip,
        userAgent: input.userAgent,
      };

      insertStmt.run(
        event.id,
        event.timestamp,
        event.tenantId,
        event.userId ?? null,
        event.action,
        event.resource,
        event.resourceId ?? null,
        event.outcome,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.ip ?? null,
        event.userAgent ?? null,
      );

      return event;
    },

    query(tenantId, filters, offset, limit) {
      const conditions = ["tenant_id = ?"];
      const params: unknown[] = [tenantId];

      if (filters.userId) {
        conditions.push("user_id = ?");
        params.push(filters.userId);
      }
      if (filters.action) {
        conditions.push("action = ?");
        params.push(filters.action);
      }
      if (filters.resource) {
        conditions.push("resource = ?");
        params.push(filters.resource);
      }
      if (filters.outcome) {
        conditions.push("outcome = ?");
        params.push(filters.outcome);
      }
      if (filters.startDate) {
        conditions.push("timestamp >= ?");
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        conditions.push("timestamp <= ?");
        params.push(filters.endDate);
      }

      const where = conditions.join(" AND ");

      const countStmt = db.prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE ${where}`);
      const countRow = countStmt.get(...params) as { cnt: number | bigint };
      const total = typeof countRow.cnt === "bigint" ? Number(countRow.cnt) : countRow.cnt;

      const selectStmt = db.prepare(
        `SELECT * FROM audit_log WHERE ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      );
      const rows = selectStmt.all(...params, limit, offset) as AuditRow[];

      return {
        events: rows.map(eventFromRow),
        total,
      };
    },

    count(tenantId, filters) {
      if (!filters) {
        const stmt = db.prepare("SELECT COUNT(*) as cnt FROM audit_log WHERE tenant_id = ?");
        const row = stmt.get(tenantId) as { cnt: number | bigint };
        return typeof row.cnt === "bigint" ? Number(row.cnt) : row.cnt;
      }
      return this.query(tenantId, filters, 0, 0).total;
    },

    close() {
      db.close();
    },
  };
}
