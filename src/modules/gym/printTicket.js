// MAXI-GYM — Impression du ticket de caisse (séances uniquement), au format
// ticket thermique 58mm (32 caractères/ligne — format standard des petites
// imprimantes Bluetooth portables). Texte pré-formaté en colonnes fixes
// (comme un vrai ticket ESC/POS) plutôt qu'un tableau HTML, pour un rendu
// fidèle quel que soit le pilote d'impression utilisé par l'appareil.
import { formatDateShort } from '../../utils/formatters'
import { siteLabel } from './site/useSite'

const LARGEUR = 32

const nombre = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0)).replace(/[  ]/g, ' ')

function centrer(texte) {
  texte = String(texte)
  if (texte.length >= LARGEUR) return texte.slice(0, LARGEUR)
  const total = LARGEUR - texte.length
  const gauche = Math.floor(total / 2)
  return ' '.repeat(gauche) + texte + ' '.repeat(total - gauche)
}

const ligneSep = () => '-'.repeat(LARGEUR)

function colonnes(cols, largeurs, aligneDroite) {
  return cols.map((c, i) => {
    c = String(c)
    const l = largeurs[i]
    if (c.length > l) c = c.slice(0, l)
    const pad = ' '.repeat(l - c.length)
    return aligneDroite[i] ? pad + c : c + pad
  }).join('')
}

function ligneMontant(label, valeur) {
  const v = String(valeur)
  const espace = Math.max(1, LARGEUR - label.length - v.length)
  return label + ' '.repeat(espace) + v
}

export function imprimerTicketSeance({ numero, date, clientNom, description, montant, enregistrePar, site }) {
  const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const m = nombre(montant)

  const corps = [
    `<b>${centrer('MAXI-GYM')}</b>`,
    centrer(`Salle de sport — ${siteLabel(site || 'lome')}`),
    ligneSep(),
    `Ticket: ${numero}`,
    `Caissier: ${enregistrePar || '—'}`,
    `Date: ${formatDateShort(date)} ${heure}`,
    `Client: ${clientNom}`,
    ligneSep(),
    colonnes(['Article', 'Qte', 'P.U', 'Tot'], [13, 4, 7, 8], [false, true, true, true]),
    colonnes([description, '1', m, m], [13, 4, 7, 8], [false, true, true, true]),
    ligneSep(),
    ligneMontant('Sous-Total HT:', `${m} FCFA`),
    ligneMontant('Taxe:', `${nombre(0)} FCFA`),
    `<b>${ligneMontant('TOTAL:', `${m} FCFA`)}</b>`,
    ligneSep(),
    `<b>${centrer('STATUT: PAYE (COMPLET)')}</b>`,
    ligneSep(),
    centrer('Merci de votre visite !'),
    centrer('MAXI-GYM')
  ].join('\n')

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Ticket ${numero}</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 58mm; margin: 0; padding: 2mm 3mm; text-align: center; }
  .logo { display: block; width: 22mm; height: auto; margin: 0 auto 1mm; }
  pre { margin: 0; text-align: left; font-family: 'Consolas', 'Courier New', monospace; font-size: 11px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
</style></head>
<body>
  <img class="logo" src="/Maxi_Gym.png" alt="MAXI-GYM" />
  <pre>${corps}</pre>
</body></html>`

  const iframe = document.createElement('iframe')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open(); doc.write(html); doc.close()

  const lancerImpression = () => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe) }, 1000)
  }

  iframe.onload = () => {
    // On attend le chargement du logo (image) avant d'imprimer, avec un délai
    // de sécurité au cas où il ne se chargerait pas (imprimante/appareil hors-ligne).
    const img = doc.querySelector('.logo')
    if (!img || img.complete) { lancerImpression(); return }
    let lance = false
    const declencher = () => { if (!lance) { lance = true; lancerImpression() } }
    img.addEventListener('load', declencher)
    img.addEventListener('error', declencher)
    setTimeout(declencher, 1500)
  }
}
