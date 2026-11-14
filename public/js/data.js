/*
 * Frieren Tactics — données du jeu : personnages, capacités, cartes.
 * Aucun aléatoire : tous les combats sont déterministes.
 */

// Raccourcis de description des effets
// fx: [{k:'dmg', v:1.1}, {k:'stun', t:1}, {k:'status', s:'atkUp', v:30, t:2}, ...]

const CHARACTERS = {
  frieren: {
    id: 'frieren', name: 'Frieren', title: 'Mage au-delà des siècles', cls: 'Mage', color: '#8e6fd8',
    hp: 100, atk: 30, def: 6, vit: 3,
    abilities: [
      { name: 'Zoltraak', desc: 'Attaque magique perforante à longue portée.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.1 }] },
      { name: 'Barrière runique', desc: 'Protège un allié avec un bouclier de 35 (2 tours).', target: 'ally', range: 3, cd: 4, fx: [{ k: 'shield', v: 35, t: 2 }] }
    ],
    passive: { id: 'frieren', name: 'Sagesse millénaire', desc: 'Les temps de recharge de ses capacités diminuent de 1 tour.' }
  },
  fern: {
    id: 'fern', name: 'Fern', title: 'Apprentie prodige', cls: 'Mage', color: '#a06fd8',
    hp: 95, atk: 32, def: 5, vit: 3,
    abilities: [
      { name: 'Zoltraak', desc: 'Attaque magique rapide à longue portée.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.0 }] },
      { name: 'Frappe concentrée', desc: 'Zoltraak surchargé, très destructeur.', target: 'enemy', range: 4, cd: 3, fx: [{ k: 'dmg', v: 1.5 }] }
    ],
    passive: { id: 'fern', name: 'Économie de mana', desc: '+20% de dégâts si elle n’a pas bougé pendant le tour.' }
  },
  stark: {
    id: 'stark', name: 'Stark', title: 'Guerrier lâche mais vaillant', cls: 'Guerrier', color: '#d8704f',
    hp: 130, atk: 28, def: 9, vit: 4,
    abilities: [
      { name: 'Coup de hache', desc: 'Frappe puissante au corps à corps.', target: 'enemy', range: 1, cd: 0, fx: [{ k: 'dmg', v: 1.15 }] },
      { name: 'Foudre d’Eisen', desc: ' Technique héritée : gros dégâts et étourdit la cible (1 tour).', target: 'enemy', range: 1, cd: 4, fx: [{ k: 'dmg', v: 1.6 }, { k: 'stun', t: 1 }] }
    ],
    passive: { id: 'stark', name: 'Sens du danger', desc: 'La première attaque subie à chaque tour est réduite de 25%.' }
  },
  heiter: {
    id: 'heiter', name: 'Heiter', title: 'Prêtre ivre de vie', cls: 'Prêtre', color: '#5cb85c',
    hp: 95, atk: 22, def: 6, vit: 3,
    abilities: [
      { name: 'Soin', desc: 'Restaure 35 PV à un allié.', target: 'ally', range: 3, cd: 1, fx: [{ k: 'heal', v: 35 }] },
      { name: 'Bénédiction', desc: 'Un allié gagne +30% d’attaque (2 tours).', target: 'ally', range: 3, cd: 3, fx: [{ k: 'status', s: 'atkUp', v: 30, t: 2 }] }
    ],
    passive: { id: 'heiter', name: 'Foi sereine', desc: 'Ses soins sont augmentés de 30%.' }
  },
  himmel: {
    id: 'himmel', name: 'Himmel', title: 'Héros légendaire', cls: 'Héros', color: '#d8b04f',
    hp: 115, atk: 30, def: 8, vit: 4,
    abilities: [
      { name: 'Épée du héros', desc: 'Entaille héroïque au corps à corps.', target: 'enemy', range: 1, cd: 0, fx: [{ k: 'dmg', v: 1.15 }] },
      { name: 'Fente éclair', desc: 'Charge d’estoc à courte portée.', target: 'enemy', range: 2, cd: 3, fx: [{ k: 'dmg', v: 1.5 }] }
    ],
    passive: { id: 'himmel', name: 'Inspiration', desc: 'Les alliés adjacents à Himmel infligent +15% de dégâts.' }
  },
  eisen: {
    id: 'eisen', name: 'Eisen', title: 'Nain guerrier', cls: 'Guerrier', color: '#b05a2a',
    hp: 140, atk: 30, def: 12, vit: 3,
    abilities: [
      { name: 'Coup de hache', desc: 'Frappe lourde au corps à corps.', target: 'enemy', range: 1, cd: 0, fx: [{ k: 'dmg', v: 1.1 }] },
      { name: 'Hache tourbillon', desc: 'Frappe tous les ennemis adjacents à Eisen.', target: 'self', range: 0, cd: 2, fx: [{ k: 'dmgAdj', v: 0.95 }] }
    ],
    passive: { id: 'eisen', name: 'Peau de fer', desc: 'Subit 20% de dégâts en moins.' }
  },
  sein: {
    id: 'sein', name: 'Sein', title: 'Prêtre voyageur', cls: 'Prêtre', color: '#6fbf73',
    hp: 100, atk: 20, def: 6, vit: 3,
    abilities: [
      { name: 'Soin', desc: 'Restaure 30 PV à un allié.', target: 'ally', range: 3, cd: 1, fx: [{ k: 'heal', v: 30 }] },
      { name: 'Soin de groupe', desc: 'Soigne 25 PV tous les alliés autour de la zone visée.', target: 'cell', range: 3, cd: 3, fx: [{ k: 'healRad', v: 25, r: 2 }] }
    ],
    passive: { id: 'sein', name: 'Optimiste', desc: 'Les alliés adjacents régénèrent 5 PV au début de chaque tour de leur camp.' }
  },
  kraft: {
    id: 'kraft', name: 'Kraft', title: 'Guerrier bénit des dieux', cls: 'Guerrier', color: '#c9a227',
    hp: 135, atk: 26, def: 10, vit: 3,
    abilities: [
      { name: 'Frappe bénie', desc: 'Coup de bâton béni au corps à corps.', target: 'enemy', range: 1, cd: 0, fx: [{ k: 'dmg', v: 1.1 }] },
      { name: 'Gardien', desc: 'Bouclier de 35 à un allié et lui rend 15 PV.', target: 'ally', range: 2, cd: 3, fx: [{ k: 'shield', v: 35, t: 2 }, { k: 'heal', v: 15 }] }
    ],
    passive: { id: 'kraft', name: 'Bénédiction du héros', desc: 'Régénère 8 PV au début de chaque tour de son camp.' }
  },
  aura: {
    id: 'aura', name: 'Aura', title: 'Aura la Guillotine', cls: 'Démon', color: '#8b1e3f',
    hp: 110, atk: 28, def: 7, vit: 4,
    abilities: [
      { name: 'Lame démoniaque', desc: 'Coups d’épée au corps à corps.', target: 'enemy', range: 1, cd: 0, fx: [{ k: 'dmg', v: 1.05 }] },
      { name: 'Auserlese', desc: 'Soumet un ennemi sous 60% de PV : dégâts et étourdissement (1 tour).', target: 'enemy', range: 3, cd: 3, cond: 'hp60', fx: [{ k: 'dmg', v: 0.4 }, { k: 'stun', t: 1 }] }
    ],
    passive: { id: 'aura', name: 'Dominance', desc: '+25% de dégâts contre les cibles sous 60% de PV.' }
  },
  lugner: {
    id: 'lugner', name: 'Lügner', title: 'Œil maléfique', cls: 'Démon', color: '#7a2f4f',
    hp: 100, atk: 27, def: 6, vit: 4,
    abilities: [
      { name: 'Aiguilles de sang', desc: 'Projectiles de sang à distance.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.0 }] },
      { name: 'Œil maléfique', desc: 'Réduit l’attaque de la cible de 30% (2 tours).', target: 'enemy', range: 3, cd: 3, fx: [{ k: 'dmg', v: 0.4 }, { k: 'status', s: 'atkDown', v: 30, t: 2 }] }
    ],
    passive: { id: 'lugner', name: 'Sang démoniaque', desc: 'Ses attaques ignorent 50% de la défense adverse.' }
  },
  denken: {
    id: 'denken', name: 'Denken', title: 'Mage vétéran', cls: 'Mage', color: '#6f7fd8',
    hp: 105, atk: 29, def: 8, vit: 3,
    abilities: [
      { name: 'Zoltraak', desc: 'Attaque magique à distance.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.05 }] },
      { name: 'Mur de terre', desc: 'Bouclier de 30 à tous les alliés autour de la zone visée (2 tours).', target: 'cell', range: 2, cd: 3, fx: [{ k: 'shieldRad', v: 30, r: 1, t: 2 }] }
    ],
    passive: { id: 'denken', name: 'Ancien maître', desc: 'Immunisé aux étourdissements.' }
  },
  ubel: {
    id: 'ubel', name: 'Übel', title: 'Mage de l’intuition', cls: 'Mage', color: '#3f8f6f',
    hp: 90, atk: 31, def: 4, vit: 4,
    abilities: [
      { name: 'Lame invisible', desc: 'Tranche la cible à distance moyenne.', target: 'enemy', range: 2, cd: 0, fx: [{ k: 'dmg', v: 1.2 }] }
    ],
    passive: { id: 'ubel', name: 'Intuition meurtrière', desc: '+30% de dégâts contre une cible qu’elle a déjà blessée pendant ce combat.' }
  },
  wirbel: {
    id: 'wirbel', name: 'Wirbel', title: 'Vétéran de la guerre', cls: 'Mage', color: '#4f6f9f',
    hp: 100, atk: 26, def: 6, vit: 4,
    abilities: [
      { name: 'Rafale de mana', desc: 'Décharge magique à distance.', target: 'enemy', range: 3, cd: 0, fx: [{ k: 'dmg', v: 1.0 }] },
      { name: 'Vortex', desc: 'Attire la cible de 2 cases vers lui et la blesse.', target: 'enemy', range: 3, cd: 3, fx: [{ k: 'dmg', v: 0.35 }, { k: 'pull', v: 2 }] }
    ],
    passive: { id: 'wirbel', name: 'Vétéran de guerre', desc: 'Toutes ses capacités gagnent +1 de portée.' }
  },
  land: {
    id: 'land', name: 'Land', title: 'Mage prudent', cls: 'Mage', color: '#7f8f4f',
    hp: 95, atk: 25, def: 6, vit: 3,
    abilities: [
      { name: 'Zoltraak', desc: 'Attaque magique à distance.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.0 }] },
      { name: 'Clone', desc: 'Crée un clone (45% des PV) qui combat à ses côtés pendant 2 tours.', target: 'free', range: 2, cd: 4, fx: [{ k: 'clone' }] }
    ],
    passive: { id: 'land', name: 'Prudence', desc: 'Annule la première attaque subie à chaque tour.' }
  },
  methode: {
    id: 'methode', name: 'Methode', title: 'Mage analyste', cls: 'Mage', color: '#9f4f7f',
    hp: 100, atk: 27, def: 7, vit: 3,
    abilities: [
      { name: 'Zoltraak', desc: 'Attaque magique à distance.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.0 }] },
      { name: 'Contrôle mental', desc: 'Étourdit la cible pendant 1 tour.', target: 'enemy', range: 3, cd: 3, fx: [{ k: 'stun', t: 1 }] }
    ],
    passive: { id: 'methode', name: 'Analyste', desc: '+20% de dégâts contre les cibles étourdies.' }
  },
  sense: {
    id: 'sense', name: 'Sense', title: 'Mage aux cheveux d’acier', cls: 'Mage', color: '#4f9f8f',
    hp: 105, atk: 28, def: 7, vit: 3,
    abilities: [
      { name: 'Fouet d’acier', desc: 'Fouette la cible à très longue portée.', target: 'enemy', range: 5, cd: 0, fx: [{ k: 'dmg', v: 1.05 }] },
      { name: 'Piège de cheveux', desc: 'Immobilise la cible (1 tour) et la blesse.', target: 'enemy', range: 3, cd: 3, fx: [{ k: 'dmg', v: 0.35 }, { k: 'stun', t: 1 }] }
    ],
    passive: { id: 'sense', name: 'Chevelure défensive', desc: 'Subit 25% de dégâts en moins des attaques de portée 1.' }
  },
  flamme: {
    id: 'flamme', name: 'Flamme', title: 'Pionnière de la magie humaine', cls: 'Mage', color: '#d86f3f',
    hp: 95, atk: 33, def: 5, vit: 3,
    abilities: [
      { name: 'Zoltraak primordial', desc: 'Version originelle du sort mortel.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.2 }] },
      { name: 'Flamme sacrée', desc: 'Explosion ardente dévastatrice.', target: 'enemy', range: 3, cd: 4, fx: [{ k: 'dmg', v: 1.7 }] }
    ],
    passive: { id: 'flamme', name: 'Héritage de l’humanité', desc: 'Ses attaques ignorent 25% de la défense adverse.' }
  },
  macht: {
    id: 'macht', name: 'Macht', title: 'Macht du pays doré', cls: 'Démon', color: '#b8912f',
    hp: 120, atk: 32, def: 9, vit: 3,
    abilities: [
      { name: 'Zoltraak d’or', desc: 'Attaque magique à distance.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.1 }] },
      { name: 'Diagoldze', desc: 'Transmutation maudite : gros dégâts et la cible ne peut plus être soignée (2 tours).', target: 'enemy', range: 3, cd: 4, fx: [{ k: 'dmg', v: 1.3 }, { k: 'status', s: 'noHeal', t: 2 }] }
    ],
    passive: { id: 'macht', name: 'Cœur d’or', desc: 'Immunisé aux étourdissements et subit 10% de dégâts en moins.' }
  },
  solitar: {
    id: 'solitar', name: 'Solitär', title: 'Démon à la mana pure', cls: 'Démon', color: '#5f2f6f',
    hp: 110, atk: 31, def: 6, vit: 4,
    abilities: [
      { name: 'Zoltraak pur', desc: 'Zoltraak dans sa forme démoniaque brute.', target: 'enemy', range: 4, cd: 0, fx: [{ k: 'dmg', v: 1.15 }] },
      { name: 'Explosion de mana', desc: 'Blesse tous les ennemis autour de la cible visée.', target: 'enemy', range: 3, cd: 3, fx: [{ k: 'dmgRad', v: 1.0, r: 1 }] }
    ],
    passive: { id: 'solitar', name: 'Mana brut', desc: '+10% d’attaque par allié mort dans son équipe.' }
  }
};

const CLONE_DEF = {
  id: 'clone', name: 'Clone', cls: 'Clone', color: '#7f8f4f',
  abilities: [
    { name: 'Zoltraak', desc: 'Attaque magique du clone.', target: 'enemy', range: 3, cd: 0, fx: [{ k: 'dmg', v: 0.9 }] }
  ]
};

// Légende terrain : '.' plaine, 'R' rocher, 'W' eau, 'T' arbre, '#' mur
// Rochers et murs bloquent le déplacement ET les projectiles. Eau et arbres bloquent le déplacement seulement.
const MAPS = {
  plaines: {
    name: 'Plaines du Nord',
    desc: 'Champ de bataille ouvert, quelques rochers.',
    grid: [
      '.............',
      '..R.......R..',
      '......R......',
      '.R...........',
      '......R......',
      '...........R.',
      '......R......',
      '..R.......R..',
      '.............'
    ]
  },
  ruines: {
    name: 'Ruines de la Ville Sainte',
    desc: 'Murs et décombres qui bloquent les lignes de tir.',
    grid: [
      '.............',
      '.##.......##.',
      '.#.........#.',
      '....##.##....',
      '.#....#....#.',
      '....##.##....',
      '.#.........#.',
      '.##.......##.',
      '.............'
    ]
  },
  foret: {
    name: 'Forêt de la Région Nord',
    desc: 'Arbres épais et rivière : la visibilité compte.',
    grid: [
      '....T...T....',
      '.TT..WWW..TT.',
      '..T.......T..',
      '.T....T....T.',
      'T...WW.WW...T',
      '.T....T....T.',
      '..T.......T..',
      '.TT..WWW..TT.',
      '....T...T....'
    ]
  },
  goldene: {
    name: 'Vallée du Pays Doré',
    desc: 'Gorges étroites et murailles, terrain clos.',
    grid: [
      '##.........##',
      '#....RRR....#',
      '.....R.R.....',
      '..W.......W..',
      '#....###....#',
      '..W.......W..',
      '.....R.R.....',
      '#....RRR....#',
      '##.........##'
    ]
  }
};

const LEVEL_MAX = 5;
const LEVEL_COST = [0, 60, 80, 100, 120]; // coût pour passer au niveau index+1 (coût[1] = passer du niv.1 au niv.2)
const WIN_COINS = 120;
const SURVIVOR_COINS = 15;
const LOSE_COINS = 40;
