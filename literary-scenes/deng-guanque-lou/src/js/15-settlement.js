/* ==========================================================================
 * 15-settlement.js — 蒲州城 east of the tower (walls, west gate tower,
 * courtyard houses with dusk-lit windows) and a few villages on the plain.
 * The city is backdrop: it places the tower "in 蒲州城西".
 * ========================================================================== */
const Settlement = (() => {
  const { rng, lerp } = U;
  const UBOX = new THREE.BoxGeometry(1, 1, 1);
  const _m = new THREE.Matrix4();

  const COL = {
    wallEarth: U.lin(0xb39a73), wallBrick: U.lin(0x8e877c), plaster: U.lin(0xd8cbb0), earth: U.lin(0xbaa07a),
    roof: U.lin(0x4c5153), roofDark: U.lin(0x3e4345), timber: U.lin(0x6b3a29), window: U.lin(0x2a211a), red: U.lin(0x8f3024),
  };

  function box(b, x0, y0, z0, x1, y1, z1, c, extras) {
    _m.makeScale(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    _m.setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    b.add(UBOX, _m, c, extras);
  }

  // Gable roof along x: from (-L/2..L/2), depth D, eave y0, ridge height rh, overhang o
  function gableRoof(b, L, D, y0, rh, o, c) {
    const hx = L / 2 + o, hz = D / 2 + o;
    const ridge = [0, y0 + rh, 0];
    // two slopes
    b.addQuad([-hx, y0 - 0.25, hz], [hx, y0 - 0.25, hz], [hx, ridge[1], 0], [-hx, ridge[1], 0], c);
    b.addQuad([hx, y0 - 0.25, -hz], [-hx, y0 - 0.25, -hz], [-hx, ridge[1], 0], [hx, ridge[1], 0], c);
    // gable ends
    b.addQuad([-hx + o, y0, -D / 2], [-hx + o, y0, D / 2], [-hx + o, ridge[1] - 0.1, 0.001], [-hx + o, ridge[1] - 0.1, -0.001], COL.plaster);
    b.addQuad([hx - o, y0, D / 2], [hx - o, y0, -D / 2], [hx - o, ridge[1] - 0.1, -0.001], [hx - o, ridge[1] - 0.1, 0.001], COL.plaster);
    // ridge
    box(b, -hx, ridge[1] - 0.1, -0.18, hx, ridge[1] + 0.28, 0.18, COL.roofDark);
  }
  // Hip roof (for halls)
  function hipRoof(b, L, D, y0, rh, o, c) {
    const hx = L / 2 + o, hz = D / 2 + o;
    const rx = Math.max(0.5, hx - hz * 0.9);
    const y1 = y0 + rh;
    b.addQuad([-hx, y0 - 0.3, hz], [hx, y0 - 0.3, hz], [rx, y1, 0], [-rx, y1, 0], c);
    b.addQuad([hx, y0 - 0.3, -hz], [-hx, y0 - 0.3, -hz], [-rx, y1, 0], [rx, y1, 0], c);
    b.addQuad([hx, y0 - 0.3, hz], [hx, y0 - 0.3, -hz], [rx, y1, 0], [rx, y1, 0.0001], c);
    b.addQuad([-hx, y0 - 0.3, -hz], [-hx, y0 - 0.3, hz], [-rx, y1, 0.0001], [-rx, y1, 0], c);
    box(b, -rx - 0.2, y1 - 0.1, -0.2, rx + 0.2, y1 + 0.3, 0.2, COL.roofDark);
  }

  // House variants: body + roof + windows (aEmit=1 on window faces)
  function houseVariant(kind, seed) {
    const r = rng(seed);
    const b = new U.GeoBuilder().addExtra('aEmit', 1);
    let L, D, H;
    if (kind === 0) { L = 9 + r() * 3; D = 5.5 + r(); H = 3.1; }
    else if (kind === 1) { L = 13 + r() * 3; D = 7.5 + r(); H = 3.8; }
    else { L = 7; D = 5; H = 2.8; }
    const wallC = r() < 0.5 ? COL.plaster : COL.earth;
    box(b, -L / 2, -0.6, -D / 2, L / 2, H, D / 2, wallC);
    // timber posts at corners and front
    for (const x of [-L / 2, L / 2]) box(b, x - 0.12, 0, D / 2 - 0.1, x + 0.12, H, D / 2 + 0.14, COL.timber);
    // windows / door on the front (south, +z) — emissive at dusk
    const nW = kind === 1 ? 4 : 2;
    for (let i = 0; i < nW; i++) {
      const x = lerp(-L / 2 + 1.6, L / 2 - 1.6, nW === 1 ? 0.5 : i / (nW - 1));
      box(b, x - 0.55, 1.0, D / 2 - 0.02, x + 0.55, 2.0, D / 2 + 0.05, COL.window, { aEmit: 1 });
    }
    box(b, -0.6, 0, D / 2 - 0.02, 0.6, 2.3, D / 2 + 0.06, COL.timber, { aEmit: 0.35 });
    if (kind === 1) hipRoof(b, L, D, H, 2.6, 0.9, COL.roof);
    else gableRoof(b, L, D, H, 1.8 + (kind === 0 ? 0.3 : 0), 0.7, COL.roof);
    return b.build();
  }

  function build(quality) {
    const group = new THREE.Group();
    group.name = 'city';
    const C = Terrain.CITY;
    const r = rng(77);
    const Y = C.y;
    const dens = quality.treeDensity;

    // ---- city walls (rammed earth with brick facing) with crenellations
    const wb = new U.GeoBuilder();
    const wallH = 9.5, baseW = 11, topW = 8;
    const merlons = [];
    const wallSeg = (x0, z0, x1, z1, gateAt) => {
      const dx = x1 - x0, dz = z1 - z0;
      const L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L; // along
      const nx = -uz, nz = ux;        // across
      const steps = Math.ceil(L / 40);
      for (let i = 0; i < steps; i++) {
        const a = (L * i) / steps, bb = (L * (i + 1)) / steps;
        const mid = (a + bb) / 2;
        if (gateAt !== undefined && Math.abs(mid - gateAt) < 22) {
          // gate block with a tunnel
          const cx = x0 + ux * mid, cz = z0 + uz * mid;
          const len = bb - a;
          const piece = (off, w) => {
            _m.makeBasis(new THREE.Vector3(ux * w, 0, uz * w), new THREE.Vector3(0, wallH, 0), new THREE.Vector3(nx * baseW, 0, nz * baseW));
            _m.setPosition(cx + ux * off, Y + wallH / 2 - 0.5, cz + uz * off);
            wb.add(UBOX, _m, COL.wallBrick);
          };
          piece(-len / 4 - 1.6, len / 2 - 3.2);
          piece(len / 4 + 1.6, len / 2 - 3.2);
          _m.makeBasis(new THREE.Vector3(ux * 6.4, 0, uz * 6.4), new THREE.Vector3(0, wallH - 5.5, 0), new THREE.Vector3(nx * baseW, 0, nz * baseW));
          _m.setPosition(cx, Y + 5.5 + (wallH - 5.5) / 2 - 0.5, cz);
          wb.add(UBOX, _m, COL.wallBrick);
          continue;
        }
        const cx = x0 + ux * mid, cz = z0 + uz * mid;
        const h = Terrain.meshHeightAt(cx, cz);
        const len = bb - a + 0.4;
        // battered wall: lower wide block + upper narrower block
        _m.makeBasis(new THREE.Vector3(ux * len, 0, uz * len), new THREE.Vector3(0, wallH * 0.55 + (Y - h) + 1, 0), new THREE.Vector3(nx * baseW, 0, nz * baseW));
        _m.setPosition(cx, (h - 1 + Y + wallH * 0.55) / 2, cz);
        wb.add(UBOX, _m, COL.wallEarth);
        _m.makeBasis(new THREE.Vector3(ux * len, 0, uz * len), new THREE.Vector3(0, wallH * 0.45, 0), new THREE.Vector3(nx * topW, 0, nz * topW));
        _m.setPosition(cx, Y + wallH * 0.55 + wallH * 0.225, cz);
        wb.add(UBOX, _m, COL.wallBrick);
      }
      // merlons along the outer edge
      for (let d = 2; d < L - 2; d += 2.4) {
        if (gateAt !== undefined && Math.abs(d - gateAt) < 14) continue;
        const x = x0 + ux * d - nx * (topW / 2 - 0.4), z = z0 + uz * d - nz * (topW / 2 - 0.4);
        merlons.push(U.mat(x, Y + wallH + 0.55, z, 0, Math.atan2(ux, uz), 0, 0.5, 1.1, 1.3));
      }
    };
    const x0 = C.x0, x1 = C.x1, z0 = C.z0, z1 = C.z1;
    wallSeg(x0, z1, x0, z0, z1 - 0);     // west wall (north → south order reversed so outside is west)
    wallSeg(x0, z0, x1, z0);             // north wall
    wallSeg(x1, z0, x1, z1);             // east wall
    wallSeg(x1, z1, x0, z1);             // south wall
    const wallMat = SL.lambert({}, { key: 'citywall' });
    const wallMesh = new THREE.Mesh(wb.build(), wallMat);
    wallMesh.receiveShadow = true;
    wallMesh.userData.pick = 'city';
    group.add(wallMesh);
    const mer = new THREE.InstancedMesh(UBOX, SL.lambert({ vertexColors: false, color: 0x8e877c }), merlons.length);
    merlons.forEach((m, i) => mer.setMatrixAt(i, m));
    mer.userData.pick = 'city';
    group.add(mer);

    // ---- west gate tower (城楼) above the gate
    const gb = new U.GeoBuilder().addExtra('aEmit', 1);
    const gx = x0, gy = Y + wallH;
    box(gb, gx - 4, gy, -9, gx + 4, gy + 0.5, 9, COL.wallBrick);
    for (const z of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) for (const x of [gx - 3.2, gx + 3.2]) box(gb, x - 0.22, gy + 0.5, z - 0.22, x + 0.22, gy + 5, z + 0.22, COL.red);
    box(gb, gx - 3.0, gy + 0.5, -7.4, gx + 3.0, gy + 4.6, 7.4, COL.plaster);
    for (const z of [-4.5, 0, 4.5]) box(gb, gx - 3.08, gy + 1.6, z - 0.8, gx - 2.95, gy + 3.4, z + 0.8, COL.window, { aEmit: 1 });
    const hr = new U.GeoBuilder();
    hipRoof(hr, 19.5, 9.5, 0, 3.6, 1.6, COL.roof);
    const hrGeo = hr.build();
    hrGeo.rotateY(Math.PI / 2);
    hrGeo.translate(gx, gy + 5.0, 0);
    gb.add(hrGeo, null, [1, 1, 1], { aEmit: 0 });
    const gateMesh = new THREE.Mesh(gb.build(), SL.lambert({}, { emit: true, emitGain: 2.5 }));
    gateMesh.userData.pick = 'city';
    group.add(gateMesh);

    // ---- houses (instanced variants) in a street grid
    const variants = [houseVariant(0, 1), houseVariant(0, 2), houseVariant(1, 3), houseVariant(2, 4)];
    const lists = variants.map(() => []);
    const lit = variants.map(() => []);
    const place = (x, z, ry, vi) => {
      const y = Terrain.meshHeightAt(x, z);
      lists[vi].push(U.mat(x, y, z, 0, ry, 0));
      lit[vi].push(r() < 0.55 ? 0.5 + r() * 0.5 : 0.0);
    };
    for (let x = x0 + 30; x < x1 - 20; x += 34) {
      if (Math.abs(x - 820) < 18) continue; // N–S main street
      for (let z = z0 + 26; z < z1 - 20; z += 26) {
        if (Math.abs(z) < 16) continue; // E–W main street
        if (r() < 0.12) continue;
        const jx = (r() - 0.5) * 5, jz = (r() - 0.5) * 3;
        const vi = r() < 0.18 ? 2 : r() < 0.5 ? 0 : r() < 0.8 ? 1 : 3;
        place(x + jx, z + jz, r() < 0.8 ? 0 : Math.PI / 2, vi);
        if (r() < 0.55) place(x + jx + (r() < 0.5 ? -9 : 9), z + jz + 6, Math.PI / 2, 3);
      }
    }
    // central drum tower at the crossing
    const dt = new U.GeoBuilder().addExtra('aEmit', 1);
    const dy = Terrain.meshHeightAt(820, 0);
    box(dt, 810, dy - 0.5, -10, 830, dy + 8, 10, COL.wallBrick);
    box(dt, 813, dy + 8, -7, 827, dy + 13, 7, COL.plaster);
    for (const z of [-5, 0, 5]) box(dt, 812.9, dy + 9.5, z - 0.8, 813.1, dy + 11.5, z + 0.8, COL.window, { aEmit: 1 });
    const dr = new U.GeoBuilder();
    hipRoof(dr, 17, 17, 0, 4.2, 1.5, COL.roof);
    const drGeo = dr.build();
    drGeo.translate(820, dy + 13, 0);
    dt.add(drGeo, null, [1, 1, 1], { aEmit: 0 });
    group.add(new THREE.Mesh(dt.build(), SL.lambert({}, { emit: true, emitGain: 2.5 })));

    // villages on the plain (east and north-east), sparse
    const villages = [[2100, -900], [2600, 900], [1700, -2200], [3600, -300], [-1900, -2600], [-2400, 1500]];
    for (const [vx, vz] of villages) {
      const n = Math.round(10 + r() * 12);
      for (let i = 0; i < n; i++) {
        const x = vx + (r() - 0.5) * 220, z = vz + (r() - 0.5) * 160;
        const rq = Terrain.riverQuery(x, z);
        if (rq.d < rq.w * 0.5 + 400) continue;
        const vi = r() < 0.6 ? 0 : 3;
        place(x, z, r() < 0.5 ? 0 : Math.PI / 2, vi);
      }
    }
    const houseMat = SL.lambert({}, { emit: true, litInstance: true, emitGain: 3.0 });
    variants.forEach((g, i) => {
      if (!lists[i].length) return;
      g.setAttribute('aLit', new THREE.InstancedBufferAttribute(new Float32Array(lit[i]), 1));
      const im = new THREE.InstancedMesh(g, houseMat, lists[i].length);
      lists[i].forEach((m, k) => im.setMatrixAt(k, m));
      im.receiveShadow = true;
      im.userData.pick = 'city';
      im.computeBoundingSphere();
      group.add(im);
    });
    return { group, gate: [x0, Y, 0], houseCount: lists.reduce((a, l) => a + l.length, 0) };
  }

  return { build };
})();
