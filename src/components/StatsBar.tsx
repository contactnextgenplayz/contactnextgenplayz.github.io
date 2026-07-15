import { motion } from "motion/react";
import { stats } from "@/lib/site";

interface StatsBarProps {
  /** Live values from getChannelStats(), pre-formatted at build time.
   *  Falls back to the static placeholders in src/lib/site.ts when no
   *  API key is configured or the build-time fetch fails. */
  totalViews?: string;
  subscribers?: string;
}

export default function StatsBar({
  totalViews = stats.totalViews,
  subscribers = stats.subscribers,
}: StatsBarProps) {
  const items = [
    {
      value: totalViews,
      label: "Views",
    },
    {
      value: subscribers,
      label: "Subscribers",
    },
  ];

  return (
    <section className="mt-16 grid grid-cols-1 gap-5 border-t border-line pt-10 sm:grid-cols-2">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-line bg-surface p-6 text-center shadow-[0_14px_50px_-26px_rgba(0,0,0,0.7)] sm:p-8"
        >
          <p className="font-display text-4xl font-bold leading-tight text-ink sm:text-5xl lg:text-6xl">
            {item.value}
          </p>
          <p className="mono-tag mt-3 text-ink-muted uppercase tracking-[0.22em]">{item.label}</p>
        </motion.div>
      ))}
    </section>
  );
}
