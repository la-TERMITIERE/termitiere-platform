// Transport — BRIQUETERIE.
// Suivi des camions/livraisons : chaque TRAJET porte sa plaque d'immatriculation,
// ses horaires (départ → arrivée), son itinéraire (d'où à où), sa cargaison, la
// recette de la course (travail/location facturé) et ses dépenses (carburant,
// péage, main d'œuvre…) ajoutées une à une. La marge du trajet = recette − dépenses
// est calculée automatiquement, et le bas de page cumule recette / dépenses / marge
// sur la période sélectionnée.
import { useMemo, useState } from 'react'
import { Truck, Plus, Trash2, Pencil, X, MapPin, Clock, Fuel } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { addItem, setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isReadOnlyRole, isFullAccessRole } from '../../core/roles'
import { genId, genNumero, todayStr, formatMoney, formatDateShort } from '../../utils/formatters'

const totalDep = (dep) => (dep || []).reduce((s, d) => s + (parseFloat(d.montant) || 0), 0)
const margeDe = (t) => (parseFloat(t.recette) || 0) - totalDep(t.depenses)

const vide = () => ({
  date: todayStr(), plaque: '', chauffeur: '',
  heureDepart: '', heureArrivee: '', lieuDepart: '', lieuArrivee: '',
  cargaison: '', recette: '', depenses: []
})

