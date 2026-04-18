import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuditLogger, type AuditLogger } from "./logger.js";

describe("audit logger", () => {
  let tmpDir: string;
  let logger: AuditLogger;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
    logger = createAuditLogger(path.join(tmpDir, "audit.db"));
  });

  afterEach(() => {
    logger.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------- log ----------

  describe("log", () => {
    it("writes an audit event and returns it", () => {
      const event = logger.log({
        tenantId: "t-1",
        userId: "u-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      expect(typeof event.id).toBe("string");
      expect(typeof event.timestamp).toBe("string");
      expect(event.tenantId).toBe("t-1");
      expect(event.userId).toBe("u-1");
      expect(event.action).toBe("auth.login");
      expect(event.resource).toBe("session");
      expect(event.outcome).toBe("success");
    });

    it("stores optional metadata", () => {
      const event = logger.log({
        tenantId: "t-1",
        action: "tool.invoked",
        resource: "gmail",
        outcome: "success",
        metadata: { toolName: "gmail.send", durationMs: 350 },
      });
      expect(event.metadata).toEqual({ toolName: "gmail.send", durationMs: 350 });
    });

    it("stores IP and user agent", () => {
      const event = logger.log({
        tenantId: "t-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });
      expect(event.ip).toBe("192.168.1.1");
      expect(event.userAgent).toBe("Mozilla/5.0");
    });

    it("handles missing optional fields", () => {
      const event = logger.log({
        tenantId: "t-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      expect(event.userId).toBeUndefined();
      expect(event.resourceId).toBeUndefined();
      expect(event.metadata).toBeUndefined();
      expect(event.ip).toBeUndefined();
      expect(event.userAgent).toBeUndefined();
    });
  });

  // ---------- query ----------

  describe("query", () => {
    it("queries events by tenant", () => {
      logger.log({
        tenantId: "t-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-2",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        action: "auth.logout",
        resource: "session",
        outcome: "success",
      });

      const result = logger.query("t-1", {}, 0, 100);
      expect(result.total).toBe(2);
      expect(result.events.length).toBe(2);
      expect(result.events.every((e) => e.tenantId === "t-1")).toBe(true);
    });

    it("filters by action", () => {
      logger.log({
        tenantId: "t-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        action: "auth.logout",
        resource: "session",
        outcome: "success",
      });

      const result = logger.query("t-1", { action: "auth.login" }, 0, 100);
      expect(result.total).toBe(1);
      expect(result.events[0].action).toBe("auth.login");
    });

    it("filters by userId", () => {
      logger.log({
        tenantId: "t-1",
        userId: "u-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        userId: "u-2",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });

      const result = logger.query("t-1", { userId: "u-1" }, 0, 100);
      expect(result.total).toBe(1);
      expect(result.events[0].userId).toBe("u-1");
    });

    it("filters by outcome", () => {
      logger.log({
        tenantId: "t-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        action: "auth.login_failed",
        resource: "session",
        outcome: "failure",
      });

      const result = logger.query("t-1", { outcome: "failure" }, 0, 100);
      expect(result.total).toBe(1);
      expect(result.events[0].outcome).toBe("failure");
    });

    it("filters by resource", () => {
      logger.log({
        tenantId: "t-1",
        action: "tool.invoked",
        resource: "gmail",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        action: "tool.invoked",
        resource: "slack",
        outcome: "success",
      });

      const result = logger.query("t-1", { resource: "gmail" }, 0, 100);
      expect(result.total).toBe(1);
      expect(result.events[0].resource).toBe("gmail");
    });

    it("supports pagination with offset and limit", () => {
      for (let i = 0; i < 5; i++) {
        logger.log({
          tenantId: "t-1",
          action: "auth.login",
          resource: "session",
          outcome: "success",
        });
      }

      const page1 = logger.query("t-1", {}, 0, 2);
      expect(page1.total).toBe(5);
      expect(page1.events.length).toBe(2);

      const page2 = logger.query("t-1", {}, 2, 2);
      expect(page2.total).toBe(5);
      expect(page2.events.length).toBe(2);
    });

    it("orders by timestamp descending", () => {
      logger.log({
        tenantId: "t-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        action: "auth.logout",
        resource: "session",
        outcome: "success",
      });

      const result = logger.query("t-1", {}, 0, 100);
      const timestamps = result.events.map((e) => e.timestamp);
      expect(timestamps[0] >= timestamps[1]).toBe(true);
    });

    it("returns empty for unknown tenant", () => {
      const result = logger.query("unknown", {}, 0, 100);
      expect(result.total).toBe(0);
      expect(result.events).toHaveLength(0);
    });

    it("combines multiple filters", () => {
      logger.log({
        tenantId: "t-1",
        userId: "u-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        userId: "u-1",
        action: "auth.login_failed",
        resource: "session",
        outcome: "failure",
      });
      logger.log({
        tenantId: "t-1",
        userId: "u-2",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });

      const result = logger.query("t-1", { userId: "u-1", outcome: "success" }, 0, 100);
      expect(result.total).toBe(1);
    });
  });

  // ---------- count ----------

  describe("count", () => {
    it("counts all events for a tenant", () => {
      logger.log({
        tenantId: "t-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        action: "auth.logout",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-2",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });

      expect(logger.count("t-1")).toBe(2);
      expect(logger.count("t-2")).toBe(1);
      expect(logger.count("t-3")).toBe(0);
    });

    it("counts with filters", () => {
      logger.log({
        tenantId: "t-1",
        action: "auth.login",
        resource: "session",
        outcome: "success",
      });
      logger.log({
        tenantId: "t-1",
        action: "auth.login_failed",
        resource: "session",
        outcome: "failure",
      });

      expect(logger.count("t-1", { outcome: "success" })).toBe(1);
    });
  });

  // ---------- metadata round-trip ----------

  describe("metadata", () => {
    it("round-trips complex metadata through JSON", () => {
      const metadata = {
        nested: { key: "value" },
        array: [1, 2, 3],
        boolean: true,
        nullValue: null,
      };
      logger.log({
        tenantId: "t-1",
        action: "config.updated",
        resource: "settings",
        outcome: "success",
        metadata,
      });

      const result = logger.query("t-1", {}, 0, 1);
      expect(result.events[0].metadata).toEqual(metadata);
    });
  });
});
