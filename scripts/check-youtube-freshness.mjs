// Run by the deploy workflow after `npm run build`. Reports whether the Latest
// Videos data could be refreshed from YouTube recently. When it could not for
// MAX_AGE_HOURS, the workflow's `youtube-alert` job fails once a day (the site
// itself stays deployed), so a silent data freeze becomes a visible red run and
// GitHub's failure e-mail instead of going unnoticed for months.
import { appendFileSync, readFileSync } from "node:fs";

const MAX_AGE_HOURS = 72;
const data = JSON.parse(readFileSync("dist/latest-videos.json", "utf8"));
const fetchedAt = Date.parse(data.fetchedAt ?? "");
const ageHours = Number.isFinite(fetchedAt) ? (Date.now() - fetchedAt) / 3_600_000 : Number.POSITIVE_INFINITY;
const stale = !(ageHours <= MAX_AGE_HOURS);

console.log(
  `Latest videos: source=${data.source}, fetchedAt=${data.fetchedAt ?? "never"}, ` +
    `age=${Number.isFinite(ageHours) ? `${ageHours.toFixed(1)}h` : "n/a"}, stale=${stale}`,
);
if (stale) {
  console.log(
    `::warning title=YouTube data is stale::Latest Videos has not been refreshed from YouTube's public feeds for more than ${MAX_AGE_HOURS} hours (source: ${data.source}).`,
  );
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stale=${stale}\n`);
