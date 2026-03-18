/** Raw Slack API response types (snake_case, as returned by endpoints) */

export interface SlackApiResponse {
  ok: boolean;
  error?: string;
  response_metadata?: {
    next_cursor?: string;
  };
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  is_archived: boolean;
  is_member: boolean;
  topic: { value: string };
  purpose: { value: string };
  num_members: number;
  created: number;
  updated: number;
}

export interface SlackMessage {
  type: string;
  subtype?: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  reply_users_count?: number;
  latest_reply?: string;
  reactions?: { name: string; count: number; users: string[] }[];
  files?: SlackFile[];
  attachments?: any[];
}

export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  display_name?: string;
  is_bot: boolean;
  is_admin: boolean;
  deleted: boolean;
  tz: string;
  profile: {
    real_name: string;
    display_name: string;
    email?: string;
    image_72: string;
    title?: string;
    status_text?: string;
    status_emoji?: string;
  };
  updated: number;
}

export interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private: string;
  url_private_download?: string;
  permalink: string;
}

export interface SlackSearchResult {
  messages: {
    matches: SlackMessage[];
    total: number;
    pagination: {
      total_count: number;
      page: number;
      per_page: number;
      page_count: number;
    };
  };
}
