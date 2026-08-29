// RH — Paie & Bulletins (Temps & Paie). Génère les bulletins mensuels (CNSS/ITS Togo).
import { useMemo, useState } from 'react'
import { Receipt, Zap, Trash2, Landmark, CheckCircle2, BadgeCheck, FileDown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { genererRapportPDF } from '../../utils/exportPDF'
import { formatMoney, todayStr } from '../../utils/formatters'
import { calculerBulletin, STATUTS_BULLETIN, PAIE_CONFIG_DEFAUT, COMPTA_PAIE, MOIS_LABELS, COL } from './store/rhStore'

export default function Paie() {
  const { data: employes } = useCollection(COL.employes)
  const { data: bulletins } = useCollection(COL.bulletins)
  const { data: config } = useCollection(COL.config)
  const paieConfig = config.find((c) => c.id === 'paie') || PAIE_CONFIG_DEFAUT

  const [mois, setMois] = useState(todayStr().slice(0, 7))
  const actifs = useMemo(() => employes.filter((e) => (e.statut || 'actif') === 'actif'), [employes])
  const bulletinsMois = useMemo(() => bulletins.filter((b) => b.mois === mois), [bulletins, mois])

  const totaux = useMemo(() => bulletinsMois.reduce((s, b) => ({
    brut: s.brut + (Number(b.brutTotal) || 0), net: s.net + (Number(b.net) || 0),
    cnss: s.cnss + (Number(b.cnssSalarie) || 0) + (Number(b.cnssEmployeur) || 0), its: s.its + (Number(b.its) || 0)
  }), { brut: 0, net: 0, cnss: 0, its: 0 }), [bulletinsMois])

  async function genererPaie() {
    if (actifs.length === 0) return toast.error('Aucun employé actif.')
    // Ne pas écraser un bulletin déjà validé/payé du même mois.
    const verrouilles = new Set(bulletinsMois.filter((b) => b.statut !== 'brouillon').map((b) => b.employeId))
    let n = 0, saut = 0
    for (const e of actifs) {
      if (verrouilles.has(e.id)) { saut++; continue }
      const calc = calculerBulletin(e.salaire, e.primes || 0, paieConfig)
      await setItem(COL.bulletins, `${mois}_${e.id}`, {
        mois, employeId: e.id, employeNom: e.nom, poste: e.poste || '', departement: e.departement || '',
        salaireBase: Number(e.salaire) || 0, primes: Number(e.primes) || 0, statut: 'brouillon', ...calc
      })
      n++
    }
    toast.success(`${n} bulletin(s) en brouillon pour ${moisLabel(mois)}${saut ? ` · ${saut} déjà validé(s) conservé(s)` : ''}`)
  }
  async function valider(b) { await updateItem(COL.bulletins, b.id, { statut: 'valide' }); toast.success('Bulletin validé — comptabilisé ✓') }
  async function marquerPaye(b) { await updateItem(COL.bulletins, b.id, { statut: 'paye' }); toast.success('Marqué payé') }
  async function validerMois() {
    const brouillons = bulletinsMois.filter((b) => b.statut === 'brouillon')
    if (brouillons.length === 0) return toast.error('Aucun brouillon à valider.')
    if (!confirm(`Valider ${brouillons.length} bulletin(s) ? Ils seront comptabilisés (journal PA).`)) return
    for (const b of brouillons) await updateItem(COL.bulletins, b.id, { statut: 'valide' })
    toast.success(`${brouillons.length} bulletin(s) validé(s) et comptabilisé(s) ✓`)
  }
  async function supprimer(b) {
    if (b.statut !== 'brouillon') return toast.error('Un bulletin validé ne peut pas être supprimé.')
    if (confirm(`Supprimer le bulletin de ${b.employeNom} ?`)) await removeItem(COL.bulletins, b.id)
  }
  async function bulletinPDF(b) {
    const f = (v) => `${Math.round(Number(v) || 0).toLocaleString('fr-FR')} FCFA`
    await genererRapportPDF({
      titre: `Bulletin de paie — ${b.employeNom} — ${moisLabel(b.mois)}`,
      colonnes: ['Rubrique', 'Montant'],
      lignes: [
        ['Poste', b.poste || '—'],
        ['Département', b.departement || '—'],
        ['Salaire de base', f(b.salaireBase)],
        ['Primes', f(b.primes)],
        ['Salaire brut', f(b.brutTotal)],
        ['CNSS salarié (retenue)', '- ' + f(b.cnssSalarie)],
        ['ITS (impôt retenu)', '- ' + f(b.its)],
        ['NET À PAYER', f(b.net)],
        ['—', '—'],
        ['CNSS employeur (charge patronale)', f(b.cnssEmployeur)],
        ['Coût total employeur', f(b.coutEmployeur)]
      ],
      fichier: `bulletin-${b.mois}-${(b.employeNom || '').replace(/\s+/g, '_')}.pdf`,
      module: 'default'
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Temps & Paie</div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Receipt className="text-sky-600" /> Paie &amp; Bulletins
          </h1>
          <p className="text-sm text-gray-500">Génération des bulletins mensuels — CNSS et ITS (barème Togo).</p>
        </div>
        <div className="flex items-end gap-2">
          <input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className="input-base !w-auto" />
          <Button variant="outline" onClick={genererPaie}><Zap size={16} /> Générer (brouillon)</Button>
          <Button style={{ background: '#0284c7' }} onClick={validerMois}><BadgeCheck size={16} /> Valider le mois</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Masse salariale (brut)" value={formatMoney(totaux.brut)} accent="#7c3aed" icon={Receipt} />
        <StatCard title="Net à payer" value={formatMoney(totaux.net)} accent="#16a34a" icon={Receipt} />
        <StatCard title="CNSS (sal. + emp.)" value={formatMoney(totaux.cnss)} accent="#0284c7" icon={Receipt} />
        <StatCard title="ITS (impôt)" value={formatMoney(totaux.its)} accent="#f59e0b" icon={Receipt} />
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
        <Landmark size={16} className="mt-0.5 shrink-0" />
        <span>Écriture comptable de paie (journal <strong>{COMPTA_PAIE.journal}</strong>) : débit <strong>{COMPTA_PAIE.compteCharge}</strong> Rémunérations, crédit <strong>{COMPTA_PAIE.comptePersonnel}</strong> Personnel dû et <strong>{COMPTA_PAIE.compteCnss}</strong> CNSS. La passerelle vers la Comptabilité se branche sur les bulletins validés.</span>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <p className="font-bold text-gray-800 dark:text-gray-100">Bulletins de {moisLabel(mois)}</p>
          <p className="text-xs text-gray-500">{bulletinsMois.length} bulletin(s) · {actifs.length} employé(s) actif(s)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Employé</th><th className="px-3 py-2.5">Poste</th>
                <th className="px-3 py-2.5 text-right">Brut</th><th className="px-3 py-2.5 text-right">CNSS</th>
                <th className="px-3 py-2.5 text-right">ITS</th><th className="px-3 py-2.5 text-right">Net à payer</th>
                <th className="px-3 py-2.5">Statut</th><th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {bulletinsMois.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Aucun bulletin. Cliquez « Générer la paie ».</td></tr>}
              {bulletinsMois.map((b) => (
                <tr key={b.id} className="group hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{b.employeNom}</td>
                  <td className="px-3 py-2 text-gray-500">{b.poste || '—'}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(b.brutTotal)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{formatMoney(b.cnssSalarie)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{formatMoney(b.its)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700 dark:text-green-400">{formatMoney(b.net)}</td>
                  <td className="px-3 py-2"><Badge tone={STATUTS_BULLETIN[b.statut]?.tone}>{STATUTS_BULLETIN[b.statut]?.label}</Badge></td>
                  <td className="px-2 py-2"><div className="flex justify-end gap-1">
                    <button onClick={() => bulletinPDF(b)} title="Bulletin PDF" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><FileDown size={15} /></button>
                    {b.statut === 'brouillon' && <button onClick={() => valider(b)} title="Valider (comptabiliser)" className="rounded p-1.5 text-green-600 hover:bg-green-50"><CheckCircle2 size={15} /></button>}
                    {b.statut === 'valide' && <button onClick={() => marquerPaye(b)} title="Marquer payé" className="rounded p-1.5 text-sky-600 hover:bg-sky-50"><BadgeCheck size={15} /></button>}
                    {b.statut === 'brouillon' && <button onClick={() => supprimer(b)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function moisLabel(mois) {
  const [a, m] = (mois || '').split('-')
  return m ? `${MOIS_LABELS[Number(m) - 1]} ${a}` : mois
}
