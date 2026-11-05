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
const fmtN = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf = (n) => fmtN.format(n || 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const pl = (n, w) => `${nf(n)} ${w}${+n > 1 ? 's' : ''}`;
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
const K = { state: 'cal.state.v1', queue: 'cal.queue.v2', since: 'cal.since.v2', code: 'cal.code', me: 'cal.me', cfg: 'cal.cfg.v2', sheet: 'cal.sheet', mode: 'cal.mode', role: 'cal.role', ver: 'cal.ver', ui: 'cal.ui.v2', zone: 'cal.zone', theme: 'cal.theme', welcomed: 'cal.welcomed', made: 'cal.made', fixLater: 'cal.fixlater', adminKey: 'cal.adminkey' };

// ═════════════════════════ Données du secteur (5 communes)
const O_LAT = 47.5, O_LON = 7.1;
const decode = (a) => { const out = []; let y = 0, x = 0; for (let i = 0; i < a.length; i += 2) { y += a[i]; x += a[i + 1]; out.push([O_LAT + y / 1e5, O_LON + x / 1e5]); } return out; };
const COMMUNES = ADDR.c;
const comIdx = (com) => { const i = COMMUNES.indexOf(com); return i < 0 ? 99 : i; };
const skey = (com, street) => `${com}|${street}`;
const sortKey = (s) => norm(s.replace(/^(Rue|Impasse|Place|Chemin|Allée|Route)\s+(du |de la |de l'|des |de |d')?/i, ''));
const mkAddr = (id, com, street, n0, lat, lon, custom = false) => { const n = parseInt(n0, 10) || 0; return { id, com, ci: comIdx(com), street, sk: skey(com, street), num: String(n0), n, lat, lon, even: n % 2 === 0, custom }; };
const numCmp = (a, b) => a.n - b.n || a.num.localeCompare(b.num, 'fr', { numeric: true });
const BASE_ADDRS = (() => {
  const seen = new Set(), out = []; // la base nationale contient un doublon : une maison ne doit figurer qu'une fois
  for (const [id, si, n0, lat, lon] of ADDR.a) { if (seen.has(id)) continue; seen.add(id); const [ci, name] = ADDR.s[si]; out.push(mkAddr(id, COMMUNES[ci], name, n0, lat, lon)); }
  return out;
})();
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
const SLOTS = { matin: 'Matin', midi: 'Midi', aprem: 'Après-midi', soir: 'Soir' };
const SLOT_SHORT = { matin: 'Matin', midi: 'Midi', aprem: 'Aprèm', soir: 'Soir' };
const PALETTE = ['#2F6FE4', '#7C3AED', '#0D9488', '#DB2777', '#CA8A04', '#4F46E5', '#EA580C', '#0891B2', '#65A30D', '#9333EA', '#BE123C', '#475569'];
const ZONE_COLORS = ['#7C3AED', '#0891B2', '#DB2777', '#0D9488', '#CA8A04', '#4F46E5', '#EA580C', '#65A30D', '#9333EA', '#BE123C', '#2F6FE4', '#475569'];

// ═════════════════════════ Stockage local + mode démo
const EMPTY = () => ({ settings: { name: 'Calendriers 2027', year: 2027, code: '', u: 0 }, members: {}, zones: {}, passages: {}, extra: {}, bld: {} });
const KIND_COL = { passage: 'passages', member: 'members', zone: 'zones', addr: 'extra', bld: 'bld' };

/** Contrôle ce qui vient d'ailleurs (feuille, sauvegarde, ancien stockage) : types forcés, ou null pour ignorer.
 *  L'affichage insère ids et couleurs sans échappement : ils doivent rester simples. */
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9][\w~-]{0,63}$/.test(v) && !(v in Object.prototype);
const txt = (v) => (v == null ? '' : String(v).slice(0, 2000));
const nb = (v) => (Number.isFinite(+v) ? +v : 0);
const idList = (v) => (Array.isArray(v) ? v.filter(isId) : []);
const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const known = (o, k, d) => (typeof k === 'string' && has(o, k) ? k : d);
function clean(kind, id, d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  if (kind === 'settings') return { ...d, name: txt(d.name), year: nb(d.year), code: d.code ? txt(d.code) : '', reset: nb(d.reset), u: nb(d.u) };
  if (!has(KIND_COL, kind) || !isId(id)) return null;
  const o = { ...d, u: nb(d.u), del: !!d.del };
  if (kind === 'member') return Object.assign(o, { id, name: txt(d.name).trim() || '?', color: hex(d.color, PALETTE[0]) });
  if (kind === 'zone') return Object.assign(o, { id, name: txt(d.name), code: /^\d{4}$/.test(String(d.code || '')) ? String(d.code) : '', color: hex(d.color, ZONE_COLORS[0]), members: idList(d.members), addrs: idList(d.addrs), order: nb(d.order), auto: !!d.auto });
  if (kind === 'bld') return Object.assign(o, { id, n: clamp(nb(d.n) | 0, 1, 99), labels: (Array.isArray(d.labels) ? d.labels.slice(0, 99) : []).map(txt) });
  if (kind === 'addr') {
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon)) return null;
    return Object.assign(o, { id, com: COMMUNES.includes(d.com) ? d.com : COMMUNES[0], street: txt(d.street) || '?', num: txt(d.num) || '?' });
  }
  const rp = d.rp && typeof d.rp === 'object' ? d.rp : null, l = d._l && typeof d._l === 'object' ? d._l : null;
  return Object.assign(o, {
    status: known(STATUS, d.status, 'todo'), at: nb(d.at), by: idList(d.by), name: txt(d.name), note: txt(d.note),
    rp: rp && { date: typeof rp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rp.date) ? rp.date : '', slot: known(SLOTS, rp.slot, ''), note: txt(rp.note), done: !!rp.done },
    hist: (Array.isArray(d.hist) ? d.hist : []).filter((h) => h && has(STATUS, h.s)).slice(-20).map((h) => ({ s: h.s, at: nb(h.at), by: idList(h.by) })),
    _l: l && { com: txt(l.com), rue: txt(l.rue), num: txt(l.num), lg: txt(l.lg) },
  });
}

const Store = {
  live: null, demo: null, mode: 'live', rev: 0, _t: 0,
  init() {
    const raw = LS.get(K.state, null) || {};
    this.live = EMPTY();
    this.live.settings = clean('settings', 'main', raw.settings) || this.live.settings;
    for (const [kind, col] of Object.entries(KIND_COL)) for (const [id, rec] of Object.entries(raw[col] || {})) { const r = clean(kind, id, rec); if (r) this.live[col][id] = r; }
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
    const s = this.live, u = Number(it?.updated_at) || 0, data = it && clean(it.kind, it.id, it.data);
    if (!data) return false;
    const cur = it.kind === 'settings' ? s.settings : s[KIND_COL[it.kind]][it.id];
    if (cur && (cur.u || 0) >= u) return false;
    const q = Sync.queue[it.kind + ':' + it.id];
    if (q && q.updated_at >= u) return false;
    const rec = { ...data, u };
    if (it.kind === 'settings') s.settings = rec; else s[KIND_COL[it.kind]][it.id] = rec;
    return true;
  },
};

/** Adresses de synchronisation acceptées : fonction Supabase (actuelle) ou script Google (historique). */
const SYNC_URL_OK = /^https:\/\/(?:[a-z0-9-]+\.supabase\.co\/rest\/v1\/rpc\/|script\.google(?:usercontent)?\.com\/)\S+/;

// ═════════════════════════ Synchronisation d'équipe : feuille Google Sheets (gratuite)
const Sync = {
  code: LS.get(K.code, ''), queue: LS.get(K.queue, {}), since: +LS.get(K.since, 0) || 0, sheet: LS.get(K.sheet, ''),
  state: 'local', err: '', lastOk: 0, timer: 0, _t: 0, _busy: false, gen: 0,
  url() { const o = LS.get(K.cfg, {}); return String(o.url || (window.CAL_CONFIG || {}).sheetUrl || '').trim(); },
  get configured() { return SYNC_URL_OK.test(this.url()); },
  get pg() { return /\/rest\/v1\/rpc\//.test(this.url()); }, // serveur Supabase (sinon : ancien script Google)
  get pending() { return Object.keys(this.queue).length; },
  start() {
    this.stop();
    if (!this.configured || !this.code) { this.set('local'); return; }
    this.timer = setInterval(() => { if (document.visibilityState === 'visible' && ((Role.admin && UI.view === 'map') || Date.now() - this.lastOk > 18000)) this.cycle(); }, 10000);
    this._p = this.cycle();
  },
  stop() { clearInterval(this.timer); clearTimeout(this._t); this.timer = 0; this.gen++; },
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
      const key = String((window.CAL_CONFIG || {}).syncKey || '');
      const opt = this.pg
        ? { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
            body: JSON.stringify({ p_code: body.code, p_since: body.since, p_items: body.items }), signal: ctl.signal }
        : { method: 'POST', body: JSON.stringify(body), signal: ctl.signal };
      const res = await fetch(this.url(), opt);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error((j && (j.error || j.message)) || `Serveur injoignable (erreur ${res.status})`);
      if (!j || !j.ok) throw new Error((j && (j.error || j.message)) || 'Réponse inattendue du serveur');
      return j;
    } finally { clearTimeout(t); }
  },
  async cycle() {
    if (!this.configured || !this.code || this._busy) return;
    if (!navigator.onLine) { this.set('offline'); return; }
    const gen = this.gen;
    this._busy = true; this.set('syncing');
    try {
      for (let guard = 0; guard < 30; guard++) {
        const batch = Object.values(this.queue).slice(0, 120);
        const j = await this.call({ v: 2, code: this.code, since: this.since, items: batch });
        if (gen !== this.gen) return; // arrêtée pendant l'envoi (autre équipe, autre feuille, téléphone effacé) : réponse périmée
        for (const it of batch) { const k = it.kind + ':' + it.id; if (this.queue[k]?.updated_at === it.updated_at) delete this.queue[k]; }
        LS.set(K.queue, this.queue);
        let changed = false;
        for (const it of j.items || []) if (Store.applyRemote(it)) changed = true;
        if (changed) { Store.rev++; clearTimeout(Store._t); LS.set(K.state, Store.live); App.changed(); }
        if (j.now) { this.since = j.now; LS.set(K.since, j.now); }
        if (j.sheet && j.sheet !== this.sheet) { this.sheet = j.sheet; LS.set(K.sheet, j.sheet); }
        if (!this.pending || !batch.length) break;
      }
      this.lastOk = Date.now(); this.set('online');
    } catch (e) {
      if (gen !== this.gen) return;
      const msg = e?.name === 'AbortError' ? 'Le serveur met trop de temps à répondre' : e?.message || String(e);
      if (/incorrect/i.test(msg) && LS.get(K.made, '') === this.code) {
        // Ce téléphone a créé un code alors que l'équipe existe déjà : il doit la rejoindre (QR du responsable)
        this.stop(); this.code = ''; LS.del(K.code); LS.del(K.made); this.queue = {}; LS.set(K.queue, {}); this.set('local');
        toast('Ce serveur a déjà une équipe. Pour partager, saisissez son code dans Réglages › Équipe connectée.', { ms: 9000 });
        if (Page.cur === 'settings') Page.refresh();
        return;
      }
      this.set(navigator.onLine ? 'error' : 'offline', msg);
    } finally {
      this._busy = false;
      if (gen !== this.gen && this.timer) this._p = this.cycle(); // la synchro relancée entre-temps n'a pas pu partir
    }
  },
};
const genCode = () => { const al = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint32Array(8)); let s = ''; for (let i = 0; i < 8; i++) s += al[r[i] % al.length]; return `SEP-${s.slice(0, 4)}-${s.slice(4)}`; };
const joinLink = (zcode = '') => (Sync.code
  ? `${location.origin}${location.pathname}#join=${encodeURIComponent(Sync.code)}&s=${encodeURIComponent(Sync.url())}${zcode ? '&z=' + encodeURIComponent(zcode) : ''}`
  : `${location.origin}${location.pathname}${zcode ? '#z=' + encodeURIComponent(zcode) : ''}`);
function setCode(code, made = false) {
  Sync.stop();
  if (!made && !Store.demoOn) {
    // L'équipe existe déjà : ses pompiers, secteurs et réglages arrivent de la feuille. Les portes notées ici, elles, partent.
    const e = EMPTY(); Store.live.members = {}; Store.live.zones = {}; Store.live.settings = e.settings; Store.rev++; LS.set(K.state, Store.live);
  }
  Sync.code = code; LS.set(K.code, code); LS.set(K.made, made ? code : '');
  if (!made) LS.del(K.zone); // autre équipe : le code de secteur d'avant ne veut plus rien dire
  Sync.since = 0; LS.del(K.since);
  Sync.queue = {}; LS.set(K.queue, {}); // rien d'ancien (essais, autre équipe) ne part dans la feuille
  Sync.enqueueAll(); Sync.start();
}
function setSheetUrl(url) { LS.set(K.cfg, { url: url.trim() }); }

// ═════════════════════════ Préférences du téléphone
const UI = Object.assign({ view: 'home', mapMode: 'map', filter: 'all', zone: '', com: '', street: null, q: '', sort: 'alpha' }, LS.get(K.ui, {}));
UI.tour = Object.assign({ street: null, near: false, order: 'sides', open: true, cur: null }, UI.tour || {});
UI.street = null;
const saveUI = () => LS.set(K.ui, { view: UI.view, mapMode: UI.mapMode, filter: UI.filter, zone: UI.zone, com: UI.com, sort: UI.sort, autoN: UI.autoN, autoK: UI.autoK, tour: UI.tour });

/** Découpage automatique : nombre maximum de secteurs par commune (limité en plus par le nombre de rues). */
const MAX_K = 20;
const MAX_TEAM = 4;
/** L'équipe qui tourne avec ce téléphone : 1 à 4 personnes (le plus souvent 2 ou 3). */
const Me = {
  key() { return Store.demoOn ? K.me + '.demo' : K.me; },
  raw() {
    const v = LS.get(this.key(), null);
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return [v.me, v.partner].filter(Boolean);   // ancien format
    return Store.demoOn ? ['demo-m0', 'demo-m1'] : [];
  },
  team() { return this.raw().filter((id, i, a) => member(id) && a.indexOf(id) === i).slice(0, MAX_TEAM); },
  set(ids) { LS.set(this.key(), [...new Set(ids)].slice(0, MAX_TEAM)); Store.rev++; App.changed(); },
  toggle(id) {
    const t = this.team();
    if (t.includes(id)) this.set(t.filter((x) => x !== id));
    else if (t.length >= MAX_TEAM) toast(`Quatre personnes au maximum sur un téléphone.`);
    else this.set([...t, id]);
  },
  has(id) { return this.team().includes(id); },
};
/** Deux accès : « responsable » (il répartit les rues) et « distributeur » (il fait les portes). */
const Role = {
  get() {
    const r = LS.get(K.role, ''), h = String((window.CAL_CONFIG || {}).adminHash || '');
    if (r === 'admin' && h && LS.get(K.adminKey, '') !== h) return 'distrib'; // accès ouvert avec un autre code (ancien ou changé)
    return r || (Store.demoOn ? 'admin' : '');
  },
  set(r) { LS.set(K.role, r); Store.rev++; App.changed(); },
  get admin() { return this.get() === 'admin'; },
  get chosen() { return !!this.get(); },
};
const adminCode = () => String(Store.s.settings.code || '');
/** Entre dans l'accès responsable. Sans code enregistré, le premier à en créer un devient responsable. */
/** Code d'accès responsable unique, vérifié contre l'empreinte de config.js (null : pas de code central). */
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function checkAdminCode(code) {
  const h = String((window.CAL_CONFIG || {}).adminHash || '');
  if (!h) return null;
  const [, it, salt, want] = h.split('$');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(normCode(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (x) => x.charCodeAt(0)), iterations: +it }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits))) === want;
}
/** Le téléphone du responsable relie l'équipe à la feuille dès qu'il a l'accès (une seule fois). */
async function linkTeamIfNeeded() {
  if (!Sync.configured || Sync.code || Store.demoOn) return true;
  setCode(genCode(), true);
  await Sync._p;
  return !!Sync.code; // false : la feuille appartient déjà à une équipe (le téléphone doit la rejoindre)
}
async function tryAdmin(code) {
  if (!normCode(code)) { toast('Entrez le code d’accès responsable.'); return false; }
  let central;
  try { central = await checkAdminCode(code); } catch (e) { central = false; }
  if (central === true) { LS.set(K.adminKey, String(window.CAL_CONFIG.adminHash)); Role.set('admin'); return true; }
  if (central === false) { toast('Code d’accès incorrect.'); vibrate([30, 60, 30]); return false; }
  return legacyAdmin(code);
}
/** Ancien fonctionnement (sans code central dans config.js) : le premier code saisi devient celui de l'équipe. */
function legacyAdmin(code) {
  const c = String(code || '').trim();
  if (!/^\d{4,8}$/.test(c)) { toast('Le code est composé de 4 à 8 chiffres.'); return false; }
  const cur = adminCode();
  if (!cur && Sync.configured && Sync.code && !Sync.since && LS.get(K.made, '') !== Sync.code && !Store.demoOn) {
    toast('Réception des réglages de l’équipe… Réessayez dans un instant.'); Sync.cycle(); return false;
  }
  if (!cur) Store.put('settings', 'main', { ...Store.s.settings, code: c });
  else if (cur !== c) { toast('Code incorrect.'); return false; }
  Role.set('admin');
  return true;
}

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
/** Date de la dernière remise à zéro : tout passage plus ancien est ignoré, sur tous les téléphones. */
const resetAt = () => +Store.s.settings.reset || 0;
/** Le passage d'un foyer, ou null s'il date d'avant la remise à zéro. */
const pass = (unitId) => { const p = Store.s.passages[unitId]; return p && (p.u || 0) > resetAt() ? p : null; };
const statusOf = (unitId) => pass(unitId)?.status || 'todo';
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
  pruneAutoZones();
  return ids.size;
}
function orderStreetUnits(sk, order = 'sides') {
  const st = streetOf(sk); if (!st) return [];
  let list = st.addrs.filter(visibleAddr);
  if (order === 'sides') list = [...list.filter((a) => !a.even), ...list.filter((a) => a.even).reverse()];
  return list.flatMap((a) => unitsOf(a.id));
}

