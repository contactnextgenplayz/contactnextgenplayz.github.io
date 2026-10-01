/**
 * Mounts the Hero fluid background: owns the WebGL lifecycle and every
 * browser-facing concern the simulation itself doesn't know about —
 * pointer input, idle ambient motion, theme switching, resize, visibility,
 * adaptive quality, and teardown.
 *
 * Usage (from Hero.astro's client script):
 *
 *   const dispose = mountHeroFluid(heroSection, canvasEl);
 *   // ...later, if ever needed:
 *   dispose();
 */

import { detectCapabilities, type GLCapabilities } from "./webgl";
import { FluidSimulation, type QualityProfile } from "./FluidSimulation";
import { getCurrentTheme, getThemeVisualConfig, observeTheme, sampleSplatColor, type ThemeName } from "./theme";

type DeviceTier = "desktop" | "tablet" | "mobile";

const TIER_ORDER: DeviceTier[] = ["desktop", "tablet", "mobile"];

const QUALITY_PROFILES: Record<DeviceTier, QualityProfile> = {
  desktop: {
    simResolution: 128,
    dyeResolution: 1024,
    pressureIterations: 24,
    velocityDissipation: 0.22,
    dyeDissipation: 0.85,
    curlStrength: 22,
    splatRadius: 0.0022,
  },
  tablet: {
    simResolution: 96,
    dyeResolution: 720,
    pressureIterations: 15,
    velocityDissipation: 0.26,
    dyeDissipation: 0.95,
    curlStrength: 20,
    splatRadius: 0.0026,
  },
  mobile: {
    simResolution: 64,
    dyeResolution: 480,
    pressureIterations: 9,
    velocityDissipation: 0.3,
    dyeDissipation: 1.1,
    curlStrength: 17,
    splatRadius: 0.0032,
  },
};

const DPR_CAP: Record<DeviceTier, number> = {
  desktop: 2,
  tablet: 1.5,
  mobile: 1.25,
};

const SPLAT_FORCE = 3200;
const IDLE_THRESHOLD_MS = 1600;
const IDLE_SPLAT_INTERVAL_MS = 90;
const RESIZE_DEBOUNCE_MS = 150;
const PERF_CHECK_INTERVAL_MS = 3000;
const PERF_FPS_FLOOR = 40;
const MAX_DOWNGRADES = TIER_ORDER.length - 1;

function detectDeviceTier(): DeviceTier {
  if (typeof window === "undefined" || !window.matchMedia) return "desktop";
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const canHover = window.matchMedia("(hover: hover)").matches;
  if (!coarsePointer && canHover) return "desktop";
  const narrow = window.matchMedia("(max-width: 640px)").matches;
  return narrow ? "mobile" : "tablet";
}

interface UvPoint {
  x: number;
  y: number;
}

