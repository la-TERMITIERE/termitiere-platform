// MAXI-GYM : dans les 5 premiers jours du mois, la direction reçoit UNE alerte « Rapport du mois précédent prêt », à
// télécharger depuis la Facturation. Elle part quand un agent ou Info ouvre le Dashboard ; la réclamation atomique
// (`claimOnce`) garantit une seule alerte par salle et par mois, même avec plusieurs postes ouverts.
import { useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { claimOnce } from '../../core/db'
import { notify } from '../../core/notify'
import { peutEcrireGym } from '../../core/roles'
import { MOIS_LABELS } from '../depense/data'
import { todayStr } from '../../utils/formatters'
import { siteLabel } from './site/useSite'

export function useRapportMensuelGym(site) {
  const role = useAuth((s) => s.role)
  useEffect(() => {
    if (!peutEcrireGym(role)) return
    const auj = todayStr()
    if (Number(auj.slice(8, 10)) > 5) return
    const d = new Date(`${auj.slice(0, 7)}-01T00:00:00`)
    d.setMonth(d.getMonth() - 1)
    const mois = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    ;(async () => {
      const gagne = await claimOnce('gym_compteurs', `rapport-${site}-${mois}`, { site, mois }).catch(() => false)
      if (!gagne) return
      notify({
        type: 'info', title: `📊 Rapport mensuel prêt : MAXI-GYM ${siteLabel(site)}`,
        body: `Le rapport de ${MOIS_LABELS[d.getMonth()]} ${d.getFullYear()} est disponible : Facturation, bouton « Rapport mensuel ».`,
        module: 'gym', site, forRoles: ['info', 'assistant_pau', 'ge', 'df', 'pau', 'directeur'], link: `/gym/${site}/facturation`
      }).catch(() => {})
    })()
  }, [role, site])
}
