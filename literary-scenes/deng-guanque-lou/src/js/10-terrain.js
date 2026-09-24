/* ==========================================================================
 * 10-terrain.js — landform around 鹳雀楼 (artistic, compressed distances):
 *   · 黄河 flows north→south just west of the tower, bends east far south
 *   · the tower stands on a loess terrace above a steep bank (下瞰大河)
 *   · 中条山 rises to the south-east (前瞻中条); the sun sets over western ranges
 * Axis convention: +x east, +z south, +y up, metres. River water level y = 0.
 * ========================================================================== */
const Terrain = (() => {
  const { clamp, lerp, smoothstep, smax, fbm, ridged, noiseA, noiseB, noiseC } = U;

  // ------------------------------------------------------------ river path
  // [x, z, width]; widths in metres. Flows from index 0 (north) to the end (east).
  const RIVER_CTRL = [
    [-640, -36000, 460], [-560, -19000, 440], [-505, -12000, 430], [-458, -6500, 420], [-428, -2800, 415],
    [-413, -700, 418], [-414, 650, 422], [-448, 1800, 432], [-515, 3000, 452],
    [-540, 4200, 482], [-425, 5300, 520], [60, 6150, 540], [900, 6620, 545],
    [2600, 6960, 552], [5200, 7160, 562], [9000, 7260, 580], [14000, 7500, 600],
    [21000, 7900, 640], [28000, 8300, 680], [36000, 8700, 700],
  ];
  const river = { samples: [], length: 0 };
  const raster = { x0: -5200, z0: -34500, cell: 50, nx: 0, nz: 0, sd: null, s: null };
  const R_INFL = 2600;

  function buildRiver() {
    const pts = RIVER_CTRL.map((p) => new THREE.Vector3(p[0], p[2], p[1]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const approxLen = curve.getLength();
    const n = Math.ceil(approxLen / 25);
    const sp = curve.getSpacedPoints(n);
    let s = 0;
    for (let i = 0; i < sp.length; i++) {
      if (i > 0) s += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].z - sp[i - 1].z);
      river.samples.push({ x: sp[i].x, z: sp[i].z, w: sp[i].y, s });
    }
    river.length = s;
    for (let i = 0; i < river.samples.length; i++) {
      const a = river.samples[Math.max(0, i - 1)], b = river.samples[Math.min(river.samples.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      river.samples[i].tx = (b.x - a.x) / l;
      river.samples[i].tz = (b.z - a.z) / l;
    }
  }

  function buildRaster() {
    const R = raster;
    R.nx = Math.ceil((38000 - R.x0) / R.cell) + 1;
    R.nz = Math.ceil((14000 - R.z0) / R.cell) + 1;
    const N = R.nx * R.nz;
    const dist = new Float32Array(N).fill(1e9);
    const sArr = new Float32Array(N).fill(-1);
    const wArr = new Float32Array(N).fill(420);
    const S = river.samples;
    // brute-force distance within the influence radius, segment by segment
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      const minx = Math.min(a.x, b.x) - R_INFL, maxx = Math.max(a.x, b.x) + R_INFL;
      const minz = Math.min(a.z, b.z) - R_INFL, maxz = Math.max(a.z, b.z) + R_INFL;
      const i0 = Math.max(0, Math.floor((minx - R.x0) / R.cell)), i1 = Math.min(R.nx - 1, Math.ceil((maxx - R.x0) / R.cell));
      const j0 = Math.max(0, Math.floor((minz - R.z0) / R.cell)), j1 = Math.min(R.nz - 1, Math.ceil((maxz - R.z0) / R.cell));
      const abx = b.x - a.x, abz = b.z - a.z;
      const ll = abx * abx + abz * abz || 1;
      for (let j = j0; j <= j1; j++) {
        const pz = R.z0 + j * R.cell;
        for (let ii = i0; ii <= i1; ii++) {
          const px = R.x0 + ii * R.cell;
          let t = ((px - a.x) * abx + (pz - a.z) * abz) / ll;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = px - (a.x + abx * t), dz = pz - (a.z + abz * t);
          const d2 = dx * dx + dz * dz;
          const k = j * R.nx + ii;
          if (d2 < dist[k]) {
            dist[k] = d2;
            sArr[k] = a.s + (b.s - a.s) * t;
            wArr[k] = a.w + (b.w - a.w) * t;
          }
        }
      }
    }
    // side by ray parity: count river crossings of a westward ray
    const sd = new Float32Array(N);
    for (let j = 0; j < R.nz; j++) {
      const pz = R.z0 + j * R.cell;
      const xs = [];
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1];
        if ((a.z <= pz && b.z > pz) || (b.z <= pz && a.z > pz)) {
          const t = (pz - a.z) / (b.z - a.z);
          xs.push(a.x + (b.x - a.x) * t);
        }
      }
      xs.sort((p, q) => p - q);
      let c = 0;
      for (let ii = 0; ii < R.nx; ii++) {
        const px = R.x0 + ii * R.cell;
        while (c < xs.length && xs[c] < px) c++;
        const side = c % 2 === 1 ? 1 : -1; // +1 = left bank (east/north, the tower side)
        const k = j * R.nx + ii;
        const d = Math.min(Math.sqrt(dist[k]), R_INFL + 400);
        sd[k] = side * d;
      }
    }
    R.sd = sd;
    R.s = sArr;
    R.w = wArr;
  }

  // Bilinear raster query -> {sd, d, s, w}
  const _rq = { sd: 0, d: 0, s: 0, w: 420, left: true };
  function riverQuery(x, z) {
    const R = raster;
    let fx = (x - R.x0) / R.cell, fz = (z - R.z0) / R.cell;
    if (fx < 0 || fz < 0 || fx >= R.nx - 1 || fz >= R.nz - 1) {
      _rq.sd = z > 13000 || x < -600 ? -9999 : 9999;
      _rq.d = 9999; _rq.s = -1; _rq.w = 420; _rq.left = _rq.sd > 0;
      return _rq;
    }
    const i = Math.floor(fx), j = Math.floor(fz);
    fx -= i; fz -= j;
    const k = j * R.nx + i;
    const a = R.sd[k], b = R.sd[k + 1], c = R.sd[k + R.nx], d = R.sd[k + R.nx + 1];
    const sd = lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
    const s0 = R.s[k], s1 = R.s[k + 1], s2 = R.s[k + R.nx], s3 = R.s[k + R.nx + 1];
    const w = lerp(lerp(R.w[k], R.w[k + 1], fx), lerp(R.w[k + R.nx], R.w[k + R.nx + 1], fx), fz);
    _rq.sd = sd;
    _rq.d = Math.abs(sd);
    _rq.s = Math.min(s0, s1, s2, s3) < 0 ? -1 : lerp(lerp(s0, s1, fx), lerp(s2, s3, fx), fz);
    _rq.w = w;
    _rq.left = sd >= 0;
    return _rq;
  }

  // Sample the centreline at arc length s -> {x, z, tx, tz, w}
  function riverAt(s) {
    const S = river.samples;
    const f = clamp(s / river.length, 0, 1) * (S.length - 1);
    const i = Math.min(S.length - 2, Math.floor(f));
    const t = f - i;
    const a = S[i], b = S[i + 1];
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), tx: lerp(a.tx, b.tx, t), tz: lerp(a.tz, b.tz, t), w: lerp(a.w, b.w, t), s };
  }
  function riverNearestS(x, z) {
    let best = 1e18, bs = 0;
    for (const p of river.samples) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) { best = d; bs = p.s; }
    }
    return bs;
  }

  // ------------------------------------------------------------ landforms
  // 中条山: axis from its south-west end (near the river bend) to the north-east.
  const ZT_A = [1500, 4600];
  const ZT_D = (() => { const dx = 15500, dz = -8800, l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
  const ZT_N = [-ZT_D[1], ZT_D[0]]; // points south-east
  const ZT_L = 18500;

  function zhongtiao(x, z) {
    const rx = x - ZT_A[0], rz = z - ZT_A[1];
    const u = rx * ZT_D[0] + rz * ZT_D[1];
    if (u < -2600 || u > ZT_L + 3500) return 0;
    let v = rx * ZT_N[0] + rz * ZT_N[1];
    const crest = 380 * noiseB(u / 4200, 3.1) + 160 * noiseA(u / 1500, 8.7);
    v -= crest;
    const peak = 150 + 720 * smoothstep(-400, 5200, u) * (1 - 0.35 * smoothstep(12500, ZT_L + 3000, u)) + 140 * noiseC(u / 2600, 1.3);
    const endFade = smoothstep(-2600, 300, u) * (1 - smoothstep(ZT_L, ZT_L + 3500, u));
    const halfW = lerp(1300, 2500, smoothstep(0, 6000, u)) * (v < 0 ? 0.78 : 1.15);
    const s = Math.abs(v) / halfW;
    if (s > 1.6) return 0;
    const shape = Math.pow(clamp(1 - s / 1.6, 0, 1), 1.35);
    const rd = ridged(noiseA, x / 1650, z / 1650, 5);
    const spur = 0.5 + 0.62 * rd;
    return peak * shape * spur * endFade;
  }

  // Western ranges: where the sun sets (白日依山尽). Main range + front range.
  function westRanges(x, z) {
    let h = 0;
    const axis1 = -8800 + 800 * noiseB(z / 7000, 5.5) + 260 * noiseA(z / 2300, 1.9);
    const d1 = Math.abs(x - axis1);
    if (d1 < 4000) {
      const pk = 640 + 150 * fbm(noiseC, z / 5200, 2.2, 3) + 70 * noiseA(z / 1400, 7.1);
      const shape = Math.pow(clamp(1 - d1 / 4000, 0, 1), 1.25);
      const rd = ridged(noiseB, x / 1500, z / 1500, 5);
      h = Math.max(h, pk * shape * (0.52 + 0.55 * rd));
    }
    const axis2 = -5700 + 600 * noiseA(z / 5200, 9.3);
    const d2 = Math.abs(x - axis2);
    if (d2 < 2600) {
      const pk = 300 + 80 * noiseB(z / 3800, 4.4);
      const shape = Math.pow(clamp(1 - d2 / 2600, 0, 1), 1.4);
      const rd = ridged(noiseC, x / 1100, z / 1100, 4);
      h = Math.max(h, pk * shape * (0.5 + 0.55 * rd));
    }
    // taper north/south ends of the western massif
    const zf = smoothstep(-15000, -8000, z) * (1 - smoothstep(12000, 17000, z));
    return h * (0.35 + 0.65 * zf);
  }

  // Far ranges ring the horizon (平远): hazy layered silhouettes.
  function farRanges(x, z) {
    const r = Math.hypot(x, z);
    if (r < 13500) return 0;
    const m = smoothstep(13500, 21000, r);
    const rd = ridged(noiseC, x / 3200, z / 3200, 5);
    const base = 380 + 520 * fbm(noiseB, x / 11000, z / 11000, 2);
    return m * base * (0.35 + 0.8 * rd);
  }

  // Loess hills west of the river (rolling, gullied).
  function westHills(x, z, dRiver) {
    const a = smoothstep(1300, 4200, dRiver);
    if (a <= 0) return 0;
    const rd = ridged(noiseA, x / 900, z / 900, 4);
    return a * (35 + 95 * rd + 40 * fbm(noiseB, x / 2600, z / 2600, 2));
  }

  function plateauEast(x, z) {
    return 30.5 + 5.5 * fbm(noiseB, x / 4200 + 11, z / 4200, 3) + 1.4 * noiseC(x / 380, z / 380);
  }
  function plateauWest(x, z) {
    return 22 + 4.5 * fbm(noiseA, x / 3600 - 5, z / 3600, 3) + 1.2 * noiseC(x / 300, z / 300);
  }

  // Floodplain widths per bank vary along the river.
  function fpWidth(left, s) {
    if (s < 0) return left ? 160 : 380;
    if (left) {
      const base = 170 + 170 * (0.5 + 0.5 * noiseA(s / 2600, 3.7));
      // near the tower the terrace comes close to the water: 下瞰大河
      const near = 1 - smoothstep(600, 2400, Math.abs(s - SITE_S));
      return lerp(base, 146, near);
    }
    return 330 + 260 * (0.5 + 0.5 * noiseB(s / 3100, 8.1));
  }
  let SITE_S = 0; // river arc length abreast of the tower (set after build)

  // Tower site, road and city flats.
  const CITY = { x0: 232, x1: 1420, z0: -720, z1: 760, y: 29.4 };
  function siteFlatten(x, z, h, onTop) {
    // tower terrace
    const r = Math.hypot(x, z);
    if (r < 125 && onTop > 0.5) {
      const w = 1 - smoothstep(58, 125, r);
      h = lerp(h, 30.0, w * onTop);
    }
    // road from the tower stairs east to the city west gate
    if (x > 20 && x < CITY.x0 + 30 && Math.abs(z) < 26) {
      const w = (1 - smoothstep(5, 26, Math.abs(z))) * smoothstep(20, 40, x);
      const ry = lerp(30.0, CITY.y, smoothstep(40, CITY.x0, x));
      h = lerp(h, ry, w);
    }
    // city
    const cx = Math.max(CITY.x0 - x, 0, x - CITY.x1);
    const cz = Math.max(CITY.z0 - z, 0, z - CITY.z1);
    const cd = Math.hypot(cx, cz);
    if (cd < 90) h = lerp(h, CITY.y, 1 - smoothstep(0, 90, cd));
    return h;
  }

  // Main analytic height function.
  function heightAt(x, z) {
    const rq = riverQuery(x, z);
    const d = rq.d, W = rq.w * 0.5, left = rq.left, s = rq.s;
    let plateau = left ? plateauEast(x, z) : plateauWest(x, z);
    let h = plateau;
    if (!left) h += westHills(x, z, d);
    const zt = zhongtiao(x, z);
    if (zt > 0) h = smax(h, plateau + zt, 45);
    const wr = westRanges(x, z);
    if (wr > 0) h = smax(h, plateau + wr, 60);
    const fr = farRanges(x, z);
    if (fr > 0) h = smax(h, plateau + fr, 80);
    // gullies cut into the terraces near the valley
    if (d < 2400 && s >= 0) {
      const gv = 1 - Math.abs(noiseC(s / 520, d / 1500 + 3.3));
      const g = smoothstep(0.72, 0.98, gv) * (1 - smoothstep(900, 2400, d));
      const keep = smoothstep(500, 900, Math.hypot(x, z)); // keep the tower site intact
      h -= g * 16 * keep * smoothstep(W + 200, W + 520, d);
    }
    // valley carve: channel with sandbars, floodplain, steep loess cliff
    const fp = fpWidth(left, s);
    const siteDamp = left && s >= 0 ? smoothstep(60, 260, Math.abs(s - SITE_S)) : 1;
    const rib = s >= 0 ? (noiseA(s / 17, left ? 1.7 : 5.3) * 4.5 + noiseB(s / 85, left ? 2.1 : 6.6) * 13 * siteDamp) : 0;
    const cliffW = left ? 27 : 64;
    const c0 = W + fp + rib;
    let onTop = 1;
    if (d < c0 + cliffW) {
      const flood = 1.45 + 0.7 * noiseA(x / 90, z / 90) + 1.4 * smoothstep(W, W + fp, d);
      let v;
      if (d < W) {
        v = d < W - 24 ? -6.2 + 2.6 * Math.pow(d / Math.max(W - 24, 1), 2) : lerp(-3.6, -0.25, smoothstep(W - 24, W, d));
        if (s >= 0) {
          const across = rq.sd;
          const nearSite = 1 - smoothstep(700, 2600, Math.abs(s - SITE_S));
          const bias = nearSite * (0.16 * smoothstep(-W * 0.2, -W * 0.9, across) - 0.45 * smoothstep(-W * 0.1, W * 0.5, across));
          const bn = 0.7 * noiseB(s / 1500, across / 260) + 0.3 * noiseA(s / 520, across / 130) + bias;
          const bar = smoothstep(0.2, 0.42, bn) * (1 - smoothstep(W - 80, W - 26, d));
          if (bar > 0) v = lerp(v, 0.8 + 0.5 * noiseC(x / 60, z / 60), bar);
        }
      } else if (d < W + 7) v = lerp(-0.25, flood, smoothstep(W, W + 7, d));
      else v = flood;
      if (d > c0) {
        const t = (d - c0) / cliffW;
        const f = 0.14 * smoothstep(0, 0.24, t) + 0.86 * smoothstep(0.2, 0.62, t);
        v = lerp(flood, h, clamp(f, 0, 1));
        onTop = smoothstep(0.55, 1, t);
      } else onTop = 0;
      h = v;
    }
    return siteFlatten(x, z, h, onTop);
  }

  // -------------------------------------------------------- colouring
  const P = {
    wetSand: U.lin(0x7d6a4c), sand: U.lin(0xc9b48c), grassDry: U.lin(0xa39e62), grass: U.lin(0x7f8c4f),
    reedy: U.lin(0x98985c), loess: U.lin(0xc4a171), loessDark: U.lin(0xa98659), cliff: U.lin(0xcfad7c),
    field: U.lin(0xa6a266), earth: U.lin(0xae9566), road: U.lin(0xb39a6d),
    mtFoot: U.lin(0xa88a5c), mtMid: U.lin(0x7d8a56), mtHigh: U.lin(0x5f7d69), mtRock: U.lin(0x8f8270),
    forest: U.lin(0x55704a),
  };
  const mix = U.mixc;

  // returns [r,g,b,fieldMask]
  function colorAt(x, z, h, ny, rq) {
    const slope = 1 - ny; // 0 flat .. ~1 vertical
    const d = rq.d, W = rq.w * 0.5;
    const n1 = noiseA(x / 140, z / 140), n2 = noiseB(x / 37, z / 37), n3 = noiseC(x / 620, z / 620);
    let c;
    let field = 0;
    const plateau = rq.left ? 30 : 22;
    const mt = h - plateau; // height above local plateau
    if (h < 0.3) {
      c = P.wetSand;
    } else if (d < W - 4 && h < 3) {
      // sandbars in the channel: pale dry tops, darker wet margins
      c = mix(P.wetSand, P.sand, smoothstep(0.35, 0.9, h));
      c = mix(c, P.reedy, smoothstep(0.3, 0.7, n1) * smoothstep(0.8, 1.2, h) * 0.5);
    } else if (d < W + fpWidth(rq.left, rq.s) + 4 && h < 6) {
      // floodplain: sand with grassy patches, reedy near water
      const g = smoothstep(-0.55, 0.25, n1 + 0.35 * n2);
      c = mix(P.sand, P.grass, 0.35 + g * 0.6);
      c = mix(c, P.forest, smoothstep(0.35, 0.8, n2 * 0.6 + n3 * 0.5) * 0.45);
      if (d < W + 30) c = mix(c, P.reedy, 0.5);
      if (d < W + 5) c = mix(c, P.wetSand, 0.7);
    } else if (mt > 120) {
      // mountains: 青绿 layering — ochre foot, green flanks, teal heights
      const t1 = smoothstep(80, 320, mt + 60 * n3), t2 = smoothstep(300, 620, mt + 80 * n1);
      c = mix(P.mtFoot, P.mtMid, t1);
      c = mix(c, P.mtHigh, t2 * 0.9);
      const rock = smoothstep(0.42, 0.72, slope + 0.12 * n2);
      c = mix(c, P.mtRock, rock * 0.7);
      const veg = smoothstep(0.1, 0.5, n1 * 0.6 + n2 * 0.4) * (1 - rock);
      c = mix(c, P.forest, veg * 0.45);
    } else if (slope > 0.32) {
      // loess cliffs and gully walls
      const streak = 0.5 + 0.5 * noiseB(x / 7, z / 7);
      c = mix(P.cliff, P.loessDark, streak * 0.45 + 0.15 * n1);
    } else {
      // terraces: loess soil, grass, and cultivated fields
      const g = smoothstep(-0.35, 0.5, n1 * 0.7 + n3 * 0.6);
      c = mix(P.loess, P.grassDry, g);
      c = mix(c, P.grass, smoothstep(0.35, 0.8, n2 * 0.5 + n1 * 0.5) * 0.4);
      if (mt > 20) c = mix(c, P.mtFoot, smoothstep(20, 120, mt) * 0.6);
      const flat = 1 - smoothstep(0.05, 0.14, slope);
      const r = Math.hypot(x, z);
      const inCity = x > CITY.x0 - 40 && x < CITY.x1 + 40 && z > CITY.z0 - 40 && z < CITY.z1 + 40;
      field = flat * smoothstep(140, 260, r) * (inCity ? 0 : 1) * (1 - smoothstep(12, 40, mt)) * smoothstep(0.0, 0.3, n3 + 0.4);
      if (r < 150) c = mix(c, mix(P.grassDry, P.grass, smoothstep(-0.3, 0.6, n2)), 0.35 * smoothstep(150, 40, r) + 0.15);
      if (r < 60) c = mix(c, P.earth, 0.25);
    }
    // road
    if (x > 20 && x < CITY.x0 + 20 && Math.abs(z) < 5.5) c = mix(c, P.road, 0.85 * smoothstep(20, 30, x));
    // soft variation
    const k = 0.92 + 0.12 * n2;
    return [c[0] * k, c[1] * k, c[2] * k, field];
  }

  // ------------------------------------------------------- chunked LOD mesh
  const leaves = [];
  let rootNode = null;
  let meshes = [];

  function buildMesh(quality, viewpoints, onProgress) {
    const N = quality.chunkN;
    const K = quality.terrainK;
    const HALF = 32768;
    const MIN = quality.minLeaf || 128;
    rootNode = { x0: -HALF, z0: -HALF, size: HALF * 2, kids: null };
    const stack = [rootNode];
    const heightRange = (n) => {
      let lo = 1e9, hi = -1e9;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
        const y = heightAt(n.x0 + (n.size * i) / 2, n.z0 + (n.size * j) / 2);
        lo = Math.min(lo, y); hi = Math.max(hi, y);
      }
      return [lo, hi];
    };
    while (stack.length) {
      const n = stack.pop();
      let dmin = 1e18;
      for (const vp of viewpoints) {
        const dx = Math.max(n.x0 - vp[0], 0, vp[0] - (n.x0 + n.size));
        const dz = Math.max(n.z0 - vp[2], 0, vp[2] - (n.z0 + n.size));
        dmin = Math.min(dmin, Math.hypot(dx, dz, vp[1] * 0.5) / (vp[3] || 1));
      }
      let split = n.size > MIN && n.size > dmin / K;
      if (!split && n.size > MIN * 4 && n.size <= 4096 && dmin > 1500 && dmin < 24000) {
        const [lo, hi] = heightRange(n);
        if (hi - lo > n.size * 0.16 && n.size > dmin / (K * 1.6)) split = true;
      }
      if (split) {
        const h = n.size / 2;
        n.kids = [
          { x0: n.x0, z0: n.z0, size: h, kids: null },
          { x0: n.x0 + h, z0: n.z0, size: h, kids: null },
          { x0: n.x0, z0: n.z0 + h, size: h, kids: null },
          { x0: n.x0 + h, z0: n.z0 + h, size: h, kids: null },
        ];
        for (const k of n.kids) stack.push(k);
      } else {
        leaves.push(n);
      }
    }
    if (typeof window === 'object' && window.__lodHist) {
      const hist = {};
      for (const l of leaves) hist[l.size] = (hist[l.size] || 0) + 1;
      console.log(JSON.stringify(hist));
    }
    return leaves.length;
  }

  // Build geometry for leaves in batches (async so the loader can repaint).
  async function buildGeometry(quality, material, onProgress) {
    const N = quality.chunkN;
    const V = N + 1;
    const E = N + 3; // grid with apron for normals
    const groups = new Map();
    const BATCH = 8192;
    for (const n of leaves) {
      const key = Math.floor((n.x0 + 32768) / BATCH) + ',' + Math.floor((n.z0 + 32768) / BATCH);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }
    const hgrid = new Float32Array(E * E);
    let done = 0;
    const total = leaves.length;
    meshes = [];
    for (const [, list] of groups) {
      const vertsPer = V * V + 8 * V;
      const nv = list.length * vertsPer;
      const pos = new Float32Array(nv * 3);
      const nor = new Float32Array(nv * 3);
      const col = new Float32Array(nv * 3);
      const msk = new Float32Array(nv * 2);
      const idx = [];
      let vo = 0;
      for (const n of list) {
        const cell = n.size / N;
        // heights with apron
        for (let j = 0; j < E; j++) {
          const z = n.z0 + (j - 1) * cell;
          for (let i = 0; i < E; i++) {
            hgrid[j * E + i] = heightAt(n.x0 + (i - 1) * cell, z);
          }
        }
        n.cell = cell;
        n.h = new Float32Array(V * V);
        const base = vo;
        for (let j = 0; j < V; j++) {
          for (let i = 0; i < V; i++) {
            const x = n.x0 + i * cell, z = n.z0 + j * cell;
            const k = (j + 1) * E + (i + 1);
            const y = hgrid[k];
            n.h[j * V + i] = y;
            const dx = (hgrid[k + 1] - hgrid[k - 1]) / (2 * cell);
            const dz = (hgrid[k + E] - hgrid[k - E]) / (2 * cell);
            let nx = -dx, ny = 1, nz = -dz;
            const l = Math.hypot(nx, ny, nz);
            nx /= l; ny /= l; nz /= l;
            const o = vo * 3;
            pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
            nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
            const rq = riverQuery(x, z);
            const c = colorAt(x, z, y, ny, rq);
            // curvature shading: valleys darker, crests lighter (reads form at distance)
            const lap = (hgrid[k + 1] + hgrid[k - 1] + hgrid[k + E] + hgrid[k - E] - 4 * y) / cell;
            const ao = clamp(1 - lap * 0.09, 0.72, 1.12);
            col[o] = c[0] * ao; col[o + 1] = c[1] * ao; col[o + 2] = c[2] * ao;
            msk[vo * 2] = c[3];
            msk[vo * 2 + 1] = 1 - ny;
            vo++;
          }
        }
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const a = base + j * V + i, b = a + 1, c = a + V, d = c + 1;
            idx.push(a, c, d, a, d, b);
          }
        }
        // skirts (both orientations)
        const drop = Math.max(3, cell * 1.6);
        const edges = [
          Array.from({ length: V }, (_, i) => i),
          Array.from({ length: V }, (_, i) => N * V + i),
          Array.from({ length: V }, (_, j) => j * V),
          Array.from({ length: V }, (_, j) => j * V + N),
        ];
        for (const e of edges) {
          const sb = vo;
          for (const li of e) {
            const src = base + li;
            const o = vo * 3, so = src * 3;
            pos[o] = pos[so]; pos[o + 1] = pos[so + 1] - drop; pos[o + 2] = pos[so + 2];
            nor[o] = nor[so]; nor[o + 1] = nor[so + 1]; nor[o + 2] = nor[so + 2];
            col[o] = col[so] * 0.9; col[o + 1] = col[so + 1] * 0.9; col[o + 2] = col[so + 2] * 0.9;
            msk[vo * 2] = msk[src * 2];
            vo++;
          }
          for (let q = 0; q < e.length - 1; q++) {
            const a = base + e[q], b = base + e[q + 1], c = sb + q, d = sb + q + 1;
            idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
          }
        }
        done++;
        if (done % 24 === 0) {
          onProgress && onProgress(done / total);
          await U.nextFrame();
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, vo * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, vo * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, vo * 3), 3));
      g.setAttribute('aMask', new THREE.BufferAttribute(msk.subarray(0, vo * 2), 2));
      g.setIndex(new THREE.BufferAttribute(vo > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, material);
      m.receiveShadow = true;
      m.userData.pick = 'terrain';
      meshes.push(m);
    }
    return meshes;
  }

  // Height of the rendered mesh (exact triangle interpolation).
  function meshHeightAt(x, z) {
    let n = rootNode;
    if (!n || x < n.x0 || z < n.z0 || x >= n.x0 + n.size || z >= n.z0 + n.size) return heightAt(x, z);
    while (n.kids) {
      const h = n.size / 2;
      const i = x >= n.x0 + h ? 1 : 0, j = z >= n.z0 + h ? 1 : 0;
      n = n.kids[j * 2 + i];
    }
    if (!n.h) return heightAt(x, z);
    const V = Math.round(n.size / n.cell) + 1;
    let fx = (x - n.x0) / n.cell, fz = (z - n.z0) / n.cell;
    const i = Math.min(V - 2, Math.floor(fx)), j = Math.min(V - 2, Math.floor(fz));
    fx -= i; fz -= j;
    const ha = n.h[j * V + i], hb = n.h[j * V + i + 1], hc = n.h[(j + 1) * V + i], hd = n.h[(j + 1) * V + i + 1];
    if (fz > fx) return ha + fx * (hd - hc) + fz * (hc - ha);
    return ha + fx * (hb - ha) + fz * (hd - hb);
  }

  // Terrain material: vertex colours + fields patchwork + brush-like detail.
  function makeMaterial(opts = {}) {
    const mat = SL.lambert({ vertexColors: true }, {
      mask: true,
      key: opts.straight ? 'terrainS' : 'terrain',
      extraFragment: (fs) => fs.replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
{
  vec2 wp2 = vWorldPosF.xz;
  float dcam = length(vWorldPosF - cameraPosition);
  float fine = 1.0 - smoothstep(250.0, 1800.0, dcam);
  float det = vnoise(wp2 * 0.11) * 0.55 + vnoise(wp2 * 0.47) * 0.45 * fine;
  diffuseColor.rgb *= mix(0.9, 1.08, det);
  // painterly large-scale tint drift
  float drift = vnoise(wp2 * 0.0018 + 3.0);
  diffuseColor.rgb *= mix(vec3(1.03, 0.99, 0.94), vec3(0.95, 1.0, 1.04), drift);
  // loess cliff faces: vertical erosion grooves and banding
  float steep = smoothstep(0.25, 0.6, vMask.y);
  if (steep > 0.01) {
    float gro = vnoise(vec2(dot(wp2, vec2(0.71, 0.71)) * 0.42, vWorldPosF.y * 0.05)) * 0.6 + vnoise(vec2(dot(wp2, vec2(-0.6, 0.8)) * 1.3, vWorldPosF.y * 0.12)) * 0.4;
    float band = 0.5 + 0.5 * sin(vWorldPosF.y * 1.9 + vnoise(wp2 * 0.05) * 3.0);
    diffuseColor.rgb *= mix(1.0, mix(0.8, 1.12, gro) * mix(0.94, 1.03, band), steep * fine);
  }
  float fm = vMask.x;
  if (fm > 0.02) {
    // strip fields whose orientation drifts with the land (阡陌)
    float ang = ${opts.straight ? '0.12 + 0.35 * step(0.5, vnoise(floor(wp2 / 1800.0) + 3.0))' : '(vnoise(wp2 * 0.0009 + 5.0) - 0.5) * 2.4 + 0.3'};
    float ca = cos(ang), sa = sin(ang);
    vec2 r = mat2(ca, sa, -sa, ca) * wp2;
    vec2 sz = ${opts.straight ? 'vec2(110.0, 38.0)' : 'vec2(96.0, 17.0 + 9.0 * vnoise(wp2 * 0.004))'};
    float row = floor(r.y / sz.y);
    r.x += hash12(vec2(row, 3.7)) * sz.x;
    vec2 cid = vec2(floor(r.x / sz.x), row);
    vec2 f = vec2(fract(r.x / sz.x), fract(r.y / sz.y));
    float h = hash12(cid);
    vec3 crop = h < 0.3 ? vec3(0.21, 0.26, 0.09) : (h < 0.55 ? vec3(0.44, 0.36, 0.16) : (h < 0.78 ? vec3(0.28, 0.31, 0.12) : vec3(0.34, 0.25, 0.14)));
    crop *= 0.88 + 0.24 * hash12(cid + 7.7);
    float furrow = 0.95 + 0.05 * sin(f.y * 6.2831 * 7.0);
    float edgeW = clamp(fwidth(r.y / sz.y) * 1.2 + 0.05, 0.0, 0.5);
    float edge = (1.0 - smoothstep(0.0, edgeW, f.y) * smoothstep(1.0, 1.0 - edgeW, f.y)) * (1.0 - smoothstep(500.0, 2200.0, dcam));
    vec3 fieldCol = crop * mix(furrow, 1.0, smoothstep(300.0, 900.0, dcam));
    fieldCol = mix(fieldCol, vec3(0.2, 0.24, 0.1), edge * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, fieldCol, fm * 0.62);
  }
}`),
    });
    return mat;
  }

  // Horizon profile toward the sun: ridge distance and height that hide it.
  function ridgeTowardSun(sunHx, sunHz, eyeY) {
    let best = -1e9, bu = 10000, bh = 400;
    for (let u = 400; u < 26000; u += 40) {
      const h = heightAt(sunHx * u, sunHz * u);
      const a = (h - eyeY) / u;
      if (a > best) { best = a; bu = u; bh = h; }
    }
    return { u: bu, h: bh, angle: Math.atan(best) };
  }

  function init() {
    buildRiver();
    buildRaster();
    SITE_S = riverNearestS(0, 0);
  }

  return {
    init, heightAt, meshHeightAt, riverQuery, riverAt, riverNearestS, river, buildMesh, buildGeometry,
    makeMaterial, ridgeTowardSun, zhongtiao, westRanges, CITY, colorAt,
    get siteS() { return SITE_S; },
    get meshes() { return meshes; },
    get leafCount() { return leaves.length; },
  };
})();
