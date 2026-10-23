// COMPTABILITÉ — onglet IMMOBILIER / PATRIMOINE de l'entreprise.
// Recense les biens immobiliers (terrains, bâtiments, locaux…), leur valeur, leur
// statut juridique et, le cas échéant, les revenus locatifs. Chaque bien est
// rattaché à un compte SYSCOHADA (211 terrains / 213 constructions).
import { useMemo, useState } from 'react'
import { Building2, Plus, Pencil, Trash2, MapPin, Ruler, FileText, Map, Home, Store, Warehouse, Sprout, Check, Sparkles, Banknote, CalendarDays, Tag, Gavel, Layers, KeyRound, Users, StickyNote, BadgeCheck } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, icone3D } from '../../utils/color'
import { ANIMATIONS, CarteVerre, Info, BoutonAction, EtatVide } from './ui'
import { MODULES } from '../../shared/modules'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { NATURES_BIEN, getNatureBien, STATUTS_BIEN, COL } from './data'
import BandeauCompta, { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'

const COULEUR_COMPTA = MODULES.find((m) => m.id === 'comptabilite')?.color || '#ea580c'
// Icône de chaque nature de bien et couleur de chaque statut juridique (boutons de la fenêtre de saisie)
const ICONE_NATURE = { terrain: Map, terrain_bati: Home, immeuble: Building2, local_commercial: Store, entrepot: Warehouse, ferme: Sprout }
const COULEUR_STATUT = { proprietaire: '#16a34a', en_acquisition: '#f59e0b', loue: '#0ea5e9', litige: '#dc2626' }

const vide = () => ({
  designation: '', nature: '', natureAutre: '', statut: '', statutAutre: '',
  valeur: '', dateAcquisition: todayStr(), localisation: '', superficie: '',
  titreFoncier: '', loyerMensuel: '', locataire: '', affectation: '', note: ''
})

export default function Patrimoine() {
  const { patrimoine, loading } = useCompta()
  const [modal, setModal] = useState(null)
  const [filtreStatut, setFiltreStatut] = useState('')

  const liste = useMemo(() => [...patrimoine]
    .filter((b) => !filtreStatut || b.statut === filtreStatut)
    .sort((a, b) => (Number(b.valeur) || 0) - (Number(a.valeur) || 0)), [patrimoine, filtreStatut])

  const totaux = useMemo(() => patrimoine.reduce((t, b) => ({
    valeur: t.valeur + (Number(b.valeur) || 0),
    loyer: t.loyer + (Number(b.loyerMensuel) || 0),
    nb: t.nb + 1,
    loues: t.loues + (b.statut === 'loue' ? 1 : 0)
  }), { valeur: 0, loyer: 0, nb: 0, loues: 0 }), [patrimoine])

  const enregistrer = async () => {
    const v = {
      designation: modal.designation.trim(),
      nature: modal.nature,
      natureAutre: modal.nature === 'autre' ? (modal.natureAutre || '').trim() : '',
      statut: modal.statut,
      statutAutre: modal.statut === 'autre' ? (modal.statutAutre || '').trim() : '',
      valeur: Number(modal.valeur) || 0,
      dateAcquisition: modal.dateAcquisition,
      localisation: modal.localisation || '',
      superficie: modal.superficie || '',
      titreFoncier: modal.titreFoncier || '',
      loyerMensuel: Number(modal.loyerMensuel) || 0,
      locataire: modal.locataire || '',
      affectation: modal.affectation || '',
      note: modal.note || ''
    }
    if (modal.id) await updateItem(COL.patrimoine, modal.id, v)
    else await addItem(COL.patrimoine, v)
    setModal(null)
  }
  const supprimer = async (b) => {
    if (!confirm(`Supprimer le bien « ${b.designation || 'sans désignation'} » du patrimoine ?`)) return
    await removeItem(COL.patrimoine, b.id)
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <BandeauCompta icone={Building2} titre="Immobilier / Patrimoine" sous="Biens immobiliers de l'entreprise : terrains, bâtiments, locaux">
        <ChampBande label="Statut">
          <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className={CLASSE_CHAMP_BANDE}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS_BIEN).map(([k, st]) => <option key={k} value={k}>{st.label}</option>)}
          </select>
        </ChampBande>
        <BoutonBande icone={Plus} onClick={() => setModal(vide())}>Nouveau bien</BoutonBande>
      </BandeauCompta>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Valeur du patrimoine" value={formatMoney(totaux.valeur)} accent="#0d9488" icon={Building2} />
        <StatCard title="Nombre de biens" value={totaux.nb} accent="#2563eb" icon={MapPin} />
        <StatCard title="Biens en location" value={totaux.loues} accent="#0ea5e9" icon={KeyRound} />
        <StatCard title="Loyers mensuels perçus" value={formatMoney(totaux.loyer)} accent="#16a34a" icon={Banknote} />
      </div>


      <style>{ANIMATIONS}</style>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {liste.length === 0 && (
          <EtatVide icone={Building2} couleur="#0d9488" titre={filtreStatut ? 'Aucun bien avec ce statut' : 'Aucun bien enregistré'}
            texte="Terrains, immeubles, locaux : ajoutez les biens immobiliers de l'entreprise pour suivre leur valeur et leurs loyers."
            action={<Button onClick={() => setModal(vide())}><Plus size={15} /> Nouveau bien</Button>} />
        )}
        {liste.map((b, i) => {
          const nat = getNatureBien(b.nature)
          const st = STATUTS_BIEN[b.statut]
          const libNature = b.nature === 'autre' ? (b.natureAutre || 'Autre nature') : nat?.label
          const libStatut = b.statut === 'autre' ? (b.statutAutre || 'Autre statut') : st?.label
          const couleur = COULEUR_STATUT[b.statut] || '#0d9488'
          const IconeBien = ICONE_NATURE[b.nature] || Building2
          const loyer = Number(b.loyerMensuel) > 0
          return (
            <CarteVerre key={b.id} i={i} couleur={couleur}>
              <div className="relative flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" style={icone3D(couleur)}><IconeBien size={22} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-extrabold text-gray-800 dark:text-gray-100">{b.designation || 'Bien sans désignation'}</h3>
                  <p className="truncate text-[11px] text-gray-500">{libNature || 'Nature non précisée'}{nat ? ` · compte ${nat.compte}` : ''}</p>
                  {libStatut && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${couleur}, ${couleur}cc)` }}>
                      <BadgeCheck size={10} /> {libStatut}
                    </span>
                  )}
                </div>
              </div>

              <div className="relative rounded-2xl border border-white/70 px-3 py-2 backdrop-blur-md" style={{ background: `linear-gradient(135deg, ${couleur}1f, rgba(255,255,255,0.5))` }}>
                <p className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wide text-gray-500"><Banknote size={11} /> Valeur</p>
                <p className="text-xl font-extrabold leading-tight text-gray-900 dark:text-gray-50">{formatMoney(b.valeur)}</p>
              </div>

              <div className="relative grid grid-cols-2 gap-1.5">
                {b.localisation && <Info icone={MapPin} couleur="#dc2626" label="Localisation">{b.localisation}</Info>}
                {b.superficie && <Info icone={Ruler} couleur="#0ea5e9" label="Superficie">{b.superficie}</Info>}
                {b.titreFoncier && <Info icone={FileText} couleur="#475569" label="Titre foncier">{b.titreFoncier}</Info>}
                {b.dateAcquisition && <Info icone={CalendarDays} couleur="#f59e0b" label="Acquis le">{formatDateShort(b.dateAcquisition)}</Info>}
                {b.affectation && <Info icone={Layers} couleur="#E8850F" label="Affectation">{b.affectation}</Info>}
                {loyer && <Info icone={KeyRound} couleur="#16a34a" label={b.locataire ? `Loyer : ${b.locataire}` : 'Loyer mensuel'} className="col-span-2">{formatMoney(b.loyerMensuel)} / mois</Info>}
              </div>

              <div className="relative mt-auto flex justify-end gap-1.5 pt-0.5">
                <BoutonAction icone={Pencil} couleur="#2563eb" titre="Modifier" onClick={() => setModal({ ...b, valeur: String(b.valeur ?? ''), loyerMensuel: String(b.loyerMensuel ?? '') })} />
                <BoutonAction icone={Trash2} couleur="#dc2626" titre="Supprimer" onClick={() => supprimer(b)} />
              </div>
            </CarteVerre>
          )
        })}
      </div>

      {/* Saisie : bento grid en verre, icônes 3D, entrée en cascade. */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg" title={modal?.id ? 'Modifier le bien' : 'Nouveau bien immobilier'}
        {...glassModalProps(COULEUR_COMPTA)}
        footer={<>
          <Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
          <Button onClick={enregistrer}>Enregistrer</Button>
        </>}>
        {modal && (() => {
          const maj = (patch) => setModal((m) => ({ ...m, ...patch }))
          const nat = getNatureBien(modal.nature)
          const loue = modal.statut === 'loue'
          const puce = (actif) => `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pl-1 pr-2.5 text-[11px] font-extrabold backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95 ${actif ? 'border-white/70 text-white shadow-md' : 'border-gray-200 text-gray-600 hover:bg-white'}`
          const fondPuce = (actif, couleur) => (actif ? { background: `linear-gradient(135deg, ${couleur}, ${couleur}cc)`, boxShadow: `0 8px 16px -8px ${couleur}` } : { background: 'linear-gradient(135deg, #ffffffee, #f1f5f9)' })
          const puceAutre = (actif, onClick, label) => (
            <button type="button" aria-pressed={actif} title={actif ? 'Cliquer pour annuler ce choix' : 'Saisir un autre choix'} onClick={onClick}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-dashed py-1 pl-1 pr-2.5 text-[11px] font-extrabold transition-all hover:-translate-y-0.5 active:scale-95 ${actif ? 'border-white/70 text-white shadow-md' : 'text-gray-600 hover:bg-white'}`}
              style={actif ? { background: 'linear-gradient(135deg, #475569, #475569cc)', boxShadow: '0 8px 16px -8px #475569' } : { background: 'transparent', borderColor: '#94a3b8' }}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full" style={actif ? { background: 'rgba(255,255,255,0.28)' } : { border: '1.5px dashed #64748b', color: '#64748b' }}>
                {actif ? <Check size={11} strokeWidth={3.5} /> : <Plus size={10} strokeWidth={3} />}
              </span>
              {label}
            </button>
          )
          const IconeHero = ICONE_NATURE[modal.nature] || Building2
          return (
            <div className="grid grid-cols-6 gap-2.5">
              <style>{`
                @keyframes pt-entree { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
                @keyframes pt-pop { 0% { transform: scale(0.6); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
                @media (prefers-reduced-motion: reduce) { .pt-tuile, .pt-pop { animation: none !important; } }
              `}</style>

              {/* Héro : résumé du bien en cours de saisie */}
              <div className="pt-tuile relative col-span-6 overflow-hidden rounded-2xl p-3 text-white shadow-[0_12px_24px_-14px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.4)]"
                style={{ background: `linear-gradient(135deg, ${COULEUR_COMPTA}, ${COULEUR_COMPTA}b3 60%, #0f172a)`, animation: 'pt-entree 0.35s ease-out both' }}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                <div className="relative flex items-center gap-2.5">
                  <span key={modal.nature} className="pt-pop flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_8px_rgba(0,0,0,0.25)]" style={{ animation: 'pt-pop 0.35s ease-out both' }}>
                    <IconeHero size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold leading-tight">{modal.designation.trim() || (modal.id ? 'Modifier un bien' : 'Nouveau bien du patrimoine')}</p>
                    <p className="flex items-center gap-1 text-[11px] text-white/85"><Sparkles size={11} /> Rien n'est obligatoire · {modal.nature === 'autre' ? (modal.natureAutre || 'Autre nature') : (nat?.label || 'Bien immobilier')}{nat ? ` · compte ${nat.compte}` : ''}</p>
                  </div>
                  {Number(modal.valeur) > 0 && <span className="shrink-0 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-xs font-extrabold backdrop-blur-md">{formatMoney(Number(modal.valeur))}</span>}
                </div>
              </div>

              <Tuile i={1} className="col-span-6" icone={Tag} couleur="#7c3aed" label="Désignation">
                <input value={modal.designation} onChange={(e) => maj({ designation: e.target.value })} placeholder="ex. Immeuble R+2 : Adidogomé" className="input-base" />
              </Tuile>

              <Tuile i={2} className="col-span-6" icone={Building2} couleur="#0d9488" label="Nature du bien">
                <div className="flex flex-wrap gap-1.5">
                  {NATURES_BIEN.map((n) => {
                    const actif = modal.nature === n.id
                    const I = ICONE_NATURE[n.id] || Building2
                    return (
                      <button key={n.id} type="button" aria-pressed={actif} onClick={() => maj({ nature: actif ? '' : n.id, natureAutre: '' })} title={actif ? 'Cliquer pour annuler ce choix' : undefined} className={puce(actif)} style={fondPuce(actif, '#0d9488')}>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full" style={actif ? { background: 'rgba(255,255,255,0.28)' } : icone3D('#0d9488')}>
                          {actif ? <Check size={11} strokeWidth={3.5} /> : <I size={10} />}
                        </span>
                        {n.label}
                      </button>
                    )
                  })}
                  {puceAutre(modal.nature === 'autre', () => maj({ nature: modal.nature === 'autre' ? '' : 'autre', natureAutre: '' }), 'Autre nature…')}
                </div>
                {modal.nature === 'autre' && (
                  <input autoFocus value={modal.natureAutre || ''} onChange={(e) => maj({ natureAutre: e.target.value })} placeholder="Nature du bien (ex. Parking, Carrière)" className="input-base mt-2" />
                )}
              </Tuile>

              <Tuile i={3} className="col-span-6" icone={Gavel} couleur="#2563eb" label="Statut juridique">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STATUTS_BIEN).map(([k, st]) => {
                    const actif = modal.statut === k
                    const c = COULEUR_STATUT[k] || '#475569'
                    return (
                      <button key={k} type="button" aria-pressed={actif} onClick={() => maj({ statut: actif ? '' : k, statutAutre: '' })} title={actif ? 'Cliquer pour annuler ce choix' : undefined} className={puce(actif)} style={fondPuce(actif, c)}>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full" style={actif ? { background: 'rgba(255,255,255,0.28)' } : icone3D(c)}>
                          {actif ? <Check size={11} strokeWidth={3.5} /> : <BadgeCheck size={10} />}
                        </span>
                        {st.label}
                      </button>
                    )
                  })}
                  {puceAutre(modal.statut === 'autre', () => maj({ statut: modal.statut === 'autre' ? '' : 'autre', statutAutre: '' }), 'Autre statut…')}
                </div>
                {modal.statut === 'autre' && (
                  <input autoFocus value={modal.statutAutre || ''} onChange={(e) => maj({ statutAutre: e.target.value })} placeholder="Statut (ex. Indivision, Bail emphytéotique)" className="input-base mt-2" />
                )}
              </Tuile>

              <Tuile i={4} className="col-span-6 sm:col-span-3" icone={Banknote} couleur="#16a34a" label="Valeur (FCFA)">
                <input inputMode="numeric" value={modal.valeur} onChange={(e) => maj({ valeur: e.target.value.replace(/[^0-9]/g, '') })} placeholder="ex. 25000000" className="input-base" />
              </Tuile>
              <Tuile i={5} className="col-span-6 sm:col-span-3" icone={CalendarDays} couleur="#f59e0b" label="Date d'acquisition">
                <input type="date" value={modal.dateAcquisition} onChange={(e) => maj({ dateAcquisition: e.target.value })} className="input-base" />
              </Tuile>

              <Tuile i={6} className="col-span-6 sm:col-span-3" icone={MapPin} couleur="#dc2626" label="Localisation">
                <input value={modal.localisation} onChange={(e) => maj({ localisation: e.target.value })} placeholder="Ville / quartier" className="input-base" />
              </Tuile>
              <Tuile i={7} className="col-span-6 sm:col-span-3" icone={Ruler} couleur="#0ea5e9" label="Superficie">
                <input value={modal.superficie} onChange={(e) => maj({ superficie: e.target.value })} placeholder="ex. 600 m²" className="input-base" />
              </Tuile>

              <Tuile i={8} className="col-span-6 sm:col-span-3" icone={FileText} couleur="#475569" label="N° titre foncier / réf.">
                <input value={modal.titreFoncier} onChange={(e) => maj({ titreFoncier: e.target.value })} placeholder="TF n°…" className="input-base" />
              </Tuile>
              <Tuile i={9} className="col-span-6 sm:col-span-3" icone={Layers} couleur="#E8850F" label="Affectation (secteur)">
                <input value={modal.affectation} onChange={(e) => maj({ affectation: e.target.value })} placeholder="ex. MAXI-AGRO" className="input-base" />
              </Tuile>

              {/* Location : mise en avant quand le bien est donné en location */}
              <Tuile i={10} className={`col-span-6 sm:col-span-3 ${loue ? 'ring-2 ring-sky-300/70' : ''}`} icone={KeyRound} couleur="#0ea5e9" label="Loyer mensuel (si loué)">
                <input inputMode="numeric" value={modal.loyerMensuel} onChange={(e) => maj({ loyerMensuel: e.target.value.replace(/[^0-9]/g, '') })} placeholder="ex. 150000" className="input-base" />
              </Tuile>
              <Tuile i={11} className={`col-span-6 sm:col-span-3 ${loue ? 'ring-2 ring-sky-300/70' : ''}`} icone={Users} couleur="#7c3aed" label="Locataire">
                <input value={modal.locataire} onChange={(e) => maj({ locataire: e.target.value })} className="input-base" />
              </Tuile>

              <Tuile i={12} className="col-span-6" icone={StickyNote} couleur="#64748b" label="Note">
                <textarea value={modal.note} onChange={(e) => maj({ note: e.target.value })} rows={2} className="input-base" />
              </Tuile>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

// Tuile du bento : verre dépoli, petite icône 3D devant le libellé, entrée en cascade (`i` = rang).
function Tuile({ i = 0, className = '', icone: Icone, couleur, label, children }) {
  return (
    <div className={`pt-tuile rounded-2xl border border-white/70 bg-white/55 p-2.5 shadow-[0_8px_20px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-shadow hover:shadow-[0_12px_26px_-14px_rgba(26,26,26,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] ${className}`}
      style={{ animation: `pt-entree 0.35s ease-out ${0.04 * i}s both` }}>
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={icone3D(couleur)}><Icone size={11} /></span>
        {label}
      </label>
      {children}
    </div>
  )
}
