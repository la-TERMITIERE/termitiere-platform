// E-DÉPENSES : alertes des décaissements demandés par les RH. Une mission ou une avance sur salaire APPROUVÉE par la GE devient une alerte pour la
// finance (DF, PAU, Info, GE) avec deux boutons : « Décaisser de la caisse » et « Ne pas décaisser » (logique : decaissementsLogique.js).
// Le hook sert l'accueil du portail et le Tableau de bord d'E-DÉPENSES (mêmes alertes, mêmes actions).
import { useMemo, useState } from 'react'
import { Plane, HandCoins, Wallet, Ban } from 'lucide-react'
import AlertesAccueil from '../../portal/AlertesAccueil'
import DetailMission from '../rh/DetailMission'
import DetailAvance from '../rh/DetailAvance'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { glassModalProps, icone3D } from '../../utils/color'
import { COL } from '../rh/store/rhStore'
import { libelleType } from '../rh/avancesCircuit'
import { peutDecaisser, aDecaisser, montantDecaissement as montantDe, decaisserDepuisCaisse, nePasDecaisser } from './decaissementsLogique'

// Alertes à afficher (items d'AlertesAccueil) pour la personne connectée, et la fenêtre de confirmation / de détail à poser dans la page.
export function useDecaissementsRh() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const actif = peutDecaisser(role)
  const { data: missions } = useCollection(actif ? COL.missions : null)
  const { data: avances } = useCollection(actif ? COL.avances : null)
  const { data: employes } = useCollection(actif ? COL.employes : null)
  const [enCours, setEnCours] = useState('')
  const [ouvert, setOuvert] = useState(null)   // { type, id } : détail ouvert
  const [refus, setRefus] = useState(null)     // { type, doc } : confirmation « Ne pas décaisser »

  const lignes = useMemo(() => [
    ...(missions || []).filter((m) => aDecaisser('mission', m)).map((doc) => ({ type: 'mission', doc })),
    ...(avances || []).filter((a) => aDecaisser('avance', a)).map((doc) => ({ type: 'avance', doc }))
  ].sort((a, b) => ((a.doc.approuveLe || '') < (b.doc.approuveLe || '') ? -1 : 1)), [missions, avances])

  async function decaisser(type, doc) {
    setEnCours(`${type}_${doc.id}`)
    try { await decaisserDepuisCaisse(type, doc, user, employes); toast.success(`${formatMoney(montantDe(type, doc))} décaissés de la Caisse courante ✓`) }
    catch (e) { console.error(e); toast.error('Décaissement impossible, réessayez') }
    finally { setEnCours('') }
  }
  async function confirmerRefus() {
    const { type, doc } = refus
    setEnCours(`${type}_${doc.id}`)
    try { await nePasDecaisser(type, doc, user); toast.success('Non décaissé : la RH est prévenue'); setRefus(null) } finally { setEnCours('') }
  }

  const items = actif ? lignes.map(({ type, doc }) => {
    const cle = `${type}_${doc.id}`
    return {
      id: `decaisse_${cle}`, icone: type === 'mission' ? Plane : HandCoins, couleur: '#b45309',
      titre: `${formatMoney(montantDe(type, doc))} à décaisser : ${doc.employeNom}`,
      sous: type === 'mission' ? `Mission${doc.destination ? ` à ${doc.destination}` : ''} · ${doc.objet} · approuvée par ${doc.approuvePar || 'la GE'}` : `${libelleType(doc.type)} approuvé(e) par ${doc.approuvePar || 'la GE'} · retenue sur la paie`,
      onOpen: () => setOuvert({ type, id: doc.id }),
      action: { label: 'Décaisser', icone: Wallet, loading: enCours === cle, onClick: () => decaisser(type, doc) },
      action2: { label: 'Non', title: 'Ne pas décaisser', icone: Ban, onClick: () => setRefus({ type, doc }) }
    }
  }) : []

  const docOuvert = ouvert && (ouvert.type === 'mission' ? (missions || []) : (avances || [])).find((x) => x.id === ouvert.id)
  const modal = (
    <>
      {ouvert?.type === 'mission' && <DetailMission mission={docOuvert} employes={employes || []} onClose={() => setOuvert(null)} />}
      {ouvert?.type === 'avance' && <DetailAvance avance={docOuvert} employes={employes || []} onClose={() => setOuvert(null)} />}
      <Modal open={!!refus} onClose={() => setRefus(null)} size="sm" title="Ne pas décaisser" {...glassModalProps('#b45309')}
        footer={<><Button variant="ghost" onClick={() => setRefus(null)}>Retour</Button><Button onClick={confirmerRefus} loading={!!enCours} style={{ backgroundColor: '#b45309' }}><Ban size={16} /> Ne pas décaisser</Button></>}>
        {refus && (
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={icone3D('#b45309')}><Ban size={22} /></span>
            <p className="text-sm text-gray-700">{formatMoney(montantDe(refus.type, refus.doc))} pour <strong>{refus.doc.employeNom}</strong> ne seront <strong>pas</strong> décaissés de la Caisse courante. {refus.type === 'avance' ? 'La demande sera marquée « Non décaissée » et aucune retenue ne sera faite sur la paie.' : 'La mission reste approuvée, marquée « Non décaissée ».'} La RH en sera informée.</p>
          </div>
        )}
      </Modal>
    </>
  )
  return { items, modal, total: items.length }
}

// Bloc d'alertes prêt à poser en haut du Tableau de bord d'E-DÉPENSES.
export default function DecaissementsRhAlertes() {
  const { items, modal } = useDecaissementsRh()
  return (<><AlertesAccueil items={items} titre="Décaissements à valider" />{modal}</>)
}
