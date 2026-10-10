// Motif obligatoire de toute suppression. `removeItem` (core/db.js) appelle `demanderMotif` : une
// fenêtre (MotifSuppressionHost, montée dans AppShell) demande le motif et ne laisse supprimer
// qu'une fois celui-ci saisi. Le motif est ensuite tracé dans le Journal.
//
// - Plusieurs suppressions déclenchées d'un coup (Promise.all) partagent la même question.
// - Un motif saisi est réutilisé 2,5 s pour les suppressions enchaînées d'une même action.
// - Sans fenêtre disponible (écran de connexion…), on retombe sur un prompt du navigateur.
let ouvrir = null
let enAttente = null
let dernier = { motif: '', t: 0 }

export class SuppressionAnnulee extends Error {
  constructor() {
    super('Suppression annulée : un motif est obligatoire.')
    this.code = 'SUPPRESSION_ANNULEE'
  }
}

export const brancherDemandeurMotif = (fn) => { ouvrir = fn }

export function demanderMotif(info = {}) {
  if (enAttente) return enAttente
  if (dernier.motif && Date.now() - dernier.t < 2500) return Promise.resolve(dernier.motif)
  const question = ouvrir
    ? new Promise((resolve) => ouvrir(info, resolve))
    : Promise.resolve((window.prompt('Motif de la suppression (obligatoire) :') || '').trim() || null)
  enAttente = question
    .then((m) => { if (m) dernier = { motif: m, t: Date.now() }; return m })
    .finally(() => { enAttente = null })
  return enAttente
}
