// Fiche d'un retour de matériel : icône animée (anneau en rotation inverse), détails du retour,
// et avancement des retours de ce matériel sur la prestation (rendu / sorti).
import { Undo2, PackageCheck, PackageX, Package } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FicheDetail from '../../shared/ui/FicheDetail'
import Compteur from '../../shared/ui/Compteur'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { logistiqueVoitMontants } from '../../core/roles'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { FX_STYLES } from './PrestationFormUI'

export default function RetourDetailModal({ retour, onClose }) {
  const role = useAuth((s) => s.role)
  const voitMontants = logistiqueVoitMontants(role)
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: retours } = useCollection('logistique_retours')

  const ok = retour?.type === 'OK'
  const couleur = ok ? '#16A34A' : '#DC2626'
  const casse = !!retour && !ok

  // Avancement : quantité sortie pour ce matériel sur la prestation vs quantité déjà rendue.
  const prestation = retour ? prestations.find((p) => p.id === retour.prestationId) : null
  const memeMateriel = (x) => (retour.materielId ? x.materielId === retour.materielId : x.materielNom === retour.materielNom)
  const sorti = prestation ? (prestation.lignes || []).filter(memeMateriel).reduce((s, l) => s + (parseInt(l.qte) || 0), 0) : 0
  const rendu = retour ? retours.filter((x) => x.prestationId === retour.prestationId && memeMateriel(x)).reduce((s, x) => s + (parseInt(x.qte) || 0), 0) : 0
  const pct = sorti > 0 ? Math.min(100, Math.round((rendu / sorti) * 100)) : 0

  const Icone = ok ? PackageCheck : PackageX

  return (
    <Modal open={!!retour} onClose={onClose} size="lg" {...glassModalProps(COULEUR_MODULE.logistique)}
      title={retour ? `Retour ${retour.num || ''}`.trim() : ''}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      {retour && (
        <FicheDetail
          hero={
            <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl p-5 text-center text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
              style={{ background: ok ? 'linear-gradient(135deg, #34d399 0%, #059669 55%, #064e3b 100%)' : 'linear-gradient(135deg, #f87171 0%, #dc2626 55%, #7f1d1d 100%)' }}>
              <style>{FX_STYLES}</style>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <div className="relative flex h-[88px] w-[88px] items-center justify-center" style={{ animation: 'fx-entree 0.5s ease-out' }}>
                <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-dashed border-white/55" style={{ animation: 'fx-orbite 14s linear infinite reverse' }} />
                <span aria-hidden="true" className="absolute inset-2.5 rounded-full border border-white/30" style={{ animation: 'fx-orbite 9s linear infinite' }} />
                <span aria-hidden="true" className="absolute inset-0" style={{ animation: 'fx-orbite 4s linear infinite reverse' }}>
                  <span className="absolute left-1/2 -top-1.5 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-white text-[#059669] shadow-[0_0_10px_3px_rgba(255,255,255,0.7)]"><Undo2 size={10} strokeWidth={3} /></span>
                </span>
                <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
                  <Icone size={30} style={{ animation: 'fx-flotte 2.6s ease-in-out infinite' }} />
                </span>
              </div>
              <div className="relative">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">Retour de matériel</p>
                <p className="text-lg font-extrabold leading-tight">{retour.materielNom}</p>
                <p className="text-sm text-white/85">{retour.clientNom || ''}</p>
              </div>
              <div className="relative flex flex-wrap justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full bg-white" />{retour.type}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">
                  <Package size={12} /><Compteur valeur={parseInt(retour.qte) || 0} /> pièce{(parseInt(retour.qte) || 0) > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          }
          entetes={[
            { label: 'Date du retour', value: formatDateShort(retour.date) },
            { label: 'Prestation', value: retour.prestationNum },
            { label: 'Client', value: retour.clientNom },
            { label: 'État', value: retour.type },
            { label: 'Enregistré par', value: retour.agentNom },
            { label: 'Motif', value: retour.motif },
            { label: 'Pénalité', value: voitMontants && casse && retour.penalite > 0 ? formatMoney(retour.penalite) : null },
            { label: 'Pénalité remboursée', value: voitMontants && casse && retour.penalite > 0 ? (retour.penalitePayee ? 'Payée' : 'À encaisser') : null }
          ]}
        >
          {sorti > 0 && (
            <div className="tuile-verre">
              <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D(couleur)}><Undo2 size={14} /></span>
                Avancement des retours sur la prestation
              </p>
              <div className="h-3 overflow-hidden rounded-full bg-gray-200/80 shadow-inner">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${couleur}, ${couleur}aa)` }} />
              </div>
              <p className="mt-1.5 text-xs text-gray-500"><strong>{rendu}</strong> rendu(s) sur <strong>{sorti}</strong> sorti(s) pour {retour.materielNom} : {pct} %</p>
            </div>
          )}
        </FicheDetail>
      )}
    </Modal>
  )
}
