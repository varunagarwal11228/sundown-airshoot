// Real-time 2D fluid (Jos Stam's "Stable Fluids") on the GPU, raw WebGL2.
// Runs behind the boot screen: advect -> vorticity confinement -> pressure
// solve (Jacobi) -> project. The cursor injects velocity and dye.

const VERT = `#version 300 es
precision highp float;
in vec2 aPos;
uniform vec2 texel;
out vec2 vUv, vL, vR, vT, vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texel.x, 0.0);
  vR = vUv + vec2(texel.x, 0.0);
  vT = vUv + vec2(0.0, texel.y);
  vB = vUv - vec2(0.0, texel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB;
out vec4 o;
`;

const FRAG = {
  splat: `${HEAD}
uniform sampler2D uTarget;
uniform float aspect, radius;
uniform vec3 color;
uniform vec2 point;
void main() {
  vec2 p = vUv - point;
  p.x *= aspect;
  vec3 s = exp(-dot(p, p) / radius) * color;
  o = vec4(texture(uTarget, vUv).xyz + s, 1.0);
}`,

  advect: `${HEAD}
uniform sampler2D uVelocity, uSource;
uniform vec2 texel;
uniform float dt, dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texel;
  o = texture(uSource, coord) / (1.0 + dissipation * dt);
}`,

  divergence: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,

  curl: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,

  vorticity: `${HEAD}
uniform sampler2D uVelocity, uCurl;
uniform float curl, dt;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * dt;
  o = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}`,

  pressure: `${HEAD}
uniform sampler2D uPressure, uDivergence;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  o = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`,

  gradient: `${HEAD}
uniform sampler2D uPressure, uVelocity;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 vel = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  o = vec4(vel, 0.0, 1.0);
}`,

  scale: `${HEAD}
uniform sampler2D uTexture;
uniform float value;
void main() { o = value * texture(uTexture, vUv); }`,

  display: `${HEAD}
uniform sampler2D uTexture;
uniform vec2 texel;
uniform vec3 bg;
uniform float fade;
void main() {
  vec3 c = texture(uTexture, vUv).rgb;
  // Fake lighting from the dye gradient gives the ink some volume.
  float dx = length(texture(uTexture, vR).rgb) - length(texture(uTexture, vL).rgb);
  float dy = length(texture(uTexture, vT).rgb) - length(texture(uTexture, vB).rgb);
  vec3 n = normalize(vec3(dx, dy, length(texel) * 2.0));
  float light = clamp(dot(n, normalize(vec3(-0.3, 0.5, 1.0))) + 0.55, 0.6, 1.15);
  c = 1.0 - exp(-c * 2.6 * light);
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * 1.3;
  o = vec4((bg + c) * vig * fade, 1.0);
}`,
};

const PALETTE = [
  [1.0, 0.18, 0.55],
  [0.25, 0.85, 1.0],
  [1.0, 0.55, 0.15],
  [0.6, 0.25, 1.0],
];

