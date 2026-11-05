# Tournée des calendriers

Application web de l'**Amicale des Sapeurs-Pompiers de Seppois-le-Bas** pour organiser la distribution des calendriers en porte-à-porte, sur les 5 communes du secteur : **Seppois-le-Bas, Largitzen, Mooslargue, Pfetterhouse et Ueberstrass**. Elle sert à **répartir les rues entre les équipes** et à suivre l'avancement. Elle s'installe sur le téléphone comme une vraie app, fonctionne **sans réseau** et ne coûte rien. Elle ne gère aucun montant : seulement qui fait quelles rues, et où ça en est.

## Deux accès

| | **Responsable** | **Distributeur** |
| --- | --- | --- |
| Pour qui | Ceux qui répartissent les rues | Tous ceux qui font les portes |
| Comment | Code d'accès responsable | Un seul code : celui du billet |
| Ce qu'il fait | Voit toute la carte en direct, prépare les secteurs, imprime les billets | Voit seulement les rues de son secteur (en rouge) et note à chaque porte « Calendrier donné » ou « À repasser » |

Ouvrir le lien amène toujours sur l'**écran de démarrage** : blason, choix de l'accès, et un bouton **Continuer** quand le téléphone est déjà réglé.

À la première ouverture, le responsable touche **Je suis le responsable** et entre le code d'accès : son téléphone relie alors l'équipe à la feuille Google. L'app propose ensuite une **répartition de départ** : un secteur par commune, ou un découpage équilibré en 2 à 12 secteurs (les rues restent entières). Il n'y a plus qu'à ajuster et à nommer les équipes.

Un distributeur n'a qu'une chose à faire : **saisir le code du billet**. L'écran de démarrage lui propose « J'ai un code · je distribue », un seul champ, puis la carte de ses rues s'affiche et il part porte après porte (n° 1, n° 2…). S'il scanne le QR code du billet, l'app s'ouvre déjà reliée et il n'a plus que les 4 chiffres à saisir ; sinon il peut taper le code d'équipe `SEP-XXXX-XXXX` du billet dans le même champ. Il ne voit ni la répartition, ni les autres secteurs. Pour passer responsable : **Réglages › Sur ce téléphone**, puis le code d'accès.

## Préparer les secteurs

Tout se prépare à l'avance, sur un ordinateur ou sur le téléphone. Accès responsable (code à 4 chiffres), puis deux boutons sur l'accueil :

### 1. Créer un secteur

1. **Créer un secteur** → on saisit son **nom** : « Seppois nord », « Seppois sud », « Mooslargue »…
2. **Choisir les rues sur la carte** → la carte s'ouvre. On se déplace (clic gauche maintenu, molette pour zoomer), on **touche une rue** : son nom et son nombre de maisons s'affichent.
3. **Ajouter au secteur** → la rue entière entre dans le secteur. On recommence rue après rue. « Annuler la dernière » corrige une erreur.
4. **Valider le secteur** → le secteur est enregistré, avec son **code à 4 chiffres**.

### 2. Attribuer les secteurs

**Attribuer les secteurs** → on touche un secteur, on saisit les **noms et prénoms** des pompiers (un par ligne), on enregistre : l'app affiche le **code** du secteur et son **QR code**.

**Imprimer les billets** sort une page par secteur (nom, code, QR code, liste des rues), à découper et à distribuer.

### 3. Le jour de la tournée

Le distributeur ouvre le lien, touche **J'ai un code · je distribue** et saisit le code du billet — ou scanne simplement son QR code. Il voit alors la carte de **ses** rues et fait ses portes, n° 1, n° 2… Il ne voit ni la répartition, ni les autres secteurs.

Le code du secteur sert à savoir **quelles rues afficher** ; ce n'est pas un mot de passe. Ce qui protège les données, c'est la feuille Google gardée privée et le code d'équipe donné aux seuls pompiers.

## Ce que fait l'app

- **1 521 adresses déjà chargées** (Base Adresse Nationale), réparties dans 120 rues, côté pair et côté impair.
- **Répartition des rues**, le cœur de l'app, pour qu'aucune maison ne soit oubliée :
  - **par rue** : cocher une rue entière, un côté (pair ou impair) ou des maisons précises ;
  - **sur la carte** : toucher une rue pour l'ajouter ou la retirer entière, ou entourer des maisons au doigt ;
  - **automatique** : un secteur par commune, ou des quartiers par village — vous choisissez le nombre de secteurs village par village, l'app découpe en blocs d'un seul tenant (nord, est, sud, ouest), rues entières et foyers équilibrés ;
  - une maison n'appartient qu'à **un seul** secteur ;
  - le compteur **« adresses sans équipe »** et la page pour les ranger rue par rue garantissent que tout est couvert ;
  - **Partager** copie la répartition en texte, prête à coller dans le groupe de l'amicale.
