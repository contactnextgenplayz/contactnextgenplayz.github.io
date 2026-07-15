import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Play } from "lucide-react";
import { popularVideos, type PopularVideo } from "@/data/portfolio";

const THUMB_QUALITIES = ["maxresdefault", "hqdefault", "mqdefault"] as const;

function VideoCard({ entry }: { entry: PopularVideo }) {
  const [playing, setPlaying] = useState(false);
  const [thumbIndex, setThumbIndex] = useState(0);
  const [thumbFailed, setThumbFailed] = useState(false);

  const thumbnailSrc = useMemo(() => {
    if (thumbFailed) return "/og-image.jpg";
    const quality = THUMB_QUALITIES[Math.min(thumbIndex, THUMB_QUALITIES.length - 1)];
    return `https://i.ytimg.com/vi/${entry.videoId}/${quality}.jpg`;
  }, [entry.videoId, thumbFailed, thumbIndex]);

  const handleThumbError = () => {
    setThumbIndex((current) => {
      const next = current + 1;
      if (next >= THUMB_QUALITIES.length) {
        setThumbFailed(true);
        return current;
      }
      return next;
    });
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_60px_-34px_rgba(0,0,0,0.8)]"
    >
      {playing ? (
        <iframe
          className="aspect-video w-full"
          src={`https://www.youtube-nocookie.com/embed/${entry.videoId}?autoplay=1&rel=0`}
          title={entry.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPlaying(true)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setPlaying(true);
            }
          }}
          className="cursor-pointer outline-none"
          aria-label={`Play ${entry.title}`}
        >
          <div className="relative aspect-video overflow-hidden bg-elevated">
            <img
              src={thumbnailSrc}
              alt={entry.title}
              loading="lazy"
              decoding="async"
              onError={handleThumbError}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-void/78 via-void/20 to-transparent" />
            <div className="absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-signal text-white shadow-[0_0_30px_rgba(255,70,85,0.45)] transition-transform group-hover:scale-110">
              <Play size={24} className="ml-0.5 fill-white text-white" />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-ink">
                {entry.title}
              </h3>
            </div>

            <a
              href={entry.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-2 mono-tag text-signal transition-colors hover:border-signal"
              aria-label={`Open ${entry.title} on YouTube`}
            >
              YouTube <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      )}
    </motion.article>
  );
}

export default function PortfolioGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {popularVideos.map((entry) => (
        <VideoCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
