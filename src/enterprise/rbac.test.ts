import { describe, expect, it } from "vitest";
import {
  canAccessTool,
  canManageRole,
  getPermissionsForRole,
  hasPermission,
  isRoleAtLeast,
  PermissionDeniedError,
  requirePermission,
} from "./rbac.js";
import type { TenantRole } from "./types.js";

describe("rbac", () => {
  // ---------- getPermissionsForRole ----------

  describe("getPermissionsForRole", () => {
    it("returns permissions for guest", () => {
      const perms = getPermissionsForRole("guest");
      expect(perms.length).toBeGreaterThan(0);
      expect(perms.some((p) => p.resource === "conversation" && p.action === "read")).toBe(true);
    });

    it("member inherits guest permissions", () => {
      const guestPerms = getPermissionsForRole("guest");
      const memberPerms = getPermissionsForRole("member");
      for (const gp of guestPerms) {
        expect(memberPerms.some((p) => p.resource === gp.resource && p.action === gp.action)).toBe(
          true,
        );
      }
    });

    it("admin inherits member permissions", () => {
      const memberPerms = getPermissionsForRole("member");
      const adminPerms = getPermissionsForRole("admin");
      for (const mp of memberPerms) {
        expect(adminPerms.some((p) => p.resource === mp.resource && p.action === mp.action)).toBe(
          true,
        );
      }
    });

    it("owner inherits admin permissions", () => {
      const adminPerms = getPermissionsForRole("admin");
      const ownerPerms = getPermissionsForRole("owner");
      for (const ap of adminPerms) {
        expect(ownerPerms.some((p) => p.resource === ap.resource && p.action === ap.action)).toBe(
          true,
        );
      }
    });

    it("each higher role has more permissions", () => {
      const guest = getPermissionsForRole("guest").length;
      const member = getPermissionsForRole("member").length;
      const admin = getPermissionsForRole("admin").length;
      const owner = getPermissionsForRole("owner").length;
      expect(member).toBeGreaterThan(guest);
      expect(admin).toBeGreaterThan(member);
      expect(owner).toBeGreaterThan(admin);
    });
  });

  // ---------- hasPermission ----------

  describe("hasPermission", () => {
    it("guest can read conversations", () => {
      expect(hasPermission("guest", "conversation", "read")).toBe(true);
    });

    it("guest cannot create conversations", () => {
      expect(hasPermission("guest", "conversation", "create")).toBe(false);
    });

    it("member can create conversations", () => {
      expect(hasPermission("member", "conversation", "create")).toBe(true);
    });

    it("member can invoke tools", () => {
      expect(hasPermission("member", "tool", "invoke")).toBe(true);
    });

    it("member cannot manage users", () => {
      expect(hasPermission("member", "user", "manage")).toBe(false);
    });

    it("admin can manage users", () => {
      expect(hasPermission("admin", "user", "manage")).toBe(true);
    });

    it("admin cannot manage tenants", () => {
      expect(hasPermission("admin", "tenant", "manage")).toBe(false);
    });

    it("owner can manage tenants", () => {
      expect(hasPermission("owner", "tenant", "manage")).toBe(true);
    });

    it("owner can do everything admin can", () => {
      expect(hasPermission("owner", "config", "update")).toBe(true);
      expect(hasPermission("owner", "audit", "read")).toBe(true);
      expect(hasPermission("owner", "integration", "manage")).toBe(true);
    });
  });

  // ---------- isRoleAtLeast ----------

  describe("isRoleAtLeast", () => {
    it("owner is at least owner", () => {
      expect(isRoleAtLeast("owner", "owner")).toBe(true);
    });

    it("owner is at least guest", () => {
      expect(isRoleAtLeast("owner", "guest")).toBe(true);
    });

    it("guest is not at least member", () => {
      expect(isRoleAtLeast("guest", "member")).toBe(false);
    });

    it("admin is at least member", () => {
      expect(isRoleAtLeast("admin", "member")).toBe(true);
    });

    it("member is at least member", () => {
      expect(isRoleAtLeast("member", "member")).toBe(true);
    });
  });

  // ---------- canManageRole ----------

  describe("canManageRole", () => {
    it("owner can manage admin", () => {
      expect(canManageRole("owner", "admin")).toBe(true);
    });

    it("admin can manage member", () => {
      expect(canManageRole("admin", "member")).toBe(true);
    });

    it("admin cannot manage admin (same level)", () => {
      expect(canManageRole("admin", "admin")).toBe(false);
    });

    it("member cannot manage admin", () => {
      expect(canManageRole("member", "admin")).toBe(false);
    });

    it("guest cannot manage anyone", () => {
      expect(canManageRole("guest", "guest")).toBe(false);
    });
  });

  // ---------- requirePermission ----------

  describe("requirePermission", () => {
    it("does not throw when permission is granted", () => {
      expect(() => requirePermission("admin", "user", "manage")).not.toThrow();
    });

    it("throws PermissionDeniedError when permission is denied", () => {
      expect(() => requirePermission("guest", "user", "manage")).toThrow(PermissionDeniedError);
    });

    it("error contains role, resource, and action", () => {
      try {
        requirePermission("guest", "tenant", "delete");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(PermissionDeniedError);
        const err = e as PermissionDeniedError;
        expect(err.role).toBe("guest");
        expect(err.resource).toBe("tenant");
        expect(err.action).toBe("delete");
        expect(err.message).toContain("guest");
        expect(err.message).toContain("tenant");
        expect(err.message).toContain("delete");
      }
    });
  });

  // ---------- canAccessTool ----------

  describe("canAccessTool", () => {
    it("guest can access web_search (default policy)", () => {
      expect(canAccessTool("guest", "web_search")).toBe(true);
    });

    it("guest cannot access gmail (default policy)", () => {
      expect(canAccessTool("guest", "gmail")).toBe(false);
    });

    it("member can access gmail (default policy)", () => {
      expect(canAccessTool("member", "gmail")).toBe(true);
    });

    it("unknown tools are denied by default (fail-closed)", () => {
      expect(canAccessTool("owner", "unknown_tool")).toBe(false);
      expect(canAccessTool("member", "unknown_tool")).toBe(false);
      expect(canAccessTool("guest", "unknown_tool")).toBe(false);
    });

    it("accepts custom policies", () => {
      const policies = [{ tool: "custom_tool", allowedRoles: ["owner" as TenantRole] }];
      expect(canAccessTool("owner", "custom_tool", policies)).toBe(true);
      expect(canAccessTool("admin", "custom_tool", policies)).toBe(false);
    });
  });
});
