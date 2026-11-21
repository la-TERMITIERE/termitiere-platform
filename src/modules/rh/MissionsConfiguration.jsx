// RH : configuration des missions (Missions & Frais). Barème d'indemnités journalières et plafonds de remboursement par type de frais,
// en cartes de verre dépoli (une carte par barème), avec un formulaire aux champs arrondis.
import { useState } from 'react'
import { Settings, Plus, Pencil, Trash2, Tag, Banknote, Gauge } from 'lucide-react'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { icone3D } from '../../utils/color'
import { PageHeader, Champ, ModalRh } from './rhui'
import { usePeutSupprimerRh, supprimerAvecRetour } from './suppression'

const COLLECTION = 'rh_bareme_missions'
const COULEUR = '#7c3aed'
const vide = () => ({ typeFrais: '', indemniteJour: '', plafond: '' })

export default function MissionsConfiguration() {
  const { data: baremes } = useCollection(COLLECTION)
  const [modal, setModal] = useState(null)
  const [tente, setTente] = useState(false)

  async function enregistrer() {
    setTente(true)
    if (!modal.typeFrais.trim()) return toast.error('Indiquez le type de frais')
    const data = { typeFrais: modal.typeFrais.trim(), indemniteJour: Number(modal.indemniteJour) || 0, plafond: Number(modal.plafond) || 0 }
    try {
      if (modal.id) await updateItem(COLLECTION, modal.id, data); else await addItem(COLLECTION, data)
      toast.success(modal.id ? 'Barème corrigé ✓' : 'Barème enregistré ✓'); setModal(null)
    } catch (err) { toast.error(err?.message || 'Enregistrement impossible : réessayez') }
  }
  // Suppression réservée à l'administration ; la fenêtre « Motif » sert de confirmation.
  const peutSupprimer = usePeutSupprimerRh()
  const supprimer = (b) => supprimerAvecRetour(() => removeItem(COLLECTION, b.id))

  return (
    <div className="space-y-5">
      <PageHeader icon={Settings} sousModule="Paramètres" titre="Configuration des missions" sousTitre="Barème d'indemnités journalières et plafonds de remboursement."
        action={<BoutonBande anime icone={Plus} onClick={() => { setTente(false); setModal({ ...vide() }) }}>Nouveau barème</BoutonBande>} />

      {baremes.length === 0 ? (
        <p className="rounded-3xl border border-white/80 bg-white/60 px-4 py-10 text-center text-sm text-gray-400 backdrop-blur-xl">Aucun barème défini. Cliquez « Nouveau barème » (hébergement, transport, restauration…).</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {baremes.map((b, i) => (
            <div key={b.id} className="ed-entree group relative overflow-hidden rounded-[1.9rem] border border-white/70 bg-white/55 p-4 shadow-[0_14px_34px_-18px_rgba(26,26,26,0.35),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl transition-all hover:-translate-y-0.5" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-25 blur-3xl" style={{ background: COULEUR }} />
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D(COULEUR)}><Tag size={19} aria-hidden="true" /></span>
                  <p className="truncate text-base font-extrabold text-gray-800">{b.typeFrais}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => { setTente(false); setModal({ id: b.id, typeFrais: b.typeFrais || '', indemniteJour: b.indemniteJour || '', plafond: b.plafond || '' }) }} aria-label={`Modifier ${b.typeFrais}`} className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"><Pencil size={15} /></button>
                  {peutSupprimer && <button type="button" onClick={() => supprimer(b)} aria-label={`Supprimer ${b.typeFrais}`} className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="relative mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-2xl border border-white/80 bg-white/60 px-2 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Indemnité / jour</p><p className="text-sm font-black tabular-nums text-gray-800">{b.indemniteJour ? formatMoney(b.indemniteJour) : '—'}</p></div>
                <div className="rounded-2xl border border-white/80 bg-white/60 px-2 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Plafond</p><p className="text-sm font-black tabular-nums text-gray-800">{b.plafond ? formatMoney(b.plafond) : '—'}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le barème' : 'Nouveau barème'} icone={Settings} titreHero={modal?.typeFrais?.trim() || 'Barème de frais'}
        intro="Indemnité journalière et plafond de remboursement pour un type de frais." onSave={enregistrer}>
        {modal && (<>
          <Champ label="Type de frais" icone={Tag} required erreur={tente && !modal.typeFrais.trim() ? 'Le type de frais est obligatoire.' : undefined}>
            <input value={modal.typeFrais} onChange={(e) => setModal({ ...modal, typeFrais: e.target.value })} className="input-base" placeholder="Ex. Hébergement, Transport, Restauration" autoFocus />
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Indemnité journalière (XOF)" icone={Banknote}>
              <input type="number" min="0" value={modal.indemniteJour} onChange={(e) => setModal({ ...modal, indemniteJour: e.target.value })} className="input-base" placeholder="Ex. 15000" />
            </Champ>
            <Champ label="Plafond de remboursement (XOF)" icone={Gauge}>
              <input type="number" min="0" value={modal.plafond} onChange={(e) => setModal({ ...modal, plafond: e.target.value })} className="input-base" placeholder="Ex. 200000" />
            </Champ>
          </div>
        </>)}
      </ModalRh>
    </div>
  )
}
