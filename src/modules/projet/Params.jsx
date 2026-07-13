import { useState, useEffect } from 'react'
import { Trash2, AlertTriangle, RotateCcw, Bell, Save } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { TYPES_PROJET, STATUTS_PROJET, PRIORITES, STATUTS_TACHE, SEUILS_DEFAUT } from './data'
import { getAll, removeItem, setItem } from '../../core/db'
import { useCollection } from '../../hooks/useFirestore'
import { audit } from '../../core/audit'
import { useAuthStore } from '../../core/auth'
import { FULL_ACCESS_ROLES } from '../../core/roles'

const COLLECTIONS_PROJET = [
  { id: 'projets',            label: 'Projets'            },
  { id: 'projet_taches',      label: 'Tâches'             },
  { id: 'projet_depenses',    label: 'Dépenses'           },
  { id: 'projet_besoins',     label: 'Besoins'            },
  { id: 'projet_materiels',  label: 'Matériel & Matériaux' },
  { id: 'projet_documents',   label: 'Documents'          },
  { id: 'projet_prestataires_masques', label: 'Prestataires masqués' },
]

async function viderCollection(name) {
  const items = await getAll(name)
  await Promise.all(items.map((item) => removeItem(name, item.id)))
}

function SectionSeuils() {
  const { role } = useAuthStore()
  const peutModifier = !['chef_projet', 'superviseur', 'partenaire'].includes(role)
  const { data: configs } = useCollection('projet_params')
  const [form, setForm]   = useState(SEUILS_DEFAUT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    const cfg = configs.find((c) => c.id === 'seuils')
    if (cfg) setForm({ budget: cfg.budget ?? 100, inactivite: cfg.inactivite ?? 7 })
  }, [configs])

  const handleSave = async () => {
    if (!peutModifier) return
    setSaving(true)
    try {
      await setItem('projet_params', 'seuils', { id: 'seuils', ...form, updatedAt: Date.now() })
      await audit('projet', 'seuils_modifies', `Budget: ${form.budget}%, Inactivité: ${form.inactivite}j`)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  return (
    <Card title={<span className="flex items-center gap-2"><Bell size={15} className="text-amber-500" />Seuils des alertes</span>}>
      <p className="mb-4 text-xs text-gray-500">Définissez à partir de quand les alertes se déclenchent.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/70 p-4 backdrop-blur-sm">
          <p className="text-sm font-semibold text-amber-700">Alerte budget</p>
          <p className="mt-0.5 text-xs text-amber-600">Déclencher l'alerte quand les dépenses atteignent X% du budget</p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number" min={1} max={200} disabled={!peutModifier}
              className="w-24 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-100 disabled:text-gray-500"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: Number(e.target.value) }))}
            />
            <span className="text-sm font-semibold text-amber-600">% du budget</span>
          </div>
          <p className="mt-2 text-[10px] text-amber-500">
            Ex : 80% → alerte avant même de dépasser le budget
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/70 p-4 backdrop-blur-sm">
          <p className="text-sm font-semibold text-indigo-700">Alerte tâche inactive</p>
          <p className="mt-0.5 text-xs text-indigo-600">Déclencher l'alerte si une tâche n'a pas été mise à jour depuis X jours</p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number" min={1} max={365} disabled={!peutModifier}
              className="w-24 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-500"
              value={form.inactivite}
              onChange={(e) => setForm((f) => ({ ...f, inactivite: Number(e.target.value) }))}
            />
            <span className="text-sm font-semibold text-indigo-600">jours</span>
          </div>
          <p className="mt-2 text-[10px] text-indigo-500">
            Ex : 14 jours → alerte si une tâche n'a pas bougé depuis 2 semaines
          </p>
        </div>
      </div>

      {peutModifier ? (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><RotateCcw size={14} className="mr-1.5 animate-spin" />Enregistrement…</> : <><Save size={14} className="mr-1.5" />Enregistrer les seuils</>}
          </Button>
          {saved && <span className="text-xs font-semibold text-green-600">✓ Seuils enregistrés</span>}
        </div>
      ) : (
        <p className="mt-4 text-xs italic text-gray-400">Lecture seule pour votre rôle.</p>
      )}
    </Card>
  )
}

