// Détail d'un mouvement de la Caisse : une dotation (apport de budget) ou une dépense, avec tout ce que
// l'on sait : montant, domaine, motif, auteur, catégorie, mode de paiement, bénéficiaire, justificatif…
import { Eye } from 'lucide-react'
import { iconeLigne } from './iconesCaisse'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import FicheDetail from '../../shared/ui/FicheDetail'
import Compteur from '../../shared/ui/Compteur'
import { glassModalProps } from '../../utils/color'
import { ouvrirPiece } from '../../utils/fichiers'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { STATUTS_DECAISSEMENT, NATURES_FLUX, MODES_PAIEMENT, natureFluxDefaut } from '../depense/data'
import { domaineLibelle, couleurDomaine } from './journalCalculs'

const heure = (ms) => (ms ? new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : null)
const FINANCEMENT = { caisse_commune: 'Caisse courante', pau: 'Apport du PAU' }

export default function CaisseFiche({ ligne, onClose }) {
  const l = ligne
  const dotation = l?.type === 'dotation'
  const retour = l?.type === 'retour'
  const entree = (l?.entree || 0) > 0
  const couleur = entree ? '#4f46e5' : '#dc2626'
  const montant = entree ? l?.entree : l?.sortie
  const d = !dotation ? l?.brut : null
  const rev = dotation ? l?.brut?.revision : null
  const statut = d ? (STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee) : null
  const nature = d ? NATURES_FLUX[d.natureFlux || natureFluxDefaut] : null
  const Icone = l ? iconeLigne(l).icone : Eye

  return (
    <Modal open={!!l} onClose={onClose} size="lg" {...glassModalProps(couleur)}
      title={l ? `${dotation ? 'Dotation' : retour ? 'Retour de reliquat' : 'Dépense'} du ${formatDateShort(l.date)}` : ''}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      {l && (
        <FicheDetail
          hero={
            <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl p-5 text-center text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
              style={{ background: entree ? 'linear-gradient(135deg, #818cf8 0%, #4f46e5 55%, #312e81 100%)' : 'linear-gradient(135deg, #f87171 0%, #dc2626 55%, #7f1d1d 100%)' }}>
              <style>{'@keyframes cf-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }'}</style>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-3xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
                <Icone size={28} style={{ animation: 'cf-flotte 2.6s ease-in-out infinite' }} />
              </span>
              <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">{dotation ? (entree ? 'Dotation de caisse' : 'Réduction de dotation') : retour ? 'Retour de reliquat' : 'Dépense'}</p>
              <p className="relative text-3xl font-black leading-tight">{entree ? '+' : '-'}<Compteur valeur={montant} format={(v) => v.toLocaleString('fr-FR')} /> <span className="text-base font-bold text-white/80">FCFA</span></p>
              <div className="relative flex flex-wrap justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full" style={{ background: couleurDomaine(l.secteurId) }} />{domaineLibelle(l.secteurId, l.site)}
                </span>
                {statut && <span className="inline-flex items-center rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">{statut.label}</span>}
              </div>
            </div>
          }
          entetes={dotation ? [
            { label: 'Date', value: formatDateShort(l.date) },
            { label: 'Montant', value: formatMoney(montant) },
            { label: 'Domaine', value: domaineLibelle(l.secteurId, l.site) },
            { label: 'Budget avant', value: rev ? formatMoney(Number(rev.ancien) || 0) : null },
            { label: 'Budget après', value: rev ? formatMoney(Number(rev.nouveau) || 0) : null },
            { label: 'Motif', value: rev?.motif },
            { label: 'Enregistré par', value: l.operateur },
            { label: 'Enregistré le', value: heure(rev?.date) }
          ] : [
            { label: 'Date', value: formatDateShort(l.date) },
            { label: 'Montant', value: formatMoney(montant) },
            { label: 'Domaine', value: domaineLibelle(l.secteurId, l.site) },
            { label: 'Catégorie', value: d?.categorie },
            { label: 'Nature de flux', value: nature?.label },
            { label: 'Mode de paiement', value: MODES_PAIEMENT.find((m) => m.id === d?.modePaiement)?.label },
            { label: 'Payé par', value: FINANCEMENT[d?.financePar] || FINANCEMENT[d?.sourceFinancement] || 'Entreprise' },
            { label: 'Bénéficiaire', value: d?.beneficiaireNom ? `${d.beneficiaireNom}${d.beneficiaireFonction ? ` : ${d.beneficiaireFonction}` : ''}` : null },
            { label: 'Téléphone du bénéficiaire', value: d?.beneficiaireTelephone },
            { label: 'Enregistré par', value: l.operateur },
            { label: 'Enregistré le', value: heure(d?.createdAt) }
          ]}
        >
          {!dotation && (
            <div className="tuile-verre">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Désignation</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">{l.designation}</p>
              {d?.noteOrigine && <p className="mt-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-600">« {d.noteOrigine} »</p>}
            </div>
          )}
          {d?.piece && (
            <button type="button" onClick={() => ouvrirPiece(d.piece)} className="tuile-verre flex w-full items-center gap-3 text-left transition-transform hover:-translate-y-0.5">
              <Eye size={18} className="text-gray-500" /> <span className="text-sm font-semibold text-gray-800">Voir le justificatif</span>
            </button>
          )}
          {statut && d?.statut && d.statut !== 'decaissee' && <Badge tone={statut.tone}>{statut.label}</Badge>}
        </FicheDetail>
      )}
    </Modal>
  )
}
