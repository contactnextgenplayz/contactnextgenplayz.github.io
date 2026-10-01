/**
 * Build-time YouTube data — no API key, no YouTube Data API, no secrets.
 * Everything comes from public, keyless sources:
 *
 *   Latest uploads, from YouTube's official Atom feeds (title, link, publish
 *   and update time, description, view count). First source with videos wins:
 *     1. Channel feed          /feeds/videos.xml?channel_id=UC...
 *     2. Uploads-playlist feed /feeds/videos.xml?playlist_id=UU... (same official
 *        feed service, separate endpoint; covers outages of the first one)
 *     3. Snapshot of the deployed site (/latest-videos.json): a build that cannot
 *        reach YouTube keeps the last successful data instead of regressing.
 *     4. Built-in fallback: only for a very first deploy without any network.
 *   Thumbnails: i.ytimg.com, sizes verified with keyless HEAD requests.
 *
 * The feed endpoint answers datacenter IPs with occasional 404/500s, so every
 * request is retried once. Lookups are memoised for the whole build, so all
 * pages and the JSON endpoint share one set of requests and render the same data.
 *
 * Server/build-time only: never import this file from a client <script>.
 */

import { site } from "@/lib/site";
import {
  compareNewestFirst,
  getUploadsPlaylistId,
  getVideoThumbnail,
  isThumbQuality,
  isValidVideoId,
  type LatestVideo,
  type ThumbQuality,
} from "@/lib/youtube-shared";

export type { LatestVideo } from "@/lib/youtube-shared";

export type LatestVideosSource = "feed" | "playlist-feed" | "snapshot" | "static";

export interface LatestVideosResult {
  videos: LatestVideo[];
  source: LatestVideosSource;
  /** When the videos were fetched from YouTube (carried over from a snapshot). */
  fetchedAt: string | null;
  /** Channel name as published in the feed, when known. */
  channelTitle: string | null;
}

/** Public path of the JSON snapshot emitted by src/pages/latest-videos.json.ts. */
export const LATEST_VIDEOS_JSON_PATH = "/latest-videos.json";

/** Last-resort content for a first deploy that cannot reach YouTube at all. */
export const LAST_KNOWN_LATEST_VIDEOS: readonly LatestVideo[] = [
  {
    videoId: "GbVd-D272O8",
    title: "THE ELDER SCROLLS Full Cinematic Game Scenes (2026) 4K ULTRA HD Werewolf Vs Dragons",
  },
];

const REQUEST_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 1500;
const MAX_LIMIT = 15;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch with a single retry for transient failures (network errors and the
 * statuses `isRetryable` accepts). Returns null only if every attempt threw.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  isRetryable: (status: number) => boolean,
): Promise<Response | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init);
      if (res.ok || !isRetryable(res.status) || attempt === 2) return res;
      await res.body?.cancel().catch(() => undefined);
    } catch {
      if (attempt === 2) return null;
    }
    await delay(RETRY_DELAY_MS);
  }
  return null;
}

const isServerError = (status: number) => status === 429 || status >= 500;

/* -------------------------------------------------------------------------- */
/* Official Atom feeds (keyless)                                               */
/* -------------------------------------------------------------------------- */

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

const isIsoDate = (value: string | undefined): value is string => !!value && Number.isFinite(Date.parse(value));

