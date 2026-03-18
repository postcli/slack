import type { SlackApiResponse } from '../types.js';

export interface HttpClientConfig {
  token: string;
  cookie: string;
  workspace: string;
  maxRequestsPerSecond?: number;
}

export class HttpClient {
  private token: string;
  private cookie: string;
  private workspace: string;
  private headers: Record<string, string>;
  private minInterval: number;
  private lastRequest = 0;

  constructor(config: HttpClientConfig) {
    this.token = config.token;
    this.cookie = config.cookie;
    this.workspace = config.workspace;

    this.headers = {
      Cookie: `d=${this.cookie}`,
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };

    this.minInterval = 1000 / (config.maxRequestsPerSecond ?? 10);
  }

  getWorkspace(): string {
    return this.workspace;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minInterval) {
      await new Promise((r) => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastRequest = Date.now();
  }

  /** POST to Slack Web API endpoint */
  async post<T extends SlackApiResponse = SlackApiResponse>(
    method: string,
    params?: Record<string, any>
  ): Promise<T> {
    await this.throttle();
    const host = this.workspace === 'slack' ? 'slack.com' : `${this.workspace}.slack.com`;
    const url = `https://${host}/api/${method}`;

    const body = new URLSearchParams();
    body.set('token', this.token);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) body.set(k, String(v));
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${method}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as T;
    if (!data.ok) {
      throw new SlackApiError(method, data.error ?? 'unknown_error');
    }

    return data;
  }

  /** Paginate through a Slack API method that uses cursor-based pagination */
  async *paginate<T extends SlackApiResponse>(
    method: string,
    params?: Record<string, any>,
    limit?: number
  ): AsyncGenerator<T> {
    let cursor: string | undefined;
    let yielded = 0;

    do {
      const reqParams: Record<string, any> = { ...params };
      if (cursor) reqParams.cursor = cursor;

      const data = await this.post<T>(method, reqParams);
      yield data;
      yielded++;

      cursor = data.response_metadata?.next_cursor || undefined;
      if (limit && yielded >= limit) break;
    } while (cursor);
  }
}

export class SlackApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly code: string
  ) {
    super(`Slack API ${method}: ${code}`);
    this.name = 'SlackApiError';
  }
}
