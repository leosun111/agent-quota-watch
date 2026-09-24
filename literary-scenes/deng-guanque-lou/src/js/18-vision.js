/* ==========================================================================
 * 18-vision.js — 心象: the imagined lower reaches where the Yellow River
 * meets the sea. Shown only in chapter 五 behind an explicit caption; it is
 * not presented as the view from the tower. Compressed, painterly geography:
 * a wide plain, meanders, a delta lobe, tidal flats, the 黄蓝 plume line.
 * ========================================================================== */
const Vision = (() => {
  const { lerp, clamp, smoothstep } = U;
  const MOUTH_X = 9000;
  let group = null;

  function riverZ(x) {
    return 700 * Math.sin(x / 5200 + 0.4) + 320 * Math.sin(x / 1900 + 1.3) + 120 * U.noiseA(x / 900, 3.3);
  }
  function halfW(x) {
    return lerp(340, 820, smoothstep(-6000, MOUTH_X + 1500, x));
  }
  function coastX(z) {
    const zm = riverZ(MOUTH_X);
    return MOUTH_X + 900 * U.noiseB(z / 4200, 2.2) + 2600 * Math.exp(-Math.pow((z - zm) / 2600, 2));
  }
  function heightAt(x, z) {
    let h = 5 + 4 * U.fbm(U.noiseC, x / 3200, z / 3200, 3) + 1.2 * U.noiseA(x / 400, z / 400);
    const zc = riverZ(x), d = Math.abs(z - zc), W = halfW(x);
    const levee = 1.6 * Math.exp(-Math.pow((d - W - 60) / 50, 2));
    h += levee;
    if (d < W) h = lerp(-5, -1.2, smoothstep(W - 90, W, d));
    else if (d < W + 160) h = lerp(0.6, h, smoothstep(W, W + 160, d));
    const cx = coastX(z);
    if (x > cx - 500) {
      const t = smoothstep(cx - 500, cx + 200, x);
      h = lerp(h, 0.18 + 0.12 * U.noiseB(x / 120, z / 120), t); // tidal flats
      h = lerp(h, -14, smoothstep(cx + 200, cx + 2600, x));
    }
    return h;
  }
  function colorAt(x, z, h, ny) {
    const n1 = U.noiseA(x / 260, z / 260), n2 = U.noiseB(x / 60, z / 60);
    const cx = coastX(z);
    let c;
    if (h < 0.1) c = U.lin(0x6d5f4a);
    else if (x > cx - 520) c = U.mixc(U.lin(0x8a7f6e), U.lin(0x9d8f76), smoothstep(-0.4, 0.6, n2)); // flats
    else if (x > cx - 2200) c = U.mixc(U.lin(0x8a8a58), U.lin(0x9a7e5a), smoothstep(-0.3, 0.5, n1)); // wetland
    else c = U.mixc(U.lin(0xb3a26c), U.lin(0x86954f), smoothstep(-0.4, 0.5, n1));
    const d = Math.abs(z - riverZ(x)) - halfW(x);
    if (d > 0 && d < 180) c = U.mixc(c, U.lin(0xb9a57e), 0.5);
    const k = 0.92 + 0.12 * n2;
    const field = x < cx - 2200 && d > 250 ? smoothstep(-0.2, 0.3, n1 + 0.3) : 0;
    return [c[0] * k, c[1] * k, c[2] * k, field];
  }

  // Tensor grid with finer spacing near the estuary (x≈4–12 km, z≈±4 km)
  function axis(n, a, b, focus, fw) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      out.push(t);
    }
    // warp: density bump near focus
    const acc = [0];
    for (let i = 1; i < n; i++) {
      const x = lerp(a, b, (i - 0.5) / (n - 1));
      const dens = 1 + 3.2 * Math.exp(-Math.pow((x - focus) / fw, 2));
      acc.push(acc[i - 1] + 1 / dens);
    }
    const tot = acc[n - 1];
    return acc.map((v) => lerp(a, b, v / tot));
  }

  function buildTerrain(quality) {
    const hi = quality.chunkN >= 32;
    const xs = axis(hi ? 420 : 240, -26000, 30000, 7000, 7000);
    const zs = axis(hi ? 300 : 170, -16000, 16000, riverZ(MOUTH_X), 5500);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), msk = new Float32Array(nx * nz * 2);
    const H = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = heightAt(xs[i], zs[j]);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = xs[i], z = zs[j], y = H[k];
        const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nz - 1, j + 1);
        const dx = (H[j * nx + i1] - H[j * nx + i0]) / (xs[i1] - xs[i0]);
        const dz = (H[j1 * nx + i] - H[j0 * nx + i]) / (zs[j1] - zs[j0]);
        const l = Math.hypot(dx, 1, dz);
        pos.set([x, y, z], k * 3);
        nor.set([-dx / l, 1 / l, -dz / l], k * 3);
        const c = colorAt(x, z, y, 1 / l);
        col.set([c[0], c[1], c[2]], k * 3);
        msk[k * 2] = c[3];
        msk[k * 2 + 1] = 1 - 1 / l;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMask', new THREE.BufferAttribute(msk, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, Terrain.makeMaterial({ straight: true }));
    return m;
  }

  // Sea of clouds for the ascent (thick near the start, parting toward the sea)
  function cloudSea(quality) {
    const banks = [];
    const r = U.rng(314);
    for (let i = 0; i < 44; i++) {
      const x = -9000 + r() * 9500, z = -6500 + r() * 13000;
      if (x > -2400 && Math.abs(z - riverZ(x)) < 2200) continue; // a gap over the river ahead
      banks.push({ x, z, y: 1250 + r() * 220, radius: 1500 + r() * 1100, height: 380 + r() * 260, stretch: 1.4, puff: 1000 + r() * 500, count: 26 });
    }
    // towering clouds far out at sea, lit by the low sun from behind the viewer
    for (let i = 0; i < 6; i++) {
      banks.push({ x: 26000 + r() * 16000, z: -14000 + r() * 28000, y: 900, radius: 2600, height: 3800 + r() * 1800, stretch: 1.2, puff: 1700, count: 40, tint: 0.6 });
    }
    return Sky.createCloudBanks(banks, quality.cloudPuffs, 21);
  }

  function build(quality) {
    group = new THREE.Group();
    group.name = 'vision';
    group.visible = false;
    group.add(buildTerrain(quality));
    const sea = Water.seaMesh({ size: 260000, center: [60000, 0], mouth: [MOUTH_X + 2600, riverZ(MOUTH_X)], mouthR: 4300, coastX: MOUTH_X });
    sea.userData.pick = 'river';
    group.add(sea);
    group.add(cloudSea(quality));
    return { group, sea, riverZ, heightAt, MOUTH_X, coastX };
  }

  return { build, riverZ, heightAt, MOUTH_X, coastX, get group() { return group; } };
})();
