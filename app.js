'use strict';
/* Tournée des Calendriers — Amicale des Sapeurs-Pompiers de Seppois-le-Bas
   Secteur : Seppois-le-Bas, Largitzen, Mooslargue, Pfetterhouse, Ueberstrass.
   Web-app hors ligne (PWA). Adresses : Base Adresse Nationale. Plan : © contributeurs OpenStreetMap.
   Synchronisation d'équipe gratuite : une feuille Google Sheets (voir google-apps-script/Code.gs). */

// ═════════════════════════ Utilitaires
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (n, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sum = (arr, f = (x) => x) => arr.reduce((t, x) => t + (+f(x) || 0), 0);
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const fmtE0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtE2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const eur = (n) => (Math.abs(Math.round((n || 0) * 100)) % 100 === 0 ? fmtE0 : fmtE2).format(n || 0);
const nf = (n) => fmtN.format(n || 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const DOW = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const DOWL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MON = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function dayLabel(iso) {
  if (!iso) return 'Sans date';
  const t = isoDay();
  if (iso === t) return "Aujourd'hui";
  if (iso === addDays(t, 1)) return 'Demain';
  if (iso === addDays(t, -1)) return 'Hier';
  const d = new Date(iso + 'T12:00:00');
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}h${pad(d.getMinutes())}`; };
const dayShort = (ms) => { const d = new Date(ms); return isoDay(d) === isoDay() ? hhmm(ms) : `${d.getDate()} ${MON[d.getMonth()]}`; };
const vibrate = (ms = 12) => { try { navigator.vibrate?.(ms); } catch (e) { /* non pris en charge */ } };
const initials = (name) => (name || '?').trim().split(/[\s.-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const norm = (s) => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage plein ou bloqué */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } },
};
const K = { state: 'cal.state.v1', queue: 'cal.queue.v2', since: 'cal.since.v2', code: 'cal.code', me: 'cal.me', cfg: 'cal.cfg.v2', sheet: 'cal.sheet', mode: 'cal.mode', ui: 'cal.ui.v2', theme: 'cal.theme', welcomed: 'cal.welcomed' };

// ═════════════════════════ Données du secteur (5 communes)
const O_LAT = 47.5, O_LON = 7.1;
const decode = (a) => { const out = []; let y = 0, x = 0; for (let i = 0; i < a.length; i += 2) { y += a[i]; x += a[i + 1]; out.push([O_LAT + y / 1e5, O_LON + x / 1e5]); } return out; };
const COMMUNES = ADDR.c;
const comIdx = (com) => { const i = COMMUNES.indexOf(com); return i < 0 ? 99 : i; };
const skey = (com, street) => `${com}|${street}`;
const sortKey = (s) => norm(s.replace(/^(Rue|Impasse|Place|Chemin|Allée|Route)\s+(du |de la |de l'|des |de |d')?/i, ''));
const mkAddr = (id, com, street, n0, lat, lon, custom = false) => { const n = parseInt(n0, 10) || 0; return { id, com, ci: comIdx(com), street, sk: skey(com, street), num: String(n0), n, lat, lon, even: n % 2 === 0, custom }; };
const numCmp = (a, b) => a.n - b.n || a.num.localeCompare(b.num, 'fr', { numeric: true });
const BASE_ADDRS = ADDR.a.map(([id, si, n0, lat, lon]) => { const [ci, name] = ADDR.s[si]; return mkAddr(id, COMMUNES[ci], name, n0, lat, lon); });
const distM = (a, b) => { const kx = 111320 * Math.cos((a[0] * Math.PI) / 180); return Math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * 110540); };

// ═════════════════════════ Référentiels
const STATUS = {
  todo: { label: 'À faire', short: 'À faire', icon: 'todo' },
  done: { label: 'Calendrier donné', short: 'Donné', icon: 'check' },
  absent: { label: 'Absent', short: 'Absent', icon: 'absent' },
  repasse: { label: 'À repasser', short: 'Repasse', icon: 'repeat' },
  refus: { label: 'Refus', short: 'Refus', icon: 'ban' },
};
const ST_ORDER = ['done', 'absent', 'repasse', 'refus', 'todo'];
const ST_FILTER = ['todo', 'done', 'absent', 'repasse', 'refus'];
const OPEN = new Set(['todo', 'absent', 'repasse']);
const blankSt = () => ({ todo: 0, done: 0, absent: 0, repasse: 0, refus: 0 });
const PAY = { especes: 'Espèces', cheque: 'Chèque', cb: 'Carte bancaire', autre: 'Wero / virement' };
const PAY_SHORT = { especes: 'espèces', cheque: 'chèque', cb: 'CB', autre: 'Wero' };
const PAY_COLOR = { especes: '#D4A106', cheque: '#7C3AED', cb: '#2F6FE4', autre: '#0D9488' };
const SLOTS = { matin: 'Matin', midi: 'Midi', aprem: 'Après-midi', soir: 'Soir' };
const SLOT_SHORT = { matin: 'Matin', midi: 'Midi', aprem: 'Aprèm', soir: 'Soir' };
const PALETTE = ['#2F6FE4', '#7C3AED', '#0D9488', '#DB2777', '#CA8A04', '#4F46E5', '#EA580C', '#0891B2', '#65A30D', '#9333EA', '#BE123C', '#475569'];
const ZONE_COLORS = ['#7C3AED', '#0891B2', '#DB2777', '#0D9488', '#CA8A04', '#4F46E5', '#EA580C', '#65A30D', '#9333EA', '#BE123C', '#2F6FE4', '#475569'];
const AMOUNTS = [5, 10, 15, 20, 30];

// ═════════════════════════ Stockage local + mode démo
const EMPTY = () => ({ settings: { name: 'Calendriers 2027', year: 2027, goal: 15000, price: 10, u: 0 }, members: {}, zones: {}, passages: {}, extra: {}, bld: {} });
const KIND_COL = { passage: 'passages', member: 'members', zone: 'zones', addr: 'extra', bld: 'bld' };

const Store = {
  live: null, demo: null, mode: 'live', rev: 0, _t: 0,
  init() {
    this.live = Object.assign(EMPTY(), LS.get(K.state, null) || {});
    for (const k of Object.values(KIND_COL)) this.live[k] ||= {};
    if (LS.get(K.mode, 'live') === 'demo') this.enterDemo(false);
  },
  get s() { return this.mode === 'demo' ? this.demo : this.live; },
  get demoOn() { return this.mode === 'demo'; },
  enterDemo(persist = true) { this.demo = makeDemo(); this.mode = 'demo'; if (persist) LS.set(K.mode, 'demo'); this.rev++; },
  exitDemo() { this.demo = null; this.mode = 'live'; LS.set(K.mode, 'live'); this.rev++; },
  put(kind, id, data) {
    const prev = kind === 'settings' ? this.s.settings : this.s[KIND_COL[kind]][id];
    const u = Math.max(Date.now(), (prev?.u || 0) + 1);
    const rec = { ...data, u };
    if (kind === 'settings') this.s.settings = rec; else this.s[KIND_COL[kind]][id] = rec;
    this.rev++;
    if (!this.demoOn) { this.save(); Sync.enqueueMany([{ kind, id, data: rec, updated_at: u, deleted: !!rec.del }]); }
    App.changed();
    return rec;
  },
  save() { clearTimeout(this._t); this._t = setTimeout(() => LS.set(K.state, this.live), 200); },
  applyRemote(it) {
    const s = this.live, u = Number(it.updated_at) || 0;
    if (it.kind !== 'settings' && !KIND_COL[it.kind]) return false;
    const cur = it.kind === 'settings' ? s.settings : s[KIND_COL[it.kind]][it.id];
    if (cur && (cur.u || 0) >= u) return false;
    const q = Sync.queue[it.kind + ':' + it.id];
    if (q && q.updated_at >= u) return false;
    const rec = { ...(it.data || {}), u };
    if (it.kind === 'settings') s.settings = rec; else s[KIND_COL[it.kind]][it.id] = rec;
    return true;
  },
};

// ═════════════════════════ Synchronisation d'équipe : feuille Google Sheets (gratuite)
const Sync = {
  code: LS.get(K.code, ''), queue: LS.get(K.queue, {}), since: +LS.get(K.since, 0) || 0, sheet: LS.get(K.sheet, ''),
  state: 'local', err: '', lastOk: 0, timer: 0, _t: 0, _busy: false,
  url() { const o = LS.get(K.cfg, {}); return String(o.url || (window.CAL_CONFIG || {}).sheetUrl || '').trim(); },
  get configured() { return /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(this.url()); },
  get pending() { return Object.keys(this.queue).length; },
  start() {
    this.stop();
    if (!this.configured || !this.code) { this.set('local'); return; }
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.cycle(); }, 20000);
    this.cycle();
  },
  stop() { clearInterval(this.timer); clearTimeout(this._t); this.timer = 0; },
  set(st, err = '') { this.state = st; this.err = err; App.renderSync(); },
  enqueueMany(items) {
    for (const it of items) this.queue[it.kind + ':' + it.id] = it;
    LS.set(K.queue, this.queue);
    App.renderSync();
    if (this.timer) { clearTimeout(this._t); this._t = setTimeout(() => this.cycle(), 1500); }
  },
  enqueueAll() {
    const s = Store.live, items = [];
    for (const [kind, col] of Object.entries(KIND_COL)) for (const [id, rec] of Object.entries(s[col])) items.push({ kind, id, data: rec, updated_at: rec.u || Date.now(), deleted: !!rec.del });
    if (s.settings.u) items.push({ kind: 'settings', id: 'main', data: s.settings, updated_at: s.settings.u, deleted: false });
    if (items.length) this.enqueueMany(items);
  },
  async call(body) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 35000);
    try {
      const res = await fetch(this.url(), { method: 'POST', body: JSON.stringify(body), signal: ctl.signal });
      if (!res.ok) throw new Error(`Feuille injoignable (erreur ${res.status})`);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Réponse inattendue de la feuille');
      return j;
    } finally { clearTimeout(t); }
  },
  async cycle() {
    if (!this.configured || !this.code || this._busy) return;
    if (!navigator.onLine) { this.set('offline'); return; }
    this._busy = true; this.set('syncing');
    try {
      for (let guard = 0; guard < 30; guard++) {
        const batch = Object.values(this.queue).slice(0, 120);
        const j = await this.call({ v: 2, code: this.code, since: this.since, items: batch });
        for (const it of batch) { const k = it.kind + ':' + it.id; if (this.queue[k]?.updated_at === it.updated_at) delete this.queue[k]; }
        LS.set(K.queue, this.queue);
        let changed = false;
        for (const it of j.items || []) if (Store.applyRemote(it)) changed = true;
        if (j.now) { this.since = j.now; LS.set(K.since, j.now); }
        if (j.sheet && j.sheet !== this.sheet) { this.sheet = j.sheet; LS.set(K.sheet, j.sheet); }
        if (changed) { Store.rev++; Store.save(); App.changed(); }
        if (!this.pending || !batch.length) break;
      }
      this.lastOk = Date.now(); this.set('online');
    } catch (e) {
      this.set(navigator.onLine ? 'error' : 'offline', e?.name === 'AbortError' ? 'La feuille met trop de temps à répondre' : e?.message || String(e));
    } finally { this._busy = false; }
  },
};
const genCode = () => { const al = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint32Array(8)); let s = ''; for (let i = 0; i < 8; i++) s += al[r[i] % al.length]; return `SEP-${s.slice(0, 4)}-${s.slice(4)}`; };
const joinLink = () => `${location.origin}${location.pathname}#join=${encodeURIComponent(Sync.code)}&s=${encodeURIComponent(Sync.url())}`;
function setCode(code) { Sync.code = code; LS.set(K.code, code); Sync.since = 0; LS.del(K.since); Sync.enqueueAll(); Sync.start(); }
function setSheetUrl(url) { LS.set(K.cfg, { url: url.trim() }); }

// ═════════════════════════ Préférences du téléphone
const UI = Object.assign({ view: 'home', mapMode: 'map', filter: 'all', zone: '', com: '', street: null, q: '', sort: 'alpha' }, LS.get(K.ui, {}));
UI.tour = Object.assign({ street: null, near: false, order: 'sides', open: true, cur: null }, UI.tour || {});
UI.street = null;
const saveUI = () => LS.set(K.ui, { view: UI.view, mapMode: UI.mapMode, filter: UI.filter, zone: UI.zone, com: UI.com, sort: UI.sort, tour: UI.tour });

const Me = {
  key() { return Store.demoOn ? K.me + '.demo' : K.me; },
  get() { const v = LS.get(this.key(), null); if (!v && Store.demoOn) return { me: 'demo-m0', partner: 'demo-m1' }; return v || { me: '', partner: '' }; },
  set(v) { LS.set(this.key(), v); App.changed(); },
  team() { const { me, partner } = this.get(); return [me, partner].filter((id, i, a) => id && member(id) && a.indexOf(id) === i); },
};

// ═════════════════════════ Données dérivées (mémorisées par révision)
const _memo = {};
function memo(k, fn) { const key = Store.mode + ':' + Store.rev; const m = _memo[k]; if (m && m.key === key) return m.v; const v = fn(); _memo[k] = { key, v }; return v; }
const addrs = () => memo('addrs', () => {
  const ex = Object.values(Store.s.extra || {}).filter((e) => !e.del).map((e) => mkAddr(e.id, e.com || COMMUNES[0], e.street, e.num, e.lat, e.lon, true));
  return ex.length ? [...BASE_ADDRS, ...ex] : BASE_ADDRS;
});
const addrIdx = () => memo('addrIdx', () => new Map(addrs().map((a) => [a.id, a])));
const bldN = (addrId) => { const b = Store.s.bld?.[addrId]; return b && !b.del ? clamp(b.n | 0, 1, 99) : 1; };
const units = () => memo('units', () => {
  const out = [];
  for (const a of addrs()) {
    const n = bldN(a.id), labels = Store.s.bld?.[a.id]?.labels || [];
    for (let k = 1; k <= n; k++) out.push({ id: k === 1 ? a.id : `${a.id}~${k}`, a, k, n, label: n > 1 ? labels[k - 1] || `Logement ${k}` : '' });
  }
  return out;
});
const unitIdx = () => memo('unitIdx', () => new Map(units().map((u) => [u.id, u])));
const unitsByAddr = () => memo('ubya', () => { const m = new Map(); for (const u of units()) { if (!m.has(u.a.id)) m.set(u.a.id, []); m.get(u.a.id).push(u); } return m; });
const unitsOf = (addrId) => unitsByAddr().get(addrId) || [];
const unitTitle = (u) => `${u.a.num} ${u.a.street}${u.n > 1 ? ' · ' + u.label : ''}`;
const statusOf = (unitId) => Store.s.passages[unitId]?.status || 'todo';
const addrSt = (addrId) => { const c = blankSt(); for (const u of unitsOf(addrId)) c[statusOf(u.id)]++; return c; };
const member = (id) => { const m = Store.s.members[id]; return m && !m.del ? m : null; };
const members = () => memo('members', () => Object.values(Store.s.members).filter((m) => !m.del).sort((a, b) => a.name.localeCompare(b.name, 'fr')));
const names = (ids) => (ids || []).map((i) => member(i)?.name).filter(Boolean).join(' + ');
const zones = () => memo('zones', () => Object.values(Store.s.zones).filter((z) => !z.del).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'fr', { numeric: true })));
const zoneIndex = () => memo('zidx', () => { const m = new Map(); for (const z of [...zones()].sort((a, b) => (a.u || 0) - (b.u || 0))) for (const id of z.addrs || []) if (addrIdx().has(id)) m.set(id, z.id); return m; });
const zoneOf = (addrId) => { const z = zoneIndex().get(addrId); return z ? Store.s.zones[z] : null; };
const zoneCenter = (zn) => memo('zc:' + zn.id, () => { const idx = addrIdx(), pts = (zn.addrs || []).map((id) => idx.get(id)).filter(Boolean); return pts.length ? [sum(pts, (a) => a.lat) / pts.length, sum(pts, (a) => a.lon) / pts.length] : null; });
const unassigned = () => memo('unassigned', () => { const zi = zoneIndex(); return addrs().filter((a) => !zi.has(a.id)); });
const streets = () => memo('streets', () => {
  const m = new Map();
  for (const a of addrs()) { if (!m.has(a.sk)) m.set(a.sk, { sk: a.sk, name: a.street, com: a.com, ci: a.ci, addrs: [] }); m.get(a.sk).addrs.push(a); }
  for (const st of m.values()) st.addrs.sort(numCmp);
  return [...m.values()].sort((x, y) => x.ci - y.ci || sortKey(x.name).localeCompare(sortKey(y.name), 'fr'));
});
const streetIdx = () => memo('stidx', () => new Map(streets().map((s) => [s.sk, s])));
const streetOf = (sk) => streetIdx().get(sk);
/** Relie chaque tracé de route du plan à une rue de la base d'adresses, pour pouvoir
    toucher une rue sur la carte. Le nom seul ne suffit pas (« Rue de Seppois » existe dans
    4 communes) : on retient la rue dont les maisons sont les plus proches du tracé. */
const streetRoads = () => memo('roads', () => {
  const byName = new Map(), byCore = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const st of streets()) { push(byName, norm(st.name), st); push(byCore, sortKey(st.name), st); }
  const out = new Map();
  for (const [, ni, enc] of GEO.r) {
    if (ni < 0) continue;
    const nm = GEO.n[ni], cands = byName.get(norm(nm)) || byCore.get(sortKey(nm));
    if (!cands) continue;
    const pts = decode(enc), mid = pts[(pts.length / 2) | 0];
    let best = null, bd = Infinity;
    for (const st of cands) { let d = Infinity; for (const a of st.addrs) d = Math.min(d, distM(mid, [a.lat, a.lon])); if (d < bd) { bd = d; best = st; } }
    if (!best || bd > 350) continue;
    let e = out.get(best.sk);
    if (!e) out.set(best.sk, (e = { lines: [], bb: [90, 180, -90, -180] }));
    e.lines.push(pts);
    for (const [la, lo] of pts) { e.bb[0] = Math.min(e.bb[0], la); e.bb[1] = Math.min(e.bb[1], lo); e.bb[2] = Math.max(e.bb[2], la); e.bb[3] = Math.max(e.bb[3], lo); }
  }
  return out;
});
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Range toutes les adresses d'une rue dans un secteur (ou les en retire si zoneId est vide). */
function assignStreetToZone(sk, zoneId) {
  const st = streetOf(sk); if (!st) return 0;
  const ids = new Set(st.addrs.map((a) => a.id));
  for (const z of zones()) {
    if (z.id === zoneId) continue;
    const keep = (z.addrs || []).filter((x) => !ids.has(x));
    if (keep.length !== (z.addrs || []).length) Store.put('zone', z.id, { ...z, addrs: keep });
  }
  const to = zoneId && Store.s.zones[zoneId];
  if (to && !to.del) Store.put('zone', to.id, { ...to, addrs: [...new Set([...(to.addrs || []), ...ids])] });
  return ids.size;
}
function orderStreetUnits(sk, order = 'sides') {
  const st = streetOf(sk); if (!st) return [];
  let list = [...st.addrs];
  if (order === 'sides') list = [...list.filter((a) => !a.even), ...list.filter((a) => a.even).reverse()];
  return list.flatMap((a) => unitsOf(a.id));
}

function stats() {
  return memo('stats', () => {
    const s = Store.s, zi = zoneIndex();
    const st = blankSt(), pay = {};
    for (const k of Object.keys(PAY)) pay[k] = { amt: 0, n: 0 };
    let amount = 0, cal = 0;
    const byDay = {}, byMember = {}, byStreet = new Map(), byZone = {}, byCom = {};
    const day = (k) => (byDay[k] ||= { amount: 0, doors: 0, cal: 0 });
    const mem = (id) => (byMember[id] ||= { doors: 0, amount: 0, cal: 0, streets: new Map(), last: 0 });
    const grp = () => ({ total: 0, visited: 0, amount: 0, st: blankSt(), members: new Set() });
    for (const u of units()) {
      const a = u.a, p = s.passages[u.id], status = p?.status || 'todo';
      st[status]++;
      let bs = byStreet.get(a.sk); if (!bs) byStreet.set(a.sk, (bs = { ...grp(), sk: a.sk, name: a.street, com: a.com }));
      const bc = (byCom[a.com] ||= grp());
      const zid = zi.get(a.id), bz = zid ? (byZone[zid] ||= grp()) : null;
      for (const g of [bs, bc, bz]) if (g) { g.total++; g.st[status]++; if (status !== 'todo') g.visited++; }
      if (!p) continue;
      if (status === 'done') {
        const amt = +p.amt || 0, c = +p.cal || 0;
        amount += amt; cal += c;
        for (const g of [bs, bc, bz]) if (g) g.amount += amt;
        const pk = PAY[p.pay] ? p.pay : 'especes'; pay[pk].amt += amt; pay[pk].n++;
        const d = day(isoDay(new Date(p.doneAt || p.at))); d.amount += amt; d.cal += c;
        const by = p.by || [];
        for (const m of by) { const bm = mem(m); bm.amount += amt / by.length; bm.cal += c / by.length; }
      }
      for (const h of p.hist || []) {
        if (h.s === 'todo') continue;
        day(isoDay(new Date(h.at))).doors++;
        for (const m of h.by || []) {
          const bm = mem(m); bm.doors++; bm.last = Math.max(bm.last, h.at); bs.members.add(m);
          const arr = bm.streets.get(a.sk) || []; if (!arr.includes(u)) arr.push(u); bm.streets.set(a.sk, arr);
        }
      }
    }
    return { total: units().length, st, amount, cal, pay, byDay, byMember, byStreet, byZone, byCom };
  });
}
function repasses() {
  return memo('rep', () => {
    const s = Store.s, out = [], so = { matin: 1, midi: 2, aprem: 3, soir: 4, '': 5 };
    for (const u of units()) {
      const p = s.passages[u.id];
      if (p && (p.status === 'repasse' || (p.status === 'absent' && p.rp?.date))) out.push({ u, a: u.a, p, date: p.rp?.date || '', slot: p.rp?.slot || '' });
    }
    return out.sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999') || so[x.slot] - so[y.slot] || x.a.ci - y.a.ci || sortKey(x.a.street).localeCompare(sortKey(y.a.street)) || numCmp(x.a, y.a) || x.u.k - y.u.k);
  });
}
/** Cherche une adresse précise : « 12 bâle », « 3 cigognes ». Sans numéro, on laisse la recherche de rues. */
function searchAddrs(q) {
  const toks = norm(q).split(/\s+/).filter(Boolean);
  const num = toks.find((t) => /^\d/.test(t));
  if (!num) return [];
  const words = toks.filter((t) => t !== num);
  const out = [];
  for (const a of addrs()) {
    const an = norm(a.num);
    if (an !== num && !an.startsWith(num + ' ')) continue;
    if (UI.com && a.com !== UI.com) continue;
    const hay = norm(a.street + ' ' + a.com);
    if (!words.every((w) => hay.includes(w))) continue;
    out.push(a);
  }
  return out.sort((x, y) => x.ci - y.ci || sortKey(x.street).localeCompare(sortKey(y.street), 'fr')).slice(0, 40);
}
/** Ce que le binôme de ce téléphone a encaissé aujourd'hui : utile pour la remise au trésorier. */
function myDay() {
  const team = Me.team(); if (!team.length) return null;
  const today = isoDay(), r = { doors: 0, cal: 0, amount: 0, pay: {} };
  for (const k of Object.keys(PAY)) r.pay[k] = 0;
  for (const u of units()) {
    for (const h of Store.s.passages[u.id]?.hist || []) {
      if (h.s === 'todo' || isoDay(new Date(h.at)) !== today) continue;
      if (!(h.by || []).some((x) => team.includes(x))) continue;
      r.doors++;
      if (h.s !== 'done') continue;
      const amt = +h.amt || 0;
      r.amount += amt; r.cal += +h.cal || 0;
      r.pay[PAY[h.pay] ? h.pay : 'especes'] += amt;
    }
  }
  return r.doors ? r : null;
}
function events() {
  return memo('events', () => {
    const out = [];
    for (const u of units()) { const p = Store.s.passages[u.id]; if (p?.hist) for (const h of p.hist) if (h.s !== 'todo') out.push({ u, a: u.a, h }); }
    return out.sort((x, y) => y.h.at - x.h.at);
  });
}

