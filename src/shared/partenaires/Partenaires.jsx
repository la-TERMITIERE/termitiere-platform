// Onglet « Partenaires » — contacts externes d'un secteur (vétérinaires, techniciens,
// prestataires, fournisseurs…). Ce ne sont PAS des employés : ils vivent dans une
// collection dédiée `${module}_partenaires`, indépendante des utilisateurs.
//
// Accès en écriture restreint : seuls les rôles à accès total et l'utilisateur à qui
// la direction a « donné la main » (champ profil `gerePartenaires`) peuvent
// ajouter / modifier / supprimer. Les autres n'atteignent normalement pas cet onglet
// (masqué dans la navigation) ; s'ils y accèdent, il reste en lecture seule.
//
// Présentation : une carte par partenaire (avatar, type, appel et WhatsApp en un geste), filtrée par type.
import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Handshake, Phone, MessageCircle, Tag, UserRound, Eye, Users, Save, X } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import BoutonVerre from '../ui/BoutonVerre'
import Modal from '../ui/Modal'
import BandeauVolet, { BoutonBande, OngletsBande } from '../ui/BandeauVolet'
import ChampRecherche, { correspond } from '../ui/ChampRecherche'
import Input from '../forms/Input'
import ChampAutocomplete from '../forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { canManagePartenaires } from '../../core/roles'
import { COULEUR_MODULE, icone3D, avatarGradient, glassModalProps } from '../../utils/color'

const empty = () => ({ nom: '', contact: '', type: '' })

// Suggestions de « type / spécificité » par plateforme (le champ reste libre).
const SUGGESTIONS = {
  agro: ['Vétérinaire', 'Technicien agricole', "Fournisseur d'intrants", 'Provendier', 'Transporteur'],
  logistique: ['Transporteur', 'Loueur de matériel', 'Prestataire événementiel', 'Fournisseur'],
  evenementiel: ['Fournisseur (ciment / sable)', 'Transporteur', 'Revendeur', 'Maçon'],
  foncier: ['Géomètre', 'Notaire', 'Huissier', 'Avocat', 'Agent domanial'],
  garderie: ['Pédiatre', 'Fournisseur alimentaire', "Prestataire d'activités", 'Transporteur'],
  projet: ['Sous-traitant', 'Consultant', 'Fournisseur', "Bureau d'études"],
  depense: ['Fournisseur', 'Prestataire', 'Banque']
}

const initiales = (nom) => (nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '?'
// Numéro réduit aux chiffres, pour les liens d'appel et WhatsApp (sans le « + » ni les espaces).
// Un numéro local à 8 chiffres (ex. 90 77 33 36) reçoit l'indicatif du Togo (228).
const chiffres = (contact) => { const n = String(contact || '').replace(/[^\d]/g, ''); return n.length === 8 ? `228${n}` : n }

function Etiquette({ icone: Icone, couleur, children }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
      <span className="ed-flotte flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(couleur)}><Icone size={13} /></span>
      {children}
    </span>
  )
}

