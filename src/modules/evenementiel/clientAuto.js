// Client d'une vente ou d'une facture de la Briqueterie : retrouvé (identifiant, sinon même nom,
// avec le même téléphone si les deux en ont un) ou CRÉÉ automatiquement dans le volet Clients.
// Les coordonnées manquantes d'un client existant sont complétées. Plus besoin d'ajouter le
// client avant de vendre.
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'

const cle = (v) => (v || '').trim().toLowerCase()
const chiffres = (v) => (v || '').replace(/ /g, '')

export async function resoudreClientBriq({ clients, clientId, nom, telephone = '', adresse = '', profession = '' }) {
  const n = (nom || '').trim()
  const tel = (telephone || '').trim()
  const adr = (adresse || '').trim()
  const prof = (profession || '').trim()
  const existant = clients.find((x) => x.id === clientId)
    || clients.find((x) => cle(x.nom) === cle(n) && (!tel || !x.telephone || chiffres(x.telephone) === chiffres(tel)))
  if (existant) {
    const patch = {}
    if (tel && !existant.telephone) patch.telephone = tel
    if (adr && !existant.adresse) patch.adresse = adr
    if (prof && !existant.profession) patch.profession = prof
    if (Object.keys(patch).length) await updateItem('evenementiel_clients', existant.id, patch)
    return existant
  }
  const id = await addItem('evenementiel_clients', { nom: n, telephone: tel, adresse: adr, profession: prof })
  await audit('evenementiel', 'CLIENT_AUTO', `${n} : ajouté depuis une vente ou une facture`)
  return { id, nom: n, telephone: tel, adresse: adr, profession: prof }
}
