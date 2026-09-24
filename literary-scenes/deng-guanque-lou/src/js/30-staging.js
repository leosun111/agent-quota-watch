/* ==========================================================================
 * 30-staging.js — what happens in each chapter, as pure functions of the
 * chapter time t: the poet's path and pose, the sun's elevation, lamps,
 * the stork that flies up in 三, the flock roosting at dusk, boats.
 * Nothing here accumulates state, so jumping/rewinding rebuilds exactly.
 * ========================================================================== */
const Staging = (() => {
  const { lerp, clamp, smoothstep, easeSine, smoothKeys } = U;
  let A = null; // tower anchors
  const actIndex = (id) => ACTS.findIndex((a) => a.id === id);

  // ------------------------------------------------------------- poet tracks
  // Segment kinds:
  //   {kind:'walk', t0,t1, path:[[x,y,z]...], climb?:bool, easeIn?, easeOut?}
  //   {kind:'stand', t0,t1, pos:[x,y,z], yaw}
  //   {kind:'turn', t0,t1, pos, yaw0, yaw1}
  // Pose channels are keyed separately: rail, behind, reach, headYaw, headPitch.
  function makeTrack(segs, chans) {
    for (const s of segs) {
      if (s.kind === 'walk') {
        const pts = s.smooth === false ? s.path : U.chaikin(s.path, 2);
        s.poly = U.polyline(pts);
      }
    }
    return { segs, chans };
  }
  const STRIDE = 0.72; // metres per step
  function evalTrack(tr, t) {
    const segs = tr.segs;
    let s = segs[0];
    for (const sg of segs) { if (t >= sg.t0) s = sg; }
    const out = { pos: [0, 0, 0], yaw: 0, walk: 0, climb: 0, phase: 0 };
    if (s.kind === 'walk') {
      const u = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
      // speed profile: optional ease at the ends
      const ei = s.easeIn ? 0.18 : 0, eo = s.easeOut ? 0.18 : 0;
      const prof = (x) => {
        // piecewise: accelerate over ei, constant, decelerate over eo (normalised)
        const vmax = 1 / (1 - ei / 2 - eo / 2);
        if (x < ei) return vmax * x * x / (2 * ei);
        if (x > 1 - eo) { const y = 1 - x; return 1 - vmax * y * y / (2 * eo); }
        return vmax * (x - ei / 2);
      };
      const d = prof(u) * s.poly.length;
      s.poly.at(d, out.pos);
      const dir = s.poly.dirAt(d);
      if (Math.hypot(dir[0], dir[2]) > 1e-4) out.yaw = Math.atan2(dir[0], dir[2]);
      else out.yaw = s.yaw || 0;
      const endW = smoothstep(0, 0.35, (t - s.t0)) * (1 - smoothstep(s.t1 - 0.35, s.t1, t));
      out.walk = (s.easeIn || s.easeOut) ? Math.max(0.2, endW) : 1;
      if (!s.easeIn && !s.easeOut) out.walk = 1;
      out.climb = s.climb ? 1 : 0;
      out.phase = (d / STRIDE) * Math.PI + (s.phase0 || 0);
    } else if (s.kind === 'stand') {
      out.pos = s.pos.slice();
      out.yaw = s.yaw;
    } else if (s.kind === 'turn') {
      out.pos = s.pos.slice();
      const k = easeSine(clamp((t - s.t0) / (s.t1 - s.t0), 0, 1));
      out.yaw = U.lerpAngle(s.yaw0, s.yaw1, k);
      out.walk = 0.35 * Math.sin(k * Math.PI);
      out.phase = k * Math.PI * 2;
    }
    // stairs: snap feet to the step surface already encoded in path y
    const ch = tr.chans;
    const get = (name, def) => (ch[name] ? smoothKeys(ch[name], t) : def);
    out.rail = get('rail', 0);
    out.behind = get('behind', 0);
    out.reach = get('reach', 0);
    out.headYaw = get('headYaw', 0);
    out.headPitch = get('headPitch', 0);
    out.yawOffset = get('yawOffset', 0);
    return out;
  }

  // Stair helper: points along the east stair of the platform (smooth ramp)
  function eastStairY(x) {
    const S = Tower.D.stairs;
    const x1 = S.x0 + S.steps * S.tread;
    return lerp(Tower.Y0, Tower.PY, clamp((x1 - x) / (x1 - S.x0), 0, 1));
  }

  const SUN_YAW = Math.atan2(-0.94, 0.34); // facing WSW
  const SW_YAW = Math.atan2(-0.75, 0.66);

  let tracks = null;
  function buildTracks() {
    const L2 = A.L2.y, L3 = A.L3.y, S = A.stair2;
    const railX2 = -(A.L2.rail - 0.62); // standing spot inside the L2 west railing
    const spot2 = [railX2, L2, 1.3];
    const spot3 = [-(A.L3.rail - 0.62), L3, 2.0];
    const corner3 = [-9.55, L3, 9.25];
    const f1x = (S.f1x[0] + S.f1x[1]) / 2, f2x = (S.f2x[0] + S.f2x[1]) / 2;
    const yMid = S.y0 + (S.y1 - S.y0) / 2;
    const stair1 = [];
    const stair2 = [];
    for (let i = 0; i <= 10; i++) {
      const f = i / 10;
      stair1.push([f1x, lerp(S.y0, yMid, f), lerp(S.f1z0 + 0.05, S.f1z1, f)]);
      stair2.push([f2x, lerp(yMid, S.y1, f), lerp(S.f2z0, S.f2z1 + 0.05, f)]);
    }
    const court = [[38.5, Tower.Y0 + 0.07, -0.35], [33.5, Tower.Y0 + 0.07, -0.25], [28.1, Tower.Y0 + 0.07, -0.1]];
    const stairE = [];
    for (let i = 0; i <= 12; i++) {
      const x = lerp(27.7, 19.7, i / 12);
      stairE.push([x, eastStairY(x) + 0.02, -0.05 + 0.05 * i / 12]);
    }
    tracks = {
      prologue: makeTrack([
        { kind: 'walk', t0: 0, t1: 8.3, path: court, smooth: false, phase0: 0.4 },
        { kind: 'walk', t0: 8.3, t1: 17.9, path: stairE, climb: true, smooth: false, phase0: 0.4 + (10.45 / STRIDE) * Math.PI },
        { kind: 'walk', t0: 17.9, t1: 26.4, path: [[19.7, Tower.PY, 0], [15, Tower.PY, 0.05], [10.5, Tower.PY, 0.1], [8.2, Tower.PY, 0.2]], easeOut: true, smooth: false },
        { kind: 'stand', t0: 26.4, t1: 99, pos: [8.2, Tower.PY, 0.2], yaw: -Math.PI / 2 },
      ], {
        headPitch: [[0, 0.05], [3, 0.3], [7.5, 0.22], [9, 0.0], [17, 0.02], [19, 0.35], [23, 0.15], [26, 0]],
        headYaw: [[0, 0], [4.5, -0.25], [6.5, 0.0]],
      }),
      l1: makeTrack([
        { kind: 'stand', t0: 0, t1: 0.6, pos: [-8.0, L2, 0.7], yaw: -Math.PI / 2 },
        { kind: 'walk', t0: 0.6, t1: 4.4, path: [[-8.0, L2, 0.7], [-9.6, L2, 0.9], [spot2[0], L2, spot2[2]]], easeIn: true, easeOut: true },
        { kind: 'turn', t0: 4.4, t1: 5.4, pos: spot2, yaw0: Math.atan2(spot2[0] + 9.6, spot2[2] - 0.9), yaw1: SUN_YAW },
        { kind: 'stand', t0: 5.4, t1: 99, pos: spot2, yaw: SUN_YAW },
      ], {
        rail: [[0, 0], [4.3, 0], [5.6, 1]],
        headPitch: [[0, 0], [5, 0.02], [7, 0.1], [18, 0.08]],
      }),
      l2: makeTrack([
        { kind: 'stand', t0: 0, t1: 99, pos: spot2, yaw: SUN_YAW },
      ], {
        rail: [[0, 1]],
        headYaw: [[0, 0], [0.6, 0], [3.2, 0.55], [24, 0.6]],
        headPitch: [[0, 0.08], [0.6, 0.08], [3.2, -0.32], [24, -0.3]],
      }),
      l3: makeTrack([
        { kind: 'stand', t0: 0, t1: 11.2, pos: spot2, yaw: SUN_YAW },
        { kind: 'turn', t0: 11.2, t1: 13.6, pos: spot2, yaw0: SUN_YAW, yaw1: 1.3 },
        { kind: 'stand', t0: 13.6, t1: 99, pos: spot2, yaw: 1.3 },
      ], {
        rail: [[0, 1], [3.4, 1], [4.8, 0]],
        reach: [[0, 0], [3.6, 0], [5.2, 0.55], [8.0, 0.55], [9.4, 0]],
        behind: [[0, 0], [11, 0], [13.6, 0.7]],
        headYaw: [[0, 0.6], [2.6, 0.0], [8.6, 0.0], [9.6, 0.75], [11.2, 0.45], [13.6, 0.0]],
        headPitch: [[0, -0.3], [2.8, 0.12], [8.6, 0.1], [10.4, 0.35], [12.2, 0.5], [16, 0.42]],
      }),
      l4: makeTrack([
        { kind: 'turn', t0: 0, t1: 0.5, pos: spot2, yaw0: 1.3, yaw1: 1.45 },
        { kind: 'walk', t0: 0.5, t1: 4.4, path: [spot2, [-10.3, L2, 1.15], [-9.0, L2, 1.05], [-8.1, L2, 1.1], [-7.4, L2, 1.2], [f1x, L2, 0.72], [f1x, L2, S.f1z0 + 0.05]], easeIn: true },
        { kind: 'walk', t0: 4.4, t1: 13.3, path: stair1, climb: true, smooth: false, phase0: 0.0 },
        { kind: 'walk', t0: 13.3, t1: 15.9, path: [[f1x, yMid, S.f1z1], [f1x + 0.05, yMid, S.f1z1 - 0.95], [(f1x + f2x) / 2, yMid, S.f1z1 - 1.3], [f2x - 0.05, yMid, S.f1z1 - 0.95], [f2x, yMid, S.f2z0]] },
        { kind: 'walk', t0: 15.9, t1: 24.8, path: stair2, climb: true, smooth: false },
        { kind: 'walk', t0: 24.8, t1: 29.2, path: [[f2x, L3, S.f2z1 + 0.05], [f2x - 0.1, L3, 1.15], [-6.8, L3, 0.95], [-7.6, L3, 0.8], [-8.8, L3, 1.1], spot3], easeOut: true },
        { kind: 'turn', t0: 29.2, t1: 30.4, pos: spot3, yaw0: Math.atan2(spot3[0] + 8.8, spot3[2] - 1.1), yaw1: SW_YAW },
        { kind: 'stand', t0: 30.4, t1: 99, pos: spot3, yaw: SW_YAW },
      ], {
        behind: [[0, 0.7], [0.6, 0.0], [29.4, 0], [31.2, 1]],
        headPitch: [[0, 0.42], [1.4, 0.05], [4.2, 0.15], [13, 0.2], [15.9, 0.1], [24.6, 0.25], [26, 0.0], [30.4, 0.02], [36, 0.06]],
        headYaw: [[0, 0], [30, 0], [32, 0.15], [36, -0.1]],
      }),
      vision: makeTrack([
        { kind: 'stand', t0: 0, t1: 99, pos: spot3, yaw: SW_YAW },
      ], { behind: [[0, 1]], headPitch: [[0, 0.06]] }),
      coda: makeTrack([
        { kind: 'stand', t0: 0, t1: 3, pos: spot3, yaw: SW_YAW },
        { kind: 'turn', t0: 3, t1: 3.8, pos: spot3, yaw0: SW_YAW, yaw1: 0.05 },
        { kind: 'walk', t0: 3.8, t1: 11.2, path: [spot3, [-10.0, L3, 5.0], [-9.9, L3, 7.8], corner3], easeIn: true, easeOut: true },
        { kind: 'turn', t0: 11.2, t1: 12.4, pos: corner3, yaw0: 0.12, yaw1: SW_YAW },
        { kind: 'stand', t0: 12.4, t1: 99, pos: corner3, yaw: SW_YAW },
      ], {
        behind: [[0, 1]],
        headPitch: [[0, 0.05], [4, 0.0], [11, 0.02], [13, 0.12], [20, 0.1]],
        headYaw: [[0, 0], [5, -0.3], [9, 0.25], [11, 0]],
      }),
    };
  }

  // ------------------------------------------------------------- environment
  const ENV = {
    prologue: { elev: [[0, 5.6], [27, 4.8]] },
    l1: { elev: [[0, 4.8], [18, 3.45]] },
    l2: { elev: [[0, 3.45], [24, 3.2]] },
    l3: { elev: [[0, 3.2], [16, 3.02]] },
    l4: { elev: [[0, 3.02], [36, 2.85]] },
    vision: { elev: [[0, 2.85], [2.4, 2.85], [2.41, 3.4], [30, 3.1]], vision: [2.4, 99] },
    coda: { elev: [[0, 3.1], [1.2, 3.1], [1.21, 2.6], [20, 1.45]], vision: [-1, 1.2], lamp: [[0, 0], [5, 0], [12, 1], [20, 1]] },
  };

  // ------------------------------------------------------------- stork in 三
  let storkFly = null;
  function buildStork() {
    const P = World.H.tower.perches;
    const a = P[3].p, b = P[0].p;
    storkFly = {
      from: P[3], to: P[0],
      keys: [
        { t: 8.6, v: [a[0], a[1], a[2]] },
        { t: 9.6, v: [a[0] - 2.4, a[1] + 3.0, a[2] - 2.8] },
        { t: 10.8, v: [-18.5, 53.5, 8.5] },
        { t: 12.0, v: [-14.0, 62.5, 5.2] },
        { t: 13.1, v: [-6.5, 69.5, 6.0] },
        { t: 13.9, v: [b[0] - 0.4, b[1] + 0.5, b[2] + 0.3] },
        { t: 14.4, v: [b[0], b[1], b[2]] },
      ],
    };
  }
  const _h1 = [0, 0, 0], _h2 = [0, 0, 0];
  function storkState(id, t) {
    const i3 = actIndex('l3');
    const ai = actIndex(id);
    const P = World.H.tower.perches;
    if (ai < i3 || (ai === i3 && t < storkFly.keys[0].t)) {
      return { mode: 'perch', pos: P[3].p, yaw: P[3].ry + 2.2 + 0.4 * Math.sin(t * 0.3) };
    }
    const last = storkFly.keys[storkFly.keys.length - 1].t;
    if (ai > i3 || t >= last) return { mode: 'perch', pos: P[0].p, yaw: -2.0 + 0.3 * Math.sin(t * 0.21) };
    U.hermiteKeys(storkFly.keys, t, _h1);
    U.hermiteKeys(storkFly.keys, t + 0.12, _h2);
    const dx = _h2[0] - _h1[0], dy = _h2[1] - _h1[1], dz = _h2[2] - _h1[2];
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz)) * 0.7;
    const k = (t - storkFly.keys[0].t) / (last - storkFly.keys[0].t);
    return { mode: 'fly', pos: _h1.slice(), yaw, pitch, bank: 0.25 * Math.sin(k * Math.PI * 2), flap: k < 0.75 ? 0.85 : 0.35 };
  }

  // ------------------------------------------------------------- public
  let storyStarts = [];
  function init() {
    A = World.H.tower.anchors;
    buildTracks();
    buildStork();
    let acc = 0;
    storyStarts = ACTS.map((a) => { const s = acc; acc += a.dur; return s; });
  }

  const RESIDENTS = [2, 1, 9];
  const ROOST_SLOTS = [4, 5, 6, 7, 8, 10, 11, 12, 13];

  function evaluate(ai, t) {
    const act = ACTS[ai];
    const id = act.id;
    const tr = tracks[id];
    const poet = evalTrack(tr, t);
    const env = ENV[id];
    const vis = env.vision ? t >= env.vision[0] && t < env.vision[1] : false;
    const lamp = env.lamp ? smoothKeys(env.lamp, t) : 0;
    const elev = smoothKeys(env.elev, t);
    const roost = id === 'coda' ? smoothstep(4.5, 18, t) : 0;
    return {
      id,
      poet,
      env: { elev, lamp, vision: vis, shadowCenter: poetShadowCenter(poet.pos) },
      stork: storkState(id, t),
      roost,
      residents: RESIDENTS,
      roostSlots: ROOST_SLOTS,
      story: storyStarts[ai] + t,
      keeper: keeperState(storyStarts[ai] + t),
    };
  }
  function poetShadowCenter(p) {
    return [p[0] * 0.3, Math.max(44, p[1]), p[2] * 0.3];
  }

  // Keeper sweeping the court south of the stair (idle loop by story time)
  function keeperState(T) {
    const x = 33.5 + Math.sin(T * 0.08) * 2.0, z = 6.6 + Math.sin(T * 0.05) * 1.2;
    return { pos: [x, Tower.Y0 + 0.07, z], yaw: -2.4 + Math.sin(T * 0.5) * 0.25, sweep: Math.sin(T * 2.6) };
  }

  // Resting state for free viewing (no narrative): the poet at the L3 corner
  function freeState(elev) {
    const tr = tracks.coda;
    const poet = evalTrack(tr, 20);
    return {
      id: 'free', poet,
      env: { elev, lamp: U.smoothstep(1.4, -0.4, elev), vision: false, shadowCenter: [0, 48, 0] },
      stork: { mode: 'perch', pos: World.H.tower.perches[0].p, yaw: -2.0 },
      roost: 0, residents: RESIDENTS, roostSlots: ROOST_SLOTS, story: 0, keeper: keeperState(0),
    };
  }

  function storyStart(ai) { return storyStarts[ai]; }
  const totalDur = () => ACTS.reduce((a, b) => a + b.dur, 0);

  return { init, evaluate, freeState, storyStart, totalDur, evalTrack, get tracks() { return tracks; }, SUN_YAW, SW_YAW };
})();
