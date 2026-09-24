/* ==========================================================================
 * 20-post.js — HDR scene target → bloom (dual-filter) → sun shafts →
 * filmic tone map, warm cinematic grade, vignette, fades and cloud wipes.
 * ========================================================================== */
const Post = (() => {
  let R = null; // renderer
  let Q = null; // quality
  let rtScene = null;
  const down = [];
  const up = [];
  let rtGod = null;
  let fsScene, fsCam, fsMesh;
  let matBright, matDown, matUp, matGod, matComp;
  let W = 1, H = 1;

  const params = {
    exposure: 1.0,
    bloom: 0.55,
    bloomThreshold: 1.05,
    god: 0.0,
    sunScreen: new THREE.Vector2(0.5, 0.5),
    sunVisibleOnScreen: 0,
    fade: 0,
    fadeColor: new THREE.Color(0, 0, 0),
    cloud: 0,
    vignette: 0.32,
    grain: 0.02,
    warmth: 0.0,
    saturation: 1.0,
    time: 0,
  };

  const VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  function makeMat(frag, uniforms) {
    return new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: frag,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
  }

  function init(renderer, quality) {
    R = renderer;
    Q = quality;
    fsScene = new THREE.Scene();
    fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    fsMesh = new THREE.Mesh(tri, null);
    fsMesh.frustumCulled = false;
    fsScene.add(fsMesh);

    matBright = makeMat(/* glsl */ `
uniform sampler2D tSrc; uniform float uThreshold; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  if (!(l >= 0.0) || l > 6.0e4) { c = vec3(0.0); l = 0.0; }
  c = min(c, vec3(60.0));
  l = min(l, 60.0);
  float soft = clamp(l - uThreshold + 0.5, 0.0, 1.0);
  soft = soft * soft * 0.5;
  float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * contrib, 1.0);
}`, { tSrc: { value: null }, uThreshold: { value: 1 } });

    matDown = makeMat(/* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });

    matUp = makeMat(/* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel; uniform float uAddW; varying vec2 vUv;
void main() {
  vec3 s = vec3(0.0);
  s += texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2( 2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2(0.0,  2.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb * 2.0;
  s /= 12.0;
  gl_FragColor = vec4(s + texture2D(tAdd, vUv).rgb * uAddW, 1.0);
}`, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uAddW: { value: 1 } });

    matGod = makeMat(/* glsl */ `
uniform sampler2D tSrc; uniform vec2 uSun; uniform float uAspect; varying vec2 vUv;
void main() {
  vec2 d = (vUv - uSun);
  vec2 stepv = d / 40.0 * 0.92;
  vec2 uv = vUv;
  float decay = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    uv -= stepv;
    vec3 s = texture2D(tSrc, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
    acc += s * decay;
    decay *= 0.955;
  }
  float falloff = 1.0 - smoothstep(0.0, 0.9, length(d * vec2(uAspect, 1.0)));
  gl_FragColor = vec4(acc / 40.0 * falloff, 1.0);
}`, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } });

    matComp = makeMat(/* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tGod;
uniform float uBloom; uniform float uGod; uniform float uExposure;
uniform float uFade; uniform vec3 uFadeColor; uniform float uCloud;
uniform float uVignette; uniform float uGrain; uniform float uTime; uniform float uWarmth; uniform float uSat;
uniform vec2 uRes;
varying vec2 vUv;
vec3 aces(vec3 x) {
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y); }
float fb(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  if (!(c.r + c.g + c.b >= 0.0) || c.r + c.g + c.b > 1.0e5) c = vec3(0.0);
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c += texture2D(tGod, vUv).rgb * uGod;
  c *= uExposure;
  c = aces(c);
  // cinematic grade in display space: warm highlights, slightly cool shadows
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadowTint = vec3(0.94, 0.99, 1.06);
  vec3 highTint = vec3(1.05 + uWarmth * 0.05, 1.0, 0.93 - uWarmth * 0.05);
  c *= mix(shadowTint, highTint, smoothstep(0.1, 0.75, l));
  c = mix(vec3(l), c, uSat);
  // gentle S-curve for depth
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);
  // soft vignette
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y * 0.75;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.95, length(q));
  vec3 outc = toSRGB(c);
  // cloud wipe (rising through cloud)
  if (uCloud > 0.001) {
    vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0) * 2.2;
    float n = fb(p + vec2(0.0, -uTime * 0.12)) * 0.75 + fb(p * 2.3 + vec2(3.0, -uTime * 0.2)) * 0.25;
    float thr = 1.15 - uCloud * 1.35;
    float a = smoothstep(thr, thr + 0.28, n);
    vec3 cc = mix(vec3(0.93, 0.86, 0.80), vec3(1.0, 0.95, 0.87), smoothstep(0.3, 0.8, n));
    cc = mix(cc, vec3(1.0, 0.9, 0.74), (1.0 - vUv.y) * 0.25);
    outc = mix(outc, cc, clamp(a, 0.0, 1.0));
  }
  outc = mix(outc, uFadeColor, uFade);
  outc += (h12(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * uGrain;
  gl_FragColor = vec4(outc, 1.0);
}`, {
      tScene: { value: null }, tBloom: { value: null }, tGod: { value: null },
      uBloom: { value: 0.5 }, uGod: { value: 0 }, uExposure: { value: 1 },
      uFade: { value: 0 }, uFadeColor: { value: new THREE.Color() }, uCloud: { value: 0 },
      uVignette: { value: 0.3 }, uGrain: { value: 0.02 }, uTime: { value: 0 }, uWarmth: { value: 0 }, uSat: { value: 1 },
      uRes: { value: new THREE.Vector2(1, 1) },
    });
  }

  function dispose() {
    if (rtScene) rtScene.dispose();
    for (const r of down) r.dispose();
    for (const r of up) r.dispose();
    if (rtGod) rtGod.dispose();
    down.length = 0;
    up.length = 0;
  }

  function resize(w, h, quality) {
    Q = quality || Q;
    W = Math.max(1, Math.floor(w));
    H = Math.max(1, Math.floor(h));
    dispose();
    const opts = { type: THREE.HalfFloatType, depthBuffer: true, samples: Q.msaa || 0 };
    rtScene = new THREE.WebGLRenderTarget(W, H, opts);
    rtScene.texture.minFilter = THREE.LinearFilter;
    let w2 = Math.max(1, W >> 1), h2 = Math.max(1, H >> 1);
    for (let i = 0; i < Q.bloomLevels; i++) {
      const o = { type: THREE.HalfFloatType, depthBuffer: false };
      const d = new THREE.WebGLRenderTarget(w2, h2, o);
      const u = new THREE.WebGLRenderTarget(w2, h2, o);
      d.texture.minFilter = u.texture.minFilter = THREE.LinearFilter;
      down.push(d);
      up.push(u);
      w2 = Math.max(1, w2 >> 1);
      h2 = Math.max(1, h2 >> 1);
    }
    rtGod = new THREE.WebGLRenderTarget(Math.max(1, W >> 2), Math.max(1, H >> 2), { type: THREE.HalfFloatType, depthBuffer: false });
    matComp.uniforms.uRes.value.set(W, H);
  }

  function pass(mat, target) {
    fsMesh.material = mat;
    R.setRenderTarget(target);
    R.render(fsScene, fsCam);
  }

  function render(scene, camera) {
    R.setRenderTarget(rtScene);
    R.clear();
    R.render(scene, camera);

    // bloom
    matBright.uniforms.tSrc.value = rtScene.texture;
    matBright.uniforms.uThreshold.value = params.bloomThreshold;
    pass(matBright, down[0]);
    for (let i = 1; i < down.length; i++) {
      matDown.uniforms.tSrc.value = down[i - 1].texture;
      matDown.uniforms.uTexel.value.set(1 / down[i - 1].width, 1 / down[i - 1].height);
      pass(matDown, down[i]);
    }
    // upsample chain
    let src = down[down.length - 1];
    for (let i = down.length - 2; i >= 0; i--) {
      matUp.uniforms.tSrc.value = src.texture;
      matUp.uniforms.tAdd.value = down[i].texture;
      matUp.uniforms.uAddW.value = 1.0;
      matUp.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      pass(matUp, up[i]);
      src = up[i];
    }
    const bloomTex = down.length > 1 ? up[0].texture : down[0].texture;
    const bloomNorm = 1 / Math.max(1, down.length * 0.6);

    // sun shafts
    let god = 0;
    if (Q.godrays && params.god > 0.001 && params.sunVisibleOnScreen > 0.001) {
      matGod.uniforms.tSrc.value = down[0].texture;
      matGod.uniforms.uSun.value.copy(params.sunScreen);
      matGod.uniforms.uAspect.value = W / H;
      pass(matGod, rtGod);
      god = params.god * params.sunVisibleOnScreen;
    }

    const u = matComp.uniforms;
    u.tScene.value = rtScene.texture;
    u.tBloom.value = bloomTex;
    u.tGod.value = rtGod.texture;
    u.uBloom.value = params.bloom * bloomNorm;
    u.uGod.value = god;
    u.uExposure.value = params.exposure;
    u.uFade.value = params.fade;
    u.uFadeColor.value.copy(params.fadeColor);
    u.uCloud.value = params.cloud;
    u.uVignette.value = params.vignette;
    u.uGrain.value = params.grain;
    u.uTime.value = params.time;
    u.uWarmth.value = params.warmth;
    u.uSat.value = params.saturation;
    pass(matComp, null);
  }

  return { init, resize, render, params, get size() { return [W, H]; } };
})();
