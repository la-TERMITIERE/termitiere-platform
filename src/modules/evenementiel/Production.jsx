// Production briques — cycle 24h ou 48h, consommation matières auto, ajout stock appatam.
import { useMemo, useState } from 'react'
import { Factory, Plus, Eye, Pencil, Trash2, Cog, ChevronRight } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole, isFullAccessRole } from '../../core/roles'
import { useBriqueterieStore } from './store/referentielStore'
import { addItem, updateItem, removeItem, updateAtomic, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, formatDateShort, genNumero, formatNumber } from '../../utils/formatters'
import { DUREE_PRODUCTION_OPTIONS } from './data'

export default function Production() {
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)
  // Les agents saisissent/modifient mais ne suppriment jamais (décision explicite) —
  // réservé à l'accès total, car supprimer une production doit aussi retirer les
  // briques correspondantes du stock (cf. `supprimer` ci-dessous).
  const peutSupprimer = isFullAccessRole(role)
  const { data: productions } = useCollection('evenementiel_productions')
  const briques = useBriqueterieStore((s) => s.briques.filter((b) => b.id !== 'caillasses'))

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null) // production consultée (détail par catégorie)
  const [machineDetail, setMachineDetail] = useState(null) // nom de machine consultée (détail agrégé)

  // Machines déjà utilisées → suggestions dans le formulaire (pas de référentiel
  // dédié : `machine` reste un champ libre, mais on aide à rester cohérent).
  const machinesConnues = useMemo(
    () => [...new Set(productions.map((p) => (p.machine || '').trim()).filter(Boolean))].sort(),
    [productions]
  )
  // Statistiques par machine, tout historique confondu (indépendant du filtre de
  // période ci-dessous) — alimente la modale « Détail machine ».
  const productionsDeMachine = useMemo(() => {
    if (!machineDetail) return []
    return productions.filter((p) => (p.machine || '').trim() === machineDetail).sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [productions, machineDetail])

  // Filtre de période — bandeau (glassmorphism). Vide par défaut = tout l'historique.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')

  const liste = useMemo(() => {
    let rows = [...productions]
    if (modePeriode === 'mois' && filtreMois) rows = rows.filter((p) => (p.date || '').startsWith(filtreMois))
    else if (modePeriode === 'annee' && filtreAnnee) rows = rows.filter((p) => (p.date || '').startsWith(filtreAnnee))
    else if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      rows = rows.filter((p) => (!filtreDebut || p.date >= filtreDebut) && (!filtreFin || p.date <= filtreFin))
    } else if (modePeriode === 'jour' && filtreJour) rows = rows.filter((p) => p.date === filtreJour)
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [productions, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])

  function openCreate() {
    const qty = {}
    briques.forEach((b) => { qty[b.id] = 0 })
    setForm({ id: null, date: todayStr(), duree: 24, machine: 'Machine 1', quantites: qty, caillasses: 0, notes: '' })
    setOpen(true)
  }

  // Modifier — ouvert aux agents ET à l'administration (contrairement à la
  // suppression, réservée admin + Info, cf. peutSupprimer) : une production
  // affecte le stock dès sa saisie, il n'y a pas de « brouillon » à part —
  // enregistrer() réajuste donc le stock appatam à chaque modification.
  function openEdit(p) {
    const qty = {}
    briques.forEach((b) => { qty[b.id] = 0 })
    ;(p.lignes || []).forEach((l) => { qty[l.briqueId] = l.qte })
    setForm({ id: p.id, date: p.date, duree: p.duree, machine: p.machine || 'Machine 1', quantites: qty, caillasses: p.caillasses || 0, notes: p.notes || '' })
    setOpen(true)
  }

  const totalBriques = useMemo(() => {
    if (!form) return 0
    return Object.values(form.quantites).reduce((s, q) => s + (parseInt(q) || 0), 0)
  }, [form])

  async function enregistrer() {
    if (!form || totalBriques <= 0) return toast.error('Indiquez au moins une quantité produite')
    const lignes = briques.map((b) => ({
      briqueId: b.id, briqueNom: b.nom, qte: parseInt(form.quantites[b.id]) || 0
    })).filter((l) => l.qte > 0)
    const caillasses = parseInt(form.caillasses) || 0

    if (form.id) {
      // ── Modification : réajuste le stock appatam déjà ajouté ────────────────
      const vAvant = productions.find((p) => p.id === form.id)
      if (!vAvant) return toast.error('Production introuvable')
      let echec = null
      if (vAvant.date === form.date) {
        // Même jour : applique le DELTA (nouvelle qté − ancienne qté) par brique —
        // même principe que `supprimer`, bloqué si le retrait dépasse ce qui reste
        // en appatam (signe qu'une partie est déjà passée en séchage).
        await updateAtomic('evenementiel_inventaires', form.date, (cur) => {
          echec = null
          cur = cur || { date: form.date, matieres: {}, briques: {} }
          const briquesStock = { ...(cur.briques || {}) }
          const briqueIds = new Set([...(vAvant.lignes || []).map((l) => l.briqueId), ...lignes.map((l) => l.briqueId)])
          for (const id of briqueIds) {
            const avant = (vAvant.lignes || []).filter((l) => l.briqueId === id).reduce((s, l) => s + (l.qte || 0), 0)
            const apres = lignes.filter((l) => l.briqueId === id).reduce((s, l) => s + (l.qte || 0), 0)
            const delta = apres - avant
            if (delta === 0) continue
            const c = briquesStock[id] || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
            const nouveau = (c.appatam || 0) + delta
            if (nouveau < 0) {
              const b = briques.find((x) => x.id === id)
              echec = `Impossible : « ${b?.nom || id} » n'a plus que ${c.appatam || 0} en appatam — une partie a déjà été déplacée vers le séchage.`
              return undefined
            }
            briquesStock[id] = { ...c, appatam: nouveau }
          }
          const deltaCaillasses = caillasses - (parseInt(vAvant.caillasses) || 0)
          if (deltaCaillasses !== 0) {
            const c = briquesStock.caillasses || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
            const nouveau = (c.caillasses || 0) + deltaCaillasses
            if (nouveau < 0) { echec = `Impossible : il ne reste que ${c.caillasses || 0} caillasses en stock.`; return undefined }
            briquesStock.caillasses = { ...c, caillasses: nouveau }
          }
          return { ...cur, date: form.date, savedAt: ts(), matieres: cur.matieres || {}, briques: briquesStock, agentId: user.uid, agentNom: user.nom }
        })
        if (echec) return toast.error(echec)
      } else {
        // Date changée : on retire intégralement l'ANCIEN jour puis on ajoute au NOUVEAU.
        await updateAtomic('evenementiel_inventaires', vAvant.date, (cur) => {
          echec = null
          if (!cur) { echec = "Stock introuvable pour l'ancienne date — rien à retirer."; return undefined }
          const briquesStock = { ...(cur.briques || {}) }
          for (const l of (vAvant.lignes || [])) {
            const dispo = briquesStock[l.briqueId]?.appatam || 0
            if (dispo < l.qte) { echec = `Impossible : « ${l.briqueNom} » n'a plus que ${dispo} en appatam à la date d'origine.`; return undefined }
          }
          const anciennesCaillasses = parseInt(vAvant.caillasses) || 0
          if (anciennesCaillasses > 0 && (briquesStock.caillasses?.caillasses || 0) < anciennesCaillasses) {
            echec = `Impossible : il ne reste que ${briquesStock.caillasses?.caillasses || 0} caillasses à la date d'origine.`
            return undefined
          }
          for (const l of (vAvant.lignes || [])) {
            const c = briquesStock[l.briqueId]
            briquesStock[l.briqueId] = { ...c, appatam: (c.appatam || 0) - l.qte }
          }
          if (anciennesCaillasses > 0) {
            const c = briquesStock.caillasses
            briquesStock.caillasses = { ...c, caillasses: (c.caillasses || 0) - anciennesCaillasses }
          }
          return { ...cur, briques: briquesStock }
        })
        if (echec) return toast.error(echec)
        await updateAtomic('evenementiel_inventaires', form.date, (cur) => {
          cur = cur || { date: form.date, matieres: {}, briques: {} }
          const briquesStock = { ...(cur.briques || {}) }
          lignes.forEach((l) => {
            const c = briquesStock[l.briqueId] || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
            briquesStock[l.briqueId] = { ...c, appatam: (c.appatam || 0) + l.qte }
          })
          if (caillasses > 0) {
            const c = briquesStock.caillasses || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
            briquesStock.caillasses = { ...c, caillasses: (c.caillasses || 0) + caillasses }
          }
          return { ...cur, date: form.date, savedAt: ts(), matieres: cur.matieres || {}, briques: briquesStock, agentId: user.uid, agentNom: user.nom }
        })
      }
      await updateItem('evenementiel_productions', form.id, {
        date: form.date, duree: form.duree, machine: form.machine, lignes, totalBriques, caillasses, notes: form.notes
      })
      await audit('evenementiel', 'PRODUCTION_EDIT', `${vAvant.num} — ${formatNumber(totalBriques)} briques (stock réajusté)`)
      toast.success('Production modifiée ✓ — stock réajusté')
    } else {
      // ── Création ──────────────────────────────────────────────────────────
      const num = genNumero('PROD', productions.length)
      await addItem('evenementiel_productions', {
        num, date: form.date, duree: form.duree, machine: form.machine,
        lignes, totalBriques, caillasses,
        notes: form.notes,
        agentId: user.uid, agentNom: user.nom
      })

      // Mise à jour inventaire du jour : stock appatam (les briques produites).
      // La consommation des matières premières est saisie MANUELLEMENT dans l'onglet
      // Stock briques (pas de déduction automatique par recette) → on préserve `matieres`.
      //
      // ÉCRITURE ATOMIQUE (updateAtomic, pas setItem) : plusieurs productions du même
      // jour (ex. Machine 1, 2, 3 saisies à la suite) écrivent sur le MÊME document.
      // Un simple read-then-write basé sur l'instantané local (`inventaires`) risquait
      // de faire écraser une production par la suivante si le listener temps réel
      // n'avait pas encore rattrapé l'écriture précédente — updateAtomic relit
      // toujours la valeur réelle en base au moment de l'écriture.
      await updateAtomic('evenementiel_inventaires', form.date, (cur) => {
        cur = cur || { date: form.date, matieres: {}, briques: {} }
        const briquesStock = { ...(cur.briques || {}) }
        lignes.forEach((l) => {
          const c = briquesStock[l.briqueId] || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
          briquesStock[l.briqueId] = { ...c, appatam: (c.appatam || 0) + l.qte }
        })
        if (caillasses > 0) {
          const c = briquesStock.caillasses || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
          briquesStock.caillasses = { ...c, caillasses: (c.caillasses || 0) + caillasses }
        }
        return {
          ...cur, date: form.date, savedAt: ts(),
          matieres: cur.matieres || {}, briques: briquesStock,
          agentId: user.uid, agentNom: user.nom
        }
      })

      await audit('evenementiel', 'PRODUCTION', `${num} — ${formatNumber(totalBriques)} briques`)
      toast.success(`Production ${num} enregistrée ✓ — briques placées en appatam`)
    }
    setOpen(false)
  }

  // Supprime une production ET retire du stock appatam du jour exactement ce
  // qu'elle y avait ajouté (même écriture ATOMIQUE que `enregistrer`, pour ne
  // jamais écraser une saisie concurrente sur le même document). Bloquée si le
  // stock disponible ne suffit plus — signe qu'une partie de ces briques a déjà
  // été déplacée vers le séchage/prêtes dans le Stock briques : supprimer
  // rendrait alors le stock incohérent (négatif).
  async function supprimer(p) {
    if (!confirm(`Supprimer la production ${p.num} du ${p.date} ?\nLes ${formatNumber(p.totalBriques)} briques${p.caillasses ? ` (+ ${p.caillasses} caillasses)` : ''} seront retirées du stock appatam de ce jour.`)) return
    let echec = null
    await updateAtomic('evenementiel_inventaires', p.date, (cur) => {
      echec = null
      if (!cur) { echec = 'Stock introuvable pour cette date — rien à retirer.'; return undefined }
      const briquesStock = { ...(cur.briques || {}) }
      const caillassesQte = parseInt(p.caillasses) || 0
      for (const l of (p.lignes || [])) {
        const dispo = briquesStock[l.briqueId]?.appatam || 0
        if (dispo < l.qte) {
          echec = `Impossible : « ${l.briqueNom} » n'a plus que ${dispo} en appatam (${l.qte} à retirer) — une partie a déjà été déplacée vers le séchage.`
          return undefined
        }
      }
      if (caillassesQte > 0) {
        const dispo = briquesStock.caillasses?.caillasses || 0
        if (dispo < caillassesQte) {
          echec = `Impossible : il ne reste que ${dispo} caillasses en stock (${caillassesQte} à retirer).`
          return undefined
        }
      }
      for (const l of (p.lignes || [])) {
        const c = briquesStock[l.briqueId]
        briquesStock[l.briqueId] = { ...c, appatam: (c.appatam || 0) - l.qte }
      }
      if (caillassesQte > 0) {
        const c = briquesStock.caillasses
        briquesStock.caillasses = { ...c, caillasses: (c.caillasses || 0) - caillassesQte }
      }
      return { ...cur, briques: briquesStock }
    })
    if (echec) { toast.error(echec); return }
    await removeItem('evenementiel_productions', p.id)
    await audit('evenementiel', 'PRODUCTION_DELETE', `${p.num} — ${formatNumber(p.totalBriques)} briques retirées du stock`)
    toast.success('Production supprimée — stock corrigé ✓')
    if (detail?.id === p.id) setDetail(null)
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(76,29,149,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#7c3aed', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Factory size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Production</h2>
          <p className="text-sm text-white/80">Appatam → séchage (5-6 jours) → prêtes à vendre — cycle 24h ou 48h</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism). */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
      </div>

      <div className="rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-800">
        Cycle de production <strong>24 h ou 48 h max</strong>. Les briques produites sont placées en <strong>appatam</strong>,
        puis déplacées vers l'extérieur pour séchage (5 à 6 jours).
      </div>
      {!lectureSeule && (
        <div className="flex justify-end">
          <Button onClick={openCreate}><Plus size={16} /> Nouvelle production</Button>
        </div>
      )}
      <Card className="p-0">
        <Table
          stickyHeader
          onRowClick={(r) => setDetail(r)}
          columns={[
            { key: 'num', label: 'N°', sticky: true, width: '110px' },
            { key: 'date', label: 'Date' },
            { key: 'duree', label: 'Durée', render: (r) => `${r.duree}h` },
            { key: 'machine', label: 'Machine', render: (r) => r.machine ? (
              <button onClick={(e) => { e.stopPropagation(); setMachineDetail(r.machine) }}
                title={`Voir le détail de ${r.machine}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:border-violet-300 hover:bg-violet-100">
                <Cog size={13} /> {r.machine}
              </button>
            ) : '—' },
            { key: 'totalBriques', label: 'Total briques', align: 'right', render: (r) => formatNumber(r.totalBriques) },
            { key: 'caillasses', label: 'Caillasses', align: 'right' },
            { key: 'agentNom', label: 'Agent' },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setDetail(r)} title="Voir le détail par catégorie" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
                {!lectureSeule && (
                  <button onClick={() => openEdit(r)} title="Modifier" className="rounded p-1.5 text-violet-600 hover:bg-violet-50"><Pencil size={16} /></button>
                )}
                {peutSupprimer && (
                  <button onClick={() => supprimer(r)} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                )}
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucune production enregistrée."
        />
      </Card>

      {/* Détail d'une production : quantités produites PAR CATÉGORIE (pas juste le total). */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Production ${detail.num}` : ''}
        footer={<>
          <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
          {!lectureSeule && detail && <Button variant="outline" onClick={() => { const d = detail; setDetail(null); openEdit(d) }}><Pencil size={15} /> Modifier</Button>}
          {peutSupprimer && detail && <Button variant="danger" onClick={() => supprimer(detail)}><Trash2 size={15} /> Supprimer</Button>}
        </>}
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/70 p-3 sm:grid-cols-4">
              <div><p className="text-[10px] font-bold uppercase text-gray-400">Date</p><p className="font-semibold">{detail.date}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-gray-400">Cycle</p><p className="font-semibold">{detail.duree}h</p></div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-400">Machine</p>
                {detail.machine ? (
                  <button onClick={() => { const m = detail.machine; setDetail(null); setMachineDetail(m) }}
                    className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline">
                    <Cog size={13} /> {detail.machine}
                  </button>
                ) : <p className="font-semibold">—</p>}
              </div>
              <div><p className="text-[10px] font-bold uppercase text-gray-400">Agent</p><p className="font-semibold">{detail.agentNom || '—'}</p></div>
            </div>
            <div className="overflow-hidden rounded-lg bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-3 py-2 text-left">Catégorie produite</th><th className="px-3 py-2 text-right">Quantité</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(detail.lignes || []).filter((l) => (parseInt(l.qte) || 0) > 0).map((l, i) => (
                    <tr key={i}><td className="px-3 py-2 font-semibold text-gray-800">{l.briqueNom}</td><td className="px-3 py-2 text-right font-extrabold text-violet-700">{formatNumber(l.qte)}</td></tr>
                  ))}
                  {(parseInt(detail.caillasses) || 0) > 0 && (
                    <tr className="bg-gray-50/50"><td className="px-3 py-2 font-semibold text-gray-600">Caillasses (cassées)</td><td className="px-3 py-2 text-right font-bold text-gray-600">{formatNumber(detail.caillasses)}</td></tr>
                  )}
                  {!(detail.lignes || []).some((l) => (parseInt(l.qte) || 0) > 0) && (
                    <tr><td colSpan={2} className="py-6 text-center text-gray-400">Aucune catégorie renseignée.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-violet-50/60">
                    <td className="px-3 py-2 text-right text-xs font-bold uppercase text-gray-500">Total briques</td>
                    <td className="px-3 py-2 text-right text-base font-extrabold text-violet-700">{formatNumber(detail.totalBriques || 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {detail.notes && <p className="rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-600">📝 {detail.notes}</p>}
          </div>
        )}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={form?.id ? 'Modifier la production' : 'Enregistrer une production'}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={enregistrer}><Factory size={16} /> {form?.id ? 'Mettre à jour' : 'Enregistrer'}</Button></>}>
        {form && (
          <div className="space-y-4">
            {form.id && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Modifier les quantités ou la date réajustera automatiquement le stock appatam déjà ajouté par cette production.
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormGroup label="Date"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></FormGroup>
              <FormGroup label="Durée cycle">
                <Select value={form.duree} onChange={(e) => setForm((f) => ({ ...f, duree: parseInt(e.target.value) }))}>
                  {DUREE_PRODUCTION_OPTIONS.map((d) => <option key={d} value={d}>{d} heures</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Machine">
                <div className="relative">
                  <Cog size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input className="pl-8" list="machines-production" value={form.machine} onChange={(e) => setForm((f) => ({ ...f, machine: e.target.value }))} />
                  <datalist id="machines-production">{machinesConnues.map((m) => <option key={m} value={m} />)}</datalist>
                </div>
              </FormGroup>
            </div>
            <p className="text-xs font-bold uppercase text-gray-500">Quantités produites par catégorie</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {briques.map((b) => (
                <FormGroup key={b.id} label={b.nom}>
                  <Input type="number" min="0" value={form.quantites[b.id] || 0}
                    onChange={(e) => setForm((f) => ({ ...f, quantites: { ...f.quantites, [b.id]: e.target.value } }))} />
                </FormGroup>
              ))}
            </div>
            <FormGroup label="Caillasses (cassées)">
              <Input type="number" min="0" value={form.caillasses} onChange={(e) => setForm((f) => ({ ...f, caillasses: e.target.value }))} />
            </FormGroup>
            <p className="text-right text-xs text-gray-500">Total : {formatNumber(totalBriques)} briques</p>
          </div>
        )}
      </Modal>

      {/* Détail d'une machine — cumul de toutes ses productions (tout historique
          confondu, indépendant du filtre de période de la liste principale). */}
      <Modal open={!!machineDetail} onClose={() => setMachineDetail(null)} size="lg"
        title={machineDetail ? `Machine — ${machineDetail}` : ''}
        footer={<Button variant="ghost" onClick={() => setMachineDetail(null)}>Fermer</Button>}
        {...glassModalProps(COULEUR_MODULE.evenementiel)}>
        {machineDetail && (() => {
          const totalMachine = productionsDeMachine.reduce((s, p) => s + (parseInt(p.totalBriques) || 0), 0)
          const totalCaillassesMachine = productionsDeMachine.reduce((s, p) => s + (parseInt(p.caillasses) || 0), 0)
          return (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/70 p-3 sm:grid-cols-4">
                <div><p className="text-[10px] font-bold uppercase text-gray-400">Productions</p><p className="text-lg font-extrabold text-violet-700">{productionsDeMachine.length}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-400">Total briques</p><p className="text-lg font-extrabold text-violet-700">{formatNumber(totalMachine)}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-400">Caillasses</p><p className="text-lg font-extrabold text-gray-600">{formatNumber(totalCaillassesMachine)}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-400">Dernière utilisation</p><p className="font-semibold">{productionsDeMachine[0] ? formatDateShort(productionsDeMachine[0].date) : '—'}</p></div>
              </div>
              <div className="overflow-hidden rounded-lg bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr><th className="px-3 py-2 text-left">N°</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-right">Total briques</th><th className="px-3 py-2 text-left">Agent</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productionsDeMachine.map((p) => (
                      <tr key={p.id} className="cursor-pointer hover:bg-gray-50" onClick={() => { setMachineDetail(null); setDetail(p) }}>
                        <td className="px-3 py-2 font-mono text-xs">{p.num}</td>
                        <td className="px-3 py-2">{formatDateShort(p.date)}</td>
                        <td className="px-3 py-2 text-right font-bold text-violet-700">{formatNumber(p.totalBriques)}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.agentNom || '—'}</td>
                        <td className="px-2 py-2 text-right text-gray-300"><ChevronRight size={14} /></td>
                      </tr>
                    ))}
                    {!productionsDeMachine.length && (
                      <tr><td colSpan={5} className="py-6 text-center text-gray-400">Aucune production pour cette machine.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