// ═════════════════════════ Écriture des passages, immeubles, secteurs
function savePassage(unitId, d) {
  const s = Store.s, u = unitIdx().get(unitId), prev = clone(s.passages[unitId] || null), now = Date.now();
  const status = d.status, done = status === 'done';
  const by = d.by?.length ? [...d.by] : Me.team();
  const hist = [...(prev?.hist || [])];
  const entry = { s: status, at: now, by, ...(done ? { amt: num(d.amt), cal: d.cal, pay: d.pay } : {}) };
  const last = hist[hist.length - 1];
  if (last && last.s === status && now - last.at < 20 * 60000) hist[hist.length - 1] = entry; else if (status !== 'todo') hist.push(entry);
  let rp = null;
  if (status === 'repasse' || (status === 'absent' && d.rp?.date)) rp = { date: d.rp?.date || '', slot: d.rp?.slot || '', note: (d.rp?.note || '').trim(), done: false };
  const rec = {
    status, at: now, by: status === 'todo' ? [] : by,
    cal: done ? d.cal : 0, amt: done ? num(d.amt) : 0, pay: done ? d.pay : null,
    chq: done && d.pay === 'cheque' ? (d.chq || '').trim() : '',
    name: (d.name || '').trim(), note: (d.note || '').trim(), rp,
    doneAt: done ? (prev?.status === 'done' && prev.doneAt ? prev.doneAt : now) : null,
    hist: hist.slice(-20),
    _l: u ? { com: u.a.com, rue: u.a.street, num: u.a.num, lg: u.n > 1 ? u.label : '' } : prev?._l,
  };
  Store.put('passage', unitId, rec);
  return prev;
}
function restorePassage(id, prev) { Store.put('passage', id, prev ? { ...prev } : { status: 'todo', at: Date.now(), by: [], hist: [] }); }
function quickRp(unitId, date) {
  const p = clone(Store.s.passages[unitId]); if (!p) return;
  p.rp = { date, slot: p.rp?.slot || '', note: p.rp?.note || '', done: false };
  Store.put('passage', unitId, p);
  toast(`Repasse ${dayLabel(date).toLowerCase()} · ${unitTitle(unitIdx().get(unitId))}`);
}
function setBld(addrId, n, labels) {
  const cur = Store.s.bld[addrId] || {};
  n = clamp(n | 0, 1, 99);
  const lost = unitsOf(addrId).filter((u) => u.k > n && Store.s.passages[u.id]?.hist?.length).length;
  Store.put('bld', addrId, { id: addrId, n, labels: (labels || cur.labels || []).slice(0, n) });
  if (lost) toast(`${lost} logement${lost > 1 ? 's' : ''} retiré${lost > 1 ? 's' : ''} : leurs passages restent dans l'historique.`);
}
function addMember(name) {
  const used = members().map((m) => m.color);
  const color = PALETTE.find((c) => !used.includes(c)) || PALETTE[members().length % PALETTE.length];
  const id = uid('m');
  Store.put('member', id, { id, name: name.trim(), color });
  return id;
}
function addAddress(com, street, numStr) {
  street = street.trim().replace(/\s+/g, ' '); numStr = numStr.trim().replace(/\s+/g, ' ');
  if (!street || !numStr || !COMMUNES.includes(com)) return;
  if (addrs().some((a) => a.com === com && norm(a.street) === norm(street) && norm(a.num) === norm(numStr))) { toast('Cette adresse existe déjà.'); return; }
  const same = addrs().filter((a) => a.com === com && norm(a.street) === norm(street));
  const n = parseInt(numStr, 10) || 0;
  let lat, lon;
  if (same.length) { const near = [...same].sort((a, b) => Math.abs(a.n - n) - Math.abs(b.n - n))[0]; lat = near.lat + 0.00004; lon = near.lon + 0.00004; }
  else { const v = GEO.v.find((x) => x[0] === com) || GEO.v[0]; lat = v[1]; lon = v[2]; }
  const id = uid('x'), name = same[0]?.street || street;
  Store.put('addr', id, { id, com, street: name, num: numStr, lat, lon });
  toast(`${numStr} ${name} (${com}) ajouté.`);
}
/** Enregistre un secteur et retire ses adresses des autres secteurs : une maison n'appartient qu'à un seul secteur. */
function saveZone(z) {
  const set = new Set(z.addrs);
  for (const other of zones()) {
    if (other.id === z.id) continue;
    const keep = (other.addrs || []).filter((id) => !set.has(id));
    if (keep.length !== (other.addrs || []).length) Store.put('zone', other.id, { ...other, addrs: keep });
  }
  const cur = Store.s.zones[z.id] || {};
  Store.put('zone', z.id, { ...cur, ...z, addrs: [...set] });
}
function moveAddrToZone(addrId, zoneId) {
  const from = zoneOf(addrId);
  if (from && from.id === zoneId) return;
  if (from) Store.put('zone', from.id, { ...from, addrs: (from.addrs || []).filter((x) => x !== addrId) });
  const to = Store.s.zones[zoneId];
  if (to && !to.del) Store.put('zone', to.id, { ...to, addrs: [...new Set([...(to.addrs || []), addrId])] });
}

// ═════════════════════════ Géométrie & découpage automatique
function pipXY(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** K-moyennes équilibrées : chaque élément a un poids (nombre de foyers), les secteurs restent compacts. */
function cluster(items, k) {
  const lat0 = 47.53, lon0 = 7.18, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const P = items.map((it) => ({ ...it, x: (it.lon - lon0) * kx, y: (it.lat - lat0) * ky }));
  const n = P.length; k = clamp(k, 1, Math.min(12, n));
  const W = sum(P, (p) => p.w), d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const cx = sum(P, (p) => p.x * p.w) / W, cy = sum(P, (p) => p.y * p.w) / W;
  const first = P.reduce((b, p) => (d2(p, { x: cx, y: cy }) > d2(b, { x: cx, y: cy }) ? p : b));
  const C = [{ x: first.x, y: first.y }];
  while (C.length < k) { let best = P[0], bd = -1; for (const p of P) { let d = Infinity; for (const c of C) d = Math.min(d, d2(p, c)); if (d > bd) { bd = d; best = p; } } C.push({ x: best.x, y: best.y }); }
  const cap = (W / k) * 1.18;
  let asg = [];
  for (let it = 0; it < 40; it++) {
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) pairs.push([d2(P[i], C[j]), i, j]);
    pairs.sort((a, b) => a[0] - b[0]);
    const load = new Array(k).fill(0); asg = new Array(n).fill(-1);
    for (const [, i, j] of pairs) { if (asg[i] !== -1) continue; if (load[j] && load[j] + P[i].w > cap) continue; asg[i] = j; load[j] += P[i].w; }
    for (let i = 0; i < n; i++) if (asg[i] === -1) { const j = load.indexOf(Math.min(...load)); asg[i] = j; load[j] += P[i].w; }
    let moved = 0;
    for (let j = 0; j < k; j++) {
      let sx = 0, sy = 0, m = 0;
      for (let i = 0; i < n; i++) if (asg[i] === j) { sx += P[i].x * P[i].w; sy += P[i].y * P[i].w; m += P[i].w; }
      if (m) { moved += Math.abs(sx / m - C[j].x) + Math.abs(sy / m - C[j].y); C[j] = { x: sx / m, y: sy / m }; }
    }
    if (moved < 0.5) break;
  }
  const groups = [];
  for (let j = 0; j < k; j++) { const g = P.filter((_, i) => asg[i] === j); if (g.length) groups.push({ ids: g.flatMap((p) => p.ids), ang: Math.atan2(C[j].x - cx, C[j].y - cy) }); }
  return groups.sort((a, b) => ((a.ang + 2 * Math.PI) % (2 * Math.PI)) - ((b.ang + 2 * Math.PI) % (2 * Math.PI))).map((g) => g.ids);
}
function autoGroups(k, keepStreets = true) {
  if (keepStreets) return cluster(streets().map((st) => ({ ids: st.addrs.map((a) => a.id), w: sum(st.addrs, (a) => unitsOf(a.id).length), lat: sum(st.addrs, (a) => a.lat) / st.addrs.length, lon: sum(st.addrs, (a) => a.lon) / st.addrs.length })), k);
  return cluster(addrs().map((a) => ({ ids: [a.id], w: unitsOf(a.id).length, lat: a.lat, lon: a.lon })), k);
}
function replaceZones(groups, namer) {
  for (const z of zones()) Store.put('zone', z.id, { ...z, del: true });
  groups.forEach((ids, i) => { const id = uid('z'); Store.put('zone', id, { id, name: namer(ids, i), color: ZONE_COLORS[i % ZONE_COLORS.length], addrs: ids, members: [], order: i }); });
}
const comsOf = (ids) => [...new Set(ids.map((id) => addrIdx().get(id)?.com).filter(Boolean))].sort((a, b) => comIdx(a) - comIdx(b));

// ═════════════════════════ Données de démonstration (jamais enregistrées)
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeDemo() {
  const rnd = mulberry32(1926), pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const s = EMPTY();
  s.settings = { name: 'Calendriers 2027', year: 2027, goal: 15000, price: 10, u: 1 };
  const ids = ['Thomas K.', 'Julie W.', 'Nicolas B.', 'Léa S.', 'Marc H.', 'Camille F.', 'Hugo R.', 'Inès D.', 'Paul G.', 'Chloé M.'].map((n, i) => { const id = 'demo-m' + i; s.members[id] = { id, name: n, color: PALETTE[i], u: 1 }; return id; });
  BASE_ADDRS.forEach((a, i) => { if ((a.com === 'Seppois-le-Bas' || a.com === 'Pfetterhouse') && i % 31 === 7) s.bld[a.id] = { id: a.id, n: 2 + (i % 5), labels: [], u: 1 }; });
  const now = Date.now(), today = isoDay(), days = [];
  for (let k = 16; k >= 0; k--) { const iso = addDays(today, -k); const dw = new Date(iso + 'T12:00:00').getDay(); if (dw === 0 || dw === 6 || dw === 3 || k === 0) days.push(iso); }
  const prog = [0.78, 0.55, 0.32, 0.62, 0.15];
  COMMUNES.forEach((com, zi) => {
    const id = 'demo-z' + zi, team = [ids[zi * 2], ids[zi * 2 + 1]];
    const list = BASE_ADDRS.filter((a) => a.com === com).sort((a, b) => sortKey(a.street).localeCompare(sortKey(b.street)) || numCmp(a, b));
    s.zones[id] = { id, name: com, color: ZONE_COLORS[zi], addrs: list.map((a) => a.id), members: team, order: zi, u: 1 + zi };
    const us = list.flatMap((a) => { const n = s.bld[a.id]?.n || 1; return Array.from({ length: n }, (_, k) => ({ id: k ? `${a.id}~${k + 1}` : a.id, a, k: k + 1, n })); });
    const nV = Math.round(us.length * prog[zi]);
    for (let k = 0; k < nV; k++) {
      const u = us[k], iso = days[Math.min(days.length - 1, Math.floor((k / nV) * days.length))];
      const at = new Date(iso + 'T00:00:00').getTime() + (570 + Math.floor(rnd() * 540)) * 60000;
      if (at > now) continue;
      const r = rnd(), status = r < 0.71 ? 'done' : r < 0.85 ? 'absent' : r < 0.93 ? 'repasse' : 'refus';
      const by = rnd() < 0.85 ? team : [team[Math.floor(rnd() * 2)]];
      const hist = [];
      if (status === 'done' && rnd() < 0.18) hist.push({ s: 'absent', at: at - 2 * 86400000, by });
      const p = { status, at, by, cal: 0, amt: 0, pay: null, chq: '', name: '', note: '', rp: null, doneAt: null, hist, u: at };
      if (status === 'done') {
        p.cal = rnd() < 0.86 ? 1 : 2; p.amt = p.cal * pick([5, 8, 10, 10, 10, 10, 12, 15, 15, 20, 20, 25]);
        const pr = rnd(); p.pay = pr < 0.55 ? 'especes' : pr < 0.76 ? 'cheque' : pr < 0.94 ? 'cb' : 'autre';
        p.doneAt = at; hist.push({ s: 'done', at, by, amt: p.amt, cal: p.cal, pay: p.pay });
      } else hist.push({ s: status, at, by });
      if (status === 'repasse' || (status === 'absent' && rnd() < 0.5)) p.rp = { date: addDays(today, Math.floor(rnd() * 6) - 1), slot: pick(['matin', 'aprem', 'soir', 'soir']), note: pick(['', '', 'Revenir après 18 h', 'Sonner à la porte de derrière', 'Chien dans la cour', 'Demande un reçu']), done: false };
      if (status === 'refus' && rnd() < 0.4) p.note = 'Ne souhaite pas être sollicité';
      s.passages[u.id] = p;
    }
  });
  return s;
}

// ═════════════════════════ Petits composants
const avatar = (id, cls = '') => { const m = member(id); return `<span class="av ${cls}" style="--c:${m ? m.color : '#6B7280'}" title="${esc(m ? m.name : 'Ancien membre')}">${esc(m ? initials(m.name) : '?')}</span>`; };
const avatars = (ids, max = 4, cls = 'sm') => `<span class="avs">${[...ids].slice(0, max).map((i) => avatar(i, cls)).join('')}${ids.length > max ? `<span class="av ${cls}" style="--c:#8A919B">+${ids.length - max}</span>` : ''}</span>`;
const stackBar = (st, total, cls = '') => `<div class="stack ${cls}" role="img" aria-label="${esc(ST_ORDER.map((k) => `${STATUS[k].short} ${st[k]}`).join(', '))}">${ST_ORDER.filter((k) => st[k]).map((k) => `<i data-st="${k}" style="flex:${st[k]}"></i>`).join('')}</div>`;
const stPill = (k) => `<span class="st-pill" data-st="${k}">${STATUS[k].label}</span>`;
const comChips = (act, cur, counts) => `<div class="chips scroll-x">${[['', 'Toutes'], ...COMMUNES.map((c) => [c, c])].map(([v, l]) => `<button class="chip" data-act="${act}" data-v="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}${counts ? ` <small>${counts[v] ?? ''}</small>` : ''}</button>`).join('')}</div>`;
const shortNum = (u) => `${u.a.num.replace(' bis', 'b').replace(' ter', 't').replace(' quater', 'q')}${u.n > 1 ? '·' + u.k : ''}`;
function dateChoices() {
  const t = isoDay(), dw = new Date(t + 'T12:00:00').getDay();
  const out = [[t, "Aujourd'hui"], [addDays(t, 1), 'Demain']];
  const sat = addDays(t, (6 - dw + 7) % 7 || 7), sun = addDays(t, (7 - dw) % 7 || 7);
  for (const [d, l] of [[sat, 'Samedi'], [sun, 'Dimanche']]) if (!out.some((o) => o[0] === d)) out.push([d, `${l} ${new Date(d + 'T12:00:00').getDate()}`]);
  out.push([addDays(t, 7), 'Dans 8 jours']);
  return out;
}
function qrSvg(text) {
  try { const q = qrcode(0, 'L'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
  catch (e) { return `<p class="muted">${esc(text)}</p>`; }
}
function toast(msg, { undo, ms = 4200 } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="toast-undo">Annuler</button>' : ''}`;
  t._undo = undo; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), ms);
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
const Wake = {
  lock: null,
  async on() { if (this.lock || !('wakeLock' in navigator)) return; try { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => (this.lock = null)); } catch (e) { this.lock = null; } },
  off() { try { this.lock?.release(); } catch (e) { /* déjà relâché */ } this.lock = null; },
};
const Geo = {
  pos: null, watch: null, _last: null, onFirst: null,
  start() {
    if (this.watch != null) return true;
    if (!navigator.geolocation) { toast('La localisation n’est pas disponible sur cet appareil.'); return false; }
    this.watch = navigator.geolocation.watchPosition((p) => {
      const first = !this.pos;
      this.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      if (first) { this.onFirst?.(); this.onFirst = null; }
      MapView.draw();
      const moved = !this._last || distM([this._last.lat, this._last.lon], [this.pos.lat, this.pos.lon]) > 8;
      if (moved) { this._last = this.pos; if (UI.view === 'tour' && UI.tour.near) App.changed(); }
    }, (e) => {
      navigator.geolocation.clearWatch(this.watch); this.watch = null;
      toast(e.code === 1 ? 'Localisation refusée : autorisez-la dans les réglages du navigateur.' : 'Position introuvable pour le moment.');
      App.changed();
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 });
    return true;
  },
};

// ═════════════════════════ Contrôleur
const App = {
  _raf: 0, installPrompt: null, day: isoDay(),
  changed() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); },
  render() {
    renderHeader();
    const el = $('#v-' + UI.view), ae = document.activeElement;
    const busy = ae && el?.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'street-q';
    if (!busy) VIEWS[UI.view]();
    if (MapView.map) MapView.refresh();
    if (Page.cur) Page.refresh();
    if (Sheet.refresh) Sheet.refresh();
  },
  renderSync() { renderHeader(); if (Page.cur === 'settings') Page.refresh(); },
};
const VIEWS = { home: renderHome, map: renderMapView, tour: renderTour, rep: renderRep, team: renderTeam };
function go(v) {
  if (!VIEWS[v]) v = 'home';
  const changed = UI.view !== v;
  UI.view = v; saveUI();
  $$('#main > .view').forEach((el) => (el.hidden = el.id !== 'v-' + v));
  if (v === 'tour') Wake.on(); else Wake.off();
  App.render();
  if (changed) $('#v-' + v).scrollTop = 0;
  if (v === 'map' && UI.mapMode === 'map') requestAnimationFrame(() => MapView.show());
}

