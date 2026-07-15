/**
 * Theme-aware palette for the Hero fluid effect.
 *
 * The site's theme lives entirely in `data-theme` on <html> (see
 * ThemeToggle.tsx / BaseLayout.astro) with no change event — so
 * `observeTheme` watches that attribute directly via MutationObserver
 * rather than requiring any change to how theming works elsewhere.
 *
 * Dark mode cycles through deep blue / crimson / violet — the site's
 * existing signal-red and data-blue brand hues, extended with a violet
 * bridge tone. Light mode uses a distinct, deliberately gentler pastel
 * set (ice blue / soft blue / gentle violet) tuned for a `multiply` blend
 * against a near-white background rather than the `screen` blend dark
 * mode uses against near-black — reusing the dark palette on `screen`
 * would just wash out to white, so light mode is tuned independently
 * rather than derived from it.
 */

export type ThemeName = "dark" | "light";

export interface ThemeVisualConfig {
  /** Overall brightness fed into the display shader's tonemap. */
  intensity: number;
  /** How readily dye becomes opaque — kept lower in light mode so the multiply blend stays gentle. */
  alphaGain: number;
  /** How much bright cores desaturate toward white/highlight. */
  highlightMix: number;
}

const VISUAL_CONFIG: Record<ThemeName, ThemeVisualConfig> = {
  dark: { intensity: 1.15, alphaGain: 1.35, highlightMix: 0.55 },
  light: { intensity: 0.85, alphaGain: 0.62, highlightMix: 0.3 },
};

// Hue anchors the palette cycles through, in degrees. Ordered so adjacent
// entries are close in hue (short way around the wheel), and the list
// loops back on itself so the cycle has no seam.
const DARK_HUE_ANCHORS = [352, 322, 268, 232, 268, 322];
const LIGHT_HUE_ANCHORS = [200, 214, 240, 262, 240, 214];

const DARK_SATURATION: [number, number] = [0.72, 0.9];
const DARK_LIGHTNESS: [number, number] = [0.5, 0.6];

const LIGHT_SATURATION: [number, number] = [0.5, 0.72];
const LIGHT_LIGHTNESS: [number, number] = [0.74, 0.85];

export function getCurrentTheme(): ThemeName {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function getThemeVisualConfig(theme: ThemeName): ThemeVisualConfig {
  return VISUAL_CONFIG[theme];
}

/** Watches <html data-theme> for changes; returns a disconnect function. */
export function observeTheme(onChange: (theme: ThemeName) => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
        onChange(getCurrentTheme());
        return;
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function hueLerp(a: number, b: number, t: number): number {
  let delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Slowly cycling hue position, shared across the whole simulation so
 * simultaneous splats feel like one coherent light source rather than
 * independently-colored dots — `jitter` (0..1, per-splat random) nudges
 * each individual splat off that shared position for organic variety.
 */
export function sampleSplatColor(theme: ThemeName, timeSeconds: number, jitter = 0): [number, number, number] {
  const anchors = theme === "dark" ? DARK_HUE_ANCHORS : LIGHT_HUE_ANCHORS;
  const period = 18;
  const cycles = anchors.length;
  const pos = ((timeSeconds % period) / period) * cycles;
  const i0 = Math.floor(pos) % cycles;
  const i1 = (i0 + 1) % cycles;
  const frac = smoothstep(pos - Math.floor(pos));
  const baseHue = hueLerp(anchors[i0], anchors[i1], frac);
  const hue = (baseHue + (jitter - 0.5) * 26 + 360) % 360;

  const [satRange, lightRange] = theme === "dark" ? [DARK_SATURATION, DARK_LIGHTNESS] : [LIGHT_SATURATION, LIGHT_LIGHTNESS];
  const saturation = lerp(satRange[0], satRange[1], Math.abs(jitter - 0.5) * 2);
  const lightness = lerp(lightRange[0], lightRange[1], jitter);

  return hslToRgb(hue, saturation, lightness);
}