/** The active WebGL session for one mount — recreated whole on context restore. */
function startSession(container: HTMLElement, canvas: HTMLCanvasElement, capabilities: GLCapabilities): () => void {
  const gl = capabilities.gl;
  let tierIndex = TIER_ORDER.indexOf(detectDeviceTier());
  if (tierIndex < 0) tierIndex = 0;
  let quality = QUALITY_PROFILES[TIER_ORDER[tierIndex]];
  let dprCap = DPR_CAP[TIER_ORDER[tierIndex]];

  let currentTheme: ThemeName = getCurrentTheme();
  const simulation = new FluidSimulation(gl, capabilities, quality, getThemeVisualConfig(currentTheme));

  const startTime = performance.now();
  let lastFrameTime = startTime;
  let lastInputTime = startTime - IDLE_THRESHOLD_MS - 1;
  let lastPoint: UvPoint | null = null;
  let isIntersecting = true;
  let running = true;
  let rafId = 0;
  let resizeTimeout = 0;

  const frameTimestamps: number[] = [];
  let lastPerfCheck = startTime;
  let downgrades = 0;

  function toUv(clientX: number, clientY: number): UvPoint {
    const rect = container.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    return {
      x: (clientX - rect.left) / width,
      // Flip: DOM Y grows downward, but the shaders' vUv follows WebGL's
      // convention of V=0 at the bottom / V=1 at the top.
      y: 1 - (clientY - rect.top) / height,
    };
  }

  function emitSplat(x: number, y: number, dx: number, dy: number, strength: number): void {
    const t = (performance.now() - startTime) / 1000;
    const jitter = Math.random();
    const color = sampleSplatColor(currentTheme, t, jitter);
    simulation.splat(x, y, dx * SPLAT_FORCE, dy * SPLAT_FORCE, [
      color[0] * strength,
      color[1] * strength,
      color[2] * strength,
    ]);
  }

  function handlePointerMove(event: PointerEvent): void {
    const point = toUv(event.clientX, event.clientY);
    lastInputTime = performance.now();

    if (lastPoint) {
      const dx = point.x - lastPoint.x;
      const dy = point.y - lastPoint.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.0001) {
        // Subdivide large jumps into several splats along the path so a
        // fast flick reads as a continuous stroke, not disconnected dots.
        const steps = Math.min(Math.max(Math.ceil(distance / 0.02), 1), 10);
        const punch = 0.85 + Math.random() * 0.3;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          emitSplat(lastPoint.x + dx * t, lastPoint.y + dy * t, dx / steps, dy / steps, punch);
        }
      }
    }
    lastPoint = point;
  }

  function handlePointerEnter(event: PointerEvent): void {
    lastPoint = toUv(event.clientX, event.clientY);
    lastInputTime = performance.now();
  }

  function handlePointerLeave(): void {
    lastPoint = null;
  }

  let lastIdleSplatTime = 0;

  function emitIdleSplat(nowSeconds: number): void {
    const angle = nowSeconds * 0.3 + Math.sin(nowSeconds * 0.12) * 1.4;
    const radiusX = 0.17;
    const radiusY = 0.13;
    const x = 0.5 + Math.cos(angle) * radiusX;
    const y = 0.63 + Math.sin(angle) * radiusY;
    const dx = -Math.sin(angle) * radiusX * 0.5;
    const dy = Math.cos(angle) * radiusY * 0.5;
    // A slow breathing envelope (~10s period) so the ambient wisp itself
    // recedes to almost nothing between gentle pulses, rather than
    // maintaining a constant low hum that would blur into "never really
    // fades" — the fade-to-near-silence has to be visible on its own,
    // independent of whatever the last real interaction was doing.
    const breathe = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(nowSeconds * 0.22 - 1.2), 2);
    emitSplat(x, y, dx, dy, 0.16 * breathe);
  }

  function applyCanvasSize(): void {
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const width = Math.max(1, Math.round((rect.width || 1) * dpr));
    const height = Math.max(1, Math.round((rect.height || 1) * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    simulation.resize(width, height);
  }

  function scheduleResize(): void {
    window.clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(applyCanvasSize, RESIZE_DEBOUNCE_MS);
  }

  function updateRunning(): void {
    running = isIntersecting && !document.hidden;
    if (running) lastFrameTime = performance.now();
  }

  function downgradeQuality(): void {
    if (downgrades >= MAX_DOWNGRADES || tierIndex >= TIER_ORDER.length - 1) return;
    tierIndex += 1;
    downgrades += 1;
    quality = QUALITY_PROFILES[TIER_ORDER[tierIndex]];
    dprCap = DPR_CAP[TIER_ORDER[tierIndex]];
    simulation.setQuality(quality);
    applyCanvasSize();
  }

  function trackPerformance(now: number): void {
    frameTimestamps.push(now);
    while (frameTimestamps.length > 0 && now - frameTimestamps[0] > 2000) {
      frameTimestamps.shift();
    }
    if (now - lastPerfCheck < PERF_CHECK_INTERVAL_MS) return;
    lastPerfCheck = now;
    if (frameTimestamps.length < 30) return;
    const elapsed = frameTimestamps[frameTimestamps.length - 1] - frameTimestamps[0];
    const fps = ((frameTimestamps.length - 1) / elapsed) * 1000;
    if (fps < PERF_FPS_FLOOR) downgradeQuality();
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);
    if (!running) return;

    const dt = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 1 / 30);
    lastFrameTime = now;

    if (now - lastInputTime > IDLE_THRESHOLD_MS && now - lastIdleSplatTime > IDLE_SPLAT_INTERVAL_MS) {
      lastIdleSplatTime = now;
      emitIdleSplat(now / 1000);
    }

    simulation.step(dt || 1 / 60);
    simulation.render();
    trackPerformance(now);
  }

  function handleThemeChange(theme: ThemeName): void {
    currentTheme = theme;
    simulation.setVisualConfig(getThemeVisualConfig(theme));
  }

  applyCanvasSize();

  container.addEventListener("pointermove", handlePointerMove, { passive: true });
  container.addEventListener("pointerenter", handlePointerEnter, { passive: true });
  container.addEventListener("pointerleave", handlePointerLeave, { passive: true });

  const resizeObserver = new ResizeObserver(scheduleResize);
  resizeObserver.observe(container);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      isIntersecting = entry ? entry.isIntersecting : true;
      updateRunning();
    },
    { threshold: 0 }
  );
  intersectionObserver.observe(container);

  document.addEventListener("visibilitychange", updateRunning);

  const disconnectThemeObserver = observeTheme(handleThemeChange);

  rafId = requestAnimationFrame(frame);

  return function endSession() {
    cancelAnimationFrame(rafId);
    window.clearTimeout(resizeTimeout);
    container.removeEventListener("pointermove", handlePointerMove);
    container.removeEventListener("pointerenter", handlePointerEnter);
    container.removeEventListener("pointerleave", handlePointerLeave);
    document.removeEventListener("visibilitychange", updateRunning);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    disconnectThemeObserver();
    simulation.destroy();
  };
}

