// RH — Configuration de la paie (Temps & Paie). Taux CNSS & barème IRPP.
import { useState } from 'react'
import { Settings, Save, Landmark } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { PAIE_CONFIG_DEFAUT, COMPTA_PAIE, calculerBulletin, COL } from './store/rhStore'
import { PageHeader } from './rhui'

export default function PaieConfiguration() {
  const { data: config } = useCollection(COL.config)
  const existant = config.find((c) => c.id === 'paie')
  const [form, setForm] = useState(() => ({
    tauxCnssSalarie: (existant?.tauxCnssSalarie ?? PAIE_CONFIG_DEFAUT.tauxCnssSalarie) * 100,
    tauxCnssEmployeur: (existant?.tauxCnssEmployeur ?? PAIE_CONFIG_DEFAUT.tauxCnssEmployeur) * 100,
    tauxAmuEmployeur: (existant?.tauxAmuEmployeur ?? PAIE_CONFIG_DEFAUT.tauxAmuEmployeur) * 100,
    bareme: (existant?.bareme ?? PAIE_CONFIG_DEFAUT.bareme).map((t) => ({ plafond: t.plafond === Infinity ? '' : t.plafond, taux: t.taux * 100 }))
  }))
  const [demo, setDemo] = useState(150000)

  async function save() {
    const bareme = form.bareme.map((t) => ({ plafond: t.plafond === '' ? Infinity : Number(t.plafond), taux: Number(t.taux) / 100 }))
    await setItem(COL.config, 'paie', {
      tauxCnssSalarie: Number(form.tauxCnssSalarie) / 100,
      tauxCnssEmployeur: Number(form.tauxCnssEmployeur) / 100,
      tauxAmuEmployeur: Number(form.tauxAmuEmployeur) / 100,
      bareme, devise: 'XOF'
    })
    toast.success('Configuration enregistrée ✓')
  }

  const configLive = {
    tauxCnssSalarie: Number(form.tauxCnssSalarie) / 100,
    tauxCnssEmployeur: Number(form.tauxCnssEmployeur) / 100,
    tauxAmuEmployeur: Number(form.tauxAmuEmployeur) / 100,
    bareme: form.bareme.map((t) => ({ plafond: t.plafond === '' ? Infinity : Number(t.plafond), taux: Number(t.taux) / 100 }))
  }
  const calc = calculerBulletin(demo, 0, configLive)

  const setTranche = (i, key, val) => setForm((f) => ({ ...f, bareme: f.bareme.map((t, j) => j === i ? { ...t, [key]: val } : t) }))

  return (
    <div className="space-y-5">
      <PageHeader icon={Settings} sousModule="Temps & Paie" titre="Configuration de la paie" sousTitre="Taux de cotisation et barème d'imposition appliqués au calcul des bulletins." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cotisations et charges patronales">
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Taux salarié (%)"><input type="number" step="0.1" placeholder="Ex. 4" value={form.tauxCnssSalarie} onChange={(e) => setForm({ ...form, tauxCnssSalarie: e.target.value })} className="input-base" /></Champ>
            <Champ label="CNSS employeur (%)"><input type="number" step="0.1" placeholder="Ex. 17,5" value={form.tauxCnssEmployeur} onChange={(e) => setForm({ ...form, tauxCnssEmployeur: e.target.value })} className="input-base" /></Champ>
            <Champ label="AMU employeur (%)"><input type="number" step="0.1" placeholder="Ex. 5" value={form.tauxAmuEmployeur} onChange={(e) => setForm({ ...form, tauxAmuEmployeur: e.target.value })} className="input-base" /></Champ>
            <Champ label="Charges patronales (%)"><div className="input-base flex items-center font-bold text-gray-700 dark:text-gray-100">{(Number(form.tauxCnssEmployeur) || 0) + (Number(form.tauxAmuEmployeur) || 0)} %</div></Champ>
          </div>
          <p className="mt-2 text-xs text-gray-400">Les charges patronales sont payées par l'employeur en plus du salaire, sans rien retirer à l'employé. Togo : 22,5 % au total, soit 17,5 % pour la CNSS classique (pensions, prestations familiales et risques professionnels) et 5 % pour l'Assurance Maladie Universelle (AMU). Le salarié cotise à part : 4 % de CNSS.</p>
        </Card>

        <Card title="Simulateur de bulletin">
          <Champ label="Salaire brut (XOF)"><input type="number" placeholder="Ex. 150000" value={demo} onChange={(e) => setDemo(Number(e.target.value))} className="input-base" /></Champ>
          <div className="mt-3 space-y-1 text-sm">
            <Ligne label="Brut" value={calc.brutTotal} />
            <Ligne label="− CNSS salarié" value={-calc.cnssSalarie} />
            <Ligne label="− IRPP" value={-calc.its} />
            <div className="border-t border-gray-100 pt-1 dark:border-white/10"><Ligne label="Net à payer" value={calc.net} bold /></div>
            <Ligne label="Charges patronales (CNSS + AMU)" value={calc.cnssEmployeur + calc.amuEmployeur} muted />
            <Ligne label="Coût employeur" value={calc.coutEmployeur} muted />
          </div>
        </Card>
      </div>

      <Card title="Barème IRPP (tranches mensuelles)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-2">Plafond de tranche (XOF)</th><th className="py-2">Taux IRPP (%)</th></tr></thead>
            <tbody>
              {form.bareme.map((t, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3"><input value={t.plafond} placeholder="Ex. 150000 (vide pour la dernière tranche)" onChange={(e) => setTranche(i, 'plafond', e.target.value)} className="input-base" /></td>
                  <td className="py-1.5"><input type="number" step="0.1" min="0" max="35" placeholder="Ex. 10 (de 0 à 35)" value={t.taux} onChange={(e) => setTranche(i, 'taux', e.target.value)} className="input-base !w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">L'IRPP (impôt sur le revenu des personnes physiques, ex-ITS) est retenu uniquement sur le salaire de l'employé : l'entreprise n'en supporte aucune part (0 % à sa charge) et le reverse à l'État. Le barème est progressif, de 0 % à 35 % : chaque taux s'applique à la fraction du salaire imposable comprise dans sa tranche.</p>
      </Card>

      <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
        <Landmark size={16} className="mt-0.5 shrink-0" />
        <span>Comptabilisation : journal <strong>{COMPTA_PAIE.journal}</strong> · charge <strong>{COMPTA_PAIE.compteCharge}</strong> · personnel dû <strong>{COMPTA_PAIE.comptePersonnel}</strong> · CNSS <strong>{COMPTA_PAIE.compteCnss}</strong>.</span>
      </div>

      <div className="flex justify-end"><Button style={{ background: '#0284c7' }} onClick={save}><Save size={16} /> Enregistrer la configuration</Button></div>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
function Ligne({ label, value, bold, muted }) {
  return <div className={`flex items-center justify-between ${bold ? 'font-bold' : ''} ${muted ? 'text-gray-400' : ''}`}><span className={muted ? '' : 'text-gray-500'}>{label}</span><span>{formatMoney(value)}</span></div>
}
