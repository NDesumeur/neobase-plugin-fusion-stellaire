// Fusion stellaire : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Fusion stellaire</span><span class=\"hint\" id=\"fuInfo\"></span><div class=\"agNav\"><select class=\"f gSel\" id=\"fuMode\" title=\"Mode de jeu\"></select><button class=\"btn px\" id=\"fuUndoBtn\" title=\"Annule le dernier coup (U)\">ANNULER</button><button class=\"btn px\" id=\"fuHoleBtn\" title=\"Échange deux tuiles (T)\">TROU DE VER</button><button class=\"btn main px\" id=\"fuNew\">NOUVELLE PARTIE</button></div></div>\n      <div class=\"gameBox tall fuBox\"><canvas id=\"fuCanvas\" width=\"240\" height=\"330\"></canvas></div>\n      <div class=\"hint\">Flèches, ZQSD ou glisser à la souris : toutes les tuiles glissent de ce côté. Deux astres pareils qui se rencontrent fusionnent en l'astre suivant : poussière, caillou, astéroïde, comète, lune, planète, planète à anneaux, géante gazeuse, étoile, supernova, trou noir. Les débris ne bougent pas et ne fusionnent pas : ils cassent quand une fusion se fait à côté. U : annuler le dernier coup · T : trou de ver (clique deux tuiles pour les échanger) · une charge de chaque tous les 150 coups et à chaque trou noir. La partie en cours est sauvegardée et synchronisée : tu la retrouves sur ton autre PC.</div>\n    </div>";
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  view.innerHTML = HTML;
  const $ = id => id === "fusionApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const LEGACY_GAMES = {"top":["fusion"],"best":"^fusion_"};
  let games = await doc('games');
  if (games == null) {  // première ouverture : tu retrouves tes records et tes parties d'avant
    const old = legacy.api ? await legacy.api('games').catch(() => null) : null; games = { best: {} };
    if (old) { const re = new RegExp(LEGACY_GAMES.best); for (const [k, v] of Object.entries(old.best || {})) if (re.test(k)) games.best[k] = v; for (const k of LEGACY_GAMES.top) if (old[k] !== undefined) games[k] = old[k]; await folder.write('games', games); }
  }
  games = { best: {}, ...games };
  let gamesTimer = null;
  const saveGames = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(() => { gamesTimer = null; folder.write('games', games).catch(() => {}); }, 500); };
  const best = (k, v, higher = true) => { const b = games.best[k]; if (b == null || (higher ? v > b : v < b)) { games.best[k] = v; saveGames(); return true; } return false; };
  const gstore = (k, init) => (games[k] ??= init);  // la section d'un jeu
function gameLoop(st, appKey, update, draw) {
  cancelAnimationFrame(st.raf);
  const STEP = 1000 / 60; let acc = 0, last = performance.now();
  const frame = t => {
    if (!view.classList.contains('on')) { st.raf = 0; if (st.mode === 'play') st.mode = 'pause'; return; }  // leaving the tab pauses the game
    st.raf = requestAnimationFrame(frame);
    acc += Math.min(200, t - last); last = t;
    while (acc >= STEP) { if (st.mode === 'play') update(); st.tick++; acc -= STEP; }
    draw();
  };
  st.raf = requestAnimationFrame(frame);
}
function gameText(g, w, lines, y0) {  // centred pixel-font lines over a dark band
  g.fillStyle = 'rgba(11,3,28,.72)'; g.fillRect(0, y0 - 14, w, lines.length * 14 + 14);
  g.textAlign = 'center';
  lines.forEach(([text, color, size], i) => { g.fillStyle = color; g.font = (size || 8) + 'px "Press Start 2P", monospace'; g.fillText(text, w / 2, y0 + i * 14); });
  g.textAlign = 'left';
}
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, rows, x, y, pal) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, c, x + i, y + j); } }); }
  // ---- ton code d'origine ----
/* ---------- jeu "Fusion stellaire": slide every tile of the board at once (arrows, ZQSD or a swipe of the mouse); two identical celestial
   objects that meet fuse into the next one: dust, pebble, asteroid, comet, moon, planet, ringed planet, gas giant, star, supernova, black hole.
   Debris can't fuse but breaks when a fusion happens next to it. Powers: undo, and the wormhole that swaps two tiles. Modes: Galaxie 5 x 5,
   Nébuleuse 4 x 4 (harder) and 15 challenges. Records, stars and the game in progress are kept in games.json (synced). ---------- */
