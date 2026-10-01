/**
 * Small, dependency-free YouTube helpers shared by build-time code
 * (src/lib/youtube.ts), Astro components and the browser thumbnail fallback.
 * Keep this file free of Node-only APIs: parts of it are bundled for the browser.
 */

export interface LatestVideo {
  videoId: string;
  title: string;
  /** ISO 8601 publish time from the feed. */
  publishedAt?: string;
  /** ISO 8601 time the feed last reported a change (title, thumbnail, ...). */
  updatedAt?: string;
  /** Public view count from the feed (as approximate as on YouTube itself). */
  views?: number;
  /** Video description from the feed, trimmed. */
  description?: string;
  /** YouTube Shorts are linked by the feed as /shorts/<id>. */
  isShort?: boolean;
  /** Best thumbnail known to exist for this video (see THUMB_QUALITIES). */
  thumb?: ThumbQuality;
}

/** Thumbnail variants, best first. `hqdefault` and `mqdefault` always exist. */
export const THUMB_QUALITIES = ["maxresdefault", "sddefault", "hqdefault", "mqdefault"] as const;
export type ThumbQuality = (typeof THUMB_QUALITIES)[number];

/**
 * YouTube answers a missing thumbnail variant with HTTP 404 *and* a 120x90
 * grey placeholder JPEG. Browsers render that body and fire `load`, not
 * `error`, so the placeholder has to be recognised by its size.
 */
export const PLACEHOLDER_THUMB_SIZE = { width: 120, height: 90 } as const;

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isValidVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID_RE.test(value);
}

export function isThumbQuality(value: unknown): value is ThumbQuality {
  return typeof value === "string" && (THUMB_QUALITIES as readonly string[]).includes(value);
}

export function getVideoThumbnail(videoId: string, quality: ThumbQuality = "maxresdefault"): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Ordered list of thumbnail URLs to try, starting at `start` and ending with
 * a local image that is always available.
 */
export function getThumbnailChain(videoId: string, start: ThumbQuality = "maxresdefault"): string[] {
  const from = Math.max(0, THUMB_QUALITIES.indexOf(start));
  return [...THUMB_QUALITIES.slice(from).map((quality) => getVideoThumbnail(videoId, quality)), "/og-image.jpg"];
}

export function getVideoUrl(videoId: string, isShort = false): string {
  return isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`;
}

/** The channel's "uploads" playlist id (UCxxxx -> UUxxxx). */
export function getUploadsPlaylistId(channelId: string): string {
  return channelId.startsWith("UC") && channelId.length > 2 ? `UU${channelId.slice(2)}` : channelId;
}

/** Newest first; entries without a usable date keep their original order at the end. */
export function compareNewestFirst(a: LatestVideo, b: LatestVideo): number {
  const ta = Date.parse(a.publishedAt ?? "");
  const tb = Date.parse(b.publishedAt ?? "");
  const va = Number.isFinite(ta) ? ta : Number.NEGATIVE_INFINITY;
  const vb = Number.isFinite(tb) ? tb : Number.NEGATIVE_INFINITY;
  if (va === vb) return 0;
  return vb > va ? 1 : -1;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const VIEWS_FORMAT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** "Sep 30, 2026" (UTC, so every build renders the same text), or null. */
export function formatPublishedDate(iso?: string): string | null {
  const time = Date.parse(iso ?? "");
  return Number.isFinite(time) ? DATE_FORMAT.format(time) : null;
}

/** "4.6K views" — only from 1,000 views up, so a minutes-old upload never shows "12 views". */
export function formatViews(views?: number): string | null {
  return typeof views === "number" && Number.isFinite(views) && views >= 1000 ? `${VIEWS_FORMAT.format(views)} views` : null;
}
