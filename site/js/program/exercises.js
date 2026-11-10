// @ts-check
/**
 * Bibliothèque d'exercices : consignes courtes, matériel, zones sensibles à éviter.
 */

/**
 * @typedef {'none' | 'dumbbells' | 'gym'} Equipment
 * @typedef {'knee' | 'back' | 'shoulder' | 'wrist' | 'ankle'} Sensitive
 */

/**
 * @typedef {object} Exercise
 * @property {string} id
 * @property {string} name
 * @property {'strength' | 'core' | 'mobility'} kind
 * @property {'legs' | 'push' | 'pull' | 'core' | 'full' | 'mobility'} group
 * @property {Equipment} equipment   matériel minimum
 * @property {Sensitive[]} avoid      à éviter si blessure à cet endroit
 * @property {string} cue             consigne courte
 */

/** @type {Exercise[]} */
export const EXERCISES = [
  // Jambes
  { id: 'squat_bw', name: 'Squat au poids du corps', kind: 'strength', group: 'legs', equipment: 'none', avoid: ['knee'], cue: 'Pieds largeur d\'épaules, descends hanches en arrière, genoux dans l\'axe des pieds.' },
  { id: 'goblet_squat', name: 'Goblet squat', kind: 'strength', group: 'legs', equipment: 'dumbbells', avoid: ['knee'], cue: 'Haltère contre la poitrine, buste droit, descends sous la parallèle si c\'est confortable.' },
  { id: 'back_squat', name: 'Squat barre', kind: 'strength', group: 'legs', equipment: 'gym', avoid: ['knee', 'back'], cue: 'Gainage avant de descendre, poussée dans tout le pied, dos neutre.' },
  { id: 'lunge', name: 'Fentes alternées', kind: 'strength', group: 'legs', equipment: 'none', avoid: ['knee'], cue: 'Grand pas, genou arrière vers le sol, buste vertical.' },
  { id: 'glute_bridge', name: 'Pont fessier', kind: 'strength', group: 'legs', equipment: 'none', avoid: [], cue: 'Pousse dans les talons, serre les fessiers en haut 1 seconde.' },
  { id: 'rdl_db', name: 'Soulevé de terre jambes tendues (haltères)', kind: 'strength', group: 'legs', equipment: 'dumbbells', avoid: ['back'], cue: 'Genoux légèrement fléchis, hanches en arrière, dos plat.' },
  { id: 'deadlift', name: 'Soulevé de terre', kind: 'strength', group: 'legs', equipment: 'gym', avoid: ['back'], cue: 'Barre contre les tibias, pousse le sol, dos neutre du début à la fin.' },
  { id: 'leg_press', name: 'Presse à cuisses', kind: 'strength', group: 'legs', equipment: 'gym', avoid: [], cue: 'Bas du dos collé au dossier, ne verrouille pas les genoux en haut.' },
  { id: 'step_up', name: 'Montées sur banc', kind: 'strength', group: 'legs', equipment: 'none', avoid: ['knee'], cue: 'Monte en poussant sur la jambe d\'appui, redescends lentement.' },
  { id: 'calf_raise', name: 'Mollets debout', kind: 'strength', group: 'legs', equipment: 'none', avoid: ['ankle'], cue: 'Monte haut sur la pointe, redescends en 2 secondes.' },
  // Poussée
  { id: 'pushup', name: 'Pompes', kind: 'strength', group: 'push', equipment: 'none', avoid: ['wrist', 'shoulder'], cue: 'Corps gainé en planche, coudes à 45°, poitrine près du sol.' },
  { id: 'incline_pushup', name: 'Pompes inclinées', kind: 'strength', group: 'push', equipment: 'none', avoid: ['wrist'], cue: 'Mains sur un banc ou une table, même gainage que les pompes.' },
  { id: 'db_press', name: 'Développé couché haltères', kind: 'strength', group: 'push', equipment: 'dumbbells', avoid: ['shoulder'], cue: 'Omoplates serrées, descends les haltères au niveau de la poitrine.' },
  { id: 'bench_press', name: 'Développé couché barre', kind: 'strength', group: 'push', equipment: 'gym', avoid: ['shoulder'], cue: 'Pieds ancrés, barre sur le bas des pectoraux, trajectoire contrôlée.' },
  { id: 'db_shoulder_press', name: 'Développé épaules haltères', kind: 'strength', group: 'push', equipment: 'dumbbells', avoid: ['shoulder', 'back'], cue: 'Gainage abdos, pousse au-dessus de la tête sans cambrer.' },
  { id: 'dips_bench', name: 'Dips sur banc', kind: 'strength', group: 'push', equipment: 'none', avoid: ['shoulder', 'wrist'], cue: 'Coudes vers l\'arrière, descends jusqu\'à 90° maximum.' },
  // Tirage
  { id: 'inverted_row', name: 'Rowing inversé sous une table', kind: 'strength', group: 'pull', equipment: 'none', avoid: [], cue: 'Corps droit, tire la poitrine vers la table, serre les omoplates.' },
  { id: 'db_row', name: 'Rowing haltère un bras', kind: 'strength', group: 'pull', equipment: 'dumbbells', avoid: [], cue: 'Dos plat, tire le coude vers la hanche.' },
  { id: 'lat_pulldown', name: 'Tirage vertical', kind: 'strength', group: 'pull', equipment: 'gym', avoid: ['shoulder'], cue: 'Tire la barre vers le haut de la poitrine, buste légèrement incliné.' },
  { id: 'pullup', name: 'Tractions', kind: 'strength', group: 'pull', equipment: 'gym', avoid: ['shoulder'], cue: 'Départ bras tendus, menton au-dessus de la barre, descente contrôlée.' },
  { id: 'seated_row', name: 'Tirage horizontal', kind: 'strength', group: 'pull', equipment: 'gym', avoid: [], cue: 'Buste fixe, tire vers le nombril, épaules basses.' },
  { id: 'face_pull_band', name: 'Face pull élastique', kind: 'strength', group: 'pull', equipment: 'none', avoid: [], cue: 'Tire vers le visage, coudes hauts, pouces vers l\'arrière.' },
  // Gainage
  { id: 'plank', name: 'Planche', kind: 'core', group: 'core', equipment: 'none', avoid: ['wrist'], cue: 'Coudes sous les épaules, bassin aligné, respire normalement.' },
  { id: 'side_plank', name: 'Planche latérale', kind: 'core', group: 'core', equipment: 'none', avoid: ['shoulder'], cue: 'Corps en ligne droite, hanche haute.' },
  { id: 'dead_bug', name: 'Dead bug', kind: 'core', group: 'core', equipment: 'none', avoid: [], cue: 'Bas du dos plaqué au sol, bras et jambe opposés s\'éloignent lentement.' },
  { id: 'bird_dog', name: 'Bird dog', kind: 'core', group: 'core', equipment: 'none', avoid: [], cue: 'À quatre pattes, tends bras et jambe opposés sans bouger le bassin.' },
  // Corps entier
  { id: 'kb_swing', name: 'Swing haltère', kind: 'strength', group: 'full', equipment: 'dumbbells', avoid: ['back'], cue: 'Mouvement de hanches, pas de squat, bras relâchés.' },
  { id: 'burpee', name: 'Burpees', kind: 'strength', group: 'full', equipment: 'none', avoid: ['knee', 'wrist'], cue: 'Rythme régulier, atterris en douceur.' },
  // Mobilité
  { id: 'hip_flexor', name: 'Étirement des fléchisseurs de hanche', kind: 'mobility', group: 'mobility', equipment: 'none', avoid: [], cue: '30 s par côté, bassin rentré, sans forcer.' },
  { id: 'cat_cow', name: 'Chat-vache', kind: 'mobility', group: 'mobility', equipment: 'none', avoid: [], cue: 'Enroule puis creuse le dos lentement, au rythme de la respiration.' },
  { id: 'thoracic_rot', name: 'Rotations thoraciques', kind: 'mobility', group: 'mobility', equipment: 'none', avoid: [], cue: 'Sur le côté, ouvre le bras vers l\'arrière en suivant la main du regard.' },
  { id: 'hamstring', name: 'Étirement ischios', kind: 'mobility', group: 'mobility', equipment: 'none', avoid: [], cue: 'Jambe tendue sur un support, dos droit, 30 s par côté.' },
];

/** @type {Map<string, Exercise>} */
export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

const LEVEL = { none: 0, dumbbells: 1, gym: 2 };

/**
 * Exercices utilisables avec ce matériel et sans les zones sensibles indiquées.
 * @param {{ equipment: Equipment, injuries: Sensitive[] }} o
 */
export function available(o) {
  return EXERCISES.filter((e) => LEVEL[e.equipment] <= LEVEL[o.equipment] && !e.avoid.some((a) => o.injuries.includes(a)));
}
