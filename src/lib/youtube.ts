/**
 * OPTIONAL: live YouTube stats at build time.
 *
 * Setup:
 * 1. Create an API key in Google Cloud Console (enable "YouTube Data API v3").
 * 2. Restrict the key to that API (and, if you like, to your repo's
 *    Actions IP range) — it's a read-only, public-data key.
 * 3. Add it as a GitHub Actions secret named YOUTUBE_API_KEY (see
 *    .github/workflows/deploy.yml, which already passes it through).
 * 4. Import `getChannelStats` from a page/component and use the result
 *    instead of the placeholder values in src/lib/site.ts.
 *
 * This file intentionally does nothing at build time unless the env
 * var is present, so the site builds fine without any key.
 */

export interface ChannelStats {
  subscriberCount: string;
  viewCount: string;
  videoCount: string;
}

export async function getChannelStats(channelId: string): Promise<ChannelStats | null> {
  const apiKey = import.meta.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const stats = data.items?.[0]?.statistics;
    if (!stats) return null;

    return {
      subscriberCount: stats.subscriberCount,
      viewCount: stats.viewCount,
      videoCount: stats.videoCount,
    };
  } catch {
    // Network unavailable at build time, quota exceeded, etc. — fail
    // silently and let the caller fall back to placeholder values.
    return null;
  }
}

/**
 * Pulls the official channel avatar from the public YouTube channel page.
 * YouTube typically exposes it in the page metadata as `og:image`, which
 * points at the actual channel profile image on yt3.googleusercontent.com.
 * If that metadata is not present for any reason, callers should fall back
 * to a local brand asset.
 */
export async function getChannelAvatar(channelUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(channelUrl, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/i,
      /"thumbnail"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const raw = match[1].replace(/&amp;/g, "&");
        return raw.startsWith("//") ? `https:${raw}` : raw;
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Public YouTube thumbnail URL helper.
 */
export function getVideoThumbnail(videoId: string, quality: "maxresdefault" | "hqdefault" | "mqdefault" = "maxresdefault") {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * "Latest upload" pill on the homepage — no API key needed.
 *
 * Every YouTube channel publishes a free, public Atom feed of its most
 * recent uploads at this URL (this is the same feed format YouTube uses
 * for its own PubSubHubbub push notifications, so it's a stable, official
 * mechanism rather than a scraping trick):
 *
 *   https://www.youtube.com/feeds/videos.xml?channel_id=<channelId>
 *
 * This runs at build time (in Node, on GitHub Actions), so there's no
 * CORS issue and nothing for a visitor's browser to fetch. Because
 * deploy.yml already rebuilds once a day on a schedule, the "latest
 * upload" pill catches up automatically within a day of a new video
 * going live — no manual edit needed.
 *
 * On any failure (network hiccup in CI, unexpected feed shape, etc.) this
 * quietly returns null and the caller simply doesn't render the pill, so
 * a bad build never breaks the rest of the site.
 */
export interface LatestVideo {
  videoId: string;
  title: string;
  publishedAt: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&"); // must run last, or e.g. "&amp;lt;" would double-decode
}

export async function getLatestVideo(channelId: string): Promise<LatestVideo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;

    const xml = await res.text();
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return null;
    const entry = entryMatch[1];

    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const rawTitle = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const publishedAt = entry.match(/<published>(.*?)<\/published>/)?.[1];

    // Sanity-check the video ID shape rather than trusting the feed blindly.
    if (!videoId || !/^[\w-]{11}$/.test(videoId) || !rawTitle || !publishedAt) return null;

    return { videoId, title: decodeXmlEntities(rawTitle.trim()), publishedAt };
  } catch {
    // Timed out, offline, malformed XML, etc. — fail silently.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
