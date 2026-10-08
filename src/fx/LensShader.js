import { Vector2, Vector4 } from 'three';

// Final "camera lens" pass: shockwave refraction, chromatic aberration,
// damage tint, grain, scanlines, vignette. Runs in linear HDR before the
// output pass does tone mapping.
export const LensShader = {
  name: 'LensShader',
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uAberration: { value: 0.0015 },
    uVignette: { value: 1.15 },
    uGrain: { value: 0.035 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uDesat: { value: 0 },
    uWarp: { value: 0 },
    uOver: { value: 0 },
    uShock: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uAberration, uVignette, uGrain, uDamage, uFlash, uDesat, uWarp, uOver;
    uniform vec4 uShock[4];
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      float aspect = uRes.x / uRes.y;

      // Ring-shaped refraction for each live shockwave (xy = screen pos,
      // z = radius, w = strength). Pushes pixels outward like a pressure wave.
      for (int i = 0; i < 4; i++) {
        vec4 s = uShock[i];
        if (s.w <= 0.0) continue;
        vec2 d = uv - s.xy;
        d.x *= aspect;
        float dist = length(d);
        float w = 0.05 + s.z * 0.25;
        float ring = smoothstep(s.z - w, s.z, dist) * (1.0 - smoothstep(s.z, s.z + w, dist));
        vec2 dir = d / max(dist, 1e-4);
        dir.x /= aspect;
        uv -= dir * ring * s.w;
      }

      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * (uAberration * (1.0 + r2 * 6.0));
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;

      // Warp jump: radial zoom blur toward the centre of the screen.
      if (uWarp > 0.001) {
        vec3 acc = col;
        for (int i = 1; i < 8; i++) {
          float s = 1.0 - float(i) * 0.014 * uWarp;
          acc += texture2D(tDiffuse, (uv - 0.5) * s + 0.5).rgb;
        }
        col = mix(col, acc / 8.0, clamp(uWarp, 0.0, 1.0));
      }

      // Overdrive: warm grade and a glowing frame around the screen.
      col = mix(col, col * vec3(1.15, 0.95, 0.72) + vec3(0.03, 0.015, 0.0), uOver * 0.7);
      col += vec3(1.0, 0.55, 0.1) * smoothstep(0.12, 0.5, r2) * uOver * 0.22;

      col *= 0.97 + 0.03 * sin(vUv.y * uRes.y * 1.4);
      col += (hash(vUv * uRes + fract(uTime * 7.0) * 311.0) - 0.5) * uGrain;

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(luma) * vec3(1.05, 0.95, 1.1), uDesat);

      float edge = smoothstep(0.08, 0.45, r2);
      col = mix(col, vec3(1.0, 0.04, 0.12) * (0.25 + luma), edge * uDamage);

      col *= 1.0 - r2 * uVignette;
      col += uFlash;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};