const FU = {W: 240, H: 330,
  stages: [  // name, main colour, light, dark
    ['Poussière', '#c9bdf0', '#ffffff', '#6a5a9a'], ['Caillou', '#a08a70', '#d8c4a8', '#5a4632'], ['Astéroïde', '#8f8fa8', '#d0d0e0', '#4a4a60'], ['Comète', '#7fe0ee', '#e0ffff', '#2a8a9e'],
    ['Lune', '#e8e4d0', '#ffffff', '#8a8670'], ['Planète', '#4f9fe0', '#a8dcff', '#1f4a8a'], ['Planète à anneaux', '#e0a050', '#ffd9a0', '#8a5020'], ['Géante gazeuse', '#e07a4f', '#ffc0a0', '#8a3a1c'],
    ['Étoile', '#ffd07a', '#fff8d0', '#c08020'], ['Supernova', '#ff5ad9', '#ffd0f4', '#a0207e'], ['Trou noir', '#1c1238', '#b46aee', '#05010b'],
  ],
};
// the challenges: [name, size, goal, start]
const FU_LEVELS = [
  ['Premières lunes', 5, {stage: 4, moves: 120}, {}], ['Ménage spatial', 5, {debris: 3}, {debris: 3}], ['Planète bleue', 5, {stage: 5, moves: 200}, {}], ['Petit univers', 4, {score: 1500}, {}],
  ['Ceinture', 5, {debris: 6}, {debris: 6}], ['Anneaux', 5, {stage: 6, moves: 380}, {}], ['Étroit', 4, {stage: 5}, {}], ['Champ de débris', 5, {debris: 9}, {debris: 8}],
  ['Géante', 5, {stage: 7}, {debris: 2}], ['Course aux points', 5, {score: 12000, moves: 500}, {}], ['Nébuleuse dense', 4, {stage: 6}, {debris: 1}], ['Naissance d\'une étoile', 5, {stage: 8}, {}],
  ['Chaos', 5, {debris: 14}, {debris: 10}], ['Supernova', 5, {stage: 9}, {debris: 3}], ['Horizon', 5, {stage: 10}, {}],
];
const fuSave = () => gstore('fusion', {best: {}, maxStage: 0, stars: {}, games: 0, cur: null});
let fu = null;
const fuGoalText = g => g.stage != null ? FU.stages[g.stage][0] + (g.moves ? ' en ' + g.moves + ' coups' : '') : g.debris ? 'Casser ' + g.debris + ' débris' : g.score + ' points' + (g.moves ? ' en ' + g.moves + ' coups' : '');
function fuStart(kind = 'galaxie', level = 0, resume = null) {
  const lv = kind === 'defi' ? FU_LEVELS[level] : null, n = lv ? lv[1] : kind === 'nebuleuse' ? 4 : 5;
  fu = {raf: fu?.raf || 0, g: $('fuCanvas').getContext('2d'), mode: 'play', kind, level, lv, goal: lv?.[2] || null, n, tick: 0,
    grid: Array.from({length: n * n}, () => null), score: 0, moves: 0, best: 0, broken: 0, undo: [], undos: 2, holes: 1, picking: null, seq: 1,
    anim: 0, slides: [], pops: [], parts: [], flash: 0, banner: null, won: false, reached: {}};
  if (resume) Object.assign(fu, resume, {g: fu.g, raf: fu.raf, mode: 'play', anim: 0, slides: [], pops: [], parts: []});
  else {
    for (let i = 0; i < (lv?.[3].debris || 0); i++) fuSpawn({debris: true});
    fuSpawn(); fuSpawn();
  }
  fuStore(); fuInfo(); fuMenu();
  gameLoop(fu, 'neodyme:fusion', fuUpdate, fuDraw);
}
function fuStore() { if (!fu || !games || fu.kind === 'test') return; const s = fuSave(); s.cur = fu.mode === 'over' ? null : {kind: fu.kind, level: fu.level, grid: fu.grid, score: fu.score, moves: fu.moves, broken: fu.broken, undos: fu.undos, holes: fu.holes, seq: fu.seq, best: fu.best, reached: fu.reached}; saveGames(); }
function fuSpawn(o = {}) {
  const free = fu.grid.map((t, i) => t ? -1 : i).filter(i => i >= 0); if (!free.length) return;
  const i = free[Math.floor(Math.random() * free.length)];
  fu.grid[i] = o.debris ? {id: fu.seq++, debris: true, born: fu.tick} : {id: fu.seq++, s: Math.random() < .12 ? 1 : 0, born: fu.tick};
}
// one move: tiles slide to the side, two equal ones fuse once per move; returns false when nothing moved
function fuMove(dir) {
  if (fu.mode !== 'play' || fu.anim) return false;
  const n = fu.n, before = JSON.stringify(fu.grid), at = (a, b) => dir === 'left' ? a * n + b : dir === 'right' ? a * n + (n - 1 - b) : dir === 'up' ? b * n + a : (n - 1 - b) * n + a;
  const snap = {grid: JSON.parse(before), score: fu.score, moves: fu.moves, broken: fu.broken};
  const slides = [], fused = [];
  for (let a = 0; a < n; a++) {
    const line = [], from = [];
    for (let b = 0; b < n; b++) { const t = fu.grid[at(a, b)]; if (t) { line.push(t); from.push(b); } }
    const out = [];
    // debris stay where they are: they cut the line into parts that slide on their own
    let seg = [], segFrom = [], start = 0;
    const flush = end => {
      let pos = start;
      for (let k = 0; k < seg.length; k++) {
        const t = seg[k], nx = seg[k + 1];
        if (nx && nx.s === t.s && t.s < FU.stages.length - 1) { const m = {id: fu.seq++, s: t.s + 1, born: fu.tick, merged: true}; out[pos] = m; slides.push([t, segFrom[k], pos, a], [nx, segFrom[k + 1], pos, a]); fused.push([pos, a, m.s]); k++; }
        else { out[pos] = t; slides.push([t, segFrom[k], pos, a]); }
        pos++;
      }
      start = end + 1;
    };
    line.forEach((t, k) => { if (t.debris) { flush(from[k]); out[from[k]] = t; slides.push([t, from[k], from[k], a]); start = from[k] + 1; seg = []; segFrom = []; return; } seg.push(t); segFrom.push(from[k]); });
    flush(n);
    for (let b = 0; b < n; b++) fu.grid[at(a, b)] = out[b] || null;
  }
  if (JSON.stringify(fu.grid) === before) return false;
  fu.undo.push(snap); if (fu.undo.length > 3) fu.undo.shift();
  fu.moves++;
  // fusions: points, records, and the debris around them break
  for (const [b, a, s] of fused) {
    fu.score += 2 ** (s + 1) * 2;
    const i = at(a, b), x = i % n, y = i / n | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy, j = Y * n + X; if (X >= 0 && Y >= 0 && X < n && Y < n && fu.grid[j]?.debris) { fu.grid[j] = null; fu.broken++; fuBurst(X, Y, '#8f8fa8', 10); } }
    if (s > fu.best) { fu.best = s; if (s >= 4 && !fu.reached[s]) { fu.reached[s] = true; fu.banner = {text: FU.stages[s][0].toUpperCase() + ' !', t: 90}; } }
    if (s >= 6) fuBurst(x, y, FU.stages[s][0] === 'Supernova' ? '#ff5ad9' : FU.stages[s][1], 6 + s * 2);
    if (s === 9) fu.flash = 20;
    if (s === FU.stages.length - 1) fu.undos++, fu.holes++;  // a black hole gives a charge of each power
  }
  // a new tile; in Galaxie and Nébuleuse a debris now and then; a power charge every 150 moves
  fuSpawn(); if (!fu.lv && fu.moves % 30 === 0) fuSpawn({debris: true});
  if (fu.moves % 150 === 0) { fu.undos++; fu.holes++; }
  fu.slides = slides; fu.anim = 7;
  sfx(fused.length ? (fused.some(f => f[2] >= 6) ? 'launch' : 'notify') : 'type');
  fuCheck(); fuStore(); fuInfo();
  return true;
}
// a move exists when a tile has an empty cell beside it, or an equal neighbour to fuse with
function fuCanMove() {
  const n = fu.n;
  return fu.grid.some((t, i) => t && !t.debris && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const X = i % n + dx, Y = (i / n | 0) + dy; if (X < 0 || Y < 0 || X >= n || Y >= n) return false;
    const o = fu.grid[Y * n + X]; return !o || (!o.debris && o.s === t.s && t.s < FU.stages.length - 1);
  }));
}
function fuCheck() {
  const g = fu.goal, s = fuSave();
  s.maxStage = Math.max(s.maxStage, fu.best);
  if (g) {
    const done = g.stage != null ? fu.best >= g.stage : g.debris ? fu.broken >= g.debris : fu.score >= g.score;
    if (done) return fuOver(true);
    if (g.moves && fu.moves >= g.moves) return fuOver(false);
  }
  if (!fuCanMove()) fuOver(false);
}
function fuOver(won) {
  fu.mode = 'over'; fu.won = won;
  const s = fuSave(); s.games++;
  if (fu.kind === 'defi') {
    if (won) { const g = fu.goal, par = g.moves ? fu.moves < g.moves * .7 : fu.moves < 60 + fu.level * 40; fu.got = 1 + (fu.undo.length === 0 || fu.undos >= 2 ? 1 : 0) + (par ? 1 : 0); s.stars[fu.level] = Math.max(s.stars[fu.level] || 0, fu.got); sfx('launch'); }
    else sfx('error');
  } else { fu.record = best('fusion_' + fu.kind, fu.score); sfx(fu.record ? 'launch' : 'error'); }
  s.cur = null; saveGames(); fuInfo(); fuMenu();
}
function fuUndo() {
  if (fu.mode !== 'play' || !fu.undos || !fu.undo.length || fu.anim) return;
  Object.assign(fu, fu.undo.pop()); fu.undos--; fu.picking = null; sfx('click'); fuStore(); fuInfo();
}
function fuHole(i) {  // the wormhole: pick two tiles, they swap places
  if (fu.mode !== 'play' || !fu.holes) return;
  if (fu.picking == null) { if (fu.grid[i] && !fu.grid[i].debris) { fu.picking = i; sfx('click'); } return; }
  const a = fu.picking; fu.picking = null;
  if (a === i || !fu.grid[i] || fu.grid[i].debris) return;
  fu.undo.push({grid: JSON.parse(JSON.stringify(fu.grid)), score: fu.score, moves: fu.moves, broken: fu.broken});
  [fu.grid[a], fu.grid[i]] = [fu.grid[i], fu.grid[a]]; fu.holes--; fu.holeMode = false; sfx('notify'); fuStore(); fuInfo();
}
function fuBurst(x, y, col, n) { const L = fuLayout(); for (let k = 0; k < n; k++) fu.parts.push({x: L.x + x * L.c + L.c / 2, y: L.y + y * L.c + L.c / 2, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, t: 30 + Math.random() * 20, col}); }
function fuUpdate() {
  if (fu.anim) fu.anim--;
  if (fu.flash) fu.flash--;
  if (fu.banner && --fu.banner.t <= 0) fu.banner = null;
  for (const p of fu.parts) { p.x += p.vx; p.y += p.vy; p.vx *= .96; p.vy *= .96; p.t--; } fu.parts = fu.parts.filter(p => p.t > 0);
}
/* ---------- drawing: each celestial object is drawn in pixels, bigger and brighter as it grows ---------- */
const fuLayout = () => { const c = fu.n === 4 ? 50 : 42, w = c * fu.n; return {c, x: (FU.W - w) / 2, y: 62, w}; };
const fuSprites = {};
function fuSprite(s, size) {  // drawn once per stage and size, on a small canvas
  const k = s + ':' + size; if (fuSprites[k]) return fuSprites[k];
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'), [, base, lt, dk] = FU.stages[s], m = size / 2;
  const disc = (r, fill, shade = true) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const dx = x + .5 - m, dy = y + .5 - m, d = Math.hypot(dx, dy); if (d <= r) { const l = (dx + dy) / r; g.fillStyle = !shade ? fill : d > r - 1.2 ? dk : l < -.55 ? lt : l > .45 ? dk : fill; g.fillRect(x, y, 1, 1); } } };
  const dots = (n, r, col, seed) => { for (let i = 0; i < n; i++) { const a = seed + i * 2.399, d = r * (.25 + (i * .37 % .6)); g.fillStyle = col; g.fillRect(Math.round(m + Math.cos(a) * d) - 1, Math.round(m + Math.sin(a) * d) - 1, 2, 2); } };
  if (s === 0) { for (let i = 0; i < 9; i++) { const a = i * 2.4, d = 3 + (i * 7 % 9); g.fillStyle = i % 3 ? base : lt; g.fillRect(Math.round(m + Math.cos(a) * d), Math.round(m + Math.sin(a) * d), 2, 2); } }
  else if (s === 1) { disc(size * .22, base); dots(3, size * .16, dk, 1); }
  else if (s === 2) { disc(size * .3, base); dots(5, size * .24, dk, 2); g.fillStyle = lt; g.fillRect(m - 4, m - 5, 2, 2); }
  else if (s === 3) { for (let i = 0; i < size * .5; i++) { g.fillStyle = i % 2 ? lt : base; g.globalAlpha = 1 - i / (size * .5); g.fillRect(m + 3 + i, m - 3 - i * .6, 2, 2); } g.globalAlpha = 1; disc(size * .2, base); }
  else if (s === 4) { disc(size * .32, base); dots(6, size * .26, '#c0bca0', 4); }
  else if (s === 5) { disc(size * .36, base); g.fillStyle = '#5fd08a'; for (const [x, y, w, h] of [[-6, -4, 6, 3], [1, 2, 7, 4], [-3, 6, 4, 2]]) g.fillRect(m + x, m + y, w, h); }
  else if (s === 6) { disc(size * .3, base); g.fillStyle = lt; for (let x = -size * .48; x < size * .48; x++) { const y = Math.round(x * .28); if (Math.abs(x) > size * .26 || y > 0) g.fillRect(Math.round(m + x), Math.round(m + y), 1, 2); } }
  else if (s === 7) { disc(size * .4, base); for (const [y, c] of [[-6, lt], [-1, dk], [4, lt], [8, dk]]) { g.fillStyle = c; for (let x = -size; x < size; x++) { const X = Math.round(m + x), Y = Math.round(m + y); if (Math.hypot(x, y) < size * .38) g.fillRect(X, Y, 1, 2); } } }
  else if (s === 8) { for (let r = size * .46; r > size * .3; r -= 1) disc(r, r > size * .4 ? 'rgba(255,208,122,.25)' : '#ffe8a8', false); disc(size * .3, base, false); g.fillStyle = '#fff8d0'; g.fillRect(m - 3, m - 3, 4, 4); }
  else if (s === 9) { for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, L = size * (i % 2 ? .34 : .48); g.fillStyle = i % 2 ? lt : base; for (let d = size * .18; d < L; d++) g.fillRect(Math.round(m + Math.cos(a) * d), Math.round(m + Math.sin(a) * d), 2, 2); } disc(size * .2, '#ffffff', false); }
  else { for (let r = size * .48; r > size * .22; r -= 1) disc(r, (r / size * 40 | 0) % 2 ? '#b46aee' : '#5e2aa0', false); disc(size * .22, '#05010b', false); g.fillStyle = '#e4c8ff'; g.fillRect(m - 1, m - size * .36, 2, 2); }
  return (fuSprites[k] = cv);
}
function fuDebris(g, x, y, c, t) {
  g.fillStyle = '#3a3448'; g.fillRect(x + 6, y + 6, c - 12, c - 12);
  g.fillStyle = '#5a5470'; g.fillRect(x + 8, y + 8, c - 18, c - 18);
  g.fillStyle = '#1c1830'; for (const [a, b] of [[10, 14], [c - 16, 11], [14, c - 14], [c - 13, c - 16]]) g.fillRect(x + a, y + b, 3, 3);
  g.fillStyle = '#8f8fa8'; g.fillRect(x + 9, y + 9, 3, 2);
  if ((t + x) % 120 < 4) { g.fillStyle = '#ff7a4f'; g.fillRect(x + c - 12, y + 9, 2, 2); }
}
function fuDraw() {
  const g = fu.g, t = fu.tick, L = fuLayout(), c = L.c, n = fu.n;
  g.fillStyle = '#0b031c'; g.fillRect(0, 0, FU.W, FU.H);
  for (let i = 0; i < 60; i++) { const x = (i * 97) % FU.W, y = (i * 53 + (t >> 3)) % FU.H; g.fillStyle = (i + (t >> 4)) % 7 ? 'rgba(217,198,255,.25)' : '#ffffff'; g.fillRect(x, y, 1, 1); }
  // header: score, best, powers
  g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#ff5ad9'; g.fillText('FUSION STELLAIRE', 12, 16);
  g.fillStyle = '#8f7bb8'; g.font = '6px "Press Start 2P", monospace'; g.fillText('SCORE', 12, 30); g.fillText(fu.goal ? 'OBJECTIF' : 'RECORD', 96, 30); g.fillText('COUPS', 186, 30);
  g.fillStyle = '#ffd07a'; g.font = '8px "Press Start 2P", monospace'; g.fillText(String(fu.score), 12, 42); g.fillText(String(fu.moves) + (fu.goal?.moves ? '/' + fu.goal.moves : ''), 186, 42);
  g.fillStyle = '#d9c6ff'; g.font = fu.goal ? '6px "Press Start 2P", monospace' : '8px "Press Start 2P", monospace';
  if (fu.goal) { const gg = fu.goal; g.fillText(gg.stage != null ? FU.stages[gg.stage][0] : gg.debris ? 'Débris ' + fu.broken + '/' + gg.debris : fu.score + '/' + gg.score, 96, 42); }
  else g.fillText(String(games?.best['fusion_' + fu.kind] ?? 0), 96, 42);
  // board
  g.fillStyle = '#1c1238'; g.fillRect(L.x - 4, L.y - 4, L.w + 8, L.w + 8);
  for (let i = 0; i < n * n; i++) { const x = L.x + (i % n) * c, y = L.y + (i / n | 0) * c; g.fillStyle = (i % n + (i / n | 0)) % 2 ? '#120a28' : '#160d30'; g.fillRect(x + 1, y + 1, c - 2, c - 2); }
  const k = fu.anim / 7;  // 1 at the start of a slide, 0 at the end
  const place = new Map(); for (const [tile, from, to, a] of fu.slides) place.set(tile.id, [from, to, a]);
  const posOf = (a, b) => { const d = fu.lastDir; return d === 'left' ? [b, a] : d === 'right' ? [n - 1 - b, a] : d === 'up' ? [a, b] : [a, n - 1 - b]; };
  // the tiles that moved (or fused) are drawn sliding from where they were
  if (fu.anim) for (const [tile, from, to, a] of fu.slides) {
    const [x0, y0] = posOf(a, from), [x1, y1] = posOf(a, to), x = L.x + (x1 + (x0 - x1) * k) * c, y = L.y + (y1 + (y0 - y1) * k) * c;
    fuTile(g, tile, x, y, c, t, 1);
  }
  for (let i = 0; i < n * n; i++) {
    const tile = fu.grid[i]; if (!tile) continue;
    if (fu.anim && (place.has(tile.id) || tile.merged && fu.tick - tile.born < 7)) continue;
    const x = L.x + (i % n) * c, y = L.y + (i / n | 0) * c, age = fu.tick - tile.born, sc = age < 8 ? .4 + age / 8 * .6 : tile.merged && age < 16 ? 1 + Math.sin((age - 8) / 8 * Math.PI) * .15 : 1;
    fuTile(g, tile, x, y, c, t, sc);
    if (fu.picking === i) { g.strokeStyle = '#7fe0ee'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, c - 4, c - 4); }
  }
  for (const p of fu.parts) { g.fillStyle = p.col; g.fillRect(p.x | 0, p.y | 0, 2, 2); }
  if (fu.flash) { g.fillStyle = `rgba(255,208,244,${fu.flash / 40})`; g.fillRect(0, 0, FU.W, FU.H); }
  // the chain of objects at the bottom, the reached ones lit
  const cy = L.y + L.w + 14, step = (FU.W - 24) / FU.stages.length;
  FU.stages.forEach((st, s) => { g.globalAlpha = s <= Math.max(fu.best, fuSave().maxStage) ? 1 : .25; g.drawImage(fuSprite(s, 16), 12 + s * step + step / 2 - 8, cy); g.globalAlpha = 1; });
  g.fillStyle = '#8f7bb8'; g.font = '6px "Press Start 2P", monospace'; g.textAlign = 'center';
  g.fillText('ANNULER (U) x' + fu.undos + '   ·   TROU DE VER (T) x' + fu.holes, FU.W / 2, cy + 30);
  if (fu.holeMode || fu.picking != null) { g.fillStyle = '#7fe0ee'; g.fillText(fu.picking == null ? 'CLIQUE SUR UNE TUILE' : 'PUIS SUR UNE AUTRE', FU.W / 2, 56); }
  g.textAlign = 'left';
  if (fu.banner) gameText(g, FU.W, [[fu.banner.text, '#ffd07a', 9]], L.y + L.w / 2);
  if (fu.mode === 'pause') gameText(g, FU.W, [['PAUSE', '#ffd07a', 10], ['UNE FLÈCHE POUR REPRENDRE', '#d9c6ff', 7]], 150);
  if (fu.mode === 'over') {
    gameText(g, FU.W, fu.kind === 'defi' ? (fu.won ? [['DÉFI RÉUSSI', '#8ee8a0', 10], ['', '#fff', 8], [fu.level < FU_LEVELS.length - 1 ? 'ESPACE : DÉFI SUIVANT' : 'TOUS LES DÉFIS !', '#ffffff', 7]] : [['RATÉ', '#ff4f6d', 10], [fu.score + ' POINTS', '#ffd07a', 8], ['ESPACE : RÉESSAYER', '#ffffff', 7]])
      : [['PLUS DE COUP', '#ff4f6d', 10], [fu.score + ' POINTS' + (fu.record ? ' · RECORD !' : ''), '#ffd07a', 8], ['ESPACE : NOUVELLE PARTIE', '#ffffff', 7]], 140);
    if (fu.won) for (let i = 0; i < 3; i++) sprite(g, CA_STAR, FU.W / 2 - 22 + i * 16, 148, {y: i < fu.got ? '#ffd07a' : '#3a2a6e', w: i < fu.got ? '#fff5d0' : '#5e4d85'});
  }
}
function fuTile(g, tile, x, y, c, t, sc) {
  if (tile.debris) return fuDebris(g, x, y, c, t);
  const [, base] = FU.stages[tile.s], size = Math.round(c * .9);
  g.fillStyle = base + '22'; g.fillRect(x + 3, y + 3, c - 6, c - 6);  // a halo of its colour
  const spr = fuSprite(tile.s, size), d = size * sc;
  g.imageSmoothingEnabled = false; g.drawImage(spr, Math.round(x + (c - d) / 2), Math.round(y + (c - d) / 2), Math.round(d), Math.round(d));
}
/* ---------- input ---------- */
function fuGo(dir) { if (!fu) return; if (fu.mode === 'pause') fu.mode = 'play'; if (fuMove(dir)) fu.lastDir = dir; }
document.addEventListener('keydown', e => {
  if (!view.classList.contains('on') || !fu || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, dir = {ArrowLeft: 'left', q: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', z: 'up', w: 'up', ArrowDown: 'down', s: 'down'}[k];
  if (dir) { e.preventDefault(); fuGo(dir); return; }
  if (k === 'u' || (e.ctrlKey && k === 'z')) fuUndo();
  else if (k === 't') { if (fu.holes) { fu.holeMode = !fu.holeMode; fu.picking = null; } }
  else if ((k === ' ' || k === 'Enter') && fu.mode === 'over') { e.preventDefault(); fuNext(); }
  else if (k === 'p' || k === 'Escape') { if (fu.mode === 'play') fu.mode = 'pause'; }
});
function fuNext() { const next = fu.won && fu.kind === 'defi' && fu.level < FU_LEVELS.length - 1; fuStart(fu.kind, fu.level + (next ? 1 : 0)); }
// mouse: a swipe moves the tiles; a click picks the tiles of the wormhole
$('fuCanvas').onpointerdown = e => {
  if (!fu) return;
  const cv = $('fuCanvas'), r = cv.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
  cv.setPointerCapture(e.pointerId);
  cv.onpointerup = u => {
    cv.onpointerup = null;
    const dx = u.clientX - sx, dy = u.clientY - sy, kk = cv.width / r.width;
    if (Math.hypot(dx, dy) * kk > 14) return fuGo(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    if (fu.mode === 'over') return fuNext();
    if (!fu.holeMode && fu.picking == null) return;
    const L = fuLayout(), X = Math.floor(((u.clientX - r.left) * kk - L.x) / L.c), Y = Math.floor(((u.clientY - r.top) * kk - L.y) / L.c);
    if (X >= 0 && Y >= 0 && X < fu.n && Y < fu.n) fuHole(Y * fu.n + X);
  };
};
/* ---------- page ---------- */
function fuInfo() { const s = fuSave(); $('fuInfo').textContent = 'Records : galaxie ' + (games?.best.fusion_galaxie ?? 0) + ' · nébuleuse ' + (games?.best.fusion_nebuleuse ?? 0) + ' · plus loin : ' + FU.stages[s.maxStage][0] + ' · défis ' + Object.values(s.stars).reduce((a, b) => a + b, 0) + ' / ' + FU_LEVELS.length * 3 + ' ★'; }
function fuMenu() {
  const s = fuSave(), sel = $('fuMode');
  sel.replaceChildren(Object.assign(el('option', '', 'Galaxie · 5 × 5'), {value: 'galaxie'}), Object.assign(el('option', '', 'Nébuleuse · 4 × 4'), {value: 'nebuleuse'}),
    ...FU_LEVELS.map(([nm, size, goal], i) => Object.assign(el('option', '', 'Défi ' + (i + 1) + ' · ' + nm + ' · ' + fuGoalText(goal) + (size === 4 ? ' · 4 × 4' : '') + (s.stars[i] ? ' · ' + '★'.repeat(s.stars[i]) : '') + (i && !s.stars[i - 1] && !s.stars[i] ? ' 🔒' : '')), {value: 'd' + i, disabled: !!(i && !s.stars[i - 1] && !s.stars[i])})));
  sel.value = fu ? (fu.kind === 'defi' ? 'd' + fu.level : fu.kind) : 'galaxie';
}
function fuOpen() {
  if (fu) { gameLoop(fu, 'neodyme:fusion', fuUpdate, fuDraw); fuInfo(); return; }
  const c = fuSave().cur;  // the game in progress, here or on another PC
  if (c?.grid) fuStart(c.kind, c.level, c); else fuStart('galaxie');
}
$('fuMode').onchange = () => { const v = $('fuMode').value; fuStart(v.startsWith('d') ? 'defi' : v, v.startsWith('d') ? +v.slice(1) : 0); $('fuMode').blur(); };
$('fuNew').onclick = () => { fuStart(fu?.kind || 'galaxie', fu?.level || 0); $('fuNew').blur(); };
$('fuUndoBtn').onclick = () => { fuUndo(); $('fuUndoBtn').blur(); };
$('fuHoleBtn').onclick = () => { if (fu?.holes) { fu.holeMode = !fu.holeMode; fu.picking = null; } $('fuHoleBtn').blur(); };
{  // self-check of a move: equal tiles fuse once, debris stop the slide and break next to a fusion
  const keep = fu;
  fu = {n: 4, grid: Array(16).fill(null), mode: 'play', anim: 0, seq: 100, tick: 0, score: 0, moves: 0, broken: 0, best: 0, undo: [], undos: 2, holes: 1, reached: {}, parts: [], lv: {}, goal: null, kind: 'test'};
  const T = s => ({id: fu.seq++, s});
  fu.grid[0] = T(0); fu.grid[1] = T(0); fu.grid[2] = T(0); fu.grid[3] = T(0);      // 4 dusts in a row -> 2 pebbles
  fu.grid[4] = T(1); fu.grid[5] = {id: 1, debris: true}; fu.grid[6] = T(2); fu.grid[7] = T(2);  // a debris keeps its place, the two asteroids fuse and break it
  const real = {fuSpawn, fuInfo, fuCheck}; fuSpawn = fuInfo = fuCheck = () => {};
  try { fuMove('left'); } finally { ({fuSpawn, fuInfo, fuCheck} = real); }
  console.assert(fu.grid[0]?.s === 1 && fu.grid[1]?.s === 1 && !fu.grid[2] && fu.grid[4]?.s === 1 && !fu.grid[5]?.debris && fu.grid[6]?.s === 3 && fu.broken === 1 && fu.score === 4 * 2 * 2 + 16 * 2, 'fusion move');
  fu = keep;
}  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { fuOpen(); });
}
