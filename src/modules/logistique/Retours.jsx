// Retour de matériel — PILOTÉ PAR LA PRESTATION.
// On choisit une prestation non entièrement rendue → la liste du matériel pris
// s'affiche automatiquement. Pour chaque matériel, on AJOUTE les retours UN À UN :
// chaque entrée porte son état (OK / Cassé / Perdu), sa quantité, son motif et sa
// pénalité. On peut donc, pour un même matériel, enregistrer par exemple « 3 perdus »,
// puis « 2 cassés », puis « le reste OK » — au lieu d'un seul total figé.
//   - OK            → réintègre le stock (pas de pénalité)
//   - Cassé / Perdu → quantité + motif + pénalité (ne réintègre pas → perte)
// Chaque entrée est tracée (collection logistique_retours) et alimente, en lecture
// seule, la colonne « Retours » de la saisie magasin.
import { useEffect, useMemo, useState } from 'react'
import BandeauFiltreIds, { useFiltreIds } from '../../shared/ui/FiltreIds'
import { RotateCcw, Check, Plus, X, Pencil, Trash2, Package, Undo2, CheckCheck, Info } from 'lucide-react'
import { COULEUR_MODULE, icone3D } from '../../utils/color'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import Badge from '../../shared/ui/Badge'
import ActionIcone from '../../shared/ui/ActionIcone'
import NumDoc from '../../shared/ui/NumDoc'
import RetourDetailModal from './RetourDetailModal'
import { synchroniserCloture } from './clotureRetours'
import EtatVide from '../../shared/ui/EtatVide'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useLogistiqueStore } from './store/referentielStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { APPROVER_ROLES, isReadOnlyRole, isFullAccessRole } from '../../core/roles'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatDateShort, formatMoney } from '../../utils/formatters'
import { useSite, matchSite, siteLabel } from './site/useSite'

const DRAFT_VIDE = { etat: 'none', qte: '', motif: '', penalite: '' }