export default function Transport() {
  const { user, role } = useAuth()
  const peutSaisir = !isReadOnlyRole(role)
  const peutSupprimer = isFullAccessRole(role)
  const { data: transports } = useCollection('evenementiel_transports')
  const { start, end, node: periodNode } = usePeriodSelect('mois')

  const [modal, setModal] = useState(null)   // { data, isNew, id }
  const [dep, setDep] = useState({ label: '', montant: '' }) // brouillon de dépense
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving] = useState(false)

  // Plaques déjà utilisées → suggestions (identification des camions).
  const plaques = useMemo(
    () => [...new Set(transports.map((t) => (t.plaque || '').trim()).filter(Boolean))].sort(),
    [transports]
  )

  const liste = useMemo(
    () => transports.filter((t) => (t.date || '') >= start && (t.date || '') <= end).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transports, start, end]
  )
  const cumul = useMemo(() => liste.reduce((s, t) => {
    const d = totalDep(t.depenses)
    return { recette: s.recette + (parseFloat(t.recette) || 0), depenses: s.depenses + d, marge: s.marge + margeDe(t) }
  }, { recette: 0, depenses: 0, marge: 0 }), [liste])

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  function ajouterDepense() {
    const label = (dep.label || '').trim()
    const montant = parseFloat(dep.montant) || 0
    if (!label && !montant) return
    set('depenses', [...(modal.data.depenses || []), { label: label || 'Dépense', montant }])
    setDep({ label: '', montant: '' })
  }
  function retirerDepense(i) {
    set('depenses', (modal.data.depenses || []).filter((_, j) => j !== i))
  }

  async function enregistrer() {
    if (saving) return
    const d = modal.data
    if (!d.plaque.trim()) return toast.error("Indiquez la plaque d'immatriculation du camion")
    setSaving(true)
    try {
      const depenses = (d.depenses || []).map((x) => ({ label: x.label, montant: parseFloat(x.montant) || 0 }))
      const payload = {
        ...d, plaque: d.plaque.trim().toUpperCase(),
        recette: parseFloat(d.recette) || 0, depenses,
        totalDepenses: totalDep(depenses), marge: (parseFloat(d.recette) || 0) - totalDep(depenses),
        agentId: user.uid, agentNom: user.nom
      }
      if (modal.isNew) {
        const id = genId()
        await setItem('evenementiel_transports', id, { id, num: genNumero('TR', transports.length), createdAt: Date.now(), ...payload })
        await audit('evenementiel', 'TRANSPORT', `${payload.plaque} · ${d.lieuDepart || '?'} → ${d.lieuArrivee || '?'}`)
        toast.success('Trajet enregistré ✓')
      } else {
        await setItem('evenementiel_transports', modal.id, { ...modal.dataInitial, ...payload, id: modal.id })
        await audit('evenementiel', 'TRANSPORT_EDIT', `${payload.plaque}`)
        toast.success('Trajet mis à jour ✓')
      }
      setModal(null)
    } finally { setSaving(false) }
  }

  async function supprimer() {
    const t = toDelete
    setToDelete(null)
    await removeItem('evenementiel_transports', t.id)
    await audit('evenementiel', 'TRANSPORT_DELETE', `${t.plaque || ''} · ${t.num || ''}`)
    toast.success('Trajet supprimé ✓')
  }

  const estMien = (t) => t.agentId && user?.uid && t.agentId === user.uid
  const horaire = (t) => (t.heureDepart || t.heureArrivee) ? `${t.heureDepart || '—'} → ${t.heureArrivee || '—'}` : '—'

  return (
    <div className="space-y-5">
      {/* En-tête + période */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-violet-700 to-violet-900 p-4 text-white shadow-lg">
        <Truck size={22} />
        <div>
          <h2 className="text-base font-extrabold">Transport — Briqueterie</h2>
          <p className="text-xs text-white/80">Camions & livraisons : trajets, horaires, cargaison, recette, dépenses, marge</p>
        </div>
        <div className="w-full sm:ml-auto sm:w-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:text-white [&_.input-base]:font-semibold [&_label]:text-white">
          {periodNode}
        </div>
      </div>

      {/* Cumul sur la période */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Recette (période)</p>
          <p className="text-xl font-extrabold text-violet-700">{formatMoney(cumul.recette)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Dépenses (période)</p>
          <p className="text-xl font-extrabold text-amber-700">{formatMoney(cumul.depenses)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Marge bénéficiaire</p>
          <p className={`text-xl font-extrabold ${cumul.marge >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(cumul.marge)}</p>
        </div>
      </div>

      {peutSaisir && (
        <div className="flex justify-end">
          <Button style={{ backgroundColor: '#7c3aed' }} onClick={() => { setModal({ data: vide(), isNew: true }); setDep({ label: '', montant: '' }) }}>
            <Plus size={16} /> Nouveau trajet
          </Button>
        </div>
      )}

      {/* Tableau des trajets de la période */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Plaque</th>
              <th className="px-3 py-2 text-left">Trajet</th>
              <th className="px-3 py-2 text-left">Horaire</th>
              <th className="px-3 py-2 text-left">Cargaison</th>
              <th className="px-3 py-2 text-right">Recette</th>
              <th className="px-3 py-2 text-right">Dépenses</th>
              <th className="px-3 py-2 text-right">Marge</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.map((t) => {
              const d = totalDep(t.depenses)
              const m = margeDe(t)
              return (
                <tr key={t.id} className="hover:bg-violet-50/40">
                  <td className="px-3 py-2 font-mono text-xs">{formatDateShort(t.date)}</td>
                  <td className="px-3 py-2"><span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold">{t.plaque || '—'}</span></td>
                  <td className="px-3 py-2">{(t.lieuDepart || t.lieuArrivee) ? <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gray-400" />{t.lieuDepart || '?'} → {t.lieuArrivee || '?'}</span> : '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{horaire(t)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{t.cargaison || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold text-violet-700">{formatMoney(parseFloat(t.recette) || 0)}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{formatMoney(d)}</td>
                  <td className={`px-3 py-2 text-right font-bold ${m >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(m)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {(estMien(t) || peutSupprimer) && peutSaisir && (
                        <button onClick={() => { setModal({ data: { ...vide(), ...t }, dataInitial: t, isNew: false, id: t.id }); setDep({ label: '', montant: '' }) }}
                          title="Modifier" className="rounded-lg p-1.5 text-violet-600 hover:bg-violet-50"><Pencil size={15} /></button>
                      )}
                      {peutSupprimer && (
                        <button onClick={() => setToDelete(t)} title="Supprimer" className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!liste.length && (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400">Aucun trajet sur la période.</td></tr>
            )}
          </tbody>
          {liste.length > 0 && (
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <td className="px-3 py-2" colSpan={5}>TOTAL PÉRIODE ({formatDateShort(start)} → {formatDateShort(end)})</td>
                <td className="px-3 py-2 text-right text-violet-700">{formatMoney(cumul.recette)}</td>
                <td className="px-3 py-2 text-right text-amber-700">{formatMoney(cumul.depenses)}</td>
                <td className={`px-3 py-2 text-right ${cumul.marge >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(cumul.marge)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {/* Modal création / édition d'un trajet */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        title={modal?.isNew ? 'Nouveau trajet' : 'Modifier le trajet'}
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200"
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button style={{ backgroundColor: '#7c3aed' }} onClick={enregistrer} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            {/* Identification & date */}
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-white p-3 md:grid-cols-3">
              <FormGroup label="Date">
                <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
              </FormGroup>
              <FormGroup label="Plaque d'immatriculation" required>
                <Input list="plaques-transport" value={modal.data.plaque} onChange={(e) => set('plaque', e.target.value)} placeholder="ex : TG 1234 AB" />
                <datalist id="plaques-transport">{plaques.map((p) => <option key={p} value={p} />)}</datalist>
              </FormGroup>
              <FormGroup label="Chauffeur">
                <Input value={modal.data.chauffeur} onChange={(e) => set('chauffeur', e.target.value)} placeholder="Nom du chauffeur" />
              </FormGroup>
            </div>

            {/* Itinéraire & horaires */}
            <div className="rounded-lg bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700"><MapPin size={13} /> Itinéraire & horaires</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Départ (lieu)"><Input value={modal.data.lieuDepart} onChange={(e) => set('lieuDepart', e.target.value)} placeholder="D'où" /></FormGroup>
                <FormGroup label="Arrivée (lieu)"><Input value={modal.data.lieuArrivee} onChange={(e) => set('lieuArrivee', e.target.value)} placeholder="Vers où" /></FormGroup>
                <FormGroup label="Heure de départ"><Input type="time" value={modal.data.heureDepart} onChange={(e) => set('heureDepart', e.target.value)} /></FormGroup>
                <FormGroup label="Heure d'arrivée"><Input type="time" value={modal.data.heureArrivee} onChange={(e) => set('heureArrivee', e.target.value)} /></FormGroup>
              </div>
              <FormGroup label="Cargaison (qu'est-ce qui a été transporté)" className="mt-1">
                <Input value={modal.data.cargaison} onChange={(e) => set('cargaison', e.target.value)} placeholder="ex : 2000 briques 12 creux pour chantier X" />
              </FormGroup>
            </div>

            {/* Finances : recette + dépenses un à un */}
            <div className="rounded-lg bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700"><Fuel size={13} /> Coût & dépenses du trajet</p>
              <FormGroup label="Recette de la course (travail / location du camion, FCFA)">
                <Input type="number" min="0" value={modal.data.recette} onChange={(e) => set('recette', e.target.value)} placeholder="Montant facturé / gagné pour ce trajet" />
              </FormGroup>

              <p className="mt-3 mb-1 text-xs font-semibold text-gray-500">Dépenses (carburant, péage, main d'œuvre…) — ajoutez-les une à une</p>
              {(modal.data.depenses || []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {modal.data.depenses.map((x, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      {x.label} · {formatMoney(parseFloat(x.montant) || 0)}
                      <button type="button" onClick={() => retirerDepense(i)} className="rounded-full p-0.5 hover:bg-black/10"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
                <Input className="col-span-2 md:col-span-6" value={dep.label} onChange={(e) => setDep((d) => ({ ...d, label: e.target.value }))} placeholder="Nature (ex : Carburant / essence)" />
                <Input className="md:col-span-4" type="number" min="0" value={dep.montant} onChange={(e) => setDep((d) => ({ ...d, montant: e.target.value }))} placeholder="Montant" />
                <div className="col-span-2 md:col-span-2">
                  <Button type="button" variant="outline" onClick={ajouterDepense}><Plus size={14} /> Ajouter</Button>
                </div>
              </div>

              {/* Récap marge en direct */}
              <div className="mt-3 flex flex-wrap justify-end gap-4 border-t border-gray-100 pt-2 text-sm">
                <span className="text-gray-500">Dépenses : <strong className="text-amber-700">{formatMoney(totalDep(modal.data.depenses))}</strong></span>
                <span className="text-gray-500">Marge : <strong className={margeDe(modal.data) >= 0 ? 'text-green-700' : 'text-red-600'}>{formatMoney(margeDe(modal.data))}</strong></span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer ce trajet ?"
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={supprimer}>Supprimer</Button></>}>
        {toDelete && <p className="text-sm text-gray-600">Supprimer le trajet du {formatDateShort(toDelete.date)} — {toDelete.plaque} ?</p>}
      </Modal>
    </div>
  )
}