function parseFeedEntry(entry: string): LatestVideo | null {
  const videoId = entry.match(/<yt:videoId>\s*([^<]+?)\s*<\/yt:videoId>/i)?.[1];
  const rawTitle = entry.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1];
  const publishedAt = entry.match(/<published>\s*([^<]+?)\s*<\/published>/i)?.[1];
  if (!isValidVideoId(videoId) || !rawTitle?.trim() || !isIsoDate(publishedAt)) return null;

  const updatedAt = entry.match(/<updated>\s*([^<]+?)\s*<\/updated>/i)?.[1];
  const link =
    entry.match(/<link\s[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    entry.match(/<link\s[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i)?.[1];
  const views = Number(entry.match(/<media:statistics\s[^>]*views=["'](\d{1,15})["']/i)?.[1] ?? Number.NaN);
  const description = decodeXmlEntities(
    entry.match(/<media:description(?:\s[^>]*)?>([\s\S]*?)<\/media:description>/i)?.[1] ?? "",
  )
    .trim()
    .slice(0, MAX_DESCRIPTION);

  return {
    videoId,
    title: decodeXmlEntities(rawTitle.trim()).slice(0, MAX_TITLE),
    publishedAt,
    ...(isIsoDate(updatedAt) ? { updatedAt } : {}),
    ...(Number.isSafeInteger(views) ? { views } : {}),
    ...(description ? { description } : {}),
    ...(link?.includes(`/shorts/${videoId}`) ? { isShort: true } : {}),
  };
}

/** Parsed, date-sorted entries (plus the channel name) from a YouTube Atom feed. */
export function parseYouTubeAtomFeed(xml: string, limit = MAX_LIMIT): { videos: LatestVideo[]; channelTitle: string | null } {
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
  const head = xml.split(/<entry[\s>]/i)[0] ?? "";
  const rawChannelTitle = head.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1];
  const videos = Array.from(xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi))
    .map((match) => parseFeedEntry(match[1]))
    .filter((entry): entry is LatestVideo => entry !== null)
    .sort(compareNewestFirst)
    .slice(0, safeLimit);
  return { videos, channelTitle: rawChannelTitle ? decodeXmlEntities(rawChannelTitle.trim()).slice(0, 100) || null : null };
}

/** Backwards-compatible helper: just the videos. */
export function parseYouTubeAtomFeedEntries(xml: string, limit = MAX_LIMIT): LatestVideo[] {
  return parseYouTubeAtomFeed(xml, limit).videos;
}

async function readFeed(url: string, limit: number): Promise<{ videos: LatestVideo[]; channelTitle: string | null } | null> {
  const res = await fetchWithRetry(
    url,
    { headers: { accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8" } },
    // The feed endpoint intermittently answers 404 for valid channels.
    (status) => status === 404 || isServerError(status),
  );
  if (!res?.ok) return null;
  try {
    const parsed = parseYouTubeAtomFeed(await res.text(), limit);
    return parsed.videos.length ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The feed does not say which thumbnail sizes exist. A fresh upload often has
 * no maxres/sd variant yet, and requesting one would show YouTube's grey
 * placeholder plus a 404 in the visitor's console — so check at build time.
 * Unknown (network failure) leaves `thumb` unset and the browser-side
 * fallback chain takes over.
 */
async function thumbnailExists(videoId: string, quality: ThumbQuality): Promise<boolean | null> {
  try {
    const res = await fetchWithTimeout(getVideoThumbnail(videoId, quality), { method: "HEAD" }, 5000);
    if (res.ok) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

async function withThumbnailAvailability(videos: LatestVideo[]): Promise<LatestVideo[]> {
  return Promise.all(
    videos.map(async (video) => {
      const maxres = await thumbnailExists(video.videoId, "maxresdefault");
      if (maxres === true) return { ...video, thumb: "maxresdefault" as const };
      if (maxres === null) return video;
      const sd = await thumbnailExists(video.videoId, "sddefault");
      return { ...video, thumb: sd === true ? ("sddefault" as const) : ("hqdefault" as const) };
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Snapshot of the deployed site                                               */
/* -------------------------------------------------------------------------- */

type SnapshotData = { videos: LatestVideo[]; fetchedAt: string | null; channelTitle: string | null };

/** Validates a /latest-videos.json payload (treated as untrusted input). */
export function parseLatestVideosSnapshot(data: unknown, limit = MAX_LIMIT): SnapshotData | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { videos?: unknown; fetchedAt?: unknown; channelTitle?: unknown };
  if (!Array.isArray(record.videos)) return null;

  const videos: LatestVideo[] = [];
  for (const entry of record.videos) {
    if (!entry || typeof entry !== "object") continue;
    const { videoId, title, publishedAt, updatedAt, views, description, isShort, thumb } = entry as Record<string, unknown>;
    if (!isValidVideoId(videoId) || typeof title !== "string" || !title.trim()) continue;
    videos.push({
      videoId,
      title: title.trim().slice(0, MAX_TITLE),
      ...(typeof publishedAt === "string" && isIsoDate(publishedAt) ? { publishedAt } : {}),
      ...(typeof updatedAt === "string" && isIsoDate(updatedAt) ? { updatedAt } : {}),
      ...(typeof views === "number" && Number.isSafeInteger(views) && views >= 0 ? { views } : {}),
      ...(typeof description === "string" && description.trim() ? { description: description.trim().slice(0, MAX_DESCRIPTION) } : {}),
      ...(isShort === true ? { isShort: true } : {}),
      ...(isThumbQuality(thumb) ? { thumb } : {}),
    });
    if (videos.length >= limit) break;
  }
  if (!videos.length) return null;

  const fetchedAt = typeof record.fetchedAt === "string" && isIsoDate(record.fetchedAt) ? record.fetchedAt : null;
  const channelTitle =
    typeof record.channelTitle === "string" && record.channelTitle.trim() ? record.channelTitle.trim().slice(0, 100) : null;
  return { videos, fetchedAt, channelTitle };
}

async function getDeployedSnapshot(limit: number): Promise<SnapshotData | null> {
  const url = new URL(LATEST_VIDEOS_JSON_PATH, site.url);
  const res = await fetchWithRetry(url.toString(), { headers: { accept: "application/json" } }, isServerError);
  if (!res?.ok) return null;
  try {
    return parseLatestVideosSnapshot(await res.json(), limit);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

function logResult(result: LatestVideosResult): LatestVideosResult {
  const summary = `[youtube] Latest videos: ${result.videos.length} from "${result.source}"`;
  if (result.source === "feed" || result.source === "playlist-feed") {
    console.info(summary);
  } else if (result.source === "snapshot") {
    console.warn(`${summary} — YouTube feeds unreachable, reusing the last deployed data (fetched ${result.fetchedAt ?? "earlier"}).`);
  } else {
    console.warn(`${summary} — YouTube feeds and the deployed snapshot are unreachable, using the built-in fallback.`);
  }
  return result;
}

async function loadLatestVideos(channelId: string, limit: number): Promise<LatestVideosResult> {
  const feeds: Array<[LatestVideosSource, string]> = [
    ["feed", `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`],
    ["playlist-feed", `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(getUploadsPlaylistId(channelId))}`],
  ];
  for (const [source, url] of feeds) {
    const feed = await readFeed(url, limit);
    if (feed) {
      return logResult({
        videos: await withThumbnailAvailability(feed.videos),
        source,
        fetchedAt: new Date().toISOString(),
        channelTitle: feed.channelTitle,
      });
    }
  }

  const snapshot = await getDeployedSnapshot(limit);
  if (snapshot) return logResult({ ...snapshot, source: "snapshot" });

  return logResult({ videos: LAST_KNOWN_LATEST_VIDEOS.slice(0, limit), source: "static", fetchedAt: null, channelTitle: null });
}

const latestCache = new Map<string, Promise<LatestVideosResult>>();

/** Latest uploads plus where they came from. Memoised per build. */
export function getLatestVideosResult(channelId: string, limit = 6): Promise<LatestVideosResult> {
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
  const key = `${channelId}:${safeLimit}`;
  let pending = latestCache.get(key);
  if (!pending) {
    pending = loadLatestVideos(channelId, safeLimit);
    latestCache.set(key, pending);
  }
  return pending;
}

export async function getLatestVideos(channelId: string, limit = 6): Promise<LatestVideo[]> {
  return (await getLatestVideosResult(channelId, limit)).videos;
}
