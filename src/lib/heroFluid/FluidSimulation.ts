/**
 * FluidSimulation — owns every GPU resource for the Hero fluid effect and
 * runs the per-frame simulation pipeline. Pure mechanism: it knows nothing
 * about pointer input, theming, or scheduling — the orchestration layer
 * (index.ts) decides *when* to step/splat/render and with what quality
 * settings; this class just does it.
 *
 * Assumes `capabilities.precisionTier === "full"` (a renderable half-float
 * or float texture format). The caller is responsible for not constructing
 * this class on devices that only cleared the "lite" tier — an 8-bit
 * Poisson solve would band and look worse than no effect at all.
 */

import {
  baseVertexShader,
  dampShader,
  splatShader,
  curlShader,
  vorticityShader,
  divergenceShader,
  pressureShader,
  gradientSubtractShader,
  advectionShader,
  displayShader,
} from "./shaders";
import {
  type GL,
  type FBO,
  type DoubleFBO,
  type GLCapabilities,
  createProgram,
  getUniforms,
  createFBO,
  createDoubleFBO,
  deleteFBO,
  deleteDoubleFBO,
} from "./webgl";
import type { ThemeVisualConfig } from "./theme";

export interface QualityProfile {
  /** Longer edge of the low-res velocity/pressure/curl grid. */
  simResolution: number;
  /** Longer edge of the higher-res dye (visible trail) buffer. */
  dyeResolution: number;
  /** Jacobi relaxation steps per frame for the pressure solve. */
  pressureIterations: number;
  velocityDissipation: number;
  dyeDissipation: number;
  curlStrength: number;
  /** Splat falloff radius in normalized UV units. */
  splatRadius: number;
}

interface ProgramBundle {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}

function buildProgram(gl: GL, vertexSource: string, fragmentSource: string): ProgramBundle {
  const program = createProgram(gl, vertexSource, fragmentSource);
  return { program, uniforms: getUniforms(gl, program) };
}

function resolutionFor(targetResolution: number, width: number, height: number): { width: number; height: number } {
  const isLandscape = width >= height;
  const aspectRatio = isLandscape ? width / Math.max(height, 1) : height / Math.max(width, 1);
  const minEdge = Math.max(1, Math.round(targetResolution));
  const maxEdge = Math.max(1, Math.round(targetResolution * aspectRatio));
  return isLandscape ? { width: maxEdge, height: minEdge } : { width: minEdge, height: maxEdge };
}

export class FluidSimulation {
  private readonly gl: GL;
  private readonly capabilities: GLCapabilities;
  private quality: QualityProfile;
  private visual: ThemeVisualConfig;

  private readonly quadBuffer: WebGLBuffer;
  private readonly elementBuffer: WebGLBuffer;

  private readonly dampProgram: ProgramBundle;
  private readonly splatProgram: ProgramBundle;
  private readonly curlProgram: ProgramBundle;
  private readonly vorticityProgram: ProgramBundle;
  private readonly divergenceProgram: ProgramBundle;
  private readonly pressureProgram: ProgramBundle;
  private readonly gradientSubtractProgram: ProgramBundle;
  private readonly advectionProgram: ProgramBundle;
  private readonly displayProgram: ProgramBundle;

  private width = 1;
  private height = 1;
  private buffersReady = false;

  private velocity!: DoubleFBO;
  private dye!: DoubleFBO;
  private divergence!: FBO;
  private curl!: FBO;
  private pressure!: DoubleFBO;

