// Besoins projet — matériaux, main d'œuvre, équipement… à faire remonter au
// responsable du projet. Remplace l'ancien volet Commentaires.
import { useState, useMemo, useEffect } from 'react'
import { Plus, Pencil, Trash2, PackagePlus, Play, CheckCircle2, XCircle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, setItem, removeItem, updateItem } from '../../core/db'
import { useAuth } from '../../hooks/useAuth'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { formatDateShort, formatDateTime } from '../../utils/formatters'
import { STATUTS_PROJET, PRIORITES } from './data'
import { marquerVoletVu } from './vues'
import { projetsVisibles, scopeParProjets } from './logic'

const CATEGORIES_BESOIN = [
  { id: 'main_oeuvre',   label: 'Main d\'œuvre'  },
  { id: 'materiaux',     label: 'Matériaux'       },
  { id: 'equipement',    label: 'Équipement'      },
  { id: 'transport',     label: 'Transport'       },
  { id: 'autre',         label: 'Autre'           }
]

const STATUTS_BESOIN = {
  a_traiter: { label: 'À traiter', tone: 'warning' },
  en_cours:  { label: 'En cours',  tone: 'info'     },
  satisfait: { label: 'Satisfait', tone: 'success'  },
  annule:    { label: 'Annulé',    tone: 'neutral'  }
}

const VIDE = {
  projetId: '', titre: '', categorie: 'materiaux', quantite: '',
  priorite: 'normale', dateSouhaitee: '', note: ''
}