export class FluidSim {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, depth: false, stencil: false, antialias: false });
    this.ok = !!gl && !!gl.getExtension('EXT_color_buffer_float');
    if (!this.ok) return;
    this.gl = gl;
    gl.getExtension('OES_texture_float_linear');

    this.cfg = { simRes: 128, dyeRes: 640, pressureIters: 22, curl: 26, velDissipation: 0.25, dyeDissipation: 0.9, splatRadius: 0.0028 };
    this.fade = 1;
    this.pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, moved: false, color: PALETTE[0] };
    this.autoT = 0;

    this.quad();
    this.programs = {};
    for (const [name, src] of Object.entries(FRAG)) this.programs[name] = this.program(VERT, src);
    this.resize();
    this.allocate();

    this.onMove = (e) => {
      const x = e.clientX / innerWidth;
      const y = 1 - e.clientY / innerHeight;
      this.pointer.dx = (x - this.pointer.x) * 7000;
      this.pointer.dy = (y - this.pointer.y) * 7000;
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.moved = true;
    };
    this.onDown = () => {
      this.pointer.color = PALETTE[(Math.random() * PALETTE.length) | 0];
      this.burst(6);
    };
    this.onResize = () => this.resize();
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerdown', this.onDown);
    addEventListener('resize', this.onResize);

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.burst(5);
  }

  quad() {
    const gl = this.gl;
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
  }

  program(vsSrc, fsSrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      uniforms[name] = gl.getUniformLocation(p, name);
    }
    return { p, u: uniforms };
  }

  fbo(w, h) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, tx: 1 / w, ty: 1 / h };
  }

  double(w, h) {
    let a = this.fbo(w, h), b = this.fbo(w, h);
    return {
      get read() { return a; },
      get write() { return b; },
      swap() { [a, b] = [b, a]; },
    };
  }

  res(target) {
    const gl = this.gl;
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const lo = Math.round(target), hi = Math.round(target * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? [hi, lo] : [lo, hi];
  }

  allocate() {
    const [sw, sh] = this.res(this.cfg.simRes);
    const [dw, dh] = this.res(this.cfg.dyeRes);
    this.velocity = this.double(sw, sh);
    this.dye = this.double(dw, dh);
    this.pressure = this.double(sw, sh);
    this.divergence = this.fbo(sw, sh);
    this.curlTex = this.fbo(sw, sh);
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(innerWidth * dpr);
    this.canvas.height = Math.floor(innerHeight * dpr);
  }

  use(name) {
    const prog = this.programs[name];
    this.gl.useProgram(prog.p);
    return prog.u;
  }

  bind(unit, target) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    return unit;
  }

  blit(target) {
    const gl = this.gl;
    if (target) {
      gl.viewport(0, 0, target.w, target.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  splat(x, y, dx, dy, color, radius = this.cfg.splatRadius) {
    const gl = this.gl;
    const aspect = this.canvas.width / this.canvas.height;
    const r = aspect > 1 ? radius * aspect : radius;
    let u = this.use('splat');
    gl.uniform1i(u.uTarget, this.bind(0, this.velocity.read));
    gl.uniform1f(u.aspect, aspect);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, dx, dy, 0);
    gl.uniform1f(u.radius, r);
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(u.uTarget, this.bind(0, this.dye.read));
    gl.uniform3f(u.color, color[0], color[1], color[2]);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  burst(n) {
    for (let i = 0; i < n; i++) {
      const c = PALETTE[(Math.random() * PALETTE.length) | 0];
      const k = 0.6 + Math.random() * 0.5;
      this.splat(Math.random(), Math.random() * 0.8 + 0.1, (Math.random() - 0.5) * 2200, (Math.random() - 0.5) * 2200, [c[0] * k, c[1] * k, c[2] * k], 0.004);
    }
  }

  step(dt) {
    const gl = this.gl;
    const v = this.velocity;
    const tx = v.read.tx, ty = v.read.ty;
    gl.disable(gl.BLEND);

    let u = this.use('curl');
    gl.uniform2f(u.texel, tx, ty);
    gl.uniform1i(u.uVelocity, this.bind(0, v.read));
    this.blit(this.curlTex);

    u = this.use('vorticity');
    gl.uniform2f(u.texel, tx, ty);
    gl.uniform1i(u.uVelocity, this.bind(0, v.read));
    gl.uniform1i(u.uCurl, this.bind(1, this.curlTex));
    gl.uniform1f(u.curl, this.cfg.curl);
    gl.uniform1f(u.dt, dt);
    this.blit(v.write);
    v.swap();

    u = this.use('divergence');
    gl.uniform2f(u.texel, tx, ty);
    gl.uniform1i(u.uVelocity, this.bind(0, v.read));
    this.blit(this.divergence);

    u = this.use('scale');
    gl.uniform1i(u.uTexture, this.bind(0, this.pressure.read));
    gl.uniform1f(u.value, 0.8);
    this.blit(this.pressure.write);
    this.pressure.swap();

    u = this.use('pressure');
    gl.uniform2f(u.texel, tx, ty);
    gl.uniform1i(u.uDivergence, this.bind(0, this.divergence));
    for (let i = 0; i < this.cfg.pressureIters; i++) {
      gl.uniform1i(u.uPressure, this.bind(1, this.pressure.read));
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    u = this.use('gradient');
    gl.uniform2f(u.texel, tx, ty);
    gl.uniform1i(u.uPressure, this.bind(0, this.pressure.read));
    gl.uniform1i(u.uVelocity, this.bind(1, v.read));
    this.blit(v.write);
    v.swap();

    u = this.use('advect');
    gl.uniform2f(u.texel, tx, ty);
    gl.uniform1i(u.uVelocity, this.bind(0, v.read));
    gl.uniform1i(u.uSource, this.bind(0, v.read));
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, this.cfg.velDissipation);
    this.blit(v.write);
    v.swap();

    gl.uniform1i(u.uVelocity, this.bind(0, v.read));
    gl.uniform1i(u.uSource, this.bind(1, this.dye.read));
    gl.uniform1f(u.dissipation, this.cfg.dyeDissipation);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  render() {
    const gl = this.gl;
    const u = this.use('display');
    gl.uniform2f(u.texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(u.uTexture, this.bind(0, this.dye.read));
    gl.uniform3f(u.bg, 0.027, 0.008, 0.059);
    gl.uniform1f(u.fade, this.fade);
    this.blit(null);
  }

  loop(now) {
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;

    if (this.pointer.moved) {
      this.pointer.moved = false;
      const p = this.pointer;
      const c = p.color;
      this.splat(p.x, p.y, p.dx, p.dy, [c[0] * 0.4, c[1] * 0.4, c[2] * 0.4]);
    }

    // Ambient "breathing" so the screen is alive even if nobody touches it.
    this.autoT -= dt;
    if (this.autoT <= 0) {
      this.autoT = 0.7 + Math.random() * 0.9;
      const c = PALETTE[(Math.random() * PALETTE.length) | 0];
      const a = Math.random() * Math.PI * 2;
      this.splat(0.5 + Math.cos(a) * 0.32, 0.5 + Math.sin(a) * 0.3, -Math.cos(a) * 900, -Math.sin(a) * 900, [c[0] * 0.32, c[1] * 0.32, c[2] * 0.32], 0.0035);
    }

    this.step(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  }

  // Called when progress milestones hit, so the ink reacts to loading.
  pulse(t) {
    if (!this.ok) return;
    const c = PALETTE[(Math.random() * PALETTE.length) | 0];
    const x = 0.5 + (t - 0.5) * 0.5;
    this.splat(x, 0.36, (Math.random() - 0.5) * 600, 1400, [c[0] * 0.3, c[1] * 0.3, c[2] * 0.3], 0.003);
  }

  destroy() {
    if (!this.ok) return;
    cancelAnimationFrame(this.raf);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onDown);
    removeEventListener('resize', this.onResize);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.ok = false;
  }
}