  constructor(gl: GL, capabilities: GLCapabilities, quality: QualityProfile, visual: ThemeVisualConfig) {
    this.gl = gl;
    this.capabilities = capabilities;
    this.quality = quality;
    this.visual = visual;

    const quadBuffer = gl.createBuffer();
    const elementBuffer = gl.createBuffer();
    if (!quadBuffer || !elementBuffer) throw new Error("heroFluid: unable to allocate geometry buffers");
    this.quadBuffer = quadBuffer;
    this.elementBuffer = elementBuffer;

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.dampProgram = buildProgram(gl, baseVertexShader, dampShader);
    this.splatProgram = buildProgram(gl, baseVertexShader, splatShader);
    this.curlProgram = buildProgram(gl, baseVertexShader, curlShader);
    this.vorticityProgram = buildProgram(gl, baseVertexShader, vorticityShader);
    this.divergenceProgram = buildProgram(gl, baseVertexShader, divergenceShader);
    this.pressureProgram = buildProgram(gl, baseVertexShader, pressureShader);
    this.gradientSubtractProgram = buildProgram(gl, baseVertexShader, gradientSubtractShader);
    this.advectionProgram = buildProgram(gl, baseVertexShader, advectionShader);
    this.displayProgram = buildProgram(gl, baseVertexShader, displayShader);

    this.allocateBuffers();
  }

  setQuality(quality: QualityProfile): void {
    this.quality = quality;
    this.allocateBuffers();
  }

