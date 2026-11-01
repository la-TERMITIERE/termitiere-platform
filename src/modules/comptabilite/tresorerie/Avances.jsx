// TRÉSORERIE — Avances de mission (équivalent des « Demandes du Transport » de FEZIRE) :
// avances versées aux chauffeurs/agents, puis régularisation au retour : les frais justifiés
// passent en charges, le reste est restitué (ou un complément est versé).
import { useMemo, useState } from 'react'
import { Plane, Plus, CheckCheck } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import Button from '../../../shared/ui/Button'
import Badge from '../../../shared/ui/Badge'
import Modal from '../../../shared/ui/Modal'
import StatCard from '../../../shared/ui/StatCard'
import { addItem, updateItem } from '../../../core/db'
import { audit } from '../../../core/audit'
import { formatMoney, formatDateShort, todayStr } from '../../../utils/formatters'
import { useAuth } from '../../../hooks/useAuth'
import BandeauCompta, { OngletsBande, BoutonBande } from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { COL_TRESO } from './logic'
import { MouvementModal } from './TresoDashboard'
import { Champ, ChoixCompte } from './ui'

const COMPTES_CHARGE = [
  { num: '605300', label: 'Carburant et lubrifiants' }, { num: '612000', label: 'Transports' },
  { num: '605000', label: 'Autres achats' }, { num: '615000', label: 'Entretien et réparations' }, { num: '658000', label: 'Charges diverses' }
]

