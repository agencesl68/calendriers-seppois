# Tournée des calendriers

Application web de l'**Amicale des Sapeurs-Pompiers de Seppois-le-Bas** pour la vente des calendriers en porte-à-porte, sur les 5 communes du secteur : **Seppois-le-Bas, Largitzen, Mooslargue, Pfetterhouse et Ueberstrass**. Elle s'installe sur le téléphone comme une vraie app, fonctionne **sans réseau** et ne coûte rien.

## Ce que fait l'app

- **1 522 adresses déjà chargées** (Base Adresse Nationale), réparties dans 120 rues, côté pair et côté impair.
- **Appartements** : une adresse peut contenir plusieurs logements (« Plusieurs logements » sur la fiche). Chaque logement a son statut, son montant et ses repasses, avec un repère facultatif (ex. « 1er étage gauche »).
- **Statut par foyer** : à faire, calendrier donné, absent, à repasser, refus.
- **Carte des 5 villages incluse dans l'app** (rues, bâtiments, rivières) : chaque adresse est une pastille colorée, découpée en parts pour les immeubles. Filtres par statut, commune et secteur, vue satellite IGN, position GPS.
- **Secteurs**, pour qu'aucune maison ne soit oubliée :
  - **par rue** : cocher une rue entière, un côté (pair ou impair) ou des maisons précises ;
  - **en entourant au doigt** sur la carte (ajouter, retirer, toucher une maison pour l'ajouter ou l'enlever) ;
  - **automatique** : un secteur par commune, ou un découpage équilibré qui garde les rues entières ;
  - une maison n'appartient qu'à **un seul** secteur ;
  - le compteur **« adresses sans secteur »** et la page pour les ranger rue par rue garantissent que tout est couvert.
- **Mode tournée** : grande plaque de numéro, boutons géants (donné / absent / repasse / refus), montant en un geste, puis le foyer suivant s'affiche tout seul (un côté de la rue puis l'autre, logements compris). Mode « autour de moi » au GPS. L'écran reste allumé.
- **Repasses** : date, créneau et consigne ; agenda jour par jour, retards en rouge, itinéraire du jour sur la carte.
- **Qui a fait quoi** : chaque passage est attribué au pompier ou au binôme ; fiche par membre avec ses rues et ses maisons ; classement.
- **Tableau de bord** : total collecté, objectif, calendriers, moyenne par calendrier, foyers visités, avancement par commune et par secteur, règlements (espèces, chèque, CB, Wero), collecte des 14 derniers jours, historique.
- **Export pour le trésorier** (CSV pour Excel) et sauvegarde complète.
- **Mode démo** avec des données fictives pour présenter l'app à l'amicale.

## 1. Mettre l'app en ligne sur GitHub Pages (gratuit)

1. Créez un dépôt sur GitHub, par exemple `calendriers-seppois`. Pour que GitHub Pages soit gratuit, le dépôt doit être **public**. Le code ne contient aucune donnée de l'équipe, seulement les adresses publiques des villages.
2. Envoyez tout le contenu de ce dossier à la racine du dépôt.
3. Sur GitHub, ouvrez **Settings → Pages**. Dans **Source**, choisissez **Deploy from a branch**, la branche `main` et le dossier `/ (root)`, puis **Save**.
4. Au bout d'une minute, l'app est en ligne : `https://<votre-compte>.github.io/calendriers-seppois/`.

Sans autre réglage, l'app marche déjà, mais chaque téléphone garde ses propres données.

## 2. Rassembler les données de toute l'équipe dans Google Sheets (gratuit)

Toutes les données sont réunies dans **une feuille Google Sheets de votre Drive**. Pas d'abonnement, pas d'opérations comptées. Le chef d'équipe fait cette mise en place une seule fois, en 5 minutes.

