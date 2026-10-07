// MAXI-GYM : pointage d'arrivée d'un abonné (enregistrement dans `gym_presences`),
// utilisable depuis le Dashboard sans passer par le volet Abonnements. Même règle
// qu'Abonnements.jsx : un seul pointage par client et par jour, WhatsApp de bienvenue
// si le numéro est connu et que le pointage est celui d'aujourd'hui.
import { addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { sendWhatsApp } from '../../core/whatsapp'
import { todayStr, formatDateShort } from '../../utils/formatters'

const cle = (nom) => (nom || '').trim().toLowerCase()

// `presences` : pointages déjà filtrés sur la salle courante. Renvoie true si pointé.
export async function pointerAbonne({ clientNom, abonnementId, presences, site, user, client, date = todayStr() }) {
  if (presences.some((p) => p.date === date && cle(p.clientNom) === cle(clientNom))) {
    toast.error(`${clientNom} est déjà pointé(e) pour le ${formatDateShort(date)}`)
    return false
  }
  await addItem('gym_presences', {
    clientNom, abonnementId: abonnementId || null, date, createdAt: Date.now(), site,
    enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null
  })
  await audit('gym', 'PRESENCE_POINTEE', `${clientNom} : arrivée pointée (${formatDateShort(date)})`)
  if (client?.telephone && date === todayStr()) {
    sendWhatsApp([client.telephone], {
      title: '🏋️ MAXI-GYM',
      body: `Bonjour ${clientNom}, bonne séance à MAXI-GYM aujourd'hui ! 💪`
    })
  }
  toast.success(`${clientNom} pointé(e) ✓`)
  return true
}
