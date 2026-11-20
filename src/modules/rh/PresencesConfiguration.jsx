// RH : Paramètres des présences. Heures d'arrivée et de départ des employés et des directeurs (la direction arrive à une autre heure),
// et tolérance de retard : le pointage et le bouton « Absent » s'en servent. Enregistrées dans rh_config (document « presences »).
import { useEffect, useState } from 'react'
import { Clock3, Save, LogIn, LogOut, Timer, UserRound, Crown, Wallet, UserX } from 'lucide-react'
import Button from '../../shared/ui/Button'
import { ParamsGrille, ParamsCarte } from '../../shared/ui/ParamsVerre'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { COL } from './store/rhStore'
import { PageHeader, Champ } from './rhui'
import { HORAIRES_DEFAUT, REGLES_DEFAUT, lireRegles } from './horaires'

const SEMAINE = [{ n: 1, label: 'Lun' }, { n: 2, label: 'Mar' }, { n: 3, label: 'Mer' }, { n: 4, label: 'Jeu' }, { n: 5, label: 'Ven' }, { n: 6, label: 'Sam' }, { n: 0, label: 'Dim' }]

export default function PresencesConfiguration() {
  const { data: config } = useCollection(COL.config)
  const existant = config.find((c) => c.id === 'presences')
  const [form, setForm] = useState({ ...HORAIRES_DEFAUT, retenueAbsencePct: REGLES_DEFAUT.pctAbsence, retenueRetardPct: REGLES_DEFAUT.pctRetard, joursTravailles: REGLES_DEFAUT.jours })
  const [charge, setCharge] = useState(false)
  // Reprend les valeurs enregistrées dès qu'elles sont lues (une seule fois : on ne réécrit pas ce que l'utilisateur est en train de saisir).
  useEffect(() => {
    if (charge || !existant) return
    const regles = lireRegles(config)
    setForm({
      heureArrivee: existant.heureArrivee || HORAIRES_DEFAUT.heureArrivee,
      heureDepart: existant.heureDepart || HORAIRES_DEFAUT.heureDepart,
      heureArriveeDirection: existant.heureArriveeDirection || '',
      heureDepartDirection: existant.heureDepartDirection || '',
      tolerance: existant.tolerance ?? HORAIRES_DEFAUT.tolerance,
      retenueAbsencePct: regles.pctAbsence, retenueRetardPct: regles.pctRetard, joursTravailles: regles.jours.join('')
    })
    setCharge(true)
  }, [existant, charge, config])
  const basculerJour = (n) => setForm((f) => {
    const actuels = f.joursTravailles.split('').map(Number)
    const suivants = actuels.includes(n) ? actuels.filter((x) => x !== n) : [...actuels, n]
    return { ...f, joursTravailles: suivants.sort().join('') }
  })

  const maj = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const departEmployeInvalide = form.heureDepart <= form.heureArrivee
  const arriveeDir = form.heureArriveeDirection || form.heureArrivee
  const departDir = form.heureDepartDirection || form.heureDepart
  const departDirectionInvalide = departDir <= arriveeDir

  async function enregistrer() {
    if (departEmployeInvalide) return toast.error("Employés : l'heure de départ doit être après l'heure d'arrivée")
    if (departDirectionInvalide) return toast.error("Directeurs : l'heure de départ doit être après l'heure d'arrivée")
    if (!form.joursTravailles) return toast.error('Choisissez au moins un jour travaillé dans la semaine')
    const pct = (v) => Math.min(100, Math.max(0, Number(v) || 0))
    await setItem(COL.config, 'presences', {
      heureArrivee: form.heureArrivee, heureDepart: form.heureDepart,
      heureArriveeDirection: form.heureArriveeDirection || '', heureDepartDirection: form.heureDepartDirection || '',
      tolerance: Math.max(0, parseInt(form.tolerance) || 0),
      retenueAbsencePct: pct(form.retenueAbsencePct), retenueRetardPct: pct(form.retenueRetardPct), joursTravailles: form.joursTravailles
    })
    toast.success('Paramètres de présence enregistrés ✓')
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Clock3} sousModule="Paramètres" titre="Horaires de présence" sousTitre="Heures d'arrivée et de départ des employés et des directeurs, et tolérance avant un retard." />

      <ParamsGrille>
        <ParamsCarte icone={UserRound} couleur="#16a34a" titre="Employés" sous="Horaires de l'équipe">
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ iconeLabel label="Heure d'arrivée" icone={LogIn} aide="Passé cette heure, un pointage est un retard et le bouton Absent apparaît.">
              <input type="time" value={form.heureArrivee} onChange={maj('heureArrivee')} className="input-base" />
            </Champ>
            <Champ iconeLabel label="Heure de départ" icone={LogOut} aide="Fin de journée." erreur={departEmployeInvalide ? "Doit être après l'heure d'arrivée." : undefined}>
              <input type="time" value={form.heureDepart} onChange={maj('heureDepart')} className="input-base" />
            </Champ>
          </div>
        </ParamsCarte>

        <ParamsCarte icone={Crown} couleur="#7c3aed" titre="Directeurs" sous="Horaires de la direction">
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ iconeLabel label="Heure d'arrivée" icone={LogIn} aide="Laissez vide pour reprendre l'heure des employés.">
              <input type="time" value={form.heureArriveeDirection} onChange={maj('heureArriveeDirection')} className="input-base" placeholder={form.heureArrivee} />
            </Champ>
            <Champ iconeLabel label="Heure de départ" icone={LogOut} aide="Laissez vide pour reprendre l'heure des employés." erreur={departDirectionInvalide ? "Doit être après l'heure d'arrivée." : undefined}>
              <input type="time" value={form.heureDepartDirection} onChange={maj('heureDepartDirection')} className="input-base" placeholder={form.heureDepart} />
            </Champ>
          </div>
        </ParamsCarte>

        <ParamsCarte icone={Timer} couleur="#0284c7" titre="Tolérance" sous="Valable pour tout le monde" large>
          <Champ iconeLabel label="Tolérance (minutes)" icone={Timer} aide="Minutes accordées après l'heure d'arrivée avant de compter un retard.">
            <input type="number" min="0" max="120" value={form.tolerance} onChange={maj('tolerance')} className="input-base sm:max-w-xs" placeholder="Ex. 10" />
          </Champ>
        </ParamsCarte>

        <ParamsCarte icone={Wallet} couleur="#dc2626" titre="Retenues sur salaire" sous="Absences non justifiées et retards" large>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ iconeLabel label="Absence non justifiée (%)" icone={UserX} aide="Part du salaire d'une journée retenue pour chaque absence non justifiée.">
              <input type="number" min="0" max="100" step="5" value={form.retenueAbsencePct} onChange={maj('retenueAbsencePct')} className="input-base" placeholder="Ex. 100" />
            </Champ>
            <Champ iconeLabel label="Retard (%)" icone={Clock3} aide="Part du salaire d'une journée retenue pour chaque retard (après la tolérance).">
              <input type="number" min="0" max="100" step="5" value={form.retenueRetardPct} onChange={maj('retenueRetardPct')} className="input-base" placeholder="Ex. 10" />
            </Champ>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Jours travaillés dans la semaine</p>
            <div className="flex flex-wrap gap-1.5">
              {SEMAINE.map((j) => {
                const actif = form.joursTravailles.includes(String(j.n))
                return (
                  <button key={j.n} type="button" onClick={() => basculerJour(j.n)} aria-pressed={actif}
                    className={`min-w-[3rem] rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${actif ? 'border-red-300 bg-red-50 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]' : 'border-white/80 bg-white/70 text-gray-500 hover:bg-white'}`}>{j.label}</button>
                )
              })}
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">Le salaire d'une journée est le salaire du mois divisé par le nombre de jours travaillés du mois. Seules les absences marquées « non justifiées » et les retards retiennent de l'argent, une absence justifiée ou un congé ne retiennent rien. La retenue s'applique au bulletin à sa génération.</p>
          <div className="mt-3 flex justify-end">
            <Button onClick={enregistrer} style={{ backgroundColor: '#0284c7' }}><Save size={16} /> Enregistrer</Button>
          </div>
        </ParamsCarte>
      </ParamsGrille>
    </div>
  )
}
