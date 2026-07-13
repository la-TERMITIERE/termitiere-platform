// Allocation du budget mensuel par secteur.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Save } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole } from '../../core/roles'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { SECTEURS, MOIS_LABELS } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, statutBudget } from './logic'

const now = new Date()

export default function Budgets() {
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: depenses } = useCollection('depense_depenses')
  const lectureSeule = isReadOnlyRole(useAuth((s) => s.role))

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)
  const [valeurs, setValeurs] = useState({})
  const [saving, setSaving] = useState(false)

  // Réinitialise la saisie locale quand on change de mois/année ou que les
  // budgets Firebase se chargent.
  useEffect(() => {
    const init = {}
    SECTEURS.forEach((s) => { init[s.id] = budgetSecteur(budgets, s.id, annee, mois) || '' })
    setValeurs(init)
  }, [budgets, annee, mois])

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  const totalAlloue = useMemo(
    () => Object.values(valeurs).reduce((s, v) => s + (Number(v) || 0), 0),
    [valeurs]
  )

  async function enregistrer() {
    setSaving(true)
    try {
      for (const s of SECTEURS) {
        const montant = Number(valeurs[s.id]) || 0
        const id = `${s.id}_${annee}-${String(mois).padStart(2, '0')}`
        await setItem('depense_budgets', id, {
          id, secteurId: s.id, annee, mois, montant, updatedAt: Date.now()
        })
      }
      await audit('depense', 'BUDGET_SET', `Budgets ${MOIS_LABELS[mois - 1]} ${annee}`, { annee, mois, total: totalAlloue })
      toast.success('Budgets enregistrés ✓')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => changerMois(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <span className="text-lg font-extrabold text-gray-800">{MOIS_LABELS[mois - 1]} {annee}</span>
        <button onClick={() => changerMois(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">Total alloué : <strong className="text-gray-900">{totalAlloue.toLocaleString('fr-FR')} FCFA</strong></span>
          {!lectureSeule && <Button onClick={enregistrer} loading={saving}><Save size={16} /> Enregistrer</Button>}
        </div>
      </div>

      <Card title={`Allocation par secteur — ${MOIS_LABELS[mois - 1]} ${annee}`}>
        <div className="space-y-2">
          {SECTEURS.map((s) => {
            const depSecteur = depensesSecteurMois(depenses, s.id, annee, mois)
            const depense = totalDepenses(depSecteur)
            const alloue = Number(valeurs[s.id]) || 0
            const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
            const statut = statutBudget(pct)
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200/60 bg-white/50 px-3 py-2.5 shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="min-w-[160px] font-semibold text-gray-800">{s.label}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={valeurs[s.id] ?? ''}
                    onChange={(e) => setValeurs((v) => ({ ...v, [s.id]: e.target.value }))}
                    placeholder="0"
                    className="w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-xs text-gray-400">FCFA</span>
                </div>
                <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
                  <span>Dépensé : <strong className="text-gray-800">{depense.toLocaleString('fr-FR')} FCFA</strong></span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${
                    statut.key === 'depasse' ? 'bg-red-100 text-red-700' :
                    statut.key === 'attention' ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {pct}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