export default function Besoins() {
  const { data: projetsTous } = useCollection('projets')
  const { data: besoinsTous } = useCollection('projet_besoins')
  const { user, role } = useAuth()
  // Le superviseur crée/modifie/traite les besoins, mais ne les supprime pas.
  const peutSupprimer = role !== 'superviseur'
  useEffect(() => { marquerVoletVu(user?.uid, 'projetBesoins') }, [user?.uid])

  // Cloisonnement : un chef de projet ne voit que les besoins de ses projets.
  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const besoins = useMemo(() => scopeParProjets(besoinsTous, projets), [besoinsTous, projets])

  const [filtreProjet, setFiltreProjet] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)

  const liste = useMemo(() =>
    besoins
      .filter((b) => !filtreProjet || b.projetId === filtreProjet)
      .filter((b) => !filtreStatut || b.statut === filtreStatut)
      .sort((a, b) => {
        const ordre = { a_traiter: 0, en_cours: 1, satisfait: 2, annule: 3 }
        if (ordre[a.statut] !== ordre[b.statut]) return (ordre[a.statut] ?? 0) - (ordre[b.statut] ?? 0)
        return (b.createdAt || 0) - (a.createdAt || 0)
      }),
  [besoins, filtreProjet, filtreStatut])

  const compteur = (st) => besoins.filter((b) => b.statut === st).length

  const openCreate = () => { setForm({ ...VIDE, projetId: filtreProjet }); setEditing(null); setModal(true) }
  const openEdit   = (b) => {
    setForm({
      projetId: b.projetId || '', titre: b.titre || '', categorie: b.categorie || 'materiaux',
      quantite: b.quantite || '', priorite: b.priorite || 'normale',
      dateSouhaitee: b.dateSouhaitee ? new Date(b.dateSouhaitee).toISOString().slice(0, 10) : '',
      note: b.note || ''
    })
    setEditing(b); setModal(true)
  }

  // Le besoin est adressé au responsable du projet — notification directe à la création.
  // Si le créateur EST le responsable (cas le plus fréquent pour un chef de projet),
  // il n'y a personne à notifier côté projet : on remonte plutôt à la direction.
  async function notifierResponsable(projetId, titre) {
    const projet = projets.find((p) => p.id === projetId)
    if (!projet) return
    if (projet.responsableUid && projet.responsableUid !== user?.uid) {
      await notify({
        type: 'info',
        title: `📦 Nouveau besoin — ${projet.nom}`,
        body: titre,
        module: 'projet', forUsers: [projet.responsableUid], link: '/projet/besoins'
      }).catch(() => {})
    } else {
      await notify({
        type: 'info',
        title: `📦 Nouveau besoin — ${projet.nom}`,
        body: titre,
        module: 'projet', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid, link: '/projet/besoins'
      }).catch(() => {})
    }
  }

  const handleSave = async () => {
    if (!form.titre.trim() || !form.projetId || !form.quantite.trim()) return
    setSaving(true)
    try {
      const now = Date.now()
      const payload = {
        ...form,
        titre: form.titre.trim(),
        dateSouhaitee: form.dateSouhaitee ? new Date(form.dateSouhaitee).getTime() : null,
        updatedAt: now
      }
      if (editing) {
        await setItem('projet_besoins', editing.id, { ...editing, ...payload })
        await audit('projet', 'besoin_modifie', payload.titre)
      } else {
        await addItem('projet_besoins', {
          ...payload, statut: 'a_traiter', createdAt: now,
          demandePar: user?.nom || user?.login || null
        })
        await audit('projet', 'besoin_cree', payload.titre)
        await notifierResponsable(form.projetId, payload.titre)
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (b) => {
    if (!peutSupprimer) return
    if (!window.confirm('Supprimer ce besoin ?')) return
    await removeItem('projet_besoins', b.id)
  }

  const changerStatut = async (b, statut) => {
    await updateItem('projet_besoins', b.id, { statut, updatedAt: Date.now() })
    await audit('projet', 'besoin_' + statut, b.titre)
  }

  const catLabel = (id) => CATEGORIES_BESOIN.find((c) => c.id === id)?.label || id

  const enAttente = besoins.filter((b) => b.statut === 'a_traiter' || b.statut === 'en_cours').length

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),0_8px_20px_-8px_rgba(13,148,136,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.85) 0%, rgba(15,84,80,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0d9488', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <PackagePlus size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Besoins</h2>
          <p className="text-sm text-white/80">
            {enAttente > 0 ? `${enAttente} besoin(s) à traiter` : 'Tout est pris en charge'} — matériaux, main d'œuvre, équipement
          </p>
        </div>
      </div>

      {/* Filtres + compteurs */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
          {[['', `Tous (${besoins.length})`], ...Object.entries(STATUTS_BESOIN).map(([k, v]) => [k, `${v.label} (${compteur(k)})`])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-white'}`}>
              {l}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} size="sm" className="ml-auto"><Plus size={14} className="mr-1" />Nouveau besoin</Button>
      </div>

      {/* Liste */}
      {!liste.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <PackagePlus size={32} className="opacity-30" />
            <p className="text-sm">Aucun besoin{filtreProjet ? ' pour ce projet' : ''}.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {liste.map((b) => {
            const projet = projets.find((p) => p.id === b.projetId)
            const st = STATUTS_BESOIN[b.statut] || STATUTS_BESOIN.a_traiter
            return (
              <Card key={b.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{b.titre}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {projet && <Badge tone={STATUTS_PROJET[projet.statut]?.tone}>{projet.nom}</Badge>}
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">{catLabel(b.categorie)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITES[b.priorite]?.tone === 'danger' ? 'bg-red-50 text-red-700' : PRIORITES[b.priorite]?.tone === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                        {PRIORITES[b.priorite]?.label || b.priorite}
                      </span>
                    </div>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                {b.quantite && <p className="text-sm text-gray-600">Quantité : <b>{b.quantite}</b></p>}
                {b.dateSouhaitee && <p className="text-xs text-gray-500">Souhaité pour le {formatDateShort(b.dateSouhaitee)}</p>}
                {b.note && <p className="text-sm text-gray-600 italic">« {b.note} »</p>}
                <p className="text-[11px] text-gray-400">
                  Demandé par {b.demandePar || '—'}{b.createdAt ? ` · ${formatDateTime(b.createdAt)}` : ''}
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  {b.statut === 'a_traiter' && (
                    <Button size="sm" variant="outline" onClick={() => changerStatut(b, 'en_cours')}>
                      <Play size={13} /> Prendre en charge
                    </Button>
                  )}
                  {(b.statut === 'a_traiter' || b.statut === 'en_cours') && (
                    <Button size="sm" variant="success" onClick={() => changerStatut(b, 'satisfait')}>
                      <CheckCircle2 size={13} /> Satisfait
                    </Button>
                  )}
                  {b.statut !== 'annule' && b.statut !== 'satisfait' && (
                    <Button size="sm" variant="danger" onClick={() => changerStatut(b, 'annule')}>
                      <XCircle size={13} /> Annuler
                    </Button>
                  )}
                  <button onClick={() => openEdit(b)} className="ml-auto rounded-lg border border-teal-200 bg-teal-50 p-1.5 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-100"><Pencil size={14} /></button>
                  {peutSupprimer && (
                    <button onClick={() => handleDelete(b)} className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={14} /></button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal création/édition */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier le besoin' : 'Nouveau besoin'}>
        <div className="space-y-3">
          <FormGroup label="Projet" required>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value }))}>
              <option value="">— Sélectionner —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Besoin" required hint="Ce qui manque ou doit être fourni">
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="ex : Ciment, ouvriers supplémentaires, bétonnière…"
              value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} />
          </FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Catégorie">
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}>
                {CATEGORIES_BESOIN.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Priorité">
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={form.priorite} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))}>
                {Object.entries(PRIORITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Quantité" required>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="ex : 50 sacs"
                value={form.quantite} onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Souhaité pour le" hint="Optionnel">
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.dateSouhaitee} onChange={(e) => setForm((f) => ({ ...f, dateSouhaitee: e.target.value }))} />
            </FormGroup>
          </div>
          <FormGroup label="Note" hint="Optionnel">
            <textarea rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </FormGroup>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.titre.trim() || !form.projetId || !form.quantite.trim()}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