export default function Avances() {
  const user = useAuth((s) => s.user)
  const { mouvements, soldes, loading } = useTresorerie()
  const [vue, setVue] = useState('a_regulariser')
  const [nouveau, setNouveau] = useState(null)
  const [regul, setRegul] = useState(null)
  const avances = useMemo(() => mouvements.filter((m) => m.nature === 'AVANCE_MISSION' && m.statut !== 'annule').sort((a, b) => String(b.date).localeCompare(String(a.date))), [mouvements])
  const liste = avances.filter((a) => (vue === 'a_regulariser' ? !a.regularisation : !!a.regularisation))
  const nomCompte = (id) => soldes.find((c) => c.id === id)?.nom || '—'
  const enCours = avances.filter((a) => !a.regularisation).reduce((s, a) => s + (Number(a.montant) || 0), 0)

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  return (
    <div className="space-y-5">
      <BandeauCompta icone={Plane} titre="Avances de mission" sous="Avances versées aux chauffeurs et agents, puis régularisation : frais justifiés, compléments et restitutions.">
        <OngletsBande options={[{ id: 'a_regulariser', label: 'À régulariser' }, { id: 'regularisees', label: 'Régularisées' }]} valeur={vue} onChange={setVue} taille="sm" />
        <BoutonBande icone={Plus} anime onClick={() => setNouveau({ compteId: '', sens: 'OUT', nature: 'AVANCE_MISSION', montant: '', date: todayStr(), libelle: '', tiers: '', reference: '', mode: 'CASH', secteur: 'logistique' })}>Verser une avance</BoutonBande>
      </BandeauCompta>
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Avances à régulariser" value={formatMoney(enCours)} accent="#f59e0b" icon={Plane} />
        <StatCard title="Nombre" value={avances.filter((a) => !a.regularisation).length} accent="#0ea5e9" icon={Plane} />
      </div>
      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Bénéficiaire</th><th className="px-3 py-2">Objet</th><th className="px-3 py-2">Payé depuis</th><th className="px-3 py-2 text-right">Avance</th><th className="px-3 py-2">Régularisation</th><th className="w-28"></th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">{vue === 'a_regulariser' ? 'Aucune avance en attente.' : 'Aucune avance régularisée.'}</td></tr>}
            {liste.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 font-mono text-xs">{formatDateShort(a.date)}</td><td className="px-3 py-2">{a.tiers || '—'}</td><td className="px-3 py-2 text-gray-600">{a.libelle}</td>
                <td className="px-3 py-2 text-xs">{nomCompte(a.compteId)}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(a.montant)}</td>
                <td className="px-3 py-2 text-xs">{a.regularisation ? <><Badge tone="success">Faite</Badge> frais {formatMoney(a.regularisation.frais)}{a.regularisation.ecart ? ` · ${a.regularisation.ecart > 0 ? 'restitué' : 'complément'} ${formatMoney(Math.abs(a.regularisation.ecart))}` : ''}</> : <Badge tone="warning">En attente</Badge>}</td>
                <td className="px-2 py-2 text-right">{!a.regularisation && <Button size="sm" variant="ghost" onClick={() => setRegul({ avance: a, frais: a.montant, compteCharge: '605300', date: todayStr(), compteId: a.compteId })}><CheckCheck size={14} /> Régulariser</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <MouvementModal valeur={nouveau} onClose={() => setNouveau(null)} comptes={soldes} user={user} />
      <RegulModal valeur={regul} onClose={() => setRegul(null)} comptes={soldes} user={user} />
    </div>
  )
}

function RegulModal({ valeur, onClose, comptes, user }) {
  const [v, setV] = useState(null)
  const cur = v && v.__src === valeur ? v : (valeur ? { ...valeur, __src: valeur } : null)
  const maj = (p) => setV({ ...cur, ...p })
  const avance = cur?.avance
  const frais = Number(cur?.frais) || 0
  const ecart = avance ? (Number(avance.montant) || 0) - frais : 0 // > 0 : restitution ; < 0 : complément à verser
  const enregistrer = async () => {
    if (ecart !== 0 && !cur.compteId) return
    if (ecart > 0) await addItem(COL_TRESO.mouvements, { compteId: cur.compteId, sens: 'IN', nature: 'RESTITUTION_AVANCE', montant: ecart, date: cur.date, libelle: `Restitution d'avance : ${avance.tiers || ''}`, tiers: avance.tiers || '', reference: avance.reference || '', mode: 'CASH', secteur: avance.secteur || '', contrepartie: '425000', statut: 'valide', avanceId: avance.id, creePar: user?.nom || '' })
    if (ecart < 0) await addItem(COL_TRESO.mouvements, { compteId: cur.compteId, sens: 'OUT', nature: 'AVANCE_MISSION', montant: -ecart, date: cur.date, libelle: `Complément de mission : ${avance.tiers || ''}`, tiers: avance.tiers || '', reference: avance.reference || '', mode: 'CASH', secteur: avance.secteur || '', contrepartie: '425000', statut: 'valide', avanceId: avance.id, regularisation: { frais: 0, compteCharge: cur.compteCharge, date: cur.date, ecart: 0, complement: true }, creePar: user?.nom || '' })
    await updateItem(COL_TRESO.mouvements, avance.id, { regularisation: { frais, compteCharge: cur.compteCharge, date: cur.date, ecart, par: user?.nom || '' } })
    await audit('comptabilite', 'AVANCE', `Régularisation ${avance.tiers || ''} : frais ${formatMoney(frais)}, écart ${formatMoney(ecart)}`)
    onClose()
  }
  return (
    <Modal open={!!cur} onClose={onClose} title={avance ? `Régulariser l'avance : ${avance.tiers || ''}` : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={enregistrer} disabled={ecart !== 0 && !cur?.compteId}>Régulariser</Button></>}>
      {cur && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Avance versée : <b>{formatMoney(avance.montant)}</b></p>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Frais justifiés"><input type="number" min="0" value={cur.frais} onChange={(e) => maj({ frais: e.target.value })} className="input-base" /></Champ>
            <Champ label="Compte de charge"><select value={cur.compteCharge} onChange={(e) => maj({ compteCharge: e.target.value })} className="input-base">{COMPTES_CHARGE.map((c) => <option key={c.num} value={c.num}>{c.num} · {c.label}</option>)}</select></Champ>
            <Champ label="Date"><input type="date" value={cur.date} onChange={(e) => maj({ date: e.target.value })} className="input-base" /></Champ>
          </div>
          {ecart !== 0 && <Champ label={ecart > 0 ? `Restitution de ${formatMoney(ecart)} reçue sur` : `Complément de ${formatMoney(-ecart)} versé depuis`}><ChoixCompte comptes={comptes} value={cur.compteId} onChange={(id) => maj({ compteId: id })} /></Champ>}
          <p className="text-xs text-gray-500">Comptabilité : D {cur.compteCharge} (frais) / C 425000 (avance){ecart > 0 ? ', puis D caisse / C 425000 (restitution)' : ecart < 0 ? ', puis D 425000 / C caisse (complément)' : ''}.</p>
        </div>
      )}
    </Modal>
  )
}
