// Fiche d'une dotation de la Caisse courante (clic sur sa ligne dans la liste des dépenses).
// Tout le monde peut consulter le détail ; seule l'administration peut corriger ou supprimer la dotation.
// Une dotation est une « révision » du budget du mois (collection `depense_budgets`) : modifier ou supprimer l'une d'elles
// recalcule en cascade les totaux des suivantes (même règle que l'onglet « Apports & ajouts » du budget).
import { useEffect, useState } from 'react'
import { HandCoins, Pencil, Trash2, CalendarDays, PenLine, FileText, Wallet, TrendingUp, Banknote, Save } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { glassModalProps, icone3D } from '../../utils/color'
import { formatDateShort } from '../../utils/formatters'
import { COULEUR_DOTATION } from '../comptabilite/iconesCaisse'

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

// Caisse courante = cumulatif : le montant AJOUTÉ (nouveau - ancien) de chaque révision est conservé, les totaux sont recalculés.
function recomputerChaine(revisions) {
  let courant = 0
  return revisions.map((r) => {
    const ancien = courant
    const nouveau = ancien + (r.nouveau - r.ancien)
    courant = nouveau
    return { ...r, ancien, nouveau }
  })
}

const MOTIFS_PAR_DEFAUT = /^(Apport à la caisse courante|Allocation initiale|Dotation de caisse)$/
const motifDe = (ligne) => { const m = ligne.brut?.revision?.motif; return m && !MOTIFS_PAR_DEFAUT.test(m) ? m : '' }

// Réécrit le document de budget du mois (en gardant ses autres champs) : `revisions` (nouvelle liste) ou, pour une ancienne
// dotation sans historique, simplement le `montant` du mois.
async function ecrireBudget(doc, revisions, montantSansHistorique) {
  const dernier = revisions ? revisions[revisions.length - 1] : null
  await setItem('depense_budgets', doc.id, { ...doc, montant: revisions ? (dernier ? dernier.nouveau : 0) : montantSansHistorique, ...(revisions ? { revisions } : {}), updatedAt: Date.now() })
}
const docDe = (ligne, budgets) => budgets.find((b) => b.id === ligne.brut?.budget?.id) || ligne.brut?.budget

// Suppression (avec confirmation) : utilisable depuis la fiche comme depuis le bouton de la ligne. Retourne true si supprimée.
export async function supprimerDotation(ligne, budgets = []) {
  const doc = docDe(ligne, budgets)
  const rev = ligne.brut?.revision || null
  const ajoute = Number(ligne.entree) || 0
  if (!window.confirm(`Supprimer cette dotation de ${fmt(ajoute)} FCFA ?\nLes totaux des dotations suivantes seront recalculés.`)) return false
  try {
    if (rev) await ecrireBudget(doc, recomputerChaine((doc.revisions || []).filter((r) => r.id !== rev.id)))
    else await ecrireBudget(doc, null, 0)
    await audit('depense', 'BUDGET_APPORT_SUPPRIME', `Caisse courante : dotation supprimée (${fmt(ajoute)} FCFA)`, { secteurId: 'divers', mois: ligne.date.slice(0, 7) })
    toast.success('Dotation supprimée ✓')
    return true
  } catch (e) {
    toast.error(e?.message || 'Suppression impossible')
    return false
  }
}

function Tuile({ icone: Icone, couleur, label, children, large = false }) {
  return (
    <div className={`rounded-2xl border border-white/70 bg-white/60 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl ${large ? 'col-span-2' : ''}`}>
      <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">
        <span className="flex h-5 w-5 items-center justify-center rounded-md" style={icone3D(couleur)}><Icone size={11} /></span>{label}
      </p>
      <div className="text-sm font-bold text-gray-800">{children}</div>
    </div>
  )
}

