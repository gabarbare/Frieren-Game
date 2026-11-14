# 🪄 Frieren Tactics

Jeu de **stratégie au tour par tour en ligne** (2 joueurs sur 2 ordinateurs) inspiré de
l'univers de *Frieren* (saisons 1 et 2 uniquement). Constitue ton équipe de 4 personnages,
affronte ton adversaire sur un plateau à cases semé d'obstacles, et améliore tes héros
match après match grâce aux pièces gagnées.

## Lancer le jeu

Il faut [Node.js](https://nodejs.org) (version 16 ou plus) sur l'ordinateur qui héberge la partie.

```bash
npm install
npm start
```

Le serveur démarre sur `http://localhost:3000`.

### Jouer à deux

- **Sur le même réseau (Wi-Fi/box)** : l'hôte lance le serveur, puis les deux joueurs
  ouvrent `http://<IP-de-l'hôte>:3000` dans leur navigateur (l'IP se trouve avec
  `ipconfig` sous Windows ou `ip addr` sous Linux/macOS). Pense à autoriser le port 3000
  dans le pare-feu de l'hôte.
- **Un seul PC pour tester** : ouvre deux onglets sur `http://localhost:3000`.
- **À distance par Internet** : il faut exposer le port 3000 de l'hôte toi-même
  (redirection de port sur ta box, ou hébergement du projet sur un service en ligne).

### Déroulement d'une partie

1. Chaque joueur entre son nom. L'un **crée une partie** (un code à 4 lettres est généré),
   l'autre **rejoint** avec ce code.
2. L'hôte choisit la **carte de combat**, chacun choisit **4 personnages** en secret puis se déclare prêt.
3. Combat au tour par tour : à ton tour, déplace et fais agir chacune de tes unités
   (déplacement puis une capacité). Le premier joueur qui élimine les 4 personnages
   adverses gagne.
4. Le vainqueur gagne des **pièces** (120 + 15 par survivant, 40 pour le perdant) pour
   faire monter ses personnages jusqu'au **niveau 5** (+ PV, + ATQ, + DÉF, + VIT).

## Règles du combat

- **Plateau de 13×9 cases.** Rochers et murs bloquent déplacement *et* projectiles ;
  eau et arbres bloquent seulement le déplacement. Les attaques à distance ont besoin
  d'une ligne de vue dégagée.
- **Statistiques** : PV (points de vie), ATQ (dégâts), DÉF (réduit les dégâts),
  VIT (cases de déplacement par tour).
- **Dégâts** : `ATQ × puissance de la capacité`, réduits par la défense, puis absorbés
  par les boucliers éventuels.
- Chaque unité peut **se déplacer puis utiliser une capacité** (ou l'inverse : agir sans bouger).
  Une unité qui a agi est terminée pour le tour.

## Les personnages (19)

| Personnage | Rôle | Capacités | Passif |
|---|---|---|---|
| Frieren | Mage | Zoltraak · Barrière runique | Recharges réduites de 1 tour |
| Fern | Mage | Zoltraak · Frappe concentrée | +20% dégâts si elle n'a pas bougé |
| Stark | Guerrier | Coup de hache · Foudre d'Eisen (étourdit) | 1ʳᵉ attaque subie par tour -25% |
| Heiter | Prêtre | Soin · Bénédiction (+30% ATQ) | Soins +30% |
| Himmel | Héros | Épée du héros · Fente éclair | Alliés adjacents +15% dégâts |
| Eisen | Guerrier | Coup de hache · Hache tourbillon (zone) | Subit -20% de dégâts |
| Sein | Prêtre | Soin · Soin de groupe | Régén. 5 PV des alliés adjacents |
| Kraft | Guerrier | Frappe bénie · Gardien | Régénère 8 PV par tour |
| Aura | Démon | Lame démoniaque · Auserlese (contrôle) | +25% dégâts sur cibles affaiblies |
| Lügner | Démon | Aiguilles de sang · Œil maléfique | Ignore 50% de la DÉF adverse |
| Denken | Mage | Zoltraak · Mur de terre (zone) | Immunisé aux étourdissements |
| Übel | Mage | Lame invisible | +30% sur cibles déjà blessées par elle |
| Wirbel | Mage | Rafale de mana · Vortex (attire) | +1 de portée sur tout |
| Land | Mage | Zoltraak · Clone | Annule la 1ʳᵉ attaque de chaque tour |
| Methode | Mage | Zoltraak · Contrôle mental (étourdit) | +20% sur cibles étourdies |
| Sense | Mage | Fouet d'acier (portée 5) · Piège | -25% dégâts au corps à corps |
| Flamme | Mage | Zoltraak primordial · Flamme sacrée | Ignore 25% de la DÉF adverse |
| Macht | Démon | Zoltraak d'or · Diagoldze (anti-soin) | Immunisé étourdissement, -10% dégâts |
| Solitär | Démon | Zoltraak pur · Explosion de mana (zone) | +10% ATQ par allié mort |

## Les cartes

- **Plaines du Nord** — champ ouvert, quelques rochers.
- **Ruines de la Ville Sainte** — murs qui coupent les lignes de tir.
- **Forêt de la Région Nord** — arbres et rivière.
- **Vallée du Pays Doré** — gorges étroites et murailles.

## Structure du projet

```
server.js            Serveur HTTP + WebSocket (relais entre les 2 joueurs)
public/
  index.html         Interface (accueil, lobby, combat, boutique)
  style.css          Thème
  js/data.js         Personnages, capacités, cartes, niveaux
  js/game.js         Logique de jeu (déplacements, dégâts, tours, victoire)
  js/main.js         Client : réseau, rendu du plateau, interactions
test/
  logic.test.js      Simulation complète de combat + règles précises
  net.test.js        Deux clients simulés jouent une partie via le serveur
```

Le serveur ne fait que relayer les actions : chaque client valide et applique la même
logique déterministe (aucun aléatoire dans les combats), donc les deux joueurs voient
exactement le même état. La progression (pièces, niveaux) est sauvegardée localement
dans le navigateur, par nom de joueur.

## Tests

```bash
npm test
```
