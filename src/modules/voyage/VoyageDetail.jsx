// Détail d'un voyage d'achat : articles à sourcer, fournisseurs avec prix en devise
// locale CONVERTI EN FCFA en temps réel (selon le taux courant), mise en avant du
// MEILLEUR fournisseur (prix le plus bas), et achat qui FIGE le prix au taux du jour.
import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Pencil, Store, Trophy, ShoppingCart, RefreshCw,
  CheckCircle2, X, Package, Lock, Wallet, Receipt, ImagePlus, Paperclip
} from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useVoyageStore } from './store/voyageStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { isReadOnlyRole, isFullAccessRole, APPROVER_ROLES } from '../../core/roles'
import { todayStr, genId, formatMoney, formatNumber, formatDateShort, formatDateTime } from '../../utils/formatters'
import { lireFichier, ouvrirPiece } from '../../utils/fichiers'
import { enFCFA, meilleurFournisseur, economieArticle } from './logic'
import { GAMMES, STATUTS_VOYAGE, POSTES_DEPENSE } from './data'

const fmtDevise = (v, sym) => `${formatNumber(Math.round((parseFloat(v) || 0) * 100) / 100)} ${sym || ''}`.trim()
const articleVide = () => ({ designation: '', gamme: '', quantite: 1, unite: 'pièce', note: '' })
const fournVide = () => ({ nom: '', contact: '', devise: 'CNY', prixUnitaire: '', moq: '', delai: '', note: '' })

