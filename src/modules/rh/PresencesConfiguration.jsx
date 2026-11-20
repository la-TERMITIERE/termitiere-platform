// RH : Paramètres des présences. Heures d'arrivée et de départ des employés et des directeurs (la direction arrive à une autre heure),
// et tolérance de retard : le pointage et le bouton « Absent » s'en servent. Enregistrées dans rh_config (document « presences »).
import { useEffect, useState } from 'react'
import { Clock3, Save, LogIn, LogOut, Timer, UserRound, Crown } from 'lucide-react'
import Button from '../../shared/ui/Button'
import { ParamsGrille, ParamsCarte } from '../../shared/ui/ParamsVerre'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { COL } from './store/rhStore'
import { PageHeader, Champ } from './rhui'
import { HORAIRES_DEFAUT } from './horaires'

export default function PresencesConfiguration() {
  const { data: config } = useCollection(COL.config)
  const existant = config.find((c) => c.id === 'presences')
  const [form, setForm] = useState({ ...HORAIRES_DEFAUT })
  const [charge, setCharge] = useState(false)
  // Reprend les valeurs enregistrées dès qu'elles sont lues (une seule fois : on ne réécrit pas ce que l'utilisateur est en train de saisir).
  useEffect(() => {
    if (charge || !existant) return
    setForm({
      heureArrivee: existant.heureArrivee || HORAIRES_DEFAUT.heureArrivee,
      heureDepart: existant.heureDepart || HORAIRES_DEFAUT.heureDepart,
      heureArriveeDirection: existant.heureArriveeDirection || '',
      heureDepartDirection: existant.heureDepartDirection || '',
      tolerance: existant.tolerance ?? HORAIRES_DEFAUT.tolerance
    })
    setCharge(true)
  }, [existant, charge])

  const maj = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const departEmployeInvalide = form.heureDepart <= form.heureArrivee
  const arriveeDir = form.heureArriveeDirection || form.heureArrivee
  const departDir = form.heureDepartDirection || form.heureDepart
  const departDirectionInvalide = departDir <= arriveeDir

  async function enregistrer() {
    if (departEmployeInvalide) return toast.error("Employés : l'heure de départ doit être après l'heure d'arrivée")
    if (departDirectionInvalide) return toast.error("Directeurs : l'heure de départ doit être après l'heure d'arrivée")
    await setItem(COL.config, 'presences', {
      heureArrivee: form.heureArrivee, heureDepart: form.heureDepart,
      heureArriveeDirection: form.heureArriveeDirection || '', heureDepartDirection: form.heureDepartDirection || '',
      tolerance: Math.max(0, parseInt(form.tolerance) || 0)
    })
    toast.success('Horaires enregistrés ✓')
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Clock3} sousModule="Paramètres" titre="Horaires de présence" sousTitre="Heures d'arrivée et de départ des employés et des directeurs, et tolérance avant un retard." />

      <ParamsGrille>
        <ParamsCarte icone={UserRound} couleur="#16a34a" titre="Employés" sous="Horaires de l'équipe">
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Heure d'arrivée" icone={LogIn} aide="Passé cette heure, un pointage est un retard et le bouton Absent apparaît.">
              <input type="time" value={form.heureArrivee} onChange={maj('heureArrivee')} className="input-base" />
            </Champ>
            <Champ label="Heure de départ" icone={LogOut} aide="Fin de journée." erreur={departEmployeInvalide ? "Doit être après l'heure d'arrivée." : undefined}>
              <input type="time" value={form.heureDepart} onChange={maj('heureDepart')} className="input-base" />
            </Champ>
          </div>
        </ParamsCarte>

        <ParamsCarte icone={Crown} couleur="#7c3aed" titre="Directeurs" sous="Horaires de la direction">
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Heure d'arrivée" icone={LogIn} aide="Laissez vide pour reprendre l'heure des employés.">
              <input type="time" value={form.heureArriveeDirection} onChange={maj('heureArriveeDirection')} className="input-base" placeholder={form.heureArrivee} />
            </Champ>
            <Champ label="Heure de départ" icone={LogOut} aide="Laissez vide pour reprendre l'heure des employés." erreur={departDirectionInvalide ? "Doit être après l'heure d'arrivée." : undefined}>
              <input type="time" value={form.heureDepartDirection} onChange={maj('heureDepartDirection')} className="input-base" placeholder={form.heureDepart} />
            </Champ>
          </div>
        </ParamsCarte>

        <ParamsCarte icone={Timer} couleur="#0284c7" titre="Tolérance" sous="Valable pour tout le monde" large>
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <Champ label="Tolérance (minutes)" icone={Timer} aide="Minutes accordées après l'heure d'arrivée avant de compter un retard.">
              <input type="number" min="0" max="120" value={form.tolerance} onChange={maj('tolerance')} className="input-base" placeholder="Ex. 10" />
            </Champ>
            <div className="flex justify-end pb-3">
              <Button onClick={enregistrer} style={{ backgroundColor: '#0284c7' }}><Save size={16} /> Enregistrer</Button>
            </div>
          </div>
        </ParamsCarte>
      </ParamsGrille>
    </div>
  )
}
