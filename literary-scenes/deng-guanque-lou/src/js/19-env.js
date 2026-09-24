/* ==========================================================================
 * 19-env.js — one source of truth for light and atmosphere. Everything
 * (sky, fog, sun, ambient, clouds, lamps, exposure) derives from the sun's
 * elevation so time-of-day stays coherent across sky, water and land.
 * ========================================================================== */
const Env = (() => {
  const SUN_H = new THREE.Vector2(-0.94, 0.34).normalize(); // toward WSW
  const SUN_RADIUS = 0.5 * U.DEG; // drawn a little larger than life
  let ridge = { u: 11000, h: 480, angle: 2.3 * U.DEG };

  // Keys by sun elevation (degrees), descending.
  const E = [6, 4, 2.5, 1.5, 0.5, -1, -3];
  const K = {
    zenith:      [0x4a6488, 0x486083, 0x455a7c, 0x415374, 0x3b4a69, 0x2f3c57, 0x222c43],
    horSun:      [0xe9c088, 0xebb070, 0xea9e5e, 0xe68d52, 0xdc7a48, 0xc25e3e, 0x95463a],
    horAnti:     [0xa6adbd, 0xaea8b8, 0xb3a2b2, 0xb296aa, 0xa78aa1, 0x857592, 0x5d5676],
    belt:        [0xc9aeb5, 0xcfa8b2, 0xd4a0ad, 0xd697a8, 0xcc8aa1, 0xa77892, 0x7a6480],
    sunCol:      [0xfff0d6, 0xffe2b8, 0xffd09a, 0xffbf82, 0xffa566, 0xff8c52, 0xff7446],
    cloudSun:    [0xffe8c4, 0xffd9a6, 0xffc588, 0xffb070, 0xff9760, 0xf07a5e, 0xc55a58],
    cloudAnti:   [0xf1d8c8, 0xf2cdbd, 0xf0bfb6, 0xecb0ae, 0xe29ea8, 0xc4889f, 0x8f7390],
    cloudShade:  [0x7f8298, 0x797991, 0x73708b, 0x6d6784, 0x655d7c, 0x514b68, 0x3a3852],
    hemiSky:     [0x9fb6d6, 0xa3b2d4, 0xa8accf, 0xa9a4c8, 0xa29abd, 0x8580a3, 0x656887],
    hemiGround:  [0x9a8062, 0x987b5e, 0x94765b, 0x8e6f58, 0x846553, 0x6a5249, 0x4b3c3d],
  };
  const SUN_INT = [4.0, 3.8, 3.5, 3.1, 2.6, 1.9, 1.4];
  const HEMI_INT = [1.75, 1.72, 1.68, 1.64, 1.58, 1.45, 1.2];
  const EXPO = [0.86, 0.87, 0.89, 0.93, 0.99, 1.14, 1.34];
  const DISC = [26, 24, 22, 20, 18, 15, 12];

  const _ca = new THREE.Color(), _cb = new THREE.Color();
  function key(list, e, out) {
    const n = E.length;
    let i = 0;
    if (e >= E[0]) { out.set(list[0]); return out; }
    if (e <= E[n - 1]) { out.set(list[n - 1]); return out; }
    while (i < n - 1 && e < E[i + 1]) i++;
    const t = (E[i] - e) / (E[i] - E[i + 1]);
    _ca.set(list[i]);
    _cb.set(list[i + 1]);
    out.copy(_ca).lerp(_cb, t);
    return out;
  }
  function num(list, e) {
    const n = E.length;
    if (e >= E[0]) return list[0];
    if (e <= E[n - 1]) return list[n - 1];
    let i = 0;
    while (i < n - 1 && e < E[i + 1]) i++;
    const t = (E[i] - e) / (E[i] - E[i + 1]);
    return U.lerp(list[i], list[i + 1], t);
  }

  let sunLight = null, hemi = null;
  const sunDir = new THREE.Vector3();

  function init(scene, quality) {
    ridge = Terrain.ridgeTowardSun(SUN_H.x, SUN_H.y, 47);
    hemi = new THREE.HemisphereLight(0xbbccdd, 0x8a7055, 2.2);
    scene.add(hemi);
    sunLight = new THREE.DirectionalLight(0xffe0b0, 3);
    sunLight.castShadow = !!quality.shadows;
    sunLight.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    const sc = sunLight.shadow.camera;
    sc.left = -64; sc.right = 64; sc.top = 64; sc.bottom = -64;
    sc.near = 10; sc.far = 1400;
    sunLight.shadow.bias = -0.00035;
    sunLight.shadow.normalBias = 0.12;
    sunLight.shadow.radius = 2.2;
    sunLight.target.position.set(0, 48, 0);
    scene.add(sunLight);
    scene.add(sunLight.target);
    return { sunLight, hemi };
  }

  // state: { elev (deg), lamp?, vision?, fogBoost?, shadowCenter? }
  const G = SL.G;
  function apply(state) {
    const e = state.elev;
    const er = e * U.DEG;
    sunDir.set(SUN_H.x * Math.cos(er), Math.sin(er), SUN_H.y * Math.cos(er)).normalize();
    G.uSunDir.value.copy(sunDir);
    G.uSunH.value.copy(SUN_H);
    key(K.zenith, e, G.uSkyZenith.value);
    key(K.horSun, e, G.uSkyHorizonSun.value);
    key(K.horAnti, e, G.uSkyHorizonAnti.value);
    key(K.belt, e, G.uSkyBelt.value);
    key(K.sunCol, e, G.uSunColor.value);
    key(K.cloudSun, e, G.uCloudLitSun.value);
    key(K.cloudAnti, e, G.uCloudLitAnti.value);
    key(K.cloudShade, e, G.uCloudShade.value);
    const cosIn = Math.cos(SUN_RADIUS), cosOut = Math.cos(SUN_RADIUS + 0.06 * U.DEG);
    G.uSunDisc.value.set(cosOut, cosIn, num(DISC, e), state.vision ? 1.1 : 1.0);
    G.uTerm.value.set(ridge.u, ridge.h, er, SUN_RADIUS);
    G.uTermOn.value = state.vision ? 0 : 1;
    // fog / haze
    const boost = state.fogBoost || 1;
    G.uFogBoost.value = boost;
    if (state.vision) G.uFog.value.set(1 / 90000, 1 / 26000, 1 / 500, 0);
    else G.uFog.value.set(1 / 30000, 1 / 9500, 1 / 260, 0);
    // lights
    const si = num(SUN_INT, e);
    if (sunLight) {
      sunLight.color.copy(G.uSunColor.value);
      sunLight.intensity = si;
      const c = state.shadowCenter || [0, 48, 0];
      sunLight.target.position.set(c[0], c[1], c[2]);
      sunLight.position.set(c[0] + sunDir.x * 700, c[1] + sunDir.y * 700, c[2] + sunDir.z * 700);
      sunLight.target.updateMatrixWorld();
    }
    G.uSunLight.value.copy(G.uSunColor.value).multiplyScalar(si);
    if (hemi) {
      key(K.hemiSky, e, hemi.color);
      key(K.hemiGround, e, hemi.groundColor);
      hemi.intensity = num(HEMI_INT, e);
    }
    // lamps come on after sunset (or as staged)
    const autoLamp = U.smoothstep(1.2, -0.7, e);
    G.uLamp.value = state.lamp !== undefined ? state.lamp : autoLamp;
    // post
    Post.params.exposure = num(EXPO, e) * (state.exposure || 1);
    Post.params.warmth = U.smoothstep(6, 0.5, e);
    Post.params.bloomThreshold = 1.35;
    Post.params.bloom = 0.42;
    return { sunDir, sunIntensity: si };
  }

  // Ambient colour for custom water shaders (hemisphere sky / π)
  function ambientColor(out) {
    if (!hemi) return out.setRGB(0.5, 0.5, 0.55);
    return out.copy(hemi.color).lerp(hemi.groundColor, 0.25).multiplyScalar(hemi.intensity / Math.PI);
  }

  // Fraction of the sun disc visible from a world point (matches the shader).
  function sunVisibilityAt(p, elevDeg) {
    const u = p.x * SUN_H.x + p.z * SUN_H.y;
    const dist = ridge.u - u;
    if (dist < 150) return 1;
    const alpha = Math.atan2(ridge.h - p.y, dist);
    return U.smoothstep(-SUN_RADIUS, SUN_RADIUS, elevDeg * U.DEG - alpha);
  }

  return {
    init, apply, ambientColor, sunVisibilityAt, SUN_H, SUN_RADIUS,
    get ridge() { return ridge; },
    get sunDir() { return sunDir; },
    get sunLight() { return sunLight; },
    get hemi() { return hemi; },
  };
})();
