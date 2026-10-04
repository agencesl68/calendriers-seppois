/**
 * Tournée des calendriers — Amicale des Sapeurs-Pompiers de Seppois-le-Bas
 * Serveur de synchronisation gratuit : les téléphones de l'équipe envoient et
 * récupèrent leurs passages dans cette feuille Google Sheets.
 *
 * Installation (une seule fois, voir README.md) :
 *   1. Extensions > Apps Script, collez ce fichier, enregistrez.
 *   2. Déployer > Nouveau déploiement > Application Web
 *      Exécuter en tant que : Moi · Qui a accès : Tout le monde.
 *   3. Copiez l'adresse « …/exec » et collez-la dans l'app (Réglages > Équipe connectée).
 *   4. Facultatif : exécutez la fonction « installer » pour que les onglets
 *      « Tableau » et « Bilan » se mettent à jour tout seuls toutes les 10 minutes.
 */

const ONGLET_DONNEES = 'Données';
const ONGLET_REGLAGES = 'Réglages';
const STATUTS = { todo: 'À faire', done: 'Calendrier donné', absent: 'Absent', repasse: 'À repasser', refus: 'Refus' };
const REGLEMENTS = { especes: 'Espèces', cheque: 'Chèque', cb: 'Carte bancaire', autre: 'Wero / virement' };
const CRENEAUX = { matin: 'Matin', midi: 'Midi', aprem: 'Après-midi', soir: 'Soir' };

