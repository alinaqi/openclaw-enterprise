import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolInputError } from "./common.js";

// Mock fetch globally
const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

// Import the module under test (does not exist yet -- RED phase)
import { handleGithubAction } from "./github-actions.js";

describe("handleGithubAction", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.GITHUB_TOKEN = "ghp_test_token_123";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GITHUB_TOKEN;
  });

  // ── Test 1: List open PRs ──
  describe("action: prs", () => {
    it("returns open PRs for an org", async () => {
      // First call: list repos for the org
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "core" }],
      });
      // Second call: list PRs for the repo
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            number: 1,
            title: "Add feature X",
            user: { login: "jonas" },
            state: "open",
            requested_reviewers: [{ login: "leo" }],
            created_at: "2026-02-10T10:00:00Z",
            changed_files: 5,
          },
        ],
      });

      const result = await handleGithubAction({
        action: "prs",
        org: "protaige",
        state: "open",
      });

      expect(result.details).toBeDefined();
      const details = result.details as { prs: Array<Record<string, unknown>> };
      expect(details.prs).toHaveLength(1);
      expect(details.prs[0]).toMatchObject({
        title: "Add feature X",
        author: "jonas",
        state: "open",
        filesChanged: 5,
      });
    });

    // ── Test 2: PRs filtered by author ──
    it("filters PRs by author", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "core" }],
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            number: 1,
            title: "PR by Jonas",
            user: { login: "jonas" },
            state: "open",
            requested_reviewers: [],
            created_at: "2026-02-10T10:00:00Z",
            changed_files: 2,
          },
          {
            number: 2,
            title: "PR by Leo",
            user: { login: "leo" },
            state: "open",
            requested_reviewers: [],
            created_at: "2026-02-11T10:00:00Z",
            changed_files: 3,
          },
        ],
      });

      const result = await handleGithubAction({
        action: "prs",
        org: "protaige",
        author: "jonas",
      });

      const details = result.details as { prs: Array<Record<string, unknown>> };
      expect(details.prs).toHaveLength(1);
      expect(details.prs[0]).toMatchObject({ author: "jonas" });
    });

    // ── Test 3: PRs filtered by reviewer ──
    it("filters PRs by reviewer", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "core" }],
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            number: 1,
            title: "PR 1",
            user: { login: "jonas" },
            state: "open",
            requested_reviewers: [{ login: "leo" }],
            created_at: "2026-02-10T10:00:00Z",
            changed_files: 2,
          },
          {
            number: 2,
            title: "PR 2",
            user: { login: "jonas" },
            state: "open",
            requested_reviewers: [{ login: "alice" }],
            created_at: "2026-02-11T10:00:00Z",
            changed_files: 3,
          },
        ],
      });

      const result = await handleGithubAction({
        action: "prs",
        org: "protaige",
        reviewer: "leo",
      });

      const details = result.details as { prs: Array<Record<string, unknown>> };
      expect(details.prs).toHaveLength(1);
      expect(details.prs[0]).toMatchObject({ title: "PR 1" });
    });

    // ── Test 4: Default state is open ──
    it("defaults to open state", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "core" }],
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await handleGithubAction({
        action: "prs",
        org: "protaige",
      });

      // Second call (repo PRs) should contain state=open
      const url = fetchMock.mock.calls[1][0] as string;
      expect(url).toContain("state=open");
    });

    // ── Test 13: Invalid org ──
    it("throws ToolInputError for invalid org", async () => {
      await expect(handleGithubAction({ action: "prs", org: "unknown" })).rejects.toThrow(
        ToolInputError,
      );
    });
  });

  // ── Test 5: PR detail ──
  describe("action: pr_detail", () => {
    it("returns full PR detail", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            number: 42,
            title: "Big feature",
            body: "PR description here",
            user: { login: "jonas" },
            state: "open",
            additions: 100,
            deletions: 20,
            changed_files: 8,
            mergeable: true,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ user: { login: "leo" }, state: "APPROVED", body: "LGTM" }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            check_suites: [{ conclusion: "success" }],
          }),
        });

      const result = await handleGithubAction({
        action: "pr_detail",
        org: "protaige",
        repo: "core",
        pr_number: "42",
      });

      const details = result.details as Record<string, unknown>;
      expect(details.title).toBe("Big feature");
      expect(details.description).toBe("PR description here");
      expect(details.reviews).toBeDefined();
      expect(details.diffStats).toBeDefined();
    });

    // ── Test 6: PR detail missing repo ──
    it("throws ToolInputError when repo is missing", async () => {
      await expect(
        handleGithubAction({ action: "pr_detail", org: "protaige", pr_number: "42" }),
      ).rejects.toThrow(ToolInputError);
    });
  });

  // ── Test 7 & 8 & 9: Commits ──
  describe("action: commits", () => {
    it("returns commits since a date", async () => {
      // First call: fetch repos list
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "core" }],
      });
      // Second call: fetch commits for the repo
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            sha: "abc123",
            commit: { message: "Fix bug", author: { name: "Jonas", date: "2026-02-12T10:00:00Z" } },
            author: { login: "jonas" },
            files: [{ filename: "src/index.ts" }],
          },
        ],
      });

      const result = await handleGithubAction({
        action: "commits",
        org: "zenloop",
        since: "2026-02-01T00:00:00Z",
      });

      const details = result.details as { commits: Array<Record<string, unknown>> };
      expect(details.commits).toHaveLength(1);
      expect(details.commits[0]).toMatchObject({
        sha: "abc123",
        message: "Fix bug",
        author: "jonas",
      });
    });

    it("filters commits by author", async () => {
      // First call: fetch repos list
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "core" }],
      });
      // Second call: fetch commits for the repo
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            sha: "a1",
            commit: {
              message: "By Jonas",
              author: { name: "Jonas", date: "2026-02-12T10:00:00Z" },
            },
            author: { login: "jonas" },
            files: [],
          },
          {
            sha: "a2",
            commit: { message: "By Leo", author: { name: "Leo", date: "2026-02-12T11:00:00Z" } },
            author: { login: "leo" },
            files: [],
          },
        ],
      });

      const result = await handleGithubAction({
        action: "commits",
        org: "protaige",
        author: "jonas",
      });

      const details = result.details as { commits: Array<Record<string, unknown>> };
      expect(details.commits).toHaveLength(1);
      expect(details.commits[0]).toMatchObject({ author: "jonas" });
    });

    it("fetches commits for a specific repo", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await handleGithubAction({
        action: "commits",
        org: "protaige",
        repo: "core",
      });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/repos/protaige/core/commits");
    });
  });

  // ── Tests 10, 11, 12: Search ──
  describe("action: search", () => {
    it("searches PRs", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              title: "Bugfix PR",
              html_url: "https://github.com/protaige/core/pull/1",
              state: "open",
            },
          ],
          total_count: 1,
        }),
      });

      const result = await handleGithubAction({
        action: "search",
        org: "protaige",
        query: "bugfix",
        type: "prs",
      });

      const details = result.details as {
        results: Array<Record<string, unknown>>;
        totalCount: number;
      };
      expect(details.results).toHaveLength(1);
      expect(details.totalCount).toBe(1);
    });

    it("searches code", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { name: "index.ts", path: "src/index.ts", repository: { full_name: "protaige/core" } },
          ],
          total_count: 1,
        }),
      });

      const result = await handleGithubAction({
        action: "search",
        org: "protaige",
        query: "TODO",
        type: "code",
      });

      const details = result.details as { results: Array<Record<string, unknown>> };
      expect(details.results).toHaveLength(1);
      expect(details.results[0]).toMatchObject({ path: "src/index.ts" });
    });

    it("searches issues", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              title: "Crash on startup",
              html_url: "https://github.com/protaige/core/issues/5",
              state: "open",
            },
          ],
          total_count: 1,
        }),
      });

      const result = await handleGithubAction({
        action: "search",
        org: "protaige",
        query: "crash",
        type: "issues",
      });

      const details = result.details as { results: Array<Record<string, unknown>> };
      expect(details.results).toHaveLength(1);
    });
  });

  // ── Test 14: Missing GitHub token ──
  it("returns error payload when GITHUB_TOKEN is missing", async () => {
    delete process.env.GITHUB_TOKEN;

    const result = await handleGithubAction({
      action: "prs",
      org: "protaige",
    });

    const details = result.details as { error: string };
    expect(details.error).toBeDefined();
    expect(details.error).toContain("missing");
  });

  // ── Test 25: Unknown action ──
  it("throws for unknown action", async () => {
    await expect(handleGithubAction({ action: "nonexistent", org: "protaige" })).rejects.toThrow(
      "Unknown action: nonexistent",
    );
  });
});