export default function Partenaires({ module, suggestions }) {
  const { user, role } = useAuth()
  const peutGerer = canManagePartenaires(role, user)
  const listeSuggestions = suggestions || SUGGESTIONS[module] || []
  const col = `${module}_partenaires`
  const couleur = COULEUR_MODULE[module] || '#0d9488'
  const { data: partenaires } = useCollection(col)
  const [modal, setModal] = useState(null) // { data, id }
  const [recherche, setRecherche] = useState('')
  const [filtreType, setFiltreType] = useState('') // '' = tous

  const liste = useMemo(
    () => [...partenaires].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')),
    [partenaires]
  )
  // Types présents, avec leur effectif : alimentent les pastilles de filtre.
  const types = useMemo(() => {
    const m = new Map()
    liste.forEach((p) => { const t = (p.type || '').trim(); if (t) m.set(t, (m.get(t) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [liste])
  const affiches = useMemo(
    () => liste.filter((p) => (!filtreType || (p.type || '').trim() === filtreType) && correspond(recherche, p.nom, p.contact, p.type)),
    [liste, filtreType, recherche]
  )

  async function save() {
    if (!peutGerer) return toast.error('Action réservée au gestionnaire des partenaires')
    const p = { nom: modal.data.nom.trim(), contact: (modal.data.contact || '').trim(), type: (modal.data.type || '').trim() }
    if (!p.nom) return toast.error('Nom du partenaire requis')
    if (modal.id) { await updateItem(col, modal.id, p); await audit(module, 'PARTENAIRE_EDIT', p.nom) }
    else { await addItem(col, p); await audit(module, 'PARTENAIRE', `${p.nom}${p.type ? ' : ' + p.type : ''}`) }
    toast.success('Partenaire enregistré ✓')
    setModal(null)
  }

  async function supprimer(r) {
    if (!peutGerer) return toast.error('Action réservée au gestionnaire des partenaires')
    if (!confirm(`Supprimer le partenaire « ${r.nom} » ?`)) return
    await removeItem(col, r.id)
    await audit(module, 'PARTENAIRE_DELETE', r.nom)
    toast.success('Partenaire supprimé')
  }

  const maj = (patch) => setModal((m) => ({ ...m, data: { ...m.data, ...patch } }))

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={couleur} icone={Handshake} titre="Partenaires"
        sous={`${liste.length} partenaire(s) : contacts externes du secteur, ce ne sont pas des employés.`}
        pied={types.length > 0 ? (
          <OngletsBande valeur={filtreType} onChange={setFiltreType} taille="sm"
            options={[{ id: '', label: `Tous (${liste.length})` }, ...types.map(([t, n]) => ({ id: t, label: `${t} (${n})` }))]} />
        ) : null}>
        <ChampRecherche variant="glass" className="!w-52" value={recherche} onChange={setRecherche} placeholder="Nom, type, téléphone…" />
        {peutGerer && <BoutonBande icone={Plus} anime onClick={() => setModal({ data: empty(), id: null })}>Nouveau partenaire</BoutonBande>}
      </BandeauVolet>

      {!peutGerer && (
        <div className="ed-entree flex items-center gap-2 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 text-sm text-sky-800 backdrop-blur-xl">
          <span className="ed-flotte flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={icone3D('#0284c7')}><Eye size={14} /></span>
          Mode consultation : la gestion des partenaires est réservée à l'utilisateur désigné par la direction.
        </div>
      )}

      {affiches.length === 0 ? (
        <Card className="ed-entree">
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <span className="ed-flotte flex h-14 w-14 items-center justify-center rounded-2xl" style={icone3D('#94a3b8')}><Users size={26} /></span>
            <p className="text-sm">{liste.length === 0 ? 'Aucun partenaire enregistré.' : 'Aucun partenaire ne correspond à votre recherche.'}</p>
          </div>
        </Card>
      ) : (
        <div className="ed-grille grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {affiches.map((p) => {
            const tel = chiffres(p.contact)
            return (
              <div key={p.id} className="group relative overflow-hidden rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_14px_30px_-18px_rgba(26,26,26,0.3),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-16px_rgba(26,26,26,0.35)]"
                style={{ borderTop: `3px solid ${couleur}` }}>
                <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-[0.12] blur-2xl" style={{ background: couleur }} />
                <div className="relative flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white shadow-[inset_0_2px_2px_rgba(255,255,255,0.5),0_8px_16px_-8px_rgba(0,0,0,0.5)]" style={{ background: avatarGradient(p.nom) }}>{initiales(p.nom)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-gray-800" title={p.nom}>{p.nom}</p>
                    {p.type
                      ? <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${couleur}1a`, color: couleur }}><Tag size={10} />{p.type}</span>
                      : <span className="mt-1 inline-block text-[11px] text-gray-400">Type non précisé</span>}
                  </div>
                  {peutGerer && (
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => setModal({ data: { ...empty(), ...p }, id: p.id })} title="Modifier" className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-all hover:-translate-y-0.5 hover:text-gray-800"><Pencil size={14} /></button>
                      <button onClick={() => supprimer(p)} title="Supprimer" className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-50"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                <div className="relative mt-3 flex items-center gap-2">
                  {p.contact ? (
                    <>
                      <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-xl bg-white/80 px-2.5 py-1.5 text-xs font-bold text-gray-700 shadow-sm"><Phone size={13} className="shrink-0" style={{ color: couleur }} /> <span className="truncate">{p.contact}</span></span>
                      {tel && (
                        <>
                          <a href={`tel:+${tel}`} title="Appeler" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-md transition-all hover:-translate-y-0.5 active:scale-90" style={icone3D('#0ea5e9')}><Phone size={14} /></a>
                          <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" title="Écrire sur WhatsApp" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-md transition-all hover:-translate-y-0.5 active:scale-90" style={icone3D('#16a34a')}><MessageCircle size={14} /></a>
                        </>
                      )}
                    </>
                  ) : <span className="text-[11px] text-gray-400">Aucun numéro enregistré</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} size="sm" {...glassModalProps(couleur)} title={modal?.id ? 'Modifier le partenaire' : 'Nouveau partenaire'}
        footer={<><Button variant="outline" onClick={() => setModal(null)}><X size={15} /> Annuler</Button><BoutonVerre icone={Save} onClick={save} disabled={!modal?.data.nom.trim()}>Enregistrer</BoutonVerre></>}>
        {modal && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm">
              <Etiquette icone={UserRound} couleur={couleur}>Nom du partenaire <span className="text-red-500">*</span></Etiquette>
              <Input value={modal.data.nom} onChange={(e) => maj({ nom: e.target.value })} placeholder="ex : Dr Koffi / Clinique vétérinaire du Golfe" autoFocus />
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm">
              <Etiquette icone={Tag} couleur="#7c3aed">Type / spécificité</Etiquette>
              <ChampAutocomplete value={modal.data.type} onChange={(v) => maj({ type: v })} suggestions={listeSuggestions} placeholder="ex : Vétérinaire" />
              {listeSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {listeSuggestions.map((sug) => (
                    <button key={sug} type="button" onClick={() => maj({ type: sug })}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all hover:-translate-y-0.5 ${modal.data.type === sug ? 'border-transparent text-white shadow-md' : 'border-gray-200 bg-white text-gray-600'}`}
                      style={modal.data.type === sug ? { background: couleur } : undefined}>{sug}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm">
              <Etiquette icone={Phone} couleur="#16a34a">Contact / téléphone</Etiquette>
              <Input value={modal.data.contact} onChange={(e) => maj({ contact: e.target.value })} placeholder="ex : 22890000000" inputMode="tel" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
