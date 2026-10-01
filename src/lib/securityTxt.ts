import { site } from "@/lib/site";

/**
 * RFC 9116 security.txt, generated on every build. `Expires` is always
 * VALIDITY_DAYS ahead of the last build (RFC 9116 recommends < 1 year), so the
 * file never goes stale while the scheduled rebuilds keep running — and
 * correctly expires if they ever stop for that long.
 */
const VALIDITY_DAYS = 180;

export function buildSecurityTxt(location: "well-known" | "legacy", now = new Date()): string {
  const expires = new Date(now.getTime() + VALIDITY_DAYS * 86_400_000);
  expires.setUTCHours(0, 0, 0, 0);
  const header =
    location === "well-known"
      ? ["# If you believe you've found a security issue with this website", "# (not the YouTube channel itself), please let us know."]
      : ["# This is a legacy-location copy for older clients.", "# The canonical version lives at /.well-known/security.txt"];
  return [
    ...header,
    `Contact: mailto:${site.email}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en, tr",
    `Canonical: ${new URL("/.well-known/security.txt", site.url).href}`,
    "",
  ].join("\n");
}

export function securityTxtResponse(location: "well-known" | "legacy"): Response {
  return new Response(buildSecurityTxt(location), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
