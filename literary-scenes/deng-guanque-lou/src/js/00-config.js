/* ==========================================================================
 * 00-config.js — the poem, its chapters (幕), glossary, scene notes,
 * viewpoints and quality presets. Pure data: no rendering code here.
 * ========================================================================== */
const POEM = {
  title: '登鹳雀楼',
  dynasty: '唐',
  author: '王之涣',
  // Original text (原文) — kept exactly as given.
  lines: [
    { text: '白日依山尽', punct: '，', vern: '明亮的太阳依傍着西山，渐渐沉落；' },
    { text: '黄河入海流', punct: '。', vern: '黄河滚滚向东，奔流入海。' },
    { text: '欲穷千里目', punct: '，', vern: '想要望尽千里之外的风光，' },
    { text: '更上一层楼', punct: '。', vern: '那就再登上一层楼。' },
  ],
};

// Words that can be tapped in the subtitles for a short gloss.
const GLOSSARY = {
  '鹳雀楼': '故址在今山西永济蒲州古城西、黄河东岸。相传常有鹳雀栖息楼上，因而得名。北宋沈括《梦溪笔谈》：“河中府鹳雀楼三层，前瞻中条，下瞰大河。”',
  '白日': '明亮的太阳。',
  '依': '依傍，挨着。',
  '尽': '完，没有了。这里指太阳沉到山后。',
  '入海流': '奔流入海。',
  '欲': '想要。',
  '穷': '尽，使达到极点。“穷千里目”即把千里远的景物看尽。',
  '千里目': '能望到千里之远的目力，指开阔的眼界。',
  '更': '再。',
};

/* Chapters (幕). Durations are for the continuous mode; each scene's motion
 * is authored against these seconds in 21-staging.js / 22-director.js.
 * text: which original lines are shown; speech: what the reader recites and when.
 * where / doing: short, factual stage notes shown beside the chapter title. */
const ACTS = [
  {
    id: 'prologue', no: '序', name: '登楼', dur: 27,
    show: 'title',
    vern: '登上鹳雀楼。',
    where: '蒲州城西 · 黄河东岸',
    doing: '日暮时分，诗人来到楼下，拾级登楼',
    speech: { at: 2.4, items: ['登鹳雀楼', '唐　王之涣'] },
    captions: [{ from: 0.6, to: 8.5, lines: ['蒲州城西　黄河东岸', '日暮'] }],
  },
  {
    id: 'l1', no: '一', name: '白日依山尽', dur: 18,
    show: [0],
    where: '二层平坐 · 西望',
    doing: '诗人凭栏西望，夕阳贴着远山缓缓沉落',
    speech: { at: 6.5, items: [0] },
  },
  {
    id: 'l2', no: '二', name: '黄河入海流', dur: 22,
    show: [1],
    where: '俯瞰楼下大河',
    doing: '目光随河水南去，河道东折，隐入天际',
    speech: { at: 4.5, items: [1] },
    captions: [{ from: 14.5, to: 21.5, lines: ['大河南下，东折入海', '海在千里之外，目力难及'] }],
  },
  {
    id: 'l3', no: '三', name: '欲穷千里目', dur: 16,
    show: [2],
    where: '二层平坐',
    doing: '远方渐入暮霭，诗人仍想望得更远',
    speech: { at: 3.4, items: [2] },
  },
  {
    id: 'l4', no: '四', name: '更上一层楼', dur: 34,
    show: [3],
    where: '入楼登梯，至最高一层',
    doing: '诗人转身入楼，拾级而上，走到顶层凭栏远望',
    speech: { at: 2.0, items: [3] },
    captions: [{ from: 24.5, to: 33.5, lines: ['登高　望远'] }],
  },
  {
    id: 'vision', no: '五', name: '千里 · 心象', dur: 30,
    show: [0, 1, 2, 3],
    where: '想象之景（非目力所及）',
    doing: '心随大河东去，想见千里之外河海相接',
    speech: { at: 7.0, items: [0, 1, 2, 3], gap: 0.9 },
    // fallback highlight schedule when recitation is off
    lineCues: [7.0, 11.0, 15.0, 19.0],
    captions: [{ from: 3.2, to: 11.5, lines: ['心象 · 想象之景', '大河东去，终归于海'] }],
  },
  {
    id: 'coda', no: '尾', name: '余晖', dur: 20,
    show: [0, 1, 2, 3],
    where: '顶层 · 凭栏',
    doing: '日已落尽，城中灯火初上，鹳雀归巢',
    speech: null,
    lineCues: [1.5, 1.5, 1.5, 1.5],
    captions: [{ from: 2.0, to: 9.0, lines: ['暮色四合'] }],
  },
];

