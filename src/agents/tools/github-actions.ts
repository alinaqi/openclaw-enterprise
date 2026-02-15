import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { ToolInputError, jsonResult, readStringParam } from "./common.js";

const VALID_ORGS = new Set(["protaige", "zenloop"]);
const GITHUB_API = "https://api.github.com";

function resolveToken(): string | undefined {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token || undefined;
}

function validateOrg(org: string): void {
  if (!VALID_ORGS.has(org)) {
    throw new ToolInputError(`Invalid org: ${org}. Must be one of: ${[...VALID_ORGS].join(", ")}`);
  }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

type GithubPR = {
  number: number;
  title: string;
  user: { login: string };
  state: string;
  requested_reviewers: Array<{ login: string }>;
  created_at: string;
  changed_files: number;
};

function mapPr(pr: GithubPR) {
  return {
    number: pr.number,
    title: pr.title,
    author: pr.user?.login,
    state: pr.state,
    reviewStatus: pr.requested_reviewers?.map((r) => r.login),
    age: pr.created_at,
    filesChanged: pr.changed_files,
  };
}

async function handlePrs(
  params: Record<string, unknown>,
  token: string,
): Promise<AgentToolResult<unknown>> {
  const org = readStringParam(params, "org", { required: true });
  validateOrg(org);
  const state = readStringParam(params, "state") ?? "open";
  const author = readStringParam(params, "author");
  const reviewer = readStringParam(params, "reviewer");
  const repo = readStringParam(params, "repo");

  const baseUrl = repo
    ? `${GITHUB_API}/repos/${org}/${repo}/pulls`
    : `${GITHUB_API}/orgs/${org}/repos`;

  if (repo) {
    const url = `${baseUrl}?state=${state}&per_page=100`;
    const res = await fetch(url, { headers: githubHeaders(token) });
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status})`);
    }
    let prs = ((await res.json()) as GithubPR[]).map(mapPr);
    if (author) {
      prs = prs.filter((pr) => pr.author === author);
    }
    if (reviewer) {
      prs = prs.filter((pr) => pr.reviewStatus?.includes(reviewer));
    }
    return jsonResult({ prs });
  }

  // No specific repo: fetch repos then PRs
  const reposRes = await fetch(`${baseUrl}?per_page=100`, { headers: githubHeaders(token) });
  if (!reposRes.ok) {
    throw new Error(`GitHub API error (${reposRes.status})`);
  }
  const repos = (await reposRes.json()) as Array<{ name: string }>;
  const allPrs: ReturnType<typeof mapPr>[] = [];
  for (const r of repos) {
    const url = `${GITHUB_API}/repos/${org}/${r.name}/pulls?state=${state}&per_page=100`;
    const res = await fetch(url, { headers: githubHeaders(token) });
    if (res.ok) {
      const raw = (await res.json()) as GithubPR[];
      allPrs.push(...raw.map(mapPr));
    }
  }
  let filtered = allPrs;
  if (author) {
    filtered = filtered.filter((pr) => pr.author === author);
  }
  if (reviewer) {
    filtered = filtered.filter((pr) => pr.reviewStatus?.includes(reviewer));
  }
  return jsonResult({ prs: filtered });
}

async function handlePrDetail(
  params: Record<string, unknown>,
  token: string,
): Promise<AgentToolResult<unknown>> {
  const org = readStringParam(params, "org", { required: true });
  validateOrg(org);
  const repo = readStringParam(params, "repo", { required: true });
  const prNumber = readStringParam(params, "pr_number", { required: true });

  const headers = githubHeaders(token);
  const base = `${GITHUB_API}/repos/${org}/${repo}/pulls/${prNumber}`;

  const [prRes, reviewsRes, checksRes] = await Promise.all([
    fetch(base, { headers }),
    fetch(`${base}/reviews`, { headers }),
    fetch(`${GITHUB_API}/repos/${org}/${repo}/commits/HEAD/check-suites`, { headers }),
  ]);

  if (!prRes.ok) {
    throw new Error(`GitHub API error (${prRes.status})`);
  }

  const pr = (await prRes.json()) as Record<string, unknown>;
  const reviews = reviewsRes.ok
    ? ((await reviewsRes.json()) as Array<Record<string, unknown>>)
    : [];
  const checks = checksRes.ok ? ((await checksRes.json()) as Record<string, unknown>) : {};

  const suites = Array.isArray((checks as { check_suites?: unknown }).check_suites)
    ? (checks as { check_suites: Array<{ conclusion?: string }> }).check_suites
    : [];
  const ciStatus = suites.length > 0 ? (suites[0].conclusion ?? "pending") : "unknown";

  return jsonResult({
    number: pr.number,
    title: pr.title,
    description: pr.body,
    author: (pr.user as { login?: string })?.login,
    state: pr.state,
    reviews: reviews.map((r) => ({
      reviewer: (r.user as { login?: string })?.login,
      state: r.state,
      body: r.body,
    })),
    ciStatus,
    diffStats: {
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
    },
    mergeable: pr.mergeable,
  });
}

async function handleCommits(
  params: Record<string, unknown>,
  token: string,
): Promise<AgentToolResult<unknown>> {
  const org = readStringParam(params, "org", { required: true });
  validateOrg(org);
  const repo = readStringParam(params, "repo");
  const since = readStringParam(params, "since");
  const author = readStringParam(params, "author");

  const headers = githubHeaders(token);

  if (repo) {
    const qs = new URLSearchParams();
    if (since) {
      qs.set("since", since);
    }
    if (author) {
      qs.set("author", author);
    }
    qs.set("per_page", "100");
    const url = `${GITHUB_API}/repos/${org}/${repo}/commits?${qs}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status})`);
    }
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    const commits = raw.map(mapCommit);
    return jsonResult({ commits });
  }

  // No repo: fetch all repos then commits
  const reposRes = await fetch(`${GITHUB_API}/orgs/${org}/repos?per_page=100`, { headers });
  if (!reposRes.ok) {
    throw new Error(`GitHub API error (${reposRes.status})`);
  }
  const repos = (await reposRes.json()) as Array<{ name: string }>;
  const allCommits: ReturnType<typeof mapCommit>[] = [];
  for (const r of repos) {
    const qs = new URLSearchParams();
    if (since) {
      qs.set("since", since);
    }
    if (author) {
      qs.set("author", author);
    }
    qs.set("per_page", "100");
    const url = `${GITHUB_API}/repos/${org}/${r.name}/commits?${qs}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const raw = (await res.json()) as Array<Record<string, unknown>>;
      allCommits.push(...raw.map(mapCommit));
    }
  }
  let filtered = allCommits;
  if (author) {
    filtered = filtered.filter((c) => c.author === author);
  }
  return jsonResult({ commits: filtered });
}

