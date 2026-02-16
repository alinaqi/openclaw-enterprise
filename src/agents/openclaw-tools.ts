import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../config/config.js";
import type { GatewayMessageChannel } from "../utils/message-channel.js";
import type { SandboxFsBridge } from "./sandbox/fs-bridge.js";
import type { AnyAgentTool } from "./tools/common.js";
import { resolvePluginTools } from "../plugins/tools.js";
import { resolveSessionAgentId } from "./agent-scope.js";
import { createAgentsListTool } from "./tools/agents-list-tool.js";
import {
  createAsanaTasksTool,
  createAsanaTaskDetailTool,
  createAsanaProjectsTool,
  createAsanaSearchTool,
  createAsanaSprintStatusTool,
} from "./tools/asana-tools.js";
import { handleBriefingAction } from "./tools/briefing-tool.js";
import { createBrowserTool } from "./tools/browser-tool.js";
import { createCalendarTool } from "./tools/calendar-tool.js";
import { createCanvasTool } from "./tools/canvas-tool.js";
import { createCronTool } from "./tools/cron-tool.js";
import { createGatewayTool } from "./tools/gateway-tool.js";
import { handleGithubAction } from "./tools/github-actions.js";
import { handleGmailAction } from "./tools/gmail-actions.js";
import { createImageTool } from "./tools/image-tool.js";
import { createMessageTool } from "./tools/message-tool.js";
import { handleMondayAction } from "./tools/monday-actions.js";
import { createNodesTool } from "./tools/nodes-tool.js";
import { createSessionStatusTool } from "./tools/session-status-tool.js";
import { createSessionsHistoryTool } from "./tools/sessions-history-tool.js";
import { createSessionsListTool } from "./tools/sessions-list-tool.js";
import { createSessionsSendTool } from "./tools/sessions-send-tool.js";
import { createSessionsSpawnTool } from "./tools/sessions-spawn-tool.js";
import { createSlackReaderTool } from "./tools/slack-reader-tool.js";
import { createSubagentsTool } from "./tools/subagents-tool.js";
import { createTtsTool } from "./tools/tts-tool.js";
import { createWebFetchTool, createWebSearchTool } from "./tools/web-tools.js";
import { resolveWorkspaceRoot } from "./workspace-dir.js";