/** Équipe d'une rue : les personnes du secteur qui contient toutes ses adresses (rue partagée sinon). */
function streetTeamOf(st) {
  const zi = zoneIndex(), ids = new Set(st.addrs.map((a) => zi.get(a.id) || ''));
  if (ids.size > 1) ids.delete(''); // quelques maisons oubliées ne cachent pas l'équipe de la rue
  if (ids.size !== 1) return { shared: true, zone: null, members: [] };
  const z = Store.s.zones[[...ids][0]];
  return { shared: false, zone: z && !z.del ? z : null, members: z && !z.del ? (z.members || []).filter(member) : [] };
}
/** Confie toute une rue à ces personnes : dans le secteur de cette équipe, ou un nouveau secteur à leurs noms. */
function assignStreetToPeople(sk, ids) {
  const st = streetOf(sk); if (!st) return;
  ids = ids.filter(member);
  const key = (l) => [...l].sort().join('|');
  let z = ids.length ? zones().find((x) => { const lm = (x.members || []).filter(member); return lm.length && key(lm) === key(ids); }) : null;
  if (ids.length && !z) {
    const id = uid('z'), color = ZONE_COLORS.find((c) => !zones().some((x) => x.color === c)) || ZONE_COLORS[zones().length % ZONE_COLORS.length];
    z = Store.put('zone', id, { id, name: names(ids), code: newZoneCode(), color, members: [...ids], addrs: [], order: zones().length, auto: true });
  }
  assignStreetToZone(sk, z ? z.id : '');
}
/** Les secteurs créés en touchant des prénoms disparaissent quand ils n'ont plus aucune maison. */
function pruneAutoZones() {
  const idx = addrIdx();
  for (const x of zones()) if (x.auto && !(x.addrs || []).some((id) => idx.has(id))) Store.put('zone', x.id, { ...x, del: true });
}
/** Fiche d'une rue, responsable : un toucher sur un prénom attribue (ou retire) toute la rue. */
function streetPeople(sk) {
  const st = streetOf(sk), t = streetTeamOf(st), ms = members();
  return `<div class="field"><span class="lbl">Qui fait cette rue ?</span>
    ${ms.length ? `<div class="chips wrap">${ms.map((m) => `<button class="chip mchip" data-act="st-member" data-sk="${esc(sk)}" data-v="${m.id}" aria-pressed="${t.members.includes(m.id)}">${avatar(m.id, 'sm')} ${esc(m.name)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0">Ajoutez les prénoms des distributeurs, puis touchez-les pour leur confier la rue.</p>'}
    <form class="street-tools" data-form="st-add-member" data-sk="${esc(sk)}"><input class="input" name="name" placeholder="Ajouter un prénom" autocomplete="off" autocapitalize="words" aria-label="Prénom à ajouter"><button class="btn ghost" type="submit">Ajouter</button></form>
    <small class="muted">${t.shared ? 'Rue partagée entre plusieurs équipes : toucher un prénom confie toute la rue à cette équipe.' : t.members.length ? `Confiée à <b>${esc(names(t.members))}</b> : ils la voient en rouge sur leur carte.` : 'Personne pour l’instant : touchez un ou plusieurs prénoms.'}</small>
  </div>`;
}
/** Code à 4 chiffres d'un secteur : ce que l'équipe saisit après avoir scanné le QR code. */
const zoneByCode = (code) => {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 4) return null;
  const hits = zones().filter((z) => z.code === c);
  return hits.length === 1 ? hits[0] : null; // deux secteurs avec le même code : on ne devine pas
};
/** Codes utilisés par deux secteurs à la fois : à corriger avant d'imprimer les billets. */
const dupCodes = () => { const n = {}; for (const z of zones()) if (z.code) n[z.code] = (n[z.code] || 0) + 1; return Object.keys(n).filter((c) => n[c] > 1); };
function newZoneCode() {
  // Les secteurs supprimés comptent aussi : un billet déjà imprimé ne doit jamais ouvrir un autre secteur
  const used = new Set(Object.values(Store.s.zones).map((z) => z && z.code).filter(Boolean));
  for (const n of crypto.getRandomValues(new Uint32Array(60))) { const c = String(1000 + (n % 9000)); if (!used.has(c)) return c; }
  return String(1000 + used.size);
}
/** Le secteur de ce téléphone : saisi une fois, il décide des rues visibles. */
const Sector = {
  get code() { return String(LS.get(K.zone, '') || ''); },
  get zone() { const c = this.code; return c && !Store.demoOn ? zones().find((z) => z.code === c) || null : null; },
  set(code) { LS.set(K.zone, String(code || '')); Store.rev++; App.changed(); },
  clear() { LS.del(K.zone); Store.rev++; App.changed(); },
};
/** Les secteurs de ce téléphone : celui de son code, sinon ceux de son équipe (ancienne façon). */
const myZones = () => {
  if (Sector.code) { const z = Sector.zone; return z ? [z] : []; } // un code saisi fait foi, même s'il ne correspond plus
  const t = Me.team(); return t.length ? zones().filter((x) => (x.members || []).some((m) => t.includes(m))) : [];
};
/** Adresses confiées à l'équipe de ce téléphone. */
const myAddrSet = () => memo('myAddrs', () => new Set(myZones().flatMap((z) => z.addrs || [])));
/** Le responsable voit tout ; un distributeur ne voit que les adresses de ses rues. */
const visibleAddr = (a) => Role.admin || myAddrSet().has(a.id);
/** Rues visibles sur ce téléphone. */
const visStreets = () => memo('visStreets', () => (Role.admin ? streets() : streets().filter((st) => st.addrs.some(visibleAddr))));
/** Avancement cumulé d'une liste de secteurs. */
function zonesProgress(list) {
  const S = stats(), out = { total: 0, visited: 0, st: blankSt() };
  for (const z of list) {
    const g = S.byZone[z.id]; if (!g) continue;
    out.total += g.total; out.visited += g.visited;
    for (const k of ST_FILTER) out.st[k] += g.st[k];
  }
  return out;
}
/** Rues d'une liste de secteurs, dans l'ordre de la tournée. */
function zonesStreets(list) {
  const ids = new Set(list.flatMap((z) => z.addrs || []));
  return streets().filter((st) => st.addrs.some((a) => ids.has(a.id)));
}
const openOf = (st) => st.addrs.filter(visibleAddr).reduce((t, a) => t + unitsOf(a.id).filter((u) => OPEN.has(statusOf(u.id))).length, 0);
function stats() {
  return memo('stats', () => {
    const s = Store.s, zi = zoneIndex();
    const st = blankSt(), byDay = {}, byMember = {}, byStreet = new Map(), byZone = {}, byCom = {};
    const mem = (id) => (byMember[id] ||= { doors: 0, streets: new Map(), last: 0 });
    const grp = () => ({ total: 0, visited: 0, st: blankSt(), members: new Set() });
    let total = 0;
    for (const u of units()) {
      if (!visibleAddr(u.a)) continue;
      total++;
      const a = u.a, p = pass(u.id), status = p?.status || 'todo';
      st[status]++;
      let bs = byStreet.get(a.sk); if (!bs) byStreet.set(a.sk, (bs = { ...grp(), sk: a.sk, name: a.street, com: a.com }));
      const bc = (byCom[a.com] ||= grp());
      const zid = zi.get(a.id), bz = zid ? (byZone[zid] ||= grp()) : null;
      for (const g of [bs, bc, bz]) if (g) { g.total++; g.st[status]++; if (status !== 'todo') g.visited++; }
      for (const h of p?.hist || []) {
        if (h.s === 'todo') continue;
        const d = isoDay(new Date(h.at));
        byDay[d] = (byDay[d] || 0) + 1;
        for (const m of h.by || []) {
          const bm = mem(m); bm.doors++; bm.last = Math.max(bm.last, h.at); bs.members.add(m);
          const arr = bm.streets.get(a.sk) || []; if (!arr.includes(u)) arr.push(u); bm.streets.set(a.sk, arr);
        }
      }
    }
    return { total, visited: total - st.todo, st, byDay, byMember, byStreet, byZone, byCom };
  });
}
function repasses() {
  return memo('rep', () => {
    const s = Store.s, out = [], so = { matin: 1, midi: 2, aprem: 3, soir: 4, '': 5 };
    for (const u of units()) {
      if (!visibleAddr(u.a)) continue;
      const p = pass(u.id);
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
    if (!visibleAddr(a) || (Role.admin && UI.com && a.com !== UI.com)) continue;
    const hay = norm(a.street + ' ' + a.com);
    if (!words.every((w) => hay.includes(w))) continue;
    out.push(a);
  }
  return out.sort((x, y) => x.ci - y.ci || sortKey(x.street).localeCompare(sortKey(y.street), 'fr')).slice(0, 40);
}
function events() {
  return memo('events', () => {
    const out = [];
    for (const u of units()) { if (!visibleAddr(u.a)) continue; const p = pass(u.id); if (p?.hist) for (const h of p.hist) if (h.s !== 'todo') out.push({ u, a: u.a, h }); }
    return out.sort((x, y) => y.h.at - x.h.at);
  });
}

// ═════════════════════════ Écriture des passages, immeubles, secteurs
function savePassage(unitId, d) {
  const s = Store.s, u = unitIdx().get(unitId), prev = clone(pass(unitId) || null), now = Date.now();
  const status = d.status;
  const by = d.by?.length ? [...d.by] : Me.team();
  const hist = [...(prev?.hist || [])];
  const entry = { s: status, at: now, by };
  const last = hist[hist.length - 1];
  if (last && last.s === status && now - last.at < 20 * 60000) hist[hist.length - 1] = entry;
  else if (status !== 'todo') hist.push(entry);
  let rp = null;
  if (status === 'repasse' || (status === 'absent' && d.rp?.date)) rp = { date: d.rp?.date || '', slot: d.rp?.slot || '', note: (d.rp?.note || '').trim(), done: false };
  Store.put('passage', unitId, {
    status, at: now, by: status === 'todo' ? [] : by,
    name: (d.name || '').trim(), note: (d.note || '').trim(), rp,
    hist: hist.slice(-20),
    _l: u ? { com: u.a.com, rue: u.a.street, num: u.a.num, lg: u.n > 1 ? u.label : '' } : prev?._l,
  });
  return prev;
}
function restorePassage(id, prev) { Store.put('passage', id, prev ? { ...prev } : { status: 'todo', at: Date.now(), by: [], hist: [] }); }
function quickRp(unitId, date) {
  const p = clone(pass(unitId)); if (!p) return;
  p.rp = { date, slot: p.rp?.slot || '', note: p.rp?.note || '', done: false };
  Store.put('passage', unitId, p);
  toast(`Repasse ${dayLabel(date).toLowerCase()} · ${unitTitle(unitIdx().get(unitId))}`);
}
function setBld(addrId, n, labels) {
  const cur = Store.s.bld[addrId] || {};
  n = clamp(n | 0, 1, 99);
  const lost = unitsOf(addrId).filter((u) => u.k > n && pass(u.id)?.hist?.length).length;
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
  Store.put('zone', z.id, { ...cur, ...z, code: z.code || cur.code || newZoneCode(), addrs: [...set] });
  pruneAutoZones();
}
function moveAddrToZone(addrId, zoneId) {
  const from = zoneOf(addrId);
  if (from && from.id === zoneId) return;
  if (from) Store.put('zone', from.id, { ...from, addrs: (from.addrs || []).filter((x) => x !== addrId) });
  const to = Store.s.zones[zoneId];
  if (to && !to.del) Store.put('zone', to.id, { ...to, addrs: [...new Set([...(to.addrs || []), addrId])] });
  pruneAutoZones();
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
  const n = P.length; k = clamp(k, 1, Math.min(MAX_K, n));
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
/** Découpe un village en k secteurs d'un seul tenant : répartition équilibrée, puis recollage des morceaux. */
function growRegions(items, k) {
  const n = items.length;
  if (k <= 1 || n <= 1) return [items.flatMap((i) => i.ids)];
  const lat0 = 47.53, lon0 = 7.18, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const P = items.map((it) => ({ ...it, x: (it.lon - lon0) * kx, y: (it.lat - lat0) * ky }));
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  // Voisinage des rues : les 5 plus proches, plus tout ce qui est à moins de 250 m
  const adj = P.map(() => new Set());
  P.forEach((p, i) => {
    const near = P.map((q, j) => ({ j, d: d2(p, q) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d);
    const link = (o) => { adj[i].add(o.j); adj[o.j].add(i); };
    near.slice(0, 4).forEach(link);
    near.filter((o) => o.d <= 250 * 250).forEach(link);
  });
  // Les hameaux isolés sont rattachés au reste, sinon ils ne peuvent jamais changer de secteur
  const comp = new Array(n).fill(-1); let nc = 0;
  for (let i = 0; i < n; i++) if (comp[i] < 0) { const st = [i]; comp[i] = nc; while (st.length) { const u = st.pop(); for (const j of adj[u]) if (comp[j] < 0) { comp[j] = nc; st.push(j); } } nc++; }
  while (nc > 1) {
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (comp[i] !== comp[j] && d2(P[i], P[j]) < bd) { bd = d2(P[i], P[j]); bi = i; bj = j; }
    if (bi < 0) break;
    adj[bi].add(bj); adj[bj].add(bi);
    const from = comp[bj], to = comp[bi];
    for (let i = 0; i < n; i++) if (comp[i] === from) comp[i] = to;
    nc--;
  }
  // 1. Répartition équilibrée : chaque secteur reçoit à peu près le même nombre de foyers
  const itemOf = new Map();
  items.forEach((it, i) => it.ids.forEach((id) => itemOf.set(id, i)));
  const owner = new Array(n).fill(0);
  cluster(items, k).forEach((ids, g) => ids.forEach((id) => { owner[itemOf.get(id)] = g; }));
  const kk = Math.max(...owner) + 1;
  // 2. Recollage : un morceau détaché rejoint le secteur voisin auquel il tient le plus
  for (let pass = 0; pass < 8; pass++) {
    let moved = 0;
    for (let g = 0; g < kk; g++) {
      const mine = []; owner.forEach((o, i) => { if (o === g) mine.push(i); });
      if (mine.length < 2) continue;
      const set = new Set(mine), seen = new Set(), parts = [];
      for (const i of mine) {
        if (seen.has(i)) continue;
        const c = [], st = [i]; seen.add(i);
        while (st.length) { const u = st.pop(); c.push(u); for (const v of adj[u]) if (set.has(v) && !seen.has(v)) { seen.add(v); st.push(v); } }
        parts.push(c);
      }
      if (parts.length < 2) continue;
      parts.sort((a, b) => sum(b, (i) => P[i].w) - sum(a, (i) => P[i].w)); // on garde le plus gros morceau
      for (const c of parts.slice(1)) {
        const votes = {};
        for (const i of c) for (const j of adj[i]) if (owner[j] !== g) votes[owner[j]] = (votes[owner[j]] || 0) + 1;
        const to = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
        if (!to) continue;
        c.forEach((i) => { owner[i] = +to[0]; });
        moved++;
      }
    }
    if (!moved) break;
  }
  // 3. Lissage : une rue cernée par un autre secteur le rejoint, tant que ça n'alourdit pas l'inégalité
  const loads = Array.from({ length: kk }, (_, g) => sum(P.filter((_, i) => owner[i] === g), (p) => p.w));
  const avg = sum(P, (p) => p.w) / kk;
  for (let round = 0; round < 8; round++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const from = owner[i], w = P[i].w;
      if (owner.filter((o) => o === from).length < 2) continue;
      const cnt = {};
      for (const j of adj[i]) cnt[owner[j]] = (cnt[owner[j]] || 0) + 1;
      const mine = cnt[from] || 0;
      const best = Object.entries(cnt).filter(([g]) => +g !== from).sort((a, b) => b[1] - a[1])[0];
      if (!best || best[1] < mine + 2) continue;
      const to = +best[0];
      const cerclee = best[1] >= Math.ceil(adj[i].size * 0.75);
      // On va du plus lourd vers le plus léger ; une rue totalement cernée passe quand même, sans dépasser la moyenne
      if (!(loads[to] + w <= loads[from]) && !(cerclee && loads[to] + w <= avg * 1.15)) continue;
      loads[from] -= w; loads[to] += w; owner[i] = to; moved++;
    }
    if (!moved) break;
  }
  const out = Array.from({ length: kk }, () => []);
  P.forEach((p, i) => out[owner[i]].push(...p.ids));
  return out.filter((g) => g.length);
}
/** Nombre de secteurs conseillé pour un village : environ 130 foyers chacun. */
const comUnits = (com) => memo('cu:' + com, () => sum(addrs().filter((a) => a.com === com), (a) => unitsOf(a.id).length));
const defaultK = (com) => clamp(Math.ceil(comUnits(com) / 130), 1, 8);
const autoK = () => Object.fromEntries(COMMUNES.map((c) => [c, clamp((UI.autoK || {})[c] ?? defaultK(c), 1, MAX_K)]));
/** Découpe chaque village en k secteurs compacts, nommés nord / est / sud / ouest. */
const DIR4 = ['nord', 'est', 'sud', 'ouest'];
const DIR8 = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
function villageGroups(ks) {
  const idx = addrIdx(), out = [], per = ks || autoK();
  for (const com of COMMUNES) {
    const list = addrs().filter((a) => a.com === com);
    if (!list.length) continue;
    const bySt = new Map();
    for (const a of list) { if (!bySt.has(a.sk)) bySt.set(a.sk, []); bySt.get(a.sk).push(a); }
    const items = [...bySt.values()].map((arr) => ({ ids: arr.map((a) => a.id), w: sum(arr, (a) => unitsOf(a.id).length), lat: sum(arr, (a) => a.lat) / arr.length, lon: sum(arr, (a) => a.lon) / arr.length }));
    const kk = clamp(typeof per === 'number' ? per : per[com] || 1, 1, Math.min(items.length, MAX_K));
    const groups = growRegions(items, kk).filter((g) => g.length);
    const c = [sum(list, (a) => a.lat) / list.length, sum(list, (a) => a.lon) / list.length];
    const kx = Math.cos((c[0] * Math.PI) / 180);
    const withAng = groups.map((ids) => {
      const pts = ids.map((id) => idx.get(id)).filter(Boolean);
      const la = sum(pts, (p) => p.lat) / pts.length, lo = sum(pts, (p) => p.lon) / pts.length;
      const ang = (((Math.atan2((lo - c[1]) * kx, la - c[0]) * 180) / Math.PI) + 360) % 360;
      return { ids, ang, n: sum(pts, (p) => unitsOf(p.id).length) };
    });
    if (withAng.length === 1) { out.push({ name: com, ids: withAng[0].ids }); continue; }
    // Chaque groupe prend l'orientation la plus proche, sans doublon
    const dirs = withAng.length <= 4 ? DIR4 : DIR8;
    const step = 360 / dirs.length, taken = new Set();
    const gap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    // On sert d'abord les groupes dont l'orientation est la plus franche
    [...withAng]
      .map((g) => ({ g, best: dirs.map((_, j) => ({ j, d: gap(g.ang, j * step) })).sort((x, y) => x.d - y.d) }))
      .sort((x, y) => x.best[0].d - y.best[0].d)
      .forEach(({ g, best }) => {
        const choice = best.find((o) => !taken.has(o.j));
        const j = choice ? choice.j : dirs.findIndex((_, x) => !taken.has(x));
        taken.add(j);
        out.push({ name: `${com} ${dirs[j]}`, ids: g.ids });
      });
  }
  return out;
}
function replaceZonesNamed(list) {
  for (const z of zones()) Store.put('zone', z.id, { ...z, del: true });
  list.forEach((g, i) => { const id = uid('z'); Store.put('zone', id, { id, name: g.name, code: newZoneCode(), color: ZONE_COLORS[i % ZONE_COLORS.length], addrs: g.ids, members: [], order: i }); });
}
function replaceZones(groups, namer) {
  for (const z of zones()) Store.put('zone', z.id, { ...z, del: true });
  groups.forEach((ids, i) => { const id = uid('z'); Store.put('zone', id, { id, name: namer(ids, i), code: newZoneCode(), color: ZONE_COLORS[i % ZONE_COLORS.length], addrs: ids, members: [], order: i }); });
}
const comsOf = (ids) => [...new Set(ids.map((id) => addrIdx().get(id)?.com).filter(Boolean))].sort((a, b) => comIdx(a) - comIdx(b));

// ═════════════════════════ Données de démonstration (jamais enregistrées)
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeDemo() {
  const rnd = mulberry32(1926), pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const s = EMPTY();
  s.settings = { name: 'Calendriers 2027', year: 2027, code: '1926', u: 1 };
  const noms = ['Thomas K.', 'Julie W.', 'Nicolas B.', 'Léa S.', 'Marc H.', 'Camille F.', 'Hugo R.', 'Inès D.', 'Paul G.', 'Chloé M.', 'Yann P.', 'Sarah L.'];
  const ids = noms.map((n, i) => { const id = 'demo-m' + i; s.members[id] = { id, name: n, color: PALETTE[i % PALETTE.length], u: 1 }; return id; });
  BASE_ADDRS.forEach((a, i) => { if ((a.com === 'Seppois-le-Bas' || a.com === 'Pfetterhouse') && i % 31 === 7) s.bld[a.id] = { id: a.id, n: 2 + (i % 5), labels: [], u: 1 }; });
  const now = Date.now(), today = isoDay(), days = [];
  for (let k = 16; k >= 0; k--) { const iso = addDays(today, -k); const dw = new Date(iso + 'T12:00:00').getDay(); if (dw === 0 || dw === 6 || dw === 3 || k === 0) days.push(iso); }
  const prog = [0.78, 0.55, 0.32, 0.62, 0.15];
  COMMUNES.forEach((com, zi) => {
    const id = 'demo-z' + zi;
    const team = zi % 2 ? [ids[zi * 2], ids[zi * 2 + 1], ids[(zi * 2 + 7) % ids.length]] : [ids[zi * 2], ids[zi * 2 + 1]];
    const list = BASE_ADDRS.filter((a) => a.com === com).sort((a, b) => sortKey(a.street).localeCompare(sortKey(b.street)) || numCmp(a, b));
    s.zones[id] = { id, name: com, code: String(1926 + zi * 1111), color: ZONE_COLORS[zi], addrs: list.map((a) => a.id), members: team, order: zi, u: 1 + zi }; // codes de démo : 1926, 3037, 4148…
    const us = list.flatMap((a) => { const n = s.bld[a.id]?.n || 1; return Array.from({ length: n }, (_, k) => ({ id: k ? `${a.id}~${k + 1}` : a.id, a })); });
    const nV = Math.round(us.length * prog[zi]);
    for (let k = 0; k < nV; k++) {
      const u = us[k], iso = days[Math.min(days.length - 1, Math.floor((k / nV) * days.length))];
      const at = new Date(iso + 'T00:00:00').getTime() + (570 + Math.floor(rnd() * 540)) * 60000;
      if (at > now) continue;
      const r = rnd(), status = r < 0.74 ? 'done' : r < 0.87 ? 'absent' : r < 0.94 ? 'repasse' : 'refus';
      const by = rnd() < 0.85 ? team : [team[Math.floor(rnd() * team.length)]];
      const hist = [];
      if (status === 'done' && rnd() < 0.18) hist.push({ s: 'absent', at: at - 2 * 86400000, by });
      hist.push({ s: status, at, by });
      const p = { status, at, by, name: '', note: '', rp: null, hist, u: at };
      if (status === 'repasse' || (status === 'absent' && rnd() < 0.5)) p.rp = { date: addDays(today, Math.floor(rnd() * 6) - 1), slot: pick(['matin', 'aprem', 'soir', 'soir']), note: pick(['', '', 'Revenir après 18 h', 'Sonner à la porte de derrière', 'Chien dans la cour', 'Repasser le week-end']), done: false };
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
    if (!Role.admin && (UI.view === 'home' || UI.view === 'team')) { go('map'); return; }
    renderHeader();
    const el = $('#v-' + UI.view), ae = document.activeElement;
    const busy = ae && el?.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'street-q';
    if (!busy) VIEWS[UI.view]();
    if (MapView.map) MapView.refresh();
    if (Page.cur) Page.refresh();
    const se = document.activeElement;
    if (Sheet.refresh && !(se && $('#sheet')?.contains(se) && /^(INPUT|TEXTAREA|SELECT)$/.test(se.tagName))) Sheet.refresh();
  },
  renderSync() { renderHeader(); liveLine(); if (Page.cur === 'settings' || Page.cur === 'welcome' || (Page.cur === 'reset' && /^phone/.test(Page.args.step || ''))) Page.refresh(); },
};
const VIEWS = { home: renderHome, map: renderMapView, tour: renderTour, rep: renderRep, team: renderTeam };
function go(v) {
  if (!VIEWS[v]) v = 'home';
  if (!Role.admin && (v === 'home' || v === 'team')) v = 'map'; // distributeur : sa carte, sa tournée, ses repasses
  const changed = UI.view !== v;
  UI.view = v; saveUI();
  $$('#main > .view').forEach((el) => (el.hidden = el.id !== 'v-' + v));
  if (changed) { clearTimeout(App._ve); $$('#main > .view.v-enter').forEach((x) => x.classList.remove('v-enter')); }
  if (v === 'tour') Wake.on(); else Wake.off();
  App.render();
  if (changed) {
    const el = $('#v-' + UI.view);
    el.classList.add('v-enter');
    App._ve = setTimeout(() => el.classList.remove('v-enter'), 420);
    setScrollShadow(el.scrollTop > 4);
  }
  if (changed) $('#v-' + v).scrollTop = 0;
  if (v === 'map' && UI.mapMode === 'map') requestAnimationFrame(() => MapView.show());
}

/** Ombre sous l'en-tête : posée seulement quand la vue affichée est défilée. */
let _shadow = false;
function setScrollShadow(on) { if (on !== _shadow) { _shadow = on; document.body.classList.toggle('scrolled', on); } }

// ═════════════════════════ En-tête
function renderHeader() {
  const s = Store.s;
  $('#hdr-title').textContent = s.settings.name || 'Calendriers';
  const pill = $('#sync-pill'), st = Store.demoOn ? 'demo' : Sync.state;
  let txt = { demo: 'Démo', local: 'Local', online: 'En ligne', syncing: 'Synchro…', offline: 'Hors ligne', error: 'Erreur synchro' }[st] || 'Local';
  if (!Store.demoOn && Sync.pending && Sync.code && st !== 'syncing') txt += ` · ${Sync.pending}`;
  pill.dataset.s = st; pill.querySelector('span').textContent = txt; pill.title = txt; pill.setAttribute('aria-label', 'Synchronisation : ' + txt);
  const m = member(Me.team()[0]), btn = $('#me-btn');
  btn.innerHTML = m ? esc(initials(m.name)) : ico('user');
  btn.style.background = m ? m.color : '';
  btn.title = m ? `Tournée de ${names(Me.team())}` : 'Qui fait la tournée ?';
  $('#demo-banner').hidden = !Store.demoOn;
  const today = isoDay(), due = repasses().filter((r) => r.date && r.date <= today).length;
  const b = $('#rep-badge'); b.hidden = !due; b.textContent = due;
  $$('.tabs > button').forEach((x) => (x.dataset.v === UI.view ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current')));
  const tTab = $('.tabs > button[data-v="team"] span');
  if (tTab) tTab.textContent = Role.admin ? 'Répartition' : 'Mon équipe';
  $$('.tabs > button[data-v="home"], .tabs > button[data-v="team"]').forEach((b) => (b.hidden = !Role.admin));
}

// ═════════════════════════ Accueil
function renderHome() {
  const el = $('#v-home'), S = stats(), set = Store.s.settings;
  const now = new Date(), today = isoDay();
  const due = repasses().filter((r) => r.date && r.date <= today);
  const days = []; for (let k = 13; k >= 0; k--) days.push(addDays(today, -k));
  const maxD = Math.max(0, ...days.map((d) => S.byDay[d] || 0));
  const zs = zones(), miss = unassigned().length;
  const mine = myZones(), mp = mine.length ? zonesProgress(mine) : null;
  const myStreets = mine.length ? zonesStreets(mine) : [];
  const ranked = members().map((m) => [m, S.byMember[m.id]]).filter(([, b]) => b?.doors).sort((a, b) => b[1].doors - a[1].doors).slice(0, 5);
  const tourSt = UI.tour.street && streetOf(UI.tour.street);
  const hero = mp || S, heroLbl = mp ? 'Mes rues' : 'Avancement';
  el.innerHTML = `<div class="view-in">${oldIconCard()}${linkCard()}<div class="home-grid">
  <div class="home-col">
    <section class="hero" aria-label="Avancement">
      <div class="hero-chief">
        <div class="rings" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="hero-eyebrow">${heroLbl} · ${esc(set.name || 'Campagne')}</div>
        <div class="hero-amt">${pct(hero.visited, hero.total)}&nbsp;%</div>
        <div class="goal-bar"><i style="width:${clamp(pct(hero.visited, hero.total), 0, 100)}%"></i></div>
        <div class="goal-lbl"><span>${nf(hero.visited)} foyers faits</span><span>${nf(hero.total - hero.visited)} restants</span></div>
      </div>
      <div class="hero-field">
        <div class="shield"><b>${nf(hero.st.done)}</b><span>donnés</span></div>
        <div class="shield"><b>${nf(hero.st.todo)}</b><span>à faire</span></div>
        <div class="shield"><b>${nf(hero.st.absent + hero.st.repasse)}</b><span>à revoir</span></div>
      </div>
    </section>
    <button class="btn red block big-cta" data-act="go" data-v="tour">${ico('door')} ${tourSt ? `Reprendre · ${esc(tourSt.name)}` : 'Commencer la tournée'}</button>
    ${mine.length ? `<section class="card">
      <div class="card-h"><h2>Mes rues</h2><span class="muted">${esc(mine.map((z) => z.name).join(', '))}</span></div>
      ${myStreets.slice(0, 6).map((st) => streetMini(st)).join('')}
      ${myStreets.length > 6 ? `<button class="link" data-act="go" data-v="team">Voir mes ${pl(myStreets.length, 'rue')}</button>` : ''}
    </section>` : `<section class="card"><div class="empty">${(() => { const h = sectorHint(); return h ? sectorHintHtml(h) : '<b>Qui êtes-vous ?</b><span>Choisissez votre prénom et celui des personnes avec vous.</span><button class="btn" data-act="me-sheet">Choisir</button>'; })()}</div></section>`}
    <section class="card">
      <div class="card-h"><h2>Aujourd'hui</h2><span class="muted">${DOWL[now.getDay()]} ${now.getDate()} ${MON[now.getMonth()]}</span></div>
      <div class="today">
        <div class="kpi"><b>${S.byDay[today] || 0}</b><span>passages</span></div>
        <div class="kpi"><b>${due.length}</b><span>repasses dues</span></div>
        <div class="kpi"><b>${nf(S.st.todo)}</b><span>foyers restants</span></div>
      </div>
      ${due.length ? `<div class="mini-list">${due.slice(0, 4).map(repRow).join('')}</div>${due.length > 4 ? `<button class="link" data-act="go" data-v="rep">Voir les ${pl(due.length, 'repasse')}</button>` : ''}` : ''}
    </section>
  </div>
  <div class="home-col">
    ${Role.admin ? `<section class="card">
      <div class="card-h"><h2>Les secteurs</h2><span class="muted">${pl(zs.length, 'secteur')}</span></div>
      <div class="grid2">
        <button class="btn block" data-act="zone-build">${ico('plus')} Créer un secteur</button>
        <button class="btn ghost block" data-act="page" data-v="assign">${ico('user')} Attribuer les secteurs</button>
      </div>
      <button class="btn ghost block" style="margin-top:8px" data-act="auto-show">${ico('sparkle')} Répartition automatique · ${pl(sum(Object.values(autoK())), 'secteur')}</button>
    </section>
    <section class="card">
      <div class="card-h"><h2>Répartition</h2><button class="link" data-act="go" data-v="team">Gérer</button></div>
      ${coverageBlock()}
      ${zs.length ? zs.map((z) => zoneRow(z)).join('') : `<p class="muted" style="margin:0 0 12px">Créez les secteurs et confiez chacun à une équipe de 2 ou 3 personnes.</p><button class="btn block" data-act="go" data-v="team">${ico('sparkle')} Répartir les rues</button>`}
    </section>` : ''}
    <section class="card">
      <div class="card-h"><h2>${nf(S.total)} foyers</h2><span class="muted">${Role.admin ? `${COMMUNES.length} communes` : 'dans vos rues'}</span></div>
      ${stackBar(S.st, S.total)}
      <div class="st-grid">${ST_FILTER.map((k) => `<button class="st-cell" data-act="mapfilter" data-v="${k}"><span class="dot" data-st="${k}"></span><b>${nf(S.st[k])}</b><span>${STATUS[k].label} · ${pct(S.st[k], S.total)} %</span></button>`).join('')}</div>
    </section>
    ${Role.admin ? '' : '<!--'}<section class="card">
      <div class="card-h"><h2>Par commune</h2><span class="muted">foyers faits</span></div>
      ${COMMUNES.map((c) => { const g = S.byCom[c] || { total: 0, visited: 0, st: blankSt() }; return `<button class="zone-row as-btn" data-act="com-go" data-v="${esc(c)}"><span class="zdot" style="--c:var(--ink-2)"></span><b>${esc(c)}</b><span class="meta">${pct(g.visited, g.total)} %</span>${stackBar(g.st, g.total, 'sm')}<span class="muted" style="grid-column:2/-1;font-size:12.5px">${nf(g.visited)} / ${nf(g.total)} foyers</span></button>`; }).join('')}
    </section>${Role.admin ? '' : '-->'}
    <section class="card">
      <div class="card-h"><h2>14 derniers jours</h2><span class="muted">passages par jour</span></div>
      ${maxD ? `<div class="chart"><div class="gridline"><span>${maxD}</span></div><div class="bars">${days.map((d) => { const v = S.byDay[d] || 0; return `<i class="${d === today ? 'today' : ''}${v ? '' : ' zero'}" style="height:${v ? Math.max(3, (v / maxD) * 100) : 2}%" title="${dayLabel(d)} : ${pl(v, 'passage')}"></i>`; }).join('')}</div><div class="bars-x">${days.map((d, i) => `<span>${i % 2 === 1 ? new Date(d + 'T12:00:00').getDate() : ''}</span>`).join('')}</div></div>` : '<div class="empty">Aucun passage sur les 14 derniers jours.</div>'}
    </section>
    <section class="card">
      <div class="card-h"><h2>Qui a fait quoi</h2><button class="link" data-act="go" data-v="team">Équipe</button></div>
      ${ranked.length ? ranked.map(([m, b], i) => rankRow(m, b, i)).join('') : '<p class="muted" style="margin:0">Personne n’a encore enregistré de passage.</p>'}
    </section>
    <section class="card">
      <div class="card-h"><h2>Derniers passages</h2><button class="link" data-act="history">Historique</button></div>
      ${events().length ? `<div class="mini-list" style="margin-top:0;border-top:0">${events().slice(0, 6).map((e) => evRow(e)).join('')}</div>` : '<p class="muted" style="margin:0">Aucun passage enregistré pour l’instant.</p>'}
    </section>
  </div>
  </div></div>`;
}
/** Barre de couverture : toutes les adresses sont-elles confiées à une équipe ? */
function coverageBlock() {
  const miss = unassigned().length, tot = addrs().length;
  if (!zones().length) return '';
  return `<div class="coverage ${miss ? 'warn' : 'ok'}"><div class="cov-bar"><i style="width:${pct(tot - miss, tot)}%"></i></div>
    <p>${miss ? `<b>${miss} adresse${miss > 1 ? 's' : ''} sans équipe</b> sur ${nf(tot)}.` : `<b>Toutes les rues sont attribuées.</b> ${nf(tot)} adresses.`}</p>
    ${miss ? '<button class="btn sm" data-act="page" data-v="unassigned">Les répartir</button>' : ''}</div>`;
}
/** Une équipe et son secteur, en une ligne. */
function zoneRow(z) {
  const g = stats().byZone[z.id] || { total: 0, visited: 0, st: blankSt() };
  const nStreets = zonesStreets([z]).length;
  return `<button class="zone-row as-btn" data-act="zone-edit" data-v="${z.id}"><span class="zdot" style="--c:${z.color}"></span><b>${esc(z.name)}</b><span class="meta">${pct(g.visited, g.total)} %</span>${stackBar(g.st, g.total, 'sm')}<span class="zone-team" style="grid-column:2/-1">${z.code ? `<b class="zcode">${esc(z.code)}</b> · ` : ''}${(z.members || []).length ? avatars(z.members, 4, 'sm') + ' ' + esc(names(z.members)) : '<i class="todo">Aucune équipe</i>'} · ${pl(nStreets, 'rue')} · ${nf(g.total)} foyers</span></button>`;
}
/** Une rue dans « mes rues » : ce qu'il reste à y faire. */
function streetMini(st) {
  const r = stats().byStreet.get(st.sk), o = openOf(st);
  const quoi = !o ? 'rue terminée' : r.st.todo ? `${r.st.todo} foyer${r.st.todo > 1 ? 's' : ''} à faire${o > r.st.todo ? ` · ${o - r.st.todo} à revoir` : ''}` : `${o} à revoir`;
  return `<button class="mini-row" data-act="tour-start" data-v="${esc(st.sk)}"><span class="grow"><b>${esc(st.name)}</b><small>${quoi}</small></span><span class="when">${r.visited}/${r.total}</span>${ico('chev-r', 'sm')}</button>`;
}

function repRow(r) {
  const late = r.date < isoDay();
  return `<button class="mini-row" data-act="unit" data-id="${r.u.id}"><span class="when" style="${late ? 'color:var(--danger)' : ''}">${late ? 'Retard' : SLOT_SHORT[r.slot] || '—'}</span><span class="dot" data-st="${r.p.status}"></span><span class="grow"><b>${esc(unitTitle(r.u))}</b><small>${esc([r.a.com, r.p.rp?.note || STATUS[r.p.status].label].join(' · '))}</small></span>${ico('chev-r', 'sm')}</button>`;
}
function evRow({ u, h }, timeOnly = false) {
  return `<button class="mini-row" data-act="unit" data-id="${u.id}"><span class="when">${timeOnly ? hhmm(h.at) : dayShort(h.at)}</span><span class="dot" data-st="${h.s}"></span><span class="grow"><b>${esc(unitTitle(u))}</b><small>${STATUS[h.s].label} · ${esc(u.a.com)}${h.by?.length ? ' · ' + esc(names(h.by)) : ''}</small></span></button>`;
}
function rankRow(m, b, i) {
  const zn = zones().filter((z) => (z.members || []).includes(m.id)).map((z) => z.name);
  return `<button class="rank" data-act="member" data-v="${m.id}"><span class="pos">${i + 1}</span>${avatar(m.id)}<span class="nm"><b>${esc(m.name)}</b><small>${pl(b?.streets.size || 0, 'rue')} · ${esc(zn.join(', ') || 'sans secteur')}</small></span><span class="vals"><b>${b?.doors || 0}</b><small>foyers</small></span></button>`;
}

// ═════════════════════════ Carte & rues
const mapKeep = (a, zi) => visibleAddr(a) && (!Role.admin || ((!UI.com || a.com === UI.com) && (!UI.zone || (UI.zone === '__none' ? !zi.has(a.id) : zi.get(a.id) === UI.zone))));
function renderMapView() {
  $$('#v-map .seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === UI.mapMode)));
  const zs = zones();
  if (UI.zone && UI.zone !== '__none' && !Store.s.zones[UI.zone]) UI.zone = '';
  const c = blankSt(), zi = zoneIndex();
  for (const u of units()) if (mapKeep(u.a, zi)) c[statusOf(u.id)]++;
  const tot = sum(Object.values(c));
  const keys = Role.admin ? ST_FILTER : ST_FILTER.filter((k) => k === 'todo' || k === 'done' || k === 'repasse' || c[k]);
  if (UI.filter !== 'all' && !keys.includes(UI.filter)) UI.filter = 'all'; // filtre gardé d'un autre accès
  $('#map-filters').innerHTML = [['all', 'Tous', tot], ...keys.map((k) => [k, STATUS[k].short, c[k]])]
    .map(([k, l, n]) => `<button class="chip" data-act="filter" data-v="${k}" aria-pressed="${UI.filter === k}">${k !== 'all' ? `<span class="dot" data-st="${k}"></span>` : ''}${l} <small>${n}</small></button>`).join('')
    + (Role.admin ? `<select class="input sm zone-sel" data-change="com" aria-label="Commune"><option value="">Toutes les communes</option>${COMMUNES.map((x) => `<option ${UI.com === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : '')
    + (Role.admin && zs.length ? `<select class="input sm zone-sel" data-change="zone" aria-label="Secteur"><option value="">Tous les secteurs</option>${zs.map((z) => `<option value="${z.id}" ${UI.zone === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}<option value="__none" ${UI.zone === '__none' ? 'selected' : ''}>Sans secteur (${unassigned().length})</option></select>` : '');
  $('#map-host').hidden = UI.mapMode !== 'map';
  const pen = $('.fab-btn[data-act="draw-start"]'); if (pen) pen.hidden = !Role.admin;
  $('#streets-host').hidden = UI.mapMode !== 'streets';
  if (UI.mapMode === 'streets') renderStreets();
  else {
    const live = Sync.code ? '<span id="map-live"></span>' : '';
    $('#map-legend').innerHTML = keys.map((k) => `<div><span class="dot" data-st="${k}"></span>${STATUS[k].short}<b>${c[k]}</b></div>`).join('')
      + `<div class="legend-foot">${Role.admin ? `Touchez une rue pour l’attribuer${live}` : `<span class="zdot" style="--c:var(--red)"></span> Vos rues${live}`}</div>`;
    liveLine();
    $('#map-legend').hidden = !!MapView.lasso || (!Role.admin && !tot);
    let hint = $('#map-hint');
    if (!hint) { hint = document.createElement('div'); hint.id = 'map-hint'; hint.className = 'map-empty'; $('#map-host').appendChild(hint); }
    hint.hidden = Role.admin || tot > 0;
    const h = sectorHint();
    hint.innerHTML = h ? sectorHintHtml(h) : `<b>Aucune rue pour l’instant</b><span>Elles apparaîtront ici dès que le responsable les aura attribuées.</span>`;
    $('#layer-lbl').textContent = MapView.layer === 'sat' ? 'Plan' : 'Satellite';
  }
}
/** Légende de la carte : heure de la dernière synchro réussie. */
function liveLine() {
  const el = $('#map-live'); if (!el) return;
  const ok = Sync.state === 'online' || Sync.state === 'syncing';
  el.innerHTML = Sync.lastOk ? `<br>${ok ? 'En direct' : 'Dernière synchro'} · ${hhmm(Sync.lastOk)}` : '';
}
function renderStreets() {
  const host = $('#streets-host');
  if (UI.street) { host.innerHTML = `<div class="view-in">${streetDetail(UI.street)}</div>`; return; }
  const ae = document.activeElement;
  if (ae && ae.id === 'street-q' && host.contains(ae)) { $('#street-list').innerHTML = streetRows(); return; }
  const S = stats(), vs = visStreets(), counts = { '': vs.length };
  for (const st of vs) counts[st.com] = (counts[st.com] || 0) + 1;
  host.innerHTML = `<div class="view-in">
    ${Role.admin ? comChips('com', UI.com, counts) : `<div class="lbl">Vos rues · ${esc(myZones().map((z) => z.name).join(', ') || 'aucune pour l’instant')}</div>`}
    <div class="street-tools">
      <div class="input-ico">${ico('search')}<input id="street-q" class="input" type="search" placeholder="Rue, ou n° et rue (12 bâle)" value="${esc(UI.q)}" autocomplete="off" aria-label="Chercher une rue ou une adresse"></div>
      <select class="input" style="width:auto" data-change="sort" aria-label="Trier les rues">${[['alpha', 'A → Z'], ['todo', 'Le plus à faire'], ['prog', 'Avancement']].map(([v, l]) => `<option value="${v}" ${UI.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="addr-hits">${addrHits()}</div>
    <div id="street-list">${streetRows()}</div>
    <p class="muted" style="font-size:12.5px;margin:0">${nf(S.total)} foyers dans ${vs.length} rues.</p>
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
  let rows = visStreets().filter((st) => (!Role.admin || !UI.com || st.com === UI.com) && (!q || norm(st.name + ' ' + st.com).includes(q)));
  if (Role.admin && UI.zone) rows = rows.filter((st) => st.addrs.some((a) => (UI.zone === '__none' ? !zi.has(a.id) : zi.get(a.id) === UI.zone)));
  if (UI.filter !== 'all') rows = rows.filter((st) => S.byStreet.get(st.sk)?.st[UI.filter] > 0);
  const g = (st) => S.byStreet.get(st.sk), prog = (st) => g(st).visited / g(st).total;
  if (UI.sort === 'todo') rows.sort((a, b) => g(b).st.todo - g(a).st.todo);
  else if (UI.sort === 'prog') rows.sort((a, b) => prog(b) - prog(a));
  if (!rows.length) {
    if (searchAddrs(UI.q).length) return '';
    const h = !Role.admin && !visStreets().length ? sectorHint() : null;
    if (h) return `<div class="empty">${sectorHintHtml(h)}</div>`;
    return !Role.admin && !visStreets().length ? '<div class="empty"><b>Aucune rue attribuée</b><span>Le responsable n’a pas encore confié de rues à votre secteur.</span></div>' : '<div class="empty"><b>Aucune rue</b>Modifiez la recherche ou les filtres.</div>';
  }
  const card = (st) => {
    const r = g(st);
    const info = [r.st.todo ? `${r.st.todo} à faire` : 'Rue terminée', r.st.repasse ? `${r.st.repasse} à repasser` : '', r.st.absent ? `${r.st.absent} absents` : ''].filter(Boolean).join(' · ');
    return `<button class="street-row" data-act="street" data-v="${esc(st.sk)}"><div class="sr-top"><b>${esc(st.name)}</b><span>${r.visited}/${r.total}</span></div>${stackBar(r.st, r.total, 'sm')}<div class="sr-foot"><span class="grow">${info}</span>${r.members.size ? avatars([...r.members]) : ''}</div></button>`;
  };
  if (UI.sort !== 'alpha' || (Role.admin && UI.com)) return `<div class="street-list">${rows.map(card).join('')}</div>`;
  return COMMUNES.map((c) => { const list = rows.filter((st) => st.com === c); return list.length ? `<h3 class="com-h">${esc(c)} <small>${pl(list.length, 'rue')}</small></h3><div class="street-list">${list.map(card).join('')}</div>` : ''; }).join('');
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
  const own = st.addrs.filter(visibleAddr), odd = own.filter((a) => !a.even), even = own.filter((a) => a.even);
  const who = [...r.members].map((id) => [id, S.byMember[id]?.streets.get(sk)?.length || 0]).sort((a, b) => b[1] - a[1]);
  const z = [...new Set(own.map((a) => zoneOf(a.id)?.name).filter(Boolean))];
  return `
  <div class="sd-head"><button class="icon-btn" data-act="street-back" aria-label="Retour aux rues">${ico('chev-l')}</button><div class="plaque street">${esc(st.name)}</div></div>
  <p class="muted" style="margin:-6px 0 0;font-weight:600">${esc(st.com)} · ${pl(own.length, 'adresse')} · ${pl(r.total, 'foyer')}${z.length ? ' · ' + esc(z.join(', ')) : ' · sans secteur'}</p>
  <div class="kpis">
    <div class="kpi"><b>${pct(r.visited, r.total)} %</b><span>${r.visited} / ${r.total} foyers</span></div>
    <div class="kpi"><b>${r.st.done}</b><span>calendriers donnés</span></div>
    <div class="kpi"><b>${r.st.refus}</b><span>refus</span></div>
    <div class="kpi"><b>${r.st.absent + r.st.repasse}</b><span>absents · repasses</span></div>
  </div>
  ${stackBar(r.st, r.total)}
  <button class="btn red block" data-act="tour-start" data-v="${esc(sk)}">${ico('door')} Démarrer la tournée dans cette rue</button>
  <div class="sides">
    <div><div class="lbl">Côté impair · ${odd.length}</div><div class="doors">${odd.map((a) => bldTile(a)).join('') || '<span class="muted">—</span>'}</div></div>
    <div><div class="lbl">Côté pair · ${even.length}</div><div class="doors">${even.map((a) => bldTile(a)).join('') || '<span class="muted">—</span>'}</div></div>
  </div>
  <p class="muted" style="margin:0;font-size:13px">Un immeuble ? Touchez son numéro, puis « Plusieurs logements ».</p>
  ${Role.admin ? '' : '<!--'}<div class="field"><label for="sd-zone">Secteur de toute la rue</label><select id="sd-zone" class="input" data-change="street-zone" data-sk="${esc(sk)}"><option value="">${zones().length ? '— Sans secteur —' : 'Aucun secteur créé'}</option>${zones().map((x) => `<option value="${x.id}" ${z.length === 1 && z[0] === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>${Role.admin ? '' : '-->'}
  <section class="card"><div class="card-h"><h2>Passé par</h2></div>${who.length ? who.map(([id, n]) => `<button class="rank" data-act="member" data-v="${id}" style="grid-template-columns:auto 1fr auto">${avatar(id)}<span class="nm"><b>${esc(member(id)?.name || 'Ancien membre')}</b></span><span class="vals"><b>${n}</b><small>foyers</small></span></button>`).join('') : '<p class="muted" style="margin:0">Personne n’est encore passé dans cette rue.</p>'}</section>
  <button class="btn ghost" data-act="street-map" data-v="${esc(sk)}">${ico('map')} Voir la rue sur la carte</button>`;
}

// ═════════════════════════ Tournée (porte-à-porte)
const freshTD = (id) => ({ id, mode: null, status: null, rpDate: '', rpSlot: '', rpNote: '' });
let TD = freshTD(null);
function tourList() {
  const T = UI.tour;
  if (T.near) {
    const pos = Geo.pos; if (!pos) return [];
    const near = units().filter((u) => visibleAddr(u.a) && (OPEN.has(statusOf(u.id)) || u.id === T.cur)).map((u) => ({ u, d: distM([pos.lat, pos.lon], [u.a.lat, u.a.lon]) + u.k * 0.01 })).sort((x, y) => x.d - y.d);
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
  const p = pass(id), u = unitIdx().get(id), team = Me.team();
  const prev = savePassage(id, { status, name: p?.name || '', note: p?.note || '', rp: extra.rp || null, by: team.length ? team : p?.by || [] });
  vibrate(18);
  toast(`${unitTitle(u)} · ${STATUS[status].short}${team.length ? '' : ' · sans nom'}`, {
    undo: () => { restorePassage(id, prev); UI.tour.cur = id; TD = freshTD(id); saveUI(); App.changed(); },
  });
  tourNext(1); App.changed(); tourScrollTop();
}
function tourTeamLine() {
  const team = Me.team(), z = Sector.zone;
  if (team.length) return `<button class="tour-team" data-act="me-sheet">${avatars(team, 2, 'sm')} Tournée de ${esc(names(team))}</button>`;
  if (z) return `<button class="tour-team" data-act="me-sheet">${ico('door', 'sm')} ${esc(z.name)} · <u>ajouter mon prénom</u></button>`;
  return `<button class="tour-team" data-act="me-sheet">${ico('user', 'sm')} Qui fait la tournée ? <u>Choisir</u></button>`;
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
    ${r ? `<div class="plaque street">${esc(st.name)}</div><div class="sr-top tour-stats"><span class="muted">${esc(st.com)} · <b>${r.visited}/${r.total}</b> foyers · ${remaining.length} à faire ou revoir</span><span class="amt">${r.st.done}&nbsp;donnés</span></div>${stackBar(r.st, r.total)}` : ''}`;
  if (!cur || (T.open && !remaining.length && !OPEN.has(statusOf(cur.id)) && TD.mode == null && !T.near)) {
    const team = Me.team(), zi = zoneIndex();
    const mine = zones().filter((z) => (z.members || []).some((m) => team.includes(m)));
    const sugg = visStreets().filter((x) => x.sk !== T.street && (!st || x.com === st.com || mine.length) && x.addrs.some((a) => unitsOf(a.id).some((u) => OPEN.has(statusOf(u.id))) && (!mine.length || mine.some((z) => zi.get(a.id) === z.id)))).slice(0, 5);
    el.innerHTML = `<div class="view-in">${head}<div class="card done-banner"><span class="display">${T.near ? 'Plus rien autour' : 'Rue terminée'}</span><p class="muted" style="margin:0">${T.near ? 'Aucune porte à faire à proximité.' : 'Tous les foyers de la rue ont une réponse. Bravo !'}</p>${sugg.length ? `<div class="lbl">Rues suivantes</div><div class="chips wrap" style="justify-content:center">${sugg.map((x) => `<button class="chip" data-act="tour-start" data-v="${esc(x.sk)}">${esc(x.name)}</button>`).join('')}</div>` : ''}<label class="switch"><input type="checkbox" id="tour-open" ${T.open ? 'checked' : ''}> Sauter les portes déjà faites</label></div></div>`;
    return;
  }
  if (TD.id !== cur.id) TD = freshTD(cur.id);
  const status = statusOf(cur.id), p = pass(cur.id);
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
      ${TD.mode === 'later' ? tourLaterForm() : tourActs()}
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
    <button class="act big" data-st="done" data-act="td-done">${ico('check')} Calendrier donné</button>
    <button class="act" data-st="absent" data-act="td-later" data-v="absent">${ico('absent')}Absent</button>
    <button class="act" data-st="repasse" data-act="td-later" data-v="repasse">${ico('repeat')}À repasser</button>
    <button class="act" data-st="refus" data-act="td-refus">${ico('ban')}Refus</button>
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
  const S = stats(), zi = zoneIndex();
  const mine = myZones();
  const inMine = (st) => st.addrs.some((a) => mine.some((z) => zi.get(a.id) === z.id));
  const myStreets = mine.length ? streets().filter(inMine) : [];
  const openN = openOf;
  const row = (st) => { const r = S.byStreet.get(st.sk), o = openN(st); return `<button class="street-row" data-act="tour-start" data-v="${esc(st.sk)}"><div class="sr-top"><b>${esc(st.name)}</b><span>${r.visited}/${r.total}</span></div>${stackBar(r.st, r.total, 'sm')}<div class="sr-foot"><span class="grow">${esc(st.com)} · ${o ? `${o} foyer${o > 1 ? 's' : ''} à faire ou revoir` : 'rue terminée'}</span>${r.members.size ? avatars([...r.members]) : ''}</div></button>`; };
  const others = (Role.admin ? streets() : []).filter((st) => !myStreets.includes(st) && (!UI.com || st.com === UI.com)).sort((a, b) => (openN(a) ? 0 : 1) - (openN(b) ? 0 : 1) || a.ci - b.ci || sortKey(a.name).localeCompare(sortKey(b.name), 'fr'));
  return `<div class="view-in">
    ${Role.admin ? '' : oldIconCard() + linkCard()}
    <div class="tour-top">${tourTeamLine()}</div>
    <h2 class="display">Où tournez-vous ?</h2>
    <button class="near-btn" data-act="tour-near">${ico('locate')}<span><b>Portes autour de moi</b><small>Le GPS propose le foyer le plus proche à faire.</small></span></button>
    ${myStreets.length ? `<div class="lbl">Vos rues · ${esc(mine.map((z) => z.name).join(', '))}</div><div class="street-list">${myStreets.map(row).join('')}</div>`
      : Role.admin ? '' : `<section class="card"><div class="empty">${(() => { const h = sectorHint(); return h ? sectorHintHtml(h) : '<b>Aucune rue attribuée</b><span>Le responsable n’a pas encore confié de rues à votre secteur.</span>'; })()}</div></section>`}
    ${Role.admin ? `<div class="lbl">${myStreets.length ? 'Autres rues' : 'Choisissez une rue'}</div>
    ${comChips('tour-com', UI.com)}
    <div class="street-list">${others.map(row).join('')}</div>` : ''}
  </div>`;
}

// ═════════════════════════ Repasses
function renderRep() {
  const el = $('#v-rep'), list = repasses(), today = isoDay();
  const absNo = units().filter((u) => { if (!visibleAddr(u.a)) return false; const p = pass(u.id); return p?.status === 'absent' && !p.rp?.date; });
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
    ${absNo.length ? `<div class="rp-group"><h3>Absents sans repasse <small>${absNo.length}</small></h3>${absNo.slice(0, 80).map((u) => { const p = pass(u.id); return `<div class="rp-item"><span class="rp-slot" style="color:var(--st-absent);background:color-mix(in srgb,var(--st-absent) 12%,transparent)">${dayShort(p.at)}</span><button class="rp-main" data-act="unit" data-id="${u.id}"><b>${esc(unitTitle(u))}</b><small>${esc([u.a.com, names(p.by)].filter(Boolean).join(' · '))}</small></button><div class="rp-quick"><button class="chip" data-act="rp-quick" data-id="${u.id}" data-v="${d1}">Demain</button>${sat ? `<button class="chip" data-act="rp-quick" data-id="${u.id}" data-v="${sat[0]}">Sam.</button>` : ''}</div></div>`; }).join('')}</div>` : ''}
  </div>`;
}

// ═════════════════════════ Équipe
function memberChips(act, selected, exclude = '') {
  return members().filter((m) => m.id !== exclude).map((m) => `<button class="chip mchip" data-act="${act}" data-v="${m.id}" aria-pressed="${selected.includes(m.id)}">${avatar(m.id, 'sm')} ${esc(m.name)}</button>`).join('');
}
/** Texte à coller dans le groupe de l'amicale : qui fait quelles rues. */
function shareText() {
  const S = stats();
  const l = [`${Store.s.settings.name || 'Calendriers'} — répartition`, ''];
  for (const z of zones()) {
    const g = S.byZone[z.id] || { total: 0 };
    l.push(`${z.name} — ${names(z.members) || 'équipe à désigner'} (${nf(g.total)} foyers)`);
    const byCom = new Map();
    for (const st of zonesStreets([z])) { if (!byCom.has(st.com)) byCom.set(st.com, []); byCom.get(st.com).push(st.name); }
    for (const [com, list] of byCom) l.push(`  ${com} : ${list.join(', ')}`);
    l.push('');
  }
  const miss = unassigned();
  if (miss.length) {
    const sks = [...new Set(miss.map((a) => a.sk))].map((sk) => streetOf(sk)).filter(Boolean);
    l.push(`Sans équipe : ${sks.map((x) => `${x.name} (${x.com})`).join(', ')}`, '');
  }
  return l.join('\n').trim();
}
function addMemberForm() {
  return `<form class="street-tools stack-sm" data-form="add-member"><textarea class="input" name="mname" rows="2" placeholder="Thomas K.&#10;Julie W." autocomplete="off" aria-label="Prénoms à ajouter" required></textarea><button class="btn" type="submit">${ico('plus')} Ajouter</button></form>`;
}
function renderTeam() { renderAdmin(); } // les distributeurs n'ont pas cet onglet (go() les renvoie à la carte)

/** Accès responsable : répartir les rues entre les équipes. */
function renderAdmin() {
  const el = $('#v-team'), zs = zones(), ms = members(), S = stats();
  if (!zs.length && UI.auto === undefined) UI.auto = true; // rien à répartir encore : on montre la proposition
  const unassignedMembers = ms.filter((m) => !zs.some((z) => (z.members || []).includes(m.id)));
  el.innerHTML = `<div class="view-in">
    <div class="tour-top"><h2 class="display">Répartition</h2><span class="role-pill">${ico('gear', 'sm')} Responsable</span></div>
    <section class="card">
      <div class="card-h"><h2>Couverture</h2><span class="muted">${zs.length} secteur${zs.length > 1 ? 's' : ''}</span></div>
      ${zs.length ? coverageBlock() : '<p class="muted" style="margin:0 0 12px">Un secteur, c’est un paquet de rues confié à une équipe de 2 ou 3 personnes.</p>'}
      <div class="grid2">
        <button class="btn" data-act="zone-build">${ico('plus')} Créer un secteur</button>
        <button class="btn ghost" data-act="page" data-v="assign">${ico('user')} Attribuer les secteurs</button>
      </div>
      <div class="grid2" style="margin-top:8px">
        <button class="btn ghost" data-act="page" data-v="codes">${ico('grid')} Imprimer les billets</button>
        <button class="btn ghost" data-act="page" data-v="prep">${ico('pen')} Ajuster rue par rue</button>
      </div>
      <button class="btn ghost block" style="margin-top:8px" data-act="auto-open" aria-pressed="${!!UI.auto}">${ico('sparkle')} Répartition automatique${UI.auto ? '' : ` · ${pl(sum(Object.values(autoK())), 'secteur')}`}</button>
      ${UI.auto ? `<div class="quick" style="margin-top:14px">
        <button class="btn block" data-act="auto-com">Un secteur par commune (${COMMUNES.length})</button>
        <div class="note-box">Chaque village est coupé en quartiers <b>d’un seul tenant</b> — nord, est, sud, ouest — sans trou ni enclave. Les rues restent entières. Choisissez le nombre de secteurs village par village.</div>
        ${(() => { const k = autoK(); return COMMUNES.map((c) => `<div class="set-row"><div class="t"><b>${esc(c)}</b><small>${nf(comUnits(c))} foyers · ≈ ${nf(Math.round(comUnits(c) / k[c]))} par secteur</small></div><div class="stepper" style="min-width:140px"><button data-act="auto-k" data-com="${esc(c)}" data-v="-1" aria-label="Un secteur de moins à ${esc(c)}">${ico('minus')}</button><b>${k[c]}</b><button data-act="auto-k" data-com="${esc(c)}" data-v="1" aria-label="Un secteur de plus à ${esc(c)}">${ico('plus')}</button></div></div>`).join(''); })()}
        <button class="link" data-act="auto-reset-k" style="justify-self:start">Revenir aux nombres conseillés</button>
        ${zs.some((z) => z.code) ? '<div class="note-box">Remplacer les secteurs leur donne de <b>nouveaux codes</b> : les billets déjà distribués ne marcheront plus.</div>' : ''}
        ${(() => { const t = sum(Object.values(autoK())); return `<button class="btn block" data-act="auto-go">${ico('sparkle')} ${zs.length ? `Remplacer par ${pl(t, 'secteur')}` : `Créer ${pl(t, 'secteur')}`}</button>`; })()}
      </div>` : ''}
    </section>
    ${zs.length ? `<section class="card">
      <div class="card-h"><h2>Secteurs et équipes</h2><button class="link" data-act="share-assign">Partager</button></div>
      <p class="muted" style="margin:0 0 10px;font-size:13px">Le nombre en gras est le code que l’équipe du secteur saisit sur son téléphone.</p>
      ${zs.map((z) => zoneRow(z)).join('')}
    </section>` : ''}
    <section class="card">
      <div class="card-h"><h2>Les pompiers</h2><span class="muted">${ms.length}</span></div>
      ${ms.length ? `<div class="mem-list">${ms.map((m) => { const z = zs.find((x) => (x.members || []).includes(m.id)), d = stats().byMember[m.id]?.doors || 0; return `<div class="mem-row">
        <button class="mem-main" data-act="member" data-v="${m.id}">${avatar(m.id, 'sm')}<span class="t"><b>${esc(m.name)}</b><small>${z ? esc(z.name) : 'sans secteur'}${d ? ` · ${d} foyer${d > 1 ? 's' : ''}` : ''}</small></span></button>
        <button class="icon-btn" data-act="mem-remove" data-id="${m.id}" aria-label="Retirer ${esc(m.name)} de la liste" title="Retirer de la liste">${ico('trash')}</button>
      </div>`; }).join('')}</div>` : '<div class="empty"><b>Aucun pompier</b>Ajoutez ceux qui participent à la tournée.</div>'}
      ${unassignedMembers.length && zs.length ? `<p class="muted" style="margin:12px 0 0;font-size:13px">Sans secteur : ${esc(unassignedMembers.map((m) => m.name).join(', '))}.</p>` : ''}
      <div style="margin-top:14px">${addMemberForm()}</div>
      <p class="muted" style="margin:10px 0 0;font-size:13px">Collez plusieurs prénoms d’un coup, un par ligne.</p>
    </section>
    <section class="card">
      <div class="card-h"><h2>Sur ce téléphone</h2></div>
      ${meBlock()}
      <button class="link" data-act="leave-admin" style="margin-top:14px">Quitter l’accès responsable</button>
    </section>
  </div>`;
}

/** Choix des personnes présentes sur ce téléphone (1 à 4, le plus souvent 2 ou 3). */
function meBlock() {
  const t = Me.team(), ms = members(), z = Sector.zone;
  const chip = (m) => `<button class="chip mchip" data-act="me-toggle" data-v="${m.id}" aria-pressed="${t.includes(m.id)}">${avatar(m.id, 'sm')} ${esc(m.name)}</button>`;
  const mine = z ? ms.filter((m) => (z.members || []).includes(m.id)) : [];
  const rest = ms.filter((m) => !mine.includes(m));
  const add = `<details class="more" style="margin-top:12px"><summary>Mon prénom n’est pas dans la liste</summary><div>${addMemberForm().replace('data-form="add-member"', 'data-form="me-add"')}<p class="muted" style="margin:8px 0 0;font-size:13px">Un prénom par ligne. Il arrivera aussi chez le responsable.</p></div></details>`;
  if (!ms.length) return `<div class="empty"><b>Pas encore de pompiers</b><span>${z ? 'Ajoutez votre prénom : chaque porte notée sera à votre nom.' : 'Le responsable doit d’abord créer la liste.'}</span></div>${z ? addMemberForm().replace('data-form="add-member"', 'data-form="me-add"') : ''}`;
  return `<div class="lbl">Qui fait la tournée avec ce téléphone ?</div>
    <p class="muted" style="margin:6px 0 12px;font-size:13.5px">Touchez votre prénom et celui des personnes avec vous. Chaque porte notée sera à vos noms.</p>
    ${mine.length ? `<div class="chips wrap">${mine.map(chip).join('')}</div>${rest.length ? `<details class="more" style="margin-top:12px"><summary>Quelqu’un d’un autre secteur</summary><div><div class="chips wrap">${rest.map(chip).join('')}</div></div></details>` : ''}`
      : `<div class="chips wrap">${ms.map(chip).join('')}</div>`}
    <div class="me-now">${t.length ? `${avatars(t, 4, 'sm')} <b>${esc(names(t))}</b>` : '<span class="muted">Personne de choisi : les passages ne seront attribués à personne.</span>'}</div>
    ${add}`;
}
/** Ce qui manque à un distributeur pour voir ses rues : l'équipe, puis le code du secteur. */
function sectorHint() {
  if (Role.admin || Store.demoOn || myZones().length) return null;
  if (Sync.configured && !Sync.code) return { b: 'Reliez ce téléphone à l’équipe', s: 'Scannez le QR code du billet de votre secteur avec l’appareil photo.', btn: 'J’ai le code de l’équipe', step: 'join' };
  if (Sector.code) return { b: 'Code de secteur inconnu', s: `Le code ${Sector.code} ne correspond à aucun secteur reçu sur ce téléphone. Synchronisez, ou vérifiez le code auprès du responsable.`, btn: 'Saisir un autre code', step: 'secteur' };
  return { b: 'Quel est votre secteur ?', s: 'Saisissez le code à 4 chiffres du billet. Sans code, le responsable peut aussi vous attribuer des rues par votre prénom.', btn: 'Saisir le code du secteur', step: 'secteur' };
}
const sectorHintHtml = (h) => `<b>${h.b}</b><span>${esc(h.s)}</span><button class="btn sm" data-act="page" data-v="welcome" data-step="${h.step}">${h.btn}</button>`;

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
    const ae = document.activeElement;
    if (ae && panel.contains(ae) && ((ae.tagName === 'INPUT' && ae.value) || ae.tagName === 'SELECT')) return;
    const adv = panel.querySelector('details.more')?.open;
    const st2 = streetOf(SS.sk), r = stats().byStreet.get(SS.sk), zs = zones();
    const inZ = new Map();
    for (const a of st2.addrs) { const z = zoneOf(a.id); const k = z ? z.id : ''; inZ.set(k, (inZ.get(k) || 0) + 1); }
    const only = inZ.size === 1 ? [...inZ.keys()][0] : '';
    panel.innerHTML = `<div class="sheet-grab"></div>
    <header class="sheet-head"><div class="t"><b>${esc(st2.name)}</b><small>${esc(st2.com)} · ${pl(st2.addrs.filter(visibleAddr).length, 'adresse')} · ${pl(r.total, 'foyer')}</small></div><button class="icon-btn" data-act="sheet-close" aria-label="Fermer">${ico('x')}</button></header>
    <div class="sheet-body">
      ${stackBar(r.st, r.total)}
      <div class="kpis">
        <div class="kpi"><b>${pct(r.visited, r.total)} %</b><span>${r.visited} / ${pl(r.total, 'foyer')}</span></div>
        <div class="kpi"><b>${r.st.done}</b><span>donnés</span></div>
        <div class="kpi"><b>${r.st.todo}</b><span>à faire</span></div>
        <div class="kpi"><b>${r.st.absent + r.st.repasse}</b><span>absents · repasses</span></div>
      </div>
      ${Role.admin ? streetPeople(SS.sk) + `<details class="more" ${adv ? 'open' : ''}><summary>Secteur (avancé)</summary><div><div class="field"><label for="st-zone">Secteur de toute la rue</label>
        <select id="st-zone" class="input" data-change="street-zone" data-sk="${esc(SS.sk)}">
          <option value="">${zs.length ? '— Sans secteur —' : 'Aucun secteur créé'}</option>
          ${zs.map((z) => `<option value="${z.id}" ${only === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}
        </select>
        <small class="muted">${inZ.size > 1 ? `Partagée entre ${inZ.size} secteurs : choisir en range ${st2.addrs.length > 1 ? 'toutes les adresses' : "l'adresse"} dans un seul.` : 'Toutes les adresses de la rue suivront ce choix.'}</small>
      </div></div></details>` : (only && Store.s.zones[only] ? `<div class="note-box">Équipe : <b>${esc(names(Store.s.zones[only].members)) || 'à désigner'}</b> · secteur ${esc(Store.s.zones[only].name)}</div>` : '')}
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
      ${Role.admin ? zoneSelect(BS.id) : ''}
    </div>`;
  };
  draw(); Sheet.refresh = draw;
}
let AS = null;
function openUnit(unitId, opts = {}) {
  const u = unitIdx().get(unitId); if (!u) return;
  const p = pass(unitId), team = Me.team();
  AS = {
    id: unitId, opts, d: {
      status: opts.status || (p && p.status !== 'todo' ? p.status : null),
      name: p?.name || '', note: p?.note || '',
      rp: p?.rp ? { date: p.rp.date || '', slot: p.rp.slot || '', note: p.rp.note || '' } : { date: '', slot: '', note: '' },
      by: team.length ? team : [...(p?.by || [])],
    },
  };
  if (AS.d.status === 'repasse' && !AS.d.rp.date && Role.admin) AS.d.rp.date = addDays(isoDay(), 1);
  Sheet.open('addr', () => { MapView.sel = null; MapView.draw(); AS = null; });
  MapView.sel = u.a.id; MapView.draw();
  drawUnitSheet();
}
function drawUnitSheet() {
  if (!AS) return;
  const { id, d, opts } = AS, u = unitIdx().get(id), a = u.a, p = pass(id), z = zoneOf(a.id);
  const panel = Sheet.panel(); if (!panel) return;
  const sc = $('.sheet-body', panel)?.scrollTop || 0;
  panel.innerHTML = `<div class="sheet-grab"></div>
  <header class="sheet-head">
    ${u.n > 1 ? `<button class="icon-btn" data-act="as-bld" aria-label="Retour à l'immeuble">${ico('chev-l')}</button>` : ''}
    <div class="plaque num">${esc(a.num)}</div>
    <div class="t"><b>${esc(a.street)}</b><small>${u.n > 1 ? `<span class="apt sm">${esc(u.label)} · ${u.k}/${u.n}</span>` : ''}${esc(a.com)}${z ? ` · <span class="zdot" style="--c:${z.color}"></span>${esc(z.name)}` : ''}${p && p.status !== 'todo' ? ' · ' + stPill(p.status) : ''}</small></div>
    <button class="icon-btn" data-act="sheet-close" aria-label="Fermer">${ico('x')}</button>
  </header>
  <div class="sheet-body">
    <div class="st-pick">${['done', 'absent', 'repasse', 'refus'].map((k) => `<button class="st-opt" data-st="${k}" data-act="as-status" data-v="${k}" aria-pressed="${d.status === k}">${ico(STATUS[k].icon)}<span>${STATUS[k].label}</span></button>`).join('')}</div>
    ${d.status === 'absent' || d.status === 'repasse' ? `
      <div class="field"><span class="lbl">${d.status === 'absent' ? 'Programmer une repasse (facultatif)' : 'Quand repasser ?'}</span>
        <div class="chips wrap">${d.status === 'absent' ? `<button class="chip" data-act="as-rpdate" data-v="" aria-pressed="${!d.rp.date}">Pas de repasse</button>` : ''}${dateChoices().map(([v, l]) => `<button class="chip" data-act="as-rpdate" data-v="${v}" aria-pressed="${d.rp.date === v}">${l}</button>`).join('')}<label class="chip date-chip">${ico('cal', 'sm')}<input type="date" data-bind="rp.date" value="${esc(d.rp.date)}" aria-label="Autre date"></label></div>
      </div>
      <div class="chips wrap">${Object.entries(SLOTS).map(([k, l]) => `<button class="chip" data-act="as-slot" data-v="${k}" aria-pressed="${d.rp.slot === k}">${l}</button>`).join('')}</div>
      <input class="input" data-bind="rp.note" value="${esc(d.rp.note)}" placeholder="Ex. revenir après 18 h, sonner derrière" aria-label="Consigne pour la repasse">` : ''}
    <details class="more" ${d.name || d.note ? 'open' : ''}><summary>Occupant et note</summary><div>
      <div class="field"><label for="as-name">Nom (facultatif)</label><input id="as-name" class="input" data-bind="name" value="${esc(d.name)}" placeholder="Seulement si c'est utile pour repasser"></div>
      <div class="field"><label for="as-note">Note</label><textarea id="as-note" class="input" data-bind="note" rows="2" placeholder="Ex. sonner à la porte de derrière">${esc(d.note)}</textarea></div>
    </div></details>
    <div class="field"><span class="lbl">Passage effectué par</span><div class="chips wrap">${members().length ? memberChips('as-by', d.by) : '<span class="muted">Le responsable doit d’abord créer la liste des pompiers.</span>'}</div></div>
    ${p?.hist?.length ? `<div class="field"><span class="lbl">Historique du foyer</span><div class="timeline">${[...p.hist].reverse().map((h) => `<div class="tl" data-st="${h.s}"><b>${STATUS[h.s].short}</b><span class="muted">${dayLabel(isoDay(new Date(h.at)))} ${hhmm(h.at)}${h.by?.length ? ' · ' + esc(names(h.by)) : ''}</span></div>`).join('')}</div></div>` : ''}
    <details class="more"><summary>Habitation et secteur</summary><div>
      ${u.n > 1
        ? `<div class="field"><label for="unit-label">Repère du logement</label><input id="unit-label" class="input" data-change="unit-label" data-id="${a.id}" data-k="${u.k}" value="${esc(u.label)}" placeholder="Ex. 1er étage gauche"></div><button class="btn ghost" data-act="as-bld">${ico('door')} Gérer l'immeuble · ${pl(u.n, 'logement')}</button>`
        : '<div class="set-row" style="border:0;padding:0"><div class="t"><b>Maison individuelle</b><small>Un immeuble ? Indiquez le nombre de logements.</small></div><button class="btn ghost sm" data-act="as-bld">Plusieurs logements</button></div>'}
      ${Role.admin ? zoneSelect(a.id) : ''}
    </div></details>
    ${p && p.status !== 'todo' ? '<button class="link danger" data-act="as-reset" style="justify-self:start">Remettre le foyer à « À faire »</button>' : ''}
  </div>
  <footer class="sheet-foot">
    ${opts.tour ? '' : `<button class="btn ghost" data-act="as-tour" aria-label="Démarrer la tournée à ce foyer">${ico('door')}</button>`}
    <button class="btn block" data-act="as-save" ${d.status ? '' : 'disabled'}>${d.status ? 'Enregistrer' : 'Choisissez un résultat'}</button>
  </footer>`;
  $('.sheet-body', panel).scrollTop = sc;
}
function asSave() {
  if (!AS || !AS.d.status) return;
  const { id, d, opts } = AS, u = unitIdx().get(id);
  const prev = savePassage(id, d);
  vibrate(18); Sheet.close();
  toast(`${unitTitle(u)} · ${STATUS[d.status].short}`, { undo: () => restorePassage(id, prev) });
  if (opts.tour && UI.tour.cur === id && d.status !== 'todo') tourNext(1);
  App.changed();
}
function openMeSheet() {
  const panel = Sheet.open('me');
  const draw = () => {
    const t = Me.team();
    panel.innerHTML = `<div class="sheet-grab"></div>
    <header class="sheet-head"><div class="t"><b>Qui fait la tournée ?</b><small>Votre prénom et celui des personnes avec vous, souvent 2 ou 3.</small></div><button class="icon-btn" data-act="sheet-close" aria-label="Fermer">${ico('x')}</button></header>
    <div class="sheet-body">${meBlock()}</div>
    <footer class="sheet-foot">${members().length ? `<button class="btn block" data-act="sheet-close" ${t.length ? '' : 'disabled'}>${t.length ? 'C’est parti' : 'Choisissez au moins une personne'}</button>` : Role.admin ? '<button class="btn block" data-act="go" data-v="team">Voir l’équipe</button>' : Sector.zone ? '<button class="btn block ghost" data-act="sheet-close">Fermer</button>' : '<button class="btn block ghost" data-act="sheet-close">Fermer · la liste arrivera dès que le responsable l’aura créée</button>'}</footer>`;
  };
  draw(); Sheet.refresh = draw;
}

// ═════════════════════════ Pages plein écran
const Page = {
  cur: null, args: {},
  open(name, args = {}) { this.cur = name; this.args = args; this._enter = true; $('#page').hidden = false; this.render(true); if (args.sec) requestAnimationFrame(() => $('#sec-' + args.sec)?.scrollIntoView({ block: 'start' })); },
  close() { this.cur = null; $('#page').hidden = true; $('#page').innerHTML = ''; App.changed(); },
  render(reset) {
    const root = $('#page'), { title, body, bare, foot } = PAGES[this.cur](this.args);
    const sc = reset ? 0 : $('.page-body', root)?.scrollTop || 0;
    // L'entrée en fondu ne marque que le contenu de cette ouverture : un rafraîchissement ne la rejoue pas
    const enter = this._enter; this._enter = false;
    root.innerHTML = `${bare ? '' : `<header class="page-head"><button class="icon-btn" data-act="page-close" aria-label="Retour">${ico('chev-l')}</button><h2>${esc(title)}</h2></header>`}<div class="page-body${bare ? ' bare' : ''}">${body}</div>${foot ? `<footer class="page-foot">${foot}</footer>` : ''}`;
    const pb = $('.page-body', root);
    if (enter) pb.classList.add('p-enter');
    pb.scrollTop = sc;
  },
  refresh() {
    if (!this.cur) return;
    const ae = document.activeElement, onQ = ae && ae.id === 'pz-q';
    if (ae && !onQ && $('#page').contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    const pos = onQ ? ae.selectionStart : null;
    this.render(false);
    if (pos != null) { const n = $('#pz-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  },
  set(patch) { Object.assign(this.args, patch); if ('step' in patch) this._enter = true; this.render(false); },
};
const PAGES = {};

PAGES.settings = (args) => {
  const set = Store.s.settings, theme = LS.get(K.theme, 'auto');
  const wait = Sync.code && Sync.configured ? Sync.pending : 0, ws = wait > 1 ? 's' : '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const admin = Role.admin;
  return {
    title: 'Réglages',
    body: `<div class="stackv">
    <section class="card"><div class="card-h"><h2>Sur ce téléphone</h2><span class="role-pill">${admin ? ico('gear', 'sm') + ' Responsable' : ico('door', 'sm') + ' Distributeur'}</span></div>
      ${meBlock()}
      <button class="link" data-act="page" data-v="welcome" data-step="intro" style="margin-top:14px">Revoir l’écran de démarrage</button>
      ${admin ? '' : `<form class="street-tools" style="margin-top:14px" data-form="admin-code"><input class="input" name="code" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="Code d’accès responsable" aria-label="Code d’accès responsable" required><button class="btn ghost" type="submit">Entrer</button></form>`}
    </section>
    ${admin || Sync.code ? `<section class="card" id="sec-logout"><div class="card-h"><h2>Se déconnecter</h2></div>
      ${admin ? `<div class="set-row"><div class="t"><b>Quitter l’accès responsable</b><small>Ce téléphone revient à l’affichage distributeur. Le code d’accès sera redemandé.</small></div><button class="btn sm ghost" data-act="leave-admin">${ico('door', 'sm')} Déconnexion</button></div>` : ''}
      ${Sync.code ? (args.logout === 'team' ? `<div class="confirm"><p>${wait ? `<b>${wait} modification${ws} pas encore envoyée${ws}</b> ${wait > 1 ? 'seront perdues' : 'sera perdue'} : synchronisez d’abord. ` : ''}Détacher ce téléphone de l’équipe ? Les données restent ici, vous pourrez rejoindre de nouveau avec le code de l’équipe.</p><div class="grid2">${wait ? `<button class="btn" data-act="sync-now">${ico('repeat')} Synchroniser</button>` : '<button class="btn ghost" data-act="logout-step" data-v="">Annuler</button>'}<button class="btn red" data-act="leave-team">Se déconnecter</button></div></div>`
        : `<div class="set-row"><div class="t"><b>Se déconnecter de l’équipe</b><small>Détache ce téléphone de la feuille et de son secteur. Rien n’est effacé${wait ? ` · ${wait} modification${ws} en attente d’envoi` : ''}.</small></div><button class="btn sm ghost" data-act="logout-step" data-v="team">${ico('link', 'sm')} Déconnexion</button></div>`) : ''}
    </section>` : ''}
    ${admin ? `<section class="card" id="sec-campaign"><div class="card-h"><h2>Campagne</h2></div>
      <div class="field"><label for="set-name">Nom affiché</label><input id="set-name" class="input" data-set="name" value="${esc(set.name || '')}"></div>
      ${(window.CAL_CONFIG || {}).adminHash ? '<p class="muted" style="margin:12px 0 0;font-size:13.5px">Code d’accès responsable : le même pour tous les responsables, à ne donner qu’à eux. Pour le changer, voir README.md.</p>' : `<div class="field" style="margin-top:12px"><label for="set-code">Code responsable</label><input id="set-code" class="input" inputmode="numeric" data-set="code" value="${esc(set.code || '')}" placeholder="4 chiffres"><small class="muted">À donner seulement aux personnes qui répartissent les rues.</small></div>`}
    </section>` : ''}
    ${admin ? `<section class="card" id="sec-prep"><div class="card-h"><h2>Secteurs</h2><span class="muted">${zones().length}</span></div>
      <div class="grid2"><button class="btn" data-act="zone-build">${ico('plus')} Créer un secteur</button><button class="btn ghost" data-act="page" data-v="assign">${ico('user')} Attribuer les secteurs</button></div>
      <div class="grid2" style="margin-top:8px"><button class="btn ghost" data-act="page" data-v="codes">${ico('grid')} Imprimer les billets</button><button class="btn ghost" data-act="page" data-v="prep">${ico('pen')} Ajuster rue par rue</button></div>
    </section>`
    : `<section class="card" id="sec-prep"><div class="card-h"><h2>Mon secteur</h2><span class="muted">${Sector.zone ? esc(Sector.zone.name) : 'aucun'}</span></div>
      ${Sector.zone ? `<p class="muted" style="margin:0 0 12px">Code <b>${esc(Sector.code)}</b> · ${zonesStreets([Sector.zone]).length} rue${zonesStreets([Sector.zone]).length > 1 ? 's' : ''} · ${nf((stats().byZone[Sector.zone.id] || {}).total || 0)} foyers. Vous ne voyez que ces rues.</p>`
        : Sector.code ? `<div class="note-box" style="margin-bottom:12px">Le code ${esc(Sector.code)} ne correspond à aucun secteur reçu ici. Demandez le bon code au responsable.</div>`
        : '<p class="muted" style="margin:0 0 12px">Saisissez le code à 4 chiffres du billet : vous verrez les rues de votre secteur.</p>'}
      <form class="street-tools" data-form="sector"><input class="input" name="code" inputmode="numeric" maxlength="4" placeholder="1234" autocomplete="off" aria-label="Code du secteur"><button class="btn" type="submit">${Sector.zone ? 'Changer' : 'Valider'}</button></form>
      ${Sector.code ? '<button class="link" style="margin-top:10px" data-act="sector-clear">Retirer ce secteur de ce téléphone</button>' : ''}
    </section>`}
    <section class="card" id="sec-sync">${syncSection()}</section>
    ${admin ? `<section class="card" id="sec-addr"><div class="card-h"><h2>Adresse manquante</h2></div>
      <form data-form="add-addr" class="grid2">
        <div class="field" style="grid-column:1/-1"><label for="aa-com">Commune</label><select id="aa-com" name="com" class="input">${COMMUNES.map((c) => `<option ${UI.com === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field" style="grid-column:1/-1"><label for="aa-street">Rue</label><input id="aa-street" name="street" class="input" list="street-dl" required autocomplete="off"><datalist id="street-dl">${[...new Set(streets().map((st) => st.name))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
        <div class="field"><label for="aa-num">Numéro</label><input id="aa-num" name="num" class="input" required placeholder="12 bis" autocomplete="off"></div>
        <div class="field"><span class="lbl">&nbsp;</span><button class="btn" type="submit">${ico('plus')} Ajouter</button></div>
      </form>
      <p class="muted" style="margin:10px 0 0;font-size:13px">Nouvelle construction absente de la base : elle est placée près des numéros voisins.</p>
    </section>` : ''}
    <section class="card" id="sec-data"><div class="card-h"><h2>Données</h2></div>
      <div class="set-row"><div class="t"><b>Export</b><small>Tableau Excel (CSV) : un foyer par ligne, avec son statut, son équipe et ses repasses</small></div><button class="btn sm ghost" data-act="export-csv">${ico('download', 'sm')} CSV</button></div>
      ${admin ? `<div class="set-row"><div class="t"><b>Sauvegarde complète</b><small>Fichier à garder en lieu sûr</small></div><button class="btn sm ghost" data-act="export-json">${ico('download', 'sm')} Sauver</button></div>
      <div class="set-row"><div class="t"><b>Restaurer une sauvegarde</b><small>Fusionne avec les données actuelles</small></div><button class="btn sm ghost" data-act="import-json">${ico('upload', 'sm')} Importer</button></div>` : ''}
      <div class="set-row"><div class="t"><b>Mode démo</b><small>${Store.demoOn ? 'Actif : données fictives' : 'Explorer l’app avec des données fictives'}</small></div><button class="btn sm ghost" data-act="${Store.demoOn ? 'demo-exit' : 'demo-enter'}">${Store.demoOn ? 'Quitter' : 'Lancer'}</button></div>
      <div class="set-row"><div class="t"><b>Remettre à zéro</b><small>Nouvelle campagne, tout effacer, ou effacer ce téléphone</small></div><button class="btn sm ghost" data-act="page" data-v="reset">${ico('repeat', 'sm')} Ouvrir</button></div>
    </section>
    <section class="card"><div class="card-h"><h2>Affichage</h2></div>
      <div class="seg" style="width:100%">${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<button data-act="theme" data-v="${v}" aria-pressed="${theme === v}">${l}</button>`).join('')}</div>
      ${standalone ? '' : App.installPrompt ? `<button class="btn block" style="margin-top:12px" data-act="install">${ico('download')} Installer l'app sur ce téléphone</button>` : `<div class="note-box" style="margin-top:12px">${ios ? 'Sur iPhone : touchez le bouton Partager de Safari, puis « Sur l’écran d’accueil ».' : 'Dans le menu du navigateur, choisissez « Installer l’application ».'}</div>`}
    </section>
    <p class="muted" style="font-size:12.5px;margin:0">Adresses : Base Adresse Nationale (${COMMUNES.join(', ')}), ${BASE_ADDRS.length} adresses. Plan : © contributeurs OpenStreetMap. Photo aérienne : © IGN.</p>
  </div>`,
  };
};
PAGES.reset = (args) => {
  const S = stats(), admin = Role.admin, step = args.step || '';
  const nPass = Object.keys(Store.s.passages).filter((id) => pass(id)).length;
  const last = resetAt(), wait = Sync.code && Sync.configured ? Sync.pending : 0, ws = wait > 1 ? 's' : '';
  return {
    title: 'Remettre à zéro',
    body: `<div class="stackv">
    ${Store.demoOn ? '<div class="note-box"><b>Mode démo</b> : les remises à zéro de l’équipe sont sans effet ici. Quittez la démo pour les utiliser pour de vrai.</div>' : ''}
    <div class="note-box">${last ? `Dernière remise à zéro : ${dayLabel(isoDay(new Date(last)))} à ${hhmm(last)}.` : 'Aucune remise à zéro pour l’instant.'} ${nPass} foyer${nPass > 1 ? 's' : ''} noté${nPass > 1 ? 's' : ''} actuellement, ${members().length} pompiers, ${zones().length} secteurs.</div>
    ${admin ? `<button class="btn ghost block" data-act="export-json">${ico('download')} Sauvegarder avant d’effacer</button>` : ''}

    <section class="card danger-card">
      <div class="card-h"><h2>Nouvelle campagne</h2><span class="muted">${admin ? 'toute l’équipe' : 'responsable'}</span></div>
      <p class="muted" style="margin:0 0 12px">Tous les foyers repassent à « À faire ». Les repasses et l’historique sont effacés. <b>Les pompiers, les secteurs et la répartition sont conservés.</b> C’est ce qu’il faut faire chaque année avant de recommencer.</p>
      ${!admin ? '<div class="note-box">Réservé au responsable.</div>'
        : step === 'camp' ? `<div class="confirm"><p>Remettre les ${nPass} foyer${nPass > 1 ? 's' : ''} à « À faire » ? Sur tous les téléphones de l’équipe. C’est sans retour.</p><div class="grid2"><button class="btn ghost" data-act="reset-step" data-v="">Annuler</button><button class="btn red" data-act="reset-campaign">Oui, remettre à zéro</button></div></div>`
        : `<button class="btn block" data-act="reset-step" data-v="camp">${ico('repeat')} Démarrer une nouvelle campagne</button>`}
    </section>

    <section class="card danger-card">
      <div class="card-h"><h2>Effacer les secteurs</h2><span class="muted">${admin ? 'toute l’équipe' : 'responsable'}</span></div>
      <p class="muted" style="margin:0 0 12px">Supprime <b>les ${zones().length} secteur${zones().length > 1 ? 's' : ''} et leurs codes</b>, pour refaire la répartition de zéro. Les pompiers, les adresses et tous les passages sont conservés. Les équipes qui ont déjà saisi leur code devront saisir le nouveau.</p>
      ${!admin ? '<div class="note-box">Réservé au responsable.</div>'
        : !zones().length ? '<div class="note-box">Aucun secteur pour l’instant.</div>'
        : step === 'zones' ? `<div class="confirm"><p>Supprimer les ${pl(zones().length, 'secteur')} ? Sur tous les téléphones de l’équipe. Les passages déjà notés restent.</p><div class="grid2"><button class="btn ghost" data-act="reset-step" data-v="">Annuler</button><button class="btn red" data-act="reset-zones">Oui, effacer les secteurs</button></div></div>`
        : `<button class="btn block" data-act="reset-step" data-v="zones">${ico('trash')} Effacer les secteurs</button>`}
    </section>

    <section class="card danger-card">
      <div class="card-h"><h2>Tout effacer</h2><span class="muted">${admin ? 'toute l’équipe' : 'responsable'}</span></div>
      <p class="muted" style="margin:0 0 12px">Efface aussi <b>les pompiers, les secteurs et la répartition</b>, ainsi que les adresses ajoutées à la main et les immeubles. L’app revient à son état d’origine, avec seulement les ${nf(BASE_ADDRS.length)} adresses du secteur.</p>
      ${!admin ? '<div class="note-box">Réservé au responsable.</div>'
        : step === 'all' ? `<div class="confirm"><p>Pour confirmer, tapez <b>EFFACER</b> ci-dessous. Tous les téléphones de l’équipe seront remis à neuf.</p><form data-form="reset-all" style="display:grid;gap:10px"><input class="input code-input" name="mot" autocomplete="off" autocapitalize="characters" placeholder="EFFACER" aria-label="Tapez EFFACER" required><div class="grid2"><button class="btn ghost" type="button" data-act="reset-step" data-v="">Annuler</button><button class="btn red" type="submit">Tout effacer</button></div></form></div>`
        : `<button class="btn block" data-act="reset-step" data-v="all">${ico('trash')} Tout effacer</button>`}
    </section>

    <section class="card">
      <div class="card-h"><h2>Effacer ce téléphone</h2><span class="muted">ce téléphone seulement</span></div>
      <p class="muted" style="margin:0 0 12px">Enlève les données de ce téléphone et le détache de l’équipe. Les autres téléphones ne sont pas touchés${Sync.code ? ' ; si vous rejoignez de nouveau l’équipe, les données déjà envoyées reviennent' : ''}.</p>
      ${step === 'phone' && wait ? `<div class="confirm"><p><b>${wait} modification${ws} pas encore envoyée${ws}</b> à la feuille ${wait > 1 ? 'seront perdues' : 'sera perdue'}. Synchronisez d’abord.${Sync.state === 'offline' ? ' <b>Pas de réseau pour l’instant.</b>' : Sync.state === 'error' ? ` <b>Échec : ${esc(Sync.err)}</b>` : Sync.state === 'syncing' ? ' Envoi en cours…' : ''}</p><div class="grid2"><button class="btn" data-act="sync-now">${ico('repeat')} Synchroniser</button><button class="btn ghost" data-act="reset-step" data-v="phone2">Effacer quand même</button></div></div>`
        : step === 'phone' || step === 'phone2' ? `<div class="confirm"><p>${wait > 1 ? `Les ${wait} modifications non envoyées seront perdues. ` : wait ? 'La modification non envoyée sera perdue. ' : ''}Effacer les données de ce téléphone ?</p><div class="grid2"><button class="btn ghost" data-act="reset-step" data-v="">Annuler</button><button class="btn red" data-act="reset-phone">Effacer</button></div></div>`
        : `<button class="btn ghost block" data-act="reset-step" data-v="phone">${ico('trash')} Effacer ce téléphone</button>`}
    </section>
  </div>`,
  };
};
/** Texte brut de la répartition, quand le partage et le presse-papiers ne sont pas disponibles. */
PAGES.share = () => ({ title: 'Répartition', body: `<div class="stackv"><div class="note-box">Copiez ce texte et collez-le dans le groupe de l'amicale.</div><textarea class="input" rows="18" readonly onclick="this.select()">${esc(shareText())}</textarea></div>` });
function syncSection() {
  const configured = Sync.configured, code = Sync.code;
  const lbl = Store.demoOn ? 'démo' : { local: 'non reliée', online: 'en ligne', syncing: 'synchro…', offline: 'hors ligne', error: 'erreur' }[Sync.state];
  let h = `<div class="card-h"><h2>Équipe connectée</h2><span class="muted">${lbl}</span></div>`;
  if (!configured) {
    h += `<div class="note-box">Toutes les données de l'équipe se rassemblent dans <b>une feuille Google Sheets</b> de votre Drive : gratuit, sans limite pour une amicale, et le trésorier voit tout dans le tableau. Mise en place en 5 minutes, une seule fois, par le chef d'équipe (voir <code>README.md</code>) :</div>
    <ol class="steps"><li>Créez une feuille sur <b>sheets.new</b>.</li><li>Menu <b>Extensions › Apps Script</b> : collez le fichier <code>google-apps-script/Code.gs</code> et enregistrez.</li><li><b>Déployer › Nouveau déploiement › Application Web</b> : exécuter en tant que « Moi », accès « Tout le monde », puis autorisez.</li><li>Collez ci-dessous l'adresse qui finit par <b>/exec</b>.</li></ol>
    <form class="street-tools" data-form="sheet-url"><input class="input" name="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" aria-label="Adresse du script Google" required><button class="btn" type="submit">Relier</button></form>`;
  } else if (!code) {
    h += Role.admin && !Store.demoOn
      ? `<p style="margin:0 0 12px">Feuille reliée. Créez le code de l'équipe pour commencer à partager les données.</p><button class="btn block" data-act="code-create">Créer le code de l'équipe</button>`
      : `<p style="margin:0">Pas encore relié à l'équipe : <b>scannez le QR code du responsable</b> avec l'appareil photo du téléphone.</p>`;
  }
  if (configured && code) {
    h += `<div style="display:grid;gap:12px"><div class="code-box">${esc(code)}</div><div class="qr">${qrSvg(joinLink())}</div><p class="muted" style="text-align:center;margin:0;font-size:13.5px">Les autres pompiers scannent ce QR code avec l'appareil photo de leur téléphone : l'app s'ouvre déjà reliée à l'équipe.</p>
      <div class="grid2"><button class="btn ghost" data-act="share-link">${ico('link')} Partager le lien</button><button class="btn ghost" data-act="sync-now">${ico('repeat')} Synchroniser</button></div>
      ${/^https:\/\/docs\.google\.com\//.test(Sync.sheet) ? `<a class="btn ghost" href="${esc(Sync.sheet)}" target="_blank" rel="noopener">${ico('grid')} Ouvrir la feuille Google</a>` : ''}
      <div class="set-row" style="border:0;padding-bottom:0"><div class="t"><b>${Sync.pending ? `${Sync.pending} modification${Sync.pending > 1 ? 's' : ''} en attente d'envoi` : 'Tout est envoyé'}</b><small>${Sync.lastOk ? 'Dernière synchro à ' + hhmm(Sync.lastOk) : 'Pas encore synchronisé'}${Sync.err ? ' · ' + esc(Sync.err) : ''}</small></div></div></div>`;
  }
  h += `<details class="more" style="margin-top:12px" ${!code ? 'open' : ''}><summary>Rejoindre une équipe existante</summary><div>${!code ? '<p class="muted" style="margin:0 0 10px;font-size:13px">Le code de l’équipe est sur le téléphone du responsable (Réglages › Équipe connectée) et sur les billets.</p>' : ''}<form data-form="join" style="display:grid;gap:10px"><input class="input" name="url" placeholder="Adresse du serveur de synchronisation" value="${esc(Sync.url())}" autocomplete="off" aria-label="Adresse du script Google"><input class="input" name="code" placeholder="SEP-XXXX-XXXX" autocomplete="off" autocapitalize="characters" aria-label="Code d'équipe"><button class="btn" type="submit">Rejoindre</button></form><p class="muted" style="margin:0;font-size:13px">Plus simple : scannez le QR code du chef d'équipe.</p></div></details>`;
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
      ${ev.length ? [...groups].map(([k, list]) => `<section class="card"><div class="card-h"><h2>${dayLabel(k)}</h2><span class="muted">${pl(list.length, 'passage')}</span></div><div class="mini-list" style="margin-top:0;border-top:0">${list.map((e) => evRow(e, true)).join('')}</div></section>`).join('') : '<div class="card empty"><b>Rien à afficher</b>Aucun passage ne correspond au filtre.</div>'}
    </div>`,
  };
};
PAGES.member = ({ id, confirm }) => {
  const m = member(id);
  if (!m) return { title: 'Membre', body: '<div class="card empty"><b>Membre introuvable</b></div>' };
  const S = stats(), bm = S.byMember[id] || { doors: 0, streets: new Map(), last: 0 };
  const sts = [...bm.streets.entries()].sort((a, b) => b[1].length - a[1].length);
  const recent = events().filter((e) => (e.h.by || []).includes(id)).slice(0, 12);
  const zn = zones().filter((z) => (z.members || []).includes(id));
  return {
    title: m.name,
    body: `<div class="stackv">
      <section class="card" style="display:flex;gap:14px;align-items:center">${avatar(id, 'lg')}<div class="field" style="flex:1"><label for="mem-name">Prénom</label><input id="mem-name" class="input" data-member="${id}" value="${esc(m.name)}" ${Role.admin ? '' : 'disabled'}></div></section>
      <div class="kpis">
        <div class="kpi card"><b>${bm.doors}</b><span>foyers faits</span></div>
        <div class="kpi card"><b>${sts.length}</b><span>rues</span></div>
        <div class="kpi card"><b>${zn.length}</b><span>secteurs</span></div>
        <div class="kpi card"><b>${bm.last ? dayShort(bm.last) : '—'}</b><span>dernier passage</span></div>
      </div>
      <p class="muted" style="margin:0;font-size:13px">${zn.length ? `Équipe : ${esc(zn.map((z) => names(z.members) || 'personne').join(' / '))} · secteur ${esc(zn.map((z) => z.name).join(', '))}.` : 'Aucun secteur attribué.'}</p>
      <section class="card"><div class="card-h"><h2>Rues et maisons</h2><span class="muted">${pl(sts.length, 'rue')}</span></div>
        ${sts.length ? sts.map(([sk, list]) => { const st = streetOf(sk); return `<div style="padding:10px 0;border-bottom:1px solid var(--line);display:grid;gap:8px"><div class="sr-top"><b>${esc(st?.name || sk)} <small class="muted" style="font-weight:600">${esc(st?.com || '')}</small></b><span class="muted" style="font:600 13px var(--f-body)">${list.length} foyer${list.length > 1 ? 's' : ''}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap">${[...list].sort((x, y) => numCmp(x.a, y.a) || x.k - y.k).map((u) => `<button class="dt sm" data-st="${statusOf(u.id)}" data-act="unit" data-id="${u.id}" aria-label="${esc(unitTitle(u))}">${esc(shortNum(u))}</button>`).join('')}</div></div>`; }).join('') : '<p class="muted" style="margin:0">Aucun passage enregistré.</p>'}
      </section>
      <section class="card"><div class="card-h"><h2>Derniers passages</h2></div>${recent.length ? `<div class="mini-list" style="margin-top:0;border-top:0">${recent.map((e) => evRow(e)).join('')}</div>` : '<p class="muted" style="margin:0">—</p>'}</section>
      ${Role.admin ? `<section class="card"><div class="card-h"><h2>Couleur</h2></div><div class="swatches">${PALETTE.map((c) => `<button style="--c:${c}" data-act="mem-color" data-id="${id}" data-v="${c}" aria-pressed="${m.color === c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
        <div style="margin-top:16px">${confirm ? `<div class="confirm"><p>Retirer ${esc(m.name)} de la liste ? Ses passages restent dans l'historique.</p><div class="grid2"><button class="btn ghost" data-act="mem-del-no">Annuler</button><button class="btn red" data-act="mem-del" data-id="${id}">Retirer</button></div></div>` : '<button class="link danger" data-act="mem-del-ask">Retirer de la liste</button>'}</div>
      </section>` : ''}
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
/** Une rue dans un sélecteur de secteur : la cocher en entier, ou l'ouvrir pour choisir un côté ou des maisons. */
function streetPickRow(st, { sel, zi, color, zid, open, p, showCom }) {
  const inZ = st.addrs.filter((a) => sel.has(a.id)).length, tot = st.addrs.length;
  const others = {};
  for (const a of st.addrs) if (!sel.has(a.id)) { const o = zi.get(a.id); if (o && o !== zid) others[o] = (others[o] || 0) + 1; }
  const free = st.addrs.filter((a) => !sel.has(a.id) && (!zi.get(a.id) || zi.get(a.id) === zid)).length;
  const state = inZ === tot ? 'all' : inZ ? 'some' : 'none';
  const isOpen = open.has(st.sk);
  return `<div class="zs-row" data-state="${state}">
    <button class="zs-check" data-act="${p}-street" data-v="${esc(st.sk)}" aria-pressed="${state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false'}" aria-label="${state === 'all' ? 'Retirer' : 'Ajouter'} toute la rue ${esc(st.name)}" style="--c:${color}">${state === 'all' ? ico('check', 'sm') : state === 'some' ? ico('minus', 'sm') : ''}</button>
    <button class="zs-name" data-act="${p}-street" data-v="${esc(st.sk)}"><span><b>${esc(st.name)}</b><small>${showCom ? esc(st.com) + ' · ' : ''}${inZ}/${tot} adresses${Object.entries(others).map(([o, n]) => ` · <span class="zdot" style="--c:${Store.s.zones[o]?.color}"></span>${n} dans ${esc(Store.s.zones[o]?.name || '?')}`).join('')}${free && !inZ ? ` · <b class="free">${free} sans secteur</b>` : ''}</small></span></button>
    <button class="zs-open" data-act="${p}-open" data-v="${esc(st.sk)}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Fermer' : 'Ouvrir'} les maisons de ${esc(st.name)}" title="Choisir maison par maison">${ico(isOpen ? 'minus' : 'plus', 'sm')}</button>
  </div>
  ${isOpen ? `<div class="zs-doors"><div class="chips wrap">${[['all', 'Toute la rue'], ['odd', 'Côté impair'], ['even', 'Côté pair'], ['none', 'Aucune']].map(([m, l]) => `<button class="chip" data-act="${p}-quick" data-v="${esc(st.sk)}" data-m="${m}">${l}</button>`).join('')}</div>
    <div class="doors">${st.addrs.map((a) => { const w = sel.has(a.id) ? 'on' : zi.get(a.id) && zi.get(a.id) !== zid ? 'other' : 'free'; const oc = w === 'other' ? Store.s.zones[zi.get(a.id)]?.color : color; const nU = unitsOf(a.id).length; return `<button class="zt ${w}" style="--c:${oc}" data-act="${p}-addr" data-id="${a.id}" aria-pressed="${w === 'on'}" aria-label="${esc(a.num)} ${esc(st.name)}">${esc(a.num)}${nU > 1 ? `<small>${nU} logts</small>` : ''}</button>`; }).join('')}</div></div>` : ''}`;
}
PAGES.zone = () => {
  if (!ZE) return { title: 'Secteur', body: '' };
  const zi = zoneIndex(), q = norm(ZE.q), sel = ZE.addrs;
  const nUnits = sum([...sel], (id) => unitsOf(id).length);
  const stInZone = streets().filter((st) => st.addrs.some((a) => sel.has(a.id)));
  const counts = { '': streets().length };
  for (const st of streets()) counts[st.com] = (counts[st.com] || 0) + 1;
  const list = streets().filter((st) => (!ZE.com || st.com === ZE.com) && (!q || norm(st.name + ' ' + st.com).includes(q)) && (!ZE.only || st.addrs.some((a) => sel.has(a.id))));
  const row = (st) => streetPickRow(st, { sel, zi, color: ZE.color, zid: ZE.id, open: ZE.open, p: 'ze', showCom: !ZE.com });
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
// ───────── Créer un secteur : son nom, puis ses rues touchées une à une sur la carte
let SB = null;
function startBuilder(z) {
  if (!Role.admin) return;
  SB = { id: z ? z.id : null, name: z ? z.name : '', color: z ? z.color : ZONE_COLORS[zones().length % ZONE_COLORS.length], addrs: new Set(z ? z.addrs || [] : []), sel: null, log: [] };
  Page.open('newzone', {});
}
/** Le nom est validé : on passe à la carte. */
function builderToMap() {
  if (!SB) return;
  SB.name = String(SB.name || '').trim() || `Secteur ${zones().length + 1}`;
  ZE = { ...newZE(), id: SB.id, name: SB.name, color: SB.color, addrs: SB.addrs, build: true };
  Page.close();
  MapView.startLasso();
}
PAGES.newzone = () => {
  if (!SB) return { title: 'Nouveau secteur', body: '' };
  const n = SB.addrs.size;
  return {
    title: SB.id ? 'Modifier le secteur' : 'Nouveau secteur',
    body: `<div class="stackv">
      <section class="card">
        <div class="field"><label for="sb-name">Nom du secteur</label><input id="sb-name" class="input" value="${esc(SB.name)}" placeholder="Seppois nord" autocomplete="off" autocapitalize="words"></div>
        <p class="muted" style="margin:10px 0 0;font-size:13.5px">Par exemple « Seppois nord », « Seppois sud », « Mooslargue ». Vous choisirez ses rues juste après, sur la carte.</p>
      </section>
      <section class="card">
        <div class="card-h"><h2>Couleur sur la carte</h2></div>
        <div class="swatches">${ZONE_COLORS.map((c) => `<button style="--c:${c}" data-act="sb-color" data-v="${c}" aria-pressed="${SB.color === c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
      </section>
      ${n ? `<div class="note-box">Ce secteur contient déjà ${pl(n, 'adresse')}.</div>` : ''}
    </div>`,
    foot: `<button class="btn ghost" data-act="page-close">Annuler</button><button class="btn block" data-act="sb-to-map">${ico('map')} Choisir les rues sur la carte</button>`,
  };
};
/** Attribuer les secteurs : les personnes, puis le code et le billet. */
PAGES.assign = (args) => {
  const zs = zones(), S = stats();
  const z = args.z ? Store.s.zones[args.z] : null;
  if (z && !z.del) {
    const g = S.byZone[z.id] || { total: 0 }, sts = zonesStreets([z]);
    const byCom = new Map();
    for (const st of sts) { if (!byCom.has(st.com)) byCom.set(st.com, []); byCom.get(st.com).push(st.name); }
    return {
      title: z.name,
      body: `<div class="stackv">
        <section class="card" style="--c:${z.color}">
          <div class="card-h"><h2><span class="zdot" style="--c:${z.color}"></span> ${esc(z.name)}</h2><span class="muted">${pl(sts.length, 'rue')} · ${nf(g.total)} foyers</span></div>
          ${[...byCom].map(([com, l]) => `<p class="cc-st"><b>${esc(com)}</b> : ${esc(l.join(', '))}</p>`).join('') || '<p class="muted" style="margin:0">Aucune rue pour l’instant.</p>'}
          <button class="btn ghost block" style="margin-top:12px" data-act="zone-build" data-v="${z.id}">${ico('map')} Modifier les rues</button>
        </section>
        <section class="card">
          <div class="card-h"><h2>Qui fait ce secteur</h2></div>
          <p class="muted" style="margin:0 0 12px">Les noms et prénoms des pompiers de ce secteur, un par ligne. <b>Facultatif</b> : le code du secteur marche même sans aucun nom.</p>
          <form data-form="assign-people" data-z="${z.id}" style="display:grid;gap:10px">
            <textarea class="input" name="names" rows="3" placeholder="Thomas Keller&#10;Julie Wagner" autocomplete="off">${esc((z.members || []).map((m) => member(m)?.name).filter(Boolean).join('\n'))}</textarea>
            <button class="btn" type="submit">${ico('check')} Enregistrer et générer le code</button>
          </form>
        </section>
        <section class="card">
          <div class="card-h"><h2>Le code de ce secteur</h2></div>
          <div class="cc-mid">
            <div class="cc-code"><small class="lbl">À donner à l’équipe</small><div class="code-box">${z.code ? esc(z.code) : '— — — —'}</div></div>
            ${z.code ? `<div class="qr">${qrSvg(joinLink(z.code))}</div>` : ''}
          </div>
          <p class="muted" style="margin:10px 0 0;font-size:13.5px">${z.code ? 'L’équipe scanne le QR code — ou ouvre l’app et saisit ce code — et ne voit que ces rues.' : 'Enregistrez les noms ci-dessus : le code sera créé.'}</p>
          <button class="btn ghost block" style="margin-top:12px" data-act="page" data-v="codes">${ico('grid')} Imprimer les billets</button>
        </section>
      </div>`,
    };
  }
  return {
    title: 'Attribuer les secteurs',
    body: `<div class="stackv">
      ${zs.length ? '<div class="note-box">Touchez un secteur pour y mettre les noms des pompiers : l’app lui donne alors son code à 4 chiffres.</div>' : ''}
      ${zs.length ? zs.map((x) => { const g = S.byZone[x.id] || { total: 0 }; return `<button class="zone-row as-btn" data-act="page" data-v="assign" data-z="${x.id}"><span class="zdot" style="--c:${x.color}"></span><b>${esc(x.name)}</b><span class="meta">${x.code ? esc(x.code) : 'sans code'}</span><span class="zone-team" style="grid-column:2/-1">${(x.members || []).length ? esc(names(x.members)) : '<i class="todo">Personne pour l’instant</i>'} · ${pl(zonesStreets([x]).length, 'rue')} · ${nf(g.total)} foyers</span></button>`; }).join('')
        : '<div class="card empty"><b>Aucun secteur</b><span>Créez-les un par un sur la carte, ou laissez l’app proposer un découpage par village.</span></div>'}
      <button class="btn block" data-act="zone-build">${ico('plus')} Créer un secteur</button>
      <button class="btn ghost block" data-act="auto-show">${ico('sparkle')} Répartition automatique · ${pl(sum(Object.values(autoK())), 'secteur')}</button>
      ${zs.length ? `<button class="btn ghost block" data-act="page" data-v="codes">${ico('grid')} Imprimer les billets</button>` : ''}
    </div>`,
  };
};

// ───────── Préparer les secteurs : un secteur, ses rues, son code d'équipe (confortable sur ordinateur)
let PZ = { zid: '', com: '', q: '', open: new Set(), del: false };
const pzZone = () => { const z = Store.s.zones[PZ.zid]; return z && !z.del ? z : null; };
const pzPut = (patch) => { const z = pzZone(); if (z && Role.admin) Store.put('zone', z.id, { ...z, ...patch }); };
function prepRows() {
  const z = pzZone(), zi = zoneIndex(), sel = new Set(z ? z.addrs || [] : []), q = norm(PZ.q);
  const list = streets().filter((st) => (!PZ.com || st.com === PZ.com) && (!q || norm(st.name + ' ' + st.com).includes(q)));
  if (!list.length) return '<div class="empty">Aucune rue ne correspond.</div>';
  return list.map((st) => streetPickRow(st, { sel, zi, color: z ? z.color : ZONE_COLORS[0], zid: z ? z.id : '', open: PZ.open, p: 'pz', showCom: !PZ.com })).join('');
}
PAGES.prep = () => {
  if (!Role.admin) return { title: 'Préparer les secteurs', body: '<div class="card empty"><b>Réservé au responsable</b><span>Les secteurs se préparent depuis l’accès responsable.</span></div>' };
  const zs = zones(), S = stats(), z = pzZone() || zs[0] || null; // le secteur choisi, ou le premier s'il a été supprimé ailleurs
  PZ.zid = z ? z.id : '';
  const counts = { '': streets().length };
  for (const st of streets()) counts[st.com] = (counts[st.com] || 0) + 1;
  const miss = unassigned().length;
  const rail = `<aside class="prep-rail">
    <div class="pr-head"><b>Secteurs</b><span class="muted">${zs.length}</span></div>
    <div class="pr-list">${zs.map((x) => { const g = S.byZone[x.id] || { total: 0 }; return `<button class="pr-item" data-act="pz-pick" data-v="${x.id}" aria-current="${x.id === PZ.zid ? 'true' : 'false'}"><span class="zdot" style="--c:${x.color}"></span><span class="pr-t"><b>${esc(x.name)}</b><small>${(() => { const n = zonesStreets([x]).length; return `${n} rue${n > 1 ? 's' : ''}`; })()} · ${nf(g.total)} foyer${g.total > 1 ? 's' : ''}</small></span><span class="pr-code">${x.code ? esc(x.code) : '—'}</span></button>`; }).join('') || '<p class="muted" style="margin:0;padding:14px">Aucun secteur pour l’instant.</p>'}</div>
    <div class="pr-foot">
      <button class="btn block" data-act="pz-new">${ico('plus')} Nouveau secteur</button>
      <button class="btn ghost block" data-act="page" data-v="codes">${ico('grid')} Codes à distribuer</button>
      ${miss ? `<button class="link" data-act="page" data-v="unassigned">${miss} adresse${miss > 1 ? 's' : ''} sans secteur</button>` : '<p class="muted" style="margin:0;font-size:12.5px">Toutes les adresses sont rangées dans un secteur.</p>'}
      ${zs.length ? '<button class="link danger" data-act="page" data-v="reset" data-step="zones">Effacer tous les secteurs</button>' : ''}
    </div>
  </aside>`;
  const g = z ? S.byZone[z.id] || { total: 0, visited: 0 } : null;
  const main = !z ? `<div class="prep-main"><section class="card"><div class="empty"><b>Créez le premier secteur</b><span>Donnez-lui un nom, par exemple « Mooslargue nord », puis choisissez ses rues : en les cochant dans la liste, ou en les touchant sur la carte. L’app lui donne un code à 4 chiffres : c’est ce code que son équipe saisira.</span><button class="btn" data-act="pz-new">${ico('plus')} Nouveau secteur</button></div></section>
    <section class="card"><div class="card-h"><h2>Ou partir d’un découpage tout fait</h2><span class="muted">à ajuster ensuite</span></div>
      <div class="grid2"><button class="btn ghost" data-act="auto-com">Un secteur par commune (${COMMUNES.length})</button><button class="btn ghost" data-act="auto-go">${UI.autoN || 6} secteurs équilibrés</button></div>
    </section></div>`
  : `<div class="prep-main">
    <section class="card pz-top" style="--c:${z.color}">
      <div class="pz-id">
        <div class="field"><label for="pz-name">Nom du secteur</label><input id="pz-name" class="input" data-change="pz-name" value="${esc(z.name)}" autocomplete="off" placeholder="Mooslargue nord"></div>
        <div class="field"><span class="lbl">Couleur sur la carte</span><div class="swatches">${ZONE_COLORS.map((c) => `<button style="--c:${c}" data-act="pz-color" data-v="${c}" aria-pressed="${z.color === c}" aria-label="Couleur ${c}"></button>`).join('')}</div></div>
      </div>
      <div class="pz-code">
        <small class="lbl">Code de ce secteur</small>
        <div class="code-box">${z.code ? esc(z.code) : '— — — —'}</div>
        ${z.code ? `<details class="more"><summary>Changer le code</summary><div><p class="muted" style="margin:0 0 10px;font-size:13px">Les téléphones qui ont déjà saisi ${esc(z.code)} ne verraient plus leurs rues : à ne faire qu’avant de distribuer les billets.</p><button class="btn ghost sm" data-act="pz-code">Nouveau code</button></div></details>`
          : `<button class="btn sm" data-act="pz-code">Donner un code</button>`}
      </div>
    </section>
    <div class="kpis">
      <div class="kpi card"><b>${zonesStreets([z]).length}</b><span>rues</span></div>
      <div class="kpi card"><b>${nf(g.total)}</b><span>foyers</span></div>
      <div class="kpi card"><b>${(z.addrs || []).length}</b><span>adresses</span></div>
      <div class="kpi card"><b>${pct(g.visited, g.total)} %</b><span>faits</span></div>
    </div>
    <section class="card">
      <div class="card-h"><h2>Qui fait ce secteur</h2><span class="muted">facultatif</span></div>
      ${members().length ? `<div class="chips wrap">${memberChips('pz-member', z.members || [])}</div>` : '<p class="muted" style="margin:0 0 12px">Pas encore de prénoms. Chaque équipe peut aussi se nommer elle-même sur son téléphone.</p>'}
      <details class="more" style="margin-top:14px"><summary>Ajouter des prénoms</summary><div>${addMemberForm()}<p class="muted" style="margin:8px 0 0;font-size:13px">Un prénom par ligne.</p></div></details>
    </section>
    <div class="pz-pick">
      <div class="lbl">Cochez les rues de ce secteur · ouvrez une rue pour n’en prendre qu’un côté ou quelques maisons</div>
      <button class="btn ghost sm" data-act="pz-map">${ico('map')} Choisir sur la carte</button>
    </div>
    ${comChips('pz-com', PZ.com, counts)}
    <div class="input-ico">${ico('search')}<input id="pz-q" class="input" type="search" placeholder="Chercher une rue" value="${esc(PZ.q)}" autocomplete="off" aria-label="Chercher une rue"></div>
    <div class="zs-list" id="pz-list">${prepRows()}</div>
    ${PZ.del ? `<div class="confirm"><p>Supprimer « ${esc(z.name)} » ? Ses rues redeviennent sans secteur, les passages sont conservés.</p><div class="grid2"><button class="btn ghost" data-act="pz-del-no">Garder</button><button class="btn red" data-act="pz-del-yes">Supprimer</button></div></div>`
      : '<button class="link danger" data-act="pz-del" style="justify-self:start">Supprimer ce secteur</button>'}
  </div>`;
  return { title: 'Préparer les secteurs', body: `<div class="prep">${rail}${main}</div>` };
};
/** Un billet par secteur : QR code de l'équipe + code du secteur, à imprimer et à donner. */
PAGES.codes = () => {
  const zs = zones(), S = stats(), miss = zs.filter((z) => !z.code).length;
  const card = (z) => {
    const g = S.byZone[z.id] || { total: 0 };
    const byCom = new Map();
    const sts = zonesStreets([z]), nStreets = sts.length;
    for (const st of sts) { if (!byCom.has(st.com)) byCom.set(st.com, []); byCom.get(st.com).push(st.name); }
    return `<section class="code-card">
      <div class="cc-top"><span class="zdot" style="--c:${z.color}"></span><b>${esc(z.name)}</b><span class="muted">${nf(g.total)} foyer${g.total > 1 ? 's' : ''} · ${nStreets} rue${nStreets > 1 ? 's' : ''}</span></div>
      <div class="cc-mid">
        <div class="cc-code"><small class="lbl">Code du secteur</small><div class="code-box">${z.code ? esc(z.code) : '— — — —'}</div><small class="muted">${(z.members || []).length ? esc(names(z.members)) : 'équipe à désigner'}</small></div>
        ${z.code ? `<div class="qr">${qrSvg(joinLink(z.code))}</div>` : ''}
      </div>
      <p class="cc-how">${!z.code ? 'Ce secteur n’a pas encore de code : touchez « Donner un code » en haut de cette page, puis réimprimez.'
        : `Scannez le QR code avec l’appareil photo du téléphone : l’app s’ouvre sur ce secteur. Sinon, ouvrez l’app et saisissez <b>${esc(z.code)}</b>.${Sync.code ? '' : ' (Les passages resteront sur chaque téléphone tant que l’équipe n’est pas reliée à la feuille Google.)'}`}</p>
      ${[...byCom].map(([com, l]) => `<p class="cc-st"><b>${esc(com)}</b> : ${esc(l.join(', '))}</p>`).join('') || '<p class="cc-st muted">Aucune rue dans ce secteur pour l’instant.</p>'}
    </section>`;
  };
  return {
    title: 'Codes des secteurs',
    body: `<div class="codes">
      <div class="no-print stackv" style="margin-bottom:18px">
        <div class="note-box">Un billet par secteur. Le QR code ouvre l’app déjà reliée à l’équipe ; le code à 4 chiffres donne les rues du secteur, et rien d’autre. Imprimez, découpez, et donnez à chaque équipe le billet de son secteur.</div>
        ${!Sync.code && !Store.demoOn ? '<div class="note-box"><b>L’équipe n’est pas encore reliée à la feuille.</b> Les QR codes apparaîtront après « Créer le code de l’équipe », dans Réglages › Équipe connectée.</div>' : ''}
        ${dupCodes().length ? `<div class="note-box"><b>Le code ${esc(dupCodes().join(', '))} sert à deux secteurs.</b> Ouvrez « Préparer les secteurs » et donnez un nouveau code à l’un des deux : sans cela, leurs équipes ne verront rien.</div>` : ''}
        ${miss ? `<button class="btn block" data-act="codes-gen">${ico('plus')} ${miss > 1 ? `Donner un code aux ${miss} secteurs qui n’en ont pas` : 'Donner un code au secteur qui n’en a pas'}</button>` : ''}
        <div class="grid2"><button class="btn" data-act="print">${ico('grid')} Imprimer les billets</button><button class="btn ghost" data-act="page" data-v="prep">${ico('pen')} Modifier les secteurs</button></div>
      </div>
      ${zs.length ? zs.map(card).join('') : '<div class="card empty"><b>Aucun secteur</b><span>Créez les secteurs, puis revenez ici pour imprimer les billets.</span><button class="btn" data-act="page" data-v="prep">Préparer les secteurs</button></div>'}
    </div>`,
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
        ${[...by].sort((x, y) => (streetOf(x[0])?.ci ?? 99) - (streetOf(y[0])?.ci ?? 99)).map(([sk, list]) => { const st = streetOf(sk); return `<section class="card"><div class="sr-top"><b>${esc(st.name)}</b><span class="muted" style="font:600 13px var(--f-body)">${esc(st.com)}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">${list.map((a) => `<span class="dt sm">${esc(a.num)}</span>`).join('')}</div>${zs.length ? `<select class="input" data-change="assign-street" data-sk="${esc(sk)}" aria-label="Secteur pour ${esc(st.name)}"><option value="">Ranger ces ${pl(list.length, 'adresse')} dans…</option>${zs.map((z) => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}</select>` : ''}</section>`; }).join('')}`
      : '<div class="card empty"><b>Aucune maison oubliée</b>Toutes les adresses sont rangées dans un secteur.</div>'}
    </div>`,
  };
};
PAGES.welcome = (args) => {
  const step = args.step || 'intro';
  const back = (to) => `<button class="link" data-act="w-step" data-v="${to}" style="justify-self:start">${ico('chev-l', 'sm')} Retour</button>`;
  if (step === 'create') return { bare: true, body: `<div class="welcome left">
    ${back('intro')}
    <h1 class="w-title sm">Les pompiers</h1>
    <p>Un prénom par ligne. Vous pourrez en ajouter, en retirer ou en corriger à tout moment depuis l'onglet Répartition.</p>
    <form data-form="w-create" style="display:grid;gap:12px"><textarea class="input" name="names" rows="8" placeholder="Thomas K.&#10;Julie W.&#10;Nicolas B." aria-label="Liste des pompiers"></textarea><button class="btn red block" type="submit">Continuer</button></form>
    <button class="link" data-act="w-step" data-v="zones">Je donnerai les prénoms plus tard</button>
    <button class="link" data-act="w-done">Passer cette étape</button>
  </div>` };
  if (step === 'code') return { bare: true, body: `<div class="welcome left">
    ${back('intro')}
    <h1 class="w-title sm">Code d’accès</h1>
    <p>Le code d’accès responsable ouvre la carte complète et la répartition des rues. Les distributeurs n’en ont pas besoin : ils choisissent seulement leur prénom.</p>
    <form data-form="w-code" style="display:grid;gap:12px"><input class="input code-input" name="code" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="••••" aria-label="Code d’accès responsable" required><button class="btn red block" type="submit">Entrer</button></form>
  </div>` };
  if (step === 'zones') {
    const n = UI.autoN || 4, S = stats();
    return { bare: true, body: `<div class="welcome left">
      <h1 class="w-title sm">Répartition de départ</h1>
      <p>Pour ne pas partir d'une page blanche. Vous pourrez tout ajuster ensuite : déplacer une rue, découper un secteur, le renommer, y mettre une équipe.</p>
      <div class="w-actions">
        <button class="btn red block" data-act="w-zones-com">${ico('map')} Un secteur par commune <small>${COMMUNES.length} secteurs</small></button>
        <div class="card" style="display:grid;gap:12px">
          <div class="set-row" style="border:0;padding:0"><div class="t"><b>Ou des quartiers par village</b><small>D’un seul tenant, nord / est / sud / ouest · ajustable ensuite village par village</small></div></div>
          <button class="btn ghost block" data-act="w-zones-auto">${ico('sparkle')} Créer ${pl(sum(Object.values(autoK())), 'secteur')}</button>
        </div>
        <button class="link" data-act="w-done">Je répartirai plus tard</button>
      </div>
    </div>` };
  }
  if (step === 'join') return { bare: true, body: `<div class="welcome left">
    ${back('intro')}
    <h1 class="w-title sm">Rejoindre</h1>
    <p>Le plus simple : scannez le QR code du responsable avec l'appareil photo. Sinon, saisissez ${Sync.configured ? 'le code de l’équipe' : 'l’adresse de la feuille et le code de l’équipe'}.</p>
    <form data-form="join" style="display:grid;gap:12px">${Sync.configured ? `<input type="hidden" name="url" value="${esc(Sync.url())}">` : '<input class="input" name="url" placeholder="Adresse du serveur de synchronisation" autocomplete="off" aria-label="Adresse du serveur">'}<input class="input code-input" name="code" placeholder="SEP-XXXX-XXXX" autocapitalize="characters" autocomplete="off" aria-label="Code d'équipe" required><button class="btn red block" type="submit">Rejoindre</button></form>
  </div>` };
  if (step === 'secteur') {
    const needTeam = Sync.configured && !Sync.code && !Store.demoOn;
    const z = Sector.zone;
    return { bare: true, body: `<div class="welcome left">
      ${back('intro')}
      <h1 class="w-title sm">Votre code</h1>
      <p>Saisissez le code inscrit sur le billet que le responsable vous a donné. Vous verrez les rues de votre secteur, et seulement celles-là.</p>
      <form data-form="sector" style="display:grid;gap:12px"><input class="input code-input" name="code" inputmode="${needTeam ? 'text' : 'numeric'}" autocapitalize="characters" placeholder="${needTeam ? 'SEP-XXXX-XXXX' : '1234'}" autocomplete="off" aria-label="Votre code" required><button class="btn red block" type="submit">${ico('door')} Voir mes rues</button></form>
      ${needTeam ? '<div class="note-box">Ce téléphone n’est pas encore relié à l’équipe. Le plus simple : <b>scannez le QR code du billet</b> avec l’appareil photo. Sinon, saisissez ici le code d’équipe <b>SEP-XXXX-XXXX</b> inscrit sur le billet, puis le code à 4 chiffres de votre secteur.</div>' : ''}
      ${z ? `<div class="note-box">Ce téléphone suit déjà <b>${esc(z.name)}</b> · ${pl(zonesStreets([z]).length, 'rue')}.</div><button class="btn ghost block" data-act="w-done">Continuer avec ${esc(z.name)}</button>` : ''}
      ${!zones().length && Sync.code ? `<div class="note-box">Les secteurs ne sont pas encore arrivés sur ce téléphone.${Sync.state === 'offline' ? ' <b>Pas de réseau pour l’instant</b> : réessayez dès que le téléphone capte.' : Sync.state === 'error' ? ` <b>${esc(Sync.err)}</b>` : Sync.state === 'syncing' ? ' Réception en cours…' : ''}<br><button class="btn ghost sm" style="margin-top:10px" data-act="sync-now">${ico('repeat')} Synchroniser</button></div>` : ''}
    </div>` };
  }
  if (step === 'who') return { bare: true, body: `<div class="welcome left">
    <h1 class="w-title sm">Qui êtes-vous ?</h1>
    <p>Touchez votre prénom et celui des personnes qui tournent avec vous. Vous pouvez être 2 ou 3.${Sector.zone ? ` Secteur <b>${esc(Sector.zone.name)}</b>.` : ''}</p>
    ${Sync.configured && !Sync.code && !Store.demoOn ? `<div class="note-box"><b>D’abord, reliez ce téléphone à l’équipe :</b> scannez le QR code du responsable avec l’appareil photo. Vos prénoms et vos rues arriveront ensuite tout seuls.</div><button class="btn ghost block" data-act="w-step" data-v="join">${ico('link')} J’ai le code de l’équipe</button>`
      : members().length || Sector.zone ? meBlock() : '<div class="note-box">La liste des pompiers n’est pas encore faite. Le responsable l’ajoute depuis l’onglet Répartition ; elle arrivera ensuite toute seule sur ce téléphone.</div>'}
    <button class="btn red block" data-act="w-done">${Me.team().length ? 'C’est parti' : 'Continuer'}</button>
  </div>` };
  return { bare: true, body: `<div class="welcome">
    <div class="w-crest"><img src="icons/logo.jpg" alt="Blason de l'Amicale des Sapeurs-Pompiers de Seppois-le-Bas"></div>
    <div class="lbl">Amicale des Sapeurs-Pompiers de Seppois-le-Bas · depuis 1926</div>
    <h1 class="w-title">Tournée des <em>calendriers</em></h1>
    <p>Les ${nf(BASE_ADDRS.length)} adresses du secteur sont déjà chargées : ${COMMUNES.join(', ')}. Le responsable répartit les rues, chaque équipe suit les siennes, même sans réseau.</p>
    <div class="w-facts"><span>${COMMUNES.length} communes</span><span>${streets().length} rues</span><span>${nf(BASE_ADDRS.length)} adresses</span><span>Hors ligne</span></div>
    <div class="w-actions">
      ${(() => { const r = phoneReady(); return r ? `<button class="btn red block" data-act="w-done">${ico('chev-r')} ${esc(r)}</button>` : ''; })()}
      <button class="btn ${phoneReady() ? 'ghost' : 'red'} block" data-act="w-step" data-v="secteur">${ico('door')} J’ai un code · je distribue</button>
      <button class="btn ghost block" data-act="w-step" data-v="code">${ico('gear')} Je suis le responsable</button>
      ${Store.demoOn ? '<button class="link" data-act="demo-exit">Quitter la démo</button>' : '<button class="link" data-act="w-demo">Découvrir avec des données de démo</button>'}
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
    map.on('dragstart', () => { if (this._pan) return; this._dragRef = map.containerPointToLatLng([0, 0]); this._panning = true; this.canvas.style.willChange = 'transform'; });
    map.on('move', () => {
      if (!this._dragRef) { this.draw(); return; }
      const p = map.latLngToContainerPoint(this._dragRef); // une seule écriture de style par image, aucun redessin
      this.canvas.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    });
    map.on('zoomanim', () => (this.canvas.style.opacity = 0));
    map.on('zoomend', () => { this.styleRoads(); this.canvas.style.opacity = 1; this.draw(); });
    map.on('moveend resize viewreset', () => {
      if (this._dragRef) { this._dragRef = null; this._panning = false; this.canvas.style.transform = ''; this.canvas.style.willChange = ''; }
      this.size(); this.draw();
    });
    map.on('click', (e) => this.click(e.containerPoint));
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => this.lassoDown(e));
    cv.addEventListener('pointermove', (e) => this.lassoMove(e));
    cv.addEventListener('pointerup', (e) => this.lassoUp(e));
    cv.addEventListener('pointercancel', () => { if (this.lasso) { this.lasso.path = null; this._pan = null; this.draw(); } });
    cv.addEventListener('contextmenu', (e) => { if (this.lasso) e.preventDefault(); }); // le clic droit sert à déplacer la carte
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
    if (!s.x || !s.y) return; // vue cachée : on garde la dernière taille connue, une toile vide ferait planter le dessin
    if (this._w === s.x && this._h === s.y && this._dpr === dpr) return;
    this._w = s.x; this._h = s.y; this._dpr = dpr;
    this.canvas.width = Math.round(s.x * dpr); this.canvas.height = Math.round(s.y * dpr);
    this.canvas.style.width = s.x + 'px'; this.canvas.style.height = s.y + 'px';
  },
  fitTo(list, anim = true, maxZoom = 18.5) { if (!this.map || !list.length) return; this.map.fitBounds(L.latLngBounds(list.map((a) => [a.lat, a.lon])), { paddingTopLeft: [24, 24], paddingBottomRight: [64, 24], maxZoom, animate: anim }); },
  fit(anim = true) { const mine = Role.admin ? [] : addrs().filter(visibleAddr); this.fitTo(mine.length ? mine : UI.com ? addrs().filter((a) => a.com === UI.com) : addrs(), anim, 17.5); },
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
      if (!this.lasso && (Role.admin ? UI.com && streetOf(sk)?.com !== UI.com : !streetOf(sk)?.addrs.some(visibleAddr))) continue;
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
    // Création d'un secteur : un toucher choisit la rue, on l'ajoute ensuite avec le bouton
    if (this.lasso && ZE?.build) {
      const a0 = this.nearest(p), sk = a0 ? a0.sk : this.hitStreet(p);
      if (!sk) return;
      SB.sel = sk; this.selStreet = sk; vibrate(8);
      this.renderLassoBar(); this.draw();
      return;
    }
    const byStreet = this.lasso && this.lasso.grain !== 'house';
    const a0 = this.nearest(p);
    const a = byStreet ? null : a0;
    const sk = a ? null : (byStreet && a0 ? a0.sk : this.hitStreet(p));
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
    this.lasso = { mode: 'add', grain: 'street', path: null };
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
    const on = !!this.lasso, m = this.map;
    this.canvas.style.pointerEvents = on ? 'auto' : 'none';
    this.canvas.style.touchAction = on ? 'none' : '';
    // Le déplacement est fait à la main (clic gauche) pour rester fluide ; le pincement et le zoom restent à la carte
    for (const h of [m.dragging, m.boxZoom]) on ? h.disable() : h.enable();
    for (const h of [m.touchZoom, m.doubleClickZoom]) h.enable();
  },
  endLasso(apply) {
    this.lasso = null; this.selStreet = null; this.setLassoInput(); this.renderLassoBar(); $('#map-legend').hidden = false; this.draw();
    if (apply && ZE?.toPrep) {
      const z = ZE;
      saveZone({ id: z.id, name: z.name, color: z.color, members: z.members, addrs: [...z.addrs], order: z.order });
      PZ.zid = z.id; ZE = null;
      Page.open('prep');
      toast(`${z.name} · ${z.addrs.size} adresse${z.addrs.size > 1 ? 's' : ''}.`);
    } else if (apply && ZE) Page.open('zone');
    else ZE = null;
  },
  lassoPt(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
  lassoDown(e) {
    if (!this.lasso) return;
    if (this._pan || this.lasso.path) { this.cancelPan(); return; } // deuxième doigt : on laisse le pincement à la carte
    this.canvas.setPointerCapture?.(e.pointerId);
    if (e.button === 2) { this.lasso.path = [this.lassoPt(e)]; e.preventDefault(); return; } // clic droit : choisir ou entourer
    this._pan = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: 0, ty: 0, dx: 0, dy: 0, moved: 0, raf: 0, touch: e.pointerType !== 'mouse' };
    this._panning = true; this.canvas.style.willChange = 'transform';
    e.preventDefault();
  },
  /** Déplacement fluide : une seule mise à jour par image, et la couche des maisons glisse sans être redessinée. */
  lassoMove(e) {
    const P = this._pan;
    if (P) {
      if (e.pointerId !== P.id) return;
      const dx = e.clientX - P.x, dy = e.clientY - P.y;
      P.x = e.clientX; P.y = e.clientY;
      P.tx += dx; P.ty += dy; P.dx += dx; P.dy += dy; P.moved += Math.abs(dx) + Math.abs(dy);
      if (!P.raf) P.raf = requestAnimationFrame(() => {
        P.raf = 0;
        const ddx = P.dx, ddy = P.dy; P.dx = 0; P.dy = 0;
        if (ddx || ddy) this.map.panBy([-ddx, -ddy], { animate: false });
        this.canvas.style.transform = `translate3d(${P.tx}px, ${P.ty}px, 0)`;
      });
      return;
    }
    const L0 = this.lasso; if (!L0?.path) return;
    const p = this.lassoPt(e), q = L0.path[L0.path.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) > 3) { L0.path.push(p); this.draw(); }
  },
  cancelPan() {
    const P = this._pan; if (!P) return null;
    if (P.raf) cancelAnimationFrame(P.raf);
    this._pan = null; this._panning = false;
    this.canvas.style.transform = ''; this.canvas.style.willChange = '';
    this.size(); this.draw();
    return P;
  },
  lassoUp(e) {
    if (this._pan) {
      const P = this.cancelPan();
      if (P && P.moved < 6) {
        if (P.touch) this.click(this.lassoPt(e)); // au doigt, un simple appui choisit
        else if (!this._hintAt || Date.now() - this._hintAt > 8000) { this._hintAt = Date.now(); toast('Clic droit pour prendre une rue · clic gauche pour déplacer la carte.', { ms: 3200 }); }
      }
      return;
    }
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
    if (ZE.build) {
      const st = SB && SB.sel ? streetOf(SB.sel) : null;
      const inZ = st ? st.addrs.filter((a) => ZE.addrs.has(a.id)).length : 0;
      const nSt = streets().filter((x) => x.addrs.some((a) => ZE.addrs.has(a.id))).length;
      bar.innerHTML = `<p><span class="zdot" style="--c:${ZE.color}"></span> <b>${esc(ZE.name)}</b> · ${pl(nSt, 'rue')} · ${pl(n, 'adresse')}<br><small>${st ? '' : 'Touchez une rue sur la carte, puis « Ajouter au secteur ».'}</small></p>
        ${st ? `<div class="sb-pick"><b>${esc(st.name)}</b><small>${esc(st.com)} · ${pl(st.addrs.length, 'maison')}${inZ === st.addrs.length ? ' · déjà dans le secteur' : ''}</small></div>
          <button class="btn red block" data-act="${inZ === st.addrs.length ? 'sb-remove' : 'sb-add'}">${inZ === st.addrs.length ? `${ico('minus')} Retirer du secteur` : `${ico('plus')} Ajouter au secteur`}</button>` : ''}
        <div class="chips">${SB && SB.log.length ? `<button class="chip" data-act="sb-undo">${ico('chev-l', 'sm')} Annuler la dernière</button>` : ''}<button class="chip" data-act="sb-cancel">Annuler</button><button class="chip go" data-act="sb-save" ${n ? '' : 'disabled'}>${ico('check', 'sm')} Valider le secteur</button></div>`;
      document.documentElement.style.setProperty('--lasso-h', bar.offsetHeight + 'px');
      return;
    }
    const g = this.lasso.grain !== 'house';
    const what = g ? 'une rue (entière)' : 'une maison';
    const hint = `<b>Clic droit</b> sur ${what} pour l’${m === 'add' ? 'ajouter' : 'enlever'}, clic droit maintenu pour entourer plusieurs maisons. <b>Clic gauche</b> : déplacer la carte. Au doigt : appuyez pour choisir, glissez pour déplacer.`;
    bar.innerHTML = `<p><span class="zdot" style="--c:${ZE.color}"></span> <b>${esc(ZE.name)}</b> · ${n} adresse${n > 1 ? 's' : ''}<br><small>${hint} Cerclées de rouge : sans secteur.</small></p>
      <div class="seg lasso-seg">${[['street', 'Rue entière'], ['house', 'Maison par maison']].map(([v, l]) => `<button data-act="lasso-grain" data-v="${v}" aria-pressed="${(this.lasso.grain !== 'house') === (v === 'street')}">${l}</button>`).join('')}</div>
      <div class="seg lasso-seg">${[['add', 'Ajouter'], ['remove', 'Retirer']].map(([v, l]) => `<button data-act="lasso-mode" data-v="${v}" aria-pressed="${m === v}">${l}</button>`).join('')}</div>
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
    if (this._panning) return; // pendant le déplacement, la couche glisse telle quelle
    if (!this.map || !this.ctx || $('#v-map').hidden || UI.mapMode !== 'map') return;
    const map = this.map, ctx = this.ctx, W = this._w, H = this._h;
    if (!W || !H || !this.canvas.width || !this.canvas.height) return; // pas encore mesurée (carte ouverte juste après un redimensionnement)
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const c = this._c, z = map.getZoom(), sat = this.layer === 'sat', L0 = this.lasso;
    const P = (lat, lon) => map.latLngToContainerPoint([lat, lon]);
    const inView = (p, m = 40) => p.x > -m && p.y > -m && p.x < W + m && p.y < H + m;
    const halo = sat ? 'rgba(0,0,0,.72)' : c.halo, txt = sat ? '#fff' : c.label;
    const zi = zoneIndex(), zs = Role.admin || L0 ? zones() : myZones();
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
      const o = off.getContext('2d'), idx = addrIdx(), rad = clamp(24 / mpp, 4, 16); // la teinte du secteur reste une tache douce, pas un gros pâté
      o.setTransform(this._dpr, 0, 0, this._dpr, 0, 0); o.clearRect(0, 0, W, H);
      for (const zn of zs) { o.fillStyle = Role.admin || L0 ? zn.color : c.red; o.beginPath(); for (const id of zn.addrs || []) { const a = idx.get(id); if (!a) continue; const p = P(a.lat, a.lon); if (!inView(p, rad)) continue; o.moveTo(p.x + rad, p.y); o.arc(p.x, p.y, rad, 0, Math.PI * 2); } o.fill(); }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = sat ? 0.3 : 0.2; ctx.drawImage(off, 0, 0); ctx.restore();
    }
    // Distributeur : ses rues tracées dans la couleur de son secteur
    if (!Role.admin && !L0) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = clamp(9 * Math.pow(2, z - 17), 4, 24); ctx.globalAlpha = sat ? 0.6 : 0.4;
      for (const st of visStreets()) {
        const e = streetRoads().get(st.sk); if (!e) continue;
        ctx.strokeStyle = c.red;
        for (const line of e.lines) { ctx.beginPath(); line.forEach((ll, i) => { const q = P(ll[0], ll[1]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke(); }
      }
      ctx.restore();
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
    const r = z < 13.5 ? 2.6 : z < 15 ? 3.6 : z < 16 ? 4.8 : z < 17 ? 6.2 : z < 17.75 ? 8 : z < 18.5 ? 10 : 12.5;
    this._r = r;
    const f = UI.filter, hits = [], dim = [];
    for (const a of addrs()) {
      if (!L0 && !visibleAddr(a)) continue;
      const p = P(a.lat, a.lon); if (!inView(p, 20)) continue;
      const n = unitsOf(a.id).length, cnt = n > 1 ? addrSt(a.id) : null, st = n > 1 ? null : statusOf(a.id);
      const keep = L0 ? true : mapKeep(a, zi) && (f === 'all' || (cnt ? cnt[f] > 0 : st === f));
      (keep ? hits : dim).push([a, p, st, cnt, n]);
    }
    if (dim.length) { ctx.fillStyle = c.st.todo; ctx.globalAlpha = 0.3; ctx.beginPath(); for (const [, p] of dim) { ctx.moveTo(p.x + r * 0.55, p.y); ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2); } ctx.fill(); ctx.globalAlpha = 1; }
    // Une ombre douce sous les pastilles : elles ressortent sur le plan comme sur la photo
    ctx.save();
    ctx.shadowColor = sat ? 'rgba(0,0,0,.5)' : 'rgba(10,12,16,.45)';
    ctx.shadowBlur = Math.max(2, r * 0.4); ctx.shadowOffsetY = Math.max(1, r * 0.16);
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
      const lw = Math.max(1.6, r * 0.3);
      for (const [, p, st, cnt, n] of hits) {
        ctx.strokeStyle = ring;
        if (!cnt) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = c.st[st]; ctx.fill(); ctx.lineWidth = lw; ctx.stroke(); continue; }
        const R = r + 1.5; let a0 = -Math.PI / 2;
        for (const k of ST_ORDER) { if (!cnt[k]) continue; const a1 = a0 + (cnt[k] / n) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, R, a0, a1); ctx.closePath(); ctx.fillStyle = c.st[k]; ctx.fill(); a0 = a1; }
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.lineWidth = Math.max(2.2, r * 0.3); ctx.stroke();
      }
    }
    ctx.restore(); // fin de l'ombre des pastilles
    if (r >= 6) {
      ctx.font = `800 ${r >= 10 ? 12 : r >= 8 ? 10.5 : 9}px Barlow, system-ui, sans-serif`;
      ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.fillStyle = '#fff';
      for (const [a, p, , cnt, n] of hits) { if (L0 && !ZE.addrs.has(a.id)) continue; const t = cnt && !L0 ? `${a.n}·${n}` : String(a.n); ctx.strokeText(t, p.x, p.y + 0.5); ctx.fillText(t, p.x, p.y + 0.5); }
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
      ctx.setLineDash([6, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = L0.mode === 'remove' ? c.red : ZE.color; ctx.stroke(); ctx.setLineDash([]);
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
  const head = ['Commune', 'Rue', 'Numéro', 'Logement', 'Statut', 'Fait par', 'Date du passage', 'Repasse le', 'Créneau', 'Consigne', 'Occupant', 'Note', 'Secteur', 'Équipe'];
  const rows = [...units()].filter((u) => visibleAddr(u.a)).sort((x, y) => x.a.ci - y.a.ci || sortKey(x.a.street).localeCompare(sortKey(y.a.street), 'fr') || numCmp(x.a, y.a) || x.k - y.k).map((u) => {
    const a = u.a, p = pass(u.id) || {}, st = p.status || 'todo', zid = zi.get(a.id), z = zid ? s.zones[zid] : null;
    return [a.com, a.street, a.num, u.label, STATUS[st].label, names(p.by), p.at && st !== 'todo' ? new Date(p.at).toLocaleString('fr-FR') : '',
      p.rp?.date || '', SLOTS[p.rp?.slot] || '', p.rp?.note || '', p.name || '', p.note || '', z ? z.name : '', z ? names(z.members) : ''];
  });
  const S = stats();
  rows.push([], ['Foyers', S.total], ['Faits', S.visited], ...ST_FILTER.map((k) => [STATUS[k].label, S.st[k]]));
  // Un texte qui commence par = + - @ deviendrait une formule dans Excel : on le neutralise, comme la feuille Google
  const csv = '﻿' + [head, ...rows].map((r) => r.map((v) => { const t0 = String(v ?? ''), t = /^[=+\-@\t\r]/.test(t0) ? "'" + t0 : t0; return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(';')).join('\r\n');
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
      for (const [kind, col] of Object.entries(KIND_COL)) for (const [id, raw] of Object.entries(d[col] || {})) {
        const rec = clean(kind, id, raw), cur = Store.live[col][id];
        if (!rec) continue;
        if (!cur || (cur.u || 0) < (rec.u || 0)) { Store.live[col][id] = rec; items.push({ kind, id, data: rec, updated_at: rec.u || Date.now(), deleted: !!rec.del }); n++; }
      }
      const set = clean('settings', 'main', d.settings);
      if (set && set.u > (Store.live.settings.u || 0)) { Store.live.settings = set; items.push({ kind: 'settings', id: 'main', data: set, updated_at: set.u, deleted: false }); }
      Store.rev++; Store.save(); if (items.length) Sync.enqueueMany(items);
      LS.set(K.welcomed, true); if (Page.cur === 'welcome') Page.close();
      App.changed(); toast(`${n} élément${n > 1 ? 's' : ''} restauré${n > 1 ? 's' : ''}.`);
    } catch (e) { toast('Fichier non reconnu : choisissez une sauvegarde exportée par l’app.'); }
    $('#import-file').value = '';
  };
  r.readAsText(file);
}
/** Efface tous les secteurs et leurs codes. Les pompiers, les adresses et les passages restent. */
function resetZones() {
  const n = zones().length;
  for (const z of zones()) Store.put('zone', z.id, { ...z, del: true });
  PZ = { ...PZ, zid: '', del: false, open: new Set() };
  return n;
}
/** Nouvelle campagne : tous les foyers repassent à « À faire », les équipes et la répartition restent. */
function resetCampaign() {
  Store.put('settings', 'main', { ...Store.s.settings, reset: Date.now() });
  UI.tour = { street: null, near: false, order: 'sides', open: true, cur: null }; saveUI();
}
/** Tout effacer : les passages, les pompiers, les secteurs et les adresses ajoutées à la main. */
function resetAll() {
  resetCampaign();
  for (const z of zones()) Store.put('zone', z.id, { ...z, del: true });
  for (const m of members()) Store.put('member', m.id, { ...m, del: true });
  for (const [id, e] of Object.entries(Store.s.extra)) if (!e.del) Store.put('addr', id, { ...e, del: true });
  for (const [id, b] of Object.entries(Store.s.bld)) if (!b.del) Store.put('bld', id, { ...b, del: true });
  Me.set([]);
}
/** Efface les passages devenus inutiles après une remise à zéro, pour ne pas encombrer le téléphone. */
function prunePassages() {
  const r = +Store.live.settings.reset || 0; if (!r) return;
  let n = 0;
  for (const [id, p] of Object.entries(Store.live.passages)) if ((p.u || 0) <= r) { delete Store.live.passages[id]; n++; }
  if (n) { Store.rev++; Store.save(); }
}
/** Remet ce téléphone à neuf : rien n'est envoyé aux autres. */
function wipePhone() {
  Sync.stop();
  for (const k of Object.values(K)) if (k !== K.theme && k !== K.ver) LS.del(k);
  LS.del(K.me + '.demo');
  Store.live = EMPTY(); Store.demo = null; Store.mode = 'live'; Store.rev++;
  Sync.queue = {}; Sync.code = ''; Sync.since = 0; Sync.sheet = ''; Sync.set('local');
  UI.tour = { street: null, near: false, order: 'sides', open: true, cur: null };
  UI.com = ''; UI.zone = ''; UI.filter = 'all'; UI.street = null; UI.q = '';
}
/** iPhone : icône ajoutée avant le correctif d'affichage. iOS ne relit le style de barre d'état qu'à l'ajout
 *  sur l'écran d'accueil ; signe fiable : la page passe encore sous la barre d'état (marge du haut > 0 en portrait). */
const OldIcon = {
  on: false,
  check() {
    if (navigator.standalone !== true || !matchMedia('(orientation: portrait)').matches) return;
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(p); this.on = p.offsetHeight > 20; p.remove();
  },
  get show() { return this.on && Date.now() - (+LS.get(K.fixLater, 0) || 0) > 864e5; },
};
/** Accueil : tant que ce téléphone n'est pas relié à la feuille de l'équipe, on le dit en grand. */
function linkCard() {
  if (Store.demoOn || !Sync.configured || Sync.code) return '';
  if (!Role.admin && myZones().length) return ''; // il a déjà ses rues : rien à lui demander
  if (Role.admin) return `<section class="card fix-card">
    <div class="card-h"><h2>Relier l’équipe à la feuille</h2></div>
    <p class="muted" style="margin:0 0 12px">Rien n’est encore partagé : la répartition et les passages restent sur ce téléphone. Créez le code de l’équipe, puis faites scanner le QR code aux distributeurs.</p>
    <button class="btn red block" data-act="code-create">${ico('link')} Créer le code et relier la feuille</button>
    <button class="btn ghost block" style="margin-top:8px" data-act="page" data-v="welcome" data-step="join">Une équipe existe déjà ? J’ai son code</button>
  </section>`;
  return `<section class="card fix-card">
    <div class="card-h"><h2>Relier ce téléphone</h2></div>
    <p class="muted" style="margin:0 0 12px">Scannez le QR code du responsable avec l’appareil photo : vos prénoms et vos rues arriveront tout seuls.</p>
    <button class="btn ghost block" data-act="page" data-v="welcome" data-step="join">${ico('link')} J’ai le code de l’équipe</button>
  </section>`;
}
function oldIconCard() {
  if (!OldIcon.show) return '';
  const code = Sync.code, site = (location.host + location.pathname).replace(/\/(index\.html)?$/, '');
  const first = !code
    ? (Role.admin ? '<li>Créez d’abord le code de l’équipe (<b>Réglages › Équipe connectée</b>) : vos secteurs seront à l’abri dans la feuille.</li>' : '')
    : `${Sync.pending ? '<li>Attendez que tout soit envoyé (pastille verte en haut).</li>' : ''}<li>Notez le code de l’équipe : <span class="code-box">${esc(code)}</span></li>`;
  return `<section class="card fix-card">
    <div class="card-h"><h2>Affichage à corriger</h2></div>
    <p class="muted" style="margin:0">Cette icône a été ajoutée avant la mise à jour : iPhone garde un haut flou et une bande vide en bas. Il suffit de la remettre, en 2 minutes.</p>
    <ol>${first}<li>Appui long sur l’icône <b>Calendriers</b> › <b>Supprimer l’app</b>.</li><li>Dans Safari, ouvrez <b>${esc(site)}</b> puis <b>Partager › Sur l’écran d’accueil</b>.</li>${code ? '<li>Ouvrez l’app : <b>« J’ai un code d’équipe »</b>, tapez le code.</li>' : ''}</ol>
    <button class="btn ghost sm" data-act="fix-later">Plus tard</button>
  </section>`;
}
function applyTheme() {
  const t = LS.get(K.theme, 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').content = dark ? '#0B0C0E' : '#15171A';
}
/** Ouvrir le lien amène toujours sur l'écran de démarrage. */
function maybeWelcome() { Page.open('welcome', { step: 'intro' }); }
/** Ce téléphone est-il déjà prêt à servir ? Si oui, l'écran de démarrage propose « Continuer ». */
function phoneReady() {
  if (Store.demoOn) return 'Continuer · mode démo';
  if (Role.admin) return 'Continuer · accès responsable';
  const z = Sector.zone;
  if (z) return `Continuer · ${z.name}`;
  if (Me.team().length && myZones().length) return `Continuer · ${names(Me.team())}`;
  return '';
}
function joinTeam(url, code) {
  if (Store.demoOn) Store.exitDemo();
  const c = code.trim().toUpperCase();
  if (url) setSheetUrl(url);
  if (!Sync.configured) { toast("L'adresse de la feuille est incorrecte : elle commence par https://script.google.com/"); return false; }
  // Rouvrir l'app par le même QR code ne doit rien effacer : c'est la même équipe
  if (c === Sync.code) { LS.set(K.welcomed, true); Sync.start(); return true; }
  setCode(c);
  LS.set(K.welcomed, true);
  return true;
}

// ═════════════════════════ Actions
const A = {
  go: (el) => { if (Page.cur && Page.cur !== 'welcome') A['page-close'](); Sheet.close(); go(el.dataset.v); },
  page: (el) => { Sheet.close(); Page.open(el.dataset.v, { sec: el.dataset.sec, step: el.dataset.step, z: el.dataset.z }); },
  'page-close': () => { if (Page.cur === 'zone') ZE = null; if (Page.cur === 'newzone') SB = null; Page.close(); },
  'sheet-close': () => Sheet.close(),
  reload: () => location.reload(),
  history: () => Page.open('history', {}),
  'me-sheet': () => openMeSheet(),
  'fix-later': () => { LS.set(K.fixLater, Date.now()); App.changed(); },
  'me-toggle': (el) => Me.toggle(el.dataset.v),
  'leave-admin': () => { Role.set('distrib'); if (Page.cur) Page.refresh(); go('home'); toast('Déconnecté de l’accès responsable.'); },
  'logout-step': (el) => Page.set({ logout: el.dataset.v }),
  'leave-team': () => {
    Sync.stop();
    Sync.code = ''; LS.del(K.code); LS.del(K.made); LS.del(K.zone); LS.del(K.since); Sync.since = 0;
    Sync.sheet = ''; LS.del(K.sheet); Sync.set('local');
    Store.rev++; App.changed();
    Page.set({ logout: '' });
    toast('Ce téléphone est détaché de l’équipe. Les données sont toujours là.');
  },
  'share-assign': async () => {
    const txt = shareText();
    if (navigator.share) { try { await navigator.share({ title: 'Répartition des calendriers', text: txt }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(txt); toast('Répartition copiée : collez-la dans le groupe.'); }
    catch (e) { Page.open('share'); }
  },
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
  'lasso-grain': (el) => { MapView.lasso.grain = el.dataset.v; MapView.renderLassoBar(); },
  'lasso-cancel': () => { if (ZE?.toPrep) { ZE = null; MapView.endLasso(false); Page.open('prep'); return; } MapView.endLasso(!!(ZE && (ZE.id || ZE.fromPage))); },
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
  'as-rpdate': (el) => { AS.d.rp.date = el.dataset.v; drawUnitSheet(); },
  'as-slot': (el) => { AS.d.rp.slot = AS.d.rp.slot === el.dataset.v ? '' : el.dataset.v; drawUnitSheet(); },
  'as-by': (el) => { const v = el.dataset.v, by = AS.d.by; AS.d.by = by.includes(v) ? by.filter((x) => x !== v) : [...by, v]; drawUnitSheet(); },
  'as-save': () => asSave(),
  'as-reset': () => { AS.d.status = 'todo'; asSave(); },
  'as-tour': () => { const u = unitIdx().get(AS.id); UI.tour = { ...UI.tour, street: u.a.sk, near: false, cur: u.id }; TD = freshTD(u.id); saveUI(); Sheet.close(); go('tour'); },
  'toast-undo': () => { const t = $('#toast'); t._undo?.(); t._undo = null; t.hidden = true; },
  'st-member': (el) => {
    const sk = el.dataset.sk, st = streetOf(sk); if (!st || !Role.admin) return;
    const t = streetTeamOf(st), id = el.dataset.v, cur = t.shared ? [] : t.members;
    assignStreetToPeople(sk, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]); vibrate(10);
  },
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
  'td-repasse': () => { const o = pass(UI.tour.cur)?.rp; tourSave('repasse', o ? { rp: { date: o.date && o.date > isoDay() ? o.date : '', slot: o.slot || '', note: o.note || '' } } : {}); },
  'td-rpdate': (el) => { TD.rpDate = el.dataset.v; App.changed(); },
  'td-slot': (el) => { TD.rpSlot = TD.rpSlot === el.dataset.v ? '' : el.dataset.v; App.changed(); },
  'td-done': () => tourSave('done'),
  'td-save-later': () => tourSave(TD.status, { rp: TD.rpDate || TD.status === 'repasse' ? { date: TD.rpDate, slot: TD.rpSlot, note: TD.rpNote } : null }),
  'rp-quick': (el) => quickRp(el.dataset.id, el.dataset.v),
  member: (el) => { Sheet.close(); Page.open('member', { id: el.dataset.v }); },
  'mem-color': (el) => { const m = member(el.dataset.id); if (m) Store.put('member', m.id, { ...m, color: el.dataset.v }); },
  'mem-remove': (el) => {
    const m = member(el.dataset.id); if (!m || !Role.admin) return;
    const inZones = zones().filter((z) => (z.members || []).includes(m.id)).map((z) => z.id);
    const wasMine = Me.team().includes(m.id);
    Store.put('member', m.id, { ...m, del: true });
    for (const id of inZones) { const z = Store.s.zones[id]; if (z) Store.put('zone', id, { ...z, members: (z.members || []).filter((x) => x !== m.id) }); }
    if (wasMine) Me.set(Me.team().filter((x) => x !== m.id));
    toast(`${m.name} retiré de la liste. Ses passages restent dans l’historique.`, { ms: 6000, undo: () => {
      Store.put('member', m.id, { ...m, del: false });
      for (const id of inZones) { const z = Store.s.zones[id]; if (z) Store.put('zone', id, { ...z, members: [...new Set([...(z.members || []), m.id])] }); }
      if (wasMine) Me.set([...Me.team(), m.id]);
      toast(`${m.name} est de retour.`);
    } });
  },
  'mem-del-ask': () => Page.set({ confirm: true }),
  'mem-del-no': () => Page.set({ confirm: false }),
  'mem-del': (el) => { const m = member(el.dataset.id); if (!m) return; Store.put('member', m.id, { ...m, del: true }); for (const z of zones()) if ((z.members || []).includes(m.id)) Store.put('zone', z.id, { ...z, members: z.members.filter((x) => x !== m.id) }); Me.set(Me.team().filter((x) => x !== m.id)); Page.close(); toast(`${m.name} a été retiré de la liste.`); },
  // Secteurs
  'zone-new': () => { ZE = newZE(); Page.open('zone'); },
  'zone-edit': (el) => { const z = Store.s.zones[el.dataset.v]; if (z) Page.open('assign', { z: z.id }); },
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
  // Créer un secteur : nom, puis rues touchées sur la carte
  'zone-build': (el) => startBuilder(el?.dataset?.v ? Store.s.zones[el.dataset.v] : null),
  'sb-color': (el) => { if (SB) { SB.color = el.dataset.v; Page.render(false); } },
  'sb-to-map': () => { if (SB) { const i = $('#sb-name'); if (i) SB.name = i.value; builderToMap(); } },
  'sb-add': () => {
    const st = SB && SB.sel && streetOf(SB.sel); if (!st || !ZE) return;
    const added = st.addrs.filter((a) => !ZE.addrs.has(a.id)).map((a) => a.id);
    added.forEach((id) => ZE.addrs.add(id));
    SB.log.push({ sk: st.sk, ids: added, add: true }); SB.sel = null; MapView.selStreet = null;
    vibrate(12); toast(`${st.name} ajoutée · ${pl(added.length, 'maison')}`, { ms: 2200 });
    MapView.renderLassoBar(); MapView.draw();
  },
  'sb-remove': () => {
    const st = SB && SB.sel && streetOf(SB.sel); if (!st || !ZE) return;
    const gone = st.addrs.filter((a) => ZE.addrs.has(a.id)).map((a) => a.id);
    gone.forEach((id) => ZE.addrs.delete(id));
    SB.log.push({ sk: st.sk, ids: gone, add: false }); SB.sel = null; MapView.selStreet = null;
    toast(`${st.name} retirée du secteur.`, { ms: 2200 });
    MapView.renderLassoBar(); MapView.draw();
  },
  'sb-undo': () => {
    const last = SB && SB.log.pop(); if (!last || !ZE) return;
    last.ids.forEach((id) => (last.add ? ZE.addrs.delete(id) : ZE.addrs.add(id)));
    SB.sel = null; MapView.selStreet = null;
    toast(`${streetOf(last.sk)?.name || 'Rue'} : ${last.add ? 'retirée' : 'remise'}.`, { ms: 2000 });
    MapView.renderLassoBar(); MapView.draw();
  },
  'sb-cancel': () => { SB = null; ZE = null; MapView.endLasso(false); go('home'); },
  'sb-save': () => {
    if (!SB || !ZE || !ZE.addrs.size) return;
    const id = SB.id || uid('z'), isNew = !SB.id;
    const cur = Store.s.zones[id] || {};
    saveZone({ id, name: SB.name, color: SB.color, members: cur.members || [], addrs: [...ZE.addrs], order: cur.order ?? zones().length });
    const z = Store.s.zones[id];
    SB = null; ZE = null; MapView.endLasso(false);
    toast(`${z.name} ${isNew ? 'créé' : 'enregistré'} · ${pl(zonesStreets([z]).length, 'rue')}.`, { ms: 4000 });
    Page.open('assign', { z: id });
  },
  // Préparation des secteurs : chaque geste est enregistré tout de suite
  'pz-pick': (el) => { PZ.zid = el.dataset.v; PZ.del = false; PZ.open = new Set(); Page.render(true); },
  'pz-new': () => {
    if (!Role.admin) return;
    const zs = zones(), id = uid('z');
    saveZone({ id, name: `Secteur ${zs.length + 1}`, color: ZONE_COLORS[zs.length % ZONE_COLORS.length], members: [], addrs: [], order: zs.length });
    PZ.zid = id; PZ.del = false; PZ.open = new Set();
    if (Page.cur !== 'prep') Page.open('prep'); else Page.render(true);
    requestAnimationFrame(() => $('#pz-name')?.select());
  },
  'pz-color': (el) => pzPut({ color: el.dataset.v }),
  'pz-map': () => {
    const z = pzZone(); if (!z || !Role.admin) return;
    ZE = { ...newZE(), id: z.id, name: z.name, color: z.color, members: [...(z.members || [])], addrs: new Set(z.addrs || []), order: z.order ?? 0, toPrep: true };
    MapView.startLasso();
  },
  'pz-code': () => { const z = pzZone(); if (z) { const c = newZoneCode(); pzPut({ code: c }); toast(`Code du secteur ${z.name} : ${c}`); } },
  'pz-member': (el) => { const z = pzZone(); if (!z) return; const v = el.dataset.v, cur = z.members || []; pzPut({ members: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }); },
  'pz-street': (el) => {
    const z = pzZone(), st = streetOf(el.dataset.v); if (!z || !st || !Role.admin) return;
    const mine = new Set(z.addrs || []), all = st.addrs.every((a) => mine.has(a.id)), zi = zoneIndex();
    const taken = all ? [] : [...new Set(st.addrs.map((a) => zi.get(a.id)).filter((x) => x && x !== z.id))].map((x) => Store.s.zones[x]?.name).filter(Boolean);
    assignStreetToZone(st.sk, all ? '' : z.id);
    toast(all ? `${st.name} retirée de ${z.name} : ${st.addrs.length} adresses sans secteur.`
      : `${st.name} · ${st.addrs.length} adresses dans ${z.name}${taken.length ? `, reprises à ${taken.join(', ')}` : ''}.`);
  },
  'pz-quick': (el) => {
    const z = pzZone(), st = streetOf(el.dataset.v), m = el.dataset.m; if (!z || !st || !Role.admin) return;
    const keep = new Set((z.addrs || []).filter((id) => !st.addrs.some((a) => a.id === id)));
    for (const a of st.addrs) if (m === 'all' || (m === 'odd' && !a.even) || (m === 'even' && a.even)) keep.add(a.id);
    saveZone({ ...z, addrs: [...keep] });
  },
  'pz-addr': (el) => { const z = pzZone(), id = el.dataset.id; if (!z || !Role.admin) return; if ((z.addrs || []).includes(id)) { Store.put('zone', z.id, { ...z, addrs: z.addrs.filter((x) => x !== id) }); pruneAutoZones(); } else moveAddrToZone(id, z.id); },
  'pz-open': (el) => { const k = el.dataset.v; PZ.open.has(k) ? PZ.open.delete(k) : PZ.open.add(k); $('#pz-list').innerHTML = prepRows(); },
  'pz-com': (el) => { PZ.com = el.dataset.v; Page.render(false); },
  'pz-del': () => { PZ.del = true; Page.render(false); },
  'pz-del-no': () => { PZ.del = false; Page.render(false); },
  'pz-del-yes': () => { const z = pzZone(); if (!z || !Role.admin) return; Store.put('zone', z.id, { ...z, del: true }); PZ = { ...PZ, zid: '', del: false, open: new Set() }; Page.render(true); toast(`Secteur ${z.name} supprimé.`); },
  'codes-gen': () => { if (!Role.admin) return; let n = 0; for (const z of zones()) if (!z.code) { Store.put('zone', z.id, { ...z, code: newZoneCode() }); n++; } toast(`${n} code${n > 1 ? 's' : ''} créé${n > 1 ? 's' : ''}.`); },
  print: () => window.print(),
  'sector-clear': () => { Sector.clear(); toast('Secteur retiré de ce téléphone.'); },
  'auto-open': () => { UI.auto = !UI.auto; App.changed(); },
  'auto-show': () => { UI.auto = true; if (Page.cur) Page.close(); go('team'); setTimeout(() => $('#v-team [data-act="auto-go"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); },
  'auto-k': (el) => { const c = el.dataset.com, k = autoK(); UI.autoK = { ...(UI.autoK || {}), [c]: clamp(k[c] + +el.dataset.v, 1, MAX_K) }; saveUI(); if (Page.cur) Page.render(false); App.changed(); },
  'auto-reset-k': () => { UI.autoK = {}; saveUI(); if (Page.cur) Page.render(false); App.changed(); },
  'auto-com': () => { replaceZones(COMMUNES.map((c) => addrs().filter((a) => a.com === c).map((a) => a.id)), (ids, i) => COMMUNES[i]); UI.auto = false; App.changed(); toast(`${COMMUNES.length} secteurs créés, un par commune. Affectez une équipe à chacun.`); },
  'auto-go': () => {
    const list = villageGroups();
    replaceZonesNamed(list); UI.auto = false; App.changed();
    toast(`${pl(list.length, 'secteur')} créés, d’un seul tenant et rues entières. Attribuez-les à vos équipes.`, { ms: 6000 });
  },
  'unassigned-map': () => { UI.zone = '__none'; UI.filter = 'all'; UI.mapMode = 'map'; saveUI(); Page.close(); go('map'); },
  'unassigned-new': () => { ZE = newZE(); unassigned().forEach((a) => ZE.addrs.add(a.id)); ZE.only = true; Page.open('zone'); },
  'export-csv': () => exportCSV(),
  'export-json': () => { if (Role.admin) exportJSON(); },
  'import-json': () => { if (Role.admin) $('#import-file').click(); },
  'reset-step': (el) => Page.set({ step: el.dataset.v }),
  'reset-campaign': () => {
    if (Store.demoOn) { toast('En mode démo, rien à remettre à zéro.'); return; }
    resetCampaign(); prunePassages();
    Page.close(); go('home');
    toast('Nouvelle campagne : tous les foyers sont à « À faire ».');
  },
  'reset-zones': () => {
    if (!Role.admin) return;
    if (Store.demoOn) { toast('En mode démo, rien à effacer.'); return; }
    const n = resetZones();
    Page.close(); go('home');
    toast(`${n} secteur${n > 1 ? 's' : ''} effacé${n > 1 ? 's' : ''}. Créez la nouvelle répartition, puis réimprimez les billets.`, { ms: 6000 });
  },
  'reset-phone': () => { wipePhone(); Page.close(); go('home'); maybeWelcome(); toast('Ce téléphone a été remis à neuf.'); },
  theme: (el) => { LS.set(K.theme, el.dataset.v); applyTheme(); MapView.restyle(); App.changed(); },
  install: async () => { const p = App.installPrompt; if (!p) return; p.prompt(); try { await p.userChoice; } catch (e) { /* refusé */ } App.installPrompt = null; Page.refresh(); },
  'code-create': () => { if (!Role.admin || Store.demoOn) return; setCode(genCode(), true); App.changed(); Page.cur ? Page.refresh() : Page.open('settings', { sec: 'sync' }); toast('Équipe reliée à la feuille. Faites scanner ce QR code aux distributeurs.', { ms: 5000 }); },
  'share-link': async () => {
    const link = joinLink();
    if (navigator.share) { try { await navigator.share({ title: 'Tournée des calendriers', text: `Rejoins l'équipe des calendriers (code ${Sync.code})`, url: link }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(link); toast('Lien copié.'); } catch (e) { toast(link, { ms: 9000 }); }
  },
  'sync-now': () => { if (!Sync.timer) Sync.start(); else Sync.cycle(); },
  'hist-f': (el) => Page.set({ f: el.dataset.v }),
  'w-step': (el) => Page.set({ step: el.dataset.v }),
  'w-demo': () => { LS.set(K.welcomed, true); Page.close(); A['demo-enter'](); },
  'w-zones-com': () => { A['auto-com'](); A['w-done'](); },
  'w-zones-auto': () => { A['auto-go'](); A['w-done'](); },
  'w-done': () => { LS.set(K.welcomed, true); if (!Role.chosen) Role.set('distrib'); Page.close(); go(Role.admin || Store.demoOn ? 'home' : 'map'); },
};
const FORMS = {
  'add-member': (f) => {
    const list = f.elements.mname.value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!list.length) return;
    const add = list.filter((n) => !members().some((m) => norm(m.name) === norm(n)));
    add.forEach(addMember); f.reset();
    toast(add.length ? `${add.length} personne${add.length > 1 ? 's' : ''} ajoutée${add.length > 1 ? 's' : ''}.` : 'Ces prénoms sont déjà dans la liste.');
  },
  'st-add-member': (f) => {
    const n = f.elements.name.value.trim(); if (!n || !Role.admin) return;
    if (members().some((m) => norm(m.name) === norm(n))) { toast('Ce prénom est déjà dans la liste.'); return; }
    f.elements.name.blur();
    const id = addMember(n), sk = f.dataset.sk, st = streetOf(sk);
    if (st) { const t = streetTeamOf(st); assignStreetToPeople(sk, [...(t.shared ? [] : t.members), id]); }
    f.reset();
  },
  'admin-code': async (f) => { if (await tryAdmin(f.elements.code.value)) { f.reset(); if (Page.cur) Page.close(); go('home'); toast('Accès responsable activé.'); linkTeamIfNeeded(); } },
  'w-create': (f) => {
    const list = f.elements.names.value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    list.forEach(addMember);
    if (zones().length) A['w-done'](); else Page.set({ step: 'zones' });
  },
  'w-code': async (f) => {
    if (!(await tryAdmin(f.elements.code.value))) return;
    LS.set(K.welcomed, true);
    if (!members().length || !zones().length) { Page.set({ step: zones().length ? 'create' : 'zones' }); } else { Page.close(); go('home'); }
    toast('Accès responsable activé.');
    linkTeamIfNeeded(); // en tâche de fond : l'accès ne dépend pas de la feuille
  },
  join: (f) => {
    const n = f.elements.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^SEP[A-Z0-9]{8}$/.test(n)) { toast('Le code d’équipe ressemble à SEP-XXXX-XXXX. Le code d’accès responsable se saisit dans « Je suis le responsable ».'); return; }
    const c = `SEP-${n.slice(3, 7)}-${n.slice(7)}`;
    if (!joinTeam(f.elements.url.value, c)) return;
    if (Page.cur === 'welcome') Page.set({ step: 'who' }); else { Page.refresh(); toast('Équipe rejointe.'); }
  },
  sector: (f) => {
    const up = String(f.elements.code.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Code d'équipe : on relie le téléphone, puis on redemande le code du secteur
    if (/^SEP[A-Z0-9]{8}$/.test(up)) {
      if (!joinTeam(Sync.url(), `SEP-${up.slice(3, 7)}-${up.slice(7)}`)) return;
      f.reset(); if (Page.cur) Page.refresh();
      toast('Équipe rejointe. Saisissez maintenant le code à 4 chiffres de votre secteur.', { ms: 7000 });
      return;
    }
    const c = up.replace(/\D/g, '');
    if (c.length !== 4) { toast(Sync.code ? 'Le code du secteur est un nombre à 4 chiffres (sur le billet du responsable).' : 'Saisissez le code d’équipe SEP-XXXX-XXXX du billet, ou scannez son QR code.'); return; }
    const z = zoneByCode(c);
    if (!z) {
      const dup = zones().filter((x) => x.code === c).length > 1;
      toast(dup ? 'Deux secteurs portent ce code : demandez au responsable de le corriger.'
        : zones().length ? 'Ce code ne correspond à aucun secteur. Vérifiez auprès du responsable.'
        : Sync.state === 'offline' ? 'Pas de réseau : les secteurs ne sont pas encore arrivés. Réessayez dès que le téléphone capte.'
        : 'Les secteurs ne sont pas encore arrivés sur ce téléphone : touchez Synchroniser, puis réessayez.');
      Sync.cycle(); return;
    }
    Sector.set(c); LS.set(K.welcomed, true);
    if (!Role.chosen) Role.set('distrib');
    f.reset();
    toast(`Secteur ${z.name} · ${pl(zonesStreets([z]).length, 'rue')} à faire.`, { ms: 5000 });
    if (Page.cur === 'welcome') { Page.close(); go('map'); } else if (Page.cur) Page.refresh();
  },
  'me-add': (f) => {
    const list = f.elements.mname.value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!list.length) return;
    const ids = list.map((n) => members().find((m) => norm(m.name) === norm(n))?.id || addMember(n));
    Me.set([...Me.team(), ...ids]); f.reset();
    // Volontairement, on n'écrit pas dans le secteur : une copie périmée annulerait la répartition du responsable.
  },
  'sheet-url': async (f) => {
    const url = f.elements.url.value.trim();
    if (!SYNC_URL_OK.test(url)) { toast("Adresse incorrecte : collez l'adresse de synchronisation fournie avec l'app."); return; }
    toast('Vérification du serveur…', { ms: 2000 });
    try {
      // La fonction Supabase ne répond qu'en POST : son adresse est vérifiée par la première synchro.
      if (!/\/rest\/v1\/rpc\//.test(url)) { const res = await fetch(url); const j = await res.json(); if (!j.ok) throw new Error('réponse'); }
      const moved = url !== Sync.url();
      setSheetUrl(url);
      if (moved) { Sync.sheet = ''; LS.del(K.sheet); } // le lien vers la feuille revient avec la première synchro
      if (Sync.code) { if (moved) { Sync.since = 0; LS.del(K.since); Sync.enqueueAll(); } Sync.start(); }
      Page.refresh(); toast(Sync.code ? 'Feuille reliée.' : 'Feuille reliée. Créez maintenant le code de l’équipe.');
    } catch (e) { toast('Le serveur ne répond pas. Vérifiez l’adresse, puis réessayez.'); }
  },
  'assign-people': (f) => {
    const z = Store.s.zones[f.dataset.z]; if (!z || !Role.admin) return;
    const list = f.elements.names.value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    const ids = list.map((n) => members().find((m) => norm(m.name) === norm(n))?.id || addMember(n));
    Store.put('zone', z.id, { ...Store.s.zones[z.id], members: ids, code: z.code || newZoneCode() });
    const z2 = Store.s.zones[z.id];
    if (Page.cur) Page.refresh();
    toast(ids.length ? `${z2.name} · ${names(ids)} · code ${z2.code}` : `${z2.name} · code ${z2.code}`, { ms: 6000 });
  },
  'add-addr': (f) => { addAddress(f.elements.com.value, f.elements.street.value, f.elements.num.value); f.reset(); },
  'reset-all': (f) => {
    if (norm(f.elements.mot.value) !== 'effacer') { toast('Tapez EFFACER pour confirmer.'); return; }
    if (Store.demoOn) { toast('En mode démo, rien à effacer.'); return; }
    resetAll(); prunePassages();
    Page.close(); go('home'); maybeWelcome();
    toast('Tout a été effacé. L’app est revenue à son état d’origine.');
  },
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
  if (t.id === 'sb-name' && SB) { SB.name = t.value; return; }
  if (t.id === 'pz-q') { PZ.q = t.value; $('#pz-list').innerHTML = prepRows(); return; }
  if (t.dataset.bind && AS) {
    const path = t.dataset.bind.split('.');
    if (path.length === 2) AS.d[path[0]][path[1]] = t.value; else AS.d[path[0]] = t.value;
    if (t.dataset.bind === 'rp.date') $$('[data-act="as-rpdate"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === t.value)));
    return;
  }
  if (t.id === 'td-rpnote') TD.rpNote = t.value;
});
document.addEventListener('change', (e) => {
  const t = e.target, ch = t.dataset.change;
  if (ch === 'pz-name') { const z = pzZone(); if (z && Role.admin) Store.put('zone', z.id, { ...z, name: t.value.trim() || 'Secteur' }); }
  else if (ch === 'zone') { UI.zone = t.value; saveUI(); App.changed(); }
  else if (ch === 'com') { UI.com = t.value; saveUI(); App.changed(); MapView.fit(true); }
  else if (ch === 'sort') { UI.sort = t.value; saveUI(); renderStreets(); }
  else if (ch === 'hist-member') Page.set({ m: t.value });
  else if (ch === 'street-zone') {
    const sk = t.dataset.sk, n = assignStreetToZone(sk, t.value); t.blur();
    toast(t.value ? `${streetOf(sk)?.name} · ${n} adresse${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} dans ${Store.s.zones[t.value].name}.` : `${streetOf(sk)?.name} retirée de son secteur.`);
  }
  else if (ch === 'addr-zone') {
    if (!Role.admin) return;
    const id = t.dataset.id, z = t.value;
    if (z) moveAddrToZone(id, z); else { const from = zoneOf(id); if (from) Store.put('zone', from.id, { ...from, addrs: from.addrs.filter((x) => x !== id) }); pruneAutoZones(); }
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
/* Version du format des données. Quand elle change, ce téléphone repart à neuf :
   le modèle n'est plus compatible avec ce qui était enregistré. Jamais pendant une campagne :
   les portes pas encore envoyées seraient perdues. */
const DATA_VERSION = 3;
function migrate() {
  const v = LS.get(K.ver, 0);
  if (v === DATA_VERSION) return false;
  for (const k of Object.values(K)) if (k !== K.theme && k !== K.ver) LS.del(k);
  LS.del(K.me + '.demo');
  LS.set(K.ver, DATA_VERSION);
  Object.assign(Sync, { queue: {}, code: '', since: 0, sheet: '' });
  return v !== 0;
}
/** Efface l'écran de lancement dès que l'app est prête, sans clignotement. */
function hideSplash() {
  const el = document.getElementById('splash'); if (!el) return;
  setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 460); }, Math.max(0, 260 - performance.now()));
}
function boot() {
  applyTheme();
  OldIcon.check();
  const wiped = migrate();
  Store.init();
  prunePassages();
  const h = new URLSearchParams(location.hash.slice(1));
  const join = h.get('join'), zcode = String(h.get('z') || '').replace(/\D/g, '');
  if (join) {
    joinTeam(h.get('s') || '', join);
    if (zcode.length === 4) Sector.set(zcode);
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    if (zcode.length === 4) { Sector.set(zcode); history.replaceState(null, '', location.pathname + location.search); }
    Sync.start();
  }
  go(UI.view || 'home');
  maybeWelcome();
  if (!Role.chosen && !Page.cur) Role.set('distrib');
  if (join && Sync.configured) {
    if (Sector.code) { toast('Équipe rejointe. Voici vos rues.'); Page.close(); go('map'); }
    else { toast('Équipe rejointe : saisissez le code de votre secteur.'); Page.open('welcome', { step: 'secteur' }); }
  }
  else if (wiped) toast('Nouvelle version : l’app est repartie à zéro sur ce téléphone.', { ms: 6000 });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('online', () => Sync.cycle());
  window.addEventListener('offline', () => { if (Sync.timer) Sync.set('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { Sync.cycle(); if (UI.view === 'tour') Wake.on(); } });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); App.installPrompt = e; });
  window.addEventListener('resize', () => { if (MapView.map && UI.view === 'map') { MapView.map.invalidateSize(); MapView.size(); MapView.draw(); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); MapView.restyle(); });
  setInterval(() => { if (isoDay() !== App.day) { App.day = isoDay(); Store.rev++; App.changed(); } }, 60000);
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (t instanceof Element && t.classList.contains('view') && !t.hidden) setScrollShadow(t.scrollTop > 4);
  }, { capture: true, passive: true });
  document.addEventListener('touchstart', () => {}, { passive: true }); // iOS : sans cela, l'effet d'appui ne se déclenche pas
  hideSplash();
}
/** Dernier filet : si le démarrage échoue, l'écran de lancement s'efface et l'erreur est dite. */
function safeBoot() {
  try { boot(); } catch (e) {
    hideSplash();
    document.body.insertAdjacentHTML('beforeend', `<div class="boot-fail"><b>L’application n’a pas démarré</b><p>${esc(String((e && e.message) || e))}</p><button class="btn" data-act="reload">Réessayer</button></div>`);
  }
}
safeBoot();