  setVisualConfig(visual: ThemeVisualConfig): void {
    this.visual = visual;
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height && this.buffersReady) return;
    this.width = w;
    this.height = h;
    this.allocateBuffers();
  }

  private allocateBuffers(): void {
    const gl = this.gl;
    const { rg, rgba, r, texType, supportsLinearFiltering } = this.capabilities;
    const filter = supportsLinearFiltering ? gl.LINEAR : gl.NEAREST;

    if (this.buffersReady) {
      deleteDoubleFBO(gl, this.velocity);
      deleteDoubleFBO(gl, this.dye);
      deleteFBO(gl, this.divergence);
      deleteFBO(gl, this.curl);
      deleteDoubleFBO(gl, this.pressure);
    }

    const simRes = resolutionFor(this.quality.simResolution, this.width, this.height);
    const dyeRes = resolutionFor(this.quality.dyeResolution, this.width, this.height);

    this.velocity = createDoubleFBO(gl, simRes.width, simRes.height, rg, texType, filter);
    this.dye = createDoubleFBO(gl, dyeRes.width, dyeRes.height, rgba, texType, filter);
    this.divergence = createFBO(gl, simRes.width, simRes.height, r, texType, gl.NEAREST);
    this.curl = createFBO(gl, simRes.width, simRes.height, r, texType, gl.NEAREST);
    this.pressure = createDoubleFBO(gl, simRes.width, simRes.height, r, texType, gl.NEAREST);
    this.buffersReady = true;
  }

  private blit(target: FBO | null): void {
    const gl = this.gl;
    if (target === null) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  /** Injects a soft Gaussian blob of velocity + dye color at a normalized (0..1) point. */
  splat(xNorm: number, yNorm: number, dxNorm: number, dyNorm: number, color: [number, number, number]): void {
    const gl = this.gl;
    const aspectRatio = this.width / Math.max(this.height, 1);

    gl.useProgram(this.splatProgram.program);
    gl.uniform1f(this.splatProgram.uniforms.uAspectRatio, aspectRatio);
    gl.uniform2f(this.splatProgram.uniforms.uPoint, xNorm, yNorm);
    gl.uniform1f(this.splatProgram.uniforms.uRadius, this.quality.splatRadius);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.splatProgram.uniforms.uTarget, 0);
    gl.uniform3f(this.splatProgram.uniforms.uColor, dxNorm, dyNorm, 0);
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform1i(this.splatProgram.uniforms.uTarget, 0);
    gl.uniform3f(this.splatProgram.uniforms.uColor, color[0], color[1], color[2]);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  /** Advances the simulation by `dt` seconds. */
  step(dt: number): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);

    // Curl (vorticity scalar field).
    gl.useProgram(this.curlProgram.program);
    gl.uniform2f(this.curlProgram.uniforms.uTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.curlProgram.uniforms.uVelocity, 0);
    this.blit(this.curl);

    // Vorticity confinement force feeds back into velocity.
    gl.useProgram(this.vorticityProgram.program);
    gl.uniform2f(this.vorticityProgram.uniforms.uTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curl.texture);
    gl.uniform1i(this.vorticityProgram.uniforms.uCurl, 1);
    gl.uniform1f(this.vorticityProgram.uniforms.uCurlStrength, this.quality.curlStrength);
    gl.uniform1f(this.vorticityProgram.uniforms.uDt, dt);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Divergence of the (still slightly compressible) velocity field.
    gl.useProgram(this.divergenceProgram.program);
    gl.uniform2f(this.divergenceProgram.uniforms.uTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, 0);
    this.blit(this.divergence);

    // Damp the previous frame's pressure rather than clearing it — pressure
    // is temporally coherent, so this gives the Jacobi solve a warm start.
    gl.useProgram(this.dampProgram.program);
    gl.uniform2f(this.dampProgram.uniforms.uTexelSize, this.pressure.texelSizeX, this.pressure.texelSizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.uniform1i(this.dampProgram.uniforms.uTexture, 0);
    gl.uniform1f(this.dampProgram.uniforms.uValue, 0.8);
    this.blit(this.pressure.write);
    this.pressure.swap();

    // Jacobi-iterate toward a pressure field that will cancel divergence.
    gl.useProgram(this.pressureProgram.program);
    gl.uniform2f(this.pressureProgram.uniforms.uTexelSize, this.pressure.texelSizeX, this.pressure.texelSizeY);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.divergence.texture);
    gl.uniform1i(this.pressureProgram.uniforms.uDivergence, 1);
    for (let i = 0; i < this.quality.pressureIterations; i++) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
      gl.uniform1i(this.pressureProgram.uniforms.uPressure, 0);
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    // Subtract the pressure gradient so velocity is (nearly) divergence-free.
    gl.useProgram(this.gradientSubtractProgram.program);
    gl.uniform2f(this.gradientSubtractProgram.uniforms.uTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.uniform1i(this.gradientSubtractProgram.uniforms.uPressure, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.gradientSubtractProgram.uniforms.uVelocity, 1);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Self-advect velocity (carries momentum forward).
    gl.useProgram(this.advectionProgram.program);
    gl.uniform2f(this.advectionProgram.uniforms.uTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, 0);
    gl.uniform1i(this.advectionProgram.uniforms.uSource, 0);
    gl.uniform1f(this.advectionProgram.uniforms.uDt, dt);
    gl.uniform1f(this.advectionProgram.uniforms.uDissipation, this.quality.velocityDissipation);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Advect dye through the (now divergence-free) velocity field — this is
    // the visible trail, and its own dissipation is the "fade out" behavior.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform1i(this.advectionProgram.uniforms.uSource, 1);
    gl.uniform1f(this.advectionProgram.uniforms.uDissipation, this.quality.dyeDissipation);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  /** Composites the dye buffer to the canvas. */
  render(): void {
    const gl = this.gl;
    gl.useProgram(this.displayProgram.program);
    gl.uniform2f(this.displayProgram.uniforms.uTexelSize, this.dye.texelSizeX, this.dye.texelSizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform1i(this.displayProgram.uniforms.uTexture, 0);
    gl.uniform1f(this.displayProgram.uniforms.uIntensity, this.visual.intensity);
    gl.uniform1f(this.displayProgram.uniforms.uAlphaGain, this.visual.alphaGain);
    gl.uniform1f(this.displayProgram.uniforms.uHighlightMix, this.visual.highlightMix);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.BLEND);
  }

  destroy(): void {
    const gl = this.gl;
    if (this.buffersReady) {
      deleteDoubleFBO(gl, this.velocity);
      deleteDoubleFBO(gl, this.dye);
      deleteFBO(gl, this.divergence);
      deleteFBO(gl, this.curl);
      deleteDoubleFBO(gl, this.pressure);
    }
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.elementBuffer);
    for (const bundle of [
      this.dampProgram,
      this.splatProgram,
      this.curlProgram,
      this.vorticityProgram,
      this.divergenceProgram,
      this.pressureProgram,
      this.gradientSubtractProgram,
      this.advectionProgram,
      this.displayProgram,
    ]) {
      gl.deleteProgram(bundle.program);
    }
  }
}