function mapCommit(raw: Record<string, unknown>) {
  const commit = raw.commit as
    | { message?: string; author?: { name?: string; date?: string } }
    | undefined;
  const authorObj = raw.author as { login?: string } | undefined;
  const files = Array.isArray(raw.files)
    ? (raw.files as Array<{ filename?: string }>).map((f) => f.filename)
    : [];
  return {
    sha: raw.sha,
    message: commit?.message,
    author: authorObj?.login ?? commit?.author?.name,
    date: commit?.author?.date,
    files,
  };
}

async function handleSearch(
  params: Record<string, unknown>,
  token: string,
): Promise<AgentToolResult<unknown>> {
  const org = readStringParam(params, "org", { required: true });
  validateOrg(org);
  const query = readStringParam(params, "query", { required: true });
  const type = readStringParam(params, "type") ?? "prs";

  const headers = githubHeaders(token);
  const qualifier = `org:${org}`;
  const searchType = type === "prs" ? "issues" : type;
  const typeQualifier = type === "prs" ? " is:pr" : type === "issues" ? " is:issue" : "";
  const q = encodeURIComponent(`${query} ${qualifier}${typeQualifier}`);
  const url = `${GITHUB_API}/search/${searchType === "issues" ? "issues" : searchType}?q=${q}&per_page=30`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status})`);
  }

  const data = (await res.json()) as { items: Array<Record<string, unknown>>; total_count: number };
  const results = (data.items ?? []).map((item) => {
    if (type === "code") {
      return {
        name: item.name,
        path: item.path,
        repo: (item.repository as { full_name?: string })?.full_name,
      };
    }
    return {
      title: item.title,
      url: item.html_url,
      state: item.state,
    };
  });

  return jsonResult({ results, totalCount: data.total_count });
}

export async function handleGithubAction(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const action = readStringParam(params, "action", { required: true });
  const token = resolveToken();

  if (!token) {
    return jsonResult({
      error: "missing_github_token",
      message: "GitHub tools require a GITHUB_TOKEN environment variable.",
    });
  }

  switch (action) {
    case "prs":
      return await handlePrs(params, token);
    case "pr_detail":
      return await handlePrDetail(params, token);
    case "commits":
      return await handleCommits(params, token);
    case "search":
      return await handleSearch(params, token);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
