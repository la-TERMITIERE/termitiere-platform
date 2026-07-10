// Prestations / Location de matériel — quantité × tarif unitaire = montant par catégorie.
import { useMemo, useState } from 'react'
import { Plus, Eye, Trash2, CheckCircle2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useLogistiqueStore } from './store/referentielStore'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { isApproverRole } from '../../core/roles'
import { catColor } from './data'
import { useSite, matchSite, siteLabel } from './site/useSite'

const STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  facturee: { label: 'Facturée', tone: 'info' },
  en_cours: { label: 'En location', tone: 'warning' },
  terminee: { label: 'Terminée', tone: 'success' },
  annulee: { label: 'Annulée', tone: 'danger' }
}

export default function Prestations() {
  const { user, role } = useAuth()
  const site = useSite()
  const peutApprouver = isApproverRole(role) // gérant / direction : valident la prestation
  const { data: allPrestations } = useCollection('logistique_prestations')
  const { data: clients } = useCollection('logistique_clients')
  const { data: allRetours } = useCollection('logistique_retours')
  const materiel = useLogistiqueStore((s) => s.materiel)

  // Cloisonnement par site (sous-application Lomé / Kara).
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])
  const retours = useMemo(() => allRetours.filter((r) => matchSite(r, site)), [allRetours, site])

  // Retours enregistrés par prestation (pour l'état « retour OK / en attente »).
  const retoursParPresta = useMemo(() => {
    const map = {}
    retours.forEach((r) => {
      if (!r.prestationId) return
      ;(map[r.prestationId] = map[r.prestationId] || []).push(r)
    })
    return map
  }, [retours])

  // État opérationnel dérivé d'une prestation (dates + retours), au-delà du statut brut.
  function statutOp(p) {
    if (p.statut === 'annulee') return { label: 'Annulée', tone: 'danger' }
    const rets = retoursParPresta[p.id] || []
    const pris = (p.lignes || []).filter((l) => l.materielId).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
    const rendu = rets.reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
    const today = todayStr()
    if (pris > 0 && rendu >= pris) return { label: 'Terminée — retour OK', tone: 'success' }
    if (today < (p.dateDebut || '')) return { label: 'À venir', tone: 'info' }
    if (today <= (p.dateFin || '')) return { label: 'En cours', tone: 'warning' }
    return { label: 'Terminée — retour en attente', tone: 'neutral' }
  }
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)

  const liste = useMemo(() => [...prestations].sort((a, b) => (a.date < b.date ? 1 : -1)), [prestations])

  function openCreate() {
    setForm({
      clientId: clients[0]?.id || '',
      clientNom: clients[0]?.nom || '',
      dateDebut: todayStr(),
      dateFin: todayStr(),
      lieu: '',
      lignes: [{ materielId: materiel[0]?.id || '', qte: 1, tarif: materiel[0]?.tarifLocation || 0 }],
      frais: [], // frais supplémentaires libres : { label, montant } (transport, lieu…)
      statut: 'brouillon'
    })
    setOpen(true)
  }

  function addLigne() {
    const m = materiel[0]
    setForm((f) => ({ ...f, lignes: [...f.lignes, { materielId: m?.id || '', qte: 1, tarif: m?.tarifLocation || 0 }] }))
  }

  function setLigne(i, patch) {
    setForm((f) => {
      const lignes = f.lignes.map((l, k) => {
        if (k !== i) return l
        const next = { ...l, ...patch }
        if (patch.materielId !== undefined) {
          if (patch.materielId === '__autre__') {
            // Matériel hors référentiel : l'utilisateur précise le nom + le tarif.
            next.tarif = next.tarif || 0
            if (next.nomAutre === undefined) next.nomAutre = ''
          } else {
            const mat = materiel.find((x) => x.id === patch.materielId)
            next.tarif = mat?.tarifLocation || 0
            next.nomAutre = ''
          }
        }
        return next
      })
      return { ...f, lignes }
    })
  }

  // ── Frais supplémentaires (transport, lieu, divers…) ──
  function addFrais() { setForm((f) => ({ ...f, frais: [...(f.frais || []), { label: '', montant: 0 }] })) }
  function setFrais(i, patch) { setForm((f) => ({ ...f, frais: f.frais.map((x, k) => (k === i ? { ...x, ...patch } : x)) })) }
  function removeFrais(i) { setForm((f) => ({ ...f, frais: f.frais.filter((_, k) => k !== i) })) }

  const totalFrais = useMemo(
    () => (form?.frais || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0),
    [form]
  )

  const totalForm = useMemo(() => {
    if (!form) return 0
    const mat = form.lignes.reduce((s, l) => s + (parseInt(l.qte) || 0) * (parseFloat(l.tarif) || 0), 0)
    return mat + (form.frais || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0)
  }, [form])

  const parCategorie = useMemo(() => {
    if (!form) return []
    const map = {}
    form.lignes.forEach((l) => {
      const montant = (parseInt(l.qte) || 0) * (parseFloat(l.tarif) || 0)
      const cat = l.materielId === '__autre__' ? 'AUTRES' : materiel.find((x) => x.id === l.materielId)?.cat
      if (!cat) return
      map[cat] = (map[cat] || 0) + montant
    })
    const fr = (form.frais || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0)
    if (fr > 0) map['FRAIS SUPPLÉMENTAIRES'] = (map['FRAIS SUPPLÉMENTAIRES'] || 0) + fr
    return Object.entries(map).map(([cat, montant]) => ({ cat, montant, color: catColor(cat) }))
  }, [form, materiel])

  async function save() {
    if (!form.clientNom?.trim() && !form.clientId) return toast.error('Client requis')
    if (!form.lignes.length) return toast.error('Ajoutez au moins une ligne')
    const client = clients.find((c) => c.id === form.clientId)
    const num = genNumero(`PREST-${site.toUpperCase()}`, prestations.length)
    const lignes = form.lignes.map((l) => {
      const qte = parseInt(l.qte) || 0
      const tarif = parseFloat(l.tarif) || 0
      if (l.materielId === '__autre__') {
        // Matériel hors référentiel : nom libre, pas de lien matériel/stock.
        return { materielId: '', materielNom: (l.nomAutre || 'Autre').trim(), cat: 'AUTRES', unite: '', autre: true, qte, tarifUnitaire: tarif, montant: qte * tarif }
      }
      const m = materiel.find((x) => x.id === l.materielId)
      return { materielId: m?.id, materielNom: m?.nom, cat: m?.cat, unite: m?.unite, qte, tarifUnitaire: tarif, montant: qte * tarif }
    })
    // Frais supplémentaires (transport, lieu…) : on garde ceux qui ont un montant.
    const frais = (form.frais || [])
      .filter((x) => (parseFloat(x.montant) || 0) > 0)
      .map((x) => ({ label: (x.label || 'Frais').trim(), montant: parseFloat(x.montant) || 0 }))
    const totalMateriel = lignes.reduce((s, l) => s + l.montant, 0)
    const totalFraisSave = frais.reduce((s, x) => s + x.montant, 0)
    const total = totalMateriel + totalFraisSave
    await addItem('logistique_prestations', {
      num, date: todayStr(), site,
      clientId: form.clientId, clientNom: client?.nom || form.clientNom,
      dateDebut: form.dateDebut, dateFin: form.dateFin, lieu: form.lieu,
      lignes, frais, total, statut: 'brouillon',
      agentId: user.uid, agentNom: user.nom
    })
    await audit('logistique', 'PRESTATION', `${siteLabel(site)} — ${num} — ${formatMoney(total)}`)
    toast.success('Prestation enregistrée ✓ — en attente d\'approbation, facturable dès à présent')
    setOpen(false)
  }

  // L'autorisation vient AVANT la facturation : seule une prestation approuvée
  // (par un gérant / la direction) peut être facturée.
  async function approuver(p) {
    if (!peutApprouver) return toast.error('Action réservée aux gérants / direction')
    await updateItem('logistique_prestations', p.id, { approuvee: true, approuveePar: user.nom, approuveeLe: todayStr() })
    await audit('logistique', 'PRESTATION_APPROUVEE', `${p.num} — autorisée pour facturation`)
    toast.success(`Prestation ${p.num} approuvée ✓ — elle peut maintenant être facturée`)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openCreate}><Plus size={16} /> Nouvelle prestation</Button></div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'num', label: 'N°' },
            { key: 'clientNom', label: 'Client' },
            { key: 'periode', label: 'Période', render: (r) => `${formatDateShort(r.dateDebut)} → ${formatDateShort(r.dateFin)}` },
            { key: 'total', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.total)}</strong> },
            { key: 'statut', label: 'Facturation', render: (r) => <Badge tone={STATUTS[r.statut]?.tone}>{STATUTS[r.statut]?.label || r.statut}</Badge> },
            { key: 'etat', label: 'État', render: (r) => { const s = statutOp(r); return <Badge tone={s.tone}>{s.label}</Badge> } },
            { key: 'appr', label: 'Appro.', align: 'center', render: (r) => r.approuvee
              ? <Badge tone="success">Approuvée</Badge>
              : <Badge tone="neutral">En attente</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                {peutApprouver && !r.approuvee && r.statut !== 'annulee' && (
                  <button onClick={() => approuver(r)} className="rounded p-1.5 text-green-600 hover:bg-green-50" title="Approuver pour facturation"><CheckCircle2 size={16} /></button>
                )}
                <button onClick={() => setDetail(r)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title="Voir les détails"><Eye size={16} /></button>
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucune prestation."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Nouvelle prestation / location"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Client">
                <Select value={form.clientId} onChange={(e) => {
                  const c = clients.find((x) => x.id === e.target.value)
                  setForm((f) => ({ ...f, clientId: e.target.value, clientNom: c?.nom || '' }))
                }}>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  {!clients.length && <option value="">— Créez un client d'abord —</option>}
                </Select>
              </FormGroup>
              <FormGroup label="Lieu"><Input value={form.lieu} onChange={(e) => setForm((f) => ({ ...f, lieu: e.target.value }))} /></FormGroup>
              <FormGroup label="Date début"><Input type="date" value={form.dateDebut} onChange={(e) => setForm((f) => ({ ...f, dateDebut: e.target.value }))} /></FormGroup>
              <FormGroup label="Date fin"><Input type="date" value={form.dateFin} onChange={(e) => setForm((f) => ({ ...f, dateFin: e.target.value }))} /></FormGroup>
            </div>

            <p className="text-xs font-bold uppercase text-gray-500">Matériel loué</p>
            {form.lignes.map((l, i) => (
              <div key={i} className="rounded-lg border p-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
                  <Select className="col-span-2 md:col-span-5" value={l.materielId} onChange={(e) => setLigne(i, { materielId: e.target.value })}>
                    {materiel.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.cat})</option>)}
                    <option value="__autre__">➕ Autre (à préciser)…</option>
                  </Select>
                  <Input className="md:col-span-2" type="number" min="1" value={l.qte} onChange={(e) => setLigne(i, { qte: e.target.value })} placeholder="Qté" />
                  <Input className="md:col-span-2" type="number" min="0" value={l.tarif} onChange={(e) => setLigne(i, { tarif: e.target.value })} placeholder="Tarif/u" />
                  <div className="col-span-2 flex items-center justify-end font-bold text-secondary md:col-span-3">
                    {formatMoney((parseInt(l.qte) || 0) * (parseFloat(l.tarif) || 0))}
                  </div>
                </div>
                {l.materielId === '__autre__' && (
                  <Input className="mt-2" value={l.nomAutre || ''} onChange={(e) => setLigne(i, { nomAutre: e.target.value })}
                    placeholder="Précisez le matériel / la prestation (ex : groupe électrogène, podium…)" />
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addLigne}><Plus size={14} /> Ligne</Button>

            {/* Frais supplémentaires libres : transport, lieu, divers… */}
            <div className="mt-2">
              <p className="text-xs font-bold uppercase text-gray-500">Frais supplémentaires</p>
              {(form.frais || []).map((x, i) => (
                <div key={i} className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-12">
                  <Input className="col-span-2 md:col-span-7" value={x.label} onChange={(e) => setFrais(i, { label: e.target.value })} placeholder="Intitulé (ex : Transport, Lieu, Montage…)" />
                  <Input className="md:col-span-4" type="number" min="0" value={x.montant} onChange={(e) => setFrais(i, { montant: e.target.value })} placeholder="Montant" />
                  <button type="button" onClick={() => removeFrais(i)} className="flex items-center justify-center text-red-500 hover:text-red-700 md:col-span-1"><Trash2 size={15} /></button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="mt-1" onClick={addFrais}><Plus size={14} /> Frais</Button>
              {totalFrais > 0 && <p className="mt-1 text-right text-sm text-gray-600">Total frais : <strong>{formatMoney(totalFrais)}</strong></p>}
            </div>

            {parCategorie.length > 0 && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-2 text-xs font-bold uppercase text-gray-500">Par catégorie</p>
                {parCategorie.map((p) => (
                  <div key={p.cat} className="flex justify-between text-sm">
                    <span style={{ color: p.color }} className="font-semibold">{p.cat}</span>
                    <span>{formatMoney(p.montant)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-right text-lg font-extrabold">Total : {formatMoney(totalForm)}</p>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Prestation ${detail?.num || ''}`}>
        {detail && (() => {
          const s = statutOp(detail)
          const rets = retoursParPresta[detail.id] || []
          const pris = (detail.lignes || []).filter((l) => l.materielId).reduce((a, l) => a + (parseInt(l.qte) || 0), 0)
          const rendu = rets.reduce((a, r) => a + (parseInt(r.qte) || 0), 0)
          return (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={s.tone}>{s.label}</Badge>
              <Badge tone={STATUTS[detail.statut]?.tone}>{STATUTS[detail.statut]?.label || detail.statut}</Badge>
            </div>
            <p><strong>Client :</strong> {detail.clientNom}</p>
            <p><strong>Période :</strong> {formatDateShort(detail.dateDebut)} → {formatDateShort(detail.dateFin)}</p>
            {detail.lieu && <p><strong>Lieu :</strong> {detail.lieu}</p>}
            <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2 text-left">Matériel</th><th className="p-2">Qté</th><th className="p-2">Tarif</th><th className="p-2 text-right">Montant</th></tr></thead>
              <tbody>
                {(detail.lignes || []).map((l, i) => (
                  <tr key={i} className="border-t"><td className="p-2">{l.materielNom}{l.autre ? <span className="ml-1 text-[10px] text-gray-400">(autre)</span> : null}</td><td className="p-2 text-center">{l.qte}</td><td className="p-2 text-center">{formatMoney(l.tarifUnitaire)}</td><td className="p-2 text-right font-bold">{formatMoney(l.montant)}</td></tr>
                ))}
                {(detail.frais || []).map((x, i) => (
                  <tr key={`f${i}`} className="border-t bg-amber-50/40"><td className="p-2 text-amber-700">{x.label} <span className="text-[10px]">(frais)</span></td><td className="p-2 text-center">—</td><td className="p-2 text-center">—</td><td className="p-2 text-right font-bold">{formatMoney(x.montant)}</td></tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="text-right font-extrabold">Total : {formatMoney(detail.total)}</p>

            <div className="mt-2 rounded-lg bg-gray-50 p-3">
              <p className="mb-1 text-xs font-bold uppercase text-gray-500">Suivi des retours</p>
              {pris > 0
                ? <p className="text-sm">{rendu} / {pris} pièce(s) retournée(s){rendu >= pris ? ' — ✅ retour complet' : ' — ⏳ retour en attente'}</p>
                : <p className="text-sm text-gray-400">Aucun matériel du référentiel à retourner.</p>}
              {rets.map((r, i) => (
                <p key={i} className="text-xs text-gray-500">• {formatDateShort(r.date)} — {r.qte} × {r.materielNom} ({r.type}){r.motif ? ` — ${r.motif}` : ''}</p>
              ))}
            </div>
          </div>
          )
        })()}
      </Modal>
    </div>
  )
}
