// Matériel projet — suivi du matériel présent sur chantier, contrôlé par le chef
// de projet (outillage, véhicules, gros équipement, consommables…). Liste
// indépendante du référentiel Maxi Logistique.
//
// Les consommables (ciment, sable…) ont un stock NUMÉRIQUE : chaque entrée
// (livraison) augmente le stock, chaque sortie (utilisation) le diminue. Le
// stock actuel = somme des entrées − somme des sorties (jamais négatif).
import { useState, useMemo, useEffect } from 'react'
import { Plus, Pencil, Trash2, Wrench, CheckCircle2, AlertTriangle, XCircle, RotateCcw, PlusCircle, MinusCircle, ChevronDown, ChevronUp, Ban } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, setItem, removeItem, updateItem } from '../../core/db'
import { useAuth } from '../../hooks/useAuth'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { formatDateShort, formatDateTime } from '../../utils/formatters'
import { marquerVoletVu } from './vues'
import { projetsVisibles, scopeParProjets } from './logic'

const CATEGORIES_MATERIEL = [
  { id: 'consommable',     label: 'Consommable (ciment, sable…)' },
  { id: 'outillage',       label: 'Outillage'        },
  { id: 'vehicule',        label: 'Véhicule'          },
  { id: 'gros_equipement', label: 'Gros équipement'   },
  { id: 'autre',           label: 'Autre'             }
]

const UNITES_SUGGESTIONS = ['sac', 'unité', 'm³', 'litre', 'kg', 'tonne', 'brouette']

const ETATS_MATERIEL = {
  bon_etat:     { label: 'Bon état',      tone: 'success' },
  a_reparer:    { label: 'À réparer',     tone: 'warning' },
  hors_service: { label: 'Hors service',  tone: 'danger'  }
}

const STATUTS_MATERIEL = {
  sur_site:  { label: 'Sur site',  tone: 'info'    },
  retourne:  { label: 'Retourné',  tone: 'neutral' },
  perdu:     { label: 'Perdu',     tone: 'danger'  }
}

const VIDE = {
  projetId: '', nom: '', categorie: 'consommable', unite: '',
  quantiteInitiale: '', etat: 'bon_etat', dateEntree: '', note: ''
}

// Stock = somme des entrées − somme des sorties, recalculé à partir de
// l'historique des mouvements (source unique de vérité — jamais négatif).
function calculerStock(mouvements = []) {
  const total = mouvements.reduce((s, mv) => s + (mv.type === 'entree' ? Number(mv.quantite) || 0 : -(Number(mv.quantite) || 0)), 0)
  return Math.max(0, total)
}

// Total cumulé des sorties (quantité déjà utilisée/consommée) — affiché à côté du reste.
function calculerSorties(mouvements = []) {
  return mouvements.reduce((s, mv) => s + (mv.type === 'sortie' ? Number(mv.quantite) || 0 : 0), 0)
}

// Total cumulé des entrées (quantité livrée/reçue depuis le début).
function calculerEntrees(mouvements = []) {
  return mouvements.reduce((s, mv) => s + (mv.type === 'entree' ? Number(mv.quantite) || 0 : 0), 0)
}

