// Notifie le bénéficiaire d'un décaissement (cloche + push téléphone réel).
import { notify } from '../../core/notify'
import { pushToUsers } from '../../core/push'

export async function notifierBeneficiaire(d, secteurLabel) {
  if (!d.beneficiaireUid) return
  const montantTxt = `${Number(d.montant).toLocaleString('fr-FR')} FCFA`
  const corps = `${montantTxt} (${secteurLabel})${d.description ? ' — ' + d.description : ''}. Merci de confirmer la réception.`

  await notify({
    type: 'info',
    title: '💸 Paiement décaissé',
    body: corps,
    module: 'depense',
    forUsers: [d.beneficiaireUid],
    link: '/'
  })

  await pushToUsers([d.beneficiaireUid], {
    title: '💸 Paiement décaissé — confirmation requise',
    body: corps,
    url: '/'
  })
}
