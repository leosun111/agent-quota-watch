/* ==========================================================================
 * 16-fauna.js — 鹳雀 (oriental white storks: white body, black flight
 * feathers, red legs) circling and perching on the tower, and wooden boats
 * with mat sails on the river. Wing beats run in the vertex shader.
 * ========================================================================== */
const Fauna = (() => {
  const { lerp, clamp, smoothstep } = U;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

  // ------------------------------------------------------------- stork geometry
  function storkFlyingGeometry() {
    const b = new U.GeoBuilder().addExtra('aWing', 1);
    const white = U.lin(0xf1eee6), black = U.lin(0x1d1c1b), red = U.lin(0xb8402e), bill = U.lin(0x222020);
    const body = new THREE.SphereGeometry(1, 12, 8);
    b.add(body, U.mat(0, 0, 0, 0, 0, 0, 0.17, 0.17, 0.52), white, { aWing: 0 });
    const neck = new THREE.CylinderGeometry(0.045, 0.06, 0.45, 6);
    b.add(neck, U.mat(0, 0.05, 0.62, Math.PI / 2 - 0.12, 0, 0), white, { aWing: 0 });
    b.add(new THREE.SphereGeometry(0.07, 8, 6), U.mat(0, 0.08, 0.88, 0, 0, 0, 1, 0.9, 1.2), white, { aWing: 0 });
    b.add(new THREE.ConeGeometry(0.03, 0.34, 6), U.mat(0, 0.06, 1.1, Math.PI / 2, 0, 0), bill, { aWing: 0 });
    for (const s of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 4), U.mat(s * 0.05, -0.06, -0.72, Math.PI / 2 + 0.08, 0, 0), red, { aWing: 0 });
    }
    b.add(new THREE.ConeGeometry(0.1, 0.25, 6), U.mat(0, 0.0, -0.55, -Math.PI / 2, 0, 0, 1, 1, 0.5), white, { aWing: 0 });
    // wings: inner (white fore, black rear) and outer (black primaries)
    const wingPanel = (x0, x1, z0, z1, col, w0, w1) => {
      const g = new THREE.BufferGeometry();
      const pos = [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1];
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      const s = Math.sign(x0 + x1);
      g.setAttribute('aWing', new THREE.Float32BufferAttribute([s * w0, s * w1, s * w1, s * w0], 1));
      g.setIndex(s > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
      b.add(g, null, col);
    };
    for (const s of [-1, 1]) {
      const x = (v) => s * v;
      wingPanel(x(0.12), x(0.95), 0.16, -0.06, white, 0.0, 0.45);
      wingPanel(x(0.12), x(0.95), -0.06, -0.3, black, 0.0, 0.45);
      wingPanel(x(0.95), x(1.75), 0.14, -0.26, black, 0.45, 0.9);
      // primary "fingers"
      for (let k = 0; k < 4; k++) {
        const z = 0.1 - k * 0.1;
        wingPanel(x(1.75), x(2.05 - k * 0.04), z, z - 0.07, black, 0.9, 1.0);
      }
    }
    const g = b.build();
    return g;
  }
  function storkPerchedGeometry() {
    const b = new U.GeoBuilder();
    const white = U.lin(0xf1eee6), black = U.lin(0x1d1c1b), red = U.lin(0xb8402e), bill = U.lin(0x222020);
    b.add(new THREE.SphereGeometry(1, 12, 8), U.mat(0, 1.05, 0, -0.35, 0, 0, 0.2, 0.2, 0.45), white);
    // folded wings: black trailing edge along the back
    b.add(new THREE.SphereGeometry(1, 10, 6), U.mat(0, 1.08, -0.12, -0.35, 0, 0, 0.215, 0.12, 0.4), black);
    b.add(new THREE.CylinderGeometry(0.045, 0.06, 0.42, 6), U.mat(0, 1.42, 0.25, 0.25, 0, 0), white);
    b.add(new THREE.SphereGeometry(0.075, 8, 6), U.mat(0, 1.62, 0.3, 0, 0, 0, 1, 0.9, 1.2), white);
    b.add(new THREE.ConeGeometry(0.03, 0.32, 6), U.mat(0, 1.58, 0.5, Math.PI / 2 + 0.25, 0, 0), bill);
    for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.85, 4), U.mat(s * 0.07, 0.43, 0.02, 0, 0, 0), red);
    return b.build();
  }

  const FLOCK = 11;
  let flying = null, perched = null;
  const birdParams = [];
  const perchSlots = [];

  function storkMaterial() {
    return SL.lambert({ side: THREE.DoubleSide }, {
      key: 'stork',
      extraVertex: (vs) => vs
        .replace('#include <common>', '#include <common>\nattribute float aWing;\nattribute vec3 aFlap;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float w = abs(aWing);
  if (w > 0.0) {
    float phase = uTime * aFlap.x + aFlap.y;
    float amp = aFlap.z;
    float a = sin(phase) * amp;
    float bend = 1.0 + 0.9 * smoothstep(0.45, 1.0, w);
    float reach = abs(transformed.x) - 0.12;
    transformed.y += reach * sin(a * bend) * 0.95;
    transformed.x *= 1.0 - (1.0 - cos(a * bend)) * 0.25;
    transformed.z += -0.06 * sin(phase + 1.2) * amp * w;
  }
}`),
    });
  }

  function buildStorks(perches) {
    const group = new THREE.Group();
    group.name = 'storks';
    const geo = storkFlyingGeometry();
    const flap = new Float32Array(FLOCK * 3);
    const r = U.rng(99);
    for (let i = 0; i < FLOCK; i++) {
      const p = {
        R: 36 + r() * 70, h: 52 + r() * 34, w: (0.1 + r() * 0.06) * (r() < 0.25 ? -1 : 1), ph: r() * Math.PI * 2,
        ecc: 0.6 + r() * 0.5, bob: 3 + r() * 5, cx: -20 + r() * 20, cz: -10 + r() * 30, flapPh: r() * 10,
      };
      birdParams.push(p);
      flap[i * 3] = 3.6 + r() * 0.6;
      flap[i * 3 + 1] = p.flapPh;
      flap[i * 3 + 2] = 0.6;
    }
    geo.setAttribute('aFlap', new THREE.InstancedBufferAttribute(flap, 3));
    flying = new THREE.InstancedMesh(geo, storkMaterial(), FLOCK);
    flying.frustumCulled = false;
    flying.castShadow = false;
    flying.userData.pick = 'storks';
    group.add(flying);
    // perched: a few on eave corners and the ridge; slot 0 = the scripted bird's first perch
    const pgeo = storkPerchedGeometry();
    perched = new THREE.InstancedMesh(pgeo, SL.lambert({}), 16);
    perched.frustumCulled = false;
    perched.userData.pick = 'storks';
    perched.castShadow = true;
    group.add(perched);
    perchSlots.push(...perches);
    return group;
  }

  // Flight path for bird i at time t (pure function)
  function birdPos(i, t, out) {
    const p = birdParams[i];
    const a = p.ph + t * p.w;
    out.set(p.cx + Math.cos(a) * p.R, p.h + Math.sin(t * 0.21 + p.ph) * p.bob, p.cz + Math.sin(a) * p.R * p.ecc);
    return out;
  }

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  /* state: { t (ambient seconds), roost (0..1 fraction landing on perches),
   *          scripted: { mode: 'perch'|'fly', pos, dir, perch } } */
  function updateStorks(state) {
    if (!flying) return;
    const t = state.t;
    const roost = state.roost || 0;
    const flap = flying.geometry.attributes.aFlap;
    let nPerched = 0;
    for (let i = 0; i < FLOCK; i++) {
      birdPos(i, t, _a);
      birdPos(i, t + 0.25, _b);
      // roosting: birds glide down to perch slots one after another
      const land = clamp(roost * 1.6 - i * 0.06, 0, 1);
      const slot = perchSlots[(i + 3) % perchSlots.length];
      if (land > 0 && slot) {
        const k = U.smootherstep(0, 1, land);
        _c.set(slot.p[0], slot.p[1], slot.p[2]);
        _a.lerp(_c, k);
        _b.lerp(_c, k);
        if (land >= 1) {
          _m.compose(_p.set(slot.p[0], slot.p[1], slot.p[2]), _q.setFromEuler(_e.set(0, slot.ry + i * 0.7, 0)), _s.set(1, 1, 1));
          perched.setMatrixAt(nPerched++, _m);
          _m.makeScale(0, 0, 0);
          flying.setMatrixAt(i, _m);
          continue;
        }
      }
      const dx = _b.x - _a.x, dy = _b.y - _a.y, dz = _b.z - _a.z;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, Math.hypot(dx, dz)) * 0.6;
      const bank = -birdParams[i].w * 4.5 * (1 - land);
      _q.setFromEuler(_e.set(pitch, yaw, bank, 'YXZ'));
      _m.compose(_a, _q, _s.set(1.15, 1.15, 1.15));
      flying.setMatrixAt(i, _m);
      // glide / flap cycles
      const cyc = Math.sin(t * 0.33 + birdParams[i].flapPh);
      flap.setZ(i, lerp(0.08, 0.62, smoothstep(-0.2, 0.4, cyc)) * (1 - 0.6 * land) + 0.25 * land);
    }
    // resident perched birds (always present): slots 4.. except slot used by the scripted bird
    const residents = state.residents || [5, 9, 12];
    for (const si of residents) {
      const slot = perchSlots[si];
      if (!slot) continue;
      const turn = Math.sin(t * 0.13 + si) * 0.6;
      _m.compose(_p.set(slot.p[0], slot.p[1], slot.p[2]), _q.setFromEuler(_e.set(0, slot.ry + turn, 0)), _s.set(1, 1, 1));
      perched.setMatrixAt(nPerched++, _m);
    }
    // the scripted stork (act 三): perched or flying
    const sc = state.scripted;
    if (sc) {
      if (sc.mode === 'perch') {
        _m.compose(_p.set(sc.pos[0], sc.pos[1], sc.pos[2]), _q.setFromEuler(_e.set(0, sc.yaw || 0, 0)), _s.set(1, 1, 1));
        perched.setMatrixAt(nPerched++, _m);
      }
    }
    perched.count = nPerched;
    perched.instanceMatrix.needsUpdate = true;
    flying.instanceMatrix.needsUpdate = true;
    flap.needsUpdate = true;
    // a flying scripted bird is drawn with its own mesh
    if (!scriptedFlyer) {
      scriptedFlyer = makeFlyer();
      flying.parent.add(scriptedFlyer);
    }
    if (sc && sc.mode === 'fly') {
      scriptedFlyer.visible = true;
      scriptedFlyer.position.set(sc.pos[0], sc.pos[1], sc.pos[2]);
      scriptedFlyer.rotation.set(sc.pitch || 0, sc.yaw || 0, sc.bank || 0, 'YXZ');
      scriptedFlyer.scale.setScalar(1.15);
      scriptedFlyer.setFlap(4.2, 0, sc.flap === undefined ? 0.7 : sc.flap);
    } else scriptedFlyer.visible = false;
  }
  let scriptedFlyer = null;

  // ------------------------------------------------------------- boats
  function boatGeometry(withSail) {
    const b = new U.GeoBuilder();
    const wood = U.lin(0x6a4a30), dark = U.lin(0x3d2c1f), mat = U.lin(0xa88a58), sailC = U.lin(0xb9955e);
    // hull as lofted cross-sections
    const L = 11, W = 2.4;
    const sections = 8;
    const hull = new THREE.BufferGeometry();
    const pos = [], idx = [];
    for (let i = 0; i <= sections; i++) {
      const t = i / sections;
      const z = (t - 0.5) * L;
      const w = W * 0.5 * Math.pow(Math.sin(Math.PI * clamp(t * 0.96 + 0.02, 0, 1)), 0.55);
      const sheer = 0.55 + 0.35 * Math.pow(Math.abs(t - 0.5) * 2, 2);
      pos.push(-w, sheer, z, -w * 0.7, -0.35, z, w * 0.7, -0.35, z, w, sheer, z);
    }
    for (let i = 0; i < sections; i++) {
      for (let k = 0; k < 3; k++) {
        const a = i * 4 + k, c = a + 4;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hull.setIndex(idx);
    hull.computeVertexNormals();
    b.add(hull, null, wood);
    // gunwale and deck planks
    b.add(new THREE.BoxGeometry(W * 0.9, 0.06, L * 0.7), U.mat(0, 0.3, 0), dark);
    // arched mat cabin (篷)
    const cab = new THREE.CylinderGeometry(1.05, 1.05, 3.2, 12, 1, true, -Math.PI / 2, Math.PI);
    b.add(cab, U.mat(0, 0.35, -1.2, Math.PI / 2, 0, 0), mat);
    if (withSail) {
      b.add(new THREE.CylinderGeometry(0.07, 0.09, 8.5, 6), U.mat(0, 4.4, 1.6), dark);
      // lug sail with battens
      const sail = new THREE.PlaneGeometry(3.6, 5.2, 1, 6);
      b.add(sail, U.mat(0.05, 5.0, 1.2, 0, Math.PI / 2 - 0.25, 0), sailC);
      for (let k = 0; k < 6; k++) {
        b.add(new THREE.BoxGeometry(0.06, 0.06, 3.7), U.mat(0.08, 2.6 + k * 0.95, 1.2, 0, -0.25, 0), dark);
      }
    }
    // stern oar (橹)
    b.add(new THREE.BoxGeometry(0.08, 0.08, 4.2), U.mat(0.3, 0.5, -6.6, 0.35, 0.15, 0), dark);
    return b.build();
  }

  const boats = [];
  function buildBoats() {
    const group = new THREE.Group();
    group.name = 'boats';
    const matB = SL.standard({ roughness: 0.85, side: THREE.DoubleSide }, {});
    const defs = [
      { s0: 1500, v: 1.25, off: -70, sail: true, dir: 1 },
      { s0: 2100, v: 0.9, off: 60, sail: false, dir: 1 },
      { s0: 4300, v: -0.8, off: -110, sail: true, dir: -1 },
      { s0: 950, v: 1.05, off: 110, sail: false, dir: 1 },
    ];
    for (const d of defs) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(boatGeometry(d.sail), matB);
      hull.castShadow = true;
      hull.receiveShadow = true;
      g.add(hull);
      // boatman at the stern
      const man = Figures.makeFigure({ robe: 0x6f5d45, robeDark: 0x5a4a37, hat: 'straw', beard: false, skirtLen: 0.35, pick: 'river' });
      man.root.position.set(0, 0.3, -4.2);
      man.root.rotation.y = Math.PI * 0.08;
      g.add(man.root);
      group.add(g);
      boats.push({ g, def: d, man });
    }
    return group;
  }

  // Boat state is a pure function of time t (seconds)
  function updateBoats(t) {
    const Lr = Terrain.river.length;
    for (const B of boats) {
      const d = B.def;
      const span = 5200;
      let s = d.s0 + d.v * t;
      const base = Terrain.siteS - 2600;
      let u = ((s - base) % span + span) % span;
      s = base + u;
      const fade = smoothstep(0, 220, u) * (1 - smoothstep(span - 220, span, u));
      const p = Terrain.riverAt(Math.min(Lr, Math.max(0, s)));
      const lx = p.tz, lz = -p.tx;
      const W = p.w * 0.5;
      const off = clamp(d.off, -W + 40, W - 40);
      B.g.position.set(p.x + lx * off, 0.05 + Math.sin(t * 1.3 + d.s0) * 0.05, p.z + lz * off);
      const yaw = Math.atan2(p.tx, p.tz) + (d.dir < 0 ? Math.PI : 0);
      B.g.rotation.set(Math.sin(t * 0.9 + d.s0) * 0.02, yaw, Math.sin(t * 1.1 + d.off) * 0.03);
      B.g.scale.setScalar(Math.max(0.001, fade));
      B.g.visible = fade > 0.01;
      Figures.setPose(B.man, { reach: 0.35 + 0.25 * Math.sin(t * 1.4 + d.s0), headYaw: 0.2, time: t });
    }
  }

  // A single flying stork mesh (for scripted flights and the vision).
  let _flyGeo = null, _flyMat = null;
  function makeFlyer() {
    if (!_flyGeo) {
      _flyGeo = storkFlyingGeometry();
      _flyGeo.setAttribute('aFlap', new THREE.BufferAttribute(new Float32Array(_flyGeo.attributes.position.count * 3), 3));
      _flyMat = storkMaterial();
    }
    const g = _flyGeo.clone();
    const m = new THREE.Mesh(g, _flyMat);
    m.frustumCulled = false;
    m.userData.pick = 'storks';
    m.setFlap = (freq, phase, amp) => {
      const a = g.attributes.aFlap;
      for (let k = 0; k < a.count; k++) a.setXYZ(k, freq, phase, amp);
      a.needsUpdate = true;
    };
    m.setFlap(4.0, 0, 0.6);
    return m;
  }

  return { buildStorks, updateStorks, buildBoats, updateBoats, birdPos, boats, makeFlyer };
})();
