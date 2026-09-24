/* ==========================================================================
 * 02-shaderlib.js — shared uniforms and GLSL: sky gradient, clouds,
 * aerial perspective, and the "terminator" (ridge shadow of the setting sun).
 * Built-in three.js materials are extended through global chunk overrides
 * plus a per-material patch that wires the shared uniforms in.
 * ========================================================================== */
const SL = (() => {
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const c3 = (hex) => new THREE.Color(hex);

  // Shared uniform objects (same {value} references in every material).
  const G = {
    uTime: { value: 0 },
    uSunDir: { value: v3(-0.93, 0.07, 0.34).normalize() },
    uSunColor: { value: c3(0xffd9a8) },     // sky glow / disc tint (linear)
    uSunLight: { value: c3(0xffffff) },     // direct light colour * intensity * visibility
    uSunH: { value: new THREE.Vector2(-0.94, 0.34) },
    uTerm: { value: new THREE.Vector4(10000, 450, 0.06, 0.009) }, // ridgeU, ridgeH, sunElev, sunRadius
    uTermOn: { value: 1 },
    uFog: { value: new THREE.Vector4(1 / 26000, 1 / 5200, 1 / 240, 0) }, // base, height, falloff, groundY
    uFogBoost: { value: 1 },
    uSkyZenith: { value: c3(0x4b79a6) },
    uSkyHorizonSun: { value: c3(0xf6d7a4) },
    uSkyHorizonAnti: { value: c3(0xb8c2d4) },
    uSkyBelt: { value: c3(0xd9b0b8) },
    uSunDisc: { value: new THREE.Vector4(0.99995, 0.99996, 30, 1) }, // cosOuter, cosInner, intensity, glow
    uCloudA: { value: new THREE.Vector4(0.55, 0.9, 3200, 1 / 4200) }, // coverage, opacity, altitude, scale
    uCloudB: { value: new THREE.Vector4(0.6, 0.45, 7600, 1 / 7000) }, // cirrus
    uCloudLitSun: { value: c3(0xffc27a) },
    uCloudLitAnti: { value: c3(0xf0c4c4) },
    uCloudShade: { value: c3(0x7d7a93) },
    uLamp: { value: 0 },
    uLampColor: { value: c3(0xffa24a) },
    uWind: { value: v3(0.82, 0.3, 1.0) },
  };

  // ---------------------------------------------------------------- GLSL
  const UNIFORMS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSunLight;
uniform vec2 uSunH;
uniform vec4 uTerm;
uniform float uTermOn;
uniform vec4 uFog;
uniform float uFogBoost;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizonSun;
uniform vec3 uSkyHorizonAnti;
uniform vec3 uSkyBelt;
uniform vec4 uSunDisc;
uniform vec4 uCloudA;
uniform vec4 uCloudB;
uniform vec3 uCloudLitSun;
uniform vec3 uCloudLitAnti;
uniform vec3 uCloudShade;
uniform float uLamp;
uniform vec3 uLampColor;
uniform vec3 uWind;
`;

  const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p) {
  float s = 0.0; float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; }
  return s / 0.875;
}
float fbm5(vec2 p) {
  float s = 0.0; float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; }
  return s / 0.96875;
}
`;

  const SKY_GLSL = /* glsl */ `
vec3 skyGradient(vec3 dir, float glow) {
  float y = dir.y;
  vec2 hd = dir.xz;
  float hl = length(hd);
  hd = hl > 1e-4 ? hd / hl : uSunH;
  float az = dot(hd, uSunH) * 0.5 + 0.5;
  vec3 hor = mix(uSkyHorizonAnti, uSkyHorizonSun, pow(az, 2.0));
  float yy = max(y, 0.0);
  float band = mix(0.3, 0.52, pow(az, 3.0));
  float g = pow(smoothstep(0.0, band, yy), 0.55);
  vec3 col = mix(hor, uSkyZenith, g);
  col += uSkyHorizonSun * 0.38 * exp(-yy * 18.0) * pow(az, 5.0);
  float belt = exp(-pow((yy - 0.085) / 0.07, 2.0)) * pow(1.0 - az, 1.6);
  col = mix(col, uSkyBelt, belt * 0.5);
  if (y < 0.0) col = mix(hor * 0.95, hor * 0.78, smoothstep(0.0, -0.3, y));
  float c = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * glow * (0.12 * pow(c, 5.0) + 0.42 * pow(c, 42.0) + 1.1 * pow(c, 380.0));
  return col;
}
vec4 cloudLayer(vec3 dir, vec3 camPos, vec4 P, float stretch, float seed) {
  float y = dir.y;
  if (y < 0.012) return vec4(0.0);
  float H = P.z - camPos.y;
  if (H < 10.0) return vec4(0.0);
  float t = H / y;
  vec2 p = camPos.xz + dir.xz * t + uTime * vec2(5.0, 1.6);
  vec2 q = p * P.w;
  q = mat2(0.94, -0.34, 0.34, 0.94) * q;
  q *= vec2(1.0, stretch);
  float n = fbm5(q + seed);
  float cov = P.x;
  float d = smoothstep(cov, cov + 0.2, n);
  if (d <= 0.0) return vec4(0.0);
  vec2 so = mat2(0.94, -0.34, 0.34, 0.94) * uSunH * vec2(1.0, stretch) * 0.16;
  float n2 = fbm3(q + so + seed);
  float edge = clamp((n - n2) * 5.0 + 0.45, 0.0, 1.0);
  vec2 hd = normalize(dir.xz);
  float az = dot(hd, uSunH) * 0.5 + 0.5;
  vec3 lit = mix(uCloudLitAnti, uCloudLitSun, pow(az, 1.6));
  float c = max(dot(dir, uSunDir), 0.0);
  vec3 col = mix(uCloudShade, lit, clamp(edge * 0.8 + 0.25 * az - d * 0.3, 0.0, 1.0));
  col *= mix(1.0, 0.62, d * pow(c, 3.0));
  col += uSunColor * pow(c, 6.0) * (1.0 - d) * 2.2;
  float fade = smoothstep(0.012, 0.09, y) * (1.0 - smoothstep(16000.0, 52000.0, t));
  return vec4(col, d * P.y * fade);
}
vec3 skyFull(vec3 dir, vec3 camPos, float withDisc) {
  vec3 col = skyGradient(dir, uSunDisc.w);
  if (withDisc > 0.5) {
    float c = dot(dir, uSunDir);
    float disc = smoothstep(uSunDisc.x, uSunDisc.y, c);
    float r = clamp((1.0 - c) / max(1.0 - uSunDisc.y, 1e-7), 0.0, 1.0);
    col += uSunColor * disc * uSunDisc.z * (0.78 + 0.22 * sqrt(max(1.0 - r, 0.0)));
  }
  vec4 ci = cloudLayer(dir, camPos, uCloudB, 1.8, 17.0);
  col = mix(col, ci.rgb * 1.04, ci.a);
  vec4 cl = cloudLayer(dir, camPos, uCloudA, 1.5, 0.0);
  col = mix(col, cl.rgb, cl.a);
  return col;
}
`;

  const AERIAL_GLSL = /* glsl */ `
vec3 aerialColor(vec3 dir) {
  vec3 d = normalize(vec3(dir.x, max(dir.y, 0.0) * 0.55 + 0.02, dir.z));
  vec3 col = skyGradient(d, 0.0);
  float c = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (0.08 * pow(c, 4.0) + 0.2 * pow(c, 22.0)) * uSunDisc.w;
  return col;
}
float aerialAmount(vec3 cam, vec3 wp, float dist) {
  float base = uFog.x * dist;
  float k = uFog.z;
  float h0 = max(cam.y - uFog.w, 0.0);
  float h1 = max(wp.y - uFog.w, 0.0);
  float dh = h1 - h0;
  float hf = abs(dh) > 0.05 ? (exp(-k * h0) - exp(-k * h1)) / (k * dh) : exp(-k * h0);
  float hd = uFog.y * dist * hf;
  return 1.0 - exp(-(base + hd) * uFogBoost);
}
vec3 applyAerial(vec3 col, vec3 wp) {
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float f = aerialAmount(cameraPosition, wp, dist);
  return mix(col, aerialColor(dir), f);
}
`;

  const TERM_GLSL = /* glsl */ `
float sunVisibility(vec3 wp) {
  if (uTermOn < 0.5) return 1.0;
  float u = dot(wp.xz, uSunH);
  float dist = uTerm.x - u;
  if (dist < 150.0) return 1.0;
  float alpha = atan(uTerm.y - wp.y, dist);
  return smoothstep(-uTerm.w, uTerm.w, uTerm.z - alpha);
}
`;

  // -------------------------------------------------- global chunk overrides
  function installChunks() {
    const C = THREE.ShaderChunk;
    C.fog_pars_vertex = UNIFORMS_GLSL + TERM_GLSL + /* glsl */ `
varying vec3 vWorldPosF;
varying float vSunVis;
#ifdef USE_AOV
  attribute float aoV;
  varying float vAOF;
#endif
#ifdef USE_EMIT
  attribute float aEmit;
  varying float vEmit;
#endif
#ifdef USE_LIT_INSTANCE
  attribute float aLit;
  varying float vLitI;
#endif
#ifdef USE_MASK
  attribute vec2 aMask;
  varying vec2 vMask;
#endif
`;
    C.fog_vertex = /* glsl */ `
vWorldPosF = transpose(mat3(viewMatrix)) * mvPosition.xyz + cameraPosition;
vSunVis = sunVisibility(vWorldPosF);
#ifdef USE_AOV
  vAOF = aoV;
#endif
#ifdef USE_EMIT
  vEmit = aEmit;
#endif
#ifdef USE_LIT_INSTANCE
  vLitI = aLit;
#endif
#ifdef USE_MASK
  vMask = aMask;
#endif
`;
    C.fog_pars_fragment = UNIFORMS_GLSL + NOISE_GLSL + SKY_GLSL + AERIAL_GLSL + /* glsl */ `
varying vec3 vWorldPosF;
varying float vSunVis;
#ifdef USE_AOV
  varying float vAOF;
#endif
#ifdef USE_EMIT
  varying float vEmit;
#endif
#ifdef USE_LIT_INSTANCE
  varying float vLitI;
#endif
#ifdef USE_MASK
  varying vec2 vMask;
#endif
`;
    C.fog_fragment = /* glsl */ `
#ifndef NO_AFOG
  gl_FragColor.rgb = applyAerial(gl_FragColor.rgb, vWorldPosF);
#endif
`;
    C.lights_fragment_begin = C.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= vSunVis;'
    );
    C.lights_fragment_end = /* glsl */ `
#if defined( RE_IndirectDiffuse ) && defined( USE_AOV )
  irradiance *= vAOF;
#endif
` + C.lights_fragment_end;
  }

  /* Per-material patch. features:
   *   wind: {amt}            vertex sway (uses optional aSway attribute)
   *   translucent: k         back-lit foliage glow
   *   fields: true           terrain detail + field patchwork (needs aMask)
   *   emit: true             lamp-lit windows (aEmit; optional instance aLit)
   *   aov: true              ambient occlusion attribute (aoV)
   *   noFog: true
   *   extraVertex / extraFragment: code hooks
   */
  function patch(mat, features = {}) {
    const defs = mat.defines || (mat.defines = {});
    if (features.aov) defs.USE_AOV = '';
    if (features.emit) defs.USE_EMIT = '';
    if (features.litInstance) defs.USE_LIT_INSTANCE = '';
    if (features.mask) defs.USE_MASK = '';
    if (features.noFog) defs.NO_AFOG = '';
    const key = JSON.stringify(Object.keys(features).sort()) + (features.key || '');
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, G);
      if (features.uniforms) Object.assign(shader.uniforms, features.uniforms);
      let vs = shader.vertexShader;
      let fs = shader.fragmentShader;
      if (features.wind) {
        vs = vs.replace('#include <common>', '#include <common>\nattribute float aSway;');
        vs = vs.replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
{
  vec4 wq = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wq = instanceMatrix * wq;
  #endif
  wq = modelMatrix * wq;
  float ph = wq.x * 0.043 + wq.z * 0.037;
  float gust = 0.65 + 0.35 * sin(uTime * 0.37 + wq.x * 0.004);
  float sway = (sin(uTime * 1.35 + ph) * 0.62 + sin(uTime * 2.9 + ph * 2.3) * 0.22) * gust;
  float hgt = max(transformed.y, 0.0);
  float amt = uWind.z * (${(features.wind.trunk || 0.0012).toFixed(5)} * hgt * hgt + ${(features.wind.leaf || 0.25).toFixed(3)} * aSway);
  vec3 wdir = vec3(uWind.x, 0.0, uWind.y);
  #ifdef USE_INSTANCING
    wdir = transpose(mat3(instanceMatrix)) * wdir;
  #endif
  transformed += wdir * sway * amt;
  transformed.y -= abs(sway) * amt * 0.25 * aSway;
}`);
      }
      if (features.extraVertex) vs = features.extraVertex(vs);
      if (features.translucent) {
        fs = fs.replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
{
  vec3 vdir = normalize(vWorldPosF - cameraPosition);
  float bl = pow(max(dot(vdir, uSunDir), 0.0), 3.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * uSunLight * vSunVis * bl * ${Number(features.translucent).toFixed(3)};
}`);
      }
      if (features.emit) {
        fs = fs.replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
{
  float lit = 1.0;
  #ifdef USE_LIT_INSTANCE
    lit = vLitI;
  #endif
  float flick = 0.92 + 0.08 * sin(uTime * 7.0 + vWorldPosF.x * 3.1 + vWorldPosF.z * 1.7);
  totalEmissiveRadiance += uLampColor * vEmit * uLamp * lit * flick * ${(features.emitGain || 3.0).toFixed(2)};
}`);
      }
      if (features.extraFragment) fs = features.extraFragment(fs);
      shader.vertexShader = vs;
      shader.fragmentShader = fs;
    };
    mat.customProgramCacheKey = () => key;
    mat.userData.patched = true;
    return mat;
  }

  // Standard material factories (all patched).
  function lambert(opts = {}, features = {}) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, opts));
    return patch(m, features);
  }
  function standard(opts = {}, features = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.8, metalness: 0 }, opts));
    return patch(m, features);
  }

  // Custom ShaderMaterial helpers include the same GLSL.
  const COMMON_FRAG = UNIFORMS_GLSL + NOISE_GLSL + SKY_GLSL + AERIAL_GLSL;
  const COMMON_VERT = UNIFORMS_GLSL + TERM_GLSL;

  return { G, installChunks, patch, lambert, standard, COMMON_FRAG, COMMON_VERT, NOISE_GLSL, SKY_GLSL, AERIAL_GLSL, TERM_GLSL };
})();
