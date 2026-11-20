// RH : Paramètres des congés. Droit annuel de congé (jours par an et par employé) : les soldes de la page Congés et du tableau de bord s'en servent.
// Enregistré dans rh_config (document « conges »).
import { useEffect, useState } from 'react'
import { CalendarDays, Save, Hash } from 'lucide-react'
import Button from '../../shared/ui/Button'
import { ParamsGrille, ParamsCarte } from '../../shared/ui/ParamsVerre'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { COL, DROIT_CONGE_ANNUEL } from './store/rhStore'
import { PageHeader, Champ } from './rhui'

export default function CongesConfiguration() {
  const { data: config } = useCollection(COL.config)
  const existant = config.find((c) => c.id === 'conges')
  const [droit, setDroit] = useState(String(DROIT_CONGE_ANNUEL))
  const [charge, setCharge] = useState(false)
  // Reprend la valeur enregistrée dès qu'elle est lue (une seule fois).
  useEffect(() => {
    if (charge || !existant) return
    if (existant.droitAnnuel) setDroit(String(existant.droitAnnuel))
    setCharge(true)
  }, [existant, charge])

  const n = parseInt(droit)
  const invalide = !(n > 0) || n > 366
  async function enregistrer() {
    if (invalide) return toast.error('Indiquez un nombre de jours entre 1 et 366')
    await setItem(COL.config, 'conges', { droitAnnuel: n })
    toast.success('Droit annuel enregistré ✓')
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarDays} sousModule="Paramètres" titre="Congés" sousTitre="Droit annuel de congé de chaque employé." />
      <ParamsGrille>
        <ParamsCarte icone={CalendarDays} couleur="#0284c7" titre="Droit annuel" sous="Jours de congé par an et par employé" large>
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <Champ label="Jours de congé par an" icone={Hash} aide="Le solde de chaque employé se calcule sur ce nombre : jours pris sur l'année, jours restants." erreur={invalide ? 'Entre 1 et 366 jours.' : undefined}>
              <input type="number" min="1" max="366" value={droit} onChange={(e) => setDroit(e.target.value)} className="input-base" placeholder={`Ex. ${DROIT_CONGE_ANNUEL}`} />
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
