/* ==========================================================================
 * 41-speech.js — recitation. Off by default. Two sources:
 *   · the browser's Chinese speech voice (speechSynthesis), line by line;
 *   · a recording the user loads from disk (any recitation they have the
 *     right to use), split into lines at pauses; or one embedded by a local
 *     build (window.__EMBED_VOICE) with hand-checked line timings. A sung
 *     recording may carry a second pass (verse) that plays as one continuous
 *     take for chapters that read all four lines. The public build ships no audio.
 * Sync is per line, from real start/end events — no word-level claims.
 * Gaps between lines are timed by the render loop (tick), not by timers.
 * ========================================================================== */
const Speech = (() => {
  let on = false;
  let voice = null, voices = [];
  let rate = 0.82;
  let notice = () => {};
  let custom = null; // { buffer, title:[s,e]|null, lines:[[s,e]x4], verse?:[[s,e]x4], name, fadeIn, fadeOut, gain }
  const embedded = typeof window !== 'undefined' && window.__EMBED_VOICE && window.__EMBED_VOICE.b64 ? window.__EMBED_VOICE : null;
  let job = null;
  const synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;

  function rankVoice(v) {
    const n = (v.name + ' ' + v.lang).toLowerCase();
    let s = 0;
    if (/zh[-_]cn|cmn|zh-hans/.test(n)) s += 50;
    else if (/^zh|chinese|中文|普通话/.test(n)) s += 30;
    else return -1;
    if (/natural|neural|online/.test(n)) s += 20;
    if (/xiaoxiao|yunxi|xiaoyi|yunjian|tingting|婷婷|google|huihui|yaoyao|kangkang|lili|sinji/.test(n)) s += 10;
    if (/hk|tw|yue|cantonese/.test(n)) s -= 25;
    return s;
  }
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter((v) => rankVoice(v) >= 0).sort((a, b) => rankVoice(b) - rankVoice(a));
    if (!voice || !voices.includes(voice)) voice = voices[0] || null;
  }
  function init(onNotice) {
    notice = onNotice || notice;
    if (synth) {
      loadVoices();
      if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);
      else synth.onvoiceschanged = loadVoices;
    }
  }
  const available = () => !!custom || !!voice;

  function setEnabled(v) {
    on = v;
    if (!v) { cancel(); return true; }
    loadVoices();
    if (!available()) {
      notice(synth ? '这台设备没有可用的中文朗读语音。可在“设置”中载入自备的朗诵音频；不朗读也能完整体验。' : '当前浏览器不支持语音朗读。可在“设置”中载入自备的朗诵音频。');
      on = false;
      return false;
    }
    return true;
  }

  // A continuous take of several lines from the recording's second pass
  function spanItem(act) {
    const idx = act.speech.items.filter((it) => typeof it === 'number');
    if (!custom || !custom.verse || idx.length < 2) return null;
    const v = custom.verse, a = v[idx[0]][0], b = v[idx[idx.length - 1]][1];
    return { span: [a, b], cues: idx.map((li) => [v[li][0] - a, li]), line: idx[0], text: '' };
  }
  // Seconds of recording a chapter will play (0 = unknown / speech engine)
  function leadFor(act) {
    if (!on || !act.speech) return 0;
    const sp = spanItem(act);
    return sp ? sp.span[1] - sp.span[0] : 0;
  }

  // Items for a chapter: strings (title lines) or indices into POEM.lines
  function itemsFor(act) {
    const sp = spanItem(act);
    if (sp) return [sp];
    const items = act.speech.items.map((it) => {
      if (typeof it === 'number') {
        const L = POEM.lines[it];
        return { text: L.text + L.punct, line: it };
      }
      return { text: it.replace('　', '，'), line: -1, title: true };
    });
    // a recording holds the title as one clip: play it once
    if (custom) {
      const t = items.filter((x) => x.title);
      if (t.length > 1) return [t[0], ...items.filter((x) => !x.title)];
    }
    return items;
  }

  function speakAct(act, onItem) {
    if (!on || !act.speech) return;
    cancel();
    const items = itemsFor(act);
    job = { items, i: 0, onItem, state: 'start', gap: act.speech.gap || 0.45, gapLeft: 0, paused: false, watchdog: 0, token: {} };
    startItem();
  }

  function startItem() {
    if (!job) return;
    const it = job.items[job.i];
    if (!it) { job.state = 'done'; return; }
    job.state = 'speaking';
    job.watchdog = 0;
    job.elapsed = 0;
    job.started = false;
    // upper bound for one item, so a missing 'end' event can never stall the reading
    const seg = custom ? segOf(it) : null;
    const from = job.resumeAt || 0;
    job.resumeAt = 0;
    job.maxDur = custom ? 3 + (seg ? seg[1] - seg[0] - from : 0) : 4 + it.text.length * 0.75 / rate;
    job.itemStart = from;
    job.cue = 0;
    const token = (job.token = {});
    if (it.cues) {
      while (job.cue + 1 < it.cues.length && it.cues[job.cue + 1][0] <= from) job.cue++;
      if (job.onItem) job.onItem(it.cues[job.cue][1]);
    } else if (it.line >= 0 && job.onItem) job.onItem(it.line);
    if (custom) return playSegment(seg, from, token);
    if (!synth || !voice) { job.state = 'done'; return; }
    try { synth.cancel(); } catch (e) { /* ignored */ }
    const u = new SpeechSynthesisUtterance(it.text);
    u.voice = voice;
    u.lang = voice.lang || 'zh-CN';
    u.rate = rate;
    u.pitch = 0.96;
    u.onstart = () => { if (job && job.token === token) job.started = true; };
    u.onend = () => { if (job && job.token === token) itemDone(); };
    u.onerror = (e) => {
      if (!job || job.token !== token) return;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      notice('朗读播放失败（' + (e && e.error ? e.error : '未知原因') + '），已切换为无声模式。');
      on = false;
      job.state = 'done';
    };
    job.utter = u;
    synth.speak(u);
  }

  const segOf = (it) => it.span || (it.line >= 0 ? custom.lines[it.line] : custom.title);

  function playSegment(seg, from, token) {
    const ctx = Sound.ensureCtx();
    if (!ctx) { job.state = 'done'; return; }
    if (!seg) { itemDone(); return; }
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = custom.buffer;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + 0.02, dur = Math.max(0.05, seg[1] - seg[0] - from);
    const vol = custom.gain || 1, fi = Math.min(custom.fadeIn || 0.03, dur / 3), fo = Math.min(custom.fadeOut || 0.08, dur / 3);
    // soft edges: a sung take sits on a music bed that must not click in or out
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + fi);
    g.gain.setValueAtTime(vol, t0 + dur - fo);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(g);
    g.connect(ctx.destination);
    src.onended = () => { if (job && job.token === token) itemDone(); };
    src.start(t0, seg[0] + from, dur);
    job.started = true;
    job.src = src;
  }

  function itemDone() {
    if (!job) return;
    job.i++;
    if (job.i >= job.items.length) { job.state = 'done'; return; }
    job.state = 'gap';
    job.gapLeft = job.gap;
  }

  // Called every frame by the narrative loop
  function tick(dt) {
    if (!job || job.paused) return;
    if (job.state === 'gap') {
      job.gapLeft -= dt;
      if (job.gapLeft <= 0) startItem();
    } else if (job.state === 'speaking') {
      job.elapsed += dt;
      // continuous take: move the highlighted line along with the singing
      const it = job.items[job.i];
      if (it && it.cues && job.cue + 1 < it.cues.length && job.itemStart + job.elapsed >= it.cues[job.cue + 1][0]) {
        job.cue++;
        if (job.onItem) job.onItem(it.cues[job.cue][1]);
      }
      if (!job.started) {
        job.watchdog += dt;
        if (job.watchdog > 4.5) {
          notice('朗读没有开始播放，可能被浏览器阻止。已切换为无声模式，画面继续。');
          on = false;
          cancel();
          return;
        }
      }
      if (job.elapsed > job.maxDur) { stopCurrent(); job.token = {}; itemDone(); }
    }
  }

  function stopCurrent() {
    if (!job) return;
    job.token = {};
    if (job.src) { try { job.src.stop(); } catch (e) { /* ignored */ } job.src = null; }
    if (synth) { try { synth.cancel(); } catch (e) { /* ignored */ } }
  }
  function cancel() {
    stopCurrent();
    job = null;
  }
  // Pause: stop the sound now; on resume, repeat the interrupted line from its start
  // (inside a continuous take: from the start of the line being sung).
  function pause() {
    if (!job || job.state === 'done') return;
    const it = job.items[job.i];
    if (job.state === 'speaking' && it && it.cues) job.resumeAt = it.cues[job.cue][0];
    stopCurrent();
    job.paused = true;
  }
  function resume() {
    if (!job || !job.paused) return;
    job.paused = false;
    if (job.state === 'speaking' || job.state === 'start') startItem();
  }
  const busy = () => !!job && job.state !== 'done';

  // ------------------------------------------------------------- custom audio
  // opts.enable === false: prepare the recording without switching recitation on
  async function loadFile(file, opts = {}) {
    const ctx = Sound.ensureCtx();
    if (!ctx) throw new Error('浏览器不支持 Web Audio');
    const arr = await file.arrayBuffer();
    const buffer = await new Promise((res, rej) => ctx.decodeAudioData(arr, res, rej));
    const segs = segment(buffer);
    let lines, title = null, even = false;
    if (segs.length >= 4) {
      lines = segs.slice(-4);
      if (segs.length > 4) title = [segs[0][0], segs[segs.length - 5][1]];
    } else {
      even = true;
      const d = buffer.duration;
      lines = [0, 1, 2, 3].map((k) => [(d * k) / 4, (d * (k + 1)) / 4]);
    }
    custom = { buffer, lines, title, name: file.name, even };
    if (opts.enable !== false) on = true;
    return { segments: segs.length, even, duration: buffer.duration };
  }
  function clearCustom() { custom = null; }

  // The recording embedded by a local build: decoded on first use
  async function loadEmbedded(opts = {}) {
    if (!embedded) return false;
    const ctx = Sound.ensureCtx();
    if (!ctx) throw new Error('浏览器不支持 Web Audio');
    const bin = atob(embedded.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const buffer = await new Promise((res, rej) => ctx.decodeAudioData(bytes.buffer, res, rej));
    custom = {
      buffer, name: embedded.name, title: embedded.title || null, lines: embedded.lines, verse: embedded.verse || null,
      fadeIn: embedded.fadeIn, fadeOut: embedded.fadeOut, gain: embedded.gain, embedded: true,
    };
    if (opts.enable !== false) on = true;
    return true;
  }

  // Split at pauses: RMS in 20 ms frames, silence ≥ 0.28 s separates phrases.
  function segment(buffer) {
    const sr = buffer.sampleRate;
    const ch = buffer.getChannelData(0);
    const hop = Math.floor(sr * 0.02);
    const rms = [];
    for (let i = 0; i + hop <= ch.length; i += hop) {
      let s = 0;
      for (let k = 0; k < hop; k++) s += ch[i + k] * ch[i + k];
      rms.push(Math.sqrt(s / hop));
    }
    const sorted = rms.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0.1;
    const thr = Math.max(0.008, p95 * 0.12);
    const minGap = Math.round(0.28 / 0.02), minLen = Math.round(0.25 / 0.02);
    const segs = [];
    let start = -1, quiet = 0;
    for (let i = 0; i < rms.length; i++) {
      if (rms[i] > thr) {
        if (start < 0) start = i;
        quiet = 0;
      } else if (start >= 0) {
        quiet++;
        if (quiet >= minGap) {
          const end = i - quiet + 1;
          if (end - start >= minLen) segs.push([start, end]);
          start = -1;
          quiet = 0;
        }
      }
    }
    if (start >= 0 && rms.length - start >= minLen) segs.push([start, rms.length]);
    // pad a little so consonants and breaths are kept
    return segs.map(([a, b]) => [Math.max(0, a * 0.02 - 0.08), Math.min(buffer.duration, b * 0.02 + 0.15)]);
  }

  return {
    init, setEnabled, speakAct, tick, cancel, pause, resume, busy, loadFile, clearCustom, loadEmbedded, leadFor,
    embedded: () => (embedded ? embedded.name : null),
    enabled: () => on, available, voices: () => voices, setVoice: (v) => { voice = v; }, setRate: (r) => { rate = r; },
    get voice() { return voice; }, get custom() { return custom; }, get rate() { return rate; },
  };
})();