- **Un code à 4 chiffres par secteur** : l'équipe le saisit une fois et ne voit plus que ses rues. Billets à imprimer (code + QR code + liste des rues) dans **Codes à distribuer**.
- **Liste des pompiers** : ajout par copier-coller (un prénom par ligne), retrait d'un seul geste avec annulation possible ; les passages déjà faits restent dans l'historique.
- **Équipes de 2 ou 3** : chaque secteur est confié à une équipe ; chacun voit « Mes rues » et ce qu'il y reste à faire.
- **Statut par foyer** : à faire, calendrier donné, absent, à repasser, refus.
- **Appartements** : une adresse peut contenir plusieurs logements, chacun avec son statut et ses repasses, et un repère facultatif (ex. « 1er étage gauche »).
- **Carte des 5 villages incluse dans l'app** (rues, bâtiments, rivières) : chaque adresse est une pastille colorée, découpée en parts pour les immeubles. Filtres par statut, commune et secteur, vue satellite IGN, position GPS. Toucher une rue ouvre sa fiche.
- **Mode tournée** : grande plaque de numéro, quatre boutons géants, **un seul geste par porte**, puis le foyer suivant s'affiche tout seul (un côté de la rue puis l'autre, logements compris). Mode « autour de moi » au GPS. L'écran reste allumé.
- **Repasses** : date, créneau et consigne ; agenda jour par jour, retards en rouge, itinéraire du jour sur la carte.
- **Qui a fait quoi** : chaque passage est attribué à toute l'équipe ; fiche par pompier avec ses rues et ses maisons.
- **Avancement** : foyers faits et restants, par commune, par secteur, passages des 14 derniers jours, historique.
- **Recherche d'adresse** : tapez « 12 bâle » dans l'onglet Rues pour tomber directement sur le bon foyer.
- **Export** (CSV pour Excel) : un foyer par ligne, avec son statut, son secteur, son équipe et ses repasses.
- **Tous les téléphones** : de l'iPhone SE aux grands Android, à la verticale comme à l'horizontale, en thème clair ou sombre, avec des boutons dimensionnés pour le doigt et un repli pour les navigateurs plus anciens.
- **Mode démo** avec des données fictives pour présenter l'app à l'amicale.

## Remettre à zéro

Dans **Réglages → Remettre à zéro**, quatre niveaux :

| | Ce que ça efface | Ce que ça garde | Qui |
| --- | --- | --- | --- |
| **Nouvelle campagne** | Tous les statuts, les repasses, l'historique | Les pompiers, les secteurs, la répartition | Responsable |
| **Effacer les secteurs** | Les secteurs et leurs codes | Les pompiers, les adresses, tous les passages | Responsable |
| **Tout effacer** | Tout, y compris pompiers et secteurs | Les 1 521 adresses du secteur | Responsable |
| **Effacer ce téléphone** | Les données de ce téléphone, son secteur, et le détache de l'équipe | Ce que les autres téléphones ont | Tout le monde |

Pour se déconnecter : **Réglages › Se déconnecter** — quitter l'accès responsable, ou détacher le téléphone de l'équipe (rien n'est effacé, on rejoint avec le code de l'équipe).

Les trois premières valent **pour toute l'équipe** : tous les téléphones suivent à la synchro suivante. L'app propose une sauvegarde avant d'effacer, et « Tout effacer » demande de taper le mot EFFACER.

**Chaque année**, avant de recommencer : *Nouvelle campagne*. Vous repartez de zéro en gardant vos équipes et votre découpage des rues.

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

- **Tableau** : une ligne par foyer visité (commune, rue, n°, logement, statut, fait par, date, repasse, consigne, secteur, équipe) ;
- **Répartition** : qui fait quel secteur, puis les foyers par statut, par commune et par pompier.

Le menu **Calendriers** de la feuille permet aussi de les mettre à jour à la demande.

Les téléphones se synchronisent toutes les 20 secondes quand l'app est ouverte. Sans réseau, les passages sont gardés et envoyés au retour du réseau. La feuille n'accepte que le code de votre équipe. L'adresse du script, elle, est publique (dans `config.js`) : gardez donc la feuille en accès **Limité** (voir Vie privée) et le code d'équipe pour vous.

## 3. Installer l'app sur le téléphone

- **iPhone** : ouvrez le lien dans Safari, touchez **Partager**, puis **Sur l'écran d'accueil**.
- **Android** : ouvrez le lien dans Chrome, menu **⋮**, puis **Installer l'application**.

## 4. Publier une mise à jour

Avant d'envoyer les fichiers modifiés sur GitHub, changez la valeur de `VERSION` en haut de [`sw.js`](sw.js), par exemple `cal-2026-11-02a`. Pour une nouvelle version du script Google, ouvrez **Déployer → Gérer les déploiements**, cliquez sur le crayon, choisissez **Nouvelle version**, puis **Déployer**. L'adresse `/exec` reste la même.

## Vie privée

Le nom de l'occupant est **facultatif** : ne le notez que si c'est utile pour repasser. Les données restent dans les téléphones et dans votre feuille Google. **Gardez la feuille privée** (Partager › Accès général : *Limité*) : le script la lit pour vous, personne d'autre n'a besoin du lien. À la fin de la campagne, effacez les noms dans la feuille.

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
| `app.js` | Toute la logique : répartition, tournée, carte, repasses, accès, synchronisation |
| `data.js` | Adresses des 5 communes et plan des villages (générés depuis la BAN et OpenStreetMap) |
| `config.js` | Adresse du script Google (facultatif, on peut aussi la coller dans l'app) |
| `google-apps-script/Code.gs` | Serveur gratuit à coller dans la feuille Google Sheets |
| `sw.js` | Fonctionnement hors ligne |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |
| `vendor/` | Bibliothèques incluses (rien à installer) |
