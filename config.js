// Synchronisation d'équipe (facultative, gratuite) : adresse de l'application Web Google Apps Script
// rattachée à votre feuille Google Sheets (elle finit par /exec). Voir README.md.
// Vous pouvez aussi la coller directement dans l'app : Réglages › Équipe connectée.
// Code d'accès responsable : seule son empreinte (PBKDF2-SHA256) est publiée ici. Pour le changer : voir README.md.
// shortcut: sépare les deux interfaces, ce n'est pas une sécurité (4 chiffres retrouvables depuis l'empreinte publique,
// contrôle fait sur le téléphone) ; vérifier le rôle côté Apps Script si un jour l'accès responsable doit être protégé.
window.CAL_CONFIG = {
  adminHash: 'pbkdf2$150000$S65+c7mM6QRXDd1qNOLYSQ==$auTHr4/VwB4DOSQ85ynuVjtKVqWffBP712vHyXBB/c0=',
  sheetUrl: 'https://script.google.com/macros/s/AKfycbxZDbR-oOswPdjuYc4nY7Zhecu4p0FVvQwgkQ6ZS0fJopE8OMQoQ3dYQwknfl_peBlz/exec',
};
