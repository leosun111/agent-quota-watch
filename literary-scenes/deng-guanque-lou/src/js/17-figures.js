/* ==========================================================================
 * 17-figures.js — jointed figures. The poet wears a Tang round-collar robe
 * (圆领袍, 月白), black 幞头 with two soft tails, leather belt and boots.
 * Pose parameters are plain numbers so any pose can be rebuilt from (act,t).
 * Local frame: feet at origin, facing +z, height ≈ 1.72 m.
 * ========================================================================== */
const Figures = (() => {
  const { lerp, clamp } = U;

  function mat(hex, rough = 0.8, extra = {}) {
    return SL.standard(Object.assign({ color: hex, vertexColors: false, roughness: rough }, extra), {});
  }

  function lathe(profile, seg = 16, zScale = 1) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    g.scale(1, 1, zScale);
    return g;
  }

  function mesh(geo, m, parent, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }

  /* opts: robe, robeDark, hat: 'futou'|'straw'|'kerchief', beard, skirtLen (0..1), belt */
  function makeFigure(opts = {}) {
    const M = {
      robe: mat(opts.robe || 0xe3ddcd, 0.85),
      robeIn: mat(opts.robeDark || 0xcfc6b2, 0.9),
      skin: mat(opts.skin || 0xd9a883, 0.65),
      black: mat(0x16130f, 0.7),
      belt: mat(opts.belt || 0x2b2420, 0.6),
      boot: mat(0x1b1714, 0.55),
      hat: mat(opts.hatColor || 0x16130f, 0.75),
      eye: mat(0x0d0b0a, 0.3),
    };
    const root = new THREE.Group();
    const body = new THREE.Group(); // bob & lean
    root.add(body);
    const hips = new THREE.Group();
    hips.position.y = 0.98;
    body.add(hips);
    const torso = new THREE.Group();
    hips.add(torso);

    // skirt of the robe (hangs from the waist)
    const long = opts.skirtLen === undefined ? 1 : opts.skirtLen;
    const hemY = lerp(0.5, 0.13, long) - 0.98;
    const skirt = mesh(lathe([[0.001, 0.05], [0.17, 0.04], [0.19, -0.2], [0.23, -0.5], [0.29, hemY + 0.06], [0.305, hemY], [0.001, hemY + 0.02]], 18, 0.78), M.robe, hips);
    // torso of the robe
    mesh(lathe([[0.001, 0.0], [0.172, 0.0], [0.185, 0.16], [0.205, 0.34], [0.215, 0.42], [0.14, 0.5], [0.075, 0.53], [0.001, 0.535]], 18, 0.68), M.robe, torso);
    // round collar and belt
    const collar = mesh(new THREE.TorusGeometry(0.083, 0.021, 8, 18), M.robeIn, torso, 0, 0.525, 0.004);
    collar.rotation.x = Math.PI / 2 - 0.25;
    const belt = mesh(new THREE.TorusGeometry(0.176, 0.024, 6, 20), M.belt, torso, 0, 0.02, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.72, 1);
    mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), mat(0xb08a4a, 0.4, { metalness: 0.4 }), torso, 0, 0.02, 0.128);

    // neck & head
    const neck = new THREE.Group();
    neck.position.y = 0.52;
    torso.add(neck);
    mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), M.skin, neck, 0, 0.04, 0);
    const head = new THREE.Group();
    head.position.y = 0.155;
    neck.add(head);
    const skull = mesh(new THREE.SphereGeometry(0.1, 18, 14), M.skin, head);
    skull.scale.set(0.95, 1.12, 1.02);
    mesh(new THREE.ConeGeometry(0.017, 0.045, 6), M.skin, head, 0, -0.005, 0.105).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.02, 8, 6), M.skin, head, s * 0.096, 0.0, 0.0).scale.set(0.5, 1, 0.7);
      mesh(new THREE.SphereGeometry(0.011, 8, 6), M.eye, head, s * 0.035, 0.022, 0.088);
      const brow = mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), M.black, head, s * 0.036, 0.047, 0.092);
      brow.rotation.z = -s * 0.12;
    }
    if (opts.beard !== false) {
      const must = mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), M.black, head, 0, -0.035, 0.1);
      must.rotation.x = 0.2;
      const beard = mesh(new THREE.ConeGeometry(0.03, 0.11, 8), M.black, head, 0, -0.11, 0.075);
      beard.rotation.x = Math.PI + 0.35;
    }
    // hat
    const tails = [];
    if ((opts.hat || 'futou') === 'futou') {
      const cap = mesh(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hat, head, 0, 0.02, -0.004);
      cap.scale.set(1.0, 1.05, 1.08);
      // raised 巾子 (the Tang futou's rounded top)
      mesh(new THREE.SphereGeometry(0.05, 12, 10), M.hat, head, 0, 0.1, -0.035).scale.set(1.05, 0.95, 1);
      // knot at the back and two soft hanging tails (软脚)
      mesh(new THREE.SphereGeometry(0.028, 8, 6), M.hat, head, 0, 0.03, -0.1);
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.03, 0.03, -0.105);
        head.add(pivot);
        const g = new THREE.PlaneGeometry(0.032, 0.34, 1, 4);
        g.translate(0, -0.17, 0);
        const t = new THREE.Mesh(g, SL.standard({ color: 0x16130f, vertexColors: false, roughness: 0.8, side: THREE.DoubleSide }, {}));
        t.castShadow = true;
        pivot.add(t);
        tails.push(pivot);
      }
    } else if (opts.hat === 'straw') {
      const hat = mesh(new THREE.ConeGeometry(0.26, 0.14, 16, 1, true), mat(0xb59a62, 0.9, { side: THREE.DoubleSide }), head, 0, 0.12, 0);
      hat.castShadow = true;
    } else {
      const cap = mesh(new THREE.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), M.hat, head, 0, 0.02, 0);
      cap.scale.set(1.02, 1.0, 1.08);
    }

    // arms
    const arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.215, 0.43, 0);
      torso.add(shoulder);
      const upper = mesh(new THREE.CylinderGeometry(0.058, 0.066, 0.29, 10), M.robe, shoulder, 0, -0.145, 0);
      void upper;
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      shoulder.add(elbow);
      mesh(new THREE.CylinderGeometry(0.066, 0.06, 0.26, 10), M.robe, elbow, 0, -0.13, 0);
      mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 10), M.robeIn, elbow, 0, -0.26, 0);
      const hand = mesh(new THREE.SphereGeometry(0.042, 10, 8), M.skin, elbow, 0, -0.3, 0.005);
      hand.scale.set(0.8, 1.15, 0.6);
      arms.push({ shoulder, elbow, side: s });
    }
    // legs (mostly under the robe) and boots
    const legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.085, 0, 0);
      hips.add(hip);
      mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.46, 8), M.robeIn, hip, 0, -0.23, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      hip.add(knee);
      mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.42, 8), M.boot, knee, 0, -0.21, 0);
      const foot = mesh(new THREE.BoxGeometry(0.085, 0.07, 0.24), M.boot, knee, 0, -0.475, 0.055);
      void foot;
      legs.push({ hip, knee, side: s });
    }

    root.traverse((o) => { if (o.isMesh) o.userData.pick = opts.pick || 'poet'; });
    const fig = { root, body, hips, torso, neck, head, arms, legs, skirt, tails, M };
    setPose(fig, {});
    return fig;
  }

  /* Pose parameters (all optional):
   *   walk: amount 0..1, phase: radians (stride), climb 0..1,
   *   behind / rail / reach / swing: arm weights, headYaw, headPitch, lean, torsoYaw, time (for tails)
   */
  function setPose(f, p) {
    const walk = p.walk || 0, ph = p.phase || 0, climb = p.climb || 0;
    const behind = p.behind || 0, rail = p.rail || 0, reach = p.reach || 0;
    const bob = Math.abs(Math.sin(ph)) * 0.025 * walk;
    f.body.position.y = bob - 0.01 * walk;
    f.body.rotation.x = (p.lean || 0) + 0.06 * walk + 0.16 * climb;
    f.torso.rotation.y = (p.torsoYaw || 0) + Math.sin(ph) * 0.05 * walk;
    f.hips.rotation.y = -Math.sin(ph) * 0.04 * walk;
    // legs
    for (const L of f.legs) {
      const s = L.side;
      const swing = Math.sin(ph + (s > 0 ? 0 : Math.PI));
      const lift = Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI) + 0.9));
      const hipA = swing * 0.42 * walk + (-0.5 * lift - 0.25) * climb * walk;
      L.hip.rotation.x = -hipA;
      L.knee.rotation.x = lift * (0.55 * walk + 0.7 * climb);
    }
    // skirt sways a little with the stride
    f.skirt.rotation.x = Math.sin(ph) * 0.04 * walk - 0.05 * climb;
    f.skirt.rotation.z = Math.cos(ph) * 0.02 * walk;
    // arms: blend of poses
    const swingW = Math.max(0, 1 - behind - rail - reach) * (p.swing === undefined ? 1 : p.swing);
    for (const A of f.arms) {
      const s = A.side;
      const armSwing = Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.35 * walk;
      // base: arms hanging
      let sx = armSwing * swingW, sz = s * 0.12, ex = -0.18 * swingW - 0.1;
      let sy = 0;
      // hands clasped behind the back (负手)
      sx = lerp(sx, 0.55, behind);
      sz = lerp(sz, s * 0.05, behind);
      sy = lerp(sy, -s * 0.35, behind);
      ex = lerp(ex, -1.55, behind);
      // hands resting on a railing in front (凭栏)
      sx = lerp(sx, -0.75, rail);
      sz = lerp(sz, s * 0.2, rail);
      ex = lerp(ex, -0.45, rail);
      // right hand raised toward the distance
      if (s > 0 && reach > 0) {
        sx = lerp(sx, -1.35, reach);
        sz = lerp(sz, 0.25, reach);
        ex = lerp(ex, -0.25, reach);
      }
      A.shoulder.rotation.set(sx, sy, sz);
      A.elbow.rotation.set(ex, 0, 0);
    }
    // head look
    f.neck.rotation.y = clamp(p.headYaw || 0, -1.1, 1.1) * 0.35;
    f.head.rotation.y = clamp(p.headYaw || 0, -1.1, 1.1) * 0.65;
    f.head.rotation.x = -clamp(p.headPitch || 0, -0.7, 0.6);
    // soft tails of the futou drift in the wind
    const t = p.time || 0;
    for (let i = 0; i < f.tails.length; i++) {
      f.tails[i].rotation.x = 0.06 + 0.06 * Math.sin(t * 2.1 + i) + 0.14 * walk + 0.18 * climb;
      f.tails[i].rotation.z = (i ? 1 : -1) * (0.08 + 0.05 * Math.sin(t * 1.7 + i * 2));
    }
  }

  // Broom and oar props
  function broom(parent) {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 6), mat(0x7a5a3a));
    stick.position.y = 0.65;
    g.add(stick);
    const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 8), mat(0xb59a62, 0.95));
    bristle.position.y = 0.05;
    bristle.rotation.x = Math.PI;
    g.add(bristle);
    parent.add(g);
    return g;
  }

  return { makeFigure, setPose, broom, mat };
})();