export default function Materiel() {
  const { data: projetsTous }   = useCollection('projets')
  const { data: materielsTous } = useCollection('projet_materiels')
  const { user, role } = useAuth()
  // Le superviseur crée/modifie/suit le matériel, mais ne supprime rien.
  // Accès complet pour la secrétaire/l'agent, sauf la suppression (réservée).
  const peutSupprimer = !['superviseur', 'partenaire', 'secretaire', 'agent'].includes(role)
  useEffect(() => { marquerVoletVu(user?.uid, 'projetMateriel') }, [user?.uid])

  // Cloisonnement : un chef de projet ne voit que le matériel de ses projets.
  const projets   = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const materiels = useMemo(() => scopeParProjets(materielsTous, projets), [materielsTous, projets])

  const [filtreProjet, setFiltreProjet]   = useState('')
  const [filtreCategorie, setFiltreCateg] = useState('')
  const [filtreStatut, setFiltreStatut]   = useState('sur_site')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [mouvement, setMouvement]   = useState(null) // { materiel, type: 'entree' | 'sortie' }
  const [mvtQte, setMvtQte]         = useState('')
  const [mvtNote, setMvtNote]       = useState('')
  const [historiqueOuvert, setHistoriqueOuvert] = useState(null) // id du matériel dont l'historique est ouvert
  const [detail, setDetail] = useState(null)

  const liste = useMemo(() =>
    materiels
      .filter((m) => !filtreProjet    || m.projetId  === filtreProjet)
      .filter((m) => !filtreCategorie || m.categorie === filtreCategorie)
      .filter((m) => !filtreStatut    || m.statut    === filtreStatut)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  [materiels, filtreProjet, filtreCategorie, filtreStatut])

  const compteur = (statut) => materiels.filter((m) => m.statut === statut).length
  const catLabel = (id) => CATEGORIES_MATERIEL.find((c) => c.id === id)?.label || id

  const openCreate = () => { setForm({ ...VIDE, projetId: filtreProjet }); setEditing(null); setModal(true) }
  const openEdit   = (m) => {
    setForm({
      projetId: m.projetId || '', nom: m.nom || '', categorie: m.categorie || 'consommable',
      unite: m.unite || '', quantiteInitiale: '', etat: m.etat || 'bon_etat',
      dateEntree: m.dateEntree ? new Date(m.dateEntree).toISOString().slice(0, 10) : '',
      note: m.note || ''
    })
    setEditing(m); setModal(true)
  }

  const handleSave = async () => {
    if (!form.nom.trim() || !form.projetId) return
    if (!editing && form.quantiteInitiale === '') return
    setSaving(true)
    try {
      const now = Date.now()
      const { quantiteInitiale, ...rest } = form
      const payload = {
        ...rest, nom: form.nom.trim(), unite: form.unite.trim(),
        dateEntree: form.dateEntree ? new Date(form.dateEntree).getTime() : now,
        updatedAt: now
      }
      if (editing) {
        await setItem('projet_materiels', editing.id, { ...editing, ...payload })
        await audit('projet', 'materiel_modifie', payload.nom)
      } else {
        const qteInit = Number(quantiteInitiale) || 0
        const mouvements = qteInit > 0
          ? [{ id: `mvt_${now}`, type: 'entree', quantite: qteInit, note: 'Stock initial', date: now, auteur: user?.nom || user?.login || null }]
          : []
        await addItem('projet_materiels', {
          ...payload, statut: 'sur_site', quantite: qteInit, mouvements, createdAt: now,
          responsable: user?.nom || user?.login || null, ajouteParUid: user?.uid || null
        })
        await audit('projet', 'materiel_ajoute', payload.nom)
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (m) => {
    if (!peutSupprimer) return
    if (!window.confirm(`Retirer "${m.nom}" du suivi matériel ?`)) return
    await removeItem('projet_materiels', m.id)
  }

  const changerStatut = async (m, statut) => {
    await updateItem('projet_materiels', m.id, { statut, updatedAt: Date.now() })
    await audit('projet', 'materiel_' + statut, m.nom)
  }

  const changerEtat = async (m, etat) => {
    await updateItem('projet_materiels', m.id, { etat, updatedAt: Date.now() })
  }

  // ── Mouvements de stock (entrée / sortie) — ajout, correction et suppression ──
  const ouvrirMouvement = (m, type) => { setMouvement({ materiel: m, type }); setMvtQte(''); setMvtNote('') }

  const ouvrirEditionMouvement = (m, mv) => {
    setMouvement({ materiel: m, type: mv.type, edit: mv })
    setMvtQte(String(mv.quantite))
    setMvtNote(mv.note || '')
  }

  const confirmerMouvement = async () => {
    const qte = Number(mvtQte)
    if (!mouvement || !qte || qte <= 0) return
    const { materiel, type, edit } = mouvement
    const mouvementsActuels = materiel.mouvements || []
    const nouvelleEntree = { id: edit?.id || `mvt_${Date.now()}`, type, quantite: qte, note: mvtNote.trim(), date: edit?.date || Date.now(), auteur: edit?.auteur || user?.nom || user?.login || null }
    const mouvements = edit
      ? mouvementsActuels.map((mv) => mv.id === edit.id ? nouvelleEntree : mv)
      : [...mouvementsActuels, nouvelleEntree]

    // Le stock ne doit jamais devenir négatif — on vérifie le total brut (avant
    // plafonnement) pour prévenir plutôt que de masquer silencieusement l'erreur.
    const totalBrut = mouvements.reduce((s, mv) => s + (mv.type === 'entree' ? Number(mv.quantite) || 0 : -(Number(mv.quantite) || 0)), 0)
    if (totalBrut < 0) {
      toast.error(`Cette valeur ferait passer le stock sous zéro (il resterait ${totalBrut} ${materiel.unite || 'unité(s)'}).`)
      return
    }

    await updateItem('projet_materiels', materiel.id, { quantite: calculerStock(mouvements), mouvements, updatedAt: Date.now() })
    await audit('projet', edit ? 'materiel_mouvement_corrige' : (type === 'entree' ? 'materiel_entree' : 'materiel_sortie'), `${materiel.nom} — ${qte} ${materiel.unite || ''}`)
    setMouvement(null)
  }

  const supprimerMouvement = async (materiel, mv) => {
    if (!peutSupprimer) return
    if (!window.confirm('Supprimer ce mouvement ? Le stock sera recalculé automatiquement.')) return
    const mouvements = (materiel.mouvements || []).filter((x) => x.id !== mv.id)
    await updateItem('projet_materiels', materiel.id, { quantite: calculerStock(mouvements), mouvements, updatedAt: Date.now() })
    await audit('projet', 'materiel_mouvement_supprime', `${materiel.nom} — ${mv.quantite} ${materiel.unite || ''}`)
  }

  // Pour les consommables en vrac (sable, gravier…) dont la quantité restante ne peut
  // pas être estimée précisément : déclaration directe "il n'y en a plus", sans avoir
  // à saisir une quantité exacte — ramène le stock à 0.
  const marquerEpuise = async (m) => {
    const stockActuel = calculerStock(m.mouvements || [])
    if (stockActuel <= 0) return
    if (!window.confirm(`Déclarer "${m.nom}" comme épuisé ? Le stock sera ramené à 0.`)) return
    const mouvements = [
      ...(m.mouvements || []),
      { id: `mvt_${Date.now()}`, type: 'sortie', quantite: stockActuel, note: 'Déclaré épuisé', date: Date.now(), auteur: user?.nom || user?.login || null }
    ]
    await updateItem('projet_materiels', m.id, { quantite: 0, mouvements, updatedAt: Date.now() })
    await audit('projet', 'materiel_epuise', m.nom)
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),0_8px_20px_-8px_rgba(13,148,136,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.85) 0%, rgba(15,84,80,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0d9488', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Wrench size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Matériel & Matériaux</h2>
          <p className="text-sm text-white/80">{compteur('sur_site')} matériel(s) sur site — Consommables (stock), outillage, véhicules, gros équipement</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreCategorie} onChange={(e) => setFiltreCateg(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES_MATERIEL.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
          {[['', `Tous (${materiels.length})`], ...Object.entries(STATUTS_MATERIEL).map(([k, v]) => [k, `${v.label} (${compteur(k)})`])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-white'}`}>
              {l}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} size="sm" className="ml-auto"><Plus size={14} className="mr-1" />Ajouter du matériel</Button>
      </div>

      {/* Liste */}
      {!liste.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <Wrench size={32} className="opacity-30" />
            <p className="text-sm">Aucun matériel{filtreProjet ? ' pour ce projet' : ''}.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {liste.map((m) => {
            const projet = projets.find((p) => p.id === m.projetId)
            const st = STATUTS_MATERIEL[m.statut] || STATUTS_MATERIEL.sur_site
            const et = ETATS_MATERIEL[m.etat] || ETATS_MATERIEL.bon_etat
            const mvts = [...(m.mouvements || [])].sort((a, b) => (b.date || 0) - (a.date || 0))
            const stock = calculerStock(m.mouvements || [])
            const sorti = calculerSorties(m.mouvements || [])
            const historiqueVisible = historiqueOuvert === m.id
            return (
              <Card key={m.id} className="card-hover space-y-2" onClick={() => setDetail(m)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{m.nom}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {projet && <Badge tone="primary">{projet.nom}</Badge>}
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">{catLabel(m.categorie)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <Badge tone={et.tone}>{et.label}</Badge>
                  </div>
                </div>

                {/* Stock — toujours affiché, quelle que soit la catégorie */}
                <div className="rounded-2xl bg-white/60 px-3 py-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">En stock</p>
                          <p className="text-2xl font-extrabold text-teal-700">
                            {stock} <span className="text-sm font-semibold text-gray-500">{m.unite || 'unité(s)'}</span>
                          </p>
                        </div>
                        {sorti > 0 && (
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Sorti</p>
                            <p className="text-lg font-bold text-amber-600">
                              {sorti} <span className="text-xs font-semibold text-gray-500">{m.unite || 'unité(s)'}</span>
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="success" onClick={() => ouvrirMouvement(m, 'entree')}>
                          <PlusCircle size={14} /> Entrée
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => ouvrirMouvement(m, 'sortie')}>
                          <MinusCircle size={14} /> Sortie
                        </Button>
                        {stock > 0 && (
                          <Button size="sm" variant="outline" onClick={() => marquerEpuise(m)} title="À utiliser quand la quantité restante ne peut pas être estimée (sable, gravier…)">
                            <Ban size={14} /> Épuisé
                          </Button>
                        )}
                      </div>
                    </div>
                    {mvts.length > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); setHistoriqueOuvert(historiqueVisible ? null : m.id) }}
                        className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-800">
                        {historiqueVisible ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {historiqueVisible ? 'Masquer' : 'Voir'} l'historique ({mvts.length} mouvement{mvts.length > 1 ? 's' : ''})
                      </button>
                    )}
                    {historiqueVisible && (
                      <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto border-t border-gray-100 pt-2" onClick={(e) => e.stopPropagation()}>
                        {mvts.map((mv) => (
                          <div key={mv.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="min-w-0">
                              <span className={mv.type === 'entree' ? 'text-green-600' : 'text-red-500'}>
                                {mv.type === 'entree' ? '+ ' : '− '}{mv.quantite} {m.unite || ''} {mv.note ? `— ${mv.note}` : ''}
                              </span>
                              <span className="ml-1 text-gray-400">· {formatDateShort(mv.date)} · {mv.auteur || '—'}</span>
                            </div>
                            <span className="flex shrink-0 items-center gap-1">
                              <button onClick={() => ouvrirEditionMouvement(m, mv)} title="Corriger ce mouvement"
                                className="rounded border border-teal-200 bg-teal-50 p-0.5 text-teal-600 hover:bg-teal-100"><Pencil size={11} /></button>
                              {peutSupprimer && (
                                <button onClick={() => supprimerMouvement(m, mv)} title="Supprimer ce mouvement"
                                  className="rounded border border-red-200 bg-red-50 p-0.5 text-red-600 hover:bg-red-100"><Trash2 size={11} /></button>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                </div>

                {m.dateEntree && <p className="text-xs text-gray-500">Arrivé sur site le {formatDateShort(m.dateEntree)}</p>}
                {m.note && <p className="text-sm text-gray-600 italic">« {m.note} »</p>}
                <p className="text-[11px] text-gray-400">
                  Suivi par {m.responsable || '—'}{m.createdAt ? ` · ${formatDateTime(m.createdAt)}` : ''}
                </p>

                <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  {m.categorie !== 'consommable' && (
                    <>
                      {m.etat !== 'bon_etat' && (
                        <Button size="sm" variant="outline" onClick={() => changerEtat(m, 'bon_etat')}>
                          <CheckCircle2 size={13} /> Bon état
                        </Button>
                      )}
                      {m.etat === 'bon_etat' && (
                        <Button size="sm" variant="outline" onClick={() => changerEtat(m, 'a_reparer')}>
                          <AlertTriangle size={13} /> À réparer
                        </Button>
                      )}
                      {m.etat !== 'hors_service' && (
                        <Button size="sm" variant="outline" onClick={() => changerEtat(m, 'hors_service')}>
                          <XCircle size={13} /> Hors service
                        </Button>
                      )}
                      {m.statut === 'sur_site' ? (
                        <Button size="sm" variant="outline" onClick={() => changerStatut(m, 'retourne')}>
                          <RotateCcw size={13} /> Retourné
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => changerStatut(m, 'sur_site')}>
                          Remettre sur site
                        </Button>
                      )}
                    </>
                  )}
                  <button onClick={() => openEdit(m)} className="ml-auto rounded-lg border border-teal-200 bg-teal-50 p-1.5 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-100"><Pencil size={14} /></button>
                  {peutSupprimer && (
                    <button onClick={() => handleDelete(m)} className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={14} /></button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Détail matériel/matériau */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Détail"
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail && (() => {
          const d = detail
          const projet = projets.find((p) => p.id === d.projetId)
          const st = STATUTS_MATERIEL[d.statut] || STATUTS_MATERIEL.sur_site
          const et = ETATS_MATERIEL[d.etat] || ETATS_MATERIEL.bon_etat
          const mvts = [...(d.mouvements || [])].sort((a, b) => (b.date || 0) - (a.date || 0))
          const stock = calculerStock(d.mouvements || [])
          const sorti = calculerSorties(d.mouvements || [])
          const entre = calculerEntrees(d.mouvements || [])
          return (
            <div className="space-y-4">
              {/* En-tête glassmorphism — nom bien visible */}
              <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
                style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.92) 0%, rgba(15,84,80,0.88) 100%)' }}>
                <p className="font-mono text-xs text-white/70">{catLabel(d.categorie)}</p>
                <p className="mt-0.5 text-lg font-extrabold leading-snug">{d.nom}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {st.label}
                  </span>
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {et.label}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><span className="text-gray-500">Projet : </span><span className="font-semibold">{projet?.nom || '—'}</span></div>
                <div><span className="text-gray-500">Unité : </span><span className="font-semibold">{d.unite || 'unité(s)'}</span></div>
                <div><span className="text-gray-500">Arrivé le : </span><span className="font-semibold">{d.dateEntree ? formatDateShort(d.dateEntree) : '—'}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Suivi par : </span><span className="font-semibold">{d.responsable || '—'}{d.createdAt ? ` · ${formatDateTime(d.createdAt)}` : ''}</span></div>
              </div>

              {d.note && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Note</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">« {d.note} »</p>
                </div>
              )}

              {/* Suivi du stock */}
              <div className="rounded-2xl border border-teal-100/70 bg-teal-50/60 p-3.5 shadow-sm backdrop-blur-sm">
                <p className="mb-2 text-xs font-bold uppercase text-teal-700">Suivi du stock</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500">Reçu : <b className="text-gray-700">{entre} {d.unite || 'unité(s)'}</b></span>
                  <span className="text-gray-500">Sorti : <b className="text-amber-600">{sorti} {d.unite || 'unité(s)'}</b></span>
                  <span className="text-gray-500">Reste : <b className="text-green-600">{stock} {d.unite || 'unité(s)'}</b></span>
                </div>
              </div>

              {/* Historique complet des mouvements */}
              {mvts.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Historique des mouvements</p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {mvts.map((mv) => (
                      <div key={mv.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className={mv.type === 'entree' ? 'font-semibold text-green-600' : 'font-semibold text-red-500'}>
                            {mv.type === 'entree' ? '+ ' : '− '}{mv.quantite} {d.unite || ''} {mv.note ? `— ${mv.note}` : ''}
                          </span>
                          <span className="ml-1 text-gray-400">· {formatDateShort(mv.date)} · {mv.auteur || '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                <Button onClick={() => { setDetail(null); openEdit(d) }}>
                  <Pencil size={14} className="mr-1" />Modifier
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal création/édition */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier le matériel' : 'Ajouter du matériel'}
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-200/75 backdrop-blur-2xl backdrop-saturate-200">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">📋 Informations</p>
            <FormGroup label="Projet" required>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Matériel" required>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="ex : Ciment, bétonnière, marteau-piqueur…"
                value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
            </FormGroup>
          </div>

          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">📦 Détails & stock</p>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Catégorie">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}>
                  {CATEGORIES_MATERIEL.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="État">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.etat} onChange={(e) => setForm((f) => ({ ...f, etat: e.target.value }))}>
                  {Object.entries(ETATS_MATERIEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Unité" hint="ex : sac, m³, litre">
                <ChampAutocomplete
                  value={form.unite}
                  onChange={(v) => setForm((f) => ({ ...f, unite: v }))}
                  suggestions={UNITES_SUGGESTIONS}
                  placeholder="unité"
                />
              </FormGroup>
              {!editing && (
                <FormGroup label="Quantité initiale" required hint="Stock de départ — mettre 0 si aucun stock pour l'instant">
                  <input type="number" min="0" step="any" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="0"
                    value={form.quantiteInitiale} onChange={(e) => setForm((f) => ({ ...f, quantiteInitiale: e.target.value }))} />
                </FormGroup>
              )}
              <FormGroup label="Arrivé le" hint="Optionnel">
                <input type="date" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.dateEntree} onChange={(e) => setForm((f) => ({ ...f, dateEntree: e.target.value }))} />
              </FormGroup>
            </div>
            {editing && (
              <p className="text-[11px] text-gray-500">Le stock se modifie via les boutons "Entrée" / "Sortie" sur la fiche, pas ici.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <FormGroup label="Note" hint="Optionnel">
              <textarea rows={2} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </FormGroup>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.nom.trim() || !form.projetId || (!editing && form.quantiteInitiale === '')}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal mouvement de stock (entrée / sortie / correction) */}
      <Modal open={!!mouvement} onClose={() => setMouvement(null)}
        title={
          mouvement?.edit
            ? `Corriger ce mouvement — ${mouvement?.materiel.nom}`
            : mouvement?.type === 'entree' ? `Entrée de stock — ${mouvement?.materiel.nom}` : `Sortie de stock — ${mouvement?.materiel.nom}`
        }>
        {mouvement && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Stock actuel : <b className="text-gray-700">{calculerStock(mouvement.materiel.mouvements || [])} {mouvement.materiel.unite || 'unité(s)'}</b>
            </p>
            <FormGroup label={mouvement.type === 'entree' ? 'Quantité livrée' : 'Quantité utilisée'} required>
              <input type="number" min="0" step="any" autoFocus
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="0"
                value={mvtQte} onChange={(e) => setMvtQte(e.target.value)} />
            </FormGroup>
            <FormGroup label="Note" hint="Optionnel">
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder={mouvement.type === 'entree' ? 'ex : Livraison fournisseur X' : 'ex : Coulage dalle RDC'}
                value={mvtNote} onChange={(e) => setMvtNote(e.target.value)} />
            </FormGroup>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setMouvement(null)}>Annuler</Button>
              <Button variant={mouvement.type === 'entree' ? 'success' : 'danger'} onClick={confirmerMouvement} disabled={!mvtQte || Number(mvtQte) <= 0}>
                {mouvement.edit ? 'Enregistrer la correction' : 'Confirmer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
