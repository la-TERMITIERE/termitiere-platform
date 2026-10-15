// Fiche complète d'un mouvement bancaire (dépôt ou retrait) : montant, secteur, banque, libellé, origine,
// personne en charge, auteur de la saisie, justificatif, et solde du compte du secteur après ce mouvement.
import { ArrowDownCircle, ArrowUpCircle, Paperclip, Landmark, Wallet } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FicheDetail from '../../shared/ui/FicheDetail'
import Compteur from '../../shared/ui/Compteur'
import { glassModalProps, icone3D } from '../../utils/color'
import { ouvrirPiece } from '../../utils/fichiers'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { TYPES_MOUVEMENT_BANQUE } from '../depense/data'

const montant = (m) => Number(m.montant) || 0
const dateHeure = (t) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : null)

// secteur : l'entrée de parSecteur (initial, rows, color, nom) du mouvement.
export default function MouvementFiche({ mouvement, secteur, banque, onClose, onModifier, onSupprimer }) {
  const m = mouvement
  const depot = m?.type === 'depot'
  const couleur = depot ? '#2563eb' : '#dc2626'
  const Icone = depot ? ArrowDownCircle : ArrowUpCircle
  const info = (m && TYPES_MOUVEMENT_BANQUE[m.type]) || { label: m?.type, signe: 0 }

  // Solde du compte du secteur juste après ce mouvement (ouverture + mouvements jusqu'à celui-ci).
  let soldeApres = null
  if (m && secteur) {
    const ordre = [...secteur.rows].sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1))
    const i = ordre.findIndex((x) => x.id === m.id)
    if (i >= 0) soldeApres = ordre.slice(0, i + 1).reduce((s, x) => s + (TYPES_MOUVEMENT_BANQUE[x.type]?.signe || 0) * montant(x), secteur.initial)
  }

  return (
    <Modal open={!!m} onClose={onClose} size="lg" {...glassModalProps(couleur)}
      title={m ? `${info.label} du ${formatDateShort(m.date)}` : ''}
      footer={<>
        {onSupprimer && <Button variant="danger" onClick={() => onSupprimer(m)}>Supprimer</Button>}
        {onModifier && <Button variant="outline" onClick={() => onModifier(m)}>Modifier</Button>}
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
      </>}>
      {m && (
        <FicheDetail
          hero={
            <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl p-5 text-center text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
              style={{ background: depot ? 'linear-gradient(135deg, #60a5fa 0%, #2563eb 55%, #1e3a8a 100%)' : 'linear-gradient(135deg, #f87171 0%, #dc2626 55%, #7f1d1d 100%)' }}>
              <style>{'@keyframes mf-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }'}</style>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-3xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
                <Icone size={30} style={{ animation: 'mf-flotte 2.6s ease-in-out infinite' }} />
              </span>
              <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">{info.label} bancaire</p>
              <p className="relative text-3xl font-black leading-tight">{depot ? '+' : '-'}<Compteur valeur={montant(m)} format={(v) => v.toLocaleString('fr-FR')} /> <span className="text-base font-bold text-white/80">FCFA</span></p>
              <div className="relative flex flex-wrap justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">{m.secteurNom}{m.siteNom ? ` · ${m.siteNom}` : ''}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md"><Landmark size={12} /> {banque || 'Banque non précisée'}</span>
              </div>
            </div>
          }
          entetes={[
            { label: 'Date', value: formatDateShort(m.date) },
            { label: 'Montant', value: formatMoney(montant(m)) },
            { label: 'Secteur', value: m.secteurNom },
            { label: 'Site', value: m.siteNom },
            { label: 'Banque', value: banque || 'Non précisée' },
            { label: "Type d'action", value: m.libelle },
            { label: 'Origine / destination des fonds', value: m.origine },
            { label: 'Personne en charge', value: m.personne },
            { label: 'Saisi par', value: m.enregistrePar },
            { label: 'Saisi le', value: dateHeure(m.createdAt) }
          ]}
        >
          {soldeApres !== null && (
            <div className="tuile-verre flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={icone3D(secteur.color)}><Wallet size={18} /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Solde du compte {m.secteurNom} après ce mouvement</p>
                <p className="text-lg font-extrabold text-gray-800">{soldeApres.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-gray-400">FCFA</span></p>
              </div>
            </div>
          )}
          {m.piece && (
            <button type="button" onClick={() => ouvrirPiece(m.piece)}
              className="tuile-verre flex w-full items-center gap-3 text-left transition-transform hover:-translate-y-0.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={icone3D(couleur)}><Paperclip size={18} /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Justificatif</p>
                <p className="truncate text-sm font-semibold text-gray-800">{m.piece.nom || 'Voir le justificatif'}</p>
              </div>
            </button>
          )}
        </FicheDetail>
      )}
    </Modal>
  )
}
