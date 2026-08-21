// Production briques — cycle 24h ou 48h, consommation matières auto, ajout stock appatam.
import { useMemo, useState } from 'react'
import { Factory, Plus, Eye } from 'lucide-react'
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
import { isReadOnlyRole } from '../../core/roles'
import { useBriqueterieStore } from './store/referentielStore'
import { addItem, updateAtomic, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatNumber } from '../../utils/formatters'
import { DUREE_PRODUCTION_OPTIONS } from './data'

export default function Production() {
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)
  const { data: productions } = useCollection('evenementiel_productions')
  const briques = useBriqueterieStore((s) => s.briques.filter((b) => b.id !== 'caillasses'))

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null) // production consultée (détail par catégorie)

  const liste = useMemo(() => [...productions].sort((a, b) => (a.date < b.date ? 1 : -1)), [productions])

  function openCreate() {
    const qty = {}
    briques.forEach((b) => { qty[b.id] = 0 })
    setForm({ date: todayStr(), duree: 24, machine: 'Machine 1', quantites: qty, caillasses: 0, notes: '' })
    setOpen(true)
  }

  const totalBriques = useMemo(() => {
    if (!form) return 0
    return Object.values(form.quantites).reduce((s, q) => s + (parseInt(q) || 0), 0)
  }, [form])

  async function enregistrer() {
    if (!form || totalBriques <= 0) return toast.error('Indiquez au moins une quantité produite')
    const num = genNumero('PROD', productions.length)
    const lignes = briques.map((b) => ({
      briqueId: b.id, briqueNom: b.nom, qte: parseInt(form.quantites[b.id]) || 0
    })).filter((l) => l.qte > 0)

    await addItem('evenementiel_productions', {
      num, date: form.date, duree: form.duree, machine: form.machine,
      lignes, totalBriques, caillasses: parseInt(form.caillasses) || 0,
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
      if (form.caillasses > 0) {
        const c = briquesStock.caillasses || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
        briquesStock.caillasses = { ...c, caillasses: (c.caillasses || 0) + parseInt(form.caillasses) }
      }
      return {
        ...cur, date: form.date, savedAt: ts(),
        matieres: cur.matieres || {}, briques: briquesStock,
        agentId: user.uid, agentNom: user.nom
      }
    })

    await audit('evenementiel', 'PRODUCTION', `${num} — ${formatNumber(totalBriques)} briques`)
    toast.success(`Production ${num} enregistrée ✓ — briques placées en appatam`)
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(76,29,149,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#7c3aed', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Factory size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Production</h2>
          <p className="text-sm text-white/80">Appatam → séchage (5-6 jours) → prêtes à vendre — cycle 24h ou 48h</p>
        </div>
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
          columns={[
            { key: 'num', label: 'N°', sticky: true, width: '110px' },
            { key: 'date', label: 'Date' },
            { key: 'duree', label: 'Durée', render: (r) => `${r.duree}h` },
            { key: 'machine', label: 'Machine' },
            { key: 'totalBriques', label: 'Total briques', align: 'right', render: (r) => formatNumber(r.totalBriques) },
            { key: 'caillasses', label: 'Caillasses', align: 'right' },
            { key: 'agentNom', label: 'Agent' },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <button onClick={() => setDetail(r)} title="Voir le détail par catégorie" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
            ) }
          ]}
          rows={liste}
          empty="Aucune production enregistrée."
        />
      </Card>

      {/* Détail d'une production : quantités produites PAR CATÉGORIE (pas juste le total). */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Production ${detail.num}` : ''}
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>}
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/70 p-3 sm:grid-cols-4">
              <div><p className="text-[10px] font-bold uppercase text-gray-400">Date</p><p className="font-semibold">{detail.date}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-gray-400">Cycle</p><p className="font-semibold">{detail.duree}h</p></div>
              <div><p className="text-[10px] font-bold uppercase text-gray-400">Machine</p><p className="font-semibold">{detail.machine || '—'}</p></div>
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

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Enregistrer une production"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={enregistrer}><Factory size={16} /> Enregistrer</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormGroup label="Date"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></FormGroup>
              <FormGroup label="Durée cycle">
                <Select value={form.duree} onChange={(e) => setForm((f) => ({ ...f, duree: parseInt(e.target.value) }))}>
                  {DUREE_PRODUCTION_OPTIONS.map((d) => <option key={d} value={d}>{d} heures</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Machine"><Input value={form.machine} onChange={(e) => setForm((f) => ({ ...f, machine: e.target.value }))} /></FormGroup>
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
    </div>
  )
}
