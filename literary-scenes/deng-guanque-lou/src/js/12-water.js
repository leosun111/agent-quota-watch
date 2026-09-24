/* ==========================================================================
 * 12-water.js — the Yellow River ribbon (flow-aligned UVs, muddy body colour,
 * sky reflection, sun glitter, bank foam) and the sea used by the vision.
 * ========================================================================== */
const Water = (() => {
  const WATER_GLSL = /* glsl */ `
uniform vec3 uAmbient;
uniform vec3 uWaterDeep;
uniform vec3 uWaterLight;
uniform vec3 uFoamCol;
uniform float uFlow;
uniform float uGlitter;
float waveH(vec2 p, float t, float fine) {
  float h = 0.0;
  h += 0.55 * vnoise(vec2(p.x * 0.045 - t * 0.10, p.y * 0.075));
  h += 0.30 * vnoise(vec2(p.x * 0.14 - t * 0.36, p.y * 0.19 + 3.1));
  h += 0.16 * fine * vnoise(vec2(p.x * 0.42 - t * 1.05, p.y * 0.55 + 7.7));
  h += 0.08 * fine * vnoise(vec2(p.x * 1.2 - t * 2.4, p.y * 1.5 + 1.3));
  return h;
}
`;

  // Bed height texture (rows = centreline samples, columns = across) lets
  // the shader find shallows, sandbar edges and bank foam.
  const BED_COLS = 48;
  function bedTexture(S, margin) {
    const data = new Uint16Array(S.length * BED_COLS);
    for (let i = 0; i < S.length; i++) {
      const p = S[i];
      const half = p.w * 0.5 + margin;
      const lx = p.tz, lz = -p.tx;
      for (let k = 0; k < BED_COLS; k++) {
        const v = -half + (2 * half * (k + 0.5)) / BED_COLS;
        const h = Terrain.heightAt(p.x + lx * v, p.z + lz * v);
        data[i * BED_COLS + k] = THREE.DataUtils.toHalfFloat(h);
      }
    }
    const tex = new THREE.DataTexture(data, BED_COLS, S.length, THREE.RedFormat, THREE.HalfFloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  function riverMesh() {
    const S = Terrain.river.samples;
    const across = 12;
    const pos = [], uv = [], uv2 = [], tan = [], wid = [], idx = [];
    const margin = 34;
    let rows = 0;
    for (let i = 0; i < S.length; i += 1) {
      const p = S[i];
      const W = p.w * 0.5;
      const half = W + margin;
      const lx = p.tz, lz = -p.tx; // left-bank direction
      for (let k = 0; k <= across; k++) {
        const v = -half + (2 * half * k) / across;
        pos.push(p.x + lx * v, 0, p.z + lz * v);
        uv.push(p.s, v);
        // texel centres: column (k/across) mapped into [0.5/C, 1-0.5/C]
        uv2.push((k / across) * (1 - 1 / BED_COLS) + 0.5 / BED_COLS, (i + 0.5) / S.length);
        tan.push(p.tx, p.tz);
        wid.push(W);
      }
      rows++;
    }
    const bedTex = bedTexture(S, margin);
    const cols = across + 1;
    for (let r = 0; r < rows - 1; r++) {
      for (let k = 0; k < across; k++) {
        const a = r * cols + k, b = a + 1, c = a + cols, d = c + 1;
        // orientation chosen so faces point up
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aBedUv', new THREE.Float32BufferAttribute(uv2, 2));
    g.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 2));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(wid, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    // check orientation: flip if the first triangle faces down
    const P = g.attributes.position;
    const ax = P.getX(idx[0]), az = P.getZ(idx[0]);
    const bx = P.getX(idx[1]), bz = P.getZ(idx[1]);
    const cx = P.getX(idx[2]), cz = P.getZ(idx[2]);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny < 0) {
      const arr = g.index.array;
      for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t; }
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({
        uAmbient: { value: new THREE.Color(0.5, 0.5, 0.55) },
        uWaterDeep: { value: new THREE.Color(0x6e5636) },
        uWaterLight: { value: new THREE.Color(0xa08257) },
        uFoamCol: { value: new THREE.Color(0xd6cbb1) },
        uFlow: { value: 1.0 },
        uGlitter: { value: 1.0 },
        uBed: { value: bedTex },
      }, SL.G),
      vertexShader: SL.COMMON_VERT + /* glsl */ `
attribute vec2 aTan;
attribute float aW;
attribute vec2 aBedUv;
varying vec2 vBedUv;
varying vec2 vUv;
varying vec2 vTan;
varying float vW;
varying vec3 vWP;
varying float vSunVisW;
void main() {
  vUv = uv;
  vBedUv = aBedUv;
  vTan = aTan;
  vW = aW;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vSunVisW = sunVisibility(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
      fragmentShader: SL.COMMON_FRAG + WATER_GLSL + /* glsl */ `
uniform sampler2D uBed;
varying vec2 vBedUv;
varying vec2 vUv;
varying vec2 vTan;
varying float vW;
varying vec3 vWP;
varying float vSunVisW;
void main() {
  vec3 toP = vWP - cameraPosition;
  float dist = length(toP);
  vec3 V = toP / dist;
  float t = uTime * uFlow;
  float fine = 1.0 - smoothstep(150.0, 1400.0, dist);
  vec2 p = vUv;
  float e = mix(2.6, 0.6, fine);
  float h0 = waveH(p, t, fine);
  float hs = waveH(p + vec2(e, 0.0), t, fine);
  float hv = waveH(p + vec2(0.0, e), t, fine);
  float amp = mix(0.08, 0.34, fine);
  vec2 g = vec2(hs - h0, hv - h0) / e * amp * 10.0;
  vec3 T = vec3(vTan.x, 0.0, vTan.y);
  vec3 B = vec3(vTan.y, 0.0, -vTan.x);
  vec3 N = normalize(vec3(0.0, 1.0, 0.0) - T * g.x - B * g.y);
  float ndv = max(dot(-V, N), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(V, N);
  R.y = max(R.y, 0.02);
  vec3 sky = skyFull(normalize(R), cameraPosition, 0.0);
  // bed depth under this point (positive = under water)
  float depth = -texture2D(uBed, vBedUv).r;
  if (depth < -0.05) discard;
  float shallow = 1.0 - smoothstep(0.2, 2.6, depth);
  // muddy body: lit mostly by sky, a little by the low sun
  float sediment = 0.5 + 0.5 * vnoise(vec2(p.x * 0.012 - t * 0.02, p.y * 0.02));
  vec3 body = mix(uWaterDeep, uWaterLight, sediment * 0.45 + 0.2 * h0 + shallow * 0.35);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = body * (uAmbient + uSunLight * vSunVisW * (0.35 + ndl) * 0.55);
  vec3 col = mix(lit, sky, fres * 0.85);
  // glitter path of the low sun
  vec3 H = normalize(uSunDir - V);
  float nh = max(dot(N, H), 0.0);
  float shin = mix(90.0, 520.0, fine);
  float spec = pow(nh, shin) * mix(10.0, 55.0, fine);
  spec += pow(nh, 36.0) * 0.9;
  col += uSunColor * spec * vSunVisW * uGlitter * (0.5 + 0.5 * h0);
  // foam lines along banks and sandbars, silt streaks in the current
  float streak = vnoise(vec2(p.x * 0.03 - t * 0.5, p.y * 0.4));
  float edgeFoam = (1.0 - smoothstep(0.05, 0.55, depth)) * smoothstep(0.3, 0.75, streak + 0.35 * h0);
  float silt = smoothstep(0.6, 0.85, vnoise(vec2(p.x * 0.008 - t * 0.12, p.y * 0.05 + 5.0))) * 0.18;
  vec3 foamLit = uFoamCol * (uAmbient * 1.1 + uSunLight * vSunVisW * 0.4);
  col = mix(col, foamLit, clamp(edgeFoam * 0.75, 0.0, 1.0));
  col = mix(col, uWaterLight * (uAmbient + uSunLight * vSunVisW * 0.3), silt * (1.0 - fres));
  col = applyAerial(col, vWP);
  gl_FragColor = vec4(col, 1.0);
}`,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.userData.pick = 'river';
    mesh.renderOrder = 1;
    return mesh;
  }

  // Sea surface for the imagined estuary: deep blue-green with a yellow plume.
  function seaMesh(opts) {
    const geo = new THREE.PlaneGeometry(opts.size, opts.size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({
        uAmbient: { value: new THREE.Color(0.5, 0.5, 0.55) },
        uWaterDeep: { value: new THREE.Color(0x1d4a5c) },
        uWaterLight: { value: new THREE.Color(0x2f7482) },
        uFoamCol: { value: new THREE.Color(0xe9e2d0) },
        uPlume: { value: new THREE.Color(0x8a7550) },
        uMouth: { value: new THREE.Vector3(opts.mouth[0], opts.mouth[1], opts.mouthR) },
        uCoastX: { value: opts.coastX },
        uFlow: { value: 1 },
        uGlitter: { value: 1 },
      }, SL.G),
      vertexShader: /* glsl */ `
varying vec3 vWP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
      fragmentShader: SL.COMMON_FRAG + WATER_GLSL + /* glsl */ `
uniform vec3 uPlume;
uniform vec3 uMouth;
uniform float uCoastX;
varying vec3 vWP;
void main() {
  vec3 toP = vWP - cameraPosition;
  float dist = length(toP);
  vec3 V = toP / dist;
  float t = uTime;
  float fine = 1.0 - smoothstep(600.0, 9000.0, dist);
  vec2 p = vWP.xz;
  // swell from the east + chop
  float e = mix(8.0, 2.0, fine);
  float h0 = 0.6 * vnoise(p * 0.004 + vec2(-t * 0.03, 0.0)) + 0.3 * vnoise(p * 0.013 + vec2(-t * 0.08, 1.0)) + 0.15 * fine * vnoise(p * 0.05 + vec2(-t * 0.3, 3.0));
  float hx = 0.6 * vnoise((p + vec2(e, 0.0)) * 0.004 + vec2(-t * 0.03, 0.0)) + 0.3 * vnoise((p + vec2(e, 0.0)) * 0.013 + vec2(-t * 0.08, 1.0)) + 0.15 * fine * vnoise((p + vec2(e, 0.0)) * 0.05 + vec2(-t * 0.3, 3.0));
  float hz = 0.6 * vnoise((p + vec2(0.0, e)) * 0.004 + vec2(-t * 0.03, 0.0)) + 0.3 * vnoise((p + vec2(0.0, e)) * 0.013 + vec2(-t * 0.08, 1.0)) + 0.15 * fine * vnoise((p + vec2(0.0, e)) * 0.05 + vec2(-t * 0.3, 3.0));
  vec2 g = vec2(hx - h0, hz - h0) / e * mix(4.0, 22.0, fine);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float ndv = max(dot(-V, N), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(V, N);
  R.y = max(R.y, 0.015);
  vec3 sky = skyFull(normalize(R), cameraPosition, 0.0);
  // yellow river plume fanning out from the mouth, sharp 黄蓝 boundary
  vec2 rel = p - uMouth.xy;
  float ang = atan(rel.y, rel.x);
  float warp = 0.28 * (vnoise(p * 0.00035 + 2.0) - 0.5) + 0.12 * (vnoise(p * 0.0015) - 0.5);
  float plumeR = uMouth.z * (0.75 + 0.5 * cos(ang * 1.4 + 0.3)) * (1.0 + warp * 2.2);
  float r = length(rel);
  float streaks = vnoise(p * 0.0022 + vec2(t * 0.01, 0.0)) * 0.5 + vnoise(p * 0.009) * 0.25;
  float plume = 1.0 - smoothstep(plumeR * (0.55 + streaks * 0.3), plumeR * (1.0 + streaks * 0.08), r);
  plume *= smoothstep(-0.95, -0.35, cos(ang));
  plume = max(plume, 1.0 - smoothstep(uCoastX - 700.0, uCoastX + 500.0, vWP.x));
  vec3 blue = mix(uWaterDeep, uWaterLight, 0.35 + 0.35 * h0);
  vec3 body = mix(blue, uPlume * (0.85 + 0.3 * h0), plume);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = body * (uAmbient + uSunLight * (0.3 + ndl) * 0.5);
  vec3 col = mix(lit, sky, fres * mix(0.38, 0.5, plume));
  vec3 H = normalize(uSunDir - V);
  float nh = max(dot(N, H), 0.0);
  col += uSunColor * (pow(nh, mix(120.0, 600.0, fine)) * mix(8.0, 40.0, fine) + pow(nh, 30.0) * 0.6) * uGlitter;
  // whitecaps along the plume front and in the swell
  float front = smoothstep(plumeR * 0.93, plumeR * 0.99, r) * (1.0 - smoothstep(plumeR * 0.99, plumeR * 1.03, r)) * smoothstep(uCoastX, uCoastX + 800.0, vWP.x);
  float caps = smoothstep(0.9, 0.98, h0 + 0.15 * vnoise(p * 0.3 + t * 0.2)) * fine * (1.0 - plume);
  col = mix(col, uFoamCol * (uAmbient + uSunLight * 0.5), clamp(front * 0.1 + caps * 0.35, 0.0, 1.0));
  col = applyAerial(col, vWP);
  gl_FragColor = vec4(col, 1.0);
}`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(opts.center[0], 0, opts.center[1]);
    return m;
  }

  return { riverMesh, seaMesh };
})();