export function createOpenClawTools(options?: {
  sandboxBrowserBridgeUrl?: string;
  allowHostBrowserControl?: boolean;
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  /** Delivery target (e.g. telegram:group:123:topic:456) for topic/thread routing. */
  agentTo?: string;
  /** Thread/topic identifier for routing replies to the originating thread. */
  agentThreadId?: string | number;
  /** Group id for channel-level tool policy inheritance. */
  agentGroupId?: string | null;
  /** Group channel label for channel-level tool policy inheritance. */
  agentGroupChannel?: string | null;
  /** Group space label for channel-level tool policy inheritance. */
  agentGroupSpace?: string | null;
  agentDir?: string;
  sandboxRoot?: string;
  sandboxFsBridge?: SandboxFsBridge;
  workspaceDir?: string;
  sandboxed?: boolean;
  config?: OpenClawConfig;
  pluginToolAllowlist?: string[];
  /** Current channel ID for auto-threading (Slack). */
  currentChannelId?: string;
  /** Current thread timestamp for auto-threading (Slack). */
  currentThreadTs?: string;
  /** Reply-to mode for Slack auto-threading. */
  replyToMode?: "off" | "first" | "all";
  /** Mutable ref to track if a reply was sent (for "first" mode). */
  hasRepliedRef?: { value: boolean };
  /** If true, the model has native vision capability */
  modelHasVision?: boolean;
  /** Explicit agent ID override for cron/hook sessions. */
  requesterAgentIdOverride?: string;
  /** Require explicit message targets (no implicit last-route sends). */
  requireExplicitMessageTarget?: boolean;
  /** If true, omit the message tool from the tool list. */
  disableMessageTool?: boolean;
}): AnyAgentTool[] {
  const workspaceDir = resolveWorkspaceRoot(options?.workspaceDir);
  const imageTool = options?.agentDir?.trim()
    ? createImageTool({
        config: options?.config,
        agentDir: options.agentDir,
        workspaceDir,
        sandbox:
          options?.sandboxRoot && options?.sandboxFsBridge
            ? { root: options.sandboxRoot, bridge: options.sandboxFsBridge }
            : undefined,
        modelHasVision: options?.modelHasVision,
      })
    : null;
  const webSearchTool = createWebSearchTool({
    config: options?.config,
    sandboxed: options?.sandboxed,
  });
  const webFetchTool = createWebFetchTool({
    config: options?.config,
    sandboxed: options?.sandboxed,
  });
  const messageTool = options?.disableMessageTool
    ? null
    : createMessageTool({
        agentAccountId: options?.agentAccountId,
        agentSessionKey: options?.agentSessionKey,
        config: options?.config,
        currentChannelId: options?.currentChannelId,
        currentChannelProvider: options?.agentChannel,
        currentThreadTs: options?.currentThreadTs,
        replyToMode: options?.replyToMode,
        hasRepliedRef: options?.hasRepliedRef,
        sandboxRoot: options?.sandboxRoot,
        requireExplicitTarget: options?.requireExplicitMessageTarget,
      });
  const tools: AnyAgentTool[] = [
    createBrowserTool({
      sandboxBridgeUrl: options?.sandboxBrowserBridgeUrl,
      allowHostControl: options?.allowHostBrowserControl,
    }),
    createCanvasTool(),
    createNodesTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    createCronTool({
      agentSessionKey: options?.agentSessionKey,
    }),
    ...(messageTool ? [messageTool] : []),
    createTtsTool({
      agentChannel: options?.agentChannel,
      config: options?.config,
    }),
    createGatewayTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    createAgentsListTool({
      agentSessionKey: options?.agentSessionKey,
      requesterAgentIdOverride: options?.requesterAgentIdOverride,
    }),
    createSessionsListTool({
      agentSessionKey: options?.agentSessionKey,
      sandboxed: options?.sandboxed,
    }),
    createSessionsHistoryTool({
      agentSessionKey: options?.agentSessionKey,
      sandboxed: options?.sandboxed,
    }),
    createSessionsSendTool({
      agentSessionKey: options?.agentSessionKey,
      agentChannel: options?.agentChannel,
      sandboxed: options?.sandboxed,
    }),
    createSessionsSpawnTool({
      agentSessionKey: options?.agentSessionKey,
      agentChannel: options?.agentChannel,
      agentAccountId: options?.agentAccountId,
      agentTo: options?.agentTo,
      agentThreadId: options?.agentThreadId,
      agentGroupId: options?.agentGroupId,
      agentGroupChannel: options?.agentGroupChannel,
      agentGroupSpace: options?.agentGroupSpace,
      sandboxed: options?.sandboxed,
      requesterAgentIdOverride: options?.requesterAgentIdOverride,
    }),
    createSubagentsTool({
      agentSessionKey: options?.agentSessionKey,
    }),
    createSessionStatusTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    ...(webSearchTool ? [webSearchTool] : []),
    ...(webFetchTool ? [webFetchTool] : []),
    ...(imageTool ? [imageTool] : []),
    // Leo tools: Calendar, Gmail, GitHub, Monday, Briefing, Slack Reader, Asana
    createCalendarTool({ config: {} }),
    {
      label: "Gmail",
      name: "gmail",
      description: `Manage Gmail across multiple accounts.

ACTIONS:
- read: List recent messages (params: count, label, unreadOnly, accountId)
- get: Get full message by ID (params: messageId, accountId)
- search: Search messages by query (params: query, accountId — use "all" for cross-account)
- send: Send an email (params: to, subject, body, cc, replyToMessageId, accountId)
- draft: Create a draft (params: to, subject, body, replyToMessageId, accountId)
- triage: Auto-categorize inbox (params: accountId — use "all" for cross-account)`,
      parameters: Type.Object({
        action: Type.String(),
        accountId: Type.Optional(Type.String()),
        count: Type.Optional(Type.Number()),
        label: Type.Optional(Type.String()),
        unreadOnly: Type.Optional(Type.Boolean()),
        messageId: Type.Optional(Type.String()),
        query: Type.Optional(Type.String()),
        to: Type.Optional(Type.String()),
        subject: Type.Optional(Type.String()),
        body: Type.Optional(Type.String()),
        cc: Type.Optional(Type.String()),
        replyToMessageId: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => {
        return await handleGmailAction(
          params as Record<string, unknown>,
          options?.config ?? ({} as OpenClawConfig),
        );
      },
    } as AnyAgentTool,
    {
      label: "GitHub",
      name: "github",
      description: `Query GitHub repos for PRs, commits, and code search.

ACTIONS:
- prs: List PRs for an org (params: org, state, author)
- pr_detail: Get PR details (params: org, repo, number)
- commits: Recent commits (params: org, repo, since)
- search: Search code/issues (params: query, org)`,
      parameters: Type.Object({
        action: Type.String(),
        org: Type.Optional(Type.String()),
        repo: Type.Optional(Type.String()),
        number: Type.Optional(Type.Number()),
        state: Type.Optional(Type.String()),
        author: Type.Optional(Type.String()),
        since: Type.Optional(Type.String()),
        query: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => {
        return await handleGithubAction(params as Record<string, unknown>);
      },
    } as AnyAgentTool,
    {
      label: "Monday.com",
      name: "monday",
      description: `Query Monday.com boards, items, and updates.

ACTIONS:
- boards: List all boards (params: board — optional filter)
- items: List items on a board (params: board, status, assignee, limit)
- item_detail: Get item details (params: item_id)
- updates: Get updates/comments (params: item_id, since)`,
      parameters: Type.Object({
        action: Type.String(),
        board: Type.Optional(Type.String()),
        item_id: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        assignee: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Number()),
        since: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => {
        return await handleMondayAction(params as Record<string, unknown>);
      },
    } as AnyAgentTool,
    {
      label: "Briefing",
      name: "briefing",
      description: `Generate automated briefings aggregating across all tools.

ACTIONS:
- morning: Generate a morning briefing (params: sections — optional array of section names)
- weekly: Generate a weekly recap (params: sections — optional array)
- configure: Update briefing settings (params: schedule, sections, timezone)`,
      parameters: Type.Object({
        action: Type.String(),
        sections: Type.Optional(Type.Array(Type.String())),
        schedule: Type.Optional(Type.String()),
        timezone: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => {
        return await handleBriefingAction(params as Record<string, unknown>);
      },
    } as AnyAgentTool,
    ...(() => {
      const slackTool = createSlackReaderTool({ config: options?.config });
      return slackTool ? [slackTool] : [];
    })(),
    ...(() => {
      const asanaOpts = {
        config: options?.config as { tools?: { asana?: import("../asana/types.js").AsanaConfig } },
      };
      return [
        createAsanaTasksTool(asanaOpts),
        createAsanaTaskDetailTool(asanaOpts),
        createAsanaProjectsTool(asanaOpts),
        createAsanaSearchTool(asanaOpts),
        createAsanaSprintStatusTool(asanaOpts),
      ].filter((t): t is AnyAgentTool => t !== null);
    })(),
  ];

  const pluginTools = resolvePluginTools({
    context: {
      config: options?.config,
      workspaceDir,
      agentDir: options?.agentDir,
      agentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
      sessionKey: options?.agentSessionKey,
      messageChannel: options?.agentChannel,
      agentAccountId: options?.agentAccountId,
      sandboxed: options?.sandboxed,
    },
    existingToolNames: new Set(tools.map((tool) => tool.name)),
    toolAllowlist: options?.pluginToolAllowlist,
  });

  return [...tools, ...pluginTools];
}