export default function VoyageDetail() {
  const { id } = useParams()
  const { user, role } = useAuth()
  const peutSaisir = !isReadOnlyRole(role)
  const isAdmin = isFullAccessRole(role)
  const { data: voyages } = useCollection('voyage_voyages')
  const { data: articlesTous } = useCollection('voyage_articles')
  const { data: depensesTous } = useCollection('voyage_depenses')
  const devises = useVoyageStore((s) => s.devises)
  const refreshTaux = useVoyageStore((s) => s.refreshTaux)

  const tauxDe = (code) => { const d = devises.find((x) => x.code === code); return d ? (parseFloat(d.tauxFCFA) || 0) : 0 }
  const symDe = (code) => devises.find((x) => x.code === code)?.symbole || code

  const voyage = voyages.find((v) => v.id === id)
  const articles = useMemo(
    () => articlesTous.filter((a) => a.voyageId === id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [articlesTous, id]
  )

  const [artModal, setArtModal] = useState(null)   // { data, id? }
  const [fournModal, setFournModal] = useState(null) // { articleId, data, index? }
  const [achatModal, setAchatModal] = useState(null) // { article, fournisseurIndex, quantite }
  const [depModal, setDepModal] = useState(null)   // dépense du voyage
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const depenses = useMemo(
    () => depensesTous.filter((d) => d.voyageId === id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [depensesTous, id]
  )
  const totalDepenses = useMemo(() => depenses.reduce((s, d) => s + enFCFA(d.montant, tauxDe(d.devise)), 0), [depenses, devises])

  const derniereMaj = useMemo(() => {
    const ts = devises.map((d) => d.updatedAt || 0)
    return ts.length ? Math.max(...ts) : 0
  }, [devises])

  // Totaux du voyage (rapport) : total acheté (FCFA), nb achats, économie potentielle.
  const totaux = useMemo(() => {
    let achatTotal = 0, nbAchetes = 0, economie = 0
    articles.forEach((a) => {
      if (a.achat) { achatTotal += a.achat.total || 0; nbAchetes++ }
      economie += economieArticle(a, tauxDe)
    })
    return { achatTotal, nbAchetes, economie, nbArticles: articles.length }
  }, [articles, devises])

  if (!voyage) {
    return (
      <div className="space-y-3">
        <Link to="/voyage/voyages" className="inline-flex items-center gap-1 text-sm text-indigo-600"><ArrowLeft size={15} /> Retour aux voyages</Link>
        <Card className="py-12 text-center text-gray-400">Voyage introuvable.</Card>
      </div>
    )
  }

  const st = STATUTS_VOYAGE[voyage.statut] || STATUTS_VOYAGE.en_cours

  async function actualiserTaux() {
    setRefreshing(true)
    try {
      const r = await refreshTaux()
      if (r.ok) toast.success(`Taux actualisés ✓ (${r.maj} devise${r.maj > 1 ? 's' : ''})`)
      else toast.error(r.erreur || 'Actualisation impossible')
    } finally { setRefreshing(false) }
  }

  // ── Articles ──
  async function enregistrerArticle() {
    if (saving) return
    const d = artModal.data
    if (!d.designation.trim()) return toast.error('Désignation requise')
    setSaving(true)
    try {
      if (artModal.id) {
        const a = articles.find((x) => x.id === artModal.id)
        await updateItem('voyage_articles', artModal.id, { ...a, ...d, designation: d.designation.trim(), quantite: parseInt(d.quantite) || 1 })
      } else {
        await addItem('voyage_articles', {
          id: genId(), voyageId: id, ...d, designation: d.designation.trim(),
          quantite: parseInt(d.quantite) || 1, fournisseurs: [], achat: null, createdAt: Date.now()
        })
        await audit('voyage', 'ARTICLE_CREATE', `${d.designation} · voyage ${voyage.num}`)
      }
      setArtModal(null)
    } finally { setSaving(false) }
  }
  async function supprimerArticle(a) {
    if (!window.confirm(`Supprimer l'article « ${a.designation} » ?`)) return
    await removeItem('voyage_articles', a.id)
    toast.success('Article supprimé ✓')
  }

  // ── Fournisseurs (dans un article) ──
  async function enregistrerFournisseur() {
    const { articleId, data, index } = fournModal
    if (!data.nom.trim()) return toast.error('Nom du fournisseur requis')
    if (!(parseFloat(data.prixUnitaire) > 0)) return toast.error('Prix unitaire requis')
    const a = articles.find((x) => x.id === articleId)
    const fournisseurs = [...(a.fournisseurs || [])]
    const item = { id: data.id || genId(), ...data, nom: data.nom.trim(), prixUnitaire: parseFloat(data.prixUnitaire) || 0 }
    if (index != null) fournisseurs[index] = item
    else fournisseurs.push(item)
    await updateItem('voyage_articles', articleId, { ...a, fournisseurs })
    setFournModal(null)
  }
  async function supprimerFournisseur(a, index) {
    const fournisseurs = (a.fournisseurs || []).filter((_, i) => i !== index)
    await updateItem('voyage_articles', a.id, { ...a, fournisseurs })
  }

  // ── Achat : fige le prix au taux du jour ──
  async function confirmerAchat() {
    const { article, fournisseurIndex, quantite } = achatModal
    const f = (article.fournisseurs || [])[fournisseurIndex]
    if (!f) return toast.error('Choisissez un fournisseur')
    const taux = tauxDe(f.devise)
    const prixFCFA = enFCFA(f.prixUnitaire, taux)
    const qte = parseInt(quantite) || parseInt(article.quantite) || 1
    const achat = {
      fournisseurId: f.id, fournisseurNom: f.nom, devise: f.devise,
      prixUnitaire: parseFloat(f.prixUnitaire) || 0, tauxFige: taux,
      prixUnitaireFCFA: Math.round(prixFCFA), quantite: qte, total: Math.round(prixFCFA * qte),
      date: todayStr(), par: user.nom
    }
    await updateItem('voyage_articles', article.id, { ...article, achat })
    await audit('voyage', 'ACHAT', `${article.designation} — ${f.nom} · ${formatMoney(achat.total)} · voyage ${voyage.num}`)
    await notify({
      type: 'info', title: `🛒 Achat validé — ${voyage.pays}`,
      body: `${article.designation} × ${qte} chez ${f.nom} · ${formatMoney(achat.total)} (prix figé au taux du jour)`,
      module: 'voyage', forRoles: [...new Set([...APPROVER_ROLES, 'ge', 'pau'])], excludeUid: user.uid, link: `/voyage/voyages/${id}`
    })
    toast.success('Achat enregistré — prix figé ✓')
    setAchatModal(null)
  }
  async function annulerAchat(a) {
    if (!window.confirm('Annuler cet achat ? Le prix ne sera plus figé.')) return
    await updateItem('voyage_articles', a.id, { ...a, achat: null })
    toast.success('Achat annulé')
  }

  // ── Dépenses du voyage (billet, hôtel, restauration…) — simple suivi, pas de marge ──
  async function enregistrerDepense() {
    const d = depModal
    if (!(parseFloat(d.montant) > 0)) return toast.error('Montant requis')
    await addItem('voyage_depenses', {
      id: genId(), voyageId: id, poste: d.poste, libelle: (d.libelle || '').trim(),
      montant: parseFloat(d.montant) || 0, devise: d.devise, date: d.date || todayStr(),
      piece: d.piece || null, createdAt: Date.now(), par: user.nom
    })
    await audit('voyage', 'DEPENSE', `${d.poste} · ${formatMoney(Math.round(enFCFA(d.montant, tauxDe(d.devise))))} · voyage ${voyage.num}`)
    toast.success('Dépense enregistrée ✓')
    setDepModal(null)
  }
  async function supprimerDepense(dep) {
    await removeItem('voyage_depenses', dep.id)
    toast.success('Dépense supprimée')
  }

  // ── Photos jointes à un article (produit) ──
  async function ajouterPhotoArticle(a, file) {
    if (!file) return
    setUploading(true)
    try {
      const piece = await lireFichier(file)
      await updateItem('voyage_articles', a.id, { ...a, pieces: [...(a.pieces || []), piece] })
    } catch (e) { toast.error(e.message || 'Fichier illisible') }
    finally { setUploading(false) }
  }
  async function retirerPhotoArticle(a, index) {
    await updateItem('voyage_articles', a.id, { ...a, pieces: (a.pieces || []).filter((_, i) => i !== index) })
  }
  // Reçu (photo/PDF) attaché à une dépense en cours de saisie.
  async function chargerRecuDepense(file) {
    if (!file) return
    setUploading(true)
    try { const piece = await lireFichier(file); setDepModal((m) => ({ ...m, piece })) }
    catch (e) { toast.error(e.message || 'Fichier illisible') }
    finally { setUploading(false) }
  }

  return (
    <div className="space-y-4">
      {/* En-tête voyage */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-800 p-4 text-white shadow-lg">
        <div>
          <Link to="/voyage/voyages" className="mb-1 inline-flex items-center gap-1 text-xs text-white/80 hover:text-white"><ArrowLeft size={14} /> Voyages</Link>
          <h2 className="text-lg font-extrabold">{voyage.voyageurNom} · {voyage.pays}{voyage.ville ? ` — ${voyage.ville}` : ''}</h2>
          <p className="text-sm text-white/80">
            {voyage.dateDepart ? formatDateShort(voyage.dateDepart) : '—'}{voyage.dateRetour ? ` → ${formatDateShort(voyage.dateRetour)}` : ''}
            {voyage.motif ? ` · ${voyage.motif}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          <Button variant="outline" size="sm" className="border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={actualiserTaux} loading={refreshing}>
            <RefreshCw size={14} /> Actualiser les taux
          </Button>
        </div>
      </div>

      {/* Bandeau taux + rappel conversion temps réel */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-xs text-indigo-800">
        <RefreshCw size={13} />
        <span>Les prix en <strong>FCFA</strong> se recalculent <strong>en direct</strong> selon les taux courants.</span>
        {derniereMaj > 0 && <span className="text-indigo-500">Taux mis à jour : {formatDateTime(derniereMaj)}</span>}
        <Link to="/voyage/devises" className="ml-auto font-semibold underline">Gérer les devises & taux →</Link>
      </div>

      {/* Rapport / totaux du voyage */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="card p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Articles</p><p className="text-xl font-extrabold text-gray-900">{totaux.nbArticles}</p></div>
        <div className="card p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Achetés</p><p className="text-xl font-extrabold text-green-700">{totaux.nbAchetes}</p></div>
        <div className="card p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Total acheté</p><p className="text-lg font-extrabold text-indigo-700">{formatMoney(totaux.achatTotal)}</p></div>
        <div className="card p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Dépenses voyage</p><p className="text-lg font-extrabold text-amber-700">{formatMoney(Math.round(totalDepenses))}</p></div>
        <div className="card p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Coût total voyage</p><p className="text-lg font-extrabold text-gray-900">{formatMoney(Math.round(totaux.achatTotal + totalDepenses))}</p><p className="text-[10px] text-gray-400">achats + dépenses</p></div>
        <div className="card p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Économie</p><p className="text-lg font-extrabold text-teal-700">{formatMoney(totaux.economie)}</p><p className="text-[10px] text-gray-400">meilleur vs plus cher</p></div>
      </div>

      {peutSaisir && (
        <div className="flex justify-end">
          <Button style={{ backgroundColor: '#4f46e5' }} onClick={() => setArtModal({ data: articleVide() })}><Plus size={16} /> Ajouter un article</Button>
        </div>
      )}

      {/* Articles */}
      <div className="space-y-4">
        {articles.map((a) => {
          const best = meilleurFournisseur(a.fournisseurs, tauxDe)
          return (
            <Card key={a.id} className="p-0">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold text-gray-900"><Package size={16} className="text-indigo-500" />{a.designation}
                    {a.gamme && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">{a.gamme}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Quantité : <strong>{formatNumber(a.quantite)}</strong> {a.unite || ''}{a.note ? ` · ${a.note}` : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  {a.achat ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"><Lock size={12} /> Acheté</span>
                  ) : peutSaisir && best && (
                    <Button size="sm" style={{ backgroundColor: '#16a34a' }} onClick={() => setAchatModal({ article: a, fournisseurIndex: best.index, quantite: a.quantite })}>
                      <ShoppingCart size={14} /> Acheter
                    </Button>
                  )}
                  {peutSaisir && (
                    <>
                      <button onClick={() => setArtModal({ data: { designation: a.designation, gamme: a.gamme, quantite: a.quantite, unite: a.unite, note: a.note }, id: a.id })} className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"><Pencil size={15} /></button>
                      <button onClick={() => supprimerArticle(a)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              </div>

              {/* Photos du produit (à joindre) */}
              {((a.pieces || []).length > 0 || peutSaisir) && (
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
                  {(a.pieces || []).map((p, i) => (
                    <div key={i} className="group relative">
                      <button type="button" onClick={() => ouvrirPiece(p)} title={p.nom} className="block h-14 w-14 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                        {(p.type || '').startsWith('image/') && p.dataURL
                          ? <img src={p.dataURL} alt={p.nom} className="h-full w-full object-cover" />
                          : <span className="flex h-full w-full items-center justify-center text-gray-400"><Paperclip size={16} /></span>}
                      </button>
                      {peutSaisir && (
                        <button type="button" onClick={() => retirerPhotoArticle(a, i)} className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-red-500 p-0.5 text-white group-hover:block"><X size={11} /></button>
                      )}
                    </div>
                  ))}
                  {peutSaisir && (
                    <label className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-indigo-300 text-indigo-500 hover:bg-indigo-50" title="Ajouter une photo / un PDF">
                      <ImagePlus size={18} />
                      <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; ajouterPhotoArticle(a, f) }} />
                    </label>
                  )}
                </div>
              )}

              {/* Achat figé */}
              {a.achat && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-green-100 bg-green-50/60 px-4 py-2 text-xs text-green-800">
                  <span><Lock size={11} className="mr-1 inline" /><strong>Prix figé</strong> le {formatDateShort(a.achat.date)} — fournisseur <strong>{a.achat.fournisseurNom}</strong></span>
                  <span>PU : {fmtDevise(a.achat.prixUnitaire, symDe(a.achat.devise))} = <strong>{formatMoney(a.achat.prixUnitaireFCFA)}</strong> (taux {formatNumber(a.achat.tauxFige)})</span>
                  <span>× {formatNumber(a.achat.quantite)} = <strong className="text-green-900">{formatMoney(a.achat.total)}</strong></span>
                  {isAdmin && <button onClick={() => annulerAchat(a)} className="ml-auto font-semibold text-red-500 underline">annuler</button>}
                </div>
              )}

              {/* Fournisseurs */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Fournisseur</th>
                      <th className="px-3 py-2 text-left">Contact</th>
                      <th className="px-2 py-2 text-right">Prix unit. (devise)</th>
                      <th className="px-2 py-2 text-right">Prix unit. (FCFA) <span className="font-normal normal-case text-indigo-500">· direct</span></th>
                      <th className="px-2 py-2 text-center">MOQ</th>
                      <th className="px-2 py-2 text-center">Délai</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(a.fournisseurs || []).map((f, i) => {
                      const fcfa = enFCFA(f.prixUnitaire, tauxDe(f.devise))
                      const estBest = best && best.index === i
                      return (
                        <tr key={f.id || i} className={estBest ? 'bg-amber-50/60' : ''}>
                          <td className="px-3 py-2 font-semibold">
                            <span className="inline-flex items-center gap-1.5">{f.nom}
                              {estBest && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"><Trophy size={11} /> Meilleur</span>}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{f.contact || '—'}</td>
                          <td className="px-2 py-2 text-right">{fmtDevise(f.prixUnitaire, symDe(f.devise))} <span className="text-[10px] text-gray-400">{f.devise}</span></td>
                          <td className={`px-2 py-2 text-right font-bold ${estBest ? 'text-amber-700' : 'text-gray-800'}`}>{formatMoney(Math.round(fcfa))}</td>
                          <td className="px-2 py-2 text-center text-xs text-gray-500">{f.moq || '—'}</td>
                          <td className="px-2 py-2 text-center text-xs text-gray-500">{f.delai || '—'}</td>
                          <td className="px-2 py-2">
                            {peutSaisir && !a.achat && (
                              <div className="flex justify-end gap-1">
                                <button onClick={() => setFournModal({ articleId: a.id, data: { ...f }, index: i })} className="rounded p-1 text-indigo-600 hover:bg-indigo-50"><Pencil size={14} /></button>
                                <button onClick={() => supprimerFournisseur(a, i)} className="rounded p-1 text-red-500 hover:bg-red-50"><X size={14} /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {!(a.fournisseurs || []).length && (
                      <tr><td colSpan={7} className="px-3 py-4 text-center text-sm text-gray-400">Aucun fournisseur — ajoutez-en pour comparer les prix.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {peutSaisir && !a.achat && (
                <div className="border-t border-gray-100 px-4 py-2">
                  <Button variant="outline" size="sm" onClick={() => setFournModal({ articleId: a.id, data: fournVide() })}><Store size={14} /> Ajouter un fournisseur</Button>
                </div>
              )}
            </Card>
          )
        })}
        {!articles.length && <Card className="py-12 text-center text-gray-400"><Package size={32} className="mx-auto mb-2 opacity-30" /><p>Aucun article. Ajoutez ce que le voyageur doit sourcer.</p></Card>}
      </div>

      {/* Dépenses du voyage (billet, hôtel, restauration…) — suivi des coûts, sans marge */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-gray-800"><Wallet size={16} className="text-amber-600" /> Dépenses du voyage</h3>
            <p className="text-xs text-gray-500">Billet, hébergement, restauration, visa, fret… (suivi des coûts, sans marge)</p>
          </div>
          {peutSaisir && <Button size="sm" variant="outline" onClick={() => setDepModal({ poste: POSTES_DEPENSE[0], libelle: '', montant: '', devise: 'XOF', date: todayStr(), piece: null })}><Plus size={14} /> Ajouter une dépense</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Poste</th><th className="px-3 py-2 text-left">Libellé</th><th className="px-2 py-2 text-right">Montant</th><th className="px-2 py-2 text-right">FCFA</th><th className="px-2 py-2 text-center">Reçu</th><th className="px-2 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {depenses.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 font-mono text-xs">{formatDateShort(d.date)}</td>
                  <td className="px-3 py-2 font-semibold">{d.poste}</td>
                  <td className="px-3 py-2 text-gray-600">{d.libelle || '—'}</td>
                  <td className="px-2 py-2 text-right">{fmtDevise(d.montant, symDe(d.devise))} <span className="text-[10px] text-gray-400">{d.devise}</span></td>
                  <td className="px-2 py-2 text-right font-bold text-amber-700">{formatMoney(Math.round(enFCFA(d.montant, tauxDe(d.devise))))}</td>
                  <td className="px-2 py-2 text-center">{d.piece ? <button onClick={() => ouvrirPiece(d.piece)} title="Voir le reçu" className="text-indigo-600 hover:underline"><Receipt size={15} className="inline" /></button> : '—'}</td>
                  <td className="px-2 py-2 text-right">{peutSaisir && <button onClick={() => supprimerDepense(d)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
              {!depenses.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-sm text-gray-400">Aucune dépense de voyage enregistrée.</td></tr>}
            </tbody>
            {depenses.length > 0 && (
              <tfoot className="bg-gray-50 font-bold"><tr><td className="px-3 py-2" colSpan={4}>TOTAL DÉPENSES</td><td className="px-2 py-2 text-right text-amber-700">{formatMoney(Math.round(totalDepenses))}</td><td colSpan={2} /></tr></tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Modal article */}
      <Modal open={!!artModal} onClose={() => setArtModal(null)} size="md" title={artModal?.id ? 'Modifier l\'article' : 'Ajouter un article'}
        footer={<><Button variant="outline" onClick={() => setArtModal(null)}>Annuler</Button><Button style={{ backgroundColor: '#4f46e5' }} onClick={enregistrerArticle} loading={saving}>Enregistrer</Button></>}>
        {artModal && (
          <div className="space-y-3">
            <FormGroup label="Désignation" required><Input value={artModal.data.designation} onChange={(e) => setArtModal((m) => ({ ...m, data: { ...m.data, designation: e.target.value } }))} placeholder="ex : Tapis de course pliable" /></FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Gamme / domaine"><ChampAutocomplete value={artModal.data.gamme} suggestions={GAMMES} placeholder="ex : Maxi-Gym" onChange={(v) => setArtModal((m) => ({ ...m, data: { ...m.data, gamme: v } }))} /></FormGroup>
              <FormGroup label="Unité"><Input value={artModal.data.unite} onChange={(e) => setArtModal((m) => ({ ...m, data: { ...m.data, unite: e.target.value } }))} placeholder="pièce, carton…" /></FormGroup>
              <FormGroup label="Quantité"><Input type="number" min="1" value={artModal.data.quantite} onChange={(e) => setArtModal((m) => ({ ...m, data: { ...m.data, quantite: e.target.value } }))} /></FormGroup>
            </div>
            <FormGroup label="Note / spécifications"><Input value={artModal.data.note} onChange={(e) => setArtModal((m) => ({ ...m, data: { ...m.data, note: e.target.value } }))} placeholder="couleur, référence, qualité…" /></FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal fournisseur */}
      <Modal open={!!fournModal} onClose={() => setFournModal(null)} size="md" title={fournModal?.index != null ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}
        footer={<><Button variant="outline" onClick={() => setFournModal(null)}>Annuler</Button><Button style={{ backgroundColor: '#4f46e5' }} onClick={enregistrerFournisseur}>Enregistrer</Button></>}>
        {fournModal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Nom du fournisseur" required><Input value={fournModal.data.nom} onChange={(e) => setFournModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} /></FormGroup>
              <FormGroup label="Contact"><Input value={fournModal.data.contact} onChange={(e) => setFournModal((m) => ({ ...m, data: { ...m.data, contact: e.target.value } }))} placeholder="tél / WeChat / email" /></FormGroup>
              <FormGroup label="Devise">
                <Select value={fournModal.data.devise} onChange={(e) => setFournModal((m) => ({ ...m, data: { ...m.data, devise: e.target.value } }))}>
                  {devises.map((d) => <option key={d.code} value={d.code}>{d.code} — {d.nom}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Prix unitaire (devise)" required><Input type="number" min="0" step="0.01" value={fournModal.data.prixUnitaire} onChange={(e) => setFournModal((m) => ({ ...m, data: { ...m.data, prixUnitaire: e.target.value } }))} /></FormGroup>
              <FormGroup label="MOQ (qté mini)"><Input value={fournModal.data.moq} onChange={(e) => setFournModal((m) => ({ ...m, data: { ...m.data, moq: e.target.value } }))} placeholder="ex : 100" /></FormGroup>
              <FormGroup label="Délai"><Input value={fournModal.data.delai} onChange={(e) => setFournModal((m) => ({ ...m, data: { ...m.data, delai: e.target.value } }))} placeholder="ex : 15 jours" /></FormGroup>
            </div>
            {parseFloat(fournModal.data.prixUnitaire) > 0 && (
              <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                ≈ <strong>{formatMoney(Math.round(enFCFA(fournModal.data.prixUnitaire, tauxDe(fournModal.data.devise))))}</strong> / unité (converti au taux courant)
              </p>
            )}
            <FormGroup label="Note (qualité, garantie…)"><Input value={fournModal.data.note} onChange={(e) => setFournModal((m) => ({ ...m, data: { ...m.data, note: e.target.value } }))} /></FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal achat (fige le prix) */}
      <Modal open={!!achatModal} onClose={() => setAchatModal(null)} size="sm" title="Valider l'achat (fige le prix)"
        footer={<><Button variant="outline" onClick={() => setAchatModal(null)}>Annuler</Button><Button style={{ backgroundColor: '#16a34a' }} onClick={confirmerAchat}><CheckCircle2 size={15} /> Acheter</Button></>}>
        {achatModal && (() => {
          const a = achatModal.article
          const f = (a.fournisseurs || [])[achatModal.fournisseurIndex]
          const taux = f ? tauxDe(f.devise) : 0
          const puFCFA = f ? enFCFA(f.prixUnitaire, taux) : 0
          const qte = parseInt(achatModal.quantite) || parseInt(a.quantite) || 1
          return (
            <div className="space-y-3">
              <FormGroup label="Fournisseur">
                <Select value={achatModal.fournisseurIndex} onChange={(e) => setAchatModal((m) => ({ ...m, fournisseurIndex: parseInt(e.target.value) }))}>
                  {(a.fournisseurs || []).map((x, i) => <option key={i} value={i}>{x.nom} — {fmtDevise(x.prixUnitaire, symDe(x.devise))} ≈ {formatMoney(Math.round(enFCFA(x.prixUnitaire, tauxDe(x.devise))))}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Quantité achetée"><Input type="number" min="1" value={achatModal.quantite} onChange={(e) => setAchatModal((m) => ({ ...m, quantite: e.target.value }))} /></FormGroup>
              <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                <p>Prix figé au <strong>taux du jour</strong> ({formatNumber(taux)} FCFA / {f?.devise}) :</p>
                <p className="mt-1">PU : <strong>{formatMoney(Math.round(puFCFA))}</strong> × {qte} = <strong className="text-green-900">{formatMoney(Math.round(puFCFA * qte))}</strong></p>
                <p className="mt-1 text-xs text-green-600">Une fois validé, ce prix ne bougera plus même si la devise varie.</p>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal dépense du voyage */}
      <Modal open={!!depModal} onClose={() => setDepModal(null)} size="sm" title="Ajouter une dépense du voyage"
        footer={<><Button variant="outline" onClick={() => setDepModal(null)}>Annuler</Button><Button style={{ backgroundColor: '#4f46e5' }} onClick={enregistrerDepense}>Enregistrer</Button></>}>
        {depModal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Poste">
                <Select value={depModal.poste} onChange={(e) => setDepModal((m) => ({ ...m, poste: e.target.value }))}>
                  {POSTES_DEPENSE.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Date"><Input type="date" value={depModal.date} onChange={(e) => setDepModal((m) => ({ ...m, date: e.target.value }))} /></FormGroup>
              <FormGroup label="Montant"><Input type="number" min="0" value={depModal.montant} onChange={(e) => setDepModal((m) => ({ ...m, montant: e.target.value }))} /></FormGroup>
              <FormGroup label="Devise">
                <Select value={depModal.devise} onChange={(e) => setDepModal((m) => ({ ...m, devise: e.target.value }))}>
                  {devises.map((d) => <option key={d.code} value={d.code}>{d.code} — {d.nom}</option>)}
                </Select>
              </FormGroup>
            </div>
            <FormGroup label="Libellé"><Input value={depModal.libelle} onChange={(e) => setDepModal((m) => ({ ...m, libelle: e.target.value }))} placeholder="ex : 2 nuits hôtel Guangzhou" /></FormGroup>
            {parseFloat(depModal.montant) > 0 && depModal.devise !== 'XOF' && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">≈ <strong>{formatMoney(Math.round(enFCFA(depModal.montant, tauxDe(depModal.devise))))}</strong> (au taux courant)</p>
            )}
            <FormGroup label="Reçu / justificatif (photo ou PDF, optionnel)">
              {depModal.piece ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-gray-700"><Paperclip size={14} /> {depModal.piece.nom}</span>
                  <button onClick={() => setDepModal((m) => ({ ...m, piece: null }))} className="text-xs text-red-500 hover:underline">Retirer</button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-300 px-3 py-3 text-sm text-indigo-500 hover:bg-indigo-50">
                  <Receipt size={16} /> {uploading ? 'Chargement…' : 'Joindre un reçu'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; chargerRecuDepense(f) }} />
                </label>
              )}
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}
