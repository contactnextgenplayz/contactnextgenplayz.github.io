/**
 * GLSL shader sources for the Hero background fluid simulation.
 *
 * Implements the standard real-time "stable fluids" technique (Stam):
 * semi-Lagrangian advection + Jacobi pressure projection + vorticity
 * confinement, run across a handful of ping-ponged framebuffers.
 *
 * Deliberately written in plain GLSL ES 1.00 (no `#version` pragma,
 * `attribute`/`varying`, `texture2D`, `gl_FragColor`) rather than ES 3.00.
 * WebGL2 contexts are required to keep accepting ES 1.00-style shaders for
 * backwards compatibility, so this single source set runs unchanged on
 * both a WebGL2 and a WebGL1 context — FluidSimulation.ts never needs two
 * parallel shader dialects, only different texture setup per context.
 */

export const baseVertexShader = /* glsl */ `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform vec2 uTexelSize;

  void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(uTexelSize.x, 0.0);
    vR = vUv + vec2(uTexelSize.x, 0.0);
    vT = vUv + vec2(0.0, uTexelSize.y);
    vB = vUv - vec2(0.0, uTexelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

/** Scales a whole buffer by a constant — used to gently damp pressure each step. */
export const dampShader = /* glsl */ `
  precision mediump float;
  precision mediump sampler2D;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uValue;

  void main () {
    gl_FragColor = uValue * texture2D(uTexture, vUv);
  }
`;

/** Injects a soft Gaussian blob of velocity or dye at a point. */
export const splatShader = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float uAspectRatio;
  uniform vec3 uColor;
  uniform vec2 uPoint;
  uniform float uRadius;

  void main () {
    vec2 p = vUv - uPoint;
    p.x *= uAspectRatio;
    float falloff = exp(-dot(p, p) / uRadius);
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + uColor * falloff, 1.0);
  }
`;

/** Vorticity (curl) of the velocity field — feeds the confinement pass below. */
export const curlShader = /* glsl */ `
  precision mediump float;
  precision mediump sampler2D;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform sampler2D uVelocity;

  void main () {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
  }
`;

/**
 * Vorticity confinement: pushes the flow along the gradient of |curl|,
 * which is what keeps the trail curling into little eddies and prevents it
 * from just smearing into a flat blur — the main source of "turbulence".
 */
export const vorticityShader = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float uCurlStrength;
  uniform float uDt;

  void main () {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= uCurlStrength * C;
    force.y *= -1.0;

    vec2 velocity = texture2D(uVelocity, vUv).xy;
    gl_FragColor = vec4(velocity + force * uDt, 0.0, 1.0);
  }
`;

/** Divergence of the velocity field — the source term for the pressure solve. */
export const divergenceShader = /* glsl */ `
  precision mediump float;
  precision mediump sampler2D;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform sampler2D uVelocity;

  void main () {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;

    vec2 C = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -C.x; }
    if (vR.x > 1.0) { R = -C.x; }
    if (vT.y > 1.0) { T = -C.y; }
    if (vB.y < 0.0) { B = -C.y; }

    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }
`;

/** One Jacobi relaxation step toward solving the pressure Poisson equation. */
export const pressureShader = /* glsl */ `
  precision mediump float;
  precision mediump sampler2D;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;

  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float divergence = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
  }
`;

/** Subtracts the pressure gradient from velocity so the flow stays (nearly) incompressible. */
export const gradientSubtractShader = /* glsl */ `
  precision mediump float;
  precision mediump sampler2D;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;

  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

/**
 * Semi-Lagrangian advection — traces each texel backward through the
 * velocity field to sample where its contents "came from". Used both to
 * self-advect velocity (momentum) and to advect the dye (the visible trail).
 * The dissipation term is what makes the trail fade rather than loop forever.
 */
export const advectionShader = /* glsl */ `
  precision highp float;
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp sampler2D;
  #else
    precision mediump sampler2D;
  #endif
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexelSize;
  uniform float uDt;
  uniform float uDissipation;

  void main () {
    vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexelSize;
    vec4 result = texture2D(uSource, coord);
    float decay = 1.0 + uDissipation * uDt;
    gl_FragColor = result / decay;
  }
`;

/**
 * Final composite: tone-maps the dye buffer, adds a cheap 4-tap glow so
 * bright cores bloom softly instead of clipping, and derives per-pixel
 * alpha from luminance so empty regions stay fully transparent and the
 * existing Hero backdrop shows through untouched.
 */
export const displayShader = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uTexelSize;
  uniform float uIntensity;
  uniform float uAlphaGain;
  uniform float uHighlightMix;

  void main () {
    vec3 color = texture2D(uTexture, vUv).rgb;

    vec3 glow = vec3(0.0);
    glow += texture2D(uTexture, vUv + uTexelSize * vec2( 1.4,  1.4)).rgb;
    glow += texture2D(uTexture, vUv + uTexelSize * vec2(-1.4,  1.4)).rgb;
    glow += texture2D(uTexture, vUv + uTexelSize * vec2( 1.4, -1.4)).rgb;
    glow += texture2D(uTexture, vUv + uTexelSize * vec2(-1.4, -1.4)).rgb;
    color += glow * 0.09;

    color *= uIntensity;
    color = color / (color + vec3(1.0));

    float lum = max(max(color.r, color.g), color.b);
    color = mix(color, vec3(lum), clamp(lum, 0.0, 1.0) * uHighlightMix);

    float alpha = clamp(lum * uAlphaGain, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;