export default function Params() {
  const { role } = useAuthStore()
  const peutReinitialiser = FULL_ACCESS_ROLES.includes(role)
  const [modal, setModal]   = useState(false)
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]     = useState(false)

  const handleReset = async () => {
    if (!peutReinitialiser) return
    if (confirm !== 'REINITIALISER') return
    setLoading(true)
    try {
      await Promise.all(COLLECTIONS_PROJET.map((c) => viderCollection(c.id)))
      await audit('projet', 'reinitialisation', 'Toutes les données projet supprimées')
      setDone(true)
      setModal(false)
      setConfirm('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Types de projets">
        <div className="space-y-2">
          {TYPES_PROJET.map((t) => (
            <div key={t.id} className="flex items-start justify-between rounded-2xl bg-gray-50 px-3 py-2.5 text-sm">
              <div>
                <p className="font-semibold">{t.label}</p>
                <p className="text-xs text-gray-500">{t.description}</p>
              </div>
              <span className="font-mono text-xs text-gray-400">{t.id}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Statuts de projet">
        <div className="flex flex-wrap gap-2 p-2">
          {Object.entries(STATUTS_PROJET).map(([k, v]) => (
            <Badge key={k} tone={v.tone}>{v.label}</Badge>
          ))}
        </div>
      </Card>

      <Card title="Priorités">
        <div className="flex flex-wrap gap-2 p-2">
          {Object.entries(PRIORITES).map(([k, v]) => (
            <Badge key={k} tone={v.tone}>{v.label}</Badge>
          ))}
        </div>
      </Card>

      <Card title="Statuts de tâche">
        <div className="flex flex-wrap gap-2 p-2">
          {Object.entries(STATUTS_TACHE).map(([k, v]) => (
            <Badge key={k} tone={v.tone}>{v.label}</Badge>
          ))}
        </div>
      </Card>

      <SectionSeuils />

      {/* ── Zone danger — réservée à la direction (accès total) ─────────────── */}
      {peutReinitialiser && (
      <Card title={<span className="flex items-center gap-2 text-red-600"><AlertTriangle size={15} />Zone de danger</span>}>
        <div className="rounded-2xl border border-red-200/60 bg-red-50/70 p-4 backdrop-blur-sm">
          <p className="text-sm font-semibold text-red-700">Réinitialiser toutes les données</p>
          <p className="mt-1 text-xs text-red-500">
            Supprime définitivement tous les projets, tâches, dépenses, commentaires et documents du module.
            Cette action est <strong>irréversible</strong>.
          </p>
          <div className="mt-3">
            {done && (
              <p className="mb-2 rounded-lg bg-green-100 px-3 py-2 text-xs font-semibold text-green-700">
                ✓ Toutes les données ont été supprimées.
              </p>
            )}
            <Button
              onClick={() => { setConfirm(''); setDone(false); setModal(true) }}
              className="bg-red-600 hover:bg-red-700 text-white border-red-600"
            >
              <Trash2 size={14} className="mr-1.5" />
              Réinitialiser le module
            </Button>
          </div>
        </div>
      </Card>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Confirmer la réinitialisation">
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={20} />
            <div>
              <p className="text-sm font-bold text-red-700">Action irréversible</p>
              <p className="mt-1 text-xs text-red-600">
                Les données suivantes seront supprimées définitivement :
              </p>
              <ul className="mt-2 space-y-0.5">
                {COLLECTIONS_PROJET.map((c) => (
                  <li key={c.id} className="text-xs text-red-600">• {c.label}</li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Tapez <span className="font-bold font-mono text-red-600">REINITIALISER</span> pour confirmer
            </label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="REINITIALISER"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button
              onClick={handleReset}
              disabled={confirm !== 'REINITIALISER' || loading}
              className="bg-red-600 hover:bg-red-700 text-white border-red-600 disabled:opacity-40"
            >
              {loading
                ? <><RotateCcw size={14} className="mr-1.5 animate-spin" />Suppression…</>
                : <><Trash2 size={14} className="mr-1.5" />Confirmer la réinitialisation</>
              }
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
