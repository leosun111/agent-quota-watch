/* ==========================================================================
 * 50-ui.js — interface: landing, subtitles (原文/白话), chapter bar with
 * scrubbing, table of contents, glossary & object notes, settings, free
 * viewing chips, screenshot preview, hide/show UI, keyboard and pointer input.
 * Talks to the app only through the callbacks passed to init(app).
 * ========================================================================== */
const UI = (() => {
  const $ = (id) => document.getElementById(id);
  let app = null;
  const prefs = { text: 'both', pace: 'continuous', reduced: false, music: 0.55, amb: 0.35, quality: 'auto' };
  const store = {
    load() { try { const s = JSON.parse(localStorage.getItem('dgl-prefs') || '{}'); Object.assign(prefs, s); } catch (e) { /* storage unavailable */ } },
    save() { try { localStorage.setItem('dgl-prefs', JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ } },
  };

  // The viewer's own recitation file, kept in this browser (IndexedDB) so it
  // need not be loaded again next visit. Never leaves the device.
  const voiceStore = (() => {
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open('dgl-voice', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction('files', mode);
        const q = fn(tx.objectStore('files'));
        tx.oncomplete = () => { db.close(); res(q && q.result); };
        tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
      });
    };
    return {
      save: (blob, name) => run('readwrite', (st) => st.put({ blob, name }, 'voice')).catch(() => {}),
      load: () => run('readonly', (st) => st.get('voice')).catch(() => null),
      clear: () => run('readwrite', (st) => st.delete('voice')).catch(() => {}),
    };
  })();
  let storedVoice = null; // { blob, name } waiting to be decoded on first use
  let useEmbedded = true; // a recording built into this copy of the page (local builds only)

  // ------------------------------------------------------------- helpers
  function toast(msg, ms = 4200) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, ms);
  }
  const GLOSS_KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  function gloss(text) {
    let out = '', i = 0;
    while (i < text.length) {
      const k = GLOSS_KEYS.find((g) => text.startsWith(g, i));
      if (k) { out += `<span class="gl" data-g="${k}" tabindex="0" role="button">${k}</span>`; i += k.length; }
      else { out += text[i]; i++; }
    }
    return out;
  }
  function fmt(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // ------------------------------------------------------------- popover
  function showPop(title, line, text, x, y) {
    const p = $('pop');
    $('pop-title').textContent = title;
    $('pop-line').textContent = line || '';
    $('pop-line').hidden = !line;
    $('pop-text').textContent = text;
    p.hidden = false;
    const w = p.offsetWidth, h = p.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x - w / 2, top = y - h - 18;
    if (top < 12) top = y + 18;
    left = U.clamp(left, 16, vw - w - 16);
    top = U.clamp(top, 12, vh - h - 12);
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  }
  const hidePop = () => { $('pop').hidden = true; };
  function showGloss(key, el) {
    const r = el.getBoundingClientRect();
    showPop(key, '', GLOSSARY[key], r.left + r.width / 2, r.top);
  }
  function showObject(kind, x, y) {
    const o = OBJECT_INFO[kind];
    if (!o) return;
    showPop(o.title, o.line, o.text, x, y);
  }

  // ------------------------------------------------------------- panels
  function openDrawer(id) {
    for (const d of ['toc', 'settings']) $(d).hidden = d !== id;
    $('more').hidden = true;
    if (id === 'toc') markToc();
  }
  const closeDrawers = () => { $('toc').hidden = true; $('settings').hidden = true; };
  function toggleMenu(anchor) {
    const m = $('more');
    m.hidden = !m.hidden;
    if (!m.hidden) {
      const tour = Narrative.S.mode === 'tour';
      $('m-exit').hidden = !tour;
      $('m-tour').hidden = tour;
      $('m-freeze').textContent = app.frozen() ? '恢复动态' : '暂停动态';
      const r = anchor.getBoundingClientRect();
      if (window.innerWidth > 720) {
        m.style.left = 'auto';
        m.style.right = Math.max(16, window.innerWidth - r.right) + 'px';
      }
      m.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      m.querySelector('button:not([hidden])').focus();
    }
  }

  // ------------------------------------------------------------- subtitles
  let lastAct = -1, lastLine = -2;
  function renderAct(ai) {
    const act = ACTS[ai];
    $('act-no').textContent = act.no;
    $('act-name').textContent = act.name;
    $('act-where').textContent = act.where || '';
    $('act-doing').textContent = act.doing || '';
    const orig = $('sub-orig');
    if (act.show === 'title') {
      orig.className = 'sub-orig';
      orig.innerHTML = `<span class="title">${gloss(POEM.title)}</span><span class="author">〔${POEM.dynasty}〕${POEM.author}</span>`;
      $('sub-vern').textContent = act.vern || '';
    } else {
      orig.className = 'sub-orig' + (act.show.length > 1 ? ' multi' : '');
      orig.innerHTML = act.show.map((i) => `<span class="ln" data-line="${i}">${gloss(POEM.lines[i].text)}${POEM.lines[i].punct}</span>`).join('');
      if (act.show.length === 1) $('sub-vern').textContent = POEM.lines[act.show[0]].vern;
      else $('sub-vern').textContent = '';
    }
    lastAct = ai;
    lastLine = -2;
    markSegs(ai);
    markToc();
  }
  function renderLine(line) {
    if (line === lastLine) return;
    lastLine = line;
    for (const el of $('sub-orig').querySelectorAll('.ln')) el.classList.toggle('cur', +el.dataset.line === line);
    const act = ACTS[Narrative.S.act];
    if (Array.isArray(act.show) && act.show.length > 1) $('sub-vern').textContent = line >= 0 ? POEM.lines[line].vern : '';
  }
  function applyTextMode() {
    document.body.classList.toggle('text-orig', prefs.text === 'orig');
    document.body.classList.toggle('text-vern', prefs.text === 'vern');
    $('btn-text').textContent = { both: '原文＋白话', orig: '只看原文', vern: '只看白话' }[prefs.text];
  }

  // ------------------------------------------------------------- progress
  function buildProgress() {
    const segs = $('progress-segs');
    segs.innerHTML = '';
    const T = Narrative.total();
    ACTS.forEach((a, i) => {
      const d = document.createElement('div');
      d.className = 'seg';
      d.style.flex = `${a.dur / T} 1 0`;
      d.innerHTML = `<b>${a.no}</b>`;
      d.title = `${a.no} · ${a.name}`;
      d.dataset.i = i;
      segs.appendChild(d);
    });
  }
  function markSegs(ai) {
    [...$('progress-segs').children].forEach((d, i) => d.classList.toggle('cur', i === ai));
  }
  function bindProgress() {
    const bar = $('progress');
    let drag = false;
    const toT = (e) => {
      const r = bar.getBoundingClientRect();
      return U.clamp((e.clientX - r.left) / r.width, 0, 1) * Narrative.total();
    };
    bar.addEventListener('pointerdown', (e) => {
      drag = true;
      bar.setPointerCapture(e.pointerId);
      Narrative.scrub(toT(e));
      e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => { if (drag) Narrative.scrub(toT(e)); });
    const end = (e) => { if (!drag) return; drag = false; Narrative.scrub(toT(e), true); };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', () => { drag = false; });
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation();
        e.preventDefault();
        Narrative.scrub(Narrative.globalTime() + (e.key === 'ArrowLeft' ? -5 : 5), true);
      }
    });
  }

  // ------------------------------------------------------------- TOC
  function buildToc() {
    const ol = $('toc-list');
    ol.innerHTML = '';
    ACTS.forEach((a, i) => {
      const li = document.createElement('li');
      const text = a.show === 'title' ? '登鹳雀楼' : a.show.map((k) => POEM.lines[k].text).join(' ');
      li.innerHTML = `<button type="button"><span class="no">${a.no}</span><span><span class="nm">${a.name === text ? text : a.name}</span><span class="ds">${a.where}　${a.doing}</span></span></button>`;
      li.querySelector('button').addEventListener('click', () => { closeDrawers(); app.tourAt(i); });
      ol.appendChild(li);
    });
    $('toc-poem-text').innerHTML = POEM.lines.map((l) => l.text + l.punct).join('').replace('。欲', '。<br>欲');
    const dl = $('toc-gloss');
    dl.innerHTML = Object.entries(GLOSSARY).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }
  function markToc() {
    [...$('toc-list').children].forEach((li, i) => li.classList.toggle('cur', Narrative.S.mode === 'tour' && i === Narrative.S.act));
  }

  // ------------------------------------------------------------- free HUD
  function buildFree() {
    const vc = $('vp-chips');
    vc.innerHTML = '';
    VIEWPOINTS.forEach((vp) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = vp.name;
      b.addEventListener('click', () => {
        app.viewpoint(vp);
        [...vc.children].forEach((c) => c.classList.toggle('on', c === b));
      });
      vc.appendChild(b);
    });
    const tc = $('tod-chips');
    tc.innerHTML = '';
    [['夕照', 5.2], ['日落', 3.1], ['暮色', 1.2]].forEach(([name, e], i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (i === 0 ? ' on' : '');
      b.type = 'button';
      b.textContent = name;
      b.addEventListener('click', () => {
        app.timeOfDay(e);
        [...tc.children].forEach((c) => c.classList.toggle('on', c === b));
      });
      tc.appendChild(b);
    });
  }

  // ------------------------------------------------------------- settings
  function buildSettings() {
    const segBtns = document.querySelectorAll('.seg [data-q]');
    const mark = () => segBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.q === prefs.quality)));
    mark();
    segBtns.forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.q === prefs.quality) return;
      prefs.quality = b.dataset.q;
      store.save();
      mark();
      app.setQuality(prefs.quality);
    }));
    const red = $('opt-reduced');
    red.checked = prefs.reduced;
    red.addEventListener('change', () => { prefs.reduced = red.checked; store.save(); app.setReduced(prefs.reduced); });
    const vm = $('vol-music'), va = $('vol-amb');
    vm.value = prefs.music;
    va.value = prefs.amb;
    vm.addEventListener('input', () => { prefs.music = +vm.value; Sound.setVolume('music', prefs.music); store.save(); });
    va.addEventListener('input', () => { prefs.amb = +va.value; Sound.setVolume('amb', prefs.amb); store.save(); });
    const vs = $('voice-select');
    const fill = () => {
      const vv = Speech.voices();
      vs.innerHTML = vv.length ? vv.map((v, i) => `<option value="${i}">${v.name}（${v.lang}）</option>`).join('') : '<option>（未找到中文语音）</option>';
      vs.disabled = !vv.length;
      const cur = vv.indexOf(Speech.voice);
      if (cur >= 0) vs.value = String(cur);
    };
    fill();
    setTimeout(fill, 1200);
    if (window.speechSynthesis && window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', fill);
    vs.addEventListener('change', () => { const v = Speech.voices()[+vs.value]; if (v) Speech.setVoice(v); });
    const rate = $('speech-rate');
    rate.addEventListener('input', () => Speech.setRate(+rate.value));
    $('voice-file').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      $('voice-file-note').textContent = '正在分析音频……';
      try {
        const r = await Speech.loadFile(f);
        const msg = r.even
          ? `已载入“${f.name}”，但只找到 ${r.segments} 段停顿，已按时长平均分成四句。`
          : `已载入“${f.name}”，识别到 ${r.segments} 段，末四段对应四句诗${r.segments > 4 ? '，前面的部分作为题目与作者' : ''}。`;
        $('voice-file-note').textContent = msg + ' 已保存在本浏览器，下次打开无需重新载入。';
        $('voice-clear').hidden = false;
        storedVoice = null;
        voiceStore.save(f, f.name);
        setSpeechUI(true);
        toast(msg);
      } catch (err) {
        $('voice-file-note').textContent = '无法读取这个音频文件：' + (err && err.message ? err.message : '格式不受支持');
      }
    });
    $('voice-clear').addEventListener('click', () => {
      Speech.clearCustom();
      storedVoice = null;
      useEmbedded = false;
      voiceStore.clear();
      $('voice-clear').hidden = true;
      $('voice-file').value = '';
      $('voice-file-note').textContent = '已清除自备音频，朗读将使用浏览器语音。';
      if (!Speech.available()) setSpeechUI(false);
    });
  }

  // ------------------------------------------------------------- toggles
  function setSpeechUI(onv) {
    for (const id of ['btn-speech', 'btn-l-speech']) $(id).setAttribute('aria-pressed', String(onv));
    $('btn-l-speech').textContent = onv ? '朗读 · 开' : '朗读 · 关';
  }
  // Music and recitation are on by default. Browsers only allow sound after the
  // visitor's first click or key press, so until then both stay "armed": the
  // buttons read 开, and the first gesture anywhere starts them. Pressing one of
  // the buttons first counts as switching that one off.
  const armed = { speech: true, sound: true };
  function bindAudioDefaults() {
    setSpeechUI(true);
    setSoundUI(true);
    const evs = ['pointerdown', 'keydown', 'touchstart'];
    const onFirst = (e) => {
      if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Tab')) return;
      for (const ev of evs) window.removeEventListener(ev, onFirst, true);
      const t = e.target && e.target.closest ? e.target : null;
      if (armed.sound && !(t && t.closest('#btn-sound,#btn-l-sound,#btn-f-sound'))) { armed.sound = false; toggleSound(); }
      if (armed.speech && !(t && t.closest('#btn-speech,#btn-l-speech'))) { armed.speech = false; toggleSpeech({ quiet: true }); }
    };
    for (const ev of evs) window.addEventListener(ev, onFirst, true);
  }

  async function toggleSpeech(opts = {}) {
    if (opts instanceof Event) opts = {};
    if (armed.speech) { armed.speech = false; setSpeechUI(false); toast('朗读已关闭', 1600); return; }
    const want = !Speech.enabled();
    if (want && storedVoice && !Speech.custom) {
      const sv = storedVoice;
      storedVoice = null;
      try {
        await Speech.loadFile(new File([sv.blob], sv.name), { enable: false });
      } catch (e) {
        toast('上次保存的朗诵音频无法读取，已改用浏览器语音。');
        voiceStore.clear();
        $('voice-clear').hidden = !Speech.embedded();
      }
    }
    if (want && useEmbedded && !Speech.custom && Speech.embedded()) {
      try {
        await Speech.loadEmbedded({ enable: false });
      } catch (e) {
        useEmbedded = false;
        toast('内置朗诵音轨无法播放，已改用浏览器语音。');
      }
    }
    const ok = Speech.setEnabled(want);
    setSpeechUI(want && ok);
    if (want && ok) {
      Sound.ensureCtx();
      if (!opts.quiet) toast(Speech.custom ? (Speech.custom.embedded ? `朗读已开启：内置音轨“${Speech.custom.name}”` : '朗读已开启：使用你载入的朗诵音频') : `朗读已开启：${Speech.voice ? Speech.voice.name : '浏览器语音'}`, 2600);
      app.speechTurnedOn();
    }
  }
  function setSoundUI(onv) {
    $('btn-sound').setAttribute('aria-pressed', String(onv));
    for (const id of ['btn-l-sound', 'btn-f-sound']) {
      $(id).setAttribute('aria-pressed', String(onv));
      $(id).textContent = onv ? '乐声 · 开' : '乐声 · 关';
    }
  }
  async function toggleSound() {
    if (armed.sound) { armed.sound = false; setSoundUI(false); toast('乐声已关闭', 1600); return; }
    const want = !Sound.enabled;
    const ok = await Sound.setEnabled(want);
    if (!ok) { toast('当前浏览器不支持 Web Audio，乐声不可用。'); return; }
    Sound.setVolume('music', prefs.music);
    Sound.setVolume('amb', prefs.amb);
    setSoundUI(want);
  }
  function setHidden(h) {
    document.body.classList.toggle('ui-hidden', h);
    $('showui').hidden = !h;
    if (h) { hidePop(); closeDrawers(); $('more').hidden = true; }
  }

  // ------------------------------------------------------------- pointer input on the scene
  function bindCanvas() {
    const cv = $('gl');
    const ptrs = new Map();
    let moved = false, t0 = 0, pinch = 0;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      moved = false;
      t0 = performance.now();
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      cv.classList.add('dragging');
      hidePop();
      $('more').hidden = true;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (ptrs.size === 1) {
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 5) moved = true;
        if (moved) app.drag(dx, dy);
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) app.zoom((pinch - d) * 3);
        pinch = d;
        moved = true;
      }
    });
    const up = (e) => {
      const had = ptrs.delete(e.pointerId);
      if (!ptrs.size) cv.classList.remove('dragging');
      if (had && !moved && performance.now() - t0 < 450 && e.type === 'pointerup') app.click(e.clientX, e.clientY);
      if (ptrs.size < 2) pinch = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); app.zoom(e.deltaY); }, { passive: false });
    // subtitle glossary
    $('sub-orig').addEventListener('click', (e) => {
      const g = e.target.closest('.gl');
      if (g) { e.stopPropagation(); showGloss(g.dataset.g, g); }
    });
    $('sub-orig').addEventListener('keydown', (e) => {
      const g = e.target.closest('.gl');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showGloss(g.dataset.g, g); }
    });
  }

  // ------------------------------------------------------------- keyboard
  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (!$('shot').hidden) { $('shot').hidden = true; return; }
        if (!$('pop').hidden) { hidePop(); return; }
        if (!$('more').hidden) { $('more').hidden = true; return; }
        if (!$('toc').hidden || !$('settings').hidden) { closeDrawers(); return; }
        if (document.body.classList.contains('ui-hidden')) { setHidden(false); return; }
        return;
      }
      if (k === 'h') { setHidden(!document.body.classList.contains('ui-hidden')); return; }
      if (Narrative.S.mode === 'tour') {
        if (k === ' ') { e.preventDefault(); if (Narrative.S.awaiting) Narrative.continueChapter(); else Narrative.toggle(); }
        else if (e.key === 'ArrowLeft') Narrative.prev();
        else if (e.key === 'ArrowRight') { if (Narrative.S.awaiting) Narrative.continueChapter(); else Narrative.next(); }
        else if (k === 't') openDrawer($('toc').hidden ? 'toc' : null);
        else if (k === 'r') Director.recenter();
      } else if (Narrative.S.mode === 'landing') {
        if (e.key === 'Enter' && document.activeElement === document.body) app.startTour();
      }
    });
  }

  // ------------------------------------------------------------- mode switching
  function showMode(mode) {
    $('landing').hidden = mode !== 'landing';
    $('hud').hidden = mode !== 'tour';
    $('freehud').hidden = mode !== 'free';
    $('ending').hidden = true;
    document.body.classList.remove('ended');
    hidePop();
    closeDrawers();
    $('more').hidden = true;
    if (mode === 'tour') { renderAct(Narrative.S.act); applyTextMode(); }
    markToc();
  }

  function showEnding(on) { $('ending').hidden = !on; document.body.classList.toggle('ended', on); }

  function syncState() {
    const S = Narrative.S;
    $('ico-pause').hidden = !S.playing;
    $('ico-play').hidden = S.playing;
    $('btn-play').setAttribute('aria-label', S.playing ? '暂停' : '继续');
    $('await').hidden = !S.awaiting;
    $('holding').hidden = !S.holding;
    $('btn-pace').textContent = S.pace === 'chapter' ? '逐章慢读' : '连贯体验';
    $('btn-pace').classList.toggle('on', S.pace === 'chapter');
    if (S.mode === 'tour' && S.act !== lastAct) renderAct(S.act);
  }

  // Per-frame: progress, captions, recenter hint
  let capKey = '';
  function frame() {
    const S = Narrative.S;
    if (S.mode !== 'tour') return;
    const g = Narrative.globalTime(), T = Narrative.total();
    const f = g / T;
    $('progress-fill').style.width = (f * 100).toFixed(2) + '%';
    $('progress-knob').style.left = (f * 100).toFixed(2) + '%';
    $('progress').setAttribute('aria-valuenow', String(Math.round(f * 100)));
    $('time-label').textContent = fmt(g) + ' / ' + fmt(T);
    renderLine(Narrative.currentLine());
    // captions
    const act = ACTS[S.act];
    let cap = null;
    if (act.captions) for (const c of act.captions) if (S.t >= c.from && S.t <= c.to) cap = c;
    const key = cap ? S.act + ':' + cap.from : '';
    const el = $('caption');
    if (key !== capKey) {
      capKey = key;
      if (cap) {
        el.innerHTML = `<div class="c1">${cap.lines[0]}</div>` + (cap.lines[1] ? `<div class="c2">${cap.lines[1]}</div>` : '');
        el.classList.toggle('imagined', act.id === 'vision');
      }
      el.classList.toggle('show', !!cap);
    }
    const L = Director.look;
    $('btn-recenter').hidden = Math.abs(L.yaw) + Math.abs(L.pitch) + Math.abs(L.zoom) * 0.02 < 0.12;
  }

  // ------------------------------------------------------------- init
  function init(a) {
    app = a;
    store.load();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !localStorage.getItem('dgl-prefs')) prefs.reduced = true;
    buildProgress();
    bindProgress();
    buildToc();
    buildFree();
    buildSettings();
    if (Speech.embedded()) {
      $('voice-file-note').textContent = `本页已内置朗诵音轨“${Speech.embedded()}”，朗读默认开启。也可载入其他音频替换，或点“清除”改用浏览器语音。`;
      $('voice-clear').hidden = false;
    }
    voiceStore.load().then((r) => {
      if (!r || !r.blob || Speech.custom) return;
      storedVoice = r;
      $('voice-file-note').textContent = `已记住上次载入的“${r.name}”，朗读时自动使用。`;
      $('voice-clear').hidden = false;
    });
    bindCanvas();
    bindKeys();
    applyTextMode();
    Narrative.setPace(prefs.pace);
    // buttons
    $('btn-enter').addEventListener('click', () => app.startTour());
    $('btn-free').addEventListener('click', () => app.enterFree());
    $('btn-l-speech').addEventListener('click', toggleSpeech);
    $('btn-l-sound').addEventListener('click', toggleSound);
    $('btn-l-settings').addEventListener('click', () => openDrawer('settings'));
    $('btn-play').addEventListener('click', () => { if (Narrative.S.awaiting) Narrative.continueChapter(); else Narrative.toggle(); });
    $('btn-prev').addEventListener('click', () => Narrative.prev());
    $('btn-next').addEventListener('click', () => { if (Narrative.S.awaiting) Narrative.continueChapter(); else Narrative.next(); });
    $('btn-continue').addEventListener('click', () => Narrative.continueChapter());
    $('btn-pace').addEventListener('click', () => {
      prefs.pace = Narrative.S.pace === 'chapter' ? 'continuous' : 'chapter';
      Narrative.setPace(prefs.pace);
      store.save();
      toast(prefs.pace === 'chapter' ? '逐章慢读：每幕读完后停下，点“继续”进入下一幕' : '连贯体验：各幕自动接续', 2400);
    });
    $('btn-text').addEventListener('click', () => {
      prefs.text = { both: 'orig', orig: 'vern', vern: 'both' }[prefs.text];
      applyTextMode();
      store.save();
    });
    $('btn-toc').addEventListener('click', () => openDrawer($('toc').hidden ? 'toc' : null));
    $('toc-close').addEventListener('click', closeDrawers);
    $('settings-close').addEventListener('click', closeDrawers);
    $('btn-speech').addEventListener('click', toggleSpeech);
    $('btn-sound').addEventListener('click', toggleSound);
    $('btn-f-sound').addEventListener('click', toggleSound);
    $('btn-more').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('btn-more')); });
    $('btn-f-more').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('btn-f-more')); });
    $('btn-recenter').addEventListener('click', () => Director.recenter());
    $('m-recenter').addEventListener('click', () => { $('more').hidden = true; if (Narrative.S.mode === 'tour') Director.recenter(); else app.resetFree(); });
    $('m-hide').addEventListener('click', () => setHidden(true));
    $('m-shot').addEventListener('click', () => { $('more').hidden = true; capture(); });
    $('m-freeze').addEventListener('click', () => { $('more').hidden = true; const f = app.toggleFreeze(); toast(f ? '已暂停风、水、云与飞鸟的动态' : '动态已恢复', 2000); });
    $('m-settings').addEventListener('click', () => openDrawer('settings'));
    $('m-exit').addEventListener('click', () => { $('more').hidden = true; app.enterFree(); });
    $('m-tour').addEventListener('click', () => { $('more').hidden = true; app.startTour(); });
    $('btn-f-enter').addEventListener('click', () => app.startTour());
    $('btn-f-reset').addEventListener('click', () => app.resetFree());
    $('btn-again').addEventListener('click', () => { showEnding(false); app.startTour(); });
    $('btn-end-free').addEventListener('click', () => { showEnding(false); app.enterFree(); });
    $('btn-end-stay').addEventListener('click', () => showEnding(false));
    $('showui').addEventListener('click', () => setHidden(false));
    $('pop-close').addEventListener('click', hidePop);
    $('shot-close').addEventListener('click', () => { $('shot').hidden = true; });
    document.addEventListener('click', (e) => {
      if (!$('more').hidden && !e.target.closest('#more')) $('more').hidden = true;
    });
    Narrative.on((type, data) => {
      if (type === 'act') { renderAct(data.act); if (!Narrative.S.ended) showEnding(false); }
      if (type === 'state') syncState();
      if (type === 'ended') showEnding(true);
      if (type === 'mode') showMode(data);
      if (type === 'awaiting') syncState();
    });
    Speech.init((msg) => { toast(msg, 6000); setSpeechUI(Speech.enabled()); });
    bindAudioDefaults();
    syncState();
    return prefs;
  }

  function capture() {
    const url = app.capture();
    if (!url) { toast('截图失败：浏览器没有返回画面数据。'); return; }
    $('shot-img').src = url;
    const a = $('shot-dl');
    // a same-origin blob: URL keeps the download attribute's filename (data: URLs lose it)
    if (a.dataset.blob) URL.revokeObjectURL(a.dataset.blob);
    a.dataset.blob = '';
    a.href = url;
    try {
      const bin = atob(url.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      a.href = a.dataset.blob = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    } catch (e) { /* keep the data: URL */ }
    const d = new Date();
    a.download = `登鹳雀楼-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.png`;
    $('shot').hidden = false;
  }

  // Inside the claude.ai artifact viewer plain download links are blocked;
  // there the save goes through the host's downloads capability instead.
  let hostDownloads = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then((d) => { hostDownloads = d; }, () => {});
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('#shot-dl');
    if (!a || !hostDownloads) return;
    e.preventDefault();
    fetch(a.href).then((r) => r.blob())
      .then((blob) => hostDownloads.save({ filename: a.download || '登鹳雀楼.png', data: blob }))
      .then(() => toast('画面已保存。'), (err) => {
        if (err && err.code === 'declined') return;
        toast('无法保存文件，可右键（或长按）图片另存。');
      });
  });

  return { init, frame, showMode, showObject, toast, hidePop, setHidden, syncState, showEnding, prefs };
})();