// ═════════════════════════ En-tête
function renderHeader() {
  const s = Store.s;
  $('#hdr-title').textContent = s.settings.name || 'Calendriers';
  const pill = $('#sync-pill'), st = Store.demoOn ? 'demo' : Sync.state;
  let txt = { demo: 'Démo', local: 'Local', online: 'En ligne', syncing: 'Synchro…', offline: 'Hors ligne', error: 'Erreur synchro' }[st] || 'Local';
  if (!Store.demoOn && Sync.pending && Sync.code && st !== 'syncing') txt += ` · ${Sync.pending}`;
  pill.dataset.s = st; pill.querySelector('span').textContent = txt;
  const m = member(Me.team()[0]), btn = $('#me-btn');
  btn.innerHTML = m ? esc(initials(m.name)) : ico('user');
  btn.style.background = m ? m.color : '';
  btn.title = m ? `Tournée de ${names(Me.team())}` : 'Qui fait la tournée ?';
  $('#demo-banner').hidden = !Store.demoOn;
  const today = isoDay(), due = repasses().filter((r) => r.date && r.date <= today).length;
  const b = $('#rep-badge'); b.hidden = !due; b.textContent = due;
  $$('.tabs > button').forEach((x) => (x.dataset.v === UI.view ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current')));
}

// ═════════════════════════ Accueil
function renderHome() {
  const el = $('#v-home'), s = Store.s, S = stats(), set = s.settings;
  const goal = +set.goal || 0, visited = S.total - S.st.todo, avg = S.cal ? S.amount / S.cal : 0;
  const now = new Date(), today = isoDay(), T = S.byDay[today] || { amount: 0, doors: 0 };
  const due = repasses().filter((r) => r.date && r.date <= today);
  const days = []; for (let k = 13; k >= 0; k--) days.push(addDays(today, -k));
  const maxD = Math.max(0, ...days.map((d) => S.byDay[d]?.amount || 0));
  const zs = zones(), miss = zs.length ? unassigned().length : 0;
  const ranked = members().map((m) => [m, S.byMember[m.id]]).filter(([, b]) => b?.doors).sort((a, b) => b[1].doors - a[1].doors).slice(0, 5);
  const recent = events().slice(0, 6);
  const tourSt = UI.tour.street && streetOf(UI.tour.street);
  el.innerHTML = `<div class="view-in"><div class="home-grid">
  <div class="home-col">
    <section class="hero" aria-label="Collecte">
      <div class="hero-chief">
        <div class="rings" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="hero-eyebrow">Collecté · ${esc(set.name || 'Campagne')}</div>
        <div class="hero-amt">${eur(S.amount)}</div>
        ${goal ? `<div class="goal-bar"><i style="width:${clamp(pct(S.amount, goal), 0, 100)}%"></i></div><div class="goal-lbl"><span>${pct(S.amount, goal)} % de l'objectif</span><span>${eur(goal)}</span></div>` : `<div class="goal-lbl"><button class="link" style="color:#fff" data-act="page" data-v="settings">Fixer un objectif</button></div>`}
      </div>
      <div class="hero-field">
        <div class="shield"><b>${nf(S.cal)}</b><span>calendriers</span></div>
        <div class="shield"><b>${pct(visited, S.total)}&nbsp;%</b><span>foyers visités</span></div>
        <div class="shield"><b>${avg ? eur(Math.round(avg * 10) / 10) : '—'}</b><span>par calendrier</span></div>
      </div>
    </section>
    <section class="card">
      <div class="card-h"><h2>${nf(S.total)} foyers</h2><span class="muted">${nf(visited)} visités · ${COMMUNES.length} communes</span></div>
      ${stackBar(S.st, S.total)}
      <div class="st-grid">${ST_FILTER.map((k) => `<button class="st-cell" data-act="mapfilter" data-v="${k}"><span class="dot" data-st="${k}"></span><b>${nf(S.st[k])}</b><span>${STATUS[k].label} · ${pct(S.st[k], S.total)} %</span></button>`).join('')}</div>
    </section>
    <section class="card">
      <div class="card-h"><h2>Aujourd'hui</h2><span class="muted">${DOWL[now.getDay()]} ${now.getDate()} ${MON[now.getMonth()]}</span></div>
      <div class="today">
        <div class="kpi"><b>${T.doors}</b><span>passages</span></div>
        <div class="kpi"><b>${eur(T.amount)}</b><span>collectés</span></div>
        <div class="kpi"><b>${due.length}</b><span>repasses dues</span></div>
      </div>
      ${due.length ? `<div class="mini-list">${due.slice(0, 4).map(repRow).join('')}</div>${due.length > 4 ? `<button class="link" data-act="go" data-v="rep">Voir les ${due.length} repasses</button>` : ''}` : ''}
      <button class="btn red block" style="margin-top:14px" data-act="go" data-v="tour">${ico('door')} ${tourSt ? `Reprendre · ${esc(tourSt.name)}` : 'Commencer la tournée'}</button>
    </section>
    ${myDayCard()}
    <section class="card">
      <div class="card-h"><h2>Par commune</h2><span class="muted">foyers visités · collecté</span></div>
      ${COMMUNES.map((c) => { const g = S.byCom[c] || { total: 0, visited: 0, amount: 0, st: blankSt() }; return `<button class="zone-row as-btn" data-act="com-go" data-v="${esc(c)}"><span class="zdot" style="--c:var(--ink-2)"></span><b>${esc(c)}</b><span class="meta">${pct(g.visited, g.total)} % · ${eur(g.amount)}</span>${stackBar(g.st, g.total, 'sm')}<span class="muted" style="grid-column:2/-1;font-size:12.5px">${nf(g.visited)} / ${nf(g.total)} foyers</span></button>`; }).join('')}
    </section>
  </div>
  <div class="home-col">
    <section class="card">
      <div class="card-h"><h2>Règlements</h2><span class="muted">${S.st.done} dons</span></div>
      <div class="hbars">${Object.keys(PAY).map((k) => `<div class="hbar" style="--c:${PAY_COLOR[k]}"><span class="t">${PAY[k]}</span><span class="v">${eur(S.pay[k].amt)}<small>${S.pay[k].n}</small></span><span class="track"><i style="width:${S.amount ? (S.pay[k].amt / S.amount) * 100 : 0}%"></i></span></div>`).join('')}</div>
    </section>
    <section class="card">
      <div class="card-h"><h2>14 derniers jours</h2><span class="muted">collecte par jour</span></div>
      ${maxD ? `<div class="chart"><div class="gridline"><span>${eur(maxD)}</span></div><div class="bars">${days.map((d) => { const v = S.byDay[d]?.amount || 0; return `<i class="${d === today ? 'today' : ''}${v ? '' : ' zero'}" style="height:${v ? Math.max(3, (v / maxD) * 100) : 2}%" title="${dayLabel(d)} : ${eur(v)}"></i>`; }).join('')}</div><div class="bars-x">${days.map((d, i) => `<span>${i % 2 === 1 ? new Date(d + 'T12:00:00').getDate() : ''}</span>`).join('')}</div></div>` : '<div class="empty">Aucune collecte sur les 14 derniers jours.</div>'}
    </section>
    <section class="card">
      <div class="card-h"><h2>Secteurs</h2>${zs.length ? '<button class="link" data-act="page" data-v="settings" data-sec="zones">Gérer</button>' : ''}</div>
      ${miss ? `<button class="alert-row" data-act="page" data-v="unassigned">${ico('flag', 'sm')}<span><b>${miss} adresse${miss > 1 ? 's' : ''} sans secteur</b><small>Touchez pour les répartir : aucune maison ne doit être oubliée.</small></span>${ico('chev-r', 'sm')}</button>` : ''}
      ${zs.length ? zs.map((z) => { const bz = S.byZone[z.id] || { total: 0, visited: 0, amount: 0, st: blankSt() }; return `<button class="zone-row as-btn" data-act="zone-edit" data-v="${z.id}"><span class="zdot" style="--c:${z.color}"></span><b>${esc(z.name)}</b><span class="meta">${pct(bz.visited, bz.total)} % · ${eur(bz.amount)}</span>${stackBar(bz.st, bz.total, 'sm')}<span class="muted" style="grid-column:2/-1;font-size:12.5px">${esc(names(z.members)) || 'Aucun binôme affecté'}</span></button>`; }).join('') : `<p class="muted" style="margin:0 0 12px">Répartissez les rues entre les binômes : par commune, par rue ou en entourant les maisons sur la carte.</p><button class="btn ghost block" data-act="page" data-v="settings" data-sec="zones">${ico('sparkle')} Créer les secteurs</button>`}
    </section>
    <section class="card">
      <div class="card-h"><h2>Classement</h2><button class="link" data-act="go" data-v="team">Équipe</button></div>
      ${ranked.length ? ranked.map(([m, b], i) => rankRow(m, b, i)).join('') : '<p class="muted" style="margin:0">Personne n’a encore enregistré de passage.</p>'}
    </section>
    <section class="card">
      <div class="card-h"><h2>Derniers passages</h2><button class="link" data-act="history">Historique</button></div>
      ${recent.length ? `<div class="mini-list" style="margin-top:0;border-top:0">${recent.map((e) => evRow(e)).join('')}</div>` : '<p class="muted" style="margin:0">Aucun passage enregistré pour l’instant.</p>'}
    </section>
  </div>
  </div></div>`;
}
function myDayCard() {
  const d = myDay(); if (!d) return '';
  const cash = d.pay.especes + d.pay.cheque;
  return `<section class="card purse">
    <div class="card-h"><h2>Ma caisse du jour</h2><span class="muted">${esc(names(Me.team()))}</span></div>
    <div class="today">
      <div class="kpi"><b>${eur(d.amount)}</b><span>encaissés</span></div>
      <div class="kpi"><b>${nf(d.cal)}</b><span>calendriers</span></div>
      <div class="kpi"><b>${d.doors}</b><span>passages</span></div>
    </div>
    <div class="hbars" style="margin-top:14px">${Object.keys(PAY).filter((k) => d.pay[k]).map((k) => `<div class="hbar" style="--c:${PAY_COLOR[k]}"><span class="t">${PAY[k]}</span><span class="v">${eur(d.pay[k])}</span><span class="track"><i style="width:${(d.pay[k] / d.amount) * 100}%"></i></span></div>`).join('') || '<p class="muted" style="margin:0">Aucun don encaissé pour l’instant.</p>'}</div>
    ${cash ? `<div class="purse-note">${ico('euro', 'sm')}<span><b>${eur(cash)}</b> à remettre au trésorier : espèces et chèques que vous avez sur vous.</span></div>` : ''}
  </section>`;
}
function repRow(r) {
  const late = r.date < isoDay();
  return `<button class="mini-row" data-act="unit" data-id="${r.u.id}"><span class="when" style="${late ? 'color:var(--st-refus)' : ''}">${late ? 'Retard' : SLOT_SHORT[r.slot] || '—'}</span><span class="dot" data-st="${r.p.status}"></span><span class="grow"><b>${esc(unitTitle(r.u))}</b><small>${esc([r.a.com, r.p.rp?.note || STATUS[r.p.status].label].join(' · '))}</small></span>${ico('chev-r', 'sm')}</button>`;
}
function evRow({ u, h }, timeOnly = false) {
  return `<button class="mini-row" data-act="unit" data-id="${u.id}"><span class="when">${timeOnly ? hhmm(h.at) : dayShort(h.at)}</span><span class="dot" data-st="${h.s}"></span><span class="grow"><b>${esc(unitTitle(u))}</b><small>${STATUS[h.s].label} · ${esc(u.a.com)}${h.by?.length ? ' · ' + esc(names(h.by)) : ''}</small></span>${h.s === 'done' ? `<span class="amt">${eur(h.amt)}</span>` : ''}</button>`;
}
function rankRow(m, b, i) {
  const zn = zones().filter((z) => (z.members || []).includes(m.id)).map((z) => z.name);
  return `<button class="rank" data-act="member" data-v="${m.id}"><span class="pos">${i + 1}</span>${avatar(m.id)}<span class="nm"><b>${esc(m.name)}</b><small>${b?.streets.size || 0} rues · ${esc(zn.join(', ') || 'sans secteur')}</small></span><span class="vals"><b>${b?.doors || 0}</b><small>${eur(Math.round(b?.amount || 0))}</small></span></button>`;
}

// ═════════════════════════ Carte & rues
const mapKeep = (a, zi) => (!UI.com || a.com === UI.com) && (!UI.zone || (UI.zone === '__none' ? !zi.has(a.id) : zi.get(a.id) === UI.zone));
function renderMapView() {
  $$('#v-map .seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === UI.mapMode)));
  const zs = zones();
  if (UI.zone && UI.zone !== '__none' && !Store.s.zones[UI.zone]) UI.zone = '';
  const c = blankSt(), zi = zoneIndex();
  for (const u of units()) if (mapKeep(u.a, zi)) c[statusOf(u.id)]++;
  const tot = sum(Object.values(c));
  $('#map-filters').innerHTML = [['all', 'Tous', tot], ...ST_FILTER.map((k) => [k, STATUS[k].short, c[k]])]
    .map(([k, l, n]) => `<button class="chip" data-act="filter" data-v="${k}" aria-pressed="${UI.filter === k}">${k !== 'all' ? `<span class="dot" data-st="${k}"></span>` : ''}${l} <small>${n}</small></button>`).join('')
    + `<select class="input sm zone-sel" data-change="com" aria-label="Commune"><option value="">Toutes les communes</option>${COMMUNES.map((x) => `<option ${UI.com === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`
    + (zs.length ? `<select class="input sm zone-sel" data-change="zone" aria-label="Secteur"><option value="">Tous les secteurs</option>${zs.map((z) => `<option value="${z.id}" ${UI.zone === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}<option value="__none" ${UI.zone === '__none' ? 'selected' : ''}>Sans secteur (${unassigned().length})</option></select>` : '');
  $('#map-host').hidden = UI.mapMode !== 'map';
  $('#streets-host').hidden = UI.mapMode !== 'streets';
  if (UI.mapMode === 'streets') renderStreets();
  else {
    $('#map-legend').innerHTML = ST_FILTER.map((k) => `<div><span class="dot" data-st="${k}"></span>${STATUS[k].short}<b>${c[k]}</b></div>`).join('') + '<div class="legend-foot">Touchez une rue pour la gérer</div>';
    $('#map-legend').hidden = !!MapView.lasso;
    $('#layer-lbl').textContent = MapView.layer === 'sat' ? 'Plan' : 'Satellite';
  }
}
function renderStreets() {
  const host = $('#streets-host');
  if (UI.street) { host.innerHTML = `<div class="view-in">${streetDetail(UI.street)}</div>`; return; }
  const ae = document.activeElement;
  if (ae && ae.id === 'street-q' && host.contains(ae)) { $('#street-list').innerHTML = streetRows(); return; }
  const S = stats(), counts = { '': streets().length };
  for (const st of streets()) counts[st.com] = (counts[st.com] || 0) + 1;
  host.innerHTML = `<div class="view-in">
    ${comChips('com', UI.com, counts)}
    <div class="street-tools">
      <div class="input-ico">${ico('search')}<input id="street-q" class="input" type="search" placeholder="Rue, ou n° et rue (12 bâle)" value="${esc(UI.q)}" autocomplete="off" aria-label="Chercher une rue ou une adresse"></div>
      <select class="input" style="width:auto" data-change="sort" aria-label="Trier les rues">${[['alpha', 'A → Z'], ['todo', 'Le plus à faire'], ['prog', 'Avancement']].map(([v, l]) => `<option value="${v}" ${UI.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="addr-hits">${addrHits()}</div>
    <div id="street-list">${streetRows()}</div>
    <p class="muted" style="font-size:12.5px;margin:0">${nf(S.total)} foyers dans ${streets().length} rues.</p>
  </div>`;
}
function addrHits() {
  const hits = searchAddrs(UI.q);
  if (!hits.length) return '';
  return `<section class="card hits"><div class="card-h"><h2>Adresses</h2><span class="muted">${hits.length}</span></div>${hits.map((a) => {
    const us = unitsOf(a.id), c = addrSt(a.id), st = us.length > 1 ? null : statusOf(a.id);
    return `<button class="mini-row" data-act="addr" data-id="${a.id}"><span class="plaque num sm">${esc(a.num)}</span><span class="grow"><b>${esc(a.street)}</b><small>${esc(a.com)}${us.length > 1 ? ` · ${us.length} logements` : ''}</small></span>${st ? stPill(st) : stackBar(c, us.length, 'sm')}</button>`;
  }).join('')}</section>`;
}
function streetRows() {
  const S = stats(), q = norm(UI.q), zi = zoneIndex();
  let rows = streets().filter((st) => (!UI.com || st.com === UI.com) && (!q || norm(st.name + ' ' + st.com).includes(q)));
  if (UI.zone) rows = rows.filter((st) => st.addrs.some((a) => (UI.zone === '__none' ? !zi.has(a.id) : zi.get(a.id) === UI.zone)));
  if (UI.filter !== 'all') rows = rows.filter((st) => S.byStreet.get(st.sk)?.st[UI.filter] > 0);
  const g = (st) => S.byStreet.get(st.sk), prog = (st) => g(st).visited / g(st).total;
  if (UI.sort === 'todo') rows.sort((a, b) => g(b).st.todo - g(a).st.todo);
  else if (UI.sort === 'prog') rows.sort((a, b) => prog(b) - prog(a));
  if (!rows.length) return searchAddrs(UI.q).length ? '' : '<div class="empty"><b>Aucune rue</b>Modifiez la recherche ou les filtres.</div>';
  const card = (st) => {
    const r = g(st);
    const info = [r.st.todo ? `${r.st.todo} à faire` : 'Rue terminée', r.st.repasse ? `${r.st.repasse} à repasser` : '', r.st.absent ? `${r.st.absent} absents` : ''].filter(Boolean).join(' · ');
    return `<button class="street-row" data-act="street" data-v="${esc(st.sk)}"><div class="sr-top"><b>${esc(st.name)}</b><span>${r.visited}/${r.total}</span></div>${stackBar(r.st, r.total, 'sm')}<div class="sr-foot"><span class="grow">${info}</span>${r.members.size ? avatars([...r.members]) : ''}${r.amount ? `<b class="tnum" style="color:var(--ink)">${eur(r.amount)}</b>` : ''}</div></button>`;
  };
  if (UI.sort !== 'alpha' || UI.com) return `<div class="street-list">${rows.map(card).join('')}</div>`;
  return COMMUNES.map((c) => { const list = rows.filter((st) => st.com === c); return list.length ? `<h3 class="com-h">${esc(c)} <small>${list.length} rues</small></h3><div class="street-list">${list.map(card).join('')}</div>` : ''; }).join('');
}
function bldTile(a, act = 'addr') {
  const us = unitsOf(a.id), sfx = a.num.split(' ').slice(1).join(' ');
  if (us.length === 1) { const st = statusOf(a.id); return `<button class="dt" data-st="${st}" data-act="${act}" data-id="${a.id}" aria-label="${esc(a.num)}, ${STATUS[st].label}">${a.n}${sfx ? `<small>${esc(sfx)}</small>` : ''}</button>`; }
  const c = addrSt(a.id), all = ST_ORDER.find((k) => c[k] === us.length);
  return `<button class="dt bld" ${all ? `data-st="${all}"` : ''} data-act="${act}" data-id="${a.id}" aria-label="${esc(a.num)}, immeuble de ${us.length} logements">${a.n}<small>${us.length} logts</small>${all ? '' : `<span class="mini">${stackBar(c, us.length, 'sm')}</span>`}</button>`;
}
function streetDetail(sk) {
  const S = stats(), st = streetOf(sk), r = S.byStreet.get(sk);
  if (!st || !r) { UI.street = null; return '<div class="empty"><b>Rue introuvable</b></div>'; }
  const odd = st.addrs.filter((a) => !a.even), even = st.addrs.filter((a) => a.even);
  const who = [...r.members].map((id) => [id, S.byMember[id]?.streets.get(sk)?.length || 0]).sort((a, b) => b[1] - a[1]);
  const z = [...new Set(st.addrs.map((a) => zoneOf(a.id)?.name).filter(Boolean))];
  return `
  <div class="sd-head"><button class="icon-btn" data-act="street-back" aria-label="Retour aux rues">${ico('chev-l')}</button><div class="plaque street">${esc(st.name)}</div></div>
  <p class="muted" style="margin:-6px 0 0;font-weight:600">${esc(st.com)} · ${st.addrs.length} adresses · ${r.total} foyers${z.length ? ' · ' + esc(z.join(', ')) : ' · sans secteur'}</p>
  <div class="kpis">
    <div class="kpi"><b>${pct(r.visited, r.total)} %</b><span>${r.visited} / ${r.total} foyers</span></div>
    <div class="kpi"><b>${eur(r.amount)}</b><span>collectés</span></div>
    <div class="kpi"><b>${r.st.done}</b><span>foyers donateurs</span></div>
    <div class="kpi"><b>${r.st.absent + r.st.repasse}</b><span>absents · repasses</span></div>
  </div>
  ${stackBar(r.st, r.total)}
  <button class="btn red block" data-act="tour-start" data-v="${esc(sk)}">${ico('door')} Démarrer la tournée dans cette rue</button>
  <div class="sides">
    <div><div class="lbl">Côté impair · ${odd.length}</div><div class="doors">${odd.map((a) => bldTile(a)).join('') || '<span class="muted">—</span>'}</div></div>
    <div><div class="lbl">Côté pair · ${even.length}</div><div class="doors">${even.map((a) => bldTile(a)).join('') || '<span class="muted">—</span>'}</div></div>
  </div>
  <p class="muted" style="margin:0;font-size:13px">Un immeuble ? Touchez son numéro, puis « Plusieurs logements ».</p>
  <div class="field"><label for="sd-zone">Secteur de toute la rue</label><select id="sd-zone" class="input" data-change="street-zone" data-sk="${esc(sk)}"><option value="">${zones().length ? '— Sans secteur —' : 'Aucun secteur créé'}</option>${zones().map((x) => `<option value="${x.id}" ${z.length === 1 && z[0] === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
  <section class="card"><div class="card-h"><h2>Passé par</h2></div>${who.length ? who.map(([id, n]) => `<button class="rank" data-act="member" data-v="${id}" style="grid-template-columns:auto 1fr auto">${avatar(id)}<span class="nm"><b>${esc(member(id)?.name || 'Ancien membre')}</b></span><span class="vals"><b>${n}</b><small>foyers</small></span></button>`).join('') : '<p class="muted" style="margin:0">Personne n’est encore passé dans cette rue.</p>'}</section>
  <button class="btn ghost" data-act="street-map" data-v="${esc(sk)}">${ico('map')} Voir la rue sur la carte</button>`;
}

// ═════════════════════════ Tournée (porte-à-porte)
const freshTD = (id) => ({ id, mode: null, status: null, cal: 1, amt: null, pay: 'especes', rpDate: '', rpSlot: '', rpNote: '' });
let TD = freshTD(null);
function tourList() {
  const T = UI.tour;
  if (T.near) {
    const pos = Geo.pos; if (!pos) return [];
    const near = units().filter((u) => OPEN.has(statusOf(u.id)) || u.id === T.cur).map((u) => ({ u, d: distM([pos.lat, pos.lon], [u.a.lat, u.a.lon]) + u.k * 0.01 })).sort((x, y) => x.d - y.d);
    const top = near.slice(0, 30).map((x) => x.u);
    const cur = T.cur && unitIdx().get(T.cur);
    if (cur && !top.includes(cur)) top.unshift(cur);
    return top;
  }
  return orderStreetUnits(T.street, T.order);
}
function tourNext(dir = 1) {
  const T = UI.tour, full = tourList();
  if (!full.length) return;
  if (T.near) { const next = full.find((u) => u.id !== T.cur && OPEN.has(statusOf(u.id))); if (next) T.cur = next.id; }
  else {
    const i = full.findIndex((u) => u.id === T.cur);
    for (let step = 1; step < full.length; step++) {
      const u = full[(((i + dir * step) % full.length) + full.length) % full.length];
      if (!T.open || OPEN.has(statusOf(u.id))) { T.cur = u.id; break; }
    }
  }
  TD = freshTD(T.cur); saveUI();
}
const tourScrollTop = () => requestAnimationFrame(() => { const v = $('#v-tour'), card = $('.door-card', v); if (card && card.getBoundingClientRect().top < v.getBoundingClientRect().top) v.scrollTo({ top: Math.max(0, card.offsetTop - 120), behavior: 'smooth' }); });
function tourSave(status, extra = {}) {
  const id = UI.tour.cur; if (!id) return;
  const p = Store.s.passages[id], u = unitIdx().get(id), team = Me.team();
  const d = { status, cal: extra.cal ?? 1, amt: extra.amt ?? 0, pay: extra.pay || 'especes', chq: '', name: p?.name || '', note: p?.note || '', rp: extra.rp || null, by: team.length ? team : p?.by || [] };
  const prev = savePassage(id, d);
  vibrate(18);
  toast(`${unitTitle(u)} · ${STATUS[status].short}${status === 'done' ? ' · ' + eur(num(d.amt)) : ''}${team.length ? '' : ' · sans nom'}`, {
    undo: () => { restorePassage(id, prev); UI.tour.cur = id; TD = freshTD(id); saveUI(); App.changed(); },
  });
  tourNext(1); App.changed(); tourScrollTop();
}
function tourTeamLine() {
  const team = Me.team();
  return `<button class="tour-team" data-act="me-sheet">${team.length ? `${avatars(team, 2, 'sm')} Tournée de ${esc(names(team))}` : `${ico('user', 'sm')} Qui fait la tournée ? <u>Choisir</u>`}</button>`;
}
function renderTour() {
  const el = $('#v-tour'), T = UI.tour;
  if (!T.near && (!T.street || !streetOf(T.street))) { T.street = null; el.innerHTML = tourSetup(); return; }
  if (T.near && !Geo.pos) {
    Geo.start();
    el.innerHTML = `<div class="view-in"><div class="tour-top"><button class="chip" data-act="tour-pick">${ico('chev-l', 'sm')} Choisir une rue</button>${tourTeamLine()}</div><div class="empty"><b>Recherche de votre position…</b>Autorisez la localisation quand le téléphone le demande.</div></div>`;
    return;
  }
  const full = tourList();
  let cur = full.find((u) => u.id === T.cur);
  if (!cur) { cur = (T.open ? full.find((u) => OPEN.has(statusOf(u.id))) : full[0]) || full[0] || null; T.cur = cur?.id || null; TD = freshTD(T.cur); }
  const S = stats(), st = T.near ? null : streetOf(T.street), r = st ? S.byStreet.get(st.sk) : null;
  const remaining = full.filter((u) => OPEN.has(statusOf(u.id)));
  const head = `<div class="tour-top"><button class="chip" data-act="tour-pick">${ico('chev-l', 'sm')} ${T.near ? 'Autour de moi' : 'Changer de rue'}</button>${tourTeamLine()}</div>
    ${r ? `<div class="plaque street">${esc(st.name)}</div><div class="sr-top tour-stats"><span class="muted">${esc(st.com)} · <b>${r.visited}/${r.total}</b> foyers · ${remaining.length} à faire ou revoir</span><span class="amt">${eur(r.amount)}</span></div>${stackBar(r.st, r.total)}` : ''}`;
  if (!cur || (T.open && !remaining.length && !OPEN.has(statusOf(cur.id)) && TD.mode == null && !T.near)) {
    const team = Me.team(), zi = zoneIndex();
    const mine = zones().filter((z) => (z.members || []).some((m) => team.includes(m)));
    const sugg = streets().filter((x) => x.sk !== T.street && (!st || x.com === st.com || mine.length) && x.addrs.some((a) => unitsOf(a.id).some((u) => OPEN.has(statusOf(u.id))) && (!mine.length || mine.some((z) => zi.get(a.id) === z.id)))).slice(0, 5);
    el.innerHTML = `<div class="view-in">${head}<div class="card done-banner"><span class="display">${T.near ? 'Plus rien autour' : 'Rue terminée'}</span><p class="muted" style="margin:0">${T.near ? 'Aucune porte à faire à proximité.' : 'Tous les foyers de la rue ont une réponse. Bravo !'}</p>${sugg.length ? `<div class="lbl">Rues suivantes</div><div class="chips wrap" style="justify-content:center">${sugg.map((x) => `<button class="chip" data-act="tour-start" data-v="${esc(x.sk)}">${esc(x.name)}</button>`).join('')}</div>` : ''}<label class="switch"><input type="checkbox" id="tour-open" ${T.open ? 'checked' : ''}> Sauter les portes déjà faites</label></div></div>`;
    return;
  }
  if (TD.id !== cur.id) TD = freshTD(cur.id);
  const status = statusOf(cur.id), p = Store.s.passages[cur.id];
  const last = p?.hist?.length ? p.hist[p.hist.length - 1] : null;
  const dist = T.near && Geo.pos ? Math.round(distM([Geo.pos.lat, Geo.pos.lon], [cur.a.lat, cur.a.lon])) : null;
  el.innerHTML = `<div class="view-in">
    ${head}
    <article class="door-card" data-st="${status}">
      <div class="door-head">
        <div class="plaque num xl">${esc(cur.a.num)}</div>
        <div class="door-meta">
          <span class="side">${cur.a.even ? 'Côté pair' : 'Côté impair'}${dist != null ? ` · à ${dist} m` : ''}</span>
          ${T.near ? `<span class="street-name">${esc(cur.a.street)}</span><span class="side">${esc(cur.a.com)}</span>` : ''}
          ${cur.n > 1 ? `<span class="apt">${ico('door', 'sm')} ${esc(cur.label)} <small>· ${cur.k}/${cur.n}</small></span>` : ''}
          ${stPill(status)}
          ${last ? `<p>Dernier passage : ${STATUS[last.s].short.toLowerCase()}, ${dayLabel(isoDay(new Date(last.at))).toLowerCase()} ${hhmm(last.at)}${last.by?.length ? ' · ' + esc(names(last.by)) : ''}</p>` : ''}
          ${p?.rp?.date && OPEN.has(status) ? `<p>Repasse prévue : ${dayLabel(p.rp.date).toLowerCase()}${p.rp.slot ? ' · ' + SLOTS[p.rp.slot].toLowerCase() : ''}</p>` : ''}
          ${p?.rp?.note ? `<p>« ${esc(p.rp.note)} »</p>` : ''}${p?.note ? `<p>« ${esc(p.note)} »</p>` : ''}
          <button class="link" data-act="tour-bld" style="font-size:13.5px">${cur.n > 1 ? `Immeuble · ${cur.n} logements` : 'Plusieurs logements ?'}</button>
        </div>
      </div>
      ${TD.mode === 'done' ? tourDoneForm() : TD.mode === 'later' ? tourLaterForm() : tourActs()}
    </article>
    <div class="tour-nav">
      <button class="btn ghost" data-act="tour-prev">${ico('chev-l')} Précédente</button>
      <button class="btn ghost" data-act="tour-detail" aria-label="Fiche complète du foyer">Fiche</button>
      <button class="btn ghost" data-act="tour-next">Passer ${ico('chev-r')}</button>
    </div>
    ${T.near ? '' : `<div class="lbl">Foyers dans l'ordre de passage</div><div class="tour-strip">${full.map((u) => `<button class="dt sm" data-st="${statusOf(u.id)}" data-act="tour-go" data-id="${u.id}" aria-current="${u.id === cur.id}" aria-label="${esc(unitTitle(u))}">${esc(shortNum(u))}</button>`).join('')}</div>`}
    <div class="tour-opts">
      <label class="switch"><input type="checkbox" id="tour-open" ${T.open ? 'checked' : ''}> Sauter les portes déjà faites</label>
      ${T.near ? '' : `<div class="seg"><button data-act="tour-order" data-v="sides" aria-pressed="${T.order === 'sides'}">Un côté puis l'autre</button><button data-act="tour-order" data-v="asc" aria-pressed="${T.order === 'asc'}">1, 2, 3…</button></div>`}
    </div>
  </div>`;
  requestAnimationFrame(() => { const c = $('.tour-strip [aria-current="true"]'); if (c) c.parentElement.scrollLeft = c.offsetLeft - c.parentElement.clientWidth / 2 + 22; });
}
function tourActs() {
  return `<div class="acts">
    <button class="act big" data-st="done" data-act="td-mode" data-v="done">${ico('check')} Calendrier donné</button>
    <button class="act" data-st="absent" data-act="td-later" data-v="absent">${ico('absent')}Absent</button>
    <button class="act" data-st="repasse" data-act="td-later" data-v="repasse">${ico('repeat')}À repasser</button>
    <button class="act" data-st="refus" data-act="td-refus">${ico('ban')}Refus</button>
  </div>`;
}
function tourDoneForm() {
  const price = +Store.s.settings.price || 0;
  return `<div class="quick">
    <div class="row"><span class="lbl">Calendriers remis</span><div class="stepper" style="min-width:150px"><button data-act="td-cal" data-v="-1" aria-label="Un de moins">${ico('minus')}</button><b>${TD.cal}</b><button data-act="td-cal" data-v="1" aria-label="Un de plus">${ico('plus')}</button></div></div>
    <div class="lbl">Montant du don${price ? ` · conseillé ${eur(price * TD.cal)}` : ''}</div>
    <div class="amt-grid">${AMOUNTS.map((v) => `<button data-act="td-amt" data-v="${v}" aria-pressed="${TD.amt === v}">${v} €</button>`).join('')}<div class="money"><input id="td-amt" class="input" inputmode="decimal" placeholder="Autre" aria-label="Autre montant" value="${TD.amt != null && !AMOUNTS.includes(TD.amt) ? TD.amt : ''}"><span>€</span></div></div>
    <div class="lbl">Règlement</div>
    <div class="chips wrap">${Object.entries(PAY).map(([k, l]) => `<button class="chip" data-act="td-pay" data-v="${k}" aria-pressed="${TD.pay === k}">${l}</button>`).join('')}</div>
    <div class="grid2"><button class="btn ghost" data-act="td-mode" data-v="">Annuler</button><button class="btn green" id="td-ok" data-act="td-save-done" ${TD.amt == null ? 'disabled' : ''}>${ico('check')} ${TD.amt != null ? 'Valider ' + eur(TD.amt) : 'Choisir un montant'}</button></div>
  </div>`;
}
function tourLaterForm() {
  const abs = TD.status === 'absent';
  return `<div class="quick">
    <div class="lbl">${abs ? 'Personne — programmer une repasse ?' : 'Quand repasser ?'}</div>
    <div class="chips wrap">${abs ? `<button class="chip" data-act="td-rpdate" data-v="" aria-pressed="${!TD.rpDate}">Pas de repasse</button>` : ''}${dateChoices().map(([v, l]) => `<button class="chip" data-act="td-rpdate" data-v="${v}" aria-pressed="${TD.rpDate === v}">${l}</button>`).join('')}</div>
    ${TD.rpDate || !abs ? `<div class="chips wrap">${Object.entries(SLOTS).map(([k, l]) => `<button class="chip" data-act="td-slot" data-v="${k}" aria-pressed="${TD.rpSlot === k}">${l}</button>`).join('')}</div><input id="td-rpnote" class="input" placeholder="Note (ex. revenir après 18 h)" value="${esc(TD.rpNote)}" aria-label="Note pour la repasse">` : ''}
    <div class="grid2"><button class="btn ghost" data-act="td-mode" data-v="">Annuler</button><button class="btn st-btn" data-st="${TD.status}" data-act="td-save-later">Valider · suivante</button></div>
  </div>`;
}
function tourSetup() {
  const S = stats(), team = Me.team(), zi = zoneIndex();
  const mine = zones().filter((z) => (z.members || []).some((m) => team.includes(m)));
  const inMine = (st) => st.addrs.some((a) => mine.some((z) => zi.get(a.id) === z.id));
  const myStreets = mine.length ? streets().filter(inMine) : [];
  const openN = (st) => st.addrs.reduce((t, a) => t + unitsOf(a.id).filter((u) => OPEN.has(statusOf(u.id))).length, 0);
  const row = (st) => { const r = S.byStreet.get(st.sk), o = openN(st); return `<button class="street-row" data-act="tour-start" data-v="${esc(st.sk)}"><div class="sr-top"><b>${esc(st.name)}</b><span>${r.visited}/${r.total}</span></div>${stackBar(r.st, r.total, 'sm')}<div class="sr-foot"><span class="grow">${esc(st.com)} · ${o ? `${o} foyer${o > 1 ? 's' : ''} à faire ou revoir` : 'rue terminée'}</span>${r.members.size ? avatars([...r.members]) : ''}</div></button>`; };
  const others = streets().filter((st) => !myStreets.includes(st) && (!UI.com || st.com === UI.com)).sort((a, b) => (openN(a) ? 0 : 1) - (openN(b) ? 0 : 1) || a.ci - b.ci || sortKey(a.name).localeCompare(sortKey(b.name), 'fr'));
  return `<div class="view-in">
    <div class="tour-top">${tourTeamLine()}</div>
    <h2 class="display">Où tournez-vous ?</h2>
    <button class="near-btn" data-act="tour-near">${ico('locate')}<span><b>Portes autour de moi</b><small>Le GPS propose le foyer le plus proche à faire.</small></span></button>
    ${myStreets.length ? `<div class="lbl">Votre secteur · ${esc(mine.map((z) => z.name).join(', '))}</div><div class="street-list">${myStreets.map(row).join('')}</div>` : ''}
    <div class="lbl">${myStreets.length ? 'Autres rues' : 'Choisissez une rue'}</div>
    ${comChips('tour-com', UI.com)}
    <div class="street-list">${others.map(row).join('')}</div>
  </div>`;
}

// ═════════════════════════ Repasses
function renderRep() {
  const el = $('#v-rep'), list = repasses(), today = isoDay();
  const absNo = units().filter((u) => { const p = Store.s.passages[u.id]; return p?.status === 'absent' && !p.rp?.date; });
  const groups = new Map();
  for (const r of list) { const k = !r.date ? 'none' : r.date < today ? 'late' : r.date; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const keys = ['late', ...[...groups.keys()].filter((k) => k !== 'late' && k !== 'none').sort(), 'none'].filter((k) => groups.has(k));
  const due = (groups.get('late')?.length || 0) + (groups.get(today)?.length || 0);
  const title = (k) => (k === 'late' ? 'En retard' : k === 'none' ? 'À planifier' : dayLabel(k));
  const item = (r) => `<div class="rp-item"><span class="rp-slot">${r.slot ? SLOTS[r.slot] : r.date ? 'Journée' : '—'}</span><button class="rp-main" data-act="unit" data-id="${r.u.id}"><b>${esc(unitTitle(r.u))}</b><small>${esc([r.a.com, STATUS[r.p.status].short, r.p.rp?.note, r.date && r.date < today ? dayLabel(r.date) : '', names(r.p.by)].filter(Boolean).join(' · '))}</small></button><div class="rp-quick"><button class="chip" data-act="unit" data-id="${r.u.id}" data-status="done" aria-label="Calendrier donné">${ico('check', 'sm')}</button></div></div>`;
  const d1 = addDays(today, 1), sat = dateChoices().find((c) => c[1].startsWith('Samedi'));
  el.innerHTML = `<div class="view-in">
    <div class="tour-top"><div><h2 class="display">Repasses</h2><p class="muted" style="margin:6px 0 0">${list.length} programmée${list.length > 1 ? 's' : ''} · ${absNo.length} absent${absNo.length > 1 ? 's' : ''} sans date</p></div>${due ? `<button class="btn red" data-act="route-today">${ico('route')} Itinéraire du jour · ${due}</button>` : ''}</div>
    ${!list.length && !absNo.length ? '<div class="card empty"><b>Aucune repasse</b>Quand un foyer est absent ou à revoir, programmez la repasse depuis la tournée : elle apparaîtra ici, jour par jour.</div>' : ''}
    ${keys.map((k) => `<div class="rp-group ${k === 'late' ? 'late' : ''}"><h3>${title(k)} <small>${groups.get(k).length}${k !== 'late' && k !== 'none' && k !== today ? ' · ' + DOWL[new Date(k + 'T12:00:00').getDay()] : ''}</small></h3>${groups.get(k).map(item).join('')}</div>`).join('')}
    ${absNo.length ? `<div class="rp-group"><h3>Absents sans repasse <small>${absNo.length}</small></h3>${absNo.slice(0, 80).map((u) => { const p = Store.s.passages[u.id]; return `<div class="rp-item"><span class="rp-slot" style="color:var(--st-absent);background:color-mix(in srgb,var(--st-absent) 12%,transparent)">${dayShort(p.at)}</span><button class="rp-main" data-act="unit" data-id="${u.id}"><b>${esc(unitTitle(u))}</b><small>${esc([u.a.com, names(p.by)].filter(Boolean).join(' · '))}</small></button><div class="rp-quick"><button class="chip" data-act="rp-quick" data-id="${u.id}" data-v="${d1}">Demain</button>${sat ? `<button class="chip" data-act="rp-quick" data-id="${u.id}" data-v="${sat[0]}">Sam.</button>` : ''}</div></div>`; }).join('')}</div>` : ''}
  </div>`;
}

// ═════════════════════════ Équipe
function memberChips(act, selected, exclude = '') {
  return members().filter((m) => m.id !== exclude).map((m) => `<button class="chip mchip" data-act="${act}" data-v="${m.id}" aria-pressed="${selected.includes(m.id)}">${avatar(m.id, 'sm')} ${esc(m.name)}</button>`).join('');
}
function addMemberForm() {
  return `<form class="street-tools" data-form="add-member"><input class="input" name="mname" placeholder="Prénom et initiale (ex. Thomas K.)" autocomplete="off" aria-label="Nom du membre" required><button class="btn" type="submit">${ico('plus')} Ajouter</button></form>`;
}
function renderTeam() {
  const el = $('#v-team'), ms = members(), S = stats(), v = Me.get();
  if (!ms.length) { el.innerHTML = `<div class="view-in"><h2 class="display">Équipe</h2><section class="card"><div class="empty"><b>Aucun membre</b>Ajoutez les pompiers qui participent à la tournée.</div>${addMemberForm()}</section></div>`; return; }
  const ranked = [...ms].sort((a, b) => (S.byMember[b.id]?.doors || 0) - (S.byMember[a.id]?.doors || 0) || a.name.localeCompare(b.name, 'fr'));
  el.innerHTML = `<div class="view-in">
    <h2 class="display">Équipe</h2>
    <section class="card me-card">
      <div class="lbl">Sur ce téléphone, c'est</div>
      <div class="chips wrap">${memberChips('me-set', [v.me])}</div>
      <div class="lbl" style="margin-top:16px">En binôme avec</div>
      <div class="chips wrap"><button class="chip" data-act="partner-set" data-v="" aria-pressed="${!v.partner}">Seul</button>${memberChips('partner-set', [v.partner], v.me)}</div>
    </section>
    <section class="card"><div class="card-h"><h2>Classement</h2><span class="muted">passages · collecté</span></div>${ranked.map((m, i) => rankRow(m, S.byMember[m.id], i)).join('')}</section>
    <section class="card"><div class="card-h"><h2>Ajouter un membre</h2></div>${addMemberForm()}</section>
  </div>`;
}

// ═════════════════════════ Feuilles (bottom sheets)
const Sheet = {
  refresh: null, onClose: null,
  open(cls = '', onClose = null) {
    const root = $('#sheet');
    root.innerHTML = `<div class="sheet-bd" data-act="sheet-close"></div><div class="sheet-panel ${cls}" role="dialog" aria-modal="true"></div>`;
    root.hidden = false; this.onClose = onClose; this.refresh = null;
    return $('.sheet-panel', root);
  },
  close() { const root = $('#sheet'); if (root.hidden) return; root.hidden = true; root.innerHTML = ''; const f = this.onClose; this.onClose = null; this.refresh = null; f?.(); },
  get isOpen() { return !$('#sheet').hidden; },
  panel() { return $('#sheet .sheet-panel'); },
};
function zoneSelect(addrId) {
  const z = zoneOf(addrId);
  return `<div class="field"><label for="addr-zone">Secteur de cette adresse</label><select id="addr-zone" class="input" data-change="addr-zone" data-id="${addrId}"><option value="">${zones().length ? '— Sans secteur —' : 'Aucun secteur créé'}</option>${zones().map((x) => `<option value="${x.id}" ${z?.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`;
}
function openAddr(addrId, opts = {}) {
  const us = unitsOf(addrId); if (!us.length) return;
  if (us.length > 1) return openBuilding(addrId, opts);
  openUnit(us[0].id, opts);
}
let SS = null;
function openStreetSheet(sk) {
  const st = streetOf(sk); if (!st) return;
  SS = { sk };
  const panel = Sheet.open('street', () => { MapView.selStreet = null; MapView.draw(); SS = null; });
  MapView.selStreet = sk; MapView.draw();
  const draw = () => {
    if (!SS) return;
    const st2 = streetOf(SS.sk), r = stats().byStreet.get(SS.sk), zs = zones();
    const inZ = new Map();
    for (const a of st2.addrs) { const z = zoneOf(a.id); const k = z ? z.id : ''; inZ.set(k, (inZ.get(k) || 0) + 1); }
    const only = inZ.size === 1 ? [...inZ.keys()][0] : '';
    panel.innerHTML = `<div class="sheet-grab"></div>
    <header class="sheet-head"><div class="t"><b>${esc(st2.name)}</b><small>${esc(st2.com)} · ${st2.addrs.length} adresses · ${r.total} foyers</small></div><button class="icon-btn" data-act="sheet-close" aria-label="Fermer">${ico('x')}</button></header>
    <div class="sheet-body">
      ${stackBar(r.st, r.total)}
      <div class="kpis">
        <div class="kpi"><b>${pct(r.visited, r.total)} %</b><span>${r.visited} / ${r.total} foyers</span></div>
        <div class="kpi"><b>${eur(r.amount)}</b><span>collectés</span></div>
        <div class="kpi"><b>${r.st.todo}</b><span>à faire</span></div>
        <div class="kpi"><b>${r.st.absent + r.st.repasse}</b><span>absents · repasses</span></div>
      </div>
      <div class="field"><label for="st-zone">Secteur de toute la rue</label>
        <select id="st-zone" class="input" data-change="street-zone" data-sk="${esc(SS.sk)}">
          <option value="">${zs.length ? '— Sans secteur —' : 'Aucun secteur créé'}</option>
          ${zs.map((z) => `<option value="${z.id}" ${only === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}
        </select>
        <small class="muted">${inZ.size > 1 ? `Partagée entre ${inZ.size} secteurs : choisir en range ${st2.addrs.length > 1 ? 'toutes les adresses' : "l'adresse"} dans un seul.` : 'Toutes les adresses de la rue suivront ce choix.'}</small>
      </div>
      ${zs.length ? '' : `<button class="btn ghost block" data-act="street-newzone" data-v="${esc(SS.sk)}">${ico('plus')} Créer un secteur avec cette rue</button>`}
      <div class="grid2">
        <button class="btn ghost" data-act="street-houses" data-v="${esc(SS.sk)}">${ico('grid')} Les maisons</button>
        <button class="btn ghost" data-act="street-zoom" data-v="${esc(SS.sk)}">${ico('expand')} Cadrer</button>
      </div>
    </div>
    <footer class="sheet-foot"><button class="btn red block" data-act="tour-start" data-v="${esc(SS.sk)}">${ico('door')} Démarrer la tournée ici</button></footer>`;
  };
  draw(); Sheet.refresh = draw;
}
let BS = null;
function openBuilding(addrId, opts = {}) {
  BS = { id: addrId, opts };
  const panel = Sheet.open('bld', () => { MapView.sel = null; MapView.draw(); BS = null; });
  MapView.sel = addrId; MapView.draw();
  const draw = () => {
    if (!BS) return;
    const a = addrIdx().get(BS.id), us = unitsOf(BS.id), c = addrSt(BS.id);
    panel.innerHTML = `<div class="sheet-grab"></div>
    <header class="sheet-head"><div class="plaque num">${esc(a.num)}</div><div class="t"><b>${esc(a.street)}</b><small>${esc(a.com)} · ${us.length > 1 ? `immeuble de ${us.length} logements` : 'maison'}</small></div><button class="icon-btn" data-act="sheet-close" aria-label="Fermer">${ico('x')}</button></header>
    <div class="sheet-body">
      <div class="set-row" style="border:0;padding:0"><div class="t"><b>Logements à cette adresse</b><small>Chaque logement a son propre statut et ses repasses.</small></div><div class="stepper" style="min-width:150px"><button data-act="bld-n" data-v="-1" aria-label="Un logement de moins">${ico('minus')}</button><b>${us.length}</b><button data-act="bld-n" data-v="1" aria-label="Un logement de plus">${ico('plus')}</button></div></div>
      ${us.length > 1 ? `${stackBar(c, us.length)}<div class="unit-grid">${us.map((u) => { const st = statusOf(u.id); return `<button class="unit" data-st="${st}" data-act="unit" data-id="${u.id}"><b>${esc(u.label)}</b><span class="st-pill" data-st="${st}">${STATUS[st].short}</span></button>`; }).join('')}</div>` : `<button class="btn block" data-act="unit" data-id="${us[0].id}">Noter le passage</button>`}
      ${zoneSelect(BS.id)}
    </div>`;
  };
  draw(); Sheet.refresh = draw;
}
let AS = null;
function openUnit(unitId, opts = {}) {
  const u = unitIdx().get(unitId); if (!u) return;
  const p = Store.s.passages[unitId], team = Me.team();
  AS = {
    id: unitId, opts, d: {
      status: opts.status || (p && p.status !== 'todo' ? p.status : null),
      cal: p?.cal || 1, amt: p?.status === 'done' ? p.amt : '', pay: p?.pay || 'especes', chq: p?.chq || '',
      name: p?.name || '', note: p?.note || '',
      rp: p?.rp ? { date: p.rp.date || '', slot: p.rp.slot || '', note: p.rp.note || '' } : { date: '', slot: '', note: '' },
      by: team.length ? team : [...(p?.by || [])],
    },
  };
  if (AS.d.status === 'repasse' && !AS.d.rp.date) AS.d.rp.date = addDays(isoDay(), 1);
  Sheet.open('addr', () => { MapView.sel = null; MapView.draw(); AS = null; });
  MapView.sel = u.a.id; MapView.draw();
  drawUnitSheet();
}
function drawUnitSheet() {
  if (!AS) return;
  const { id, d, opts } = AS, u = unitIdx().get(id), a = u.a, p = Store.s.passages[id], z = zoneOf(a.id);
  const panel = Sheet.panel(); if (!panel) return;
  const sc = $('.sheet-body', panel)?.scrollTop || 0;
  const price = +Store.s.settings.price || 0;
  const needAmt = d.status === 'done' && String(d.amt).trim() === '';
  panel.innerHTML = `<div class="sheet-grab"></div>
  <header class="sheet-head">
    ${u.n > 1 ? `<button class="icon-btn" data-act="as-bld" aria-label="Retour à l'immeuble">${ico('chev-l')}</button>` : ''}
    <div class="plaque num">${esc(a.num)}</div>
    <div class="t"><b>${esc(a.street)}</b><small>${u.n > 1 ? `<span class="apt sm">${esc(u.label)} · ${u.k}/${u.n}</span>` : ''}${esc(a.com)} · ${a.even ? 'pair' : 'impair'}${z ? ` · <span class="zdot" style="--c:${z.color}"></span>${esc(z.name)}` : ''}${p && p.status !== 'todo' ? ' · ' + stPill(p.status) : ''}</small></div>
    <button class="icon-btn" data-act="sheet-close" aria-label="Fermer">${ico('x')}</button>
  </header>
  <div class="sheet-body">
    <div class="st-pick">${['done', 'absent', 'repasse', 'refus'].map((k) => `<button class="st-opt" data-st="${k}" data-act="as-status" data-v="${k}" aria-pressed="${d.status === k}">${ico(STATUS[k].icon)}<span>${STATUS[k].label}</span></button>`).join('')}</div>
    ${d.status === 'done' ? `
      <div class="grid2">
        <div class="field"><span class="lbl">Calendriers</span><div class="stepper"><button data-act="as-cal" data-v="-1" aria-label="Un de moins">${ico('minus')}</button><b>${d.cal}</b><button data-act="as-cal" data-v="1" aria-label="Un de plus">${ico('plus')}</button></div></div>
        <div class="field"><label for="as-amt">Montant</label><div class="money"><input id="as-amt" class="input" inputmode="decimal" data-bind="amt" value="${esc(d.amt)}" placeholder="${price ? price * d.cal : 0}"><span>€</span></div></div>
      </div>
      <div class="chips wrap">${AMOUNTS.map((v) => `<button class="chip" data-act="as-amt" data-v="${v}" aria-pressed="${num(d.amt) === v && String(d.amt) !== ''}">${v} €</button>`).join('')}</div>
      <div class="field"><span class="lbl">Règlement</span><div class="chips wrap">${Object.entries(PAY).map(([k, l]) => `<button class="chip" data-act="as-pay" data-v="${k}" aria-pressed="${d.pay === k}">${l}</button>`).join('')}</div></div>
      ${d.pay === 'cheque' ? `<div class="field"><label for="as-chq">N° de chèque (facultatif)</label><input id="as-chq" class="input" data-bind="chq" value="${esc(d.chq)}" inputmode="numeric"></div>` : ''}` : ''}
    ${d.status === 'absent' || d.status === 'repasse' ? `
      <div class="field"><span class="lbl">${d.status === 'absent' ? 'Programmer une repasse (facultatif)' : 'Quand repasser ?'}</span>
        <div class="chips wrap">${d.status === 'absent' ? `<button class="chip" data-act="as-rpdate" data-v="" aria-pressed="${!d.rp.date}">Pas de repasse</button>` : ''}${dateChoices().map(([v, l]) => `<button class="chip" data-act="as-rpdate" data-v="${v}" aria-pressed="${d.rp.date === v}">${l}</button>`).join('')}<label class="chip date-chip">${ico('cal', 'sm')}<input type="date" data-bind="rp.date" value="${esc(d.rp.date)}" aria-label="Autre date"></label></div>
      </div>
      <div class="chips wrap">${Object.entries(SLOTS).map(([k, l]) => `<button class="chip" data-act="as-slot" data-v="${k}" aria-pressed="${d.rp.slot === k}">${l}</button>`).join('')}</div>
      <input class="input" data-bind="rp.note" value="${esc(d.rp.note)}" placeholder="Ex. revenir après 18 h, sonner derrière" aria-label="Consigne pour la repasse">` : ''}
    <details class="more" ${d.name || d.note ? 'open' : ''}><summary>Occupant et note</summary><div>
      <div class="field"><label for="as-name">Nom (facultatif)</label><input id="as-name" class="input" data-bind="name" value="${esc(d.name)}" placeholder="Seulement si utile (reçu, fidèle donateur)"></div>
      <div class="field"><label for="as-note">Note</label><textarea id="as-note" class="input" data-bind="note" rows="2" placeholder="Ex. boîte aux lettres à l'arrière">${esc(d.note)}</textarea></div>
    </div></details>
    <div class="field"><span class="lbl">Passage effectué par</span><div class="chips wrap">${members().length ? memberChips('as-by', d.by) : '<span class="muted">Ajoutez l’équipe dans l’onglet Équipe.</span>'}</div></div>
    ${p?.hist?.length ? `<div class="field"><span class="lbl">Historique du foyer</span><div class="timeline">${[...p.hist].reverse().map((h) => `<div class="tl" data-st="${h.s}"><b>${STATUS[h.s].short}</b><span class="muted">${dayLabel(isoDay(new Date(h.at)))} ${hhmm(h.at)}${h.by?.length ? ' · ' + esc(names(h.by)) : ''}${h.s === 'done' ? ` · ${eur(h.amt)}${h.pay ? ' ' + PAY_SHORT[h.pay] : ''}` : ''}</span></div>`).join('')}</div></div>` : ''}
    <details class="more"><summary>Habitation et secteur</summary><div>
      ${u.n > 1
        ? `<div class="field"><label for="unit-label">Repère du logement</label><input id="unit-label" class="input" data-change="unit-label" data-id="${a.id}" data-k="${u.k}" value="${esc(u.label)}" placeholder="Ex. 1er étage gauche"></div><button class="btn ghost" data-act="as-bld">${ico('door')} Gérer l'immeuble · ${u.n} logements</button>`
        : '<div class="set-row" style="border:0;padding:0"><div class="t"><b>Maison individuelle</b><small>Un immeuble ? Indiquez le nombre de logements.</small></div><button class="btn ghost sm" data-act="as-bld">Plusieurs logements</button></div>'}
      ${zoneSelect(a.id)}
    </div></details>
    ${p && p.status !== 'todo' ? '<button class="link danger" data-act="as-reset" style="justify-self:start">Remettre le foyer à « À faire »</button>' : ''}
  </div>
  <footer class="sheet-foot">
    ${opts.tour ? '' : `<button class="btn ghost" data-act="as-tour" aria-label="Démarrer la tournée à ce foyer">${ico('door')}</button>`}
    <button class="btn block" data-act="as-save" ${!d.status || needAmt ? 'disabled' : ''}>${!d.status ? 'Choisissez un résultat' : needAmt ? 'Indiquez le montant' : 'Enregistrer'}</button>
  </footer>`;
  $('.sheet-body', panel).scrollTop = sc;
}
function asSave() {
  if (!AS || !AS.d.status) return;
  const { id, d, opts } = AS, u = unitIdx().get(id);
  const prev = savePassage(id, d);
  vibrate(18); Sheet.close();
  toast(`${unitTitle(u)} · ${STATUS[d.status].short}${d.status === 'done' ? ' · ' + eur(num(d.amt)) : ''}`, { undo: () => restorePassage(id, prev) });
  if (opts.tour && UI.tour.cur === id && d.status !== 'todo') tourNext(1);
  App.changed();
}
function openMeSheet() {
  const panel = Sheet.open('me');
  const draw = () => {
    const ms = members(), v = Me.get();
    panel.innerHTML = `<div class="sheet-grab"></div>
    <header class="sheet-head"><div class="t"><b>Qui fait la tournée ?</b><small>Les passages notés sur ce téléphone seront attribués à ces personnes.</small></div><button class="icon-btn" data-act="sheet-close" aria-label="Fermer">${ico('x')}</button></header>
    <div class="sheet-body">${ms.length ? `
      <div class="field"><span class="lbl">C'est moi</span><div class="chips wrap">${memberChips('me-set', [v.me])}</div></div>
      <div class="field"><span class="lbl">En binôme avec</span><div class="chips wrap"><button class="chip" data-act="partner-set" data-v="" aria-pressed="${!v.partner}">Seul</button>${memberChips('partner-set', [v.partner], v.me)}</div></div>` : '<div class="empty"><b>Pas encore d’équipe</b>Ajoutez les membres dans l’onglet Équipe.</div>'}
    </div>
    <footer class="sheet-foot">${ms.length ? '<button class="btn block" data-act="sheet-close">Valider</button>' : '<button class="btn block" data-act="go" data-v="team">Ajouter l’équipe</button>'}</footer>`;
  };
  draw(); Sheet.refresh = draw;
}

// ═════════════════════════ Pages plein écran
const Page = {
  cur: null, args: {},
  open(name, args = {}) { this.cur = name; this.args = args; $('#page').hidden = false; this.render(true); if (args.sec) requestAnimationFrame(() => $('#sec-' + args.sec)?.scrollIntoView({ block: 'start' })); },
  close() { this.cur = null; $('#page').hidden = true; $('#page').innerHTML = ''; App.changed(); },
  render(reset) {
    const root = $('#page'), { title, body, bare, foot } = PAGES[this.cur](this.args);
    const sc = reset ? 0 : $('.page-body', root)?.scrollTop || 0;
    root.innerHTML = `${bare ? '' : `<header class="page-head"><button class="icon-btn" data-act="page-close" aria-label="Retour">${ico('chev-l')}</button><h2>${esc(title)}</h2></header>`}<div class="page-body${bare ? ' bare' : ''}">${body}</div>${foot ? `<footer class="page-foot">${foot}</footer>` : ''}`;
    $('.page-body', root).scrollTop = sc;
  },
  refresh() { if (!this.cur) return; const ae = document.activeElement; if (ae && $('#page').contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return; this.render(false); },
  set(patch) { Object.assign(this.args, patch); this.render(false); },
};
const PAGES = {};

PAGES.settings = (args) => {
  const set = Store.s.settings, zs = zones(), S = stats(), theme = LS.get(K.theme, 'auto'), miss = unassigned().length, A0 = addrs().length;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return {
    title: 'Réglages',
    body: `<div class="stackv">
    <section class="card" id="sec-campaign"><div class="card-h"><h2>Campagne</h2></div>
      <div class="grid2">
        <div class="field" style="grid-column:1/-1"><label for="set-name">Nom affiché</label><input id="set-name" class="input" data-set="name" value="${esc(set.name || '')}"></div>
        <div class="field"><label for="set-goal">Objectif (€)</label><input id="set-goal" class="input" inputmode="numeric" data-set="goal" value="${set.goal || ''}"></div>
        <div class="field"><label for="set-price">Don conseillé (€)</label><input id="set-price" class="input" inputmode="decimal" data-set="price" value="${set.price || ''}"></div>
      </div>
    </section>
    <section class="card" id="sec-zones"><div class="card-h"><h2>Secteurs</h2><span class="muted">${zs.length || 'aucun'}</span></div>
      ${zs.length ? `<div class="coverage ${miss ? 'warn' : 'ok'}"><div class="cov-bar"><i style="width:${pct(A0 - miss, A0)}%"></i></div><p>${miss ? `<b>${miss} adresse${miss > 1 ? 's' : ''} sans secteur</b> sur ${A0}.` : `<b>Toutes les adresses sont dans un secteur.</b> ${A0} sur ${A0}.`}</p>${miss ? '<button class="btn sm" data-act="page" data-v="unassigned">Répartir les oubliées</button>' : ''}</div>` : ''}
      ${zs.map((z) => { const bz = S.byZone[z.id] || { total: 0, visited: 0 }; return `<button class="mini-row" data-act="zone-edit" data-v="${z.id}"><span class="zdot" style="--c:${z.color};width:16px;height:16px"></span><span class="grow"><b>${esc(z.name)}</b><small>${(z.addrs || []).length} adresses · ${bz.total} foyers · ${pct(bz.visited, bz.total)} % visités · ${esc(names(z.members)) || 'aucun binôme'}</small></span>${ico('chev-r', 'sm')}</button>`; }).join('')}
      <div class="grid2" style="margin-top:12px">
        <button class="btn" data-act="zone-new">${ico('plus')} Par rue</button>
        <button class="btn ghost" data-act="draw-start">${ico('pen')} Entourer</button>
      </div>
      <button class="btn ghost block" style="margin-top:8px" data-act="auto-open" aria-pressed="${!!args.auto}">${ico('sparkle')} Découpage automatique</button>
      ${args.auto ? `<div class="quick" style="margin-top:14px">
        <button class="btn block" data-act="auto-com">Un secteur par commune (${COMMUNES.length})</button>
        <div class="note-box">Ou un découpage équilibré : les rues restent entières, chaque secteur a à peu près le même nombre de foyers.</div>
        <div class="set-row" style="border:0"><div class="t"><b>Nombre de secteurs</b><small>≈ ${Math.round(S.total / (args.n || 6))} foyers chacun</small></div><div class="stepper" style="min-width:150px"><button data-act="auto-n" data-v="-1" aria-label="Un de moins">${ico('minus')}</button><b>${args.n || 6}</b><button data-act="auto-n" data-v="1" aria-label="Un de plus">${ico('plus')}</button></div></div>
        <button class="btn ghost block" data-act="auto-go">${zs.length ? `Remplacer les ${zs.length} secteurs actuels` : 'Créer les secteurs'}</button>
      </div>` : ''}
    </section>
    <section class="card" id="sec-sync">${syncSection()}</section>
    <section class="card" id="sec-addr"><div class="card-h"><h2>Adresse manquante</h2></div>
      <form data-form="add-addr" class="grid2">
        <div class="field" style="grid-column:1/-1"><label for="aa-com">Commune</label><select id="aa-com" name="com" class="input">${COMMUNES.map((c) => `<option ${UI.com === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field" style="grid-column:1/-1"><label for="aa-street">Rue</label><input id="aa-street" name="street" class="input" list="street-dl" required autocomplete="off"><datalist id="street-dl">${[...new Set(streets().map((st) => st.name))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
        <div class="field"><label for="aa-num">Numéro</label><input id="aa-num" name="num" class="input" required placeholder="12 bis" autocomplete="off"></div>
        <div class="field"><span class="lbl">&nbsp;</span><button class="btn" type="submit">${ico('plus')} Ajouter</button></div>
      </form>
      <p class="muted" style="margin:10px 0 0;font-size:13px">Nouvelle construction absente de la base : elle est placée près des numéros voisins.</p>
    </section>
    <section class="card" id="sec-data"><div class="card-h"><h2>Données</h2></div>
      <div class="set-row"><div class="t"><b>Export pour le trésorier</b><small>Tableau Excel (CSV) : un foyer par ligne, montants, règlements, n° de chèque</small></div><button class="btn sm ghost" data-act="export-csv">${ico('download', 'sm')} CSV</button></div>
      <div class="set-row"><div class="t"><b>Sauvegarde complète</b><small>Fichier à garder en lieu sûr</small></div><button class="btn sm ghost" data-act="export-json">${ico('download', 'sm')} Sauver</button></div>
      <div class="set-row"><div class="t"><b>Restaurer une sauvegarde</b><small>Fusionne avec les données actuelles</small></div><button class="btn sm ghost" data-act="import-json">${ico('upload', 'sm')} Importer</button></div>
      <div class="set-row"><div class="t"><b>Mode démo</b><small>${Store.demoOn ? 'Actif : données fictives' : 'Explorer l’app avec des données fictives'}</small></div><button class="btn sm ghost" data-act="${Store.demoOn ? 'demo-exit' : 'demo-enter'}">${Store.demoOn ? 'Quitter' : 'Lancer'}</button></div>
      <div class="set-row"><div class="t"><b>Effacer ce téléphone</b><small>Supprime les données locales. Celles déjà envoyées restent dans la feuille Google.</small></div><button class="btn sm ghost" data-act="reset-ask">${ico('trash', 'sm')} Effacer</button></div>
      ${args.reset ? `<div class="confirm"><p>Effacer toutes les données de ce téléphone ? Faites d'abord une sauvegarde si l'équipe n'est pas synchronisée.</p><div class="grid2"><button class="btn ghost" data-act="reset-no">Annuler</button><button class="btn red" data-act="reset-yes">Tout effacer</button></div></div>` : ''}
    </section>
    <section class="card"><div class="card-h"><h2>Affichage</h2></div>
      <div class="seg" style="width:100%">${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<button data-act="theme" data-v="${v}" aria-pressed="${theme === v}">${l}</button>`).join('')}</div>
      ${standalone ? '' : App.installPrompt ? `<button class="btn block" style="margin-top:12px" data-act="install">${ico('download')} Installer l'app sur ce téléphone</button>` : `<div class="note-box" style="margin-top:12px">${ios ? 'Sur iPhone : touchez le bouton Partager de Safari, puis « Sur l’écran d’accueil ». L’app s’ouvrira en plein écran, même sans réseau.' : 'Dans le menu du navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».'}</div>`}
    </section>
    <p class="muted" style="font-size:12.5px;margin:0">Adresses : Base Adresse Nationale (${COMMUNES.join(', ')}), ${BASE_ADDRS.length} adresses. Plan : © contributeurs OpenStreetMap. Photo aérienne : © IGN.</p>
  </div>`,
  };
};
function syncSection() {
  const configured = Sync.configured, code = Sync.code;
  const lbl = Store.demoOn ? 'démo' : { local: 'non reliée', online: 'en ligne', syncing: 'synchro…', offline: 'hors ligne', error: 'erreur' }[Sync.state];
  let h = `<div class="card-h"><h2>Équipe connectée</h2><span class="muted">${lbl}</span></div>`;
  if (!configured) {
    h += `<div class="note-box">Toutes les données de l'équipe se rassemblent dans <b>une feuille Google Sheets</b> de votre Drive : gratuit, sans limite pour une amicale, et le trésorier voit tout dans le tableau. Mise en place en 5 minutes, une seule fois, par le chef d'équipe (voir <code>README.md</code>) :</div>
    <ol class="steps"><li>Créez une feuille sur <b>sheets.new</b>.</li><li>Menu <b>Extensions › Apps Script</b> : collez le fichier <code>google-apps-script/Code.gs</code> et enregistrez.</li><li><b>Déployer › Nouveau déploiement › Application Web</b> : exécuter en tant que « Moi », accès « Tout le monde », puis autorisez.</li><li>Collez ci-dessous l'adresse qui finit par <b>/exec</b>.</li></ol>
    <form class="street-tools" data-form="sheet-url"><input class="input" name="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" aria-label="Adresse du script Google" required><button class="btn" type="submit">Relier</button></form>`;
  } else if (!code) {
    h += `<p style="margin:0 0 12px">Feuille reliée. Créez le code de l'équipe pour commencer à partager les données.</p><button class="btn block" data-act="code-create">Créer le code de l'équipe</button>`;
  }
  if (configured && code) {
    h += `<div style="display:grid;gap:12px"><div class="code-box">${esc(code)}</div><div class="qr">${qrSvg(joinLink())}</div><p class="muted" style="text-align:center;margin:0;font-size:13.5px">Les autres pompiers scannent ce QR code avec l'appareil photo de leur téléphone : l'app s'ouvre déjà reliée à l'équipe.</p>
      <div class="grid2"><button class="btn ghost" data-act="share-link">${ico('link')} Partager le lien</button><button class="btn ghost" data-act="sync-now">${ico('repeat')} Synchroniser</button></div>
      ${Sync.sheet ? `<a class="btn ghost" href="${esc(Sync.sheet)}" target="_blank" rel="noopener">${ico('grid')} Ouvrir la feuille Google</a>` : ''}
      <div class="set-row" style="border:0;padding-bottom:0"><div class="t"><b>${Sync.pending ? `${Sync.pending} modification${Sync.pending > 1 ? 's' : ''} en attente d'envoi` : 'Tout est envoyé'}</b><small>${Sync.lastOk ? 'Dernière synchro à ' + hhmm(Sync.lastOk) : 'Pas encore synchronisé'}${Sync.err ? ' · ' + esc(Sync.err) : ''}</small></div></div></div>`;
  }
  h += `<details class="more" style="margin-top:12px"><summary>Rejoindre une équipe existante</summary><div><form data-form="join" style="display:grid;gap:10px"><input class="input" name="url" placeholder="Adresse de la feuille (…/exec)" value="${esc(Sync.url())}" autocomplete="off" aria-label="Adresse du script Google"><input class="input" name="code" placeholder="SEP-XXXX-XXXX" autocomplete="off" autocapitalize="characters" aria-label="Code d'équipe"><button class="btn" type="submit">Rejoindre</button></form><p class="muted" style="margin:0;font-size:13px">Plus simple : scannez le QR code du chef d'équipe.</p></div></details>`;
  if (configured) h += `<details class="more" style="margin-top:6px"><summary>Changer de feuille</summary><div><form class="street-tools" data-form="sheet-url"><input class="input" name="url" value="${esc(Sync.url())}" autocomplete="off" aria-label="Adresse du script Google"><button class="btn ghost" type="submit">Enregistrer</button></form></div></details>`;
  return h;
}
PAGES.history = (args) => {
  const f = args.f || 'all', m = args.m || '';
  const ev = events().filter((e) => (f === 'all' || e.h.s === f) && (!m || (e.h.by || []).includes(m))).slice(0, 400);
  const groups = new Map();
  for (const e of ev) { const k = isoDay(new Date(e.h.at)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  return {
    title: 'Historique',
    body: `<div class="stackv">
      <div class="chips scroll-x">${['all', 'done', 'absent', 'repasse', 'refus'].map((k) => `<button class="chip" data-act="hist-f" data-v="${k}" aria-pressed="${f === k}">${k === 'all' ? 'Tout' : `<span class="dot" data-st="${k}"></span>${STATUS[k].short}`}</button>`).join('')}</div>
      ${members().length ? `<select class="input" data-change="hist-member" aria-label="Membre"><option value="">Toute l'équipe</option>${members().map((x) => `<option value="${x.id}" ${m === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
      ${ev.length ? [...groups].map(([k, list]) => `<section class="card"><div class="card-h"><h2>${dayLabel(k)}</h2><span class="muted">${list.length} passages · ${eur(sum(list.filter((e) => e.h.s === 'done'), (e) => e.h.amt))}</span></div><div class="mini-list" style="margin-top:0;border-top:0">${list.map((e) => evRow(e, true)).join('')}</div></section>`).join('') : '<div class="card empty"><b>Rien à afficher</b>Aucun passage ne correspond au filtre.</div>'}
    </div>`,
  };
};
PAGES.member = ({ id, confirm }) => {
  const m = member(id);
  if (!m) return { title: 'Membre', body: '<div class="card empty"><b>Membre introuvable</b></div>' };
  const S = stats(), bm = S.byMember[id] || { doors: 0, amount: 0, cal: 0, streets: new Map() };
  const sts = [...bm.streets.entries()].sort((a, b) => b[1].length - a[1].length);
  const recent = events().filter((e) => (e.h.by || []).includes(id)).slice(0, 12);
  const zn = zones().filter((z) => (z.members || []).includes(id));
  return {
    title: m.name,
    body: `<div class="stackv">
      <section class="card" style="display:flex;gap:14px;align-items:center">${avatar(id, 'lg')}<div class="field" style="flex:1"><label for="mem-name">Nom</label><input id="mem-name" class="input" data-member="${id}" value="${esc(m.name)}"></div></section>
      <div class="kpis">
        <div class="kpi card"><b>${bm.doors}</b><span>passages</span></div>
        <div class="kpi card"><b>${nf(bm.cal)}</b><span>calendriers</span></div>
        <div class="kpi card"><b>${eur(Math.round(bm.amount))}</b><span>collectés</span></div>
        <div class="kpi card"><b>${sts.length}</b><span>rues</span></div>
      </div>
      <p class="muted" style="margin:0;font-size:13px">En binôme, les montants sont partagés à parts égales. Secteur : ${esc(zn.map((z) => z.name).join(', ') || 'aucun')}.</p>
      <section class="card"><div class="card-h"><h2>Rues et maisons</h2><span class="muted">${sts.length} rues</span></div>
        ${sts.length ? sts.map(([sk, list]) => { const st = streetOf(sk); return `<div style="padding:10px 0;border-bottom:1px solid var(--line);display:grid;gap:8px"><div class="sr-top"><b>${esc(st?.name || sk)} <small class="muted" style="font-weight:600">${esc(st?.com || '')}</small></b><span class="muted" style="font:600 13px var(--f-body)">${list.length} foyer${list.length > 1 ? 's' : ''}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap">${[...list].sort((x, y) => numCmp(x.a, y.a) || x.k - y.k).map((u) => `<button class="dt sm" data-st="${statusOf(u.id)}" data-act="unit" data-id="${u.id}" aria-label="${esc(unitTitle(u))}">${esc(shortNum(u))}</button>`).join('')}</div></div>`; }).join('') : '<p class="muted" style="margin:0">Aucun passage enregistré.</p>'}
      </section>
      <section class="card"><div class="card-h"><h2>Derniers passages</h2></div>${recent.length ? `<div class="mini-list" style="margin-top:0;border-top:0">${recent.map((e) => evRow(e)).join('')}</div>` : '<p class="muted" style="margin:0">—</p>'}</section>
      <section class="card"><div class="card-h"><h2>Couleur</h2></div><div class="swatches">${PALETTE.map((c) => `<button style="--c:${c}" data-act="mem-color" data-id="${id}" data-v="${c}" aria-pressed="${m.color === c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
        <div style="margin-top:16px">${confirm ? `<div class="confirm"><p>Retirer ${esc(m.name)} de l'équipe ? Ses passages restent dans l'historique.</p><div class="grid2"><button class="btn ghost" data-act="mem-del-no">Annuler</button><button class="btn red" data-act="mem-del" data-id="${id}">Retirer</button></div></div>` : '<button class="link danger" data-act="mem-del-ask">Retirer de l’équipe</button>'}</div>
      </section>
    </div>`,
  };
};

// ───────── Éditeur de secteur : par rue, côté, maison, ou en entourant sur la carte
let ZE = null;
const newZE = () => ({ id: null, name: `Secteur ${zones().length + 1}`, color: ZONE_COLORS[zones().length % ZONE_COLORS.length], members: [], addrs: new Set(), order: zones().length, q: '', com: UI.com || '', only: false, open: new Set(), confirm: false, fromPage: false });
function openZoneEditor(z) {
  ZE = { ...newZE(), id: z.id, name: z.name, color: z.color, members: [...(z.members || [])], addrs: new Set(z.addrs || []), order: z.order ?? 0 };
  const coms = comsOf([...ZE.addrs]); if (coms.length === 1) ZE.com = coms[0];
  Sheet.close(); Page.open('zone');
}
PAGES.zone = () => {
  if (!ZE) return { title: 'Secteur', body: '' };
  const zi = zoneIndex(), q = norm(ZE.q), sel = ZE.addrs;
  const nUnits = sum([...sel], (id) => unitsOf(id).length);
  const stInZone = streets().filter((st) => st.addrs.some((a) => sel.has(a.id)));
  const counts = { '': streets().length };
  for (const st of streets()) counts[st.com] = (counts[st.com] || 0) + 1;
  const list = streets().filter((st) => (!ZE.com || st.com === ZE.com) && (!q || norm(st.name + ' ' + st.com).includes(q)) && (!ZE.only || st.addrs.some((a) => sel.has(a.id))));
  const row = (st) => {
    const inZ = st.addrs.filter((a) => sel.has(a.id)).length, tot = st.addrs.length;
    const others = {};
    for (const a of st.addrs) if (!sel.has(a.id)) { const o = zi.get(a.id); if (o && o !== ZE.id) others[o] = (others[o] || 0) + 1; }
    const free = st.addrs.filter((a) => !sel.has(a.id) && (!zi.get(a.id) || zi.get(a.id) === ZE.id)).length;
    const state = inZ === tot ? 'all' : inZ ? 'some' : 'none';
    const open = ZE.open.has(st.sk);
    return `<div class="zs-row" data-state="${state}">
      <button class="zs-check" data-act="ze-street" data-v="${esc(st.sk)}" aria-pressed="${state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false'}" aria-label="${state === 'all' ? 'Retirer' : 'Ajouter'} toute la rue ${esc(st.name)}" style="--c:${ZE.color}">${state === 'all' ? ico('check', 'sm') : state === 'some' ? ico('minus', 'sm') : ''}</button>
      <button class="zs-name" data-act="ze-open" data-v="${esc(st.sk)}" aria-expanded="${open}"><span><b>${esc(st.name)}</b><small>${ZE.com ? '' : esc(st.com) + ' · '}${inZ}/${tot} adresses${Object.entries(others).map(([o, n]) => ` · <span class="zdot" style="--c:${Store.s.zones[o]?.color}"></span>${n} dans ${esc(Store.s.zones[o]?.name || '?')}`).join('')}${free && !inZ ? ` · <b class="free">${free} sans secteur</b>` : ''}</small></span>${ico(open ? 'minus' : 'plus', 'sm')}</button>
    </div>
    ${open ? `<div class="zs-doors"><div class="chips wrap">${[['all', 'Toute la rue'], ['odd', 'Côté impair'], ['even', 'Côté pair'], ['none', 'Aucune']].map(([m, l]) => `<button class="chip" data-act="ze-quick" data-v="${esc(st.sk)}" data-m="${m}">${l}</button>`).join('')}</div>
      <div class="doors">${st.addrs.map((a) => { const o = sel.has(a.id) ? 'on' : zi.get(a.id) && zi.get(a.id) !== ZE.id ? 'other' : 'free'; const oc = o === 'other' ? Store.s.zones[zi.get(a.id)]?.color : ZE.color; const nU = unitsOf(a.id).length; return `<button class="zt ${o}" style="--c:${oc}" data-act="ze-addr" data-id="${a.id}" aria-pressed="${o === 'on'}" aria-label="${esc(a.num)} ${esc(st.name)}">${esc(a.num)}${nU > 1 ? `<small>${nU} logts</small>` : ''}</button>`; }).join('')}</div></div>` : ''}`;
  };
  return {
    title: ZE.id ? ZE.name || 'Secteur' : 'Nouveau secteur',
    body: `<div class="stackv">
      <section class="card">
        <div class="field"><label for="ze-name">Nom du secteur</label><input id="ze-name" class="input" value="${esc(ZE.name)}"></div>
        <div class="field" style="margin-top:14px"><span class="lbl">Couleur</span><div class="swatches">${ZONE_COLORS.map((c) => `<button style="--c:${c}" data-act="ze-color" data-v="${c}" aria-pressed="${ZE.color === c}" aria-label="Couleur ${c}"></button>`).join('')}</div></div>
        <div class="field" style="margin-top:14px"><span class="lbl">Binôme affecté</span><div class="chips wrap">${members().length ? memberChips('ze-member', ZE.members) : '<span class="muted">Ajoutez d’abord l’équipe dans l’onglet Équipe.</span>'}</div></div>
      </section>
      <section class="card ze-sum" style="--c:${ZE.color}">
        <div class="ze-kpis"><div><b>${sel.size}</b><span>adresses</span></div><div><b>${nUnits}</b><span>foyers</span></div><div><b>${stInZone.length}</b><span>rues</span></div></div>
        <div class="grid2"><button class="btn ghost" data-act="ze-lasso">${ico('pen')} Entourer sur la carte</button><button class="btn ghost" data-act="ze-only" aria-pressed="${ZE.only}">${ZE.only ? 'Toutes les rues' : 'Rues du secteur'}</button></div>
      </section>
      <div class="lbl">Cochez les rues du secteur, ou ouvrez une rue pour choisir un côté ou des maisons précises</div>
      ${comChips('ze-com', ZE.com, counts)}
      <div class="input-ico">${ico('search')}<input id="ze-q" class="input" type="search" placeholder="Chercher une rue" value="${esc(ZE.q)}" autocomplete="off" aria-label="Chercher une rue"></div>
      <div class="zs-list" id="ze-list">${list.map(row).join('') || '<div class="empty">Aucune rue.</div>'}</div>
      ${ZE.id ? (ZE.confirm ? `<div class="confirm"><p>Supprimer « ${esc(ZE.name)} » ? Ses adresses redeviennent sans secteur ; les passages sont conservés.</p><div class="grid2"><button class="btn ghost" data-act="ze-del-no">Garder</button><button class="btn red" data-act="ze-del-yes">Supprimer</button></div></div>` : '<button class="link danger" data-act="ze-del" style="justify-self:start">Supprimer ce secteur</button>') : ''}
    </div>`,
    foot: `<button class="btn ghost" data-act="page-close">Annuler</button><button class="btn block" data-act="ze-save" ${sel.size ? '' : 'disabled'}>${sel.size ? `Enregistrer · ${sel.size} adresses` : 'Choisissez des rues'}</button>`,
  };
};
PAGES.unassigned = () => {
  const miss = unassigned(), by = new Map();
  for (const a of miss) { if (!by.has(a.sk)) by.set(a.sk, []); by.get(a.sk).push(a); }
  const zs = zones();
  return {
    title: 'Adresses sans secteur',
    body: `<div class="stackv">
      ${miss.length ? `<div class="note-box"><b>${miss.length} adresse${miss.length > 1 ? 's' : ''}</b> n'appartien${miss.length > 1 ? 'nent' : 't'} à aucun secteur. Rangez-les rue par rue pour qu'aucune maison ne soit oubliée.</div>
        <div class="grid2"><button class="btn ghost" data-act="unassigned-map">${ico('map')} Voir sur la carte</button><button class="btn ghost" data-act="unassigned-new">${ico('plus')} Nouveau secteur</button></div>
        ${[...by].sort((x, y) => (streetOf(x[0])?.ci ?? 99) - (streetOf(y[0])?.ci ?? 99)).map(([sk, list]) => { const st = streetOf(sk); return `<section class="card"><div class="sr-top"><b>${esc(st.name)}</b><span class="muted" style="font:600 13px var(--f-body)">${esc(st.com)}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">${list.map((a) => `<span class="dt sm">${esc(a.num)}</span>`).join('')}</div>${zs.length ? `<select class="input" data-change="assign-street" data-sk="${esc(sk)}" aria-label="Secteur pour ${esc(st.name)}"><option value="">Ranger ces ${list.length} adresses dans…</option>${zs.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}</select>` : ''}</section>`; }).join('')}`
      : '<div class="card empty"><b>Aucune maison oubliée</b>Toutes les adresses sont rangées dans un secteur.</div>'}
    </div>`,
  };
};
PAGES.welcome = (args) => {
  const step = args.step || 'intro';
  if (step === 'create') return { bare: true, body: `<div class="welcome" style="text-align:left;justify-items:stretch">
    <button class="link" data-act="w-step" data-v="intro" style="justify-self:start">${ico('chev-l', 'sm')} Retour</button>
    <h1 class="w-title" style="font-size:48px">L'équipe</h1>
    <p>Un pompier par ligne, prénom et initiale. Vous pourrez en ajouter plus tard.</p>
    <form data-form="w-create" style="display:grid;gap:12px"><textarea class="input" name="names" rows="7" placeholder="Thomas K.&#10;Julie W.&#10;Nicolas B." aria-label="Membres de l'équipe" required></textarea><button class="btn red block" type="submit">Créer l'équipe</button></form>
  </div>` };
  if (step === 'join') return { bare: true, body: `<div class="welcome" style="text-align:left;justify-items:stretch">
    <button class="link" data-act="w-step" data-v="intro" style="justify-self:start">${ico('chev-l', 'sm')} Retour</button>
    <h1 class="w-title" style="font-size:48px">Rejoindre</h1>
    <p>Le plus simple : scannez le QR code affiché dans les réglages du chef d'équipe avec l'appareil photo. Sinon, saisissez l'adresse de la feuille et le code.</p>
    <form data-form="join" style="display:grid;gap:12px"><input class="input" name="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" aria-label="Adresse de la feuille"><input class="input" name="code" placeholder="SEP-XXXX-XXXX" autocapitalize="characters" autocomplete="off" aria-label="Code d'équipe" required style="font:800 24px var(--f-display);letter-spacing:.08em;text-align:center"><button class="btn red block" type="submit">Rejoindre l'équipe</button></form>
  </div>` };
  if (step === 'who') { const v = Me.get(); return { bare: true, body: `<div class="welcome">
    <h1 class="w-title" style="font-size:48px">Qui êtes-vous ?</h1>
    <p>Vos passages seront notés à votre nom sur ce téléphone.</p>
    ${members().length ? `<div class="chips wrap" style="justify-content:center">${memberChips('me-set', [v.me])}</div>` : '<p class="muted">Récupération de l’équipe en cours…</p>'}
    <button class="btn red block" data-act="w-done">${Me.team().length ? 'C’est parti' : 'Plus tard'}</button>
  </div>` }; }
  return { bare: true, body: `<div class="welcome">
    <div class="w-crest"><img src="icons/logo.jpg" alt="Blason de l'Amicale des Sapeurs-Pompiers de Seppois-le-Bas"></div>
    <div class="lbl">Amicale des Sapeurs-Pompiers de Seppois-le-Bas · depuis 1926</div>
    <h1 class="w-title">Tournée des <em>calendriers</em></h1>
    <p>Les ${nf(BASE_ADDRS.length)} adresses du secteur sont déjà chargées, rue par rue : ${COMMUNES.join(', ')}. Notez chaque foyer, appartements compris, programmez les repasses et suivez qui a fait quelles rues, même sans réseau.</p>
    <div class="w-facts"><span>${COMMUNES.length} communes</span><span>${streets().length} rues</span><span>${nf(BASE_ADDRS.length)} adresses</span><span>Hors ligne</span></div>
    <div class="w-actions">
      <button class="btn red block" data-act="w-step" data-v="create">Créer l'équipe</button>
      <button class="btn ghost block" data-act="w-step" data-v="join">J'ai un code d'équipe</button>
      <button class="link" data-act="w-demo">Découvrir avec des données de démo</button>
    </div>
  </div>` };
};

// ═════════════════════════ Carte (Leaflet + plan vectoriel embarqué)
const IGN_URL = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const ROAD_W = [5, 4.5, 3.6, 2.2, 1.4, 1.1];
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const MapView = {
  map: null, layer: 'plan', sel: null, selStreet: null, lasso: null, route: null, labels: [], _hit: [], _r: 4, _c: null,
  show() { if (!this.map) this.init(); else { this.map.invalidateSize(); this.size(); this.draw(); } },
  init() {
    if (!window.L) return;
    const map = (this.map = L.map('map', { zoomControl: false, minZoom: 11.5, maxZoom: 20, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, maxBounds: [[47.465, 7.08], [47.6, 7.28]], maxBoundsViscosity: 0.7 }));
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('© OpenStreetMap · BAN');
    this.rend = L.canvas({ padding: 0.5 });
    this.vector = L.layerGroup().addTo(map);
    this.sat = L.tileLayer(IGN_URL, { maxZoom: 20, maxNativeZoom: 19, attribution: 'Photo © IGN' });
    this.canvas = L.DomUtil.create('canvas', 'addr-canvas', map.getContainer());
    this.ctx = this.canvas.getContext('2d');
    this.col(); this.buildVector(); this.buildLabels(); this.fit(false);
    map.on('move', () => this.draw());
    map.on('zoomanim', () => (this.canvas.style.opacity = 0));
    map.on('zoomend', () => { this.styleRoads(); this.canvas.style.opacity = 1; this.draw(); });
    map.on('moveend resize viewreset', () => { this.size(); this.draw(); });
    map.on('click', (e) => this.click(e.containerPoint));
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => this.lassoDown(e));
    cv.addEventListener('pointermove', (e) => this.lassoMove(e));
    cv.addEventListener('pointerup', (e) => this.lassoUp(e));
    cv.addEventListener('pointercancel', () => { if (this.lasso) { this.lasso.path = null; this.draw(); } });
    this.size(); this.styleRoads(); this.refresh();
    requestAnimationFrame(() => { map.invalidateSize(); this.size(); this.fit(false); });
    document.fonts?.ready?.then(() => this.draw());
  },
  col() {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    this._c = { bld: g('--map-bld'), bldl: g('--map-bld-line'), road: g('--map-road'), cs: g('--map-case'), main: g('--map-main'), mainc: g('--map-main-case'), water: g('--map-water'), green: g('--map-green'), wood: g('--map-wood'), label: g('--map-label'), halo: g('--map-halo'), surface: g('--surface'), ink: g('--ink'), red: g('--red'), st: { todo: g('--st-todo'), done: g('--st-done'), absent: g('--st-absent'), repasse: g('--st-repasse'), refus: g('--st-refus') } };
    return this._c;
  },
  buildVector() {
    const c = this._c, R = this.rend, g = this.vector, opt = { renderer: R, interactive: false };
    g.clearLayers();
    const greens = [[], [], []];
    for (const [t, e] of GEO.g) greens[t].push([decode(e)]);
    if (greens[0].length) L.polygon(greens[0], { ...opt, stroke: false, fillColor: c.wood, fillOpacity: 1 }).addTo(g);
    if (greens[1].length) L.polygon(greens[1], { ...opt, stroke: false, fillColor: c.green, fillOpacity: 1 }).addTo(g);
    if (greens[2].length) L.polygon(greens[2], { ...opt, stroke: false, fillColor: c.green, fillOpacity: 1 }).addTo(g);
    L.polygon(GEO.w.map((e) => [decode(e)]), { ...opt, stroke: false, fillColor: c.water, fillOpacity: 1 }).addTo(g);
    this.waterways = GEO.ww.map(([big, e]) => L.polyline(decode(e), { ...opt, color: c.water, weight: big ? 5 : 1.6, big, lineCap: 'round' }).addTo(g));
    L.polygon(GEO.b.map((e) => [decode(e)]), { ...opt, color: c.bldl, weight: 0.7, fillColor: c.bld, fillOpacity: 1 }).addTo(g);
    GEO.rl.forEach((e) => L.polyline(decode(e), { ...opt, color: c.cs, weight: 1.4, dashArray: '4 4' }).addTo(g));
    const order = GEO.r.map((_, i) => i).sort((a, b) => GEO.r[b][0] - GEO.r[a][0]), dec = GEO.r.map((r) => decode(r[2]));
    this.cases = []; this.fills = [];
    for (const i of order) { const cls = GEO.r[i][0]; if (cls <= 3) this.cases.push([cls, L.polyline(dec[i], { ...opt, color: cls <= 1 ? c.mainc : c.cs, lineCap: 'round', lineJoin: 'round' }).addTo(g)]); }
    for (const i of order) { const cls = GEO.r[i][0]; this.fills.push([cls, L.polyline(dec[i], { ...opt, color: cls <= 1 ? c.main : cls >= 4 ? c.cs : c.road, dashArray: cls >= 4 ? '3 4' : null, lineCap: 'round', lineJoin: 'round' }).addTo(g)]); }
    for (const [, e] of GEO.c) L.polyline(decode(e), { ...opt, color: c.label, weight: 1.3, opacity: 0.4, dashArray: '9 6' }).addTo(g);
  },
  buildLabels() {
    const best = new Map();
    for (const [cls, ni, e] of GEO.r) {
      if (ni < 0 || cls > 3) continue;
      const name = GEO.n[ni], pts = decode(e);
      let len = 0; for (let i = 1; i < pts.length; i++) len += distM(pts[i - 1], pts[i]);
      const key = name + '|' + Math.round(pts[0][0] * 100) + '|' + Math.round(pts[0][1] * 100);
      const b = best.get(key); if (!b || len > b.len) best.set(key, { name, len, pts });
    }
    const kx = Math.cos((47.53 * Math.PI) / 180);
    this.labels = [...best.values()].map(({ name, len, pts }) => {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = distM(pts[i - 1], pts[i]);
        if (acc + d >= len / 2 || i === pts.length - 1) {
          const t = d ? clamp((len / 2 - acc) / d, 0, 1) : 0, [la0, lo0] = pts[i - 1], [la1, lo1] = pts[i];
          let ang = Math.atan2(-(la1 - la0), (lo1 - lo0) * kx);
          if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
          return { name, len, ang, lat: la0 + (la1 - la0) * t, lon: lo0 + (lo1 - lo0) * t };
        }
        acc += d;
      }
      return null;
    }).filter(Boolean);
  },
  styleRoads() {
    if (!this.cases) return;
    const z = this.map.getZoom(), k = Math.pow(2, z - 16);
    for (const [cls, l] of this.cases) l.setStyle({ weight: Math.max(1.4, ROAD_W[cls] * k + (cls <= 1 ? 2.2 : 1.6)) });
    for (const [cls, l] of this.fills) l.setStyle({ weight: cls >= 4 ? (z >= 17 ? 1.6 : 0.8) : Math.max(0.8, ROAD_W[cls] * k) });
    for (const l of this.waterways || []) l.setStyle({ weight: l.options.big ? Math.max(1.5, 5 * k) : Math.max(0.8, 1.6 * k) });
  },
  size() {
    if (!this.map) return;
    const s = this.map.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (this._w === s.x && this._h === s.y && this._dpr === dpr) return;
    this._w = s.x; this._h = s.y; this._dpr = dpr;
    this.canvas.width = Math.round(s.x * dpr); this.canvas.height = Math.round(s.y * dpr);
    this.canvas.style.width = s.x + 'px'; this.canvas.style.height = s.y + 'px';
  },
  fitTo(list, anim = true, maxZoom = 18.5) { if (!this.map || !list.length) return; this.map.fitBounds(L.latLngBounds(list.map((a) => [a.lat, a.lon])), { paddingTopLeft: [24, 24], paddingBottomRight: [64, 24], maxZoom, animate: anim }); },
  fit(anim = true) { this.fitTo(UI.com ? addrs().filter((a) => a.com === UI.com) : addrs(), anim, 17); },
  restyle() { if (!this.map) return; this.col(); this.buildVector(); if (this.layer === 'sat') this.map.removeLayer(this.vector); this.styleRoads(); this.draw(); },
  toggleLayer() {
    if (!this.map) return;
    this.layer = this.layer === 'plan' ? 'sat' : 'plan';
    if (this.layer === 'sat') { this.map.removeLayer(this.vector); this.sat.addTo(this.map); } else { this.map.removeLayer(this.sat); this.vector.addTo(this.map); }
    $('#layer-lbl').textContent = this.layer === 'sat' ? 'Plan' : 'Satellite';
    this.draw();
  },
  locate() {
    if (Geo.pos && this.map) { this.map.setView([Geo.pos.lat, Geo.pos.lon], Math.max(this.map.getZoom(), 18)); return; }
    Geo.onFirst = () => { if (this.map && UI.view === 'map') this.map.setView([Geo.pos.lat, Geo.pos.lon], 18); };
    if (Geo.start()) toast('Recherche de votre position…', { ms: 2500 });
  },
  refresh() { this.draw(); },
  nearest(p) {
    let best = null, bd = Infinity;
    for (const [a, pt] of this._hit) { const d = Math.hypot(pt.x - p.x, pt.y - p.y); if (d < bd) { bd = d; best = a; } }
    return best && bd <= Math.max(18, this._r + 10) ? best : null;
  },
  /** Rue dont le tracé passe le plus près du point touché (null si aucune à portée). */
  hitStreet(p) {
    const map = this.map, W = this._w, H = this._h, b = map.getBounds();
    const [s0, w0, n0, e0] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    let best = null, bd = Infinity;
    for (const [sk, { lines, bb }] of streetRoads()) {
      if (bb[2] < s0 || bb[0] > n0 || bb[3] < w0 || bb[1] > e0) continue;
      if (!this.lasso && UI.com && streetOf(sk)?.com !== UI.com) continue;
      for (const line of lines) {
        let prev = null;
        for (const ll of line) {
          const q = map.latLngToContainerPoint(ll);
          if (prev && !((q.x < -40 && prev.x < -40) || (q.y < -40 && prev.y < -40) || (q.x > W + 40 && prev.x > W + 40) || (q.y > H + 40 && prev.y > H + 40))) {
            const d = segDist(p, prev, q);
            if (d < bd) { bd = d; best = sk; }
          }
          prev = q;
        }
      }
    }
    if (best && bd <= 20) return best;
    let na = null, nd = Infinity;
    for (const [a, pt] of this._hit) { const d = Math.hypot(pt.x - p.x, pt.y - p.y); if (d < nd) { nd = d; na = a; } }
    return na && nd <= 46 ? na.sk : null;
  },
  click(p) {
    const a = this.nearest(p), sk = a ? null : this.hitStreet(p);
    if (this.lasso) {
      if (a) { ZE.addrs.has(a.id) ? ZE.addrs.delete(a.id) : ZE.addrs.add(a.id); this.selStreet = null; }
      else if (sk) {
        const st = streetOf(sk), all = st.addrs.every((x) => ZE.addrs.has(x.id));
        const add = this.lasso.mode !== 'remove' && !all;
        for (const x of st.addrs) add ? ZE.addrs.add(x.id) : ZE.addrs.delete(x.id);
        this.selStreet = sk;
        vibrate(12);
        toast(`${st.name} · ${st.addrs.length} adresse${st.addrs.length > 1 ? 's' : ''} ${add ? 'ajoutée' : 'retirée'}${st.addrs.length > 1 ? 's' : ''}`, { ms: 1800 });
      } else return;
      this.renderLassoBar(); this.draw();
      return;
    }
    if (a) openAddr(a.id);
    else if (sk) openStreetSheet(sk);
  },
  // ── Lasso : entourer des maisons au doigt
  startLasso() {
    if (Page.cur) { $('#page').hidden = true; $('#page').innerHTML = ''; Page.cur = null; }
    Sheet.close(); UI.mapMode = 'map'; this.route = null; this.renderRouteBar();
    go('map');
    this.show();
    if (!this.map || !ZE) return;
    this.lasso = { mode: 'add', path: null };
    this.setLassoInput();
    $('#map-legend').hidden = true;
    this.renderLassoBar();
    const sel = [...ZE.addrs].map((id) => addrIdx().get(id)).filter(Boolean);
    requestAnimationFrame(() => {
      this.map.invalidateSize(); this.size();
      if (sel.length) this.fitTo(sel, true, 17.5);
      this.draw();
    });
  },
  setLassoInput() {
    const drawing = this.lasso && this.lasso.mode !== 'pan', m = this.map;
    this.canvas.style.pointerEvents = drawing ? 'auto' : 'none';
    this.canvas.style.touchAction = drawing ? 'none' : '';
    for (const h of [m.dragging, m.touchZoom, m.doubleClickZoom, m.boxZoom]) drawing ? h.disable() : h.enable();
  },
  endLasso(apply) {
    this.lasso = null; this.selStreet = null; this.setLassoInput(); this.renderLassoBar(); $('#map-legend').hidden = false; this.draw();
    if (apply && ZE) Page.open('zone'); else ZE = null;
  },
  lassoPt(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
  lassoDown(e) { if (!this.lasso || this.lasso.mode === 'pan') return; this.canvas.setPointerCapture?.(e.pointerId); this.lasso.path = [this.lassoPt(e)]; },
  lassoMove(e) { const L0 = this.lasso; if (!L0?.path) return; const p = this.lassoPt(e), q = L0.path[L0.path.length - 1]; if (Math.hypot(p.x - q.x, p.y - q.y) > 3) { L0.path.push(p); this.draw(); } },
  lassoUp(e) {
    const L0 = this.lasso; if (!L0?.path) return;
    const path = L0.path; L0.path = null;
    let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (len < 14) { this.click(this.lassoPt(e)); return; }
    const poly = path.map((p) => [p.x, p.y]); let n = 0;
    for (const a of addrs()) {
      const pt = this.map.latLngToContainerPoint([a.lat, a.lon]);
      if (!pipXY(pt.x, pt.y, poly)) continue;
      if (L0.mode === 'add' && !ZE.addrs.has(a.id)) { ZE.addrs.add(a.id); n++; }
      if (L0.mode === 'remove' && ZE.addrs.has(a.id)) { ZE.addrs.delete(a.id); n++; }
    }
    vibrate(10);
    toast(n ? `${n} adresse${n > 1 ? 's' : ''} ${L0.mode === 'add' ? 'ajoutée' : 'retirée'}${n > 1 ? 's' : ''}` : 'Aucune maison dans ce tracé.', { ms: 1800 });
    this.renderLassoBar(); this.draw();
  },
  renderLassoBar() {
    const bar = $('#draw-bar');
    document.body.classList.toggle('lasso-on', !!(this.lasso && ZE));
    if (!this.lasso || !ZE) { bar.hidden = true; return; }
    const n = ZE.addrs.size, m = this.lasso.mode;
    bar.hidden = false;
    const hint = m === 'pan' ? 'Déplacez la carte, puis reprenez.' : m === 'add' ? 'Touchez une rue pour l\'ajouter entière, ou entourez des maisons.' : 'Touchez une rue pour la retirer, ou entourez des maisons.';
    bar.innerHTML = `<p><span class="zdot" style="--c:${ZE.color}"></span> <b>${esc(ZE.name)}</b> · ${n} adresse${n > 1 ? 's' : ''}<br><small>${hint} Cerclées de rouge : sans secteur.</small></p>
      <div class="seg lasso-seg">${[['add', 'Ajouter'], ['remove', 'Retirer'], ['pan', 'Déplacer']].map(([v, l]) => `<button data-act="lasso-mode" data-v="${v}" aria-pressed="${m === v}">${l}</button>`).join('')}</div>
      <div class="chips"><button class="chip" data-act="lasso-cancel">Annuler</button><button class="chip go" data-act="lasso-done">${ico('check', 'sm')} Terminer</button></div>`;
    document.documentElement.style.setProperty('--lasso-h', bar.offsetHeight + 'px');
  },
  showRoute() {
    const today = isoDay(), seen = new Set(), pts = [];
    for (const r of repasses()) if (r.date && r.date <= today && !seen.has(r.a.id)) { seen.add(r.a.id); pts.push(r.a); }
    if (!pts.length) { toast('Aucune repasse prévue aujourd’hui.'); return; }
    let cur = Geo.pos ? [Geo.pos.lat, Geo.pos.lon] : [pts[0].lat, pts[0].lon];
    const left = [...pts], order = [];
    while (left.length) { let bi = 0, bd = Infinity; left.forEach((a, i) => { const d = distM(cur, [a.lat, a.lon]); if (d < bd) { bd = d; bi = i; } }); const a = left.splice(bi, 1)[0]; order.push(a); cur = [a.lat, a.lon]; }
    this.route = order; UI.mapMode = 'map'; UI.filter = 'all'; saveUI();
    go('map');
    requestAnimationFrame(() => requestAnimationFrame(() => { this.renderRouteBar(); this.fitTo(order, true, 18); this.draw(); }));
  },
  renderRouteBar() {
    const bar = $('#route-bar');
    if (!this.route) { bar.hidden = true; return; }
    let m = 0; for (let i = 1; i < this.route.length; i++) m += distM([this.route[i - 1].lat, this.route[i - 1].lon], [this.route[i].lat, this.route[i].lon]);
    bar.hidden = false;
    bar.innerHTML = `<p>Itinéraire des repasses : ${this.route.length} adresses dans l'ordre, environ ${m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'}.</p><div class="chips"><button class="chip" data-act="route-clear">Effacer l'itinéraire</button></div>`;
  },
  draw() {
    if (!this.map || !this.ctx || $('#v-map').hidden || UI.mapMode !== 'map') return;
    const map = this.map, ctx = this.ctx, W = this._w, H = this._h;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const c = this._c, z = map.getZoom(), sat = this.layer === 'sat', L0 = this.lasso;
    const P = (lat, lon) => map.latLngToContainerPoint([lat, lon]);
    const inView = (p, m = 40) => p.x > -m && p.y > -m && p.x < W + m && p.y < H + m;
    const halo = sat ? 'rgba(0,0,0,.72)' : c.halo, txt = sat ? '#fff' : c.label;
    const zi = zoneIndex(), zs = zones();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    // Noms de rues et lieux
    if (z >= 16) {
      ctx.font = `600 ${z >= 18 ? 13 : 11.5}px Barlow, system-ui, sans-serif`; ctx.lineWidth = 3.5; ctx.strokeStyle = halo; ctx.fillStyle = txt;
      for (const l of this.labels) {
        if ((z < 16.75 && l.len < 220) || (z < 17.5 && l.len < 90)) continue;
        const p = P(l.lat, l.lon); if (!inView(p, 120)) continue;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(l.ang); ctx.strokeText(l.name, 0, 0); ctx.fillText(l.name, 0, 0); ctx.restore();
      }
      ctx.font = 'italic 600 11.5px Barlow, system-ui, sans-serif';
      for (const [, n, la, lo] of GEO.p) { const p = P(la, lo); if (!inView(p)) continue; ctx.strokeText(n, p.x, p.y - 14); ctx.fillText(n, p.x, p.y - 14); }
    }
    // Secteurs : nappe de couleur autour des maisons
    const mpp = (40075016.686 * Math.cos((47.53 * Math.PI) / 180)) / Math.pow(2, z + 8);
    if (zs.length && z < 18.75 && !L0) {
      const off = (this._off ||= document.createElement('canvas'));
      if (off.width !== this.canvas.width || off.height !== this.canvas.height) { off.width = this.canvas.width; off.height = this.canvas.height; }
      const o = off.getContext('2d'), idx = addrIdx(), rad = Math.max(4, 24 / mpp);
      o.setTransform(this._dpr, 0, 0, this._dpr, 0, 0); o.clearRect(0, 0, W, H);
      for (const zn of zs) { o.fillStyle = zn.color; o.beginPath(); for (const id of zn.addrs || []) { const a = idx.get(id); if (!a) continue; const p = P(a.lat, a.lon); if (!inView(p, rad)) continue; o.moveTo(p.x + rad, p.y); o.arc(p.x, p.y, rad, 0, Math.PI * 2); } o.fill(); }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = sat ? 0.3 : 0.2; ctx.drawImage(off, 0, 0); ctx.restore();
    }
    // Rue touchée : son tracé est surligné
    if (this.selStreet) {
      const e = streetRoads().get(this.selStreet);
      if (e) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = clamp(11 * Math.pow(2, z - 17), 7, 30);
        ctx.strokeStyle = L0 && ZE ? ZE.color : c.red; ctx.globalAlpha = 0.45;
        for (const line of e.lines) { ctx.beginPath(); line.forEach((ll, i) => { const q = P(ll[0], ll[1]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke(); }
        ctx.restore();
      }
    }
    // Adresses : une pastille par adresse, en camembert pour les immeubles
    const r = z < 13.5 ? 1.8 : z < 15 ? 2.4 : z < 16 ? 3.2 : z < 17 ? 4.5 : z < 17.75 ? 6 : z < 18.5 ? 8 : 10.5;
    this._r = r;
    const f = UI.filter, hits = [], dim = [];
    for (const a of addrs()) {
      const p = P(a.lat, a.lon); if (!inView(p, 20)) continue;
      const n = unitsOf(a.id).length, cnt = n > 1 ? addrSt(a.id) : null, st = n > 1 ? null : statusOf(a.id);
      const keep = L0 ? true : mapKeep(a, zi) && (f === 'all' || (cnt ? cnt[f] > 0 : st === f));
      (keep ? hits : dim).push([a, p, st, cnt, n]);
    }
    if (dim.length) { ctx.fillStyle = c.st.todo; ctx.globalAlpha = 0.28; ctx.beginPath(); for (const [, p] of dim) { ctx.moveTo(p.x + r * 0.6, p.y); ctx.arc(p.x, p.y, r * 0.6, 0, Math.PI * 2); } ctx.fill(); ctx.globalAlpha = 1; }
    const ring = sat ? 'rgba(255,255,255,.95)' : c.surface;
    if (L0) {
      // Mode secteur : sélection en couleur, autres secteurs atténués, maisons sans secteur cerclées de rouge
      for (const [a, p] of hits) {
        const inSel = ZE.addrs.has(a.id), oid = zi.get(a.id), other = !inSel && oid && oid !== ZE.id ? Store.s.zones[oid] : null;
        ctx.beginPath(); ctx.arc(p.x, p.y, inSel ? r + 1 : r * 0.85, 0, Math.PI * 2);
        if (inSel) { ctx.fillStyle = ZE.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        else if (other) { ctx.globalAlpha = 0.45; ctx.fillStyle = other.color; ctx.fill(); ctx.globalAlpha = 1; }
        else { ctx.fillStyle = ring; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.red; ctx.stroke(); }
      }
    } else {
      hits.sort((x, y) => (x[2] === 'todo' ? 0 : 1) - (y[2] === 'todo' ? 0 : 1));
      const lw = r > 5 ? 2 : 1.2;
      for (const [, p, st, cnt, n] of hits) {
        ctx.strokeStyle = ring;
        if (!cnt) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = c.st[st]; ctx.fill(); ctx.lineWidth = lw; ctx.stroke(); continue; }
        const R = r + 1.5; let a0 = -Math.PI / 2;
        for (const k of ST_ORDER) { if (!cnt[k]) continue; const a1 = a0 + (cnt[k] / n) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, R, a0, a1); ctx.closePath(); ctx.fillStyle = c.st[k]; ctx.fill(); a0 = a1; }
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.lineWidth = 2.2; ctx.stroke();
      }
    }
    if (r >= 8) {
      ctx.font = `700 ${r >= 10 ? 11 : 9.5}px Barlow, system-ui, sans-serif`; ctx.fillStyle = '#fff';
      for (const [a, p, , cnt, n] of hits) { if (L0 && !ZE.addrs.has(a.id)) continue; ctx.fillText(cnt && !L0 ? `${a.n}·${n}` : String(a.n), p.x, p.y + 0.5); }
    }
    this._hit = hits;
    if (this.sel && !L0) { const a = addrIdx().get(this.sel); if (a) { const p = P(a.lat, a.lon); ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = sat ? '#fff' : c.ink; ctx.stroke(); } }
    // Itinéraire des repasses
    if (this.route?.length && !L0) {
      const pts = this.route.map((a) => P(a.lat, a.lon));
      ctx.setLineDash([7, 6]); ctx.lineWidth = 3; ctx.strokeStyle = c.red; ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '800 12px Barlow, system-ui, sans-serif';
      pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fillStyle = c.red; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), p.x, p.y + 0.5); });
    }
    // Tracé du lasso en cours
    if (L0?.path?.length > 1) {
      ctx.beginPath(); L0.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      ctx.fillStyle = L0.mode === 'remove' ? 'rgba(210,43,61,.12)' : 'rgba(47,111,228,.12)'; ctx.fill();
      ctx.setLineDash([6, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = L0.mode === 'remove' ? c.st.refus : ZE.color; ctx.stroke(); ctx.setLineDash([]);
    }
    // Ma position
    if (Geo.pos) {
      const p = P(Geo.pos.lat, Geo.pos.lon);
      if (inView(p)) {
        const acc = clamp(Geo.pos.acc / mpp, 0, 200);
        ctx.beginPath(); ctx.arc(p.x, p.y, acc, 0, Math.PI * 2); ctx.fillStyle = 'rgba(47,111,228,.14)'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fillStyle = '#2F6FE4'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
    }
    // Noms des villages (vue d'ensemble)
    if (z < 15.25) {
      ctx.lineWidth = 4; ctx.strokeStyle = halo; ctx.fillStyle = txt;
      for (const [n, la, lo, big] of GEO.v) { const p = P(la, lo); if (!inView(p, 100)) continue; ctx.font = big ? '800 17px "Big Shoulders Display", Impact, sans-serif' : '700 13px "Big Shoulders Display", Impact, sans-serif'; const t = n.toUpperCase(); ctx.strokeText(t, p.x, p.y - 24); ctx.fillText(t, p.x, p.y - 24); }
    }
    // Étiquettes des secteurs
    if (z >= 13.5 && z < 17 && !L0) {
      const S = stats(); ctx.font = '700 12.5px Barlow, system-ui, sans-serif';
      for (const zn of zs) {
        const ctr = zoneCenter(zn); if (!ctr) continue;
        const p = P(ctr[0], ctr[1]); if (!inView(p, 80)) continue;
        const bz = S.byZone[zn.id], label = `${zn.name} · ${bz ? pct(bz.visited, bz.total) : 0} %`, w = ctx.measureText(label).width + 20;
        rrect(ctx, p.x - w / 2, p.y - 12, w, 24, 12); ctx.fillStyle = zn.color; ctx.globalAlpha = 0.94; ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff'; ctx.fillText(label, p.x, p.y + 0.5);
      }
    }
  },
};

// ═════════════════════════ Exports
function exportCSV() {
  const s = Store.s, zi = zoneIndex();
  const head = ['Commune', 'Rue', 'Numéro', 'Logement', 'Statut', 'Calendriers', 'Montant (€)', 'Règlement', 'N° chèque', 'Occupant', 'Note', 'Repasse le', 'Créneau', 'Fait par', 'Dernier passage', 'Secteur'];
  const rows = [...units()].sort((x, y) => x.a.ci - y.a.ci || sortKey(x.a.street).localeCompare(sortKey(y.a.street), 'fr') || numCmp(x.a, y.a) || x.k - y.k).map((u) => {
    const a = u.a, p = s.passages[u.id] || {}, st = p.status || 'todo', z = zi.get(a.id), d = st === 'done';
    return [a.com, a.street, a.num, u.label, STATUS[st].label, d ? p.cal : '', d ? String(p.amt).replace('.', ',') : '', d ? PAY[p.pay] || '' : '', p.chq || '', p.name || '', [p.note, p.rp?.note].filter(Boolean).join(' / '), p.rp?.date || '', SLOTS[p.rp?.slot] || '', names(p.by), p.at ? new Date(p.at).toLocaleString('fr-FR') : '', z ? s.zones[z].name : ''];
  });
  const S = stats();
  rows.push([], ['Total collecté', '', '', '', '', S.cal, String(S.amount).replace('.', ',')]);
  for (const k of Object.keys(PAY)) rows.push([PAY[k], '', '', '', '', '', String(S.pay[k].amt).replace('.', ','), `${S.pay[k].n} dons`]);
  const csv = '﻿' + [head, ...rows].map((r) => r.map((v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(';')).join('\r\n');
  download(`calendriers-${s.settings.year || ''}-${isoDay()}.csv`, csv, 'text/csv;charset=utf-8');
}
function exportJSON() {
  download(`sauvegarde-calendriers-${isoDay()}.json`, JSON.stringify({ app: 'tournee-calendriers-seppois', version: 2, exported: new Date().toISOString(), data: Store.s }, null, 1), 'application/json');
}
function importJSON(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result), d = j.data || j;
      if (!d || typeof d.passages !== 'object') throw new Error('format');
      if (Store.demoOn) Store.exitDemo();
      const items = []; let n = 0;
      for (const [kind, col] of Object.entries(KIND_COL)) for (const [id, rec] of Object.entries(d[col] || {})) {
        const cur = Store.live[col][id];
        if (!cur || (cur.u || 0) < (rec.u || 0)) { Store.live[col][id] = rec; items.push({ kind, id, data: rec, updated_at: rec.u || Date.now(), deleted: !!rec.del }); n++; }
      }
      if (d.settings && (d.settings.u || 0) > (Store.live.settings.u || 0)) { Store.live.settings = d.settings; items.push({ kind: 'settings', id: 'main', data: d.settings, updated_at: d.settings.u, deleted: false }); }
      Store.rev++; Store.save(); if (items.length) Sync.enqueueMany(items);
      LS.set(K.welcomed, true); if (Page.cur === 'welcome') Page.close();
      App.changed(); toast(`${n} élément${n > 1 ? 's' : ''} restauré${n > 1 ? 's' : ''}.`);
    } catch (e) { toast('Fichier non reconnu : choisissez une sauvegarde exportée par l’app.'); }
    $('#import-file').value = '';
  };
  r.readAsText(file);
}
function applyTheme() {
  const t = LS.get(K.theme, 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').content = dark ? '#0B0C0E' : '#15171A';
}
function maybeWelcome() {
  if (!Store.demoOn && !members().length && !Object.keys(Store.live.passages).length && !LS.get(K.welcomed, false)) Page.open('welcome', { step: 'intro' });
}
function joinTeam(url, code) {
  if (Store.demoOn) Store.exitDemo();
  if (url) setSheetUrl(url);
  if (!Sync.configured) { toast("L'adresse de la feuille est incorrecte : elle commence par https://script.google.com/"); return false; }
  setCode(code.trim().toUpperCase());
  LS.set(K.welcomed, true);
  return true;
}

// ═════════════════════════ Actions
const A = {
  go: (el) => { if (Page.cur && Page.cur !== 'welcome') A['page-close'](); Sheet.close(); go(el.dataset.v); },
  page: (el) => { Sheet.close(); Page.open(el.dataset.v, { sec: el.dataset.sec }); },
  'page-close': () => { if (Page.cur === 'zone') ZE = null; Page.close(); },
  'sheet-close': () => Sheet.close(),
  history: () => Page.open('history', {}),
  'me-sheet': () => openMeSheet(),
  'me-set': (el) => { const v = Me.get(), me = el.dataset.v; Me.set({ me, partner: v.partner === me ? '' : v.partner }); },
  'partner-set': (el) => Me.set({ ...Me.get(), partner: el.dataset.v }),
  'demo-enter': () => { Store.enterDemo(); if (Page.cur) Page.close(); Sheet.close(); MapView.route = null; MapView.renderRouteBar(); go('home'); toast('Mode démo : explorez librement, rien n’est enregistré.'); },
  'demo-exit': () => { Store.exitDemo(); if (Page.cur) Page.close(); MapView.route = null; MapView.renderRouteBar(); UI.tour.cur = null; App.changed(); toast('Retour aux vraies données.'); maybeWelcome(); },
  mapmode: (el) => { UI.mapMode = el.dataset.v; UI.street = null; saveUI(); renderMapView(); if (UI.mapMode === 'map') requestAnimationFrame(() => MapView.show()); },
  filter: (el) => { UI.filter = el.dataset.v; saveUI(); App.changed(); },
  com: (el) => { UI.com = el.dataset.v; saveUI(); App.changed(); },
  'tour-com': (el) => { UI.com = el.dataset.v; saveUI(); App.changed(); },
  'com-go': (el) => { UI.com = el.dataset.v; UI.mapMode = 'streets'; UI.street = null; saveUI(); go('map'); },
  mapfilter: (el) => { UI.filter = el.dataset.v; UI.mapMode = 'map'; saveUI(); go('map'); },
  'map-layer': () => MapView.toggleLayer(),
  'map-locate': () => MapView.locate(),
  'map-fit': () => MapView.fit(true),
  'draw-start': () => { ZE = newZE(); MapView.startLasso(); },
  'lasso-mode': (el) => { MapView.lasso.mode = el.dataset.v; MapView.setLassoInput(); MapView.renderLassoBar(); },
  'lasso-cancel': () => MapView.endLasso(!!(ZE && (ZE.id || ZE.fromPage))),
  'lasso-done': () => MapView.endLasso(true),
  'street-houses': (el) => { Sheet.close(); UI.mapMode = 'streets'; UI.street = el.dataset.v; saveUI(); renderMapView(); $('#streets-host').scrollTop = 0; },
  'street-zoom': (el) => { Sheet.close(); MapView.fitTo(streetOf(el.dataset.v)?.addrs || [], true, 18.5); },
  'street-newzone': (el) => { const st = streetOf(el.dataset.v); Sheet.close(); ZE = newZE(); ZE.name = st.name; st.addrs.forEach((a) => ZE.addrs.add(a.id)); ZE.com = st.com; Page.open('zone'); },
  'route-today': () => MapView.showRoute(),
  'route-clear': () => { MapView.route = null; MapView.renderRouteBar(); MapView.draw(); },
  street: (el) => { UI.street = el.dataset.v; renderStreets(); $('#streets-host').scrollTop = 0; },
  'street-back': () => { UI.street = null; renderStreets(); },
  'street-map': (el) => { UI.mapMode = 'map'; UI.street = null; saveUI(); renderMapView(); requestAnimationFrame(() => { MapView.show(); MapView.fitTo(streetOf(el.dataset.v)?.addrs || []); }); },
  addr: (el) => openAddr(el.dataset.id),
  unit: (el) => { const u = unitIdx().get(el.dataset.id); if (u) openUnit(u.id, { status: el.dataset.status, tour: BS?.opts?.tour }); },
  'bld-n': (el) => { const a = BS?.id; if (a) setBld(a, unitsOf(a).length + +el.dataset.v); },
  'as-bld': () => { const u = unitIdx().get(AS.id), tour = AS.opts.tour; Sheet.close(); openBuilding(u.a.id, { tour }); },
  'as-status': (el) => { AS.d.status = el.dataset.v; if (AS.d.status === 'repasse' && !AS.d.rp.date) AS.d.rp.date = addDays(isoDay(), 1); drawUnitSheet(); },
  'as-cal': (el) => { AS.d.cal = clamp(AS.d.cal + +el.dataset.v, 1, 20); drawUnitSheet(); },
  'as-amt': (el) => { AS.d.amt = +el.dataset.v; drawUnitSheet(); },
  'as-pay': (el) => { AS.d.pay = el.dataset.v; drawUnitSheet(); },
  'as-rpdate': (el) => { AS.d.rp.date = el.dataset.v; drawUnitSheet(); },
  'as-slot': (el) => { AS.d.rp.slot = AS.d.rp.slot === el.dataset.v ? '' : el.dataset.v; drawUnitSheet(); },
  'as-by': (el) => { const v = el.dataset.v, by = AS.d.by; AS.d.by = by.includes(v) ? by.filter((x) => x !== v) : [...by, v]; drawUnitSheet(); },
  'as-save': () => asSave(),
  'as-reset': () => { AS.d.status = 'todo'; asSave(); },
  'as-tour': () => { const u = unitIdx().get(AS.id); UI.tour = { ...UI.tour, street: u.a.sk, near: false, cur: u.id }; TD = freshTD(u.id); saveUI(); Sheet.close(); go('tour'); },
  'toast-undo': () => { const t = $('#toast'); t._undo?.(); t._undo = null; t.hidden = true; },
  'tour-start': (el) => { UI.tour = { ...UI.tour, street: el.dataset.v, near: false, cur: null }; TD = freshTD(null); saveUI(); if (Page.cur) Page.close(); Sheet.close(); go('tour'); },
  'tour-near': () => { UI.tour = { ...UI.tour, near: true, street: null, cur: null }; saveUI(); Geo.start(); App.changed(); },
  'tour-pick': () => { UI.tour = { ...UI.tour, street: null, near: false, cur: null }; saveUI(); App.changed(); $('#v-tour').scrollTop = 0; },
  'tour-go': (el) => { UI.tour.cur = el.dataset.id; TD = freshTD(el.dataset.id); saveUI(); App.changed(); tourScrollTop(); },
  'tour-next': () => { tourNext(1); App.changed(); tourScrollTop(); },
  'tour-prev': () => { tourNext(-1); App.changed(); tourScrollTop(); },
  'tour-detail': () => UI.tour.cur && openUnit(UI.tour.cur, { tour: true }),
  'tour-bld': () => { const u = unitIdx().get(UI.tour.cur); if (u) openBuilding(u.a.id, { tour: true }); },
  'tour-order': (el) => { UI.tour.order = el.dataset.v; saveUI(); App.changed(); },
  'td-mode': (el) => { TD.mode = el.dataset.v || null; App.changed(); },
  'td-later': (el) => { TD.mode = 'later'; TD.status = el.dataset.v; if (TD.status === 'repasse' && !TD.rpDate) TD.rpDate = addDays(isoDay(), 1); App.changed(); },
  'td-refus': () => tourSave('refus'),
  'td-cal': (el) => { TD.cal = clamp(TD.cal + +el.dataset.v, 1, 20); App.changed(); },
  'td-amt': (el) => { TD.amt = +el.dataset.v; App.changed(); },
  'td-pay': (el) => { TD.pay = el.dataset.v; App.changed(); },
  'td-rpdate': (el) => { TD.rpDate = el.dataset.v; App.changed(); },
  'td-slot': (el) => { TD.rpSlot = TD.rpSlot === el.dataset.v ? '' : el.dataset.v; App.changed(); },
  'td-save-done': () => { if (TD.amt != null) tourSave('done', { cal: TD.cal, amt: TD.amt, pay: TD.pay }); },
  'td-save-later': () => tourSave(TD.status, { rp: TD.rpDate || TD.status === 'repasse' ? { date: TD.rpDate, slot: TD.rpSlot, note: TD.rpNote } : null }),
  'rp-quick': (el) => quickRp(el.dataset.id, el.dataset.v),
  member: (el) => { Sheet.close(); Page.open('member', { id: el.dataset.v }); },
  'mem-color': (el) => { const m = member(el.dataset.id); if (m) Store.put('member', m.id, { ...m, color: el.dataset.v }); },
  'mem-del-ask': () => Page.set({ confirm: true }),
  'mem-del-no': () => Page.set({ confirm: false }),
  'mem-del': (el) => { const m = member(el.dataset.id); if (!m) return; Store.put('member', m.id, { ...m, del: true }); const v = Me.get(); if (v.me === m.id || v.partner === m.id) Me.set({ me: v.me === m.id ? '' : v.me, partner: v.partner === m.id ? '' : v.partner }); Page.close(); toast(`${m.name} a été retiré de l'équipe.`); },
  // Secteurs
  'zone-new': () => { ZE = newZE(); Page.open('zone'); },
  'zone-edit': (el) => { const z = Store.s.zones[el.dataset.v]; if (z) openZoneEditor(z); },
  'ze-color': (el) => { ZE.color = el.dataset.v; Page.render(false); },
  'ze-member': (el) => { const v = el.dataset.v; ZE.members = ZE.members.includes(v) ? ZE.members.filter((x) => x !== v) : [...ZE.members, v]; Page.render(false); },
  'ze-com': (el) => { ZE.com = el.dataset.v; Page.render(false); },
  'ze-only': () => { ZE.only = !ZE.only; Page.render(false); },
  'ze-open': (el) => { const k = el.dataset.v; ZE.open.has(k) ? ZE.open.delete(k) : ZE.open.add(k); Page.render(false); },
  'ze-street': (el) => { const st = streetOf(el.dataset.v); const all = st.addrs.every((a) => ZE.addrs.has(a.id)); for (const a of st.addrs) all ? ZE.addrs.delete(a.id) : ZE.addrs.add(a.id); Page.render(false); },
  'ze-quick': (el) => { const st = streetOf(el.dataset.v), m = el.dataset.m; for (const a of st.addrs) { const on = m === 'all' || (m === 'odd' && !a.even) || (m === 'even' && a.even); on ? ZE.addrs.add(a.id) : ZE.addrs.delete(a.id); } Page.render(false); },
  'ze-addr': (el) => { const id = el.dataset.id; ZE.addrs.has(id) ? ZE.addrs.delete(id) : ZE.addrs.add(id); Page.render(false); },
  'ze-lasso': () => { ZE.fromPage = true; MapView.startLasso(); },
  'ze-del': () => { ZE.confirm = true; Page.render(false); },
  'ze-del-no': () => { ZE.confirm = false; Page.render(false); },
  'ze-del-yes': () => { const z = Store.s.zones[ZE.id]; if (z) Store.put('zone', z.id, { ...z, del: true }); ZE = null; Page.close(); toast('Secteur supprimé.'); },
  'ze-save': () => {
    if (!ZE.addrs.size) return;
    const id = ZE.id || uid('z'), isNew = !ZE.id, name = ZE.name.trim() || 'Secteur';
    const moved = [...ZE.addrs].filter((a) => { const o = zoneIndex().get(a); return o && o !== id; }).length;
    saveZone({ id, name, color: ZE.color, members: ZE.members, addrs: [...ZE.addrs], order: ZE.order });
    ZE = null; Page.close();
    toast(`${isNew ? 'Secteur créé' : 'Secteur enregistré'} : ${name}${moved ? ` · ${moved} adresse${moved > 1 ? 's' : ''} déplacée${moved > 1 ? 's' : ''} depuis un autre secteur` : ''}`);
  },
  'auto-open': () => Page.set({ auto: !Page.args.auto, n: Page.args.n || 6 }),
  'auto-n': (el) => Page.set({ n: clamp((Page.args.n || 6) + +el.dataset.v, 2, 12) }),
  'auto-com': () => { replaceZones(COMMUNES.map((c) => addrs().filter((a) => a.com === c).map((a) => a.id)), (ids, i) => COMMUNES[i]); Page.set({ auto: false }); toast(`${COMMUNES.length} secteurs créés, un par commune. Affectez un binôme à chacun.`); },
  'auto-go': () => { const n = Page.args.n || 6; replaceZones(autoGroups(n, true), (ids, i) => { const cs = comsOf(ids); return `Secteur ${i + 1}${cs.length === 1 ? ' · ' + cs[0] : ''}`; }); Page.set({ auto: false }); toast(`${n} secteurs créés, rues entières. Affectez un binôme à chacun.`); },
  'unassigned-map': () => { UI.zone = '__none'; UI.filter = 'all'; UI.mapMode = 'map'; saveUI(); Page.close(); go('map'); },
  'unassigned-new': () => { ZE = newZE(); unassigned().forEach((a) => ZE.addrs.add(a.id)); ZE.only = true; Page.open('zone'); },
  'export-csv': () => exportCSV(),
  'export-json': () => exportJSON(),
  'import-json': () => $('#import-file').click(),
  'reset-ask': () => Page.set({ reset: true }),
  'reset-no': () => Page.set({ reset: false }),
  'reset-yes': () => {
    Sync.stop();
    for (const k of Object.values(K)) if (k !== K.theme) LS.del(k);
    LS.del(K.me + '.demo');
    Store.live = EMPTY(); Store.demo = null; Store.mode = 'live'; Store.rev++;
    Sync.queue = {}; Sync.code = ''; Sync.since = 0; Sync.sheet = ''; Sync.set('local');
    UI.tour = { street: null, near: false, order: 'sides', open: true, cur: null };
    Page.close(); go('home'); maybeWelcome();
  },
  theme: (el) => { LS.set(K.theme, el.dataset.v); applyTheme(); MapView.restyle(); App.changed(); },
  install: async () => { const p = App.installPrompt; if (!p) return; p.prompt(); try { await p.userChoice; } catch (e) { /* refusé */ } App.installPrompt = null; Page.refresh(); },
  'code-create': () => { setCode(genCode()); Page.refresh(); toast('Code créé. Faites scanner le QR code aux autres pompiers.'); },
  'share-link': async () => {
    const link = joinLink();
    if (navigator.share) { try { await navigator.share({ title: 'Tournée des calendriers', text: `Rejoins l'équipe des calendriers (code ${Sync.code})`, url: link }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(link); toast('Lien copié.'); } catch (e) { toast(link, { ms: 9000 }); }
  },
  'sync-now': () => { if (!Sync.timer) Sync.start(); else Sync.cycle(); },
  'hist-f': (el) => Page.set({ f: el.dataset.v }),
  'w-step': (el) => Page.set({ step: el.dataset.v }),
  'w-demo': () => { Page.close(); A['demo-enter'](); },
  'w-done': () => { LS.set(K.welcomed, true); Page.close(); go('home'); },
};
const FORMS = {
  'add-member': (f) => { const n = f.elements.mname.value.trim(); if (!n) return; addMember(n); f.reset(); toast(`${n} ajouté à l'équipe.`); },
  'w-create': (f) => {
    const list = f.elements.names.value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!list.length) return;
    const ids = list.map(addMember);
    if (Sync.configured && !Sync.code) setCode(genCode());
    if (ids.length === 1) Me.set({ me: ids[0], partner: '' });
    Page.set({ step: 'who' });
  },
  join: (f) => {
    const c = f.elements.code.value.trim().toUpperCase();
    if (c.length < 8) { toast('Ce code est trop court : il ressemble à SEP-XXXX-XXXX.'); return; }
    if (!joinTeam(f.elements.url.value, c)) return;
    if (Page.cur === 'welcome') Page.set({ step: 'who' }); else { Page.refresh(); toast('Équipe rejointe.'); }
  },
  'sheet-url': async (f) => {
    const url = f.elements.url.value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { toast("Adresse incorrecte : copiez l'adresse « Application Web » qui finit par /exec."); return; }
    toast('Vérification de la feuille…', { ms: 2000 });
    try {
      const res = await fetch(url); const j = await res.json();
      if (!j.ok) throw new Error('réponse');
      setSheetUrl(url); if (j.sheet) { Sync.sheet = j.sheet; LS.set(K.sheet, j.sheet); }
      if (Sync.code) Sync.start();
      Page.refresh(); toast(Sync.code ? 'Feuille reliée.' : 'Feuille reliée. Créez maintenant le code de l’équipe.');
    } catch (e) { toast('La feuille ne répond pas. Vérifiez le déploiement : accès « Tout le monde », puis réessayez.'); }
  },
  'add-addr': (f) => { addAddress(f.elements.com.value, f.elements.street.value, f.elements.num.value); f.reset(); },
};

// ═════════════════════════ Écouteurs
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el, e);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'street-q') { UI.q = t.value; $('#addr-hits').innerHTML = addrHits(); $('#street-list').innerHTML = streetRows(); return; }
  if (t.id === 'ze-q' && ZE) { ZE.q = t.value; const pos = t.selectionStart; Page.render(false); const n = $('#ze-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (t.id === 'ze-name' && ZE) { ZE.name = t.value; return; }
  if (t.dataset.bind && AS) {
    const path = t.dataset.bind.split('.');
    if (path.length === 2) AS.d[path[0]][path[1]] = t.value; else AS.d[path[0]] = t.value;
    if (t.dataset.bind === 'amt') {
      $$('[data-act="as-amt"]').forEach((b) => b.setAttribute('aria-pressed', String(t.value !== '' && num(t.value) === +b.dataset.v)));
      const btn = $('[data-act="as-save"]'), need = t.value.trim() === '';
      btn.disabled = need; btn.textContent = need ? 'Indiquez le montant' : 'Enregistrer';
    }
    if (t.dataset.bind === 'rp.date') $$('[data-act="as-rpdate"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === t.value)));
    return;
  }
  if (t.id === 'td-amt') {
    TD.amt = t.value.trim() === '' ? null : num(t.value);
    $$('[data-act="td-amt"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    const ok = $('#td-ok'); ok.disabled = TD.amt == null; ok.innerHTML = `${ico('check')} ${TD.amt != null ? 'Valider ' + eur(TD.amt) : 'Choisir un montant'}`;
    return;
  }
  if (t.id === 'td-rpnote') TD.rpNote = t.value;
});
document.addEventListener('change', (e) => {
  const t = e.target, ch = t.dataset.change;
  if (ch === 'zone') { UI.zone = t.value; saveUI(); App.changed(); }
  else if (ch === 'com') { UI.com = t.value; saveUI(); App.changed(); MapView.fit(true); }
  else if (ch === 'sort') { UI.sort = t.value; saveUI(); renderStreets(); }
  else if (ch === 'hist-member') Page.set({ m: t.value });
  else if (ch === 'street-zone') {
    const sk = t.dataset.sk, n = assignStreetToZone(sk, t.value);
    toast(t.value ? `${streetOf(sk)?.name} · ${n} adresse${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} dans ${Store.s.zones[t.value].name}.` : `${streetOf(sk)?.name} retirée de son secteur.`);
  }
  else if (ch === 'addr-zone') {
    const id = t.dataset.id, z = t.value;
    if (z) moveAddrToZone(id, z); else { const from = zoneOf(id); if (from) Store.put('zone', from.id, { ...from, addrs: from.addrs.filter((x) => x !== id) }); }
    toast(z ? `Adresse rangée dans ${Store.s.zones[z].name}.` : 'Adresse retirée de son secteur.');
  } else if (ch === 'unit-label') {
    const a = t.dataset.id, k = +t.dataset.k, b = Store.s.bld[a] || { n: unitsOf(a).length, labels: [] };
    const labels = [...(b.labels || [])]; labels[k - 1] = t.value.trim();
    setBld(a, b.n || unitsOf(a).length, labels);
  } else if (ch === 'assign-street') {
    const st = streetOf(t.dataset.sk), z = Store.s.zones[t.value]; if (!st || !z) return;
    const miss = new Set(unassigned().map((a) => a.id)), add = st.addrs.filter((a) => miss.has(a.id)).map((a) => a.id);
    Store.put('zone', z.id, { ...z, addrs: [...new Set([...(z.addrs || []), ...add])] });
    toast(`${add.length} adresse${add.length > 1 ? 's' : ''} de ${st.name} rangée${add.length > 1 ? 's' : ''} dans ${z.name}.`);
  }
  else if (t.id === 'tour-open') { UI.tour.open = t.checked; saveUI(); App.changed(); }
  else if (t.id === 'import-file') importJSON(t.files[0]);
  else if (t.dataset.set) { const k = t.dataset.set, set = Store.s.settings; Store.put('settings', 'main', { ...set, [k]: k === 'name' ? t.value.trim() || 'Calendriers' : num(t.value) }); }
  else if (t.dataset.member) { const m = member(t.dataset.member); if (m && t.value.trim()) Store.put('member', m.id, { ...m, name: t.value.trim() }); }
});
document.addEventListener('submit', (e) => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); FORMS[f.dataset.form]?.(f); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (Sheet.isOpen) Sheet.close();
  else if (MapView.lasso) A['lasso-cancel']();
  else if (Page.cur && Page.cur !== 'welcome') A['page-close']();
});

// ═════════════════════════ Démarrage
function boot() {
  applyTheme();
  Store.init();
  const h = new URLSearchParams(location.hash.slice(1));
  const join = h.get('join');
  if (join) {
    joinTeam(h.get('s') || '', join);
    history.replaceState(null, '', location.pathname + location.search);
  } else Sync.start();
  go(UI.view || 'home');
  maybeWelcome();
  if (join && Sync.configured) { toast('Équipe rejointe : indiquez qui vous êtes.'); setTimeout(openMeSheet, 1200); }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('online', () => Sync.cycle());
  window.addEventListener('offline', () => { if (Sync.timer) Sync.set('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { Sync.cycle(); if (UI.view === 'tour') Wake.on(); } });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); App.installPrompt = e; });
  window.addEventListener('resize', () => { if (MapView.map && UI.view === 'map') { MapView.map.invalidateSize(); MapView.size(); MapView.draw(); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); MapView.restyle(); });
  setInterval(() => { if (isoDay() !== App.day) { App.day = isoDay(); Store.rev++; App.changed(); } }, 60000);
}
boot();
