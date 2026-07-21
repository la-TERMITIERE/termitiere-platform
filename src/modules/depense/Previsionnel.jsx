// Prévisionnel de trésorerie — projette le solde des prochains mois à partir :
//  • du revenu mensuel estimé (moyenne réelle des 3 derniers mois, tous secteurs) ;
//  • de la charge récurrente mensuelle (dépenses marquées « récurrentes ») ;
//  • des échéances connues à régler (reste à payer), ventilées sur leur mois.
// Lecture seule, aucune écriture. Donne une trajectoire indicative du solde cumulé.
import '../../utils/chartSetup'
import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { TrendingUp, TrendingDown, Wallet, Repeat } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import InfoBulle from '../../shared/ui/InfoBulle'
import { useCollection } from '../../hooks/useFirestore'
import { MOIS_LABELS } from './data'
import { derniersMois } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'

const now = new Date()
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

// Les n mois à venir (à partir du mois prochain), sous forme { annee, mois, label }.
function prochainsMois(n) {
  const out = []
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    out.push({ annee: d.getFullYear(), mois: d.getMonth() + 1, label: `${MOIS_LABELS[d.getMonth()].slice(0, 4)} ${String(d.getFullYear()).slice(2)}` })
  }
  return out
}

export default function Previsionnel() {
  const { data: depenses }            = useCollection('depense_depenses')
  const { data: paiementsGarderie }   = useCollection('garderie_paiements')
  const { data: facturesAgro }        = useCollection('agro_factures')
  const { data: facturesLogistique }  = useCollection('logistique_factures')
  const { data: facturesEvenementiel }= useCollection('evenementiel_factures')

  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }
  const revenuMois = (a, m) => SECTEURS_AVEC_REVENU.reduce((s, id) => s + revenuSecteur(collections, id, a, m), 0)

  // Revenu mensuel estimé = moyenne des revenus réels des 3 derniers mois (hors mois en cours incomplet).
  const revenuMensuelEstime = useMemo(() => {
    const trois = derniersMois(4, MOIS_LABELS).slice(0, 3) // les 3 mois précédant le mois courant
    const somme = trois.reduce((s, { annee, mois }) => s + revenuMois(annee, mois), 0)
    return Math.round(somme / 3)
  }, [paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel])

  // Charge récurrente mensuelle = somme des dépenses marquées « récurrentes ».
  const chargeRecurrente = useMemo(
    () => depenses.filter((d) => d.recurrente).reduce((s, d) => s + (Number(d.montant) || 0), 0),
    [depenses]
  )

  // Échéances connues (reste à payer non décaissé), par mois d'échéance.
  const echeancesParMois = useMemo(() => {
    const map = {}
    depenses
      .filter((d) => (d.statut === 'approuvee' || d.statut === 'en_attente') && d.echeance)
      .forEach((d) => {
        const cle = String(d.echeance).slice(0, 7)
        map[cle] = (map[cle] || 0) + (Number(d.montant) || 0)
      })
    return map
  }, [depenses])

  const totalResteAPayer = useMemo(
    () => depenses.filter((d) => d.statut === 'approuvee' || d.statut === 'en_attente').reduce((s, d) => s + (Number(d.montant) || 0), 0),
    [depenses]
  )

  // Projection sur 6 mois.
  const projection = useMemo(() => {
    let cumule = 0
    return prochainsMois(6).map(({ annee, mois, label }) => {
      const cle = `${annee}-${String(mois).padStart(2, '0')}`
      const echeances = echeancesParMois[cle] || 0
      const revenus = revenuMensuelEstime
      const sorties = chargeRecurrente + echeances
      const net = revenus - sorties
      cumule += net
      return { label, revenus, recurrent: chargeRecurrente, echeances, net, cumule }
    })
  }, [revenuMensuelEstime, chargeRecurrente, echeancesParMois])

  const lineData = {
    labels: projection.map((p) => p.label),
    datasets: [
      { label: 'Solde cumulé prévu', data: projection.map((p) => p.cumule), borderColor: '#B45309', backgroundColor: '#B4530922', tension: 0.3, fill: true, borderWidth: 2 },
      { label: 'Flux net du mois', data: projection.map((p) => p.net), borderColor: '#0d9488', backgroundColor: '#0d948822', tension: 0.3, borderDash: [6, 4] }
    ]
  }

  const soldeFin = projection.length ? projection[projection.length - 1].cumule : 0

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
        Projection indicative des <strong>6 prochains mois</strong> : revenu mensuel estimé (moyenne réelle des 3 derniers mois) − charge récurrente − échéances connues. Le solde cumulé montre la trajectoire de trésorerie si le rythme actuel se maintient.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={<span className="flex items-center gap-1">Revenu mensuel estimé <InfoBulle texte="Moyenne des revenus réels des 3 derniers mois, tous secteurs." /></span>}
          value={`${fmt(revenuMensuelEstime)} FCFA`} icon={TrendingUp} accent="#059669" />
        <StatCard title={<span className="flex items-center gap-1">Charge récurrente / mois <InfoBulle texte="Somme des dépenses marquées « récurrentes »." /></span>}
          value={`${fmt(chargeRecurrente)} FCFA`} icon={Repeat} accent="#B45309" />
        <StatCard title={<span className="flex items-center gap-1">Reste à payer (échéances) <InfoBulle texte="Engagements non encore réglés — voir l'onglet Échéancier." /></span>}
          value={`${fmt(totalResteAPayer)} FCFA`} icon={Wallet} accent="#d97706" />
        <StatCard title={<span className="flex items-center gap-1">Solde cumulé à 6 mois <InfoBulle texte="Trajectoire projetée du solde de trésorerie dans 6 mois." /></span>}
          value={`${fmt(soldeFin)} FCFA`} icon={soldeFin >= 0 ? TrendingUp : TrendingDown} accent={soldeFin >= 0 ? '#059669' : '#dc2626'} />
      </div>

      <Card title="Trajectoire de trésorerie — 6 mois à venir">
        <div style={{ height: 300 }}>
          <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }} />
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-amber-100 bg-amber-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Mois</th>
              <th className="px-4 py-3 text-right">Revenu estimé</th>
              <th className="px-4 py-3 text-right">Charge récurrente</th>
              <th className="px-4 py-3 text-right">Échéances</th>
              <th className="px-4 py-3 text-right">Flux net</th>
              <th className="px-4 py-3 text-right">Solde cumulé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projection.map((p) => (
              <tr key={p.label} className="hover:bg-amber-50/30">
                <td className="px-4 py-2.5 font-semibold text-gray-700">{p.label}</td>
                <td className="px-4 py-2.5 text-right text-green-700">{fmt(p.revenus)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">−{fmt(p.recurrent)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{p.echeances ? `−${fmt(p.echeances)}` : '—'}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${p.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{p.net >= 0 ? '+' : ''}{fmt(p.net)}</td>
                <td className={`px-4 py-2.5 text-right font-extrabold ${p.cumule >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{fmt(p.cumule)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-center text-xs text-gray-400">
        Estimation à titre indicatif — ne remplace pas un budget détaillé. Affinez en marquant vos dépenses régulières comme « récurrentes » et en renseignant les échéances.
      </p>
    </div>
  )
}
