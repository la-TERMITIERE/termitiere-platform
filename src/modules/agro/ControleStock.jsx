// Contrôle du stock MAXI-AGRO (Paramètres, administration) : liste les sorties approuvées qui n'ont pas fait baisser le stock
// et les corrige en un clic. Rien n'est écrit tant que l'administrateur ne clique pas sur « Corriger ».
import { useState } from 'react'
import { ShieldCheck, Search, Wrench } from 'lucide-react'
import { ParamsGrille, ParamsCarte, CHAMP_VERRE } from '../../shared/ui/ParamsVerre'
import Button from '../../shared/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
import { getAll } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { analyserStockAgro, reparerStockAgro } from './reconciliation'

const COULEUR = '#2EAA3F'
const LIBELLES = {
  sans_demande: 'Sortie jamais décomptée', jour_absent: 'Jour sans saisie', noeud_absent: 'Article absent de la saisie',
  ecart_sortie: 'Sortie mal comptée', fin_incoherent: 'EF Final incohérent', continuite: 'Jours à réaligner'
}

export default function ControleStock() {
  const { user, role } = useAuth()
  const [depuis, setDepuis] = useState('')
  const [rapport, setRapport] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!isFullAccessRole(role)) return null

  async function verifier() {
    setBusy(true)
    try {
      const [factures, demandes, inventaires] = await Promise.all([getAll('agro_factures'), getAll('agro_demandes'), getAll('agro_inventaires')])
      setRapport(analyserStockAgro({ factures, demandes, inventaires, depuis }))
    } catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }

  async function corriger() {
    if (!confirm('Corriger le stock : les sorties approuvées non décomptées seront retirées du stock et les jours suivants réalignés. Continuer ?')) return
    setBusy(true)
    try {
      const r = await reparerStockAgro({ user, depuis })
      await audit('agro', 'CONTROLE_STOCK', `${r.corriges} correction(s)${r.echecs.length ? `, ${r.echecs.length} échec(s)` : ''}${depuis ? ` depuis le ${depuis}` : ''}`)
      if (r.echecs.length) toast.error(`Non corrigé : ${r.echecs.join(' ; ')}`)
      else toast.success(`Stock corrigé ✓ (${r.corriges} correction(s))`)
      await verifier()
    } catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }

  const n = rapport?.anomalies.length || 0
  return (
    <ParamsGrille>
      <ParamsCarte icone={ShieldCheck} couleur={COULEUR} titre="Contrôle du stock" sous="Vérifie que chaque sortie approuvée a fait baisser le stock" large>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-gray-600">Depuis le (vide = tout l'historique)
            <input type="date" className={`${CHAMP_VERRE} mt-1 block`} value={depuis} onChange={(e) => setDepuis(e.target.value)} />
          </label>
          <Button onClick={verifier} loading={busy}><Search size={15} /> Vérifier</Button>
          {rapport && n > 0 && <Button variant="success" onClick={corriger} loading={busy}><Wrench size={15} /> Corriger le stock</Button>}
        </div>
        {rapport && (
          <div className="mt-4 space-y-2">
            <p className={`text-sm font-bold ${n ? 'text-amber-700' : 'text-green-700'}`}>
              {n ? `${n} anomalie(s) sur ${rapport.nbSorties} sortie(s) certifiée(s)` : `Tout est cohérent : ${rapport.nbSorties} sortie(s) certifiée(s) vérifiée(s).`}
            </p>
            {rapport.anomalies.map((a, i) => (
              <div key={i} className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-sm">
                <span className="mr-2 rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-bold text-amber-900">{LIBELLES[a.type] || a.type}</span>
                {a.detail}
              </div>
            ))}
          </div>
        )}
      </ParamsCarte>
    </ParamsGrille>
  )
}
ControleStock.accepteRang = false