1. Ouvrez **[sheets.new](https://sheets.new)** et nommez la feuille, par exemple « Calendriers 2027 ».
2. Menu **Extensions → Apps Script**. Effacez le contenu, collez tout le fichier [`google-apps-script/Code.gs`](google-apps-script/Code.gs), puis enregistrez (icône disquette).
3. Cliquez sur **Déployer → Nouveau déploiement**. Avec la roue dentée, choisissez le type **Application Web**, puis réglez :
   - **Exécuter en tant que** : Moi
   - **Qui a accès** : Tout le monde
4. Cliquez sur **Déployer**, puis **Autoriser l'accès** et choisissez votre compte Google. Si Google affiche « Application non validée », cliquez sur **Paramètres avancés**, puis **Accéder à … (non sécurisé)**. C'est votre propre script.
5. Copiez l'**URL de l'application Web**, celle qui finit par `/exec`.
6. Dans l'app, ouvrez **Réglages → Équipe connectée**, collez l'adresse, puis **Relier** et **Créer le code de l'équipe**. Un code `SEP-XXXX-XXXX` et un **QR code** s'affichent.
7. Les autres pompiers scannent ce QR code avec l'appareil photo de leur téléphone. L'app s'ouvre déjà reliée à l'équipe ; ils choisissent leur nom et c'est parti.

**Facultatif** : dans Apps Script, choisissez la fonction `installer` puis **Exécuter**. Deux onglets lisibles apparaissent dans la feuille et se mettent à jour toutes les 10 minutes :

- **Tableau** : une ligne par foyer visité (commune, rue, n°, logement, statut, montant, règlement, n° de chèque, fait par, date, repasse, secteur) ;
- **Bilan** : total collecté, puis répartition par statut, par règlement, par commune et par pompier.

Le menu **Calendriers** de la feuille permet aussi de les mettre à jour à la demande.

Les téléphones se synchronisent toutes les 20 secondes quand l'app est ouverte. Sans réseau, les passages sont gardés et envoyés au retour du réseau. La feuille n'accepte que le code de votre équipe, et son adresse n'est connue que de vos téléphones.

## 3. Installer l'app sur le téléphone

- **iPhone** : ouvrez le lien dans Safari, touchez **Partager**, puis **Sur l'écran d'accueil**.
- **Android** : ouvrez le lien dans Chrome, menu **⋮**, puis **Installer l'application**.

## 4. Publier une mise à jour

Avant d'envoyer les fichiers modifiés sur GitHub, changez la valeur de `VERSION` en haut de [`sw.js`](sw.js), par exemple `cal-2026-11-02a`. Pour une nouvelle version du script Google, ouvrez **Déployer → Gérer les déploiements**, cliquez sur le crayon, choisissez **Nouvelle version**, puis **Déployer**. L'adresse `/exec` reste la même.

## Vie privée

Le nom de l'occupant est **facultatif** : ne le notez que si c'est utile (reçu, donateur fidèle). Les données restent dans les téléphones et dans votre feuille Google. À la fin de la campagne, effacez les noms dans la feuille.

## Sources et licences

- Adresses : [Base Adresse Nationale](https://adresse.data.gouv.fr), Licence Ouverte 2.0.
- Plan des villages : © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), licence ODbL.
- Photo aérienne : © IGN, Géoplateforme.
- Bibliothèques : [Leaflet](https://leafletjs.com) (BSD-2) et [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure de l'app et icônes |
| `styles.css` | Apparence (thèmes clair et sombre) |
| `app.js` | Toute la logique : tournée, carte, secteurs, repasses, équipe, synchronisation |
| `data.js` | Adresses des 5 communes et plan des villages (générés depuis la BAN et OpenStreetMap) |
| `config.js` | Adresse du script Google (facultatif, on peut aussi la coller dans l'app) |
| `google-apps-script/Code.gs` | Serveur gratuit à coller dans la feuille Google Sheets |
| `sw.js` | Fonctionnement hors ligne |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |
| `vendor/` | Bibliothèques incluses (rien à installer) |
