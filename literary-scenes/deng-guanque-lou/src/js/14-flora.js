/* ==========================================================================
 * 14-flora.js — procedural vegetation, instanced:
 *   油松 pines with flat painterly needle pads (near the tower, on cliffs),
 *   垂柳 willows along the floodplain, 槐 broadleaf trees by the road and city,
 *   shrubs, reeds at the waterline, grass tufts, and far forest dots on hills.
 * Season: late summer to early autumn — full foliage, reeds in plume.
 * ========================================================================== */
const Flora = (() => {
  const { rng, lerp, clamp, smoothstep } = U;
  const UP = new THREE.Vector3(0, 1, 0);

  // ------------------------------------------------------------- textures
  function leafTex(seed = 3) {
    return U.canvasTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const r = rng(seed);
      for (let i = 0; i < 300; i++) {
        const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 0.45 * w;
        const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d * 0.92;
        const g = 150 + r() * 95;
        ctx.fillStyle = `rgb(${(g * 0.74) | 0},${g | 0},${(g * 0.5) | 0})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 8 + r() * 8, 3.5 + r() * 3, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }, { mipmaps: true });
  }
  function needleTex() {
    return U.canvasTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const r = rng(11);
      ctx.lineCap = 'round';
      for (let t = 0; t < 46; t++) {
        const a0 = r() * Math.PI * 2, d0 = Math.sqrt(r()) * 0.36;
        const cx = w * (0.5 + Math.cos(a0) * d0), cy = h * (0.5 + Math.sin(a0) * d0 * 0.7);
        const n = 30;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + r() * 0.2;
          const L = 14 + r() * 20;
          const g = 140 + r() * 100;
          ctx.strokeStyle = `rgba(${(g * 0.62) | 0},${g | 0},${(g * 0.55) | 0},0.97)`;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L * 0.55);
          ctx.stroke();
        }
      }
    }, { mipmaps: true });
  }
  function willowTex() {
    return U.canvasTexture(64, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const r = rng(5);
      for (let s = 0; s < 4; s++) {
        const x0 = w * (0.2 + s * 0.2);
        ctx.strokeStyle = 'rgba(150,170,90,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.quadraticCurveTo(x0 + (r() - 0.5) * 10, h / 2, x0 + (r() - 0.5) * 8, h);
        ctx.stroke();
        for (let y = 4; y < h - 2; y += 5 + r() * 4) {
          const g = 170 + r() * 70;
          ctx.fillStyle = `rgb(${(g * 0.78) | 0},${g | 0},${(g * 0.45) | 0})`;
          const side = r() < 0.5 ? -1 : 1;
          ctx.beginPath();
          ctx.ellipse(x0 + side * 4, y, 2.6, 7, side * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }, { mipmaps: true });
  }
  function reedTex() {
    return U.canvasTexture(128, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const r = rng(9);
      for (let i = 0; i < 14; i++) {
        const x0 = w * (0.1 + r() * 0.8);
        const top = h * (0.05 + r() * 0.25);
        const bend = (r() - 0.5) * 30;
        ctx.strokeStyle = `rgb(${150 + r() * 40},${160 + r() * 40},${90 + r() * 30})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, h);
        ctx.quadraticCurveTo(x0 + bend * 0.3, h * 0.5, x0 + bend, top);
        ctx.stroke();
        // leaf blades
        for (let k = 0; k < 3; k++) {
          const y = h * (0.45 + r() * 0.45);
          const dir = r() < 0.5 ? -1 : 1;
          ctx.beginPath();
          ctx.moveTo(x0 + bend * (1 - y / h) * 0.3, y);
          ctx.quadraticCurveTo(x0 + dir * 18, y - 20, x0 + dir * 34, y - 6 + r() * 10);
          ctx.stroke();
        }
        // plume
        if (r() < 0.75) {
          ctx.fillStyle = `rgba(${215 + r() * 30},${200 + r() * 25},${170 + r() * 20},0.9)`;
          for (let p = 0; p < 12; p++) {
            ctx.beginPath();
            ctx.ellipse(x0 + bend + (r() - 0.5) * 8, top + p * 3.2, 2.2, 5, 0.4 + (r() - 0.5), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }, { mipmaps: true });
  }
  function grassTex() {
    return U.canvasTexture(128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const r = rng(21);
      for (let i = 0; i < 60; i++) {
        const x0 = w * (0.05 + r() * 0.9);
        const L = h * (0.4 + r() * 0.55);
        const lean = (r() - 0.5) * 40;
        const g = 140 + r() * 90;
        ctx.strokeStyle = `rgb(${(g * 0.85) | 0},${g | 0},${(g * 0.5) | 0})`;
        ctx.lineWidth = 1.6 + r();
        ctx.beginPath();
        ctx.moveTo(x0, h);
        ctx.quadraticCurveTo(x0 + lean * 0.2, h - L * 0.6, x0 + lean, h - L);
        ctx.stroke();
      }
    }, { mipmaps: true });
  }

  // ------------------------------------------------------------- builders
  const CYL = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true);
  CYL.translate(0, 0.5, 0);
  const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();

  function limb(b, a, c, r0, r1, color) {
    _d.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const L = _d.length();
    _q.setFromUnitVectors(UP, _d.normalize());
    // taper by scaling; cylinder has same radius top/bottom so use average
    const r = (r0 + r1) / 2;
    const m = new THREE.Matrix4().compose(_p.set(a[0], a[1], a[2]), _q, _s.set(r, L, r));
    b.add(CYL, m, color, { aSway: 0 });
  }

  // card: quad centred at p, facing normal-ish direction n, size w x h, with sway
  const QUAD = new THREE.PlaneGeometry(1, 1);
  function card(b, p, yaw, pitch, roll, w, h, color, sway) {
    const m = U.mat(p[0], p[1], p[2], pitch, yaw, roll, w, h, 1);
    b.add(QUAD, m, color, { aSway: sway });
  }

  function pineVariant(seed) {
    const r = rng(seed);
    const bark = new U.GeoBuilder().addExtra('aSway', 1);
    const fol = new U.GeoBuilder({ uv: true }).addExtra('aSway', 1);
    const barkC = U.lin(0x5b4131);
    const H = 11 + r() * 5;
    const lean = (r() - 0.5) * 0.5, leanZ = (r() - 0.5) * 0.4;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const bend = Math.sin(t * Math.PI * (0.8 + r() * 0.6)) * 0.8;
      pts.push([lean * t * H * 0.25 + bend * (r() - 0.5), t * H, leanZ * t * H * 0.25 + bend * (r() - 0.5)]);
    }
    for (let i = 0; i < pts.length - 1; i++) limb(bark, pts[i], pts[i + 1], lerp(0.42, 0.1, i / 6), lerp(0.42, 0.1, (i + 1) / 6), barkC);
    const pads = [];
    const nb = 4 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) {
      const t = 0.42 + (k / nb) * 0.5 + r() * 0.05;
      const i = Math.min(5, Math.floor(t * 6));
      const base = pts[i];
      const a = r() * Math.PI * 2;
      const L = (1 - t) * 6 + 1.6 + r() * 1.5;
      const tip = [base[0] + Math.cos(a) * L, base[1] + 0.4 + r() * 0.9, base[2] + Math.sin(a) * L];
      const mid = [(base[0] + tip[0]) / 2, base[1] - 0.2, (base[2] + tip[2]) / 2];
      limb(bark, base, mid, 0.18, 0.12, barkC);
      limb(bark, mid, tip, 0.12, 0.06, barkC);
      pads.push({ p: tip, R: 2.1 + r() * 1.4 + (1 - t) * 1.0 });
    }
    pads.push({ p: [pts[6][0], pts[6][1] + 0.3, pts[6][2]], R: 2.4 + r() * 0.9 });
    for (const pad of pads) {
      // flat layered pad (画意松): stacked horizontal cards, lighter on top
      const n = 22 + Math.floor(pad.R * 9);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * pad.R;
        const up = (r() - 0.4) * 0.7 * (1 - d / pad.R * 0.6);
        const p = [pad.p[0] + Math.cos(a) * d, pad.p[1] + up, pad.p[2] + Math.sin(a) * d * 0.9];
        const tone = 0.75 + r() * 0.3 + up * 0.35;
        const col = U.mulc(U.lin(0x34502f), tone);
        card(fol, p, r() * Math.PI * 2, -Math.PI / 2 + (r() - 0.5) * 0.55, 0, 1.9 + r() * 1.0, 1.4 + r() * 0.7, col, 0.22);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + r() * 0.3;
        const p = [pad.p[0] + Math.cos(a) * pad.R * 0.72, pad.p[1] + 0.05, pad.p[2] + Math.sin(a) * pad.R * 0.72];
        card(fol, p, a + Math.PI / 2, (r() - 0.5) * 0.4, 0, 1.8, 0.8, U.mulc(U.lin(0x2e472a), 0.9 + r() * 0.2), 0.3);
      }
    }
    return { bark: bark.build(), fol: fol.build(), height: H };
  }

  function willowVariant(seed) {
    const r = rng(seed);
    const bark = new U.GeoBuilder().addExtra('aSway', 1);
    const fol = new U.GeoBuilder({ uv: true }).addExtra('aSway', 1);
    const barkC = U.lin(0x55463a);
    const trunkH = 2.4 + r() * 1.2;
    limb(bark, [0, 0, 0], [0, trunkH, 0], 0.4, 0.34, barkC);
    const tips = [];
    const nb = 4 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * Math.PI * 2 + r() * 0.6;
      const L = 3 + r() * 2.5;
      const tip = [Math.cos(a) * L * 0.55, trunkH + L * 0.85, Math.sin(a) * L * 0.55];
      limb(bark, [0, trunkH, 0], tip, 0.22, 0.1, barkC);
      tips.push(tip);
      // secondary arching twigs
      for (let j = 0; j < 3; j++) {
        const f = 0.45 + j * 0.2;
        const bp = [tip[0] * f, trunkH + (tip[1] - trunkH) * f, tip[2] * f];
        const a2 = a + (r() - 0.5) * 1.6;
        const t2 = [bp[0] + Math.cos(a2) * 1.8, bp[1] + 0.8 + r() * 0.6, bp[2] + Math.sin(a2) * 1.8];
        limb(bark, bp, t2, 0.07, 0.04, barkC);
        tips.push(t2);
      }
    }
    // drooping strands (垂丝)
    for (const tip of tips) {
      const n = 9 + Math.floor(r() * 7);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = r() * 1.4;
        const L = 2.4 + r() * 3.4;
        const top = [tip[0] + Math.cos(a) * d, tip[1] - r() * 0.4, tip[2] + Math.sin(a) * d];
        const tone = 0.85 + r() * 0.3;
        const col = U.mulc(U.lin(0x8d9b4c), tone);
        const yaw = r() * Math.PI;
        // strand as a hanging card, pivot at the top
        const g = new THREE.PlaneGeometry(0.62, L, 1, 3);
        g.translate(0, -L / 2, 0);
        const sway = new Float32Array(g.attributes.position.count);
        for (let v = 0; v < sway.length; v++) sway[v] = Math.pow(-g.attributes.position.getY(v) / L, 1.3) * 1.4;
        g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
        const m = U.mat(top[0], top[1], top[2], 0, yaw, (r() - 0.5) * 0.15);
        fol.add(g, m, col);
      }
    }
    return { bark: bark.build(), fol: fol.build(), height: trunkH + 5 };
  }

  function broadVariant(seed, tint = 0x587a3b) {
    const r = rng(seed);
    const bark = new U.GeoBuilder().addExtra('aSway', 1);
    const fol = new U.GeoBuilder({ uv: true }).addExtra('aSway', 1);
    const barkC = U.lin(0x4f4036);
    const trunkH = 2.6 + r() * 1.4;
    limb(bark, [0, 0, 0], [0, trunkH, 0], 0.36, 0.3, barkC);
    const ends = [];
    const nb = 5 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * Math.PI * 2 + r() * 0.5;
      const L = 2.6 + r() * 2;
      const tip = [Math.cos(a) * L * 0.8, trunkH + 1.5 + r() * 2.5, Math.sin(a) * L * 0.8];
      limb(bark, [0, trunkH, 0], tip, 0.18, 0.08, barkC);
      ends.push(tip);
    }
    ends.push([0, trunkH + 4, 0]);
    const R = 4 + r() * 1.3;
    const cy = trunkH + 3;
    const n = 110;
    for (let i = 0; i < n; i++) {
      // points on a slightly flattened dome
      const u = r() * 2 - 1, th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rad = R * (0.7 + 0.3 * r());
      const p = [Math.cos(th) * s * rad, cy + Math.max(-0.35, u) * rad * 0.72, Math.sin(th) * s * rad];
      const tone = 0.62 + r() * 0.3 + u * 0.18;
      const col = U.mulc(U.lin(tint), tone);
      card(fol, p, r() * Math.PI * 2, (r() - 0.5) * 1.2, r() * 3, 2.4 + r() * 0.9, 2.2 + r() * 0.8, col, 0.35);
    }
    return { bark: bark.build(), fol: fol.build(), height: cy + R };
  }

  function shrubVariant(seed) {
    const r = rng(seed);
    const fol = new U.GeoBuilder({ uv: true }).addExtra('aSway', 1);
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.7;
      const p = [Math.cos(a) * d, 0.35 + r() * 0.5, Math.sin(a) * d];
      card(fol, p, r() * Math.PI, (r() - 0.5) * 0.8, r(), 1.1 + r() * 0.5, 0.9 + r() * 0.4, U.mulc(U.lin(0x5e6d3a), 0.8 + r() * 0.35), 0.2);
    }
    return { fol: fol.build() };
  }

  function clumpVariant(seed, n, hMin, hMax, spread, color) {
    const r = rng(seed);
    const fol = new U.GeoBuilder({ uv: true }).addExtra('aSway', 1);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = r() * spread;
      const H = hMin + r() * (hMax - hMin);
      const g = new THREE.PlaneGeometry(H * 0.55, H, 1, 2);
      g.translate(0, H / 2, 0);
      const sway = new Float32Array(g.attributes.position.count);
      for (let v = 0; v < sway.length; v++) sway[v] = Math.pow(g.attributes.position.getY(v) / H, 1.5);
      g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
      const m = U.mat(Math.cos(a) * d, -0.05, Math.sin(a) * d, (r() - 0.5) * 0.15, r() * Math.PI, 0);
      fol.add(g, m, U.mulc(color, 0.85 + r() * 0.3));
    }
    return { fol: fol.build() };
  }

  function farTreeGeometry() {
    const b = new U.GeoBuilder();
    const cone = new THREE.ConeGeometry(1, 1, 6, 1);
    cone.translate(0, 0.5, 0);
    b.add(cone, U.mat(0, 0.25, 0, 0, 0, 0, 1, 1.5, 1), U.lin(0x3f5a3a));
    const trunk = new THREE.CylinderGeometry(0.12, 0.15, 0.5, 5);
    trunk.translate(0, 0.25, 0);
    b.add(trunk, null, U.lin(0x4a3b30));
    return b.build();
  }

  // ------------------------------------------------------------- placement
  function sampleAround(r, cx, cz, radius, count, accept, tries = 30) {
    const out = [];
    for (let i = 0; i < count * tries && out.length < count; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const res = accept(x, z);
      if (res) out.push(res);
    }
    return out;
  }

  function floodplainSpot(x, z, minIn, maxIn) {
    const rq = Terrain.riverQuery(x, z);
    if (rq.s < 0) return null;
    const W = rq.w * 0.5;
    if (rq.d < W + minIn || rq.d > W + maxIn) return null;
    const y = Terrain.meshHeightAt(x, z);
    if (y < 0.4 || y > 6) return null;
    return [x, y, z];
  }

  const groups = [];
  function makeInstanced(geo, mat, list, opts = {}) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const r = rng(opts.seed || 1);
    const m = new THREE.Matrix4();
    list.forEach((p, i) => {
      const s = (opts.scale || 1) * (opts.scaleVar ? 1 + (r() - 0.5) * opts.scaleVar : 1) * (p[3] || 1);
      m.compose(_p.set(p[0], p[1] - (opts.sink || 0), p[2]), _q.setFromAxisAngle(UP, p[4] !== undefined ? p[4] : r() * Math.PI * 2), _s.set(s, s * (opts.yScale || 1), s));
      im.setMatrixAt(i, m);
    });
    im.castShadow = !!opts.shadow;
    im.receiveShadow = opts.receive !== false;
    im.computeBoundingSphere();
    if (opts.pick) im.userData.pick = opts.pick;
    return im;
  }

  function build(quality) {
    const group = new THREE.Group();
    group.name = 'flora';
    const dens = quality.treeDensity;
    const r = rng(2024);
    const texLeaf = leafTex(3), texNeedle = needleTex(), texWillow = willowTex(), texReed = reedTex(), texGrass = grassTex();
    const a2c = (quality.msaa || 0) > 0;
    const folMat = (map, translucent, extra = {}) => SL.lambert(Object.assign({ map, alphaTest: 0.42, side: THREE.DoubleSide, alphaToCoverage: a2c }, extra), { wind: { trunk: 0.0006, leaf: 0.28 }, translucent });
    const barkMat = SL.lambert({}, { wind: { trunk: 0.0006, leaf: 0.0 } });
    const mPine = folMat(texNeedle, 0.18), mWillow = folMat(texWillow, 0.3), mBroad = folMat(texLeaf, 0.2);
    const mShrub = folMat(texLeaf, 0.18), mReed = folMat(texReed, 0.4), mGrass = folMat(texGrass, 0.25);

    // --- pines: hand-placed near the tower + along the cliff edge
    const pineVars = [pineVariant(41), pineVariant(77), pineVariant(93)];
    const nearPines = [
      [-38, 0, -34, 1.05], [-44, 0, 30, 1.0], [30, 0, -36, 0.95], [44, 0, 27, 1.1], [-12, 0, -44, 0.9], [8, 0, 46, 0.95],
      [58, 0, -22, 0.85], [-30, 0, 52, 0.8],
    ].map((p) => [p[0], Terrain.meshHeightAt(p[0], p[2]), p[2], p[3]]);
    const cliffPines = sampleAround(r, -80, 0, 1600, Math.round(40 * dens), (x, z) => {
      if (Math.hypot(x, z) < 70) return null;
      const rq = Terrain.riverQuery(x, z);
      if (!rq.left || rq.s < 0) return null;
      const W = rq.w * 0.5;
      if (rq.d < W + 120 || rq.d > W + 420) return null;
      const y = Terrain.meshHeightAt(x, z);
      if (y < 26) return null;
      return [x, y, z, 0.7 + r() * 0.4];
    });
    const allPines = nearPines.concat(cliffPines);
    pineVars.forEach((v, i) => {
      const list = allPines.filter((_, k) => k % 3 === i);
      group.add(makeInstanced(v.bark, barkMat, list, { shadow: true, seed: 10 + i, sink: 0.3 }));
      group.add(makeInstanced(v.fol, mPine, list, { shadow: true, seed: 10 + i, sink: 0.3 }));
    });

    // --- willows on both floodplains near the tower
    const willowVars = [willowVariant(5), willowVariant(15)];
    const willows = [];
    for (const [cx, cz, rad, n] of [[-350, 200, 2600, 220], [-600, -1200, 1800, 70], [-500, 2600, 1800, 70]]) {
      willows.push(...sampleAround(r, cx, cz, rad, Math.round(n * dens), (x, z) => {
        const p = floodplainSpot(x, z, 14, 260);
        if (!p) return null;
        // loose groves: thin out by noise
        if (U.noiseB(x / 160, z / 160) < -0.05) return null;
        p.push(0.8 + r() * 0.45);
        return p;
      }));
    }
    willowVars.forEach((v, i) => {
      const list = willows.filter((_, k) => k % 2 === i);
      group.add(makeInstanced(v.bark, barkMat, list, { shadow: false, seed: 20 + i, sink: 0.2 }));
      group.add(makeInstanced(v.fol, mWillow, list, { shadow: false, seed: 20 + i, sink: 0.2 }));
    });

    // --- broadleaf (槐/榆) along the road, at the city and around villages
    const broadVars = [broadVariant(8, 0x4d6a36), broadVariant(18, 0x5a6f3a)];
    const broad = [];
    for (let x = 40; x < 215; x += 13) {
      for (const zs of [-1, 1]) {
        if (r() < 0.2) continue;
        if (zs < 0 && x < 110) continue; // keep the opening camera path clear
        const z = zs * (9 + r() * 3);
        broad.push([x, Terrain.meshHeightAt(x, z), z, 0.8 + r() * 0.35]);
      }
    }
    broad.push(...sampleAround(r, 800, 0, 900, Math.round(90 * dens), (x, z) => {
      const C = Terrain.CITY;
      if (x < C.x0 + 20 || x > C.x1 - 20 || z < C.z0 + 20 || z > C.z1 - 20) return null;
      if (Math.abs(z) < 14 || Math.abs(x - 800) < 10) return null; // keep main streets clear
      return [x, Terrain.meshHeightAt(x, z), z, 0.7 + r() * 0.4];
    }));
    broad.push(...sampleAround(r, 600, -300, 3200, Math.round(160 * dens), (x, z) => {
      if (Math.hypot(x, z) < 300) return null;
      const rq = Terrain.riverQuery(x, z);
      if (rq.d < rq.w * 0.5 + 500) return null;
      const y = Terrain.meshHeightAt(x, z);
      if (y < 24 || y > 60) return null;
      if (U.noiseA(x / 300, z / 300) < 0.25) return null; // clusters = villages & groves
      return [x, y, z, 0.8 + r() * 0.4];
    }));
    broadVars.forEach((v, i) => {
      const list = broad.filter((_, k) => k % 2 === i);
      group.add(makeInstanced(v.bark, barkMat, list, { shadow: false, seed: 30 + i, sink: 0.2 }));
      group.add(makeInstanced(v.fol, mBroad, list, { shadow: false, seed: 30 + i, sink: 0.2 }));
    });

    // --- shrubs on cliff edges and terrace margins
    const shrubVar = shrubVariant(3);
    const shrubs = sampleAround(r, -60, 0, 1500, Math.round(700 * dens), (x, z) => {
      if (Math.hypot(x, z) < 26) return null;
      if (x > 18 && x < 42 && Math.abs(z) < 12) return null; // keep the stair and court clear
      const y = Terrain.meshHeightAt(x, z);
      const rq = Terrain.riverQuery(x, z);
      if (rq.d < rq.w * 0.5 + 6) return null;
      const n = Terrain.meshHeightAt(x + 3, z) - y;
      if (Math.abs(n) > 3.5) return null;
      return [x, y, z, 0.8 + r() * 0.8];
    });
    // denser undergrowth on the terrace near the tower and along the cliff lip
    shrubs.push(...sampleAround(r, -10, 0, 280, Math.round(520 * dens), (x, z) => {
      if (Math.abs(x) < 24 && Math.abs(z) < 24) return null;
      if (x > 18 && x < 44 && Math.abs(z) < 13) return null;
      if (x > 20 && Math.abs(z) < 7) return null;
      const y = Terrain.meshHeightAt(x, z);
      if (y < 27) return null;
      if (U.noiseA(x / 45, z / 45) < -0.15) return null;
      return [x, y, z, 0.6 + r() * 0.9];
    }));
    group.add(makeInstanced(shrubVar.fol, mShrub, shrubs, { seed: 40 }));

    // --- reeds at the waterline and on sandbars
    const reedVar = clumpVariant(7, 7, 1.6, 2.6, 0.7, U.lin(0xb3b07a));
    const reeds = [];
    reeds.push(...sampleAround(r, -380, 300, 2400, Math.round(2600 * dens), (x, z) => {
      const rq = Terrain.riverQuery(x, z);
      if (rq.s < 0) return null;
      const W = rq.w * 0.5;
      const y = Terrain.meshHeightAt(x, z);
      if (y < 0.15 || y > 2.6) return null;
      const nearBank = rq.d > W - 4 && rq.d < W + 55;
      const onBar = rq.d < W - 30 && y > 0.3;
      if (!nearBank && !onBar) return null;
      return [x, y, z, 0.8 + r() * 0.5];
    }, 12));
    group.add(makeInstanced(reedVar.fol, mReed, reeds, { seed: 50 }));

    // --- grass tufts near the tower and the road (for close shots)
    if (quality.grass !== false) {
      const grassVar = clumpVariant(13, 6, 0.4, 0.8, 0.5, U.lin(0x8f9a52));
      const grass = sampleAround(r, 0, 0, 190, Math.round(4200 * dens), (x, z) => {
        if (Math.abs(x) < 21 && Math.abs(z) < 21) return null;
        if (x > 19 && x < 42 && Math.abs(z) < 12) return null;
        if (x > 20 && Math.abs(z) < 5.5) return null;
        const y = Terrain.meshHeightAt(x, z);
        if (y < 25) return null;
        return [x, y, z, 0.8 + r() * 0.6];
      });
      group.add(makeInstanced(grassVar.fol, mGrass, grass, { seed: 60 }));
    }

    // --- far forest dots on 中条山, western hills and far ranges
    const far = [];
    const farN = Math.round(6000 * dens);
    for (let i = 0; i < farN * 6 && far.length < farN; i++) {
      const x = -12000 + r() * 30000, z = -9000 + r() * 22000;
      const rr = Math.hypot(x, z);
      if (rr < 1500) continue;
      const y = Terrain.heightAt(x, z);
      const zt = Terrain.zhongtiao(x, z), wr = Terrain.westRanges(x, z);
      if (zt < 90 && wr < 60) continue;
      const slope = Math.abs(Terrain.heightAt(x + 30, z) - y) / 30;
      if (slope > 0.9) continue;
      if (U.noiseC(x / 700, z / 700) < -0.1) continue;
      far.push([x, Terrain.meshHeightAt(x, z), z, 5 + r() * 5]);
    }
    const farGeo = farTreeGeometry();
    const farMat = SL.lambert({});
    group.add(makeInstanced(farGeo, farMat, far, { seed: 70, sink: 1.5 }));

    groups.push(group);
    // big trees as simple cylinders for camera clearance checks: [x, y, z, radius, height]
    const obstacles = [];
    for (const p of allPines) obstacles.push([p[0], p[1], p[2], 3.8 * (p[3] || 1), 15 * (p[3] || 1)]);
    for (const p of broad) obstacles.push([p[0], p[1], p[2], 5.2 * (p[3] || 1), 11 * (p[3] || 1)]);
    for (const p of willows) obstacles.push([p[0], p[1], p[2], 4.5 * (p[3] || 1), 9.5 * (p[3] || 1)]);
    return { group, obstacles, counts: { pines: allPines.length, willows: willows.length, broad: broad.length, shrubs: shrubs.length, reeds: reeds.length, far: far.length } };
  }

  return { build };
})();
