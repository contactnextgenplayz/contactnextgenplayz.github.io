import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { navLinks } from "@/lib/site";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        triggerRef.current?.focus();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    // The menu only exists below the lg breakpoint. If the viewport grows
    // past it while open (e.g. a tablet rotating to landscape), close it so
    // the body scroll lock above can't get stuck on a hidden menu.
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    function onBreakpointChange(e: MediaQueryListEvent) {
      if (e.matches) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    desktopQuery.addEventListener("change", onBreakpointChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      desktopQuery.removeEventListener("change", onBreakpointChange);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="relative z-[1001] p-2 text-ink"
      >
        {open ? <X size={26} /> : <Menu size={26} />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => { triggerRef.current?.focus(); setOpen(false); }}
              className="fixed inset-0 z-[999] bg-void/70 backdrop-blur-sm"
              aria-hidden="true"
            />
            <motion.div
              ref={panelRef}
              id="mobile-nav-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              className="fixed top-0 right-0 z-[1000] flex h-full w-[78%] max-w-sm flex-col gap-2 overflow-y-auto overscroll-contain border-l border-line bg-surface px-8 py-24"
            >
              {navLinks.map((link, i) => (
                <a
                  key={link.href}
                  ref={i === 0 ? firstLinkRef : undefined}
                  href={`/${link.href}`}
                  onClick={() => { triggerRef.current?.focus(); setOpen(false); }}
                  className="mono-tag border-b border-line py-4 text-lg font-display font-medium text-ink transition-colors hover:text-signal"
                >
                  {link.label}
                </a>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
