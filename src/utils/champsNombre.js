// Champs numériques de toute la plateforme : le « 0 » affiché par défaut disparaît dès qu'on tape.
//  - au focus, le contenu est sélectionné : le premier chiffre tapé REMPLACE le 0 (au lieu de donner « 02 ») ;
//  - si un zéro de tête reste malgré tout (« 02 », « 007 »), il est retiré tout de suite : « 2 », « 7 ».
// Posé une seule fois, au niveau du document : couvre tous les écrans, composants partagés ou champs natifs.
const estChampNombre = (el) => el instanceof HTMLInputElement && el.type === 'number' && !el.readOnly && !el.disabled

// Écrit la valeur SANS passer par le suivi interne de React : il voit alors un vrai changement et appelle onChange avec la valeur propre.
const ecrireValeur = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(el, v); else el.value = v
}

if (typeof document !== 'undefined' && !window.__champsNombreInstalle) {
  window.__champsNombreInstalle = true

  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (!estChampNombre(el)) return
    // Le relâchement de la souris replace normalement le curseur et annule la sélection : on l'en empêche une fois.
    el.addEventListener('mouseup', (ev) => ev.preventDefault(), { once: true })
    setTimeout(() => { try { el.select() } catch { /* champ retiré entre-temps */ } }, 0)
  })

  document.addEventListener('input', (e) => {
    const el = e.target
    if (!estChampNombre(el)) return
    const v = el.value
    const propre = v.replace(/^(-?)0+(?=\d)/, '$1')
    if (propre !== v) ecrireValeur(el, propre)
  }, true)
}
