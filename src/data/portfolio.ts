export interface PopularVideo {
  id: string;
  title: string;
  platform: "PS5 PRO" | "Xbox Series X" | "PC";
  videoId: string;
  videoUrl: string;
}

/**
 * Single source of truth for the "Most Popular Videos" grid — rendered
 * by PortfolioGrid.tsx on both the homepage (#popular) and /portfolio.
 *
 * To add a new video: append an object with the same shape. `videoId`
 * is the part after `v=` or after `youtu.be/` in the video's URL —
 * the thumbnail is fetched from YouTube automatically, nothing to
 * upload. To remove a video, delete its object. Order here is the
 * order shown on the site.
 */
export const popularVideos: PopularVideo[] = [
  {
    id: "titanoboa-indiana-jones",
    title: "Titanoboa vs Indiana Jones Epic Boss Fight | Realistic Ultra Graphics | Xbox X Gameplay [4K 60FPS]",
    platform: "Xbox Series X",
    videoId: "4vrsbdCMmw4",
    videoUrl: "https://youtu.be/4vrsbdCMmw4?si=Zun6WsWQjv4-Ws6S",
  },
  {
    id: "days-gone-remastered",
    title: "DAYS GONE REMASTERED™ PS5 PRO | Ultra Realistic Graphics Gameplay (4K 60FPS) Zombie Game",
    platform: "PS5 PRO",
    videoId: "ZjGPB63BoNo",
    videoUrl: "https://youtu.be/ZjGPB63BoNo?si=PN6sKBE3P6KDrjdU",
  },
  {
    id: "antarctic-sniper-assault",
    title: "ANTARCTIC SNIPER ASSAULT | Ultra Realistic Gameplay 4K 60FPS Call of Duty Cold War (XBOX X)",
    platform: "Xbox Series X",
    videoId: "FJw4pHYx134",
    videoUrl: "https://youtu.be/FJw4pHYx134?si=kD6WVe9agD_jyVMj",
  },
  {
    id: "marvel-avengers",
    title: "Marvel’s Avengers (XBOX X) 4K 60FPS Gameplay | Iron Man, Hulk, Thor – SUPERHERO GAME",
    platform: "Xbox Series X",
    videoId: "nbNRzW9Nd9I",
    videoUrl: "https://youtu.be/nbNRzW9Nd9I?si=umK8Vj5O6Jof3Cnw",
  },
  {
    id: "surviving-the-amazon",
    title: "SURVIVING THE AMAZON (TOMB RAIDER) – PS5 PRO™ GAMEPLAY | 4K 60FPS",
    platform: "PS5 PRO",
    videoId: "XurjHSPn3G8",
    videoUrl: "https://youtu.be/XurjHSPn3G8?si=HEpxFX1DwEh2qjUk",
  },
  {
    id: "kill-the-illuminati",
    title: "KILL THE ILLUMINATI in HITMAN 3 | Stealth Brutal Kills & Cinematic Run [4K 60FPS] XBOX X",
    platform: "Xbox Series X",
    videoId: "7bEo7e-gOLo",
    videoUrl: "https://youtu.be/7bEo7e-gOLo?si=-gcQmwEVlE19KjHS",
  },
];
