/* ==========================================================================
 * 13-tower.js — 鹳雀楼: a Tang-style tower, three storeys outside and four
 * eaves (副阶 + three roofs), on a brick platform with an east stair.
 * Main facade faces east (toward 蒲州城); the west side overlooks the river.
 * Proportions are an artistic reconstruction, not a survey of any building.
 * ========================================================================== */
const Tower = (() => {
  const { lerp, clamp } = U;
  const Y0 = 30.0;            // terrace level
  const PY = 34.2;            // platform top (world y)
  const D = {
    plat: 20,
    stairs: { x0: 20, steps: 24, rise: 0.175, tread: 0.3, halfW: 4.0 },
    L1: { floor: 0, c: 10.5, cols: [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5], colH: 9.0, fj: 14.0, fjColH: 4.6 },
    L2: { floor: 12.8, c: 9.0, cols: [-9, -5.4, -1.8, 1.8, 5.4, 9], colH: 6.2, band: 11.4, balc: 12.3, rail: 12.12 },
    L3: { floor: 22.2, c: 7.6, cols: [-7.6, -4.56, -1.52, 1.52, 4.56, 7.6], colH: 5.6, band: 9.9, balc: 10.8, rail: 10.62 },
    eave1: { ix: 10.5, iz: 10.5, ox: 16.6, oz: 16.6, yIn: 7.6, yOut: 5.7, lift: 0.7, flare: 0.8, thick: 0.3 },
    eave2: { ix: 11.4, iz: 11.4, ox: 15.6, oz: 15.6, yIn: 11.3, yOut: 9.7, lift: 0.75, flare: 0.9, thick: 0.34 },
    eave3: { ix: 9.9, iz: 9.9, ox: 13.7, oz: 13.7, yIn: 21.2, yOut: 19.8, lift: 0.7, flare: 0.85, thick: 0.32 },
    top: { ix: 4.9, iz: 7.7, ox: 12.0, oz: 12.0, yIn: 32.7, yOut: 29.0, yRidge: 36.8, lift: 1.0, flare: 1.0, thick: 0.38 },
  };

  // Palette (linear)
  const C = {
    red: U.lin(0x9e3325), redDark: U.lin(0x7a2a1f), white: U.lin(0xe6ddca), whiteB: U.lin(0xd9cfba),
    wood: U.lin(0x7b5436), woodDark: U.lin(0x4c3322), soffit: U.lin(0x6a3526), rafter: U.lin(0x7c3423),
    tile: U.lin(0x4a4f52), ridge: U.lin(0x3c4144), glaze: U.lin(0x3f5d57), green: U.lin(0x3f6a5f),
    ochre: U.lin(0x8e3f27), gold: U.lin(0xc9a55a), stone: U.lin(0xa89e8c), stoneL: U.lin(0xbdb3a0),
    brick: U.lin(0x9a8f80), dark: U.lin(0x1c1612), bar: U.lin(0x8a2e22), lantern: U.lin(0xc2412c),
  };

  const UBOX = new THREE.BoxGeometry(1, 1, 1);
  const _m = new THREE.Matrix4();
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

  let B = null; // builders
  const solids = []; // AABBs for camera checks: [x0,y0,z0,x1,y1,z1]

  function box(b, x0, y0, z0, x1, y1, z1, color, ao = 1, solid = false) {
    _m.makeScale(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    _m.setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    b.add(UBOX, _m, color, { aoV: ao });
    if (solid) solids.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]);
  }
  // Box oriented from p0 to p1 with cross-section w (horizontal) x h (vertical-ish).
  function beam(b, p0, p1, w, h, color, ao = 1) {
    _v1.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const L = _v1.length();
    if (L < 1e-4) return;
    _v1.divideScalar(L);
    _v2.set(0, 1, 0);
    if (Math.abs(_v1.y) > 0.98) _v2.set(1, 0, 0);
    _v3.crossVectors(_v2, _v1).normalize(); // x axis
    _v2.crossVectors(_v1, _v3).normalize(); // y axis
    _m.makeBasis(_v3.multiplyScalar(w), _v2.multiplyScalar(h), _v1.multiplyScalar(L));
    _m.setPosition((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    b.add(UBOX, _m, color, { aoV: ao });
  }
  function yRot(ry, x, y, z, sx = 1, sy = 1, sz = 1) {
    return U.mat(x, y, z, 0, ry, 0, sx, sy, sz);
  }

  // ------------------------------------------------------------- roofs
  // Point on one side of an eave ring. side: 0 E, 1 S, 2 W, 3 N. u∈[-1,1], v∈[0,1] (inner→eave)
  function ringPoint(o, side, u, v, out) {
    const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
    const tX = -nZ, tZ = nX;
    const isX = side % 2 === 0;
    const inO = isX ? o.ix : o.iz, inA = isX ? o.iz : o.ix;
    const outO = isX ? o.ox : o.oz, outA = isX ? o.oz : o.ox;
    const au = Math.abs(u);
    const fl = o.flare * au * au * au;
    const outD = lerp(inO, outO + fl, v);
    const alongHalf = lerp(inA, outA + fl, v);
    const along = u * alongHalf;
    const y = o.yOut + (o.yIn - o.yOut) * Math.pow(1 - v, o.prof || 1.6) + o.lift * au * au * au * Math.pow(v, 1.6);
    out = out || [0, 0, 0];
    out[0] = nX * outD + tX * along;
    out[1] = PY + y;
    out[2] = nZ * outD + tZ * along;
    out.along = along;
    return out;
  }

  // Build one side of a ring as tiles (top), soffit (bottom) and fascia (eave edge).
  function ringSide(o, side, segU = 28, segV = 7) {
    const top = new THREE.BufferGeometry();
    const nU = segU + 1, nV = segV + 1;
    const pos = new Float32Array(nU * nV * 3);
    const uv = new Float32Array(nU * nV * 2);
    const tan = new Float32Array(nU * nV * 3);
    const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
    const tX = -nZ, tZ = nX;
    const p = [0, 0, 0];
    for (let j = 0; j < nV; j++) {
      const v = j / segV;
      for (let i = 0; i < nU; i++) {
        const u = -1 + (2 * i) / segU;
        ringPoint(o, side, u, v, p);
        const k = j * nU + i;
        pos.set([p[0], p[1], p[2]], k * 3);
        uv.set([p.along, v * 6], k * 2);
        tan.set([tX, 0, tZ], k * 3);
      }
    }
    const idx = [];
    for (let j = 0; j < segV; j++) {
      for (let i = 0; i < segU; i++) {
        const a = j * nU + i, b = a + 1, c = a + nU, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    top.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    top.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    top.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
    top.setIndex(idx);
    top.computeVertexNormals();
    fixUp(top);
    B.tile.add(top, null, C.tile, { aoV: 1 });
    // soffit (underside) — flipped copy lowered by the roof thickness
    const bot = top.clone();
    const bp = bot.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setY(i, bp.getY(i) - o.thick);
    const bi = bot.index.array;
    for (let i = 0; i < bi.length; i += 3) { const t = bi[i + 1]; bi[i + 1] = bi[i + 2]; bi[i + 2] = t; }
    bot.computeVertexNormals();
    B.wood.add(bot, null, C.soffit, { aoV: 0.62 });
    // fascia along the eave edge (v = 1)
    for (let i = 0; i < segU; i++) {
      const a = ringPoint(o, side, -1 + (2 * i) / segU, 1), b = ringPoint(o, side, -1 + (2 * (i + 1)) / segU, 1);
      B.lac.addQuad([a[0], a[1] - o.thick, a[2]], [b[0], b[1] - o.thick, b[2]], [b[0], b[1], b[2]], [a[0], a[1], a[2]], C.redDark, null, { aoV: 0.9 });
    }
  }
  function fixUp(geo) {
    // ensure normals point up for the top surface
    const n = geo.attributes.normal;
    let sy = 0;
    for (let i = 0; i < n.count; i++) sy += n.getY(i);
    if (sy < 0) {
      const ia = geo.index.array;
      for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
      geo.computeVertexNormals();
    }
  }

  // Hip ridges along the four diagonals of a ring, and the ring's top (wall) ridge.
  function ringRidges(o, wallRidge = true, segs = 10) {
    for (let side = 0; side < 4; side++) {
      // diagonal at u = +1 of this side
      let prev = null;
      for (let s = 0; s <= segs; s++) {
        const v = s / segs;
        const p = ringPoint(o, side, 1, v);
        const up = 0.2 + 0.28 * Math.pow(v, 6);
        const q = [p[0], p[1] + up, p[2]];
        if (prev) beam(B.tile, prev, q, 0.34, 0.36, C.ridge);
        prev = q;
      }
      // upturned tip ornament
      const tip = ringPoint(o, side, 1, 1);
      const out = [tip[0] * 1.035, tip[1] + 0.75, tip[2] * 1.035];
      beam(B.tile, [tip[0], tip[1] + 0.35, tip[2]], out, 0.26, 0.3, C.glaze);
      if (wallRidge) {
        const a = ringPoint(o, side, -1, 0), b = ringPoint(o, side, 1, 0);
        beam(B.tile, [a[0], a[1] + 0.12, a[2]], [b[0], b[1] + 0.12, b[2]], 0.42, 0.42, C.ridge);
      }
    }
  }

  // Rafters and tile-end discs along each eave side.
  const rafterMats = [];
  const tileEnds = [];
  function eaveDetails(o, spacing = 0.4) {
    for (let side = 0; side < 4; side++) {
      const eLen = 2 * (Math.max(o.ox, o.oz) + o.flare);
      const n = Math.floor(eLen / spacing);
      for (let i = 1; i < n; i++) {
        const u = -1 + (2 * i) / n;
        const pOut = ringPoint(o, side, u, 1.0);
        const pIn = ringPoint(o, side, u * 0.92, 0.45);
        const endP = [pOut[0], pOut[1] - o.thick - 0.1, pOut[2]];
        const inP = [pIn[0], pIn[1] - o.thick - 0.1, pIn[2]];
        // push the rafter end slightly beyond the fascia
        const dx = endP[0] - inP[0], dy = endP[1] - inP[1], dz = endP[2] - inP[2];
        const l = Math.hypot(dx, dy, dz);
        const ex = [endP[0] + (dx / l) * 0.12, endP[1] + (dy / l) * 0.12, endP[2] + (dz / l) * 0.12];
        rafterMats.push(orient(inP, ex, 0.085));
      }
      const nt = Math.floor(eLen / 0.34);
      for (let i = 1; i < nt; i++) {
        const u = -1 + (2 * i) / nt;
        const p = ringPoint(o, side, u, 1.0);
        const q = ringPoint(o, side, u, 0.96);
        tileEnds.push(orient([p[0], p[1] + 0.02, p[2]], [p[0] + (p[0] - q[0]) * 0.4, p[1] + 0.02 + (p[1] - q[1]) * 0.4, p[2] + (p[2] - q[2]) * 0.4], 0.11));
      }
    }
  }
  // Matrix mapping a unit cylinder (y from -0.5..0.5) onto segment a→b with radius r.
  function orient(a, b, r) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(r, L, r));
  }

  // 歇山 top: hip ring + upper gable slopes + gable triangles + ridges + 鸱尾
  function topRoof() {
    const o = D.top;
    for (let side = 0; side < 4; side++) ringSide(o, side, 30, 8);
    ringRidges(o, false);
    eaveDetails(o, 0.4);
    const yIn = PY + o.yIn, yR = PY + o.yRidge;
    const prof = (w) => yIn + (yR - yIn) * (0.6 * w + 0.4 * w * w);
    const zHalf = o.iz + 0.5;
    for (const sgn of [1, -1]) {
      // upper slope (east sgn=1 / west sgn=-1)
      const segW = 8, segZ = 16;
      const g = new THREE.BufferGeometry();
      const pos = [], uv = [], tan = [], idx = [];
      for (let j = 0; j <= segW; j++) {
        const w = j / segW;
        for (let i = 0; i <= segZ; i++) {
          const z = -zHalf + (2 * zHalf * i) / segZ;
          pos.push(sgn * o.ix * (1 - w), prof(w), z);
          uv.push(z, 6 + w * 5);
          tan.push(0, 0, 1);
        }
      }
      for (let j = 0; j < segW; j++) {
        for (let i = 0; i < segZ; i++) {
          const a = j * (segZ + 1) + i, b = a + 1, c = a + segZ + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      fixUp(g);
      B.tile.add(g, null, C.tile);
      // underside of the overhang (visible from below at the gable ends)
      const gb = g.clone();
      const gp = gb.attributes.position;
      for (let i = 0; i < gp.count; i++) gp.setY(i, gp.getY(i) - o.thick);
      const gi = gb.index.array;
      for (let i = 0; i < gi.length; i += 3) { const t = gi[i + 1]; gi[i + 1] = gi[i + 2]; gi[i + 2] = t; }
      gb.computeVertexNormals();
      B.wood.add(gb, null, C.soffit, { aoV: 0.6 });
      // gable ridges (垂脊) along the slope edges
      for (const zs of [1, -1]) {
        let prev = null;
        for (let j = 0; j <= 8; j++) {
          const w = j / 8;
          const q = [sgn * o.ix * (1 - w), prof(w) + 0.22, zs * zHalf];
          if (prev) beam(B.tile, prev, q, 0.3, 0.4, C.ridge);
          prev = q;
        }
      }
    }
    // gable triangles (山花) with a 悬鱼 ornament
    for (const zs of [1, -1]) {
      const z = zs * (o.iz - 0.2);
      const n = 10;
      for (let j = 0; j < n; j++) {
        const w0 = j / n, w1 = (j + 1) / n;
        const a = [-o.ix * (1 - w0), prof(w0), z], b = [o.ix * (1 - w0), prof(w0), z];
        const c = [o.ix * (1 - w1), prof(w1), z], d = [-o.ix * (1 - w1), prof(w1), z];
        if (zs > 0) B.lac.addQuad(a, b, c, d, C.ochre, [0, 0, 1], { aoV: 0.8 });
        else B.lac.addQuad(b, a, d, c, C.ochre, [0, 0, -1], { aoV: 0.8 });
      }
      // 博风板 edge boards
      for (const xs of [1, -1]) {
        let prev = null;
        for (let j = 0; j <= 8; j++) {
          const w = j / 8;
          const q = [xs * o.ix * (1 - w) * 1.02, prof(w) - 0.18, zs * (o.iz + 0.3)];
          if (prev) beam(B.lac, prev, q, 0.08, 0.5, C.redDark, 0.9);
          prev = q;
        }
      }
      // 悬鱼 (hanging ornament) under the ridge
      box(B.lac, -0.25, yR - 1.9, zs * (o.iz + 0.34) - 0.04, 0.25, yR - 0.4, zs * (o.iz + 0.34) + 0.04, C.gold, 0.9);
      // 博脊 along the base of the gable
      beam(B.tile, [-o.ix, yIn + 0.1, zs * o.iz], [o.ix, yIn + 0.1, zs * o.iz], 0.38, 0.38, C.ridge);
    }
    // main ridge (正脊) along z
    box(B.tile, -0.32, yR - 0.1, -zHalf - 0.1, 0.32, yR + 0.85, zHalf + 0.1, C.ridge);
    box(B.tile, -0.2, yR + 0.85, -zHalf, 0.2, yR + 0.95, zHalf, C.glaze);
    // 鸱尾
    chiwei(0, yR + 0.8, zHalf + 0.05, 1);
    chiwei(0, yR + 0.8, -zHalf - 0.05, -1);
    perches.push({ p: [0, yR + 1.0, zHalf - 1.3], ry: 0 }, { p: [0, yR + 1.0, -zHalf + 1.6], ry: Math.PI });
  }

  function chiwei(x, y, z, dir) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(1.05, 0);
    s.bezierCurveTo(1.35, 0.55, 1.3, 1.35, 0.9, 1.95);
    s.bezierCurveTo(0.7, 2.25, 0.25, 2.3, -0.1, 2.02);
    s.bezierCurveTo(0.2, 1.92, 0.34, 1.62, 0.3, 1.32);
    s.bezierCurveTo(0.26, 0.9, 0.12, 0.62, 0.0, 0.5);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -0.21);
    // shape x → world +z*dir, extrusion z → world x
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, dir), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dir, 0, 0));
    m.setPosition(x, y, z - dir * 0.9);
    B.tile.add(geo.toNonIndexed(), m, C.glaze);
  }

  // ------------------------------------------------------------- brackets
  function bracketGeometry() {
    const b = new U.GeoBuilder();
    const block = U.lin(0x5a2a1c), arm = U.lin(0x7a3120), blockL = U.lin(0x3a4f47);
    const bx = (cx, cy, cz, sx, sy, sz, col) => {
      _m.makeScale(sx, sy, sz);
      _m.setPosition(cx, cy, cz);
      b.add(UBOX, _m, col);
    };
    bx(0, 0.17, 0, 0.64, 0.34, 0.64, block);           // 栌斗
    bx(0, 0.45, 0, 0.2, 0.22, 1.5, arm);               // 泥道拱
    bx(0.36, 0.45, 0, 0.92, 0.22, 0.2, arm);           // 华拱 1
    for (const z of [-0.66, 0.66]) bx(0, 0.64, z, 0.3, 0.17, 0.3, blockL);
    bx(0.74, 0.64, 0, 0.3, 0.17, 0.3, blockL);
    bx(0, 0.83, 0, 0.2, 0.22, 2.1, arm);               // 慢拱
    bx(0.66, 0.83, 0, 1.5, 0.22, 0.2, arm);            // 华拱 2
    bx(0.74, 0.83, 0, 0.2, 0.22, 1.2, arm);            // 瓜子拱
    for (const z of [-0.96, 0.96]) bx(0, 1.02, z, 0.3, 0.17, 0.3, blockL);
    for (const z of [-0.54, 0.54]) bx(0.74, 1.02, z, 0.3, 0.17, 0.3, blockL);
    bx(1.32, 1.02, 0, 0.3, 0.17, 0.3, blockL);
    bx(1.32, 1.21, 0, 0.2, 0.22, 1.5, arm);            // 令拱
    bx(0.82, 1.22, 0, 1.9, 0.24, 0.22, arm);           // 耍头
    for (const z of [-0.66, 0.66]) bx(1.32, 1.4, z, 0.3, 0.16, 0.3, blockL);
    return b.build();
  }
  const bracketMats = [];
  // Tang practice: bold column-top sets, lighter intercolumn sets.
  function brackets(half, y, cols, scale, corners = true) {
    for (let side = 0; side < 4; side++) {
      const ry = [0, -Math.PI / 2, Math.PI, Math.PI / 2][side];
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      for (let i = 1; i < cols.length - 1; i++) {
        const a = cols[i];
        bracketMats.push(yRot(ry, nX * half + tX * a, PY + y, nZ * half + tZ * a, scale, scale, scale));
      }
      for (let i = 0; i < cols.length - 1; i++) {
        const a = (cols[i] + cols[i + 1]) / 2, s2 = scale * 0.62;
        bracketMats.push(yRot(ry, nX * half + tX * a, PY + y + scale * 0.5, nZ * half + tZ * a, s2, s2, s2));
      }
      if (corners) {
        const cx = nX * half + tX * half, cz = nZ * half + tZ * half;
        bracketMats.push(yRot(ry - Math.PI / 4, cx, PY + y, cz, scale, scale, scale));
      }
    }
  }

  // ------------------------------------------------------------- columns
  function columnGeometry() {
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let r = 1 - 0.1 * t;
      if (t > 0.9) r *= 1 - (t - 0.9) * 1.4; // 卷杀
      pts.push(new THREE.Vector2(r, t));
    }
    const g = new THREE.LatheGeometry(pts, 14);
    return g;
  }
  const columnMats = [];
  const baseMats = [];
  function columnsRing(half, cols, y0, h, r) {
    const seen = new Set();
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      for (const a of cols) {
        const x = nX * half + tX * a, z = nZ * half + tZ * a;
        const key = x.toFixed(2) + ',' + z.toFixed(2);
        if (seen.has(key)) continue;
        seen.add(key);
        columnMats.push(U.mat(x, PY + y0, z, 0, 0, 0, r, h, r));
        baseMats.push(U.mat(x, PY + y0, z, 0, 0, 0, r * 1.75, 0.26, r * 1.75));
        solids.push([x - r, PY + y0, z - r, x + r, PY + y0 + h, z + r]);
      }
    }
  }

  // ------------------------------------------------------------- walls
  // kinds: 'wall' | 'window' | 'door' per bay
  function wallsRing(half, cols, y0, h, kinds, opts = {}) {
    const th = 0.46;
    const winSill = opts.sill || 1.0, winTop = opts.winTop || 2.75, doorTop = opts.doorTop || 2.9;
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      const k = kinds[side];
      for (let i = 0; i < cols.length - 1; i++) {
        const a0 = cols[i] + 0.3, a1 = cols[i + 1] - 0.3;
        const kind = k[i];
        const seg = (ya, yb, aa, ab, col, ao) => {
          // wall slab between along aa..ab, heights ya..yb
          const p0x = nX * (half - th / 2) + tX * aa, p0z = nZ * (half - th / 2) + tZ * aa;
          const p1x = nX * (half + th / 2) + tX * ab, p1z = nZ * (half + th / 2) + tZ * ab;
          box(B.mat, p0x, PY + ya, p0z, p1x, PY + yb, p1z, col, ao, true);
        };
        const top = h - 0.55; // under the architrave
        if (kind === 'wall') {
          seg(y0, y0 + top, a0, a1, C.white, 1);
        } else if (kind === 'window') {
          seg(y0, y0 + winSill, a0, a1, C.white, 1);
          seg(y0 + winTop, y0 + top, a0, a1, C.white, 1);
          const w0 = a0 + 0.35, w1 = a1 - 0.35;
          seg(y0 + winSill, y0 + winTop, a0, w0, C.white, 1);
          seg(y0 + winSill, y0 + winTop, w1, a1, C.white, 1);
          // frame + vertical bars (直棂)
          const fx = (aa, ya2, ab, yb2) => {
            const px0 = nX * (half - 0.08) + tX * aa, pz0 = nZ * (half - 0.08) + tZ * aa;
            const px1 = nX * (half + 0.08) + tX * ab, pz1 = nZ * (half + 0.08) + tZ * ab;
            box(B.lac, px0, PY + ya2, pz0, px1, PY + yb2, pz1, C.red, 0.9);
          };
          fx(w0, y0 + winSill, w1, y0 + winSill + 0.12);
          fx(w0, y0 + winTop - 0.12, w1, y0 + winTop);
          const nb = Math.max(4, Math.floor((w1 - w0) / 0.17));
          for (let bI = 0; bI <= nb; bI++) {
            const a = lerp(w0 + 0.04, w1 - 0.04, bI / nb);
            fx(a - 0.035, y0 + winSill, a + 0.035, y0 + winTop);
          }
        } else if (kind === 'door') {
          seg(y0 + doorTop, y0 + top, a0, a1, C.white, 1);
          // door frame
          const fx = (aa, ya2, ab, yb2) => {
            const px0 = nX * (half - th / 2 - 0.02) + tX * aa, pz0 = nZ * (half - th / 2 - 0.02) + tZ * aa;
            const px1 = nX * (half + th / 2 + 0.02) + tX * ab, pz1 = nZ * (half + th / 2 + 0.02) + tZ * ab;
            box(B.lac, px0, PY + ya2, pz0, px1, PY + yb2, pz1, C.red, 0.9);
          };
          fx(a0, y0 + doorTop - 0.18, a1, y0 + doorTop);
          fx(a0, y0, a0 + 0.14, y0 + doorTop);
          fx(a1 - 0.14, y0, a1, y0 + doorTop);
          if (opts.leaves && opts.leaves[side] === i) {
            // two leaves swung inward (板门 with studs)
            const lw = (a1 - a0 - 0.28) / 2;
            const th2 = 1.3; // leaves swung ~75° inward
            for (const s of [1, -1]) {
              const hinge = s > 0 ? a0 + 0.14 : a1 - 0.14;
              const hx = nX * (half - th / 2) + tX * hinge, hz = nZ * (half - th / 2) + tZ * hinge;
              // closed direction is ±t; open = ±t·cos − n·sin (inward)
              const lx = s * tX * Math.cos(th2) - nX * Math.sin(th2);
              const lz = s * tZ * Math.cos(th2) - nZ * Math.sin(th2);
              const ym = PY + y0 + (doorTop - 0.05) / 2;
              beam(B.lac, [hx, ym, hz], [hx + lx * lw, ym, hz + lz * lw], 0.09, doorTop - 0.1, C.red, 0.55);
              // bronze studs (门钉) on the leaf
              for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
                const f = (c + 0.8) / 3.6;
                const sx = hx + lx * lw * f + nX * 0.06, sz = hz + lz * lw * f + nZ * 0.06;
                const sy = PY + y0 + 0.6 + (r * (doorTop - 1.1)) / 4;
                box(B.lac, sx - 0.05, sy - 0.05, sz - 0.05, sx + 0.05, sy + 0.05, sz + 0.05, C.gold, 0.6);
              }
            }
          }
        }
      }
      // architrave (阑额) with 七朱八白
      const a0 = cols[0], a1 = cols[cols.length - 1];
      const bx0 = nX * (half - 0.28) + tX * a0, bz0 = nZ * (half - 0.28) + tZ * a0;
      const bx1 = nX * (half + 0.28) + tX * a1, bz1 = nZ * (half + 0.28) + tZ * a1;
      box(B.lac, bx0, PY + y0 + h - 0.55, bz0, bx1, PY + y0 + h, bz1, C.red, 0.95);
      for (let i = 0; i < cols.length - 1; i++) {
        for (let q = 0; q < 3; q++) {
          const aa = lerp(cols[i], cols[i + 1], (q + 0.72) / 3.44), ab = aa + (cols[i + 1] - cols[i]) * 0.2;
          const px0 = nX * (half + 0.29) + tX * aa, pz0 = nZ * (half + 0.29) + tZ * aa;
          const px1 = nX * (half + 0.3) + tX * ab, pz1 = nZ * (half + 0.3) + tZ * ab;
          box(B.lac, px0, PY + y0 + h - 0.4, pz0, px1, PY + y0 + h - 0.15, pz1, C.whiteB, 0.95);
        }
      }
      // 柱头枋 and 橑檐枋 carried by the brackets
      const s = opts.bracketScale || 1;
      const yb = PY + y0 + h;
      const e0 = nX * (half - 0.1) + tX * (a0 - 0.2), ez0 = nZ * (half - 0.1) + tZ * (a0 - 0.2);
      const e1 = nX * (half + 0.1) + tX * (a1 + 0.2), ez1 = nZ * (half + 0.1) + tZ * (a1 + 0.2);
      box(B.lac, e0, yb + 1.12 * s, ez0, e1, yb + 1.34 * s, ez1, C.redDark, 0.8);
      const o0 = nX * (half + 1.24 * s) + tX * (a0 - 1.1 * s), oz0 = nZ * (half + 1.24 * s) + tZ * (a0 - 1.1 * s);
      const o1 = nX * (half + 1.42 * s) + tX * (a1 + 1.1 * s), oz1 = nZ * (half + 1.42 * s) + tZ * (a1 + 1.1 * s);
      box(B.lac, o0, yb + 1.3 * s, oz0, o1, yb + 1.52 * s, oz1, C.redDark, 0.8);
    }
  }

  // ------------------------------------------------------------- balconies
  function railingRing(half, y, height, gapsFn) {
    const postEvery = 1.5;
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      const L = half * 2;
      const n = Math.max(2, Math.round(L / postEvery));
      const P = (a, yy, off = 0) => [nX * (half + off) + tX * a, PY + y + yy, nZ * (half + off) + tZ * a];
      for (let i = 0; i < n; i++) {
        const a0 = -half + (L * i) / n, a1 = -half + (L * (i + 1)) / n;
        if (gapsFn && gapsFn(side, (a0 + a1) / 2)) continue;
        // posts (望柱)
        const pp = P(a0, 0);
        box(B.lac, pp[0] - 0.09, pp[1], pp[2] - 0.09, pp[0] + 0.09, pp[1] + height + 0.14, pp[2] + 0.09, C.red, 0.95);
        // 寻杖 top rail, 盆唇 mid rail, 地栿 bottom rail
        beam(B.lac, P(a0, height), P(a1, height), 0.09, 0.09, C.red, 0.95);
        beam(B.lac, P(a0, height * 0.58), P(a1, height * 0.58), 0.1, 0.1, C.red, 0.95);
        beam(B.lac, P(a0, 0.06), P(a1, 0.06), 0.14, 0.12, C.redDark, 0.9);
        // small balusters (蜀柱) between mid and top rail
        for (const f of [0.33, 0.66]) {
          const bp = P(lerp(a0, a1, f), height * 0.58);
          box(B.lac, bp[0] - 0.035, bp[1], bp[2] - 0.035, bp[0] + 0.035, bp[1] + height * 0.42, bp[2] + 0.035, C.red, 0.95);
        }
        // 勾片 panel (alpha-cut texture)
        const q0 = P(a0 + 0.1, 0.12), q1 = P(a1 - 0.1, 0.12), q2 = P(a1 - 0.1, height * 0.56), q3 = P(a0 + 0.1, height * 0.56);
        B.panel.addQuad(q0, q1, q2, q3, [1, 1, 1], null, { aoV: 0.95 }, [0, 0, (a1 - a0) / 0.9, 0, (a1 - a0) / 0.9, 1, 0, 1]);
      }
      const cp = P(half, 0);
      box(B.lac, cp[0] - 0.09, cp[1], cp[2] - 0.09, cp[0] + 0.09, cp[1] + height + 0.14, cp[2] + 0.09, C.red, 0.95);
    }
  }

  function balcony(L, below) {
    // floor slab (full square: balcony ring + interior floor of this storey)
    const y = L.floor;
    box(B.wood, -L.balc, PY + y - 0.4, -L.balc, L.balc, PY + y, L.balc, C.wood, 1, false);
    solids.push([-L.balc, PY + y - 0.4, -L.balc, L.balc, PY + y, L.balc]);
    // fascia board around the slab edge
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      const a = -L.balc - 0.05, b = L.balc + 0.05;
      box(B.lac, nX * L.balc + tX * a - nX * 0.0, PY + y - 0.42, nZ * L.balc + tZ * a, nX * (L.balc + 0.08) + tX * b, PY + y + 0.02, nZ * (L.balc + 0.08) + tZ * b, C.redDark, 0.9);
    }
    // 平坐 band with small brackets on top of the lower eave
    const band = L.band;
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      box(B.lac, nX * (band - 0.2) + tX * -band, PY + below, nZ * (band - 0.2) + tZ * -band, nX * (band + 0.05) + tX * band, PY + y - 0.4, nZ * (band + 0.05) + tZ * band, C.red, 0.85);
      const n = Math.round((band * 2) / 1.2);
      for (let i = 0; i <= n; i++) {
        const a = -band + (band * 2 * i) / n;
        bracketMats.push(yRot([0, -Math.PI / 2, Math.PI, Math.PI / 2][side], nX * band + tX * a, PY + y - 0.4 - 0.62 * 0.55 - 0.4, nZ * band + tZ * a, 0.55, 0.55, 0.55));
      }
    }
    railingRing(L.rail, y, 1.05);
  }

  // ------------------------------------------------------------- platform & stair
  function platform() {
    const P = D.plat;
    // brick body (faces get the masonry shader), slightly battered look via two tiers
    box(B.mas, -P, Y0 - 1.5, -P, P, PY - 0.35, P, C.brick, 1, true);
    // capping stones (压阑石) and base course
    box(B.mat, -P - 0.25, PY - 0.35, -P - 0.25, P + 0.25, PY, P + 0.25, C.stoneL, 1);
    box(B.mat, -P - 0.45, Y0 - 0.2, -P - 0.45, P + 0.45, Y0 + 0.35, P + 0.45, C.stone, 1);
    // paving on top (subtle grid in the masonry shader)
    box(B.mas, -P, PY - 0.02, -P, P, PY + 0.02, P, U.mixc(C.stone, C.brick, 0.4), 1);
    // east stair (踏道)
    const S = D.stairs;
    for (let i = 0; i < S.steps; i++) {
      const x0 = S.x0 + (S.steps - 1 - i) * S.tread;
      const yTop = Y0 + (i + 1) * S.rise;
      box(B.mat, x0, Y0 - 0.3, -S.halfW, x0 + S.tread + 0.02, yTop, S.halfW, i % 2 ? C.stone : U.mixc(C.stone, C.stoneL, 0.4), 1, false);
    }
    const run = S.steps * S.tread;
    solids.push([S.x0, Y0 - 0.3, -S.halfW, S.x0 + run, PY, S.halfW]);
    // 垂带 side curbs
    for (const zs of [-1, 1]) {
      const z = zs * (S.halfW + 0.35);
      beam(B.mat, [S.x0 + run + 0.2, Y0 + 0.25, z], [S.x0 - 0.1, PY + 0.25, z], 0.7, 0.5, C.stoneL);
      // 象眼 triangle wall under the curb
      for (let k = 0; k < 6; k++) {
        const f0 = k / 6, f1 = (k + 1) / 6;
        const xa = lerp(S.x0 + run, S.x0, f0), xb = lerp(S.x0 + run, S.x0, f1);
        box(B.mas, xb, Y0 - 0.2, z - 0.3, xa, Y0 + (PY - Y0) * f1, z + 0.3, C.brick, 1);
      }
    }
    // stone balustrade along the platform edge, open at the stair
    const railH = 0.85;
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      const half = P - 0.3;
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a0 = -half + (2 * half * i) / n, a1 = -half + (2 * half * (i + 1)) / n;
        if (side === 0 && Math.abs((a0 + a1) / 2) < S.halfW + 0.9) continue;
        const p0 = [nX * half + tX * a0, PY, nZ * half + tZ * a0];
        const p1 = [nX * half + tX * a1, PY, nZ * half + tZ * a1];
        box(B.mat, p0[0] - 0.13, PY, p0[2] - 0.13, p0[0] + 0.13, PY + railH + 0.18, p0[2] + 0.13, C.stoneL, 1);
        beam(B.mat, [p0[0], PY + railH, p0[2]], [p1[0], PY + railH, p1[2]], 0.18, 0.14, C.stoneL);
        beam(B.mat, [p0[0], PY + 0.1, p0[2]], [p1[0], PY + 0.1, p1[2]], 0.22, 0.2, C.stone);
        beam(B.mat, [p0[0], PY + railH * 0.5, p0[2]], [p1[0], PY + railH * 0.5, p1[2]], 0.12, railH * 0.72, U.mixc(C.stone, C.stoneL, 0.5));
      }
    }
    // paved court in front of the stair and a stele
    box(B.mas, S.x0 + run, Y0 - 0.25, -11, S.x0 + run + 14, Y0 + 0.06, 11, U.mixc(C.stone, C.brick, 0.5), 1);
  }

  // ------------------------------------------------------------- interiors
  // U-shaped stair L2 → L3 by the west door: flight 1 climbs north, a landing
  // turns it, flight 2 climbs south and arrives beside the L3 west door.
  const STAIR2 = {
    f1x: [-7.95, -6.45], f1z0: 0.5, f1z1: -5.1,
    landX: [-7.95, -4.85], landZ: [-6.9, -5.1],
    f2x: [-6.35, -4.85], f2z0: -5.1, f2z1: 0.5,
    steps: 25,
  };
  function stairs() {
    const L2y = D.L2.floor, L3y = D.L3.floor;
    const rise = (L3y - L2y) / 2;
    const S = STAIR2, n = S.steps;
    const rh = rise / n;
    const t1 = (S.f1z0 - S.f1z1) / n;
    // flight 1 (north)
    for (let i = 0; i < n; i++) {
      const z0 = S.f1z0 - i * t1;
      box(B.wood, S.f1x[0], PY + L2y + i * rh, z0 - t1 - 0.02, S.f1x[1], PY + L2y + (i + 1) * rh, z0, i % 2 ? C.wood : U.mixc(C.wood, C.woodDark, 0.3), 0.55);
    }
    for (const x of S.f1x) beam(B.wood, [x, PY + L2y + 0.1, S.f1z0], [x, PY + L2y + rise + 0.1, S.f1z1], 0.1, 0.34, C.woodDark, 0.5);
    beam(B.lac, [S.f1x[0] + 0.05, PY + L2y + 1.0, S.f1z0], [S.f1x[0] + 0.05, PY + L2y + rise + 1.0, S.f1z1], 0.07, 0.07, C.red, 0.55);
    // landing with posts
    box(B.wood, S.landX[0], PY + L2y + rise - 0.35, S.landZ[0], S.landX[1], PY + L2y + rise, S.landZ[1], C.wood, 0.5);
    for (const [x, z] of [[S.landX[0] + 0.1, S.landZ[0] + 0.1], [S.landX[1] - 0.1, S.landZ[0] + 0.1], [(S.f1x[1] + S.f2x[0]) / 2, S.landZ[1] - 0.1]]) {
      box(B.wood, x - 0.1, PY + L2y, z - 0.1, x + 0.1, PY + L2y + rise - 0.3, z + 0.1, C.woodDark, 0.5);
    }
    beam(B.lac, [S.landX[0] + 0.05, PY + L2y + rise + 1.0, S.landZ[0] + 0.05], [S.landX[1] - 0.05, PY + L2y + rise + 1.0, S.landZ[0] + 0.05], 0.07, 0.07, C.red, 0.55);
    // flight 2 (south)
    const t2 = (S.f2z1 - S.f2z0) / n;
    for (let i = 0; i < n; i++) {
      const z0 = S.f2z0 + i * t2;
      box(B.wood, S.f2x[0], PY + L2y + rise + i * rh, z0, S.f2x[1], PY + L2y + rise + (i + 1) * rh, z0 + t2 + 0.02, i % 2 ? C.wood : U.mixc(C.wood, C.woodDark, 0.3), 0.55);
    }
    for (const x of S.f2x) beam(B.wood, [x, PY + L2y + rise + 0.1, S.f2z0], [x, PY + L3y + 0.1, S.f2z1], 0.1, 0.34, C.woodDark, 0.5);
    beam(B.lac, [S.f2x[1] - 0.05, PY + L2y + rise + 1.0, S.f2z0], [S.f2x[1] - 0.05, PY + L3y + 1.0, S.f2z1], 0.07, 0.07, C.red, 0.55);
    // camera-check solids under each flight
    solids.push([S.f1x[0], PY + L2y, S.f1z1, S.f1x[1], PY + L2y + rise * 0.45, S.f1z0]);
    solids.push([S.f2x[0], PY + L2y + rise * 0.5, S.f2z0, S.f2x[1], PY + L2y + rise * 1.45, S.f2z1]);
    // lower stair (L1 → L2) along the south wall, arriving through an opening in the L2 floor
    const L1rise = D.L2.floor - 0.4;
    const m = 40;
    for (let i = 0; i < m; i++) {
      const x0 = -6.5 + (i * 12.5) / m;
      box(B.wood, x0, PY + (i * L1rise) / m, 7.0, x0 + 12.5 / m + 0.02, PY + ((i + 1) * L1rise) / m, 8.3, C.wood, 0.4);
    }
  }

  function interiors() {
    // L1 hall: floor and inner columns (seen through the door)
    const c1 = D.L1.c - 0.25;
    box(B.wood, -c1, PY + 0.01, -c1, c1, PY + 0.05, c1, C.woodDark, 0.45);
    for (const x of [-4.2, 4.2]) for (const z of [-4.2, 4.2]) {
      columnMats.push(U.mat(x, PY, z, 0, 0, 0, 0.3, D.L2.floor - 0.4, 0.3));
    }
    // L2 inner columns and beams under the L3 floor
    for (const x of [-4.5, 4.5]) for (const z of [-4.5, 4.5]) {
      columnMats.push(U.mat(x, PY + D.L2.floor, z, 0, 0, 0, 0.28, D.L3.floor - D.L2.floor - 0.4, 0.28));
      solids.push([x - 0.3, PY + D.L2.floor, z - 0.3, x + 0.3, PY + D.L3.floor, z + 0.3]);
    }
    for (const z of [-4.5, 4.5]) box(B.wood, -8.7, PY + D.L3.floor - 0.9, z - 0.2, 8.7, PY + D.L3.floor - 0.4, z + 0.2, C.woodDark, 0.45);
    for (const x of [-4.5, 4.5]) box(B.wood, x - 0.18, PY + D.L3.floor - 0.8, -8.7, x + 0.18, PY + D.L3.floor - 0.4, 8.7, C.woodDark, 0.45);
    // L3 coffered ceiling (平棊)
    const c3 = D.L3.c - 0.25;
    const yc = PY + D.L3.floor + D.L3.colH;
    box(B.wood, -c3, yc - 0.05, -c3, c3, yc + 0.1, c3, U.mixc(C.soffit, C.green, 0.25), 0.5);
    for (let i = -3; i <= 3; i++) {
      box(B.lac, i * 2.1 - 0.06, yc - 0.18, -c3, i * 2.1 + 0.06, yc - 0.04, c3, C.red, 0.5);
      box(B.lac, -c3, yc - 0.18, i * 2.1 - 0.06, c3, yc - 0.04, i * 2.1 + 0.06, C.red, 0.5);
    }
    solids.push([-c3, yc - 0.2, -c3, c3, yc + 0.2, c3]);
    // small table with an inkstone near the L3 west window (a trace of use)
    box(B.wood, 3.4, PY + D.L3.floor, 2.2, 4.6, PY + D.L3.floor + 0.72, 3.4, C.woodDark, 0.6);
    box(B.mat, 3.7, PY + D.L3.floor + 0.72, 2.5, 4.1, PY + D.L3.floor + 0.78, 2.8, C.dark, 0.6);
  }

  // L3 floor with a stair opening (built as four slabs), and its guard rail
  function l3Floor() {
    const y = D.L3.floor, b = D.L3.balc;
    const O = { x0: -6.4, x1: -4.8, z0: -4.9, z1: 0.95 };
    const slab = (x0, z0, x1, z1) => {
      box(B.wood, x0, PY + y - 0.4, z0, x1, PY + y, z1, C.wood, 1);
      solids.push([x0, PY + y - 0.4, z0, x1, PY + y, z1]);
    };
    slab(-b, O.z1, b, b);
    slab(-b, -b, b, O.z0);
    slab(-b, O.z0, O.x0, O.z1);
    slab(O.x1, O.z0, b, O.z1);
    // fascia
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      const a = -b - 0.05, c = b + 0.05;
      box(B.lac, nX * b + tX * a, PY + y - 0.42, nZ * b + tZ * a, nX * (b + 0.08) + tX * c, PY + y + 0.02, nZ * (b + 0.08) + tZ * c, C.redDark, 0.9);
    }
    // guard rails on the west, east and north sides of the opening (the south end is the stair head)
    for (const [a, b] of [[[O.x0, O.z0], [O.x0, O.z1 - 0.9]], [[O.x1, O.z0], [O.x1, O.z1 - 0.9]], [[O.x0, O.z0], [O.x1, O.z0]]]) {
      beam(B.lac, [a[0], PY + y + 0.95, a[1]], [b[0], PY + y + 0.95, b[1]], 0.08, 0.08, C.red, 0.6);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.round(len / 1.1));
      for (let i = 0; i <= k; i++) {
        const x = lerp(a[0], b[0], i / k), z = lerp(a[1], b[1], i / k);
        box(B.lac, x - 0.05, PY + y, z - 0.05, x + 0.05, PY + y + 0.95, z + 0.05, C.red, 0.6);
      }
    }
    return O;
  }

  // ------------------------------------------------------------- plaque & lanterns
  let plaqueTex = null;
  function plaque() {
    const w = 3.3, h = 1.25;
    const draw = (ctx, W, H) => {
      ctx.fillStyle = '#6e2a1c';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#b78d45';
      ctx.fillRect(10, 10, W - 20, H - 20);
      ctx.fillStyle = '#1e3a3c';
      ctx.fillRect(30, 30, W - 60, H - 60);
      ctx.fillStyle = '#d9b66a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(H * 0.56)}px "Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", serif`;
      // horizontal plaques read right-to-left: 鹳 雀 楼 → drawn 楼 雀 鹳 left to right
      const chars = ['楼', '雀', '鹳'];
      chars.forEach((ch, i) => ctx.fillText(ch, W * (0.2 + 0.3 * i), H * 0.53));
    };
    plaqueTex = U.canvasTexture(768, 290, draw);
    const g = new THREE.PlaneGeometry(w, h);
    const m = SL.standard({ map: plaqueTex, vertexColors: false, roughness: 0.6 });
    const mesh = new THREE.Mesh(g, m);
    // on the east face of L2, above the doorway, under the eave
    mesh.position.set(D.L2.c + 0.3, PY + D.L2.floor + D.L2.colH - 1.1, 0);
    mesh.rotation.y = Math.PI / 2;
    mesh.rotation.x = 0;
    mesh.userData.pick = 'tower';
    return { mesh, redraw: () => { const c = plaqueTex.image; draw(c.getContext('2d'), c.width, c.height); plaqueTex.needsUpdate = true; } };
  }

  const lanterns = [];
  function lanternAt(x, y, z) {
    const g = new THREE.SphereGeometry(0.34, 12, 10);
    g.scale(1, 1.25, 1);
    _m.makeTranslation(x, y, z);
    B.emit.add(g, _m, C.lantern, { aEmit: 1 });
    const cap = new THREE.CylinderGeometry(0.16, 0.2, 0.12, 10);
    _m.makeTranslation(x, y + 0.46, z);
    B.lac.add(cap, _m, C.dark);
    _m.makeTranslation(x, y - 0.46, z);
    B.lac.add(cap, _m, C.dark);
    beam(B.lac, [x, y + 0.5, z], [x, y + 1.3, z], 0.02, 0.02, C.dark);
    lanterns.push([x, y, z]);
  }

  // ------------------------------------------------------------- materials
  function tileMaterial() {
    return SL.standard({ roughness: 0.62, metalness: 0.0 }, {
      aov: true,
      key: 'tile',
      extraVertex: (vs) => vs
        .replace('#include <common>', '#include <common>\nattribute vec3 aTan;\nvarying vec3 vTanV;\nvarying vec2 vTileUv;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 tnv = normalMatrix * aTan;\nvTanV = dot(tnv, tnv) > 1e-8 ? normalize(tnv) : vec3(0.0);\nvTileUv = uv;'),
      extraFragment: (fs) => fs
        .replace('#include <common>', '#include <common>\nvarying vec3 vTanV;\nvarying vec2 vTileUv;')
        .replace('#include <color_fragment>', `#include <color_fragment>
  float tph = vTileUv.x / 0.36;
  float tfw = fwidth(tph);
  float tk = 1.0 - smoothstep(0.3, 0.75, tfw);
  float ts = sin(tph * 6.2831853);
  diffuseColor.rgb *= mix(1.0, 0.7 + 0.36 * smoothstep(-0.7, 0.8, ts), tk);
  float cv = fract(vTileUv.y * 3.1);
  diffuseColor.rgb *= mix(1.0, 0.9 + 0.1 * smoothstep(0.0, 0.2, cv), tk);
  diffuseColor.rgb *= 0.92 + 0.16 * hash12(floor(vec2(tph, vTileUv.y * 3.1)));`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize(normal + vTanV * (-cos(tph * 6.2831853)) * 0.55 * tk);`),
    });
  }
  function masonryMaterial() {
    return SL.standard({ roughness: 0.93 }, {
      aov: true,
      key: 'masonry',
      extraFragment: (fs) => fs.replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 wp = vWorldPosF;
  float course = wp.y / 0.12;
  float row = floor(course);
  float along = wp.x + wp.z;
  float brick = (along + mod(row, 2.0) * 0.14) / 0.28;
  float fx = fract(brick), fy = fract(course);
  float fwb = fwidth(brick) + fwidth(course);
  float k = 1.0 - smoothstep(0.25, 0.7, fwb);
  float mortar = 1.0 - smoothstep(0.0, 0.08, fy) * smoothstep(1.0, 0.92, fy) * smoothstep(0.0, 0.05, fx) * smoothstep(1.0, 0.95, fx);
  float var = hash12(vec2(floor(brick), row));
  diffuseColor.rgb *= mix(1.0, (0.86 + 0.24 * var) * mix(1.0, 1.18, mortar), k);
}`),
    });
  }

  // ------------------------------------------------------------- assemble
  const perches = [];
  function build(quality) {
    B = {
      lac: new U.GeoBuilder().addExtra('aoV', 1),
      mat: new U.GeoBuilder().addExtra('aoV', 1),
      wood: new U.GeoBuilder().addExtra('aoV', 1),
      tile: new U.GeoBuilder({ uv: true }).addExtra('aoV', 1).addExtra('aTan', 3),
      mas: new U.GeoBuilder().addExtra('aoV', 1),
      panel: new U.GeoBuilder({ uv: true }).addExtra('aoV', 1),
      emit: new U.GeoBuilder().addExtra('aoV', 1).addExtra('aEmit', 1),
    };
    platform();
    // Level 1 (ground floor with 副阶)
    const L1 = D.L1, L2 = D.L2, L3 = D.L3;
    columnsRing(L1.c, L1.cols, 0, L1.colH, 0.34);
    const fjCols = [-14, -10.5, -6.3, -2.1, 2.1, 6.3, 10.5, 14];
    columnsRing(L1.fj, fjCols, 0, L1.fjColH, 0.28);
    wallsRing(L1.c, L1.cols, 0, L1.colH, [
      ['wall', 'window', 'door', 'window', 'wall'],
      ['wall', 'window', 'window', 'window', 'wall'],
      ['wall', 'window', 'window', 'window', 'wall'],
      ['wall', 'window', 'window', 'window', 'wall'],
    ], { sill: 1.3, winTop: 3.9, doorTop: 4.2, leaves: [2, -1, -1, -1], bracketScale: 1 });
    // 副阶 architrave and brackets
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      const h = L1.fj;
      box(B.lac, nX * (h - 0.24) + tX * -h, PY + L1.fjColH - 0.45, nZ * (h - 0.24) + tZ * -h, nX * (h + 0.24) + tX * h, PY + L1.fjColH, nZ * (h + 0.24) + tZ * h, C.red, 0.95);
    }
    brackets(L1.fj, L1.fjColH, fjCols, 0.72);
    brackets(L1.c, L1.colH, L1.cols, 1.0);
    // eaves 1 & 2
    for (let s = 0; s < 4; s++) ringSide(D.eave1, s);
    ringRidges(D.eave1);
    eaveDetails(D.eave1);
    for (let s = 0; s < 4; s++) ringSide(D.eave2, s);
    ringRidges(D.eave2);
    eaveDetails(D.eave2);
    // Level 2
    balcony(L2, D.eave2.yIn - 0.3);
    columnsRing(L2.c, L2.cols, L2.floor, L2.colH, 0.3);
    const kinds2 = ['window', 'window', 'door', 'window', 'window'];
    wallsRing(L2.c, L2.cols, L2.floor, L2.colH, [kinds2, kinds2, kinds2, kinds2], { sill: 0.9, winTop: 2.7, doorTop: 3.0, bracketScale: 0.95 });
    brackets(L2.c, L2.floor + L2.colH, L2.cols, 0.95);
    for (let s = 0; s < 4; s++) ringSide(D.eave3, s);
    ringRidges(D.eave3);
    eaveDetails(D.eave3);
    // Level 3
    const opening = l3Floor();
    // 平坐 band of level 3
    for (let side = 0; side < 4; side++) {
      const nX = [1, 0, -1, 0][side], nZ = [0, 1, 0, -1][side];
      const tX = -nZ, tZ = nX;
      const band = L3.band;
      box(B.lac, nX * (band - 0.2) + tX * -band, PY + D.eave3.yIn - 0.3, nZ * (band - 0.2) + tZ * -band, nX * (band + 0.05) + tX * band, PY + L3.floor - 0.4, nZ * (band + 0.05) + tZ * band, C.red, 0.85);
    }
    railingRing(L3.rail, L3.floor, 1.05);
    columnsRing(L3.c, L3.cols, L3.floor, L3.colH, 0.28);
    const kinds3 = ['window', 'window', 'door', 'window', 'window'];
    wallsRing(L3.c, L3.cols, L3.floor, L3.colH, [kinds3, kinds3, kinds3, kinds3], { sill: 0.9, winTop: 2.6, doorTop: 2.85, bracketScale: 0.9 });
    brackets(L3.c, L3.floor + L3.colH, L3.cols, 0.9);
    topRoof();
    stairs();
    interiors();
    // lanterns: at the main door and under the top eave (lit at dusk)
    lanternAt(L1.fj + 0.2, PY + 4.3, -2.6);
    lanternAt(L1.fj + 0.2, PY + 4.3, 2.6);
    lanternAt(-L3.c - 1.2, PY + L3.floor + L3.colH - 0.2, -2.2);
    lanternAt(-L3.c - 1.2, PY + L3.floor + L3.colH - 0.2, 2.2);
    lanternAt(L3.c + 1.2, PY + L3.floor + L3.colH - 0.2, 0);

    // perches for storks: eave corners
    for (const o of [D.eave2, D.eave3, D.eave1]) {
      for (let side = 0; side < 4; side++) {
        const p = ringPoint(o, side, 1, 0.97);
        perches.push({ p: [p[0], p[1] + 0.42, p[2]], ry: Math.atan2(p[0], p[2]) });
      }
    }

    // Meshes
    const group = new THREE.Group();
    group.name = 'tower';
    const matLac = SL.standard({ roughness: 0.48 }, { aov: true });
    const matMat = SL.standard({ roughness: 0.92 }, { aov: true });
    const matWood = SL.standard({ roughness: 0.82 }, { aov: true });
    const matTile = tileMaterial();
    const matMas = masonryMaterial();
    const panelTex = U.canvasTexture(128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#a4372a';
      ctx.lineWidth = 11;
      ctx.lineCap = 'square';
      // 勾片 pattern: interlocking angular hooks
      ctx.beginPath();
      ctx.moveTo(8, 8); ctx.lineTo(64, 64); ctx.lineTo(120, 8);
      ctx.moveTo(8, 120); ctx.lineTo(64, 64); ctx.lineTo(120, 120);
      ctx.moveTo(8, 8); ctx.lineTo(8, 120);
      ctx.moveTo(120, 8); ctx.lineTo(120, 120);
      ctx.stroke();
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(34, 34); ctx.lineTo(34, 94); ctx.moveTo(94, 34); ctx.lineTo(94, 94);
      ctx.stroke();
    }, { repeat: true });
    const matPanel = SL.standard({ map: panelTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 }, { aov: true });
    const matEmit = SL.standard({ roughness: 0.7, emissive: 0x000000 }, { aov: true, emit: true, emitGain: 4.0 });
    // interiors get less sky light: darken inward-facing and enclosed surfaces
    const coreAt = (y) => {
      const ry = y - PY;
      if (ry < L2.floor - 0.4) return L1.c;
      if (ry < L3.floor - 0.4) return L2.c;
      if (ry < L3.floor + L3.colH + 0.2) return L3.c;
      return -1;
    };
    const darkenInterior = (b) => {
      const ao = b.extra.aoV && b.extra.aoV.data;
      if (!ao) return;
      for (let i = 0; i < b.count; i++) {
        const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
        const nx = b.nor[i * 3], ny = b.nor[i * 3 + 1], nz = b.nor[i * 3 + 2];
        const c = coreAt(y);
        if (c < 0) continue;
        const m = Math.max(Math.abs(x), Math.abs(z));
        if (m > c + 0.02) continue;
        const inward = nx * x + nz * z < -0.05 * Math.hypot(x, z);
        if (inward || ny < -0.5) ao[i] = Math.min(ao[i], 0.38);
        else if (ny > 0.5 && m < c - 0.3) ao[i] = Math.min(ao[i], 0.5);
        else if (m < c - 0.3) ao[i] = Math.min(ao[i], 0.5);
      }
    };
    for (const k of ['lac', 'mat', 'wood']) darkenInterior(B[k]);
    const add = (b, m, shadow = true, name = '') => {
      if (!b.count) return null;
      const mesh = new THREE.Mesh(b.build(), m);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.userData.pick = 'tower';
      mesh.name = name;
      group.add(mesh);
      return mesh;
    };
    add(B.lac, matLac, true, 'lacquer');
    add(B.mat, matMat, true, 'matte');
    add(B.wood, matWood, true, 'wood');
    add(B.tile, matTile, true, 'tiles');
    add(B.mas, matMas, true, 'masonry');
    add(B.panel, matPanel, false, 'panels');
    add(B.emit, matEmit, false, 'lanterns');
    // instanced parts
    const inst = (geo, mat, list, color, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      if (color) for (let i = 0; i < list.length; i++) im.setColorAt(i, new THREE.Color(color[0], color[1], color[2]));
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.userData.pick = 'tower';
      im.computeBoundingSphere();
      group.add(im);
      return im;
    };
    const bracketGeo = bracketGeometry();
    inst(bracketGeo, SL.standard({ roughness: 0.6 }, {}), bracketMats, null, true);
    const colGeo = columnGeometry();
    inst(colGeo, SL.standard({ roughness: 0.45, vertexColors: false }, {}), columnMats, C.red, true);
    const baseGeo = new THREE.CylinderGeometry(0.62, 1, 1, 16);
    baseGeo.translate(0, 0.5, 0);
    inst(baseGeo, SL.standard({ roughness: 0.9, vertexColors: false }, {}), baseMats, C.stoneL, false);
    const rafterGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    inst(rafterGeo, SL.standard({ roughness: 0.7, vertexColors: false }, {}), rafterMats, C.rafter, false);
    const endGeo = new THREE.CylinderGeometry(1, 1, 0.5, 10);
    inst(endGeo, SL.standard({ roughness: 0.6, vertexColors: false }, {}), tileEnds, C.ridge, false);
    const pq = plaque();
    group.add(pq.mesh);

    // anchors used by the staging
    const anchors = {
      PY, Y0,
      stairFoot: [D.stairs.x0 + D.stairs.steps * D.stairs.tread + 0.6, Y0, 0],
      stairTop: [D.stairs.x0 - 0.2, PY, 0],
      door1: [L1.c, PY, 0],
      L2: { y: PY + L2.floor, rail: L2.rail, core: L2.c, balc: L2.balc },
      L3: { y: PY + L3.floor, rail: L3.rail, core: L3.c, balc: L3.balc, ceiling: PY + L3.floor + L3.colH },
      stair2: Object.assign({ y0: PY + L2.floor, yMid: PY + (L2.floor + L3.floor) / 2, y1: PY + L3.floor }, STAIR2),
      opening,
      lanterns,
      plaque: pq.mesh.position.clone(),
      eave2Corner: (side) => ringPoint(D.eave2, side, 1, 0.97),
      eave3Corner: (side) => ringPoint(D.eave3, side, 1, 0.97),
    };
    return { group, anchors, solids, perches, D, ringPoint, redrawPlaque: pq.redraw };
  }

  return { build, D, PY, Y0 };
})();
