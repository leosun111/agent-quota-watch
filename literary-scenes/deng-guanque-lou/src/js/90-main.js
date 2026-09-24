/* ==========================================================================
 * 90-main.js — boot and the frame loop:
 *   narrative clock → staging (world state) → world → camera → post → sound → UI
 * ========================================================================== */
const Main = (() => {
  const qs = new URLSearchParams(location.search);
  let renderer, camera, quality, qualityName;
  let lastT = 0, ambient = 0, frozen = false, reduced = false, camOverride = null;
  let freeStage = null, freeElev = 5.2;
  let running = false;
  const H = () => World.H;

  function hasWebGL2() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      return !!gl;
    } catch (e) {
      return false;
    }
  }
  function setProgress(f, label) {
    const bar = document.getElementById('load-bar');
    const lab = document.getElementById('load-label');
    if (bar) bar.style.transform = `scaleX(${U.clamp(f, 0, 1)})`;
    if (lab && label) lab.textContent = label;
  }
  function pickQuality(pref) {
    const q = qs.get('q') || pref || 'auto';
    if (q === 'high' || q === 'light') return q;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(screen.width, screen.height) < 820;
    const mem = navigator.deviceMemory || 8;
    return coarse || small || mem < 4 ? 'light' : 'high';
  }
  function sizeRenderer() {
    const w = window.innerWidth, h = window.innerHeight;
    let pr = Math.min(window.devicePixelRatio || 1, quality.pixelRatioMax);
    if (w * h * pr * pr > quality.maxPixels) pr = Math.sqrt(quality.maxPixels / (w * h));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    Post.resize(Math.round(w * pr), Math.round(h * pr), quality);
  }

  // ------------------------------------------------------------- stage → world
  const ACT_MUSIC = { prologue: 0.35, l1: 0.8, l2: 1.0, l3: 1.1, l4: 1.8, vision: 3.0, coda: 0.7 };
  let lastMusicAct = '';
  const gl = { g4: false, g5: false };
  function applyStage(stage, tAct) {
    World.setVision(stage.env.vision);
    Env.apply({ elev: stage.env.elev, lamp: stage.env.lamp, vision: stage.env.vision, shadowCenter: stage.env.shadowCenter });
    const P = H().poet;
    const ps = stage.poet;
    P.root.position.set(ps.pos[0], ps.pos[1], ps.pos[2]);
    P.root.rotation.y = ps.yaw + (ps.yawOffset || 0);
    Figures.setPose(P, {
      walk: ps.walk, phase: ps.phase, climb: ps.climb, rail: ps.rail, behind: ps.behind, reach: ps.reach,
      headYaw: ps.headYaw, headPitch: ps.headPitch + Math.sin(ambient * 0.9) * 0.01, time: ambient,
    });
    // storks: the flock circles on ambient time; the chapter decides roosting and the lead bird
    Fauna.updateStorks({ t: ambient, roost: stage.roost, residents: stage.residents, scripted: stage.stork });
    Fauna.updateBoats(Narrative.S.mode === 'tour' ? stage.story : ambient);
    // keeper sweeping by the stair
    const K = H().keeper, ks = stage.keeper;
    K.root.position.set(ks.pos[0], ks.pos[1], ks.pos[2]);
    K.root.rotation.y = ks.yaw;
    Figures.setPose(K, { reach: 0.35 + 0.18 * ks.sweep, headPitch: -0.35, headYaw: 0.2 * ks.sweep, lean: 0.18, time: ambient });
    // two townsfolk walking the road to the gate (ambient loop)
    H().towns.forEach((f, i) => {
      const L = 150, sp = 0.9 + i * 0.15;
      const u = ((ambient * sp + i * 70) % (2 * L)) / L;
      const fwd = u < 1;
      const x = 60 + (fwd ? u : 2 - u) * L;
      const z = 2.5 - i * 5;
      f.root.position.set(x, Terrain.meshHeightAt(x, z) + 0.02, z);
      f.root.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2;
      Figures.setPose(f, { walk: 1, phase: (x / 0.72) * Math.PI, time: ambient });
    });
    // vision companions: three storks fly ahead of the camera toward the sea
    if (stage.env.vision && Narrative.S.mode === 'tour') {
      const ai = Narrative.S.act;
      H().visionBirds.forEach((b, k) => {
        const lead = 2.2 + k * 0.5;
        const a = Director.evaluate(ai, Math.min(ACTS[ai].dur, tAct + lead), stage);
        const c = Director.evaluate(ai, Math.min(ACTS[ai].dur, tAct + lead + 0.3), stage);
        const off = [[-70, -55, 60], [30, -40, -80], [90, -85, 20]][k];
        b.visible = true;
        b.position.set(a.pos[0] + off[0], a.pos[1] + off[1] + Math.sin(ambient * 0.8 + k) * 3, a.pos[2] + off[2]);
        const dx = c.pos[0] - a.pos[0], dz = c.pos[2] - a.pos[2], dy = c.pos[1] - a.pos[1];
        b.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)) * 0.5, Math.atan2(dx, dz) + 0.001, Math.sin(ambient * 0.5 + k) * 0.1, 'YXZ');
        b.scale.setScalar(4.5);
        b.setFlap(3.6 + k * 0.3, k * 1.7, 0.55);
      });
    } else H().visionBirds.forEach((b) => { b.visible = false; });
    // music follows the chapters
    if (Narrative.S.mode === 'tour') {
      const id = stage.id;
      if (id !== lastMusicAct) {
        lastMusicAct = id;
        Sound.setIntensity(ACT_MUSIC[id] || 0.5);
      }
      if (id === 'l4' && tAct > 30.4 && !gl.g4) { gl.g4 = true; Sound.glissando(); }
      if (id === 'vision' && tAct > 4.6 && !gl.g5) { gl.g5 = true; Sound.glissando(); }
      if (id !== 'l4' || tAct < 30) gl.g4 = id === 'l4' && tAct > 30.4;
      if (id !== 'vision' || tAct < 4) gl.g5 = id === 'vision' && tAct > 4.6;
    } else Sound.setIntensity(0.45);
  }

  // Sun position on screen for light shafts
  const _sv = new THREE.Vector3();
  function sunShafts(stage) {
    _sv.copy(Env.sunDir).multiplyScalar(20000).add(camera.position).project(camera);
    const inFront = _sv.z < 1;
    const sx = _sv.x * 0.5 + 0.5, sy = _sv.y * 0.5 + 0.5;
    const edge = U.smoothstep(-0.25, 0.05, Math.min(sx, sy, 1 - sx, 1 - sy));
    const vis = stage.env.vision ? 1 : Env.sunVisibilityAt(camera.position, stage.env.elev);
    Post.params.sunScreen.set(sx, sy);
    Post.params.sunVisibleOnScreen = inFront ? edge * vis : 0;
    Post.params.god = quality.godrays ? 0.38 : 0;
  }

  // ------------------------------------------------------------- frame
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    step(dt);
    requestAnimationFrame(loop);
  }
  function step(dt) {
    if (!frozen) ambient += dt;
    const S = Narrative.S;
    let stage, pose, tAct = 0, dipFade = 0;
    if (S.mode === 'tour') {
      dipFade = Narrative.update(dt);
      Speech.tick(dt);
      tAct = S.t;
      stage = Staging.evaluate(S.act, S.t);
      pose = Director.evaluate(S.act, S.t, stage, { reducedMotion: reduced });
    } else if (S.mode === 'landing') {
      stage = Staging.evaluate(0, 0);
      pose = Director.evaluate(0, 0, stage, {});
    } else {
      stage = freeStage || Staging.freeState(freeElev);
      stage.env.elev = freeElev;
      stage.env.vision = false;
      stage.env.lamp = U.smoothstep(1.4, -0.4, freeElev);
    }
    applyStage(stage, tAct);
    if (pose) {
      Director.tickLook(dt, S.awaiting || !S.playing);
      Director.clampToGround(pose.pos);
      Director.apply(camera, pose, ambient, { reducedMotion: reduced });
      if (camOverride) camOverride(camera, stage);
      Post.params.fade = Math.max(pose.fade, dipFade);
      Post.params.cloud = pose.cloud;
    } else {
      Director.tickFree(dt, camera);
      Post.params.fade = dipFade;
      Post.params.cloud = 0;
    }
    Post.params.fadeColor.setRGB(0.05, 0.035, 0.02);
    Post.params.grain = reduced ? 0 : 0.018;
    sunShafts(stage);
    World.update(dt, ambient, camera);
    const rq = Terrain.riverQuery(camera.position.x, camera.position.z);
    Sound.tick(dt, { camY: camera.position.y, riverDist: Math.max(0, rq.d - rq.w * 0.5), speaking: Speech.busy(), paused: S.mode === 'tour' && !S.playing });
    Post.params.time = ambient;
    Post.render(World.scene, camera);
    UI.frame();
    perfWatch(dt);
  }

  // Suggest light mode once if the device struggles (never switches silently)
  const perf = { acc: 0, n: 0, told: false };
  function perfWatch(dt) {
    if (perf.told || qualityName !== 'high' || dt <= 0) return;
    perf.acc += dt;
    perf.n++;
    if (perf.acc > 6) {
      const fps = perf.n / perf.acc;
      if (fps < 24) {
        perf.told = true;
        UI.toast(`当前约 ${fps.toFixed(0)} 帧/秒。若画面卡顿，可在“设置”中改用轻量画质。`, 6500);
      }
      perf.acc = 0;
      perf.n = 0;
    }
  }

  // ------------------------------------------------------------- picking
  const ray = new THREE.Raycaster();
  function pick(x, y) {
    const v = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(v, camera);
    const inVision = World.H.vision.group.visible;
    if (!inVision && ray.ray.direction.angleTo(Env.sunDir) < 2.4 * U.DEG) return 'sun';
    const roots = inVision ? [World.H.vision.group] : [World.main];
    const hits = ray.intersectObjects(roots, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (!o || !o.visible) continue;
      const k = o.userData.pick;
      if (k === 'terrain') {
        const p = h.point;
        if (inVision) return 'river';
        if (Terrain.zhongtiao(p.x, p.z) > 60) return 'mountains';
        if (Terrain.westRanges(p.x, p.z) > 60 || p.x < -3000) return 'westhills';
        const rq = Terrain.riverQuery(p.x, p.z);
        if (rq.d < rq.w * 0.5 + 40) return 'river';
        return null;
      }
      return k;
    }
    return null;
  }

  // ------------------------------------------------------------- app callbacks for the UI
  const app = {
    startTour() {
      if (Narrative.S.mode === 'free') { Narrative.goto(0, 0); UI.showMode('tour'); return; }
      Narrative.start();
      UI.showMode('tour');
    },
    tourAt(i) { Narrative.goto(i, 0); UI.showMode('tour'); },
    enterFree() {
      const S = Narrative.S;
      if (S.mode === 'tour') {
        freeStage = Staging.evaluate(S.act, S.t);
        if (freeStage.env.vision) freeStage = null;
        freeElev = freeStage ? freeStage.env.elev : 3.1;
        Director.fromCamera(camera);
        if (!freeStage) Director.setViewpoint(VIEWPOINTS[0]);
      } else {
        freeStage = null;
        freeElev = 5.2;
        Director.setViewpoint(VIEWPOINTS[0]);
      }
      Narrative.exitTour(freeStage);
      UI.showMode('free');
    },
    resetFree() { Director.setViewpoint(VIEWPOINTS[0]); },
    viewpoint(vp) { Director.setViewpoint(vp); },
    timeOfDay(e) { freeElev = e; },
    drag(dx, dy) {
      if (Narrative.S.mode === 'free') Director.freeDrag(dx, dy);
      else Director.lookDrag(dx, dy);
    },
    zoom(d) {
      if (Narrative.S.mode === 'free') Director.freeZoom(d);
      else Director.lookZoom(d * 0.012);
    },
    click(x, y) {
      const k = pick(x, y);
      if (k) UI.showObject(k, x, y);
      else UI.hidePop();
    },
    capture() {
      try {
        step(0);
        return renderer.domElement.toDataURL('image/png');
      } catch (e) {
        return null;
      }
    },
    frozen: () => frozen,
    toggleFreeze() { frozen = !frozen; return frozen; },
    setReduced(r) { reduced = r; },
    setQuality(q) {
      const u = new URL(location.href);
      u.searchParams.delete('q');
      if (q !== 'auto') u.searchParams.set('q', q);
      UI.toast('正在按新的画质重新载入……', 3000);
      setTimeout(() => { location.href = u.toString(); }, 400);
    },
    speechTurnedOn() {
      // if a chapter's line is due now, let the narrative speak it on the next frame
      const S = Narrative.S, act = ACTS[S.act];
      if (S.mode === 'tour' && act.speech && S.t < act.speech.at + 1.5) S.spoken = false;
    },
  };

  // ------------------------------------------------------------- boot
  async function start() {
    if (!hasWebGL2()) {
      document.getElementById('nogl').hidden = false;
      document.getElementById('loading').hidden = true;
      return;
    }
    const prefs = UI.prefs;
    try { Object.assign(prefs, JSON.parse(localStorage.getItem('dgl-prefs') || '{}')); } catch (e) { /* storage unavailable */ }
    qualityName = pickQuality(prefs.quality);
    quality = QUALITY[qualityName];
    const canvas = document.getElementById('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = !!quality.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    camera = new THREE.PerspectiveCamera(42, 1, 0.5, 60000);
    Post.init(renderer, quality);
    sizeRenderer();
    window.addEventListener('resize', sizeRenderer);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      running = false;
      UI.toast('图形上下文已丢失（可能是显存不足）。请刷新页面，或改用轻量画质。', 10000);
    });
    await World.build(quality, setProgress);
    Staging.init();
    UI.init(app);
    reduced = !!UI.prefs.reduced;
    setProgress(0.96, '调和光色');
    await U.nextFrame();
    // compile shaders before the first visible frame
    const s0 = Staging.evaluate(0, 0);
    applyStage(s0, 0);
    Director.apply(camera, Director.evaluate(0, 0, s0, {}), 0, {});
    try { if (renderer.compileAsync) await renderer.compileAsync(World.scene, camera); } catch (e) { /* compile lazily */ }
    Post.render(World.scene, camera);
    // redraw the plaque once web fonts are in
    if (document.fonts && document.fonts.load) {
      Promise.race([document.fonts.load('64px "Ma Shan Zheng"'), new Promise((r) => setTimeout(r, 2500))])
        .then(() => World.H.tower.redrawPlaque())
        .catch(() => {});
    }
    setProgress(1, '');
    document.getElementById('loading').hidden = true;
    Narrative.S.mode = 'landing';
    UI.showMode('landing');
    try { document.getElementById('btn-enter').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (Narrative.S.mode === 'tour' && Narrative.S.playing) { Narrative.pause(); app._resumeOnShow = true; }
        Sound.suspend(true);
      } else {
        Sound.suspend(false);
        if (app._resumeOnShow) { app._resumeOnShow = false; Narrative.play(); }
      }
    });
    lastT = performance.now();
    running = true;
    if (!qs.has('still')) requestAnimationFrame(loop);
    exposeDebug();
    window.__ready = true;
  }

  // Hooks for automated checks (screenshots, timing, collision tests)
  function exposeDebug() {
    window.__dbg = {
      step,
      // test hook: fixed camera around the poet, e.g. portrait(2.4, 20, 1.3)
      portrait(dist, yawDeg = 0, h = 1.3, fov = 30) {
        camOverride = dist ? (cam, st) => {
          const p = st.poet.pos, a = st.poet.yaw + (yawDeg * Math.PI) / 180;
          cam.position.set(p[0] + Math.sin(a) * dist, p[1] + h, p[2] + Math.cos(a) * dist);
          cam.fov = fov; cam.near = 0.05; cam.updateProjectionMatrix();
          cam.lookAt(p[0], p[1] + 1.0, p[2]);
        } : null;
      },
      shot(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) step(dt); return renderer.domElement.toDataURL('image/png'); },
      jump(ai, t, play = false) {
        if (Narrative.S.mode !== 'tour') { Narrative.start(); UI.showMode('tour'); }
        Narrative.goto(ai, t, { dip: false, play });
        Narrative.S.playing = play;
        UI.syncState();
      },
      state: () => ({ mode: Narrative.S.mode, act: Narrative.S.act, t: Narrative.S.t, playing: Narrative.S.playing, awaiting: Narrative.S.awaiting, holding: Narrative.S.holding, ended: Narrative.S.ended, line: Narrative.currentLine(), cam: camera.position.toArray().map((v) => +v.toFixed(2)) }),
      pose(ai, t) {
        const st = Staging.evaluate(ai, t);
        const p = Director.evaluate(ai, t, st, {});
        return { cam: p.pos, target: p.target, poet: st.poet.pos, vision: st.env.vision, fade: p.fade };
      },
      solids: () => World.H.tower.solids,
      info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: qualityName, leaves: Terrain.leafCount }),
      app,
      mods: { Speech, Narrative, Sound },
      scan(step = 0.05) {
        const T = World.H.tower, D = T.D, PY = Tower.PY;
        const rings = [D.eave1, D.eave2, D.eave3, D.top];
        const bad = [];
        const inRoof = (p) => {
          for (const o of rings) {
            const m = Math.max(Math.abs(p[0]), Math.abs(p[2]));
            const side = Math.abs(p[0]) >= Math.abs(p[2]) ? (p[0] > 0 ? 0 : 2) : (p[2] > 0 ? 1 : 3);
            const inO = side % 2 === 0 ? o.ix : o.iz;
            if (m < inO - 0.1 || m > o.ox + o.flare + 0.3) continue;
            // search v on this side's centre line
            const v = U.clamp((m - inO) / (o.ox - inO), 0, 1);
            const along = side % 2 === 0 ? p[2] : p[0];
            const u = U.clamp(along / Math.max(1, m), -1, 1);
            const q = T.ringPoint(o, side, u, v);
            if (p[1] < q[1] + 0.25 && p[1] > q[1] - o.thick - 0.25) return 'roof';
          }
          if (Math.abs(p[0]) < D.top.ix + 0.2 && Math.abs(p[2]) < D.top.iz + 0.7 && p[1] > PY + D.top.yIn - 0.5 && p[1] < PY + D.top.yRidge + 1.2) return 'roofTop';
          return null;
        };
        for (let ai = 0; ai < ACTS.length; ai++) {
          for (let t = 0; t <= ACTS[ai].dur; t += step) {
            const st = Staging.evaluate(ai, t);
            if (st.env.vision) continue;
            const pose = Director.evaluate(ai, t, st, {});
            if (pose.fade > 0.97 || pose.cloud > 0.95) continue;
            const p = pose.pos;
            const g = Terrain.meshHeightAt(p[0], p[2]);
            if (p[1] < Math.max(g, 0) + 0.8) bad.push([ai, +t.toFixed(2), 'ground', p.map((v) => +v.toFixed(2))]);
            for (const s of T.solids) {
              if (p[0] > s[0] - 0.12 && p[0] < s[3] + 0.12 && p[1] > s[1] - 0.12 && p[1] < s[4] + 0.12 && p[2] > s[2] - 0.12 && p[2] < s[5] + 0.12) { bad.push([ai, +t.toFixed(2), 'solid', p.map((v) => +v.toFixed(2)), s.map((v) => +v.toFixed(2))]); break; }
            }
            for (const o of World.H.flora.obstacles) {
              if (Math.abs(p[0] - o[0]) < o[3] && Math.abs(p[2] - o[2]) < o[3] && Math.hypot(p[0] - o[0], p[2] - o[2]) < o[3] && p[1] < o[1] + o[4]) { bad.push([ai, +t.toFixed(2), 'tree', p.map((v) => +v.toFixed(2))]); break; }
            }
            const r = inRoof(p);
            if (r) bad.push([ai, +t.toFixed(2), r, p.map((v) => +v.toFixed(2))]);
            const hp = st.poet.pos;
            const dh = Math.hypot(p[0] - hp[0], p[1] - hp[1] - 1.1, p[2] - hp[2]);
            if (dh < 0.9) bad.push([ai, +t.toFixed(2), 'poet', +dh.toFixed(2)]);
          }
        }
        return bad;
      },
      free: (i) => { app.enterFree(); if (i !== undefined) app.viewpoint(VIEWPOINTS[i]); },
    };
  }

  return { start, app, get camera() { return camera; }, get renderer() { return renderer; } };
})();

window.addEventListener('DOMContentLoaded', () => {
  Main.start().catch((err) => {
    console.error(err);
    const el = document.getElementById('fatal');
    document.getElementById('loading').hidden = true;
    if (el) {
      el.hidden = false;
      el.querySelector('.msg').textContent = String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' · ') : err);
    }
  });
});
