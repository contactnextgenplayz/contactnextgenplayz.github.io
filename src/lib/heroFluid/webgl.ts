/**
 * Low-level WebGL plumbing shared by FluidSimulation: context creation with
 * capability detection (WebGL2 vs WebGL1, float texture support), shader
 * compilation, and ping-ponged float framebuffers.
 *
 * Kept free of any simulation-specific logic so it stays easy to reason
 * about and to unit-test in isolation from the fluid math.
 */

export type GL = WebGL2RenderingContext | WebGLRenderingContext;

export interface TextureFormat {
  internalFormat: number;
  format: number;
}

export interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
}

export interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap(): void;
}

/**
 * Precision tier this device can sustain for the simulation's float
 * framebuffers. "full" = half-float render targets (the common case on
 * any device from the last decade or so). "lite" = no renderable float
 * texture format at all, so the caller should fall back to a much
 * cheaper, non-simulated effect rather than run a Poisson solve in 8-bit.
 */
export type PrecisionTier = "full" | "lite";

export interface GLCapabilities {
  gl: GL;
  isWebGL2: boolean;
  precisionTier: PrecisionTier;
  texType: number;
  rgba: TextureFormat;
  rg: TextureFormat;
  r: TextureFormat;
  supportsLinearFiltering: boolean;
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  depth: false,
  stencil: false,
  antialias: false,
  preserveDrawingBuffer: false,
  premultipliedAlpha: false,
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: false,
};

export function compileShader(gl: GL, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("heroFluid: unable to allocate a WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`heroFluid: shader compile error — ${info ?? "unknown error"}`);
  }
  return shader;
}

export function createProgram(gl: GL, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("heroFluid: unable to allocate a WebGL program");

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  // Every shader pair here shares the same vertex shader and its one
  // attribute, "aPosition" — pinning it to location 0 on every program
  // lets the caller bind that vertex buffer once and reuse it across
  // every program swap instead of re-binding per draw call.
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`heroFluid: program link error — ${info ?? "unknown error"}`);
  }

  // The compiled program keeps its own copy once linked; the shader
  // objects themselves are no longer needed.
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

export function getUniforms(gl: GL, program: WebGLProgram): Record<string, WebGLUniformLocation> {
  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const location = gl.getUniformLocation(program, info.name);
    if (location) uniforms[info.name] = location;
  }
  return uniforms;
}

/**
 * Tries increasingly conservative formats until one is actually
 * framebuffer-renderable on this device — some WebGL2 implementations
 * report the extension but still can't render to e.g. a single-channel
 * float texture, so this is verified empirically rather than assumed.
 */
function findRenderableFormat(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  format: number,
  type: number
): TextureFormat {
  if (isRenderable(gl, internalFormat, format, type)) return { internalFormat, format };
  if (format === gl.RG && isRenderable(gl, gl.RGBA16F, gl.RGBA, type)) {
    return { internalFormat: gl.RGBA16F, format: gl.RGBA };
  }
  if (format === gl.RED && isRenderable(gl, gl.RGBA16F, gl.RGBA, type)) {
    return { internalFormat: gl.RGBA16F, format: gl.RGBA };
  }
  return { internalFormat: gl.RGBA, format: gl.RGBA };
}

function isRenderable(gl: WebGL2RenderingContext, internalFormat: number, format: number, type: number): boolean {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(texture);
  return status === gl.FRAMEBUFFER_COMPLETE;
}

/**
 * Creates a context and probes it for the float-texture support the
 * simulation needs, preferring WebGL2 and falling back to WebGL1 with the
 * relevant extensions. Returns null only if neither context type is
 * available at all — the caller treats that as "no WebGL" and leaves the
 * Hero's existing static background untouched.
 */