function doGet() {
  return json_({ ok: true, app: 'tournee-calendriers', now: Date.now(), sheet: SpreadsheetApp.getActive().getUrl() });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_(synchroniser_(req));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function synchroniser_(req) {
  const code = String(req.code || '').trim().toUpperCase();
  if (code.length < 8) throw new Error("Code d'équipe manquant.");
  const items = Array.isArray(req.items) ? req.items.slice(0, 300) : [];
  const since = Number(req.since) || 0;

  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const ss = SpreadsheetApp.getActive();
    const reglages = onglet_(ss, ONGLET_REGLAGES, ['Paramètre', 'Valeur']);
    const connu = String(reglages.getRange('B2').getValue() || '');
    if (!connu) { reglages.getRange('A2:B2').setValues([["Code d'équipe", code]]); }
    else if (connu !== code) throw new Error("Code d'équipe incorrect pour cette feuille.");

    const sh = onglet_(ss, ONGLET_DONNEES, ['Clé', 'Type', 'Id', 'Modifié (ms)', 'Reçu (ms)', 'Supprimé', 'Données']);
    const last = sh.getLastRow();
    const rows = last > 1 ? sh.getRange(2, 1, last - 1, 7).getValues() : [];
    const index = {};
    rows.forEach((r, i) => { index[r[0]] = i; });

    const now = Date.now();
    const nouvelles = [];
    let modifie = false;
    items.forEach((it) => {
      if (!it || !it.kind || it.id == null) return;
      const cle = it.kind + ':' + it.id;
      const maj = Number(it.updated_at) || 0;
      const ligne = [cle, String(it.kind), String(it.id), maj, now, !!it.deleted, JSON.stringify(it.data || {})];
      if (ligne[6].length > 49000) return; // limite d'une cellule Google Sheets
      if (cle in index) {
        const i = index[cle];
        if (Number(rows[i][3]) >= maj) return;
        rows[i] = ligne; modifie = true;
      } else {
        index[cle] = rows.length + nouvelles.length;
        nouvelles.push(ligne);
      }
    });
    if (modifie) sh.getRange(2, 1, rows.length, 7).setValues(rows);
    if (nouvelles.length) sh.getRange(rows.length + 2, 1, nouvelles.length, 7).setValues(nouvelles);
    if (modifie || nouvelles.length) reglages.getRange('A3:B3').setValues([['Dernière modification', now]]);

    const sortie = [];
    rows.concat(nouvelles).forEach((r) => {
      if (Number(r[4]) > since - 5000) {
        let data = {};
        try { data = JSON.parse(r[6] || '{}'); } catch (err) { data = {}; }
        sortie.push({ kind: r[1], id: String(r[2]), updated_at: Number(r[3]), deleted: r[5] === true, data: data });
      }
    });
    return { ok: true, now: now, items: sortie, sheet: ss.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

/** Reconstruit les onglets lisibles « Tableau » (une ligne par logement) et « Bilan ». */
function mettreAJourTableau() {
  const ss = SpreadsheetApp.getActive();
  const reglages = onglet_(ss, ONGLET_REGLAGES, ['Paramètre', 'Valeur']);
  const derniere = Number(reglages.getRange('B3').getValue()) || 0;
  const faite = Number(reglages.getRange('B4').getValue()) || 0;
  if (faite && faite >= derniere) return;

  const sh = ss.getSheetByName(ONGLET_DONNEES);
  if (!sh || sh.getLastRow() < 2) return;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  const membres = {}, secteurs = {}, passages = [];
  const zoneDe = {};
  rows.forEach((r) => {
    let d = {};
    try { d = JSON.parse(r[6] || '{}'); } catch (err) { return; }
    if (r[1] === 'member' && !d.del) membres[r[2]] = d.name;
    if (r[1] === 'zone' && !d.del) { secteurs[r[2]] = d.name; (d.addrs || []).forEach((a) => { zoneDe[a] = d.name; }); }
    if (r[1] === 'passage') passages.push({ id: String(r[2]), d: d });
  });

  const tableau = [['Commune', 'Rue', 'N°', 'Logement', 'Statut', 'Calendriers', 'Montant (€)', 'Règlement', 'N° chèque', 'Fait par', 'Date', 'Repasse prévue', 'Note', 'Secteur']];
  const bilan = { total: 0, cal: 0, statut: {}, reglement: {}, commune: {}, membre: {} };
  passages.forEach((p) => {
    const d = p.d, l = d._l || {}, statut = d.status || 'todo';
    if (statut === 'todo' && !(d.hist || []).length) return;
    const par = (d.by || []).map((id) => membres[id] || '?').join(' + ');
    const donne = statut === 'done';
    const montant = donne ? Number(d.amt) || 0 : 0;
    tableau.push([
      l.com || '', l.rue || '', l.num || '', l.lg || '', STATUTS[statut] || statut,
      donne ? Number(d.cal) || 0 : '', donne ? montant : '', donne ? (REGLEMENTS[d.pay] || '') : '', d.chq || '',
      par, d.at ? new Date(d.at) : '',
      d.rp && d.rp.date ? d.rp.date + (d.rp.slot ? ' (' + (CRENEAUX[d.rp.slot] || d.rp.slot) + ')' : '') : '',
      [d.note, d.rp && d.rp.note].filter(function (x) { return !!x; }).join(' / '), zoneDe[p.id.split('~')[0]] || '',
    ]);
    bilan.statut[STATUTS[statut] || statut] = (bilan.statut[STATUTS[statut] || statut] || 0) + 1;
    if (donne) {
      bilan.total += montant; bilan.cal += Number(d.cal) || 0;
      const r = REGLEMENTS[d.pay] || 'Autre'; bilan.reglement[r] = (bilan.reglement[r] || 0) + montant;
      const c = l.com || '?'; bilan.commune[c] = (bilan.commune[c] || 0) + montant;
      const by = d.by || []; by.forEach((id) => { const n = membres[id] || '?'; bilan.membre[n] = (bilan.membre[n] || 0) + montant / by.length; });
    }
  });
  tableau.splice(1, tableau.length - 1, ...tableau.slice(1).sort((a, b) => String(a[0] + a[1]).localeCompare(String(b[0] + b[1]), 'fr') || (parseInt(a[2], 10) || 0) - (parseInt(b[2], 10) || 0)));

  const t = ss.getSheetByName('Tableau') || ss.insertSheet('Tableau', 0);
  t.clear();
  t.getRange(1, 1, tableau.length, tableau[0].length).setValues(tableau);
  t.getRange(1, 1, 1, tableau[0].length).setFontWeight('bold').setBackground('#15171A').setFontColor('#FFFFFF');
  t.setFrozenRows(1);
  if (tableau.length > 1) {
    t.getRange(2, 7, tableau.length - 1, 1).setNumberFormat('#,##0.00 €');
    t.getRange(2, 11, tableau.length - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  }

  const b = ss.getSheetByName('Bilan') || ss.insertSheet('Bilan', 1);
  b.clear();
  const lignes = [['Bilan de la tournée', ''], ['Mis à jour le', new Date()], ['', ''], ['Total collecté', bilan.total], ['Calendriers remis', bilan.cal], ['', ''], ['Par statut', '']];
  Object.keys(bilan.statut).forEach((k) => lignes.push([k, bilan.statut[k]]));
  lignes.push(['', ''], ['Par règlement', '']);
  Object.keys(bilan.reglement).forEach((k) => lignes.push([k, bilan.reglement[k]]));
  lignes.push(['', ''], ['Par commune', '']);
  Object.keys(bilan.commune).sort().forEach((k) => lignes.push([k, bilan.commune[k]]));
  lignes.push(['', ''], ['Par pompier (part du binôme)', '']);
  Object.keys(bilan.membre).sort((x, y) => bilan.membre[y] - bilan.membre[x]).forEach((k) => lignes.push([k, Math.round(bilan.membre[k] * 100) / 100]));
  b.getRange(1, 1, lignes.length, 2).setValues(lignes);
  b.getRange('A1').setFontWeight('bold').setFontSize(14);
  b.getRange('B2').setNumberFormat('dd/MM/yyyy HH:mm');
  b.setColumnWidth(1, 260);

  reglages.getRange('A4:B4').setValues([['Tableau mis à jour', Date.now()]]);
}

/** À exécuter une fois : mise à jour automatique des onglets Tableau et Bilan toutes les 10 minutes. */
function installer() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'mettreAJourTableau') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('mettreAJourTableau').timeBased().everyMinutes(10).create();
  mettreAJourTableau();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Calendriers')
    .addItem('Mettre à jour le tableau maintenant', 'forcerTableau')
    .addItem('Activer la mise à jour automatique', 'installer')
    .addToUi();
}

function forcerTableau() {
  const reglages = onglet_(SpreadsheetApp.getActive(), ONGLET_REGLAGES, ['Paramètre', 'Valeur']);
  reglages.getRange('A4:B4').setValues([['Tableau mis à jour', 0]]);
  mettreAJourTableau();
}

function onglet_(ss, nom, entetes) {
  let sh = ss.getSheetByName(nom);
  if (!sh) {
    sh = ss.insertSheet(nom);
    sh.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
