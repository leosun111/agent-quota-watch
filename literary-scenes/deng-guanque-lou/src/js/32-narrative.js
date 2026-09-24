/* ==========================================================================
 * 32-narrative.js — the reading timeline. One clock (advanced by the render
 * loop, never by timers) drives chapters, speech cues and transitions.
 *   pace 'continuous': chapters flow on; 'chapter': stop at each end.
 *   Speech holds the clock near a chapter's end until the line is spoken.
 * ========================================================================== */
const Narrative = (() => {
  const S = {
    mode: 'landing', // 'landing' | 'tour' | 'free'
    act: 0,
    t: 0,
    playing: false,
    pace: 'continuous',
    awaiting: false,
    holding: false,
    ended: false,
    spoken: false,
    line: -1,
    dip: null, // { phase, k, apply }
    frozen: null, // stage kept when leaving the tour
  };
  const subs = new Set();
  const on = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = (type, data) => { for (const f of subs) f(type, data); };

  const total = () => ACTS.reduce((a, b) => a + b.dur, 0);
  const startOf = (i) => ACTS.slice(0, i).reduce((a, b) => a + b.dur, 0);
  const holdAt = (act) => act.dur - (act.id === 'vision' ? 3.5 : 0.8);

  function setAct(i, t = 0) {
    S.act = U.clamp(i, 0, ACTS.length - 1);
    S.t = U.clamp(t, 0, ACTS[S.act].dur);
    S.awaiting = false;
    S.holding = false;
    S.ended = false;
    const act = ACTS[S.act];
    S.spoken = !act.speech || S.t > act.speech.at + 0.25;
    S.line = -1;
    Speech.cancel();
    emit('act', { act: S.act });
    emit('state');
  }

  function start() {
    S.mode = 'tour';
    S.playing = true;
    setAct(0, 0);
    emit('mode', S.mode);
  }
  function play() {
    if (S.mode !== 'tour') return;
    if (S.ended) { restart(); return; }
    S.playing = true;
    Speech.resume();
    emit('state');
  }
  function pause() {
    if (S.mode !== 'tour') return;
    S.playing = false;
    Speech.pause();
    emit('state');
  }
  const toggle = () => (S.playing ? pause() : play());

  // Jump with a short dip to dark so the camera never whips across the scene.
  function goto(i, t = 0, opts = {}) {
    if (S.mode !== 'tour') { S.mode = 'tour'; emit('mode', S.mode); }
    const apply = () => { setAct(i, t); if (opts.play !== false) S.playing = true; emit('state'); };
    if (opts.dip === false) { S.dip = null; apply(); return; }
    Speech.cancel();
    S.dip = { phase: 'out', k: 0, apply };
  }
  const next = () => goto(Math.min(ACTS.length - 1, S.act + 1));
  const prev = () => goto(S.t > 3 ? S.act : Math.max(0, S.act - 1));
  const restart = () => goto(0, 0);

  function scrub(globalT, done) {
    const T = U.clamp(globalT, 0, total() - 0.01);
    let i = 0;
    while (i < ACTS.length - 1 && T >= startOf(i + 1)) i++;
    setAct(i, T - startOf(i));
    if (done && S.pace === 'chapter' && S.t >= ACTS[i].dur - 0.05) S.awaiting = true;
  }

  function continueChapter() {
    if (!S.awaiting) return;
    S.awaiting = false;
    advance();
  }
  function setPace(p) {
    S.pace = p;
    if (p === 'continuous' && S.awaiting) continueChapter();
    emit('state');
  }

  function advance() {
    if (S.act >= ACTS.length - 1) {
      S.ended = true;
      S.playing = false;
      emit('ended');
      emit('state');
      return;
    }
    setAct(S.act + 1, 0);
  }

  function exitTour(stage) {
    S.frozen = stage;
    S.mode = 'free';
    S.playing = false;
    Speech.cancel();
    emit('mode', S.mode);
    emit('state');
  }

  // Called once per frame. Returns fade from dips (0..1).
  function update(dt) {
    let dipFade = 0;
    if (S.dip) {
      const d = S.dip;
      if (d.phase === 'out') {
        d.k += dt / 0.32;
        if (d.k >= 1) { d.apply(); d.phase = 'in'; d.k = 1; }
        dipFade = U.smoothstep(0, 1, Math.min(1, d.k));
      } else {
        d.k -= dt / 0.55;
        dipFade = U.smoothstep(0, 1, Math.max(0, d.k));
        if (d.k <= 0) S.dip = null;
      }
      if (S.dip && S.dip.phase === 'out') return dipFade;
    }
    if (S.mode !== 'tour' || !S.playing || S.awaiting || S.ended) return dipFade;
    const act = ACTS[S.act];
    // speech cue
    if (!S.spoken && act.speech && S.t >= act.speech.at) {
      S.spoken = true;
      Speech.speakAct(act, (idx) => { S.line = idx; emit('line', idx); });
    }
    // hold for the reader near the end of a chapter
    const busy = Speech.busy();
    if (busy && S.t >= holdAt(act)) {
      if (!S.holding) { S.holding = true; emit('state'); }
      return dipFade;
    }
    if (S.holding) { S.holding = false; emit('state'); }
    S.t += dt;
    if (S.t >= act.dur) {
      S.t = act.dur;
      if (S.pace === 'chapter' && S.act < ACTS.length - 1) {
        S.awaiting = true;
        emit('awaiting', S.act);
        emit('state');
      } else advance();
    }
    return dipFade;
  }

  // Which line is highlighted (for chapters that show several lines)
  function currentLine() {
    const act = ACTS[S.act];
    if (!Array.isArray(act.show)) return -1;
    if (act.show.length === 1) return act.show[0];
    if (S.line >= 0 && Speech.enabled()) return S.line;
    if (act.lineCues) {
      let idx = -1;
      act.lineCues.forEach((c, k) => { if (S.t >= c) idx = act.show[k]; });
      return idx;
    }
    return -1;
  }

  return {
    S, on, start, play, pause, toggle, goto, next, prev, restart, scrub, continueChapter, setPace, exitTour, update,
    total, startOf, currentLine, globalTime: () => startOf(S.act) + S.t,
  };
})();
