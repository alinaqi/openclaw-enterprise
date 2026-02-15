export type AsanaUser = {
  gid: string;
  name: string;
  email?: string;
};

export type AsanaTag = {
  name: string;
};

export type AsanaSectionMembership = {
  section: { name: string };
};

export type AsanaTask = {
  gid: string;
  name: string;
  assignee: AsanaUser | null;
  completed: boolean;
  due_on: string | null;
  tags: AsanaTag[];
  memberships: AsanaSectionMembership[];
};

export type AsanaCustomField = {
  name: string;
  number_value?: number;
  text_value?: string;
  enum_value?: { name: string } | null;
};

export type AsanaTaskDetail = {
  gid: string;
  name: string;
  notes: string;
  assignee: AsanaUser | null;
  completed: boolean;
  due_on: string | null;
  custom_fields: AsanaCustomField[];
};

export type AsanaSubtask = {
  gid: string;
  name: string;
  completed: boolean;
};

export type AsanaStory = {
  gid: string;
  text: string;
  type: string;
  created_by: { name: string };
};

export type AsanaProjectStatus = {
  text: string;
};

export type AsanaProject = {
  gid: string;
  name: string;
  color: string;
  current_status: AsanaProjectStatus | null;
};

export type AsanaConfig = {
  enabled?: boolean;
  apiKey?: string;
  workspaceGid?: string;
  defaultProjectGid?: string;
  rateLimitPerMinute?: number;
};