export default function Retours() {
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)
  const site = useSite()
  const { data: allRetours } = useCollection('logistique_retours')
  const { data: allPrestations } = useCollection('logistique_prestations')
  const materiel = useLogistiqueStore((s) => s.materiel)
  const coutOf = useMemo(() => { const m = {}; materiel.forEach((x) => { m[x.id] = x.coutAchat || 0 }); return m }, [materiel])

  // Cloisonnement par site (sous-application Lomé / Kara).
  const retours = useMemo(() => allRetours.filter((r) => matchSite(r, site)), [allRetours, site])
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])
  const filtreIds = useFiltreIds() // lien d'une alerte : ids des prestations concernées

  const [recherche, setRecherche] = useState('')
  const [prestationId, setPrestationId] = useState('')
  // Retours AJOUTÉS, prêts à enregistrer : { materielId: [ { etat, qte, motif, penalite } ] }
  const [entrees, setEntrees] = useState({})
  // Brouillon de l'entrée en cours de saisie, par matériel : { materielId: { etat, qte, motif, penalite } }
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [detailRetour, setDetailRetour] = useState(null)
  const [editRetour, setEditRetour] = useState(null) // entrée de l'historique en cours de correction
  // Une seule prestation concernée par l'alerte : elle est déjà choisie.
  useEffect(() => { if (filtreIds.ids && filtreIds.ids.size === 1) setPrestationId([...filtreIds.ids][0]) }, [filtreIds.ids])

  // Quantité déjà retournée (enregistrée en base) pour un (prestation, matériel).
  const renduPour = (presId, matId) => retours
    .filter((r) => r.prestationId === presId && r.materielId === matId)
    .reduce((s, r) => s + (parseInt(r.qte) || 0), 0)

  // Lignes « matériel restant à rendre » d'une prestation.
  const lignesRestantes = (p) => (p?.lignes || [])
    .filter((l) => l.materielId) // hors « Autre » / frais (pas de stock)
    .map((l) => {
      const pris = parseInt(l.qte) || 0
      const rendu = renduPour(p.id, l.materielId)
      return { materielId: l.materielId, materielNom: l.materielNom, pris, rendu, restant: Math.max(0, pris - rendu) }
    })

  // Prestations avec au moins un matériel pas encore entièrement rendu.
  const prestationsNonRendues = useMemo(
    () => prestations.filter((p) => (!filtreIds.ids || filtreIds.ids.has(p.id)) && lignesRestantes(p).some((l) => l.restant > 0)),
    [prestations, retours, filtreIds.ids]
  )

  const prestation = prestations.find((p) => p.id === prestationId)
  const lignes = prestation ? lignesRestantes(prestation).filter((l) => l.restant > 0) : []

  function choisirPrestation(id) {
    setPrestationId(id)
    setEntrees({}) // remet à zéro les retours en cours
    setDraft({})
  }
  const setDraftMat = (matId, patch) => setDraft((d) => ({ ...d, [matId]: { ...(d[matId] || DRAFT_VIDE), ...patch } }))

  // Quantité déjà répartie dans les entrées ajoutées (non encore enregistrées).
  const repartiPour = (matId) => (entrees[matId] || []).reduce((s, e) => s + (parseInt(e.qte) || 0), 0)
  // Quantité qu'il reste à affecter pour ce matériel (restant − déjà réparti).
  const resteAffecter = (l) => Math.max(0, l.restant - repartiPour(l.materielId))

  // Ajoute une entrée de retour (un à un) pour un matériel.
  function ajouterEntree(l) {
    const d = draft[l.materielId] || DRAFT_VIDE
    if (!d.etat || d.etat === 'none') return toast.error("Choisissez l'état du retour")
    const reste = resteAffecter(l)
    if (reste <= 0) return toast.error('Tout le restant de ce matériel est déjà réparti')
    // Quantité : OK → par défaut tout le reste ; Cassé/Perdu → par défaut 1 (unité par unité).
    const saisie = d.qte === '' || d.qte === undefined ? (d.etat === 'OK' ? reste : 1) : parseInt(d.qte)
    const qte = Math.min(reste, Math.max(1, saisie || 1))
    const penalite = d.etat === 'OK' ? 0
      : (d.penalite !== undefined && d.penalite !== '' ? parseFloat(d.penalite) || 0 : (coutOf[l.materielId] || 0) * qte)
    const entree = { etat: d.etat, qte, motif: (d.motif || '').trim(), penalite }
    setEntrees((m) => ({ ...m, [l.materielId]: [...(m[l.materielId] || []), entree] }))
    setDraftMat(l.materielId, DRAFT_VIDE)
  }
  // Un clic : tout ce qui reste à rendre est enregistré comme rendu en bon état (à vérifier puis enregistrer).
  function toutRenduOK() {
    setEntrees((m) => {
      const next = { ...m }
      lignes.forEach((l) => {
        const reparti = (m[l.materielId] || []).reduce((s, e) => s + (parseInt(e.qte) || 0), 0)
        const reste = Math.max(0, l.restant - reparti)
        if (reste > 0) next[l.materielId] = [...(m[l.materielId] || []), { etat: 'OK', qte: reste, motif: '', penalite: 0 }]
      })
      return next
    })
    toast.info('Tout le restant est marqué rendu en bon état : vérifiez puis enregistrez.')
  }
  function retirerEntree(matId, idx) {
    setEntrees((m) => ({ ...m, [matId]: (m[matId] || []).filter((_, i) => i !== idx) }))
  }

  async function enregistrer() {
    if (!prestation) return toast.error('Choisissez une prestation')
    const toutes = lignes.flatMap((l) => (entrees[l.materielId] || []).map((e) => ({ l, e })))
    if (!toutes.length) return toast.error('Ajoutez au moins un retour (bouton « Ajouter »)')

    setSaving(true)
    try {
      let n = 0
      for (const { l, e } of toutes) {
        const num = genNumero(`RET-${site.toUpperCase()}`, retours.length + n)
        await addItem('logistique_retours', {
          num, date: todayStr(), site,
          prestationId: prestation.id, prestationNum: prestation.num, clientNom: prestation.clientNom,
          materielId: l.materielId, materielNom: l.materielNom,
          type: e.etat, qte: e.qte, motif: e.motif,
          penalite: e.penalite, penalitePayee: false,
          agentId: user.uid, agentNom: user.nom
        })
        n++
        if (e.etat !== 'OK') {
          await notify({
            type: 'warning',
            title: `Retour matériel : ${e.etat}`,
            body: `${e.qte} × ${l.materielNom} (${e.etat})${e.penalite > 0 ? ` : pénalité ${formatMoney(e.penalite)}` : ''} · prestation ${prestation.num}`,
            module: 'logistique',
            forRoles: APPROVER_ROLES,
            link: '/logistique/retours'
          })
        }
      }
      await audit('logistique', 'RETOUR', `${n} retour(s) : prestation ${prestation.num}`)
      await synchroniserCloture(prestation.id) // tout rendu en bon état : la prestation passe à « Terminée »
      toast.success(`${n} retour(s) enregistré(s) ✓ : visibles en lecture seule dans la saisie magasin`)
      setPrestationId('')
      setEntrees({})
      setDraft({})
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const totalEntrees = lignes.reduce((s, l) => s + (entrees[l.materielId]?.length || 0), 0)

  // Correction d'une entrée de l'historique (mauvais état/quantité/motif saisi) —
  // le stock (colonne « Retours » de la saisie magasin, cf. renduPour ci-dessus)
  // est recalculé EN DIRECT à partir de cette collection : modifier/supprimer une
  // entrée suffit à corriger le stock, sans autre manipulation.
  function ouvrirEditionRetour(r) {
    setEditRetour({ id: r.id, prestationId: r.prestationId, etat: r.type, qte: r.qte, motif: r.motif || '', penalite: r.penalite || 0 })
  }
  async function modifierRetour() {
    if (!editRetour) return
    await updateItem('logistique_retours', editRetour.id, {
      type: editRetour.etat,
      qte: Math.max(1, parseInt(editRetour.qte) || 1),
      motif: (editRetour.motif || '').trim(),
      penalite: editRetour.etat === 'OK' ? 0 : (parseFloat(editRetour.penalite) || 0)
    })
    await audit('logistique', 'RETOUR_MODIFIE', `${siteLabel(site)} : retour corrigé (${editRetour.qte} × ${editRetour.etat})`)
    await synchroniserCloture(editRetour.prestationId)
    toast.success('Retour corrigé ✓')
    setEditRetour(null)
  }
  async function supprimerRetour(r) {
    if (!confirm(`Supprimer ce retour (${r.qte} × ${r.materielNom}, ${r.type}) ?\nLe stock de la saisie magasin sera recalculé automatiquement.`)) return
    await removeItem('logistique_retours', r.id)
    await synchroniserCloture(r.prestationId)
    await audit('logistique', 'RETOUR_DELETE', `${siteLabel(site)} : ${r.qte} × ${r.materielNom} (${r.type}) : prestation ${r.prestationNum || ''}`)
    toast.success('Retour supprimé : stock recalculé')
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.9) 0%, rgba(26,26,26,0.85) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR_MODULE.logistique, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <RotateCcw size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Retours</h2>
          <p className="text-sm text-white/80">{retours.length} retour(s) · {siteLabel(site)}</p>
        </div>
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un client…" />
      </div>
      <div className="flex items-center gap-2.5 rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50/90 to-white/70 px-3 py-2 text-xs text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={icone3D('#0EA5E9')}><Info size={14} /></span>
        <span>Choisissez la <strong>prestation</strong>, puis ajoutez les retours par matériel : <strong>OK</strong> réintègre le stock, <strong>Cassé / Perdu</strong> demandent motif et pénalité.</span>
      </div>

      <BandeauFiltreIds filtre={filtreIds} total={prestationsNonRendues.length} accent={COULEUR_MODULE.logistique} libelle="prestation" />
      {!lectureSeule && (
      <Card className="!p-3 md:!p-4">
        <style>{`
          @keyframes ret-tourne { to { transform: rotate(-360deg); } }
          @keyframes ret-pop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
        `}</style>
        <div className="flex flex-wrap items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={icone3D(COULEUR_MODULE.logistique)}>
            <RotateCcw size={18} style={{ animation: 'ret-tourne 7s linear infinite' }} />
          </span>
          <div className="min-w-0 flex-1 basis-60">
            <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Nouveau retour par prestation <span className="text-red-500">*</span></p>
            <Select className="!py-1.5" value={prestationId} onChange={(e) => choisirPrestation(e.target.value)}>
              <option value="">Choisir une prestation à retourner</option>
              {prestationsNonRendues.map((p) => (
                <option key={p.id} value={p.id}>{p.num} : {p.clientNom} ({formatDateShort(p.dateDebut)})</option>
              ))}
            </Select>
          </div>
          {prestation && lignes.length > 0 && (
            <span key={prestation.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-bold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]" style={{ animation: 'ret-pop 0.35s ease-out' }}>
              <Package size={13} className="text-red-500" />{lignes.reduce((t, l) => t + l.restant, 0)} pièce(s) à rendre
            </span>
          )}
        </div>

        {prestation && lignes.length === 0 && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✅ Tout le matériel de cette prestation a déjà été retourné.</p>
        )}

        {lignes.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase text-gray-500">Matériel à retourner</p>
              <button type="button" onClick={toutRenduOK}
                className="btn-balaye inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-bold text-white shadow-[0_10px_18px_-8px_rgba(5,150,105,0.8),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #34d399, #059669)' }}>
                <CheckCheck size={14} /> Tout rendu en bon état
              </button>
            </div>
            {lignes.map((l) => {
              const liste = entrees[l.materielId] || []
              const reste = resteAffecter(l)
              const d = draft[l.materielId] || DRAFT_VIDE
              const cassePerdu = d.etat === 'Cassé' || d.etat === 'Perdu'
              const qApercu = Math.min(reste || 1, Math.max(1, parseInt(d.qte) || 1))
              const penatDefaut = (coutOf[l.materielId] || 0) * qApercu
              return (
                <div key={l.materielId} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 font-semibold">{l.materielNom}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        pris {l.pris} · déjà rendu {l.rendu} · restant <strong className="text-gray-600">{l.restant}</strong>
                        {liste.length > 0 && <> · à enregistrer <strong className="text-sky-600">{repartiPour(l.materielId)}</strong> · reste à répartir <strong className="text-gray-600">{reste}</strong></>}
                      </span>
                    </span>
                  </div>

                  {/* Entrées déjà ajoutées (un à un) */}
                  {liste.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {liste.map((e, i) => (
                        <span key={i} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${e.etat === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {e.etat} · {e.qte}
                          {e.penalite > 0 && <span className="text-red-500">· {formatMoney(e.penalite)}</span>}
                          {e.motif && <span className="font-normal text-gray-500">· {e.motif}</span>}
                          <button type="button" onClick={() => retirerEntree(l.materielId, i)} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10" title="Retirer">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Ligne d'ajout d'une entrée */}
                  {reste > 0 ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-12">
                      <Select className="col-span-2 md:col-span-3" value={d.etat} onChange={(e) => setDraftMat(l.materielId, { etat: e.target.value })}>
                        <option value="none">État</option>
                        <option value="OK">OK : bon état</option>
                        <option value="Cassé">Cassé</option>
                        <option value="Perdu">Perdu</option>
                      </Select>
                      {d.etat !== 'none' && (
                        <Input className="md:col-span-2" type="number" min="1" max={reste}
                          value={d.qte} onChange={(e) => setDraftMat(l.materielId, { qte: e.target.value })}
                          placeholder={d.etat === 'OK' ? `Qté (${reste})` : `Qté (1 à ${reste})`} />
                      )}
                      {cassePerdu && (
                        <>
                          <Input className="col-span-2 md:col-span-4" value={d.motif}
                            onChange={(e) => setDraftMat(l.materielId, { motif: e.target.value })}
                            placeholder="Motif (détail de la casse / perte)" />
                          <div className="col-span-2 md:col-span-3">
                            <Input type="number" min="0" value={d.penalite}
                              onChange={(e) => setDraftMat(l.materielId, { penalite: e.target.value })}
                              placeholder={`Pénalité (${formatMoney(penatDefaut)})`} />
                            <p className="mt-0.5 text-[10px] text-gray-400">💰 à rembourser · défaut = coût de remplacement</p>
                          </div>
                        </>
                      )}
                      {d.etat !== 'none' && (
                        <div className={cassePerdu ? 'col-span-2 md:col-span-12' : 'col-span-2 md:col-span-7'}>
                          <Button type="button" variant="outline" onClick={() => ajouterEntree(l)}>
                            <Plus size={15} /> Ajouter ce retour
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-green-600">✓ Tout le restant est réparti.</p>
                  )}
                </div>
              )
            })}
            <Button className="mt-1" onClick={enregistrer} loading={saving} disabled={!totalEntrees}>
              <RotateCcw size={16} /> Enregistrer les retours{totalEntrees ? ` (${totalEntrees})` : ''}
            </Button>
          </div>
        )}
      </Card>
      )}

      <Card title="Historique des retours" className="overflow-x-auto p-0">
        <div className="table-verre overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Prestation</th>
              <th className="px-3 py-2">Matériel</th>
              <th className="px-3 py-2 text-center">Qté</th>
              <th className="px-3 py-2">État</th>
              <th className="px-3 py-2 text-right">Pénalité</th>
              <th className="px-3 py-2 text-center">Remboursée ?</th>
              <th className="px-3 py-2">Motif</th>
              <th className="px-3 py-2">Agent</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...retours].filter((r) => (!filtreIds.ids || filtreIds.ids.has(r.prestationId)) && correspond(recherche, r.clientNom, r.prestationNum, r.agentNom)).sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => {
              const casse = r.type !== 'OK'
              return (
              <tr key={r.id} onClick={() => setDetailRetour(r)} className="cursor-pointer">
                <td className="px-3 py-2 font-mono text-xs">{formatDateShort(r.date)}</td>
                <td className="px-3 py-2"><NumDoc num={r.prestationNum} /></td>
                <td className="px-3 py-2"><span className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(r.type === 'OK' ? '#16A34A' : '#DC2626')}><Package size={12} /></span><span className="font-semibold">{r.materielNom}</span></span></td>
                <td className="px-3 py-2 text-center"><span className="inline-flex min-w-[2rem] justify-center rounded-xl bg-white/80 px-2 py-0.5 text-xs font-extrabold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_3px_6px_-3px_rgba(0,0,0,0.25)]">{r.qte}</span></td>
                <td className="px-3 py-2"><Badge tone={r.type === 'OK' ? 'success' : 'danger'}>{r.type}</Badge></td>
                <td className="px-3 py-2 text-right font-semibold">{casse && r.penalite > 0 ? formatMoney(r.penalite) : '—'}</td>
                <td className="px-3 py-2 text-center">
                  {casse && r.penalite > 0 ? (
                    lectureSeule ? (
                      <Badge tone={r.penalitePayee ? 'success' : 'warning'}>{r.penalitePayee ? 'Payée' : 'En attente'}</Badge>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); togglePaye(r) }}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${r.penalitePayee ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                        {r.penalitePayee ? <><Check size={12} /> Payée</> : 'À encaisser'}
                      </button>
                    )
                  ) : '—'}
                </td>
                <td className="px-3 py-2 text-gray-500">{r.motif || '—'}</td>
                <td className="px-3 py-2 text-xs">{r.agentNom}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {!isReadOnlyRole(role) && (
                      <ActionIcone icone={Pencil} tone="modifier" title="Corriger ce retour" size={14} onClick={() => ouvrirEditionRetour(r)} />
                    )}
                    {isFullAccessRole(role) && (
                      <ActionIcone icone={Trash2} tone="supprimer" title="Supprimer ce retour" size={14} onClick={() => supprimerRetour(r)} />
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        </div>
        {!retours.length && <EtatVide icone={Undo2} texte="Aucun retour enregistré" accent={COULEUR_MODULE.logistique} />}
      </Card>

      <RetourDetailModal retour={detailRetour} onClose={() => setDetailRetour(null)} />

      <Modal open={!!editRetour} onClose={() => setEditRetour(null)} title="Corriger ce retour"
        footer={<><Button variant="ghost" onClick={() => setEditRetour(null)}>Annuler</Button><Button onClick={modifierRetour}>Enregistrer</Button></>}>
        {editRetour && (
          <div className="space-y-3">
            <FormGroup label="État">
              <Select value={editRetour.etat} onChange={(e) => setEditRetour((d) => ({ ...d, etat: e.target.value }))}>
                <option value="OK">OK : bon état</option>
                <option value="Cassé">Cassé</option>
                <option value="Perdu">Perdu</option>
              </Select>
            </FormGroup>
            <FormGroup label="Quantité">
              <Input type="number" min="1" value={editRetour.qte} onChange={(e) => setEditRetour((d) => ({ ...d, qte: e.target.value }))} />
            </FormGroup>
            {editRetour.etat !== 'OK' && (
              <>
                <FormGroup label="Motif">
                  <Input value={editRetour.motif} onChange={(e) => setEditRetour((d) => ({ ...d, motif: e.target.value }))} />
                </FormGroup>
                <FormGroup label="Pénalité (FCFA)">
                  <Input type="number" min="0" value={editRetour.penalite} onChange={(e) => setEditRetour((d) => ({ ...d, penalite: e.target.value }))} />
                </FormGroup>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )

  // Bascule l'état « pénalité remboursée » d'un retour cassé / perdu.
  async function togglePaye(r) {
    const payee = !r.penalitePayee
    await updateItem('logistique_retours', r.id, { penalitePayee: payee })
    await audit('logistique', 'PENALITE', `${r.materielNom} (${r.type}) : ${payee ? 'remboursée' : 'remise en attente'} · ${formatMoney(r.penalite || 0)}`)
    toast.success(payee ? 'Pénalité marquée remboursée ✓' : 'Pénalité remise en attente')
  }
}
