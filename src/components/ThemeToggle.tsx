import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const STORAGE_KEY = "ngp-theme";

/**
 * Day/night mode switch. The actual theme is already applied before this
 * component ever mounts (see the blocking inline script in
 * BaseLayout.astro) — this component's job is just to reflect that state
 * with a nice icon and let people flip it.
 */
export default function ThemeToggle() {
  // Start "dark" on both the server render and the client's first
  // (hydration) render — matching BaseLayout's own default assumption —
  // so React never flags a server/client mismatch. Right after mount we
  // read the real value the blocking script already applied and correct
  // to it; on a static site this is the standard, flash-free pattern.
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "light" ? "#f7f8fa" : "#0a0b0e");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — toggle still works for this
      // page view, it just won't be remembered on the next visit.
    }
  }

  const isLight = mounted && theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-elevated text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isLight ? "sun" : "moon"}
          initial={prefersReducedMotion ? false : { rotate: -90, opacity: 0, scale: 0.4 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={prefersReducedMotion ? undefined : { rotate: 90, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center"
        >
          {isLight ? <Sun size={18} /> : <Moon size={18} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
