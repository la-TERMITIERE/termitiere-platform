// RH : configuration de la paie (Temps & Paie). Taux de cotisation et barème IRPP, en cartes de verre dépoli aux champs arrondis (comme les autres paramètres).
import { useState } from 'react'
import { Settings, Save, Landmark, Percent, Calculator, Layers } from 'lucide-react'
import Button from '../../shared/ui/Button'
import { ParamsGrille, ParamsCarte } from '../../shared/ui/ParamsVerre'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { PAIE_CONFIG_DEFAUT, COMPTA_PAIE, calculerBulletin, COL } from './store/rhStore'
import { PageHeader, Champ } from './rhui'

export default function PaieConfiguration() {
  const { data: config } = useCollection(COL.config)
  const existant = config.find((c) => c.id === 'paie')
  const [form, setForm] = useState(() => ({
    tauxCnssSalarie: (existant?.tauxCnssSalarie ?? PAIE_CONFIG_DEFAUT.tauxCnssSalarie) * 100,
    tauxAmuSalarie: (existant?.tauxAmuSalarie ?? PAIE_CONFIG_DEFAUT.tauxAmuSalarie) * 100,
    tauxCnssEmployeur: (existant?.tauxCnssEmployeur ?? PAIE_CONFIG_DEFAUT.tauxCnssEmployeur) * 100,
    tauxAmuEmployeur: (existant?.tauxAmuEmployeur ?? PAIE_CONFIG_DEFAUT.tauxAmuEmployeur) * 100,
    bareme: (existant?.bareme ?? PAIE_CONFIG_DEFAUT.bareme).map((t) => ({ plafond: t.plafond === Infinity ? '' : t.plafond, taux: t.taux * 100 }))
  }))
  const [demo, setDemo] = useState(150000)

  async function save() {
    const bareme = form.bareme.map((t) => ({ plafond: t.plafond === '' ? Infinity : Number(t.plafond), taux: Number(t.taux) / 100 }))
    await setItem(COL.config, 'paie', {
      tauxCnssSalarie: Number(form.tauxCnssSalarie) / 100,
      tauxAmuSalarie: Number(form.tauxAmuSalarie) / 100,
      tauxCnssEmployeur: Number(form.tauxCnssEmployeur) / 100,
      tauxAmuEmployeur: Number(form.tauxAmuEmployeur) / 100,
      bareme, devise: 'XOF'
    })
    toast.success('Configuration enregistrée ✓')
  }

  const configLive = {
    tauxCnssSalarie: Number(form.tauxCnssSalarie) / 100,
    tauxAmuSalarie: Number(form.tauxAmuSalarie) / 100,
    tauxCnssEmployeur: Number(form.tauxCnssEmployeur) / 100,
    tauxAmuEmployeur: Number(form.tauxAmuEmployeur) / 100,
    bareme: form.bareme.map((t) => ({ plafond: t.plafond === '' ? Infinity : Number(t.plafond), taux: Number(t.taux) / 100 }))
  }
  const calc = calculerBulletin(demo, 0, configLive)

  const setTranche = (i, key, val) => setForm((f) => ({ ...f, bareme: f.bareme.map((t, j) => j === i ? { ...t, [key]: val } : t) }))

  return (
    <div className="space-y-5">
      <PageHeader icon={Settings} sousModule="Paramètres" titre="Configuration de la paie" sousTitre="Taux de cotisation et barème d'imposition appliqués au calcul des bulletins." />

      <ParamsGrille>
        {/* Catégorie 1 : ce qui est retiré du salaire de l'employé */}
        <ParamsCarte icone={Percent} couleur="#dc2626" titre="Retenues sur le salaire de l'employé" sous="Retirées du brut avant le versement du net">
          <div className="grid grid-cols-2 gap-3">
            <Champ iconeLabel icone={Percent} label="CNSS salarié (%)"><input type="number" step="0.1" placeholder="Ex. 4" value={form.tauxCnssSalarie} onChange={(e) => setForm({ ...form, tauxCnssSalarie: e.target.value })} className="input-base" /></Champ>
            <Champ iconeLabel icone={Percent} label="AMU salarié (%)"><input type="number" step="0.1" placeholder="Ex. 5" value={form.tauxAmuSalarie} onChange={(e) => setForm({ ...form, tauxAmuSalarie: e.target.value })} className="input-base" /></Champ>
            <Champ iconeLabel icone={Layers} label="Total cotisations salarié (%)"><div className="flex min-h-[2.6rem] items-center rounded-[1.1rem] border border-white/80 bg-white/60 px-4 text-sm font-extrabold text-gray-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)] backdrop-blur-md">{(Number(form.tauxCnssSalarie) || 0) + (Number(form.tauxAmuSalarie) || 0)} %</div></Champ>
          </div>
          <p className="mt-3 text-xs text-gray-500">Cotisations sociales de l'employé : 4 % de CNSS (retraite et pensions) et 5 % d'AMU (assurance maladie), soit 9 %. S'y ajoutent l'IRPP (barème ci-dessous), les avances et prêts et les absences ou retards non justifiés.</p>
        </ParamsCarte>

        {/* Catégorie 2 : ce que l'entreprise paie elle-même, en plus du salaire */}
        <ParamsCarte icone={Layers} couleur="#7c3aed" titre="Charges patronales payées par l'entreprise" sous="En plus du salaire : rien n'est retiré à l'employé">
          <div className="grid grid-cols-2 gap-3">
            <Champ iconeLabel icone={Percent} label="CNSS employeur (%)"><input type="number" step="0.1" placeholder="Ex. 17,5" value={form.tauxCnssEmployeur} onChange={(e) => setForm({ ...form, tauxCnssEmployeur: e.target.value })} className="input-base" /></Champ>
            <Champ iconeLabel icone={Percent} label="AMU employeur (%)"><input type="number" step="0.1" placeholder="Ex. 5" value={form.tauxAmuEmployeur} onChange={(e) => setForm({ ...form, tauxAmuEmployeur: e.target.value })} className="input-base" /></Champ>
            <Champ iconeLabel icone={Layers} label="Total charges patronales (%)"><div className="flex min-h-[2.6rem] items-center rounded-[1.1rem] border border-white/80 bg-white/60 px-4 text-sm font-extrabold text-gray-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)] backdrop-blur-md">{(Number(form.tauxCnssEmployeur) || 0) + (Number(form.tauxAmuEmployeur) || 0)} %</div></Champ>
          </div>
          <p className="mt-3 text-xs text-gray-500">Togo : 22,5 % au total, soit 17,5 % pour la CNSS (12,5 % pensions de retraite, 3 % prestations familiales, 2 % accidents du travail et maladies professionnelles) et 5 % pour la participation de l'entreprise à l'AMU.</p>
        </ParamsCarte>

        <ParamsCarte icone={Calculator} couleur="#7c3aed" titre="Simulateur de bulletin" sous="Essayez un salaire pour voir le net">
          <Champ iconeLabel icone={Calculator} label="Salaire brut (XOF)"><input type="number" placeholder="Ex. 150000" value={demo} onChange={(e) => setDemo(Number(e.target.value))} className="input-base" /></Champ>
          <div className="mt-3 space-y-1.5 rounded-2xl border border-white/80 bg-white/60 p-3 text-sm backdrop-blur-md">
            <Ligne label="Brut" value={calc.brutTotal} />
            <Ligne label="− CNSS salarié" value={-calc.cnssSalarie} />
            <Ligne label="− AMU salarié" value={-calc.amuSalarie} />
            <Ligne label="− IRPP" value={-calc.its} />
            <div className="border-t border-white/80 pt-1.5"><Ligne label="Net à payer" value={calc.net} bold /></div>
            <Ligne label="Charges patronales (CNSS + AMU)" value={calc.cnssEmployeur + calc.amuEmployeur} muted />
            <Ligne label="Coût employeur" value={calc.coutEmployeur} muted />
          </div>
        </ParamsCarte>

        <ParamsCarte icone={Landmark} couleur="#f59e0b" titre="Barème IRPP (tranches mensuelles)" sous="Impôt sur le revenu des personnes physiques" large>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_7rem] gap-3 px-1 text-[11px] font-extrabold uppercase tracking-wide text-gray-500 sm:grid-cols-[1fr_9rem]"><span>Plafond de tranche (XOF)</span><span>Taux IRPP (%)</span></div>
            {form.bareme.map((t, i) => (
              <div key={i} className="ed-entree grid grid-cols-[1fr_7rem] items-center gap-3 sm:grid-cols-[1fr_9rem]" style={{ animationDelay: `${i * 40}ms` }}>
                <input value={t.plafond} placeholder="Ex. 150000 (vide pour la dernière tranche)" onChange={(e) => setTranche(i, 'plafond', e.target.value)} className="input-base" aria-label={`Plafond de la tranche ${i + 1}`} />
                <input type="number" step="0.1" min="0" max="35" placeholder="0 à 35" value={t.taux} onChange={(e) => setTranche(i, 'taux', e.target.value)} className="input-base" aria-label={`Taux de la tranche ${i + 1}`} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">L'IRPP (impôt sur le revenu des personnes physiques, ex-ITS) est retenu uniquement sur le salaire de l'employé : l'entreprise n'en supporte aucune part (0 % à sa charge) et le reverse à l'État. Le barème est progressif, de 0 % à 35 % : chaque taux s'applique à la fraction du salaire imposable comprise dans sa tranche.</p>
        </ParamsCarte>

        <ParamsCarte icone={Landmark} couleur="#0d9488" titre="Comptabilisation" sous="Journal de paie" large>
          <p className="text-sm text-gray-600">Journal <strong>{COMPTA_PAIE.journal}</strong> · charge <strong>{COMPTA_PAIE.compteCharge}</strong> · personnel dû <strong>{COMPTA_PAIE.comptePersonnel}</strong> · CNSS <strong>{COMPTA_PAIE.compteCnss}</strong>.</p>
          <div className="mt-3 flex justify-end"><Button style={{ background: '#0284c7' }} onClick={save}><Save size={16} /> Enregistrer la configuration</Button></div>
        </ParamsCarte>
      </ParamsGrille>
    </div>
  )
}

function Ligne({ label, value, bold, muted }) {
  return <div className={`flex items-center justify-between ${bold ? 'font-extrabold text-gray-800' : ''} ${muted ? 'text-gray-400' : ''}`}><span className={muted || bold ? '' : 'text-gray-500'}>{label}</span><span className="tabular-nums">{formatMoney(value)}</span></div>
}
