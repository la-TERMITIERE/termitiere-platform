// Enregistrement des retours de matériel — OK / Cassé / Perdu.
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useLogistiqueStore } from './store/referentielStore'
import { addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { todayStr, genNumero } from '../../utils/formatters'
import { RETOUR_TYPES } from './logic'

export default function Retours() {
  const { user } = useAuth()
  const { data: retours } = useCollection('logistique_retours')
  const { data: prestations } = useCollection('logistique_prestations')
  const materiel = useLogistiqueStore((s) => s.materiel)

  const [form, setForm] = useState({
    prestationId: '', materielId: materiel[0]?.id || '', type: 'OK', qte: 1, motif: ''
  })

  const enCours = prestations.filter((p) => ['facturee', 'en_cours'].includes(p.statut))

  async function enregistrer() {
    if (!form.materielId || !form.qte) return toast.error('Matériel et quantité requis')
    const m = materiel.find((x) => x.id === form.materielId)
    const p = prestations.find((x) => x.id === form.prestationId)
    const num = genNumero('RET', retours.length)

    await addItem('logistique_retours', {
      num, date: todayStr(),
      prestationId: form.prestationId, prestationNum: p?.num,
      clientNom: p?.clientNom,
      materielId: m.id, materielNom: m.nom,
      type: form.type, qte: parseInt(form.qte) || 0, motif: form.motif.trim(),
      agentId: user.uid, agentNom: user.nom
    })

    if (form.type !== 'OK') {
      await notify({
        type: 'warning',
        title: `Retour matériel — ${form.type}`,
        body: `${form.qte} × ${m.nom} (${form.type})${form.motif ? ` — ${form.motif}` : ''}`,
        module: 'logistique',
        forRoles: ['admin', 'controleur'],
        link: '/logistique/retours'
      })
    }

    await audit('logistique', 'RETOUR', `${num} — ${form.type} — ${m.nom}`)
    toast.success('Retour enregistré ✓ — reportez-le aussi dans la saisie magasin du jour')
    setForm((f) => ({ ...f, qte: 1, motif: '' }))
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Après retour physique, enregistrez ici puis complétez la colonne <strong>Retours</strong> dans la saisie magasin
        (OK réintègre le stock · Cassé/Perdu = perte).
      </div>

      <Card title="Nouveau retour">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormGroup label="Prestation liée (optionnel)">
            <Select value={form.prestationId} onChange={(e) => setForm((f) => ({ ...f, prestationId: e.target.value }))}>
              <option value="">— Aucune —</option>
              {enCours.map((p) => <option key={p.id} value={p.id}>{p.num} — {p.clientNom}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Matériel" required>
            <Select value={form.materielId} onChange={(e) => setForm((f) => ({ ...f, materielId: e.target.value }))}>
              {materiel.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="État du retour" required>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {RETOUR_TYPES.map((t) => <option key={t} value={t}>{t === 'OK' ? 'OK — bon état' : t === 'Cassé' ? 'Cassé' : 'Perdu'}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Quantité"><Input type="number" min="1" value={form.qte} onChange={(e) => setForm((f) => ({ ...f, qte: e.target.value }))} /></FormGroup>
          <FormGroup label="Motif" className="sm:col-span-2">
            <Input value={form.motif} onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))} placeholder="Détail si cassé ou perdu…" />
          </FormGroup>
        </div>
        <Button className="mt-4" onClick={enregistrer}><RotateCcw size={16} /> Enregistrer le retour</Button>
      </Card>

      <Card title="Historique des retours" className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Matériel</th>
              <th className="px-3 py-2 text-center">Qté</th>
              <th className="px-3 py-2">État</th>
              <th className="px-3 py-2">Motif</th>
              <th className="px-3 py-2">Agent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...retours].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2 font-semibold">{r.materielNom}</td>
                <td className="px-3 py-2 text-center">{r.qte}</td>
                <td className={`px-3 py-2 font-semibold ${r.type === 'OK' ? 'text-green-600' : 'text-red-600'}`}>{r.type}</td>
                <td className="px-3 py-2 text-gray-500">{r.motif || '—'}</td>
                <td className="px-3 py-2 text-xs">{r.agentNom}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!retours.length && <p className="py-10 text-center text-gray-400">Aucun retour enregistré.</p>}
      </Card>
    </div>
  )
}