export default function DotationFiche({ ligne, budgets = [], peutGerer = false, editer = false, onClose }) {
  const [edition, setEdition] = useState(false)
  const [form, setForm] = useState({ montant: '', motif: '', date: '' })
  const [busy, setBusy] = useState(false)

  // À l'ouverture : la fiche en lecture, ou directement le formulaire de correction (bouton « Modifier » de la ligne).
  useEffect(() => {
    if (ligne && editer && peutGerer) { setForm({ montant: String(Number(ligne.entree) || 0), motif: motifDe(ligne), date: ligne.date }); setEdition(true) }
    else setEdition(false)
  }, [ligne?.id, editer, peutGerer])
  if (!ligne) return null

  const doc = docDe(ligne, budgets)
  const rev = ligne.brut?.revision || null
  const ajoute = Number(ligne.entree) || 0
  const motif = motifDe(ligne)
  const jour = ligne.date
  const moisDoc = jour.slice(0, 7)
  const dernierJour = (() => { const [a, m] = moisDoc.split('-').map(Number); return `${moisDoc}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}` })()

  const ouvrirEdition = () => {
    setForm({ montant: String(ajoute), motif, date: jour })
    setEdition(true)
  }

  async function enregistrer() {
    const montant = Number(form.montant)
    if (!(montant > 0)) return toast.error('Montant requis')
    if (!form.date) return toast.error('Date requise')
    setBusy(true)
    try {
      if (rev) {
        const heure = new Date(rev.date || Date.now())
        const nouvelleDate = new Date(`${form.date}T00:00:00`)
        nouvelleDate.setHours(heure.getHours(), heure.getMinutes(), heure.getSeconds())
        const brut = (doc.revisions || []).map((r) => (r.id === rev.id ? { ...r, nouveau: r.ancien + montant, motif: form.motif.trim(), date: nouvelleDate.getTime() } : r))
        await ecrireBudget(doc, recomputerChaine(brut))
      } else {
        await ecrireBudget(doc, null, montant)
      }
      await audit('depense', 'BUDGET_APPORT_MODIFIE', `Caisse courante : dotation modifiée (${fmt(montant)} FCFA)`, { secteurId: 'divers', mois: moisDoc })
      toast.success('Dotation modifiée ✓')
      onClose()
    } catch (e) {
      toast.error(e?.message || 'Modification impossible')
    } finally { setBusy(false) }
  }

  async function supprimer() {
    setBusy(true)
    const fait = await supprimerDotation(ligne, budgets)
    setBusy(false)
    if (fait) onClose()
  }

  return (
    <Modal open onClose={() => !busy && onClose()} size="md" title={edition ? 'Corriger la dotation' : 'Détail de la dotation'}
      {...glassModalProps(COULEUR_DOTATION)}
      footer={edition ? (
        <>
          <Button variant="ghost" onClick={() => setEdition(false)} disabled={busy}>Annuler</Button>
          <Button onClick={enregistrer} loading={busy}><Save size={15} /> Enregistrer</Button>
        </>
      ) : (
        <>
          {peutGerer && <Button variant="danger" onClick={supprimer} disabled={busy}><Trash2 size={15} /> Supprimer</Button>}
          {peutGerer && <Button variant="outline" onClick={ouvrirEdition} disabled={busy}><Pencil size={15} /> Corriger</Button>}
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
        </>
      )}>
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl p-3 text-white shadow-[0_12px_24px_-14px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.4)]"
          style={{ background: `linear-gradient(135deg, ${COULEUR_DOTATION}, ${COULEUR_DOTATION}b3 60%, #0f172a)` }}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_8px_rgba(0,0,0,0.25)]"><HandCoins size={22} /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/80">Dotation de la Caisse courante</p>
              <p className="text-2xl font-extrabold leading-tight">+{fmt(ajoute)} <span className="text-sm font-bold text-white/85">FCFA</span></p>
            </div>
          </div>
        </div>

        {edition ? (
          <div className="grid grid-cols-2 gap-2.5">
            <label className="col-span-2 block">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500"><span className="flex h-5 w-5 items-center justify-center rounded-md" style={icone3D('#16a34a')}><Banknote size={11} /></span>Montant (FCFA)</span>
              <input inputMode="numeric" value={form.montant} onChange={(e) => setForm((f) => ({ ...f, montant: e.target.value.replace(/[^0-9]/g, '') }))} className="input-base" />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500"><span className="flex h-5 w-5 items-center justify-center rounded-md" style={icone3D('#f59e0b')}><CalendarDays size={11} /></span>Date</span>
              <input type="date" min={`${moisDoc}-01`} max={dernierJour} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input-base" disabled={!rev} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500"><span className="flex h-5 w-5 items-center justify-center rounded-md" style={icone3D('#475569')}><FileText size={11} /></span>Motif</span>
              <input value={form.motif} onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))} className="input-base" disabled={!rev} />
            </label>
            <p className="col-span-2 text-[11px] text-gray-500">La date reste dans le mois de la dotation. Les totaux de la Caisse courante sont recalculés à l'enregistrement.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <Tuile icone={CalendarDays} couleur="#f59e0b" label="Date">{formatDateShort(jour)}</Tuile>
            <Tuile icone={PenLine} couleur="#2563eb" label="Saisie par">{ligne.operateur || (rev?.auteur && rev.auteur !== '—' ? rev.auteur : 'Non renseigné')}</Tuile>
            <Tuile icone={FileText} couleur="#475569" label="Motif" large>{motif || 'Dotation de caisse'}</Tuile>
            {rev && <Tuile icone={Wallet} couleur="#7c3aed" label="Caisse avant">{fmt(rev.ancien)} FCFA</Tuile>}
            {rev && <Tuile icone={TrendingUp} couleur={COULEUR_DOTATION} label="Caisse après">{fmt(rev.nouveau)} FCFA</Tuile>}
          </div>
        )}

        {!peutGerer && !edition && <p className="text-center text-[11px] text-gray-400">Seule l'administration peut corriger ou supprimer une dotation.</p>}
      </div>
    </Modal>
  )
}
