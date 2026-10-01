import type { APIRoute } from "astro";
import { site } from "@/lib/site";
import { getLatestVideosResult } from "@/lib/youtube";

/**
 * Emitted as /latest-videos.json on every build. The next build reads it back
 * (see getLatestVideosResult) when YouTube is temporarily unreachable, so the
 * homepage keeps the last successfully fetched uploads instead of regressing.
 */
export const GET: APIRoute = async () => {
  const { videos, source, fetchedAt, channelTitle } = await getLatestVideosResult(site.channelId, 6);
  const body = {
    channelId: site.channelId,
    channelTitle,
    source,
    fetchedAt,
    videos,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