export function detectCapabilities(canvas: HTMLCanvasElement): GLCapabilities | null {
  let gl2: WebGL2RenderingContext | null = null;
  try {
    gl2 = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES) as WebGL2RenderingContext | null;
  } catch {
    gl2 = null;
  }

  const isWebGL2 = !!gl2;
  let gl: GL | null = gl2;
  if (!gl) {
    try {
      gl =
        (canvas.getContext("webgl", CONTEXT_ATTRIBUTES) as WebGLRenderingContext | null) ??
        (canvas.getContext("experimental-webgl", CONTEXT_ATTRIBUTES) as WebGLRenderingContext | null);
    } catch {
      gl = null;
    }
  }
  if (!gl) return null;

  gl.clearColor(0, 0, 0, 0);

  if (isWebGL2 && gl2) {
    gl2.getExtension("EXT_color_buffer_float");
    const texType = gl2.HALF_FLOAT;
    const rgba = findRenderableFormat(gl2, gl2.RGBA16F, gl2.RGBA, texType);
    const rg = findRenderableFormat(gl2, gl2.RG16F, gl2.RG, texType);
    const r = findRenderableFormat(gl2, gl2.R16F, gl2.RED, texType);
    // Falling all the way back to RGBA8 (no float support at all) means the
    // simulation can't hold signed velocity/pressure values with enough
    // precision for a Poisson solve to look clean — that's the "lite" tier.
    const precisionTier: PrecisionTier = rgba.internalFormat === gl2.RGBA ? "lite" : "full";
    return {
      gl: gl2,
      isWebGL2: true,
      precisionTier,
      texType: precisionTier === "lite" ? gl2.UNSIGNED_BYTE : texType,
      rgba,
      rg,
      r,
      // 16-bit float linear filtering is core to WebGL2; only the 8-bit
      // fallback needs checking, and unsigned-byte textures are always
      // linear-filterable.
      supportsLinearFiltering: true,
    };
  }

  const halfFloat = gl.getExtension("OES_texture_half_float");
  const linearExt = gl.getExtension("OES_texture_half_float_linear");
  const texType = halfFloat ? halfFloat.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
  const precisionTier: PrecisionTier = halfFloat ? "full" : "lite";
  const plainFormat: TextureFormat = { internalFormat: gl.RGBA, format: gl.RGBA };

  return {
    gl,
    isWebGL2: false,
    precisionTier,
    texType,
    rgba: plainFormat,
    // WebGL1 has no 1/2-channel renderable formats — every buffer is a
    // full RGBA texture and the simulation shaders simply ignore the
    // unused channels via swizzling.
    rg: plainFormat,
    r: plainFormat,
    supportsLinearFiltering: precisionTier === "lite" ? true : !!linearExt,
  };
}

function createTexture(
  gl: GL,
  width: number,
  height: number,
  fmt: TextureFormat,
  type: number,
  filter: number
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("heroFluid: unable to allocate a texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, width, height, 0, fmt.format, type, null);
  return texture;
}

export function createFBO(
  gl: GL,
  width: number,
  height: number,
  fmt: TextureFormat,
  type: number,
  filter: number
): FBO {
  gl.activeTexture(gl.TEXTURE0);
  const texture = createTexture(gl, width, height, fmt, type, filter);

  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("heroFluid: unable to allocate a framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, width, height);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return {
    texture,
    fbo,
    width,
    height,
    texelSizeX: 1 / width,
    texelSizeY: 1 / height,
  };
}

export function createDoubleFBO(
  gl: GL,
  width: number,
  height: number,
  fmt: TextureFormat,
  type: number,
  filter: number
): DoubleFBO {
  let read = createFBO(gl, width, height, fmt, type, filter);
  let write = createFBO(gl, width, height, fmt, type, filter);

  return {
    width,
    height,
    texelSizeX: read.texelSizeX,
    texelSizeY: read.texelSizeY,
    get read() {
      return read;
    },
    get write() {
      return write;
    },
    swap() {
      const temp = read;
      read = write;
      write = temp;
    },
  };
}

export function deleteFBO(gl: GL, target: FBO): void {
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.fbo);
}

export function deleteDoubleFBO(gl: GL, target: DoubleFBO): void {
  deleteFBO(gl, target.read);
  deleteFBO(gl, target.write);
}
