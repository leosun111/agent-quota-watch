/* ==========================================================================
 * 11-sky.js — sky dome (gradient, sun disc, two cloud decks) and billboard
 * cloud banks for the painterly towering clouds seen near the horizon.
 * ========================================================================== */
const Sky = (() => {
  let dome = null;

  function createDome() {
    const geo = new THREE.SphereGeometry(1, 96, 48);
    const mat = new THREE.ShaderMaterial({
      uniforms: SL.G,
      vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`,
      fragmentShader: SL.COMMON_FRAG + /* glsl */ `
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyFull(dir, cameraPosition, 1.0);
  // faint dither against banding in the smooth gradient
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
    });
    dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    dome.scale.setScalar(1000);
    dome.userData.pick = 'sky';
    return dome;
  }

  function follow(camera) {
    if (dome) dome.position.copy(camera.position);
  }

  /* ---------- Cloud banks: soft puffs arranged into cumulus masses. ---------- */
  function puffTexture() {
    return U.canvasTexture(128, 128, (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      const n = U.makeSimplex(77);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2);
          const r = Math.sqrt(dx * dx + dy * dy);
          const edge = U.fbm(n, x / 22, y / 22, 4) * 0.28;
          const a = U.clamp(1 - U.smoothstep(0.45 + edge, 1.0 + edge * 0.4, r), 0, 1);
          const k = (y * w + x) * 4;
          // top-lit shading baked into the grey value (lighter at the top)
          const lit = U.clamp(0.72 + 0.28 * (-dy) + 0.12 * U.fbm(n, x / 14 + 9, y / 14, 3), 0, 1);
          img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * lit);
          img.data[k + 3] = Math.round(255 * a);
        }
      }
      ctx.putImageData(img, 0, 0);
    }, { mipmaps: true });
  }

  // Instanced camera-facing puffs. Each bank = cluster of puffs.
  function createCloudBanks(banks, density = 1, seed = 5) {
    const r = U.rng(seed);
    const list = [];
    for (const b of banks) {
      const count = Math.max(6, Math.round(b.count * density));
      for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2;
        const rr = Math.sqrt(r()) * b.radius;
        const up = Math.pow(r(), 0.8);
        const x = b.x + Math.cos(a) * rr * b.stretch;
        const z = b.z + Math.sin(a) * rr;
        const y = b.y + up * b.height * (1 - (rr / b.radius) * 0.6);
        const size = b.puff * (0.55 + 0.7 * r()) * (1 - up * 0.35);
        list.push({ x, y, z, size, shade: 0.55 + 0.45 * up, tint: b.tint || 0 });
      }
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uMap: { value: puffTexture() }, uOpacity: { value: 1 } }, SL.G),
      vertexShader: SL.COMMON_VERT + /* glsl */ `
attribute vec4 aPuff;   // x,y,z centre, size
attribute vec2 aShade;  // shade, tint
varying vec2 vUv;
varying vec3 vWP;
varying float vShade;
varying float vTint;
void main() {
  vUv = uv;
  vShade = aShade.x;
  vTint = aShade.y;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = aPuff.xyz + (camR * position.x + camU * position.y) * aPuff.w;
  vWP = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
      fragmentShader: SL.COMMON_FRAG + /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWP;
varying float vShade;
varying float vTint;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.01) discard;
  vec3 dir = normalize(vWP - cameraPosition);
  vec2 hd = normalize(dir.xz);
  float az = dot(hd, uSunH) * 0.5 + 0.5;
  vec3 lit = mix(uCloudLitAnti, uCloudLitSun, pow(az, 1.4));
  float s = t.r * vShade;
  vec3 col = mix(uCloudShade * 0.95, lit * 1.05, smoothstep(0.25, 0.95, s));
  col = mix(col, uSkyBelt * 1.1, vTint * 0.35);
  float c = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * pow(c, 6.0) * 0.6 * (1.0 - t.a * 0.5);
  col = applyAerial(col, vWP);
  gl_FragColor = vec4(col, t.a * uOpacity);
}`,
      transparent: true,
      depthWrite: false,
    });
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = geo.index;
    inst.attributes.position = geo.attributes.position;
    inst.attributes.uv = geo.attributes.uv;
    // sort far-to-near from the tower so typical views blend correctly
    list.sort((p, q) => q.x * q.x + q.z * q.z - (p.x * p.x + p.z * p.z));
    const puff = new Float32Array(list.length * 4);
    const shade = new Float32Array(list.length * 2);
    list.forEach((p, i) => {
      puff.set([p.x, p.y, p.z, p.size], i * 4);
      shade.set([p.shade, p.tint], i * 2);
    });
    inst.setAttribute('aPuff', new THREE.InstancedBufferAttribute(puff, 4));
    inst.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 2));
    inst.instanceCount = list.length;
    const mesh = new THREE.Mesh(inst, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  }

  return { createDome, follow, createCloudBanks };
})();
