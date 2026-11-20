// TRÉSORERIE — Pilotage du recouvrement (aligné FEZIRE /treasury/pilotage) : situation
// financière, vieillissement, performance, activité de recouvrement. Ici le taux d'arriérés
// est calculé (FEZIRE ne le peut pas : sa trésorerie ne connaît pas les recettes annuelles).
import { useMemo, useState } from 'react'
import { Gauge } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import { formatMoney } from '../../../utils/formatters'
import BandeauCompta, { OngletsBande } from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { pilotage, syntheseCreances } from './logic'
import { PERIODES, periodeRapide, pourcent } from './ui'

function Tuile({ titre, valeur, sous, ton = 'text-gray-900' }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-gray-400">{titre}</p>
      <p className={`mt-1 text-lg font-extrabold ${ton}`}>{valeur}</p>
      {sous && <p className="mt-0.5 text-[11px] text-gray-500">{sous}</p>}
    </div>
  )
}

export default function Pilotage() {
  const { creances, ventes, loading } = useTresorerie()
  const [periodeId, setPeriodeId] = useState('mois')
  const { debut, fin } = periodeRapide(periodeId)
  const p = useMemo(() => pilotage(creances, { debut, fin }), [creances, debut, fin])
  const s = useMemo(() => syntheseCreances(creances), [creances])
  // Taux d'arriérés : créances échues / chiffre d'affaires des 12 derniers mois.
  const ca12 = useMemo(() => {
    const depuis = new Date(); depuis.setFullYear(depuis.getFullYear() - 1)
    const d = depuis.toISOString().slice(0, 10)
    return ventes.filter((v) => v.date >= d).reduce((t, v) => t + v.total, 0)
  }, [ventes])

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  const seuil = (x) => `${x.nb} créance(s)`
  return (
    <div className="space-y-5">
      <BandeauCompta icone={Gauge} titre="Pilotage du recouvrement" sous="Les créances émises et les encaissements reçus sur la période ; restant et ancienneté : où en sont ces créances aujourd'hui.">
        <OngletsBande options={PERIODES} valeur={periodeId} onChange={setPeriodeId} taille="sm" />
      </BandeauCompta>

      <Card><p className="font-bold text-gray-800">Situation financière</p><p className="mb-3 text-xs text-gray-500">Ce que l'organisation a émis, ce qu'elle a encaissé, et ce qu'il en reste.</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Tuile titre="Émis sur la période" valeur={formatMoney(p.emis)} />
          <Tuile titre="Créance totale" valeur={formatMoney(s.restant)} />
          <Tuile titre="Exigible" valeur={formatMoney(s.exigible)} />
          <Tuile titre="Échue" valeur={formatMoney(s.echue)} ton="text-red-600" />
          <Tuile titre="Recouvrable" valeur={formatMoney(s.recouvrable)} ton="text-green-700" />
          <Tuile titre="Irrécouvrable" valeur={formatMoney(s.irrecouvrable)} ton="text-gray-500" />
          <Tuile titre="Contestée" valeur={formatMoney(s.contestee)} ton="text-amber-600" />
          <Tuile titre="Sous échéancier" valeur={formatMoney(s.echeancier)} />
          <Tuile titre="Recouvré sur la période" valeur={formatMoney(p.encaisseCredit)} ton="text-green-700" />
          <Tuile titre="Recouvré au total" valeur={formatMoney(s.recouvre)} />
        </div>
      </Card>

      <Card><p className="font-bold text-gray-800">Vieillissement</p><p className="mb-3 text-xs text-gray-500">Les seuils d'âge usuels du métier, distincts des tranches de la balance âgée.</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Tuile titre="Âge moyen" valeur={p.ageMoyen === null ? '—' : `${p.ageMoyen} j`} sous={p.ageMoyen === null ? 'Aucune créance échue à mesurer.' : ''} />
          <Tuile titre="Plus de 30 jours" valeur={formatMoney(p.plus30.montant)} sous={seuil(p.plus30)} />
          <Tuile titre="Plus de 90 jours" valeur={formatMoney(p.plus90.montant)} sous={seuil(p.plus90)} />
          <Tuile titre="Plus de 180 jours" valeur={formatMoney(p.plus180.montant)} sous={seuil(p.plus180)} />
          <Tuile titre="Plus d'un an" valeur={formatMoney(p.plus365.montant)} sous={seuil(p.plus365)} />
          <Tuile titre="Plus de deux ans" valeur={formatMoney(p.plus730.montant)} sous={seuil(p.plus730)} />
        </div>
      </Card>

      <Card><p className="font-bold text-gray-800">Performance</p><p className="mb-3 text-xs text-gray-500">Les ratios qui disent si le recouvrement progresse.</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tuile titre="Taux de recouvrement" valeur={pourcent(p.tauxRecouvrement)} sous={p.tauxRecouvrement === null ? 'Aucune vente à crédit.' : 'Encaissé ÷ facturé, ventes à crédit.'} />
          <Tuile titre="Respect des échéanciers" valeur={pourcent(p.respectEcheanciers)} sous={p.respectEcheanciers === null ? 'Aucun terme encore arrivé.' : 'Termes payés à temps.'} />
          <Tuile titre="Taux d'arriérés" valeur={ca12 ? pourcent(s.echue / ca12) : '—'} sous="Échu ÷ chiffre d'affaires des 12 derniers mois." />
          <Tuile titre="Délai moyen de recouvrement" valeur={p.delaiMoyen === null ? '—' : `${p.delaiMoyen} j`} sous={p.delaiMoyen === null ? 'Aucun règlement sur la période.' : 'De la facture au règlement.'} />
        </div>
      </Card>

      <Card><p className="font-bold text-gray-800">Activité de recouvrement</p><p className="mb-3 text-xs text-gray-500">Les relances, les échéanciers, les promesses.</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tuile titre="Créances ouvertes" valeur={s.nbOuvertes} />
          <Tuile titre="Échéanciers" valeur={p.nbEcheanciers} />
          <Tuile titre="Promesses en cours" valeur={p.promesses} />
          <Tuile titre="Relances notées" valeur={p.relances} />
        </div>
      </Card>
    </div>
  )
}
