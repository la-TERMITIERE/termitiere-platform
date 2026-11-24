// Détail complet d'un événement du Journal (champ `meta` de audit_global), lisible à tous les niveaux d'imbrication.
// Pour une SUPPRESSION, `meta.donnees` porte l'enregistrement tel qu'il était avant d'être supprimé (date, client, lignes, montants…) :
// il s'affiche sous « Données supprimées », champ par champ, avec les dates en clair.
import { Fragment } from 'react'

const LIBELLES = {
  collection: 'Collection', id: 'Identifiant', libelle: 'Libellé', motif: 'Motif', donnees: 'Données supprimées',
  date: 'Date', dateSortie: 'Date de sortie', numero: 'Numéro', num: 'Numéro', client: 'Client', nom: 'Nom', tel: 'Téléphone', email: 'E-mail',
  adresse: 'Adresse', apporteur: 'Apporté par', statut: 'Statut', lignes: 'Lignes', lignesReelles: 'Lignes réelles', lignesDemandees: 'Lignes demandées',
  article: 'Article', articleId: 'Article (code)', articleType: "Type d'article", articleCat: 'Catégorie', qte: 'Quantité', prixUnit: 'Prix unitaire',
  total: 'Total', totalHT: 'Total HT', totalTTC: 'Total TTC', remise: 'Remise (%)', tva: 'TVA (%)', lieuVente: 'Lieu de vente', localite: 'Localité',
  createdBy: 'Créé par', createdByUid: 'Créé par (compte)', createdAt: 'Créé le', updatedAt: 'Modifié le', montant: 'Montant', description: 'Description',
  categorie: 'Catégorie', beneficiaireNom: 'Bénéficiaire', secteurId: 'Secteur', site: 'Site', designation: 'Désignation', type: 'Type',
  sortieDemandeeLe: 'Sortie demandée le', sortieDemandeePar: 'Sortie demandée par', sortieApprouveeLe: 'Sortie approuvée le', sortieApprouveePar: 'Sortie approuvée par',
  certifieeLe: 'Certifiée le', certifieePar: 'Certifiée par', ecartAjuste: 'Écart ajusté', ecartAjustements: 'Ajustements de l’écart'
}
const joliCle = (k) => LIBELLES[k] || String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

const ESTAMPILLE = /(At|Le|Ms)$|^(timestamp|ts|savedAt)$/
const dateFr = (iso) => iso.split('-').reverse().join('/')
const heureFr = (ms) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Valeur simple (texte, nombre, date, oui/non) mise en forme.
export function valeurLisible(cle, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (typeof v === 'number') return v > 1e11 && ESTAMPILLE.test(String(cle)) ? heureFr(v) : v.toLocaleString('fr-FR').replace(/[  ]/g, ' ')
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return dateFr(s)
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return `${dateFr(s.slice(0, 10))} ${s.slice(11, 16)}`
  return s
}

const estObjet = (v) => v !== null && typeof v === 'object'

function Valeur({ cle, valeur, profondeur }) {
  if (!estObjet(valeur)) return <span className="break-words text-gray-700">{valeurLisible(cle, valeur)}</span>
  const entrees = Array.isArray(valeur) ? valeur.map((x, i) => [String(i + 1), x]) : Object.entries(valeur)
  if (!entrees.length) return <span className="text-gray-400">—</span>
  const liste = Array.isArray(valeur)
  return (
    <div className={`space-y-1 ${profondeur > 0 ? 'rounded-md border border-gray-100 bg-gray-50/70 p-2' : ''}`}>
      {entrees.map(([k, v]) => (
        <div key={k} className="flex flex-wrap gap-x-2">
          <span className="min-w-[110px] shrink-0 font-semibold text-gray-500">{liste && !estObjet(v) ? '•' : liste ? `Ligne ${k}` : joliCle(k)}</span>
          <span className="min-w-0 flex-1"><Valeur cle={k} valeur={v} profondeur={profondeur + 1} /></span>
        </div>
      ))}
    </div>
  )
}

export default function MetaDetail({ meta }) {
  if (!meta || typeof meta !== 'object') return null
  const { donnees, ...reste } = meta
  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 text-xs">
      {Object.entries(reste).map(([k, v]) => (
        <div key={k} className="flex flex-wrap gap-x-2">
          <span className="min-w-[120px] shrink-0 font-semibold text-gray-500">{joliCle(k)}</span>
          <span className="min-w-0 flex-1"><Valeur cle={k} valeur={v} profondeur={0} /></span>
        </div>
      ))}
      {donnees && (
        <Fragment>
          <p className="border-t border-red-100 pt-2 text-[11px] font-extrabold uppercase tracking-wide text-red-600">Données supprimées : tout ce que contenait l'enregistrement</p>
          <div className="rounded-md border border-red-100 bg-red-50/40 p-2"><Valeur cle="donnees" valeur={donnees} profondeur={0} /></div>
        </Fragment>
      )}
    </div>
  )
}

// Texte plat d'un `meta` (export Excel du journal), y compris les données imbriquées.
export function metaToText(meta) {
  if (!meta || typeof meta !== 'object') return ''
  const plat = (cle, v) => {
    if (!estObjet(v)) return valeurLisible(cle, v)
    return (Array.isArray(v) ? v.map((x, i) => `[${i + 1}] ${plat(cle, x)}`) : Object.entries(v).map(([k, x]) => `${joliCle(k)}=${plat(k, x)}`)).join('; ')
  }
  return Object.entries(meta).map(([k, v]) => `${joliCle(k)}: ${plat(k, v)}`).join(' | ')
}
