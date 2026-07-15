export const site = {
  name: "NextGenPlayz",
  tagline: "Premium 4K Gameplay",
  description:
    "Professional gameplay captures and cinematic showcases across PS5 PRO, Xbox Series X, and PC.",
  url: "https://contactnextgenplayz.github.io",
  channelUrl: "https://www.youtube.com/@nextgenplayz1",
  channelHandle: "@nextgenplayz1",
  channelId: "UC2mSVmNlBvp4_l20Atfn--w",
  email: "contact.nextgenplayz@gmail.com",
  twitter: "https://twitter.com/nextgenplayz",
};

/**
 * Single source of truth for the in-page section nav, shared by
 * Header.astro, MobileNav.tsx, and Footer.astro so there's only one
 * place to edit when a section is added, renamed, or reordered.
 *
 * `href` is a bare hash (e.g. "#about") matching a section `id` on the
 * homepage. Consumers should render it as `/${href}` — the leading
 * slash makes the link work correctly from *any* page (e.g. /portfolio
 * or a 404), not just when already on the homepage.
 */
export const navLinks = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#popular", label: "Videos" },
  { href: "#services", label: "Services" },
  { href: "#hardware", label: "Platforms" },
  { href: "#contact", label: "Contact" },
];

/**
 * Live-ready stats labels for the homepage.
 * These values are intentionally compact so the animated counters remain clean
 * and easy to read on desktop and mobile.
 */
export const stats = {
  totalViews: "30 Million+ Views",
  subscribers: "75K Subscribers",
};

export const hardware = [
  { name: "PS5 PRO" },
  { name: "Xbox Series X" },
  { name: "PC" },
];

export const services = [
  {
    title: "Raw Gameplay",
    description:
      "Crisp, high-end gameplay capture with clean framing and premium presentation for viewers who care about the visual detail.",
  },
  {
    title: "Cinematic Trailers",
    description:
      "Paced, polished sequences that elevate the atmosphere of each game without distracting overlays or clutter.",
  },
  {
    title: "Tech Deep Dives",
    description:
      "Clear visual showcases designed for modern hardware, performance-minded viewers, and premium gameplay discovery.",
  },
];