// Scene objects that can be tapped for a short note.
const OBJECT_INFO = {
  tower: {
    title: '鹳雀楼',
    line: '登鹳雀楼　·　更上一层楼',
    text: '《梦溪笔谈》载其“三层，前瞻中条，下瞰大河”。此处按唐代楼阁形制作艺术推演：外观三层四檐，下有高台，并非遗址复原。',
  },
  river: {
    title: '黄河',
    line: '黄河入海流',
    text: '大河从楼西自北向南流过，至远处东折，一路奔流入海。海在千里之外，诗人站在楼上并看不见。',
  },
  sun: {
    title: '白日',
    line: '白日依山尽',
    text: '明亮的太阳挨着西边的山峦，一点点沉落下去。',
  },
  mountains: {
    title: '中条山',
    line: '欲穷千里目',
    text: '在蒲州东南。《梦溪笔谈》说鹳雀楼“前瞻中条”，登楼可以望见。',
  },
  westhills: {
    title: '西山',
    line: '白日依山尽',
    text: '大河西岸的远山，夕阳正从这里落下。原文未写山名，这里不作指认。',
  },
  storks: {
    title: '鹳雀',
    line: '登鹳雀楼',
    text: '相传常有鹳雀栖息楼上，楼因此得名。画中所见是推演的点景。',
  },
  poet: {
    title: '王之涣',
    line: '〔唐〕王之涣',
    text: '盛唐诗人，字季凌。《全唐诗》存其诗六首，这首《登鹳雀楼》流传最广。画中衣冠为唐人常服的推演。',
  },
  city: {
    title: '蒲州城',
    line: '（原文未写）',
    text: '鹳雀楼在蒲州城西。城垣、街巷与灯火都是推演的背景，用来交代楼所在的环境。',
  },
};

// Hand-composed viewpoints for free viewing (自由观景).
const VIEWPOINTS = [
  { id: 'panorama', name: '楼外远眺', mode: 'orbit', target: [-6, 46, 2], pos: [132, 70, 38] },
  { id: 'front', name: '楼前', mode: 'orbit', target: [6, 44, 0], pos: [72, 40, -30] },
  { id: 'river', name: '河上望楼', mode: 'orbit', target: [0, 48, 0], pos: [-430, 30, 150] },
  { id: 'balcony', name: '二层西望', mode: 'look', pos: [-10.6, 47.3, -1.2], yaw: -1.9, pitch: 0.02 },
  { id: 'top', name: '顶层远眺', mode: 'look', pos: [-9.0, 56.7, 2.6], yaw: -2.35, pitch: -0.04 },
  { id: 'far', name: '南望大河', mode: 'orbit', target: [-300, 20, 1600], pos: [520, 260, -420] },
];

const QUALITY = {
  high: {
    label: '高画质', pixelRatioMax: 2, maxPixels: 3.8e6, msaa: 4,
    shadows: true, shadowSize: 2048, bloomLevels: 5, godrays: true,
    terrainK: 2.0, chunkN: 32, minLeaf: 128, treeDensity: 1, grass: true, cloudPuffs: 1,
  },
  light: {
    label: '轻量', pixelRatioMax: 1.25, maxPixels: 1.5e6, msaa: 0,
    shadows: true, shadowSize: 1024, bloomLevels: 3, godrays: false,
    terrainK: 1.6, chunkN: 16, minLeaf: 128, treeDensity: 0.45, grass: false, cloudPuffs: 0.55,
  },
};

// Keyboard map shown in the help line
const KEYS = { playPause: ' ', prev: 'ArrowLeft', next: 'ArrowRight', hideUI: 'h', toc: 't', recenter: 'r' };
