/* ==========================================================================
 * 31-director.js — camera. Each chapter has one or more shots made of
 * time-keyed poses (Hermite, eased ends). A key may be absolute, relative to
 * the poet, or aimed at his head / the stork, so follow shots stay locked to
 * the performance. Fades and cloud wipes are keyed alongside.
 * Also: small look-around during the tour, and orbit/look for free viewing.
 * ========================================================================== */
const Director = (() => {
  const { lerp, clamp, smoothKeys, smoothstep } = U;
  const SUN = [-94, 7, 34]; // direction toward the sun (scaled) for look targets
  const HEAD = 1.62;

  // Shots per act. p/l may be arrays or {poet:[dx,dy,dz]}, {head:[dx,dy,dz]}, {stork:[..]}
  const SHOTS = {
    prologue: [{ t0: 0, keys: [
      { t: 0, p: [148, 72, -26], l: [-6, 47, 1], fov: 42 },
      { t: 7, p: [98, 53, -20], l: [16, 42, 0], fov: 42 },
      { t: 12.5, p: [52, 40.5, -14.5], l: [18, 38.5, 0], fov: 42 },
      { t: 18, p: [34, 37.6, -9.4], l: [13, 42.5, 0], fov: 44 },
      { t: 23, p: [26.6, 37.8, -6.5], l: [10.5, 37.6, 0], fov: 44 },
      { t: 27, p: [24.2, 37.6, -4.7], l: [9.5, 36.2, 0.2], fov: 42 },
    ] }],
    l1: [{ t0: 0, keys: [
      { t: 0, p: [-23.5, 49.4, 9.3], l: [-8.6, 48.2, 0.6], fov: 42 },
      { t: 4.2, p: [-18.8, 49.2, 6.2], l: { head: [0, -0.1, 0] }, fov: 40 },
      { t: 6.8, p: [-13.8, 49.9, -3.4], l: { head: [-6, 0.6, 3] }, fov: 42 },
      { t: 9.5, p: [-9.7, 49.45, 0.35], l: { head: [-94, -20, 34] }, fov: 44 },
      { t: 18, p: [-9.82, 49.38, 0.52], l: { head: [-94, -17, 34] }, fov: 40 },
    ] }],
    l2: [{ t0: 0, keys: [
      { t: 0, p: [-9.82, 49.38, 0.52], l: { head: [-94, -17, 34] }, fov: 40 },
      { t: 3.2, p: [-10.4, 49.6, 0.9], l: [-150, 0, 180], fov: 42 },
      { t: 6.5, p: [-16.8, 50.2, 3.2], l: [-260, 0, 330], fov: 42 },
      { t: 10.5, p: [-66, 44, 48], l: [-300, 3, 470], fov: 44 },
      { t: 14.5, p: [-205, 34, 205], l: [-360, 4, 720], fov: 44 },
      { t: 18.5, p: [-298, 42, 480], l: [-420, 8, 1400], fov: 44 },
      { t: 24, p: [-336, 118, 790], l: [-430, 10, 3600], fov: 42 },
    ] }],
    l3: [{ t0: 0, keys: [
      { t: 0, p: [-17.4, 48.5, 6.9], l: { head: [0, -0.15, 0] }, fov: 40 },
      { t: 4.5, p: [-16.4, 48.7, 5.8], l: { head: [0, -0.05, 0] }, fov: 38 },
      { t: 8.2, p: [-16.2, 48.8, 5.6], l: [-140, 52, 60], fov: 30 },
      { t: 9.6, p: [-19.5, 49.4, 9.0], l: { stork: [0, 0, 0] }, fov: 44 },
      { t: 12.0, p: [-27.0, 52.0, 15.5], l: { stork: [0, 0, 0] }, fov: 46 },
      { t: 13.6, p: [-29.5, 53.5, 17.0], l: [-5, 62, 4], fov: 46 },
      { t: 16, p: [-24.0, 51.0, 13.0], l: { head: [0, 1.2, 0] }, fov: 34 },
    ] }],
    l4: [
      { t0: 0, keys: [
        { t: 0, p: [-24.0, 51.0, 13.0], l: { head: [0, 1.2, 0] }, fov: 34 },
        { t: 1.2, p: [-17.0, 49.6, 6.0], l: { head: [0, 0, 0] }, fov: 42 },
        { t: 2.6, p: [-12.8, 49.3, 2.7], l: { head: [1.5, -0.1, 0] }, fov: 44 },
        { t: 3.6, p: [-10.4, 48.75, 1.25], l: { head: [0, 0, 0] }, fov: 46 },
        { t: 4.4, p: [-9.0, 48.6, 0.8], l: { head: [0, 0.1, 0] }, fov: 48 },
        { t: 5.0, p: [-8.2, 48.8, 1.05], l: { head: [0, 0.2, -0.8] }, fov: 49 },
        { t: 5.6, p: [-7.6, 49.0, 2.9], l: { head: [0, 0.3, -1.5] }, fov: 50 },
        { t: 7, p: { poet: [0.25, 1.95, 2.7] }, l: { head: [0, 0.4, -2.5] }, fov: 50 },
        { t: 10, p: { poet: [0.25, 1.95, 2.7] }, l: { head: [0, 0.4, -2.5] }, fov: 50 },
        { t: 14.05, p: { poet: [0.3, 1.9, 2.6] }, l: { head: [0, 0.2, -2] }, fov: 50 },
      ] },
      { t0: 14.05, keys: [
        { t: 14.05, p: [-5.45, 58.45, 3.0], l: [-5.8, 53.0, -5.4], fov: 46 },
        { t: 20, p: [-5.45, 58.5, 3.3], l: { head: [0, 0, 0] }, fov: 46 },
        { t: 24.8, p: [-5.2, 58.55, 3.9], l: { head: [0, 0, 0] }, fov: 46 },
        { t: 26.3, p: [-5.5, 58.35, 2.2], l: { head: [-1.5, 0, 0] }, fov: 46 },
        { t: 28.0, p: [-7.3, 58.3, 0.8], l: { head: [0, 0, 0] }, fov: 46 },
        { t: 29.6, p: [-8.75, 58.6, 0.85], l: { head: [-1, 0.1, 0.8] }, fov: 46 },
        { t: 31.5, p: [-11.3, 59.9, 3.7], l: [-300, 30, 420], fov: 48 },
        { t: 33.5, p: [-15.0, 62.3, 7.8], l: [-380, 20, 700], fov: 48 },
        { t: 36, p: [-40, 90, 27], l: [-620, 10, 1500], fov: 46 },
      ] },
    ],
    vision: [
      { t0: 0, keys: [
        { t: 0, p: [-40, 90, 27], l: [-620, 10, 1500], fov: 46 },
        { t: 2.4, p: [-95, 175, 70], l: [-900, 60, 1900], fov: 48 },
      ] },
      { t0: 2.4, keys: [
        { t: 2.4, p: [-4300, 2250, 300], l: [0, 1500, 300], fov: 50 },
        { t: 4.6, p: [-3700, 2200, 300], l: [1000, 1350, 250], fov: 50 },
        { t: 10, p: [-2400, 1950, 250], l: [3000, 900, 0], fov: 50 },
        { t: 15, p: [-650, 1180, 150], l: [6000, 250, -100], fov: 50 },
        { t: 21, p: [2600, 700, -150], l: [11000, 0, 400], fov: 52 },
        { t: 26, p: [5400, 860, -1500], l: [11800, -120, 700], fov: 54 },
        { t: 30, p: [6100, 800, -1650], l: [12600, -180, 1000], fov: 56 },
      ] },
    ],
    coda: [
      { t0: 0, keys: [
        { t: 0, p: [6100, 800, -1650], l: [12600, -180, 1000], fov: 56 },
        { t: 1.2, p: [6150, 880, -1680], l: [12600, 0, 1000], fov: 56 },
      ] },
      { t0: 1.2, keys: [
        { t: 1.2, p: [70, 150, 200], l: [-8, 60, 0], fov: 44 },
        { t: 6, p: [82, 104, 150], l: [-8, 58, 3], fov: 42 },
        { t: 12, p: [74, 72, 92], l: [-9, 57, 4], fov: 38 },
        { t: 20, p: [64, 65, 80], l: [-9.5, 57.2, 5], fov: 34 },
      ] },
    ],
  };

  // Fades (to warm dark) and cloud wipes per act
  const FX = {
    prologue: { fade: [[0, 0], [25.6, 0], [27, 1]] },
    l1: { fade: [[0, 1], [0.9, 0]] },
    l2: { fade: [[0, 0], [22.7, 0], [24, 1]] },
    l3: { fade: [[0, 1], [1.0, 0]] },
    l4: { fade: [[0, 0], [13.55, 0], [14.02, 1], [14.08, 1], [14.75, 0]] },
    vision: { cloud: [[0, 0], [2.1, 1], [2.6, 1], [4.8, 0]] },
    coda: { cloud: [[0, 0], [0.9, 1], [1.5, 1], [3.3, 0]] },
  };

  const _a = [0, 0, 0];
  function resolve(v, stage, out) {
    if (Array.isArray(v)) { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out; }
    const P = stage.poet.pos;
    if (v.poet) { out[0] = P[0] + v.poet[0]; out[1] = P[1] + v.poet[1]; out[2] = P[2] + v.poet[2]; return out; }
    if (v.head) { out[0] = P[0] + v.head[0]; out[1] = P[1] + HEAD + v.head[1]; out[2] = P[2] + v.head[2]; return out; }
    if (v.stork) {
      const s = stage.stork.pos;
      out[0] = s[0] + v.stork[0]; out[1] = s[1] + v.stork[1]; out[2] = s[2] + v.stork[2];
      return out;
    }
    return out;
  }

  // Evaluate a shot's keys at t with poet-relative keys resolved at the current stage.
  function evalShot(shot, t, stage) {
    const keysP = shot.keys.map((k) => ({ t: k.t, v: resolve(k.p, stage, [0, 0, 0]) }));
    const keysL = shot.keys.map((k) => ({ t: k.t, v: resolve(k.l, stage, [0, 0, 0]) }));
    const keysF = shot.keys.map((k) => ({ t: k.t, v: [k.fov || 45] }));
    const p = U.hermiteKeys(keysP, t, [0, 0, 0]);
    const l = U.hermiteKeys(keysL, t, [0, 0, 0]);
    const f = U.hermiteKeys(keysF, t, [0])[0];
    return { p, l, fov: f };
  }

  // Reduced motion: hold the pose at a few moments and dissolve between them
  function steppedTime(shot, t) {
    const ks = shot.keys;
    let best = ks[0].t;
    for (const k of ks) if (k.t <= t + 1e-6) best = k.t;
    return best;
  }

  function evaluate(ai, t, stage, opts = {}) {
    const id = ACTS[ai].id;
    const shots = SHOTS[id];
    let shot = shots[0];
    for (const s of shots) if (t >= s.t0) shot = s;
    let tt = t;
    let rmFade = 0;
    if (opts.reducedMotion && ACTS[ai].motion !== 'static') {
      // move in calm steps: hold key poses, crossfade through a soft dip
      const tk = steppedTime(shot, t);
      const next = shot.keys.find((k) => k.t > tk + 1e-6);
      if (next) {
        const f = (t - tk) / (next.t - tk);
        tt = f > 0.82 ? next.t : tk + (t - tk) * 0.12;
        rmFade = smoothstep(0.7, 0.82, f) * (1 - smoothstep(0.82, 0.96, f)) * 0.9;
      } else tt = tk + (t - tk) * 0.12;
    }
    const r = evalShot(shot, tt, stage);
    const fx = FX[id] || {};
    const fade = Math.max(fx.fade ? smoothKeys(fx.fade, t) : 0, rmFade);
    const cloud = fx.cloud ? smoothKeys(fx.cloud, t) : 0;
    const vision = stage.env.vision;
    return { pos: r.p, target: r.l, fov: r.fov, fade, cloud, near: vision ? 4 : nearFor(r.p), far: vision ? 110000 : 60000 };
  }
  function nearFor(p) {
    // closer near plane when the camera is close to the tower or ground
    const dTower = Math.hypot(p[0], p[2]);
    if (dTower < 40 && p[1] < 80) return 0.12;
    if (dTower < 200) return 0.5;
    return 1.5;
  }

  // ------------------------------------------------------------- camera safety
  // Keep the camera above the ground (outside the tower footprint).
  function clampToGround(pos) {
    const x = pos[0], z = pos[2];
    if (Math.abs(x) < 21 && Math.abs(z) < 21) return pos; // tower/platform handled by authored paths
    const h = Terrain.meshHeightAt(x, z);
    const minY = Math.max(h, 0) + 1.2;
    if (pos[1] < minY) pos[1] = minY;
    return pos;
  }

  // ------------------------------------------------------------- tour look-around
  const look = { yaw: 0, pitch: 0, zoom: 0, idle: 0, active: false };
  function lookDrag(dx, dy) {
    look.yaw = clamp(look.yaw - dx * 0.0032, -0.7, 0.7);
    look.pitch = clamp(look.pitch - dy * 0.0028, -0.42, 0.42);
    look.idle = 0;
  }
  function lookZoom(d) {
    look.zoom = clamp(look.zoom + d, -18, 14);
    look.idle = 0;
  }
  function recenter() { look.target = true; }
  function tickLook(dt, holdStill) {
    look.idle += dt;
    const k = look.target ? 1 - Math.exp(-dt * 5) : look.idle > 3.5 && !holdStill ? 1 - Math.exp(-dt * 0.8) : 0;
    look.yaw *= 1 - k;
    look.pitch *= 1 - k;
    look.zoom *= 1 - k;
    if (look.target && Math.abs(look.yaw) + Math.abs(look.pitch) + Math.abs(look.zoom) < 0.002) look.target = false;
  }

  // Apply a pose (plus look-around offsets and a gentle breath) to the camera
  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function apply(camera, pose, time, opts = {}) {
    _p.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    _t.set(pose.target[0], pose.target[1], pose.target[2]);
    if (!opts.reducedMotion && opts.breath !== false) {
      const a = 0.035;
      _p.x += Math.sin(time * 0.31) * a;
      _p.y += Math.sin(time * 0.43 + 1.2) * a * 0.7;
      _t.x += Math.sin(time * 0.23 + 0.5) * a * 2.5;
      _t.y += Math.sin(time * 0.29) * a * 1.5;
    }
    camera.position.copy(_p);
    camera.lookAt(_t);
    if (look.yaw || look.pitch) {
      _e.set(look.pitch, look.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      // rotate about the camera's own axes: yaw around world up, pitch around local x
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), look.yaw);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), look.pitch);
      camera.quaternion.premultiply(qYaw).multiply(qPitch);
    }
    const fov = clamp(pose.fov + look.zoom, 18, 70);
    if (camera.fov !== fov || camera.near !== pose.near || camera.far !== pose.far) {
      camera.fov = fov;
      camera.near = pose.near;
      camera.far = pose.far;
      camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------- free viewing
  const free = {
    mode: 'orbit', target: new THREE.Vector3(0, 48, 0), dist: 150, yaw: 0, pitch: 0.2,
    pos: new THREE.Vector3(), fov: 42,
    goal: null, // smoothed values
    vy: 0, vp: 0,
  };
  function setViewpoint(vp) {
    free.mode = vp.mode;
    free.fov = vp.fov || 42;
    if (vp.mode === 'orbit') {
      free.target.set(vp.target[0], vp.target[1], vp.target[2]);
      const dx = vp.pos[0] - vp.target[0], dy = vp.pos[1] - vp.target[1], dz = vp.pos[2] - vp.target[2];
      free.dist = Math.hypot(dx, dy, dz);
      free.yaw = Math.atan2(dx, dz);
      free.pitch = Math.asin(dy / free.dist);
    } else {
      free.pos.set(vp.pos[0], vp.pos[1], vp.pos[2]);
      free.yaw = vp.yaw;
      free.pitch = vp.pitch;
    }
    free.vy = free.vp = 0;
  }
  function fromCamera(camera) {
    // take over the current camera as an orbit around what it looks at
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const d = Math.min(220, Math.max(25, camera.position.distanceTo(new THREE.Vector3(0, 48, 0))));
    const tgt = camera.position.clone().addScaledVector(dir, d);
    free.mode = 'orbit';
    free.target.copy(tgt);
    free.dist = d;
    free.yaw = Math.atan2(-dir.x, -dir.z);
    free.pitch = Math.asin(clamp(-dir.y, -0.99, 0.99));
    free.fov = camera.fov;
  }
  function freeDrag(dx, dy) {
    free.vy = -dx * 0.0042;
    free.vp = dy * 0.0036;
    if (free.mode === 'look') { free.vy = dx * 0.0032; free.vp = dy * 0.0028; }
  }
  function freeZoom(delta) {
    if (free.mode === 'orbit') free.dist = clamp(free.dist * Math.exp(delta * 0.0012), 18, 2600);
    else free.fov = clamp(free.fov + delta * 0.02, 20, 70);
  }
  function tickFree(dt, camera) {
    free.yaw += free.vy;
    free.pitch += free.vp;
    const damp = Math.exp(-dt * 7);
    free.vy *= damp;
    free.vp *= damp;
    if (free.mode === 'orbit') {
      free.pitch = clamp(free.pitch, -0.08, 1.35);
      const cp = Math.cos(free.pitch);
      _p.set(free.target.x + Math.sin(free.yaw) * cp * free.dist, free.target.y + Math.sin(free.pitch) * free.dist, free.target.z + Math.cos(free.yaw) * cp * free.dist);
      // keep outside the tower volume and above ground
      const r = Math.hypot(_p.x, _p.z);
      if (r < 24 && _p.y < 76) { const k = 24 / Math.max(r, 1e-3); _p.x *= k; _p.z *= k; }
      const arr = [_p.x, _p.y, _p.z];
      clampToGround(arr);
      if (arr[1] < 31.5 && r < 60) arr[1] = 31.5;
      camera.position.set(arr[0], arr[1], arr[2]);
      camera.lookAt(free.target);
    } else {
      free.pitch = clamp(free.pitch, -0.9, 0.9);
      camera.position.copy(free.pos);
      _e.set(free.pitch, free.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(_e);
    }
    if (camera.fov !== free.fov || camera.near !== 0.3) {
      camera.fov = free.fov;
      camera.near = 0.3;
      camera.far = 60000;
      camera.updateProjectionMatrix();
    }
  }

  return { SHOTS, FX, evaluate, apply, clampToGround, lookDrag, lookZoom, recenter, tickLook, look, setViewpoint, fromCamera, freeDrag, freeZoom, tickFree, free };
})();
