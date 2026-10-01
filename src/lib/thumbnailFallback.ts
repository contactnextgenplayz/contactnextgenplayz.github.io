/**
 * Browser-side thumbnail fallback for YouTube images rendered by Astro
 * components (Hero "Latest Video" card and the Latest Videos grid).
 *
 * Markup contract:
 *   <img src="<first url>" data-thumb-chain="<url1> <url2> ... /og-image.jpg">
 *
 * The image walks down the chain when the current source errors *or* turns
 * out to be YouTube's 120x90 grey "no thumbnail" placeholder (served with a
 * 404 status, which browsers still render and report as `load`).
 */

import { PLACEHOLDER_THUMB_SIZE } from "@/lib/youtube-shared";

function isPlaceholder(img: HTMLImageElement): boolean {
  return img.naturalWidth === PLACEHOLDER_THUMB_SIZE.width && img.naturalHeight === PLACEHOLDER_THUMB_SIZE.height;
}

function advance(img: HTMLImageElement): void {
  const chain = (img.dataset.thumbChain ?? "").split(/\s+/).filter(Boolean);
  const next = Number(img.dataset.thumbIndex ?? "0") + 1;
  if (!Number.isInteger(next) || next >= chain.length) return;
  img.dataset.thumbIndex = String(next);
  img.src = chain[next];
}

export function bindThumbnailFallback(img: HTMLImageElement): void {
  if (img.dataset.thumbBound === "true") return;
  img.dataset.thumbBound = "true";

  img.addEventListener("error", () => advance(img));
  img.addEventListener("load", () => {
    if (isPlaceholder(img)) advance(img);
  });

  // The request may already have finished before this module ran.
  if (img.complete && (img.naturalWidth === 0 || isPlaceholder(img)) && img.getAttribute("src")) {
    advance(img);
  }
}