/** Mounts the animated WebGL layer, or leaves the Hero's existing static background untouched if it can't. */
function mountActive(container: HTMLElement, canvas: HTMLCanvasElement): () => void {
  if (typeof window === "undefined") return () => {};

  const capabilities = detectCapabilities(canvas);
  // No renderable float texture format at all is a vanishingly rare, very
  // old-hardware case — running the full Poisson solve in 8-bit would band
  // badly rather than look "premium", so this tier intentionally falls
  // back to the Hero's existing static gradient/grid background instead
  // of a second, lower-fidelity simulation implementation.
  if (!capabilities || capabilities.precisionTier !== "full") return () => {};

  let endSession: (() => void) | null = null;
  try {
    endSession = startSession(container, canvas, capabilities);
  } catch {
    // Shader compile/link failure on some unexpected driver — fail silent
    // and leave the static backdrop in place rather than throwing.
    return () => {};
  }

  function handleContextLost(event: Event): void {
    event.preventDefault();
    endSession?.();
    endSession = null;
  }

  function handleContextRestored(): void {
    try {
      const restoredCapabilities = detectCapabilities(canvas);
      if (restoredCapabilities && restoredCapabilities.precisionTier === "full") {
        endSession = startSession(container, canvas, restoredCapabilities);
      }
    } catch {
      endSession = null;
    }
  }

  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

  return function dispose() {
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    endSession?.();
    endSession = null;
  };
}

/**
 * Mounts the Hero fluid background onto `canvas`, tracking pointer input
 * within `container`. Respects `prefers-reduced-motion` for the lifetime
 * of the mount (including if the OS-level setting changes mid-session) and
 * returns a cleanup function that releases every GPU resource and listener.
 */
export function mountHeroFluid(container: HTMLElement, canvas: HTMLCanvasElement): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let dispose: (() => void) | null = reducedMotionQuery.matches ? null : mountActive(container, canvas);

  function handlePreferenceChange(): void {
    if (reducedMotionQuery.matches) {
      dispose?.();
      dispose = null;
    } else if (!dispose) {
      dispose = mountActive(container, canvas);
    }
  }

  reducedMotionQuery.addEventListener("change", handlePreferenceChange);

  return function fullDispose() {
    reducedMotionQuery.removeEventListener("change", handlePreferenceChange);
    dispose?.();
    dispose = null;
  };
}
