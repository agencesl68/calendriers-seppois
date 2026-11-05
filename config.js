// Synchronisation d'équipe (gratuite) : adresse du serveur de synchronisation.
// Serveur actuel : fonction Supabase « cal_sync » (projet VSAV). Les données de l'équipe
// sont rangées dans la table cal_items, cloisonnées par code d'équipe.
// L'ancien serveur Google Apps Script (…/exec) reste accepté si vous en remettez un un jour.
// Vous pouvez aussi coller une autre adresse dans l'app : Réglages › Équipe connectée.
// Code d'accès responsable : seule son empreinte (PBKDF2-SHA256) est publiée ici. Pour le changer : voir README.md.
// shortcut: sépare les deux interfaces, ce n'est pas une sécurité (4 chiffres retrouvables depuis l'empreinte publique,
// contrôle fait sur le téléphone) ; vérifier le rôle côté serveur si un jour l'accès responsable doit être protégé.
window.CAL_CONFIG = {
  adminHash: 'pbkdf2$150000$S65+c7mM6QRXDd1qNOLYSQ==$auTHr4/VwB4DOSQ85ynuVjtKVqWffBP712vHyXBB/c0=',
  sheetUrl: 'https://cexieeoufbsudsfejjqk.supabase.co/rest/v1/rpc/cal_sync',
  // Clé publique Supabase (prévue pour être publiée). Elle ne donne accès à rien seule :
  // la table est fermée, et la fonction n'ouvre que les données du code d'équipe fourni.
  syncKey: 'sb_publishable_gG1-PXVn1pPyMHSL6abb2A_XovDslWF',
};
