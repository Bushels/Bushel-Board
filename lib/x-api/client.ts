/**
 * X/Twitter API v2 Recent Search client with rate-limit management.
 *
 * Uses Bearer Token (app-only) auth for the Recent Search endpoint.
 * Rate limit: 17 requests per 15-minute window (Basic tier).
 *
 * Consumers:
 *  - Background scheduled jobs (3x/day farming tweet collection)
 *  - Hermes real-time chat (social signal lookups)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XSearchResult {
  id: string;
  text: string;
  author_id: string;
  author_username?: string;
  created_at: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

export interface XSearchResponse {
  data: XSearchResult[] | null;
  meta: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
}

interface XApiUser {
  id: string;
  username: string;
}

interface RawXApiResponse {
  data?: Array<{
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    public_metrics?: {
      retweet_count: number;
      reply_count: number;
      like_count: number;
      quote_count: number;
    };
  }>;
  includes?: {
    users?: XApiUser[];
  };
  meta: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
  errors?: Array<{ message: string; type: string }>;
}

export interface SearchOptions {
  bearerToken: string;
  maxResults?: number;
  startTime?: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Raw fetch — stateless, no rate-limit tracking
// ---------------------------------------------------------------------------

const X_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";

/**
 * Raw fetch to X API v2 Recent Search.
 *
 * Callers are responsible for rate-limit management — use `XApiClient` for
 * automatic tracking.
 */
export async function searchRecentTweets(
  query: string,
  options: SearchOptions
): Promise<XSearchResponse> {
  const { bearerToken, maxResults = 10, startTime } = options;

  const params = new URLSearchParams({
    query,
    max_results: String(Math.max(10, Math.min(maxResults, 100))),
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "username",
  });

  if (startTime) {
    params.set("start_time", startTime);
  }

  const url = `${X_SEARCH_URL}?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API error ${res.status}: ${body}`);
  }

  const json: RawXApiResponse = await res.json();

  // Build username lookup from includes.users
  const userMap = new Map<string, string>();
  if (json.includes?.users) {
    for (const user of json.includes.users) {
      userMap.set(user.id, user.username);
    }
  }

  // Map raw data into our interface, attaching author_username
  const data: XSearchResult[] | null = json.data
    ? json.data.map((tweet) => ({
        id: tweet.id,
        text: tweet.text,
        author_id: tweet.author_id,
        author_username: userMap.get(tweet.author_id),
        created_at: tweet.created_at,
        public_metrics: tweet.public_metrics,
      }))
    : null;

  return {
    data,
    meta: json.meta,
  };
}

// ---------------------------------------------------------------------------
// Rate-limit-aware client
// ---------------------------------------------------------------------------

/** Basic tier: 17 requests per 15-minute window */
const RATE_LIMIT_MAX = 17;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export class XApiClient {
  private bearerToken: string;
  private requestTimestamps: number[] = [];

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
  }

  /** Number of requests still available in the current 15-minute window. */
  get remainingRequests(): number {
    this.pruneExpiredTimestamps();
    return Math.max(0, RATE_LIMIT_MAX - this.requestTimestamps.length);
  }

  /**
   * Search recent tweets with automatic rate-limit enforcement.
   *
   * @throws Error with wait time when rate limit is exhausted.
   */
  async search(
    query: string,
    maxResults?: number,
    startTime?: string
  ): Promise<XSearchResponse> {
    this.pruneExpiredTimestamps();

    if (this.requestTimestamps.length >= RATE_LIMIT_MAX) {
      const oldestTs = this.requestTimestamps[0];
      const waitMs = oldestTs + RATE_LIMIT_WINDOW_MS - Date.now();
      const waitSec = Math.ceil(waitMs / 1000);
      throw new Error(
        `X API rate limit reached (${RATE_LIMIT_MAX}/${RATE_LIMIT_WINDOW_MS / 60000}min). ` +
          `Retry in ${waitSec}s.`
      );
    }

    this.requestTimestamps.push(Date.now());

    return searchRecentTweets(query, {
      bearerToken: this.bearerToken,
      maxResults,
      startTime,
    });
  }

  /** Drop timestamps older than the 15-minute window. */
  private pruneExpiredTimestamps(): void {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    while (
      this.requestTimestamps.length > 0 &&
      this.requestTimestamps[0] < cutoff
    ) {
      this.requestTimestamps.shift();
    }
  }
}
