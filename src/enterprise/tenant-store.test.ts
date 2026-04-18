import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTenantStore, type TenantStore } from "./tenant-store.js";

describe("tenant-store", () => {
  let tmpDir: string;
  let store: TenantStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "ent-test-"));
    store = createTenantStore(path.join(tmpDir, "platform.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------- tenants ----------

  describe("tenants", () => {
    it("creates and retrieves a tenant", () => {
      const tenant = store.createTenant({ name: "Acme", slug: "acme" });
      expect(tenant.name).toBe("Acme");
      expect(tenant.slug).toBe("acme");
      expect(tenant.plan).toBe("free");
      expect(tenant.status).toBe("active");
      expect(typeof tenant.id).toBe("string");
      expect(typeof tenant.createdAt).toBe("string");

      const fetched = store.getTenant(tenant.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("Acme");
    });

    it("retrieves a tenant by slug", () => {
      store.createTenant({ name: "Beta Corp", slug: "beta-corp" });
      const tenant = store.getTenantBySlug("beta-corp");
      expect(tenant).not.toBeNull();
      expect(tenant!.name).toBe("Beta Corp");
    });

    it("returns null for missing tenant", () => {
      expect(store.getTenant("nonexistent")).toBeNull();
      expect(store.getTenantBySlug("nope")).toBeNull();
    });

    it("lists all active tenants", () => {
      store.createTenant({ name: "A", slug: "a" });
      store.createTenant({ name: "B", slug: "b" });
      const list = store.listTenants();
      expect(list.length).toBe(2);
    });

    it("updates a tenant", () => {
      const tenant = store.createTenant({ name: "Old", slug: "old" });
      const updated = store.updateTenant(tenant.id, { name: "New", plan: "enterprise" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("New");
      expect(updated!.plan).toBe("enterprise");
      expect(updated!.slug).toBe("old"); // unchanged
    });

    it("soft-deletes a tenant (archives)", () => {
      const tenant = store.createTenant({ name: "ToDelete", slug: "to-delete" });
      const result = store.deleteTenant(tenant.id);
      expect(result).toBe(true);
      const fetched = store.getTenant(tenant.id);
      expect(fetched!.status).toBe("archived");
      // Archived tenants are excluded from listing
      expect(store.listTenants().length).toBe(0);
    });

    it("creates tenant with custom plan and settings", () => {
      const tenant = store.createTenant({
        name: "Enterprise",
        slug: "ent",
        plan: "enterprise",
        settings: { maxUsers: 100, requireMfa: true },
      });
      expect(tenant.plan).toBe("enterprise");
      expect(tenant.settings.maxUsers).toBe(100);
      expect(tenant.settings.requireMfa).toBe(true);
    });

    it("merges settings on update", () => {
      const tenant = store.createTenant({
        name: "MergeTest",
        slug: "merge",
        settings: { maxUsers: 10 },
      });
      const updated = store.updateTenant(tenant.id, {
        settings: { requireMfa: true },
      });
      expect(updated!.settings.maxUsers).toBe(10);
      expect(updated!.settings.requireMfa).toBe(true);
    });
  });

  // ---------- users ----------

  describe("users", () => {
    it("creates and retrieves a user", () => {
      const user = store.createUser({ email: "alice@acme.com", name: "Alice" });
      expect(user.email).toBe("alice@acme.com");
      expect(user.name).toBe("Alice");
      expect(user.status).toBe("active");
      expect(user.authMethod).toBe("password");
      expect(user.mfaEnabled).toBe(false);

      const fetched = store.getUser(user.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.email).toBe("alice@acme.com");
    });

    it("retrieves a user by email", () => {
      store.createUser({ email: "bob@acme.com", name: "Bob" });
      const user = store.getUserByEmail("bob@acme.com");
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Bob");
    });

    it("returns null for missing user", () => {
      expect(store.getUser("nonexistent")).toBeNull();
      expect(store.getUserByEmail("nobody@acme.com")).toBeNull();
    });

    it("updates a user", () => {
      const user = store.createUser({ email: "carol@acme.com", name: "Carol" });
      const updated = store.updateUser(user.id, { name: "Carol Updated", mfaEnabled: true });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Carol Updated");
      expect(updated!.mfaEnabled).toBe(true);
    });

    it("updates last login timestamp", () => {
      const user = store.createUser({ email: "dave@acme.com", name: "Dave" });
      expect(user.lastLoginAt).toBeUndefined();
      store.updateLastLogin(user.id);
      const fetched = store.getUser(user.id);
      expect(fetched!.lastLoginAt).toBeDefined();
    });

    it("manages password hashes", () => {
      const user = store.createUser({
        email: "eve@acme.com",
        name: "Eve",
        passwordHash: "initial-hash",
      });
      expect(store.getPasswordHash(user.id)).toBe("initial-hash");
      store.setPasswordHash(user.id, "new-hash");
      expect(store.getPasswordHash(user.id)).toBe("new-hash");
    });

    it("creates user with custom auth method", () => {
      const user = store.createUser({
        email: "frank@acme.com",
        name: "Frank",
        authMethod: "oidc",
      });
      expect(user.authMethod).toBe("oidc");
    });
  });

  // ---------- memberships ----------

  describe("memberships", () => {
    it("adds a membership and retrieves it", () => {
      const tenant = store.createTenant({ name: "Org", slug: "org" });
      const user = store.createUser({ email: "member@org.com", name: "Member" });
      const membership = store.addMembership(user.id, tenant.id, "member");
      expect(membership.userId).toBe(user.id);
      expect(membership.tenantId).toBe(tenant.id);
      expect(membership.role).toBe("member");
      expect(typeof membership.joinedAt).toBe("string");
    });

    it("retrieves a specific membership", () => {
      const tenant = store.createTenant({ name: "Org2", slug: "org2" });
      const user = store.createUser({ email: "admin@org2.com", name: "Admin" });
      store.addMembership(user.id, tenant.id, "admin");
      const membership = store.getMembership(user.id, tenant.id);
      expect(membership).not.toBeNull();
      expect(membership!.role).toBe("admin");
    });

    it("returns null for missing membership", () => {
      expect(store.getMembership("no-user", "no-tenant")).toBeNull();
    });

    it("lists tenant members with user details", () => {
      const tenant = store.createTenant({ name: "Team", slug: "team" });
      const u1 = store.createUser({ email: "a@team.com", name: "A" });
      const u2 = store.createUser({ email: "b@team.com", name: "B" });
      store.addMembership(u1.id, tenant.id, "owner");
      store.addMembership(u2.id, tenant.id, "member");
      const members = store.listTenantMembers(tenant.id);
      expect(members.length).toBe(2);
      expect(members.every((m) => m.user !== undefined)).toBe(true);
    });

    it("lists user tenants with tenant details", () => {
      const user = store.createUser({ email: "multi@org.com", name: "Multi" });
      const t1 = store.createTenant({ name: "Org1", slug: "org1" });
      const t2 = store.createTenant({ name: "Org2b", slug: "org2b" });
      store.addMembership(user.id, t1.id, "member");
      store.addMembership(user.id, t2.id, "admin");
      const tenants = store.listUserTenants(user.id);
      expect(tenants.length).toBe(2);
      expect(tenants.every((t) => t.tenant !== undefined)).toBe(true);
    });

    it("updates membership role", () => {
      const tenant = store.createTenant({ name: "Promote", slug: "promote" });
      const user = store.createUser({ email: "promo@test.com", name: "Promo" });
      store.addMembership(user.id, tenant.id, "member");
      const result = store.updateMembershipRole(user.id, tenant.id, "admin");
      expect(result).toBe(true);
      const membership = store.getMembership(user.id, tenant.id);
      expect(membership!.role).toBe("admin");
    });

    it("removes a membership", () => {
      const tenant = store.createTenant({ name: "Remove", slug: "remove" });
      const user = store.createUser({ email: "remove@test.com", name: "Remove" });
      store.addMembership(user.id, tenant.id, "member");
      const result = store.removeMembership(user.id, tenant.id);
      expect(result).toBe(true);
      expect(store.getMembership(user.id, tenant.id)).toBeNull();
    });

    it("removeMembership returns false for non-existent", () => {
      expect(store.removeMembership("no-user", "no-tenant")).toBe(false);
    });

    it("adds membership with team ID", () => {
      const tenant = store.createTenant({ name: "WithTeam", slug: "with-team" });
      const user = store.createUser({ email: "team@test.com", name: "TeamMember" });
      const membership = store.addMembership(user.id, tenant.id, "member", "team-1");
      expect(membership.teamId).toBe("team-1");
    });
  });
});
