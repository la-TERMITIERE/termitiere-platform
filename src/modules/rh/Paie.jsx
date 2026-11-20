// RH — Paie & Bulletins (Temps & Paie). Génère les bulletins mensuels (CNSS/IRPP Togo).
import { useMemo, useState } from 'react'
import { Receipt, Zap, Trash2, Landmark, CheckCircle2, BadgeCheck, HeartPulse } from 'lucide-react'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, todayStr } from '../../utils/formatters'
import { calculerBulletin, STATUTS_BULLETIN, PAIE_CONFIG_DEFAUT, COMPTA_PAIE, MOIS_LABELS, COL } from './store/rhStore'
import { PageHeader } from './rhui'
import DetailKpiModal from './DetailKpiModal'
import { retenueDuMois, appliquerRetenues } from './avancesCircuit'
import DetailFiche from './DetailFiche'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'

export default function Paie() {
  const { data: employes } = useCollection(COL.employes)
  const { data: bulletins } = useCollection(COL.bulletins)
  const { data: config } = useCollection(COL.config)
  const { data: avances } = useCollection(COL.avances)
  const paieConfig = config.find((c) => c.id === 'paie') || PAIE_CONFIG_DEFAUT

  const [recherche, setRecherche] = useState('')
  // Période : jour, mois ou plage. Un bulletin est mensuel : le jour choisi désigne le bulletin de son mois, une plage désigne tous les mois qu'elle touche.
  const [mode, setMode] = useState('mois')
  const [jour, setJour] = useState(todayStr())
  const [mois, setMois] = useState(todayStr().slice(0, 7))
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [bulletinId, setBulletinId] = useState(null)
  const [detailOuvert, setDetailOuvert] = useState(null) // 'brut' | 'net' | 'cnss' | 'amuirpp'
  const actifs = useMemo(() => employes.filter((e) => (e.statut || 'actif') === 'actif'), [employes])
  const moisCibles = useMemo(() => moisDeLaPeriode(mode, { jour, mois, debut, fin }), [mode, jour, mois, debut, fin])
  const libellePeriode = moisCibles.length === 1 ? moisLabel(moisCibles[0]) : `${moisLabel(moisCibles[0])} à ${moisLabel(moisCibles[moisCibles.length - 1])}`
  const bulletinsMois = useMemo(() => bulletins.filter((b) => moisCibles.includes(b.mois)), [bulletins, moisCibles])

  const totaux = useMemo(() => bulletinsMois.reduce((s, b) => ({
    brut: s.brut + (Number(b.brutTotal) || 0), net: s.net + (Number(b.net) || 0),
    cnss: s.cnss + (Number(b.cnssSalarie) || 0) + (Number(b.cnssEmployeur) || 0), amu: s.amu + (Number(b.amuEmployeur) || 0), its: s.its + (Number(b.its) || 0)
  }), { brut: 0, net: 0, cnss: 0, amu: 0, its: 0 }), [bulletinsMois])

  // Détail de chaque KPI (au clic) : les totaux en tuiles, puis la part de chaque employé.
  const somme = (cle) => bulletinsMois.reduce((t, b) => t + (Number(b[cle]) || 0), 0)
  const m = (v) => formatMoney(Number(v) || 0)
  const ligne = (b, sous, detail) => ({ id: b.id, libelle: b.employeNom, sous, detail })
  const vide = 'Aucun bulletin sur cette période. Cliquez « Générer (brouillon) ».'
  const fichesDetail = {
    brut: {
      titre: 'Masse salariale (brut)', sous: `Bulletins de ${libellePeriode} : salaires de base et primes, avant toute retenue.`, icone: Receipt, couleur: '#7c3aed', vide,
      tuiles: [
        { icone: Receipt, titre: 'Masse brute', valeur: m(totaux.brut), couleur: '#7c3aed' },
        { icone: Receipt, titre: 'Salaires de base', valeur: m(somme('salaireBase')), couleur: '#0284c7' },
        { icone: Receipt, titre: 'Primes', valeur: m(somme('primes')), couleur: '#16a34a' }
      ],
      lignes: bulletinsMois.map((b) => ligne(b, `Base ${m(b.salaireBase)} · Primes ${m(b.primes)}`, m(b.brutTotal)))
    },
    net: {
      titre: 'Net à payer', sous: `Bulletins de ${libellePeriode} : ce que chaque employé reçoit, brut moins la CNSS salarié et l'IRPP.`, icone: Receipt, couleur: '#16a34a', vide,
      tuiles: [
        { icone: Receipt, titre: 'Net à payer', valeur: m(totaux.net), couleur: '#16a34a' },
        { icone: Receipt, titre: 'Brut', valeur: m(totaux.brut), couleur: '#7c3aed' },
        { icone: Receipt, titre: 'Retenues sur salaire', valeur: m(somme('cnssSalarie') + totaux.its), sous: 'CNSS salarié + IRPP', couleur: '#f59e0b' }
      ],
      lignes: bulletinsMois.map((b) => ligne(b, `Brut ${m(b.brutTotal)} − CNSS ${m(b.cnssSalarie)} − IRPP ${m(b.its)}`, m(b.net)))
    },
    cnss: {
      titre: 'CNSS (salarié + employeur)', sous: `Bulletins de ${libellePeriode} : la part retenue sur le salaire (4 %) et la part payée par l'entreprise (17,5 %).`, icone: Receipt, couleur: '#0284c7', vide,
      tuiles: [
        { icone: Receipt, titre: 'CNSS salarié', valeur: m(somme('cnssSalarie')), sous: 'Retenue sur le salaire', couleur: '#0284c7' },
        { icone: Receipt, titre: 'CNSS employeur', valeur: m(somme('cnssEmployeur')), sous: "À la charge de l'entreprise", couleur: '#7c3aed' },
        { icone: Receipt, titre: 'Total CNSS', valeur: m(totaux.cnss), couleur: '#16a34a' }
      ],
      lignes: bulletinsMois.map((b) => ligne(b, `Salarié ${m(b.cnssSalarie)} · Employeur ${m(b.cnssEmployeur)}`, m((Number(b.cnssSalarie) || 0) + (Number(b.cnssEmployeur) || 0))))
    },
    amuirpp: null
  }
  fichesDetail.amuirpp = ficheAmuIrpp()

  function ficheAmuIrpp() { return {
    titre: 'AMU et IRPP', sous: `Bulletins de ${libellePeriode} : l'AMU est payée par l'employeur, l'IRPP est retenu sur le salaire de l'employé (0 % à la charge de l'entreprise).`,
    icone: HeartPulse, couleur: '#0d9488',
    tuiles: [
      { icone: HeartPulse, titre: 'AMU (part employeur)', valeur: formatMoney(totaux.amu), sous: "5 % du brut, à la charge de l'entreprise", couleur: '#0d9488' },
      { icone: Landmark, titre: 'IRPP retenu', valeur: formatMoney(totaux.its), sous: 'Impôt sur le revenu, retenu sur le salaire', couleur: '#f59e0b' }
    ],
    lignes: bulletinsMois.map((b) => ({ id: b.id, libelle: b.employeNom, sous: `AMU ${formatMoney(b.amuEmployeur || 0)} · IRPP ${formatMoney(b.its || 0)}`, detail: formatMoney((Number(b.amuEmployeur) || 0) + (Number(b.its) || 0)) })),
    vide
  } }

  // Détail d'un bulletin (au clic) : du brut au net, les retenues du salarié, puis les charges de l'employeur.
  const bulletinDetail = bulletinsMois.find((b) => b.id === bulletinId)
  const ficheBulletin = (b) => ({
    titre: b.employeNom, sous: `Bulletin de ${moisLabel(b.mois)}${b.poste ? ` · ${b.poste}` : ''}`,
    badge: { label: STATUTS_BULLETIN[b.statut]?.label, tone: STATUTS_BULLETIN[b.statut]?.tone },
    tuiles: [
      { icone: Receipt, label: 'Salaire de base', valeur: formatMoney(b.salaireBase || 0), couleur: '#0284c7' },
      { icone: Receipt, label: 'Primes', valeur: formatMoney(b.primes || 0), couleur: '#16a34a' },
      { icone: Receipt, label: 'Brut', valeur: formatMoney(b.brutTotal || 0), couleur: '#7c3aed' },
      { icone: Receipt, label: 'CNSS salarié', valeur: formatMoney(b.cnssSalarie || 0), couleur: '#0284c7' },
      { icone: Landmark, label: 'IRPP retenu', valeur: formatMoney(b.its || 0), couleur: '#f59e0b' },
      ...(Number(b.retenueAvances) > 0 ? [{ icone: Receipt, label: 'Retenue avances et prêts', valeur: formatMoney(b.retenueAvances), couleur: '#7c3aed' }] : []),
      { icone: BadgeCheck, label: 'Net à payer', valeur: formatMoney(b.net || 0), couleur: '#16a34a' },
      { icone: Receipt, label: 'CNSS employeur', valeur: formatMoney(b.cnssEmployeur || 0), couleur: '#0284c7' },
      { icone: HeartPulse, label: 'AMU employeur', valeur: formatMoney(b.amuEmployeur || 0), couleur: '#0d9488' },
      { icone: Receipt, label: 'Coût total employeur', valeur: formatMoney(b.coutEmployeur || 0), large: true, couleur: '#7c3aed' }
    ],
    note: b.departement ? `Département : ${b.departement}.` : ''
  })

  async function genererPaie() {
    if (actifs.length === 0) return toast.error('Aucun employé actif.')
    let n = 0, saut = 0
    for (const m of moisCibles) {
      // Ne pas écraser un bulletin déjà validé/payé du même mois.
      const verrouilles = new Set(bulletins.filter((b) => b.mois === m && b.statut !== 'brouillon').map((b) => b.employeId))
      for (const e of actifs) {
        if (verrouilles.has(e.id)) { saut++; continue }
        // Mensualités d'avances et de prêts à retenir ce mois-ci sur le net (inscrites sur chaque avance à la validation du bulletin).
        const retenue = retenueDuMois(avances, e.id, m)
        const calc = calculerBulletin(e.salaire, e.primes || 0, paieConfig, retenue.total)
        await setItem(COL.bulletins, `${m}_${e.id}`, {
          mois: m, employeId: e.id, employeNom: e.nom, poste: e.poste || '', departement: e.departement || '',
          salaireBase: Number(e.salaire) || 0, primes: Number(e.primes) || 0, statut: 'brouillon', ...calc, avancesRetenues: retenue.details
        })
        n++
      }
    }
    toast.success(`${n} bulletin(s) en brouillon pour ${libellePeriode}${saut ? ` · ${saut} déjà validé(s) conservé(s)` : ''}`)
  }
  async function valider(b) { await updateItem(COL.bulletins, b.id, { statut: 'valide' }); await appliquerRetenues({ ...b, statut: 'valide' }, avances); toast.success('Bulletin validé : comptabilisé ✓') }
  async function marquerPaye(b) { await updateItem(COL.bulletins, b.id, { statut: 'paye' }); toast.success('Marqué payé') }
  async function validerMois() {
    const brouillons = bulletinsMois.filter((b) => b.statut === 'brouillon')
    if (brouillons.length === 0) return toast.error('Aucun brouillon à valider.')
    if (!confirm(`Valider ${brouillons.length} bulletin(s) ? Ils seront comptabilisés (journal PA).`)) return
    for (const b of brouillons) { await updateItem(COL.bulletins, b.id, { statut: 'valide' }); await appliquerRetenues({ ...b, statut: 'valide' }, avances) }
    toast.success(`${brouillons.length} bulletin(s) validé(s) et comptabilisé(s) ✓`)
  }
  async function supprimer(b) {
    if (b.statut !== 'brouillon') return toast.error('Un bulletin validé ne peut pas être supprimé.')
    if (confirm(`Supprimer le bulletin de ${b.employeNom} ?`)) await removeItem(COL.bulletins, b.id)
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Receipt} sousModule="Temps & Paie" titre="Paie & Bulletins" sousTitre="Génération des bulletins mensuels : CNSS et IRPP (barème Togo)."
        action={<>
          <FiltrePeriode variant="glass" label="Période" mode={mode} onModeChange={setMode}
            valeurJour={jour} onJourChange={setJour} valeurMois={mois} onMoisChange={setMois}
            avecPlage valeurDebut={debut} onDebutChange={setDebut} valeurFin={fin} onFinChange={setFin} />
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un employé…" />
          <BoutonBande icone={Zap} plein={false} onClick={genererPaie}>Générer (brouillon)</BoutonBande>
          <BoutonBande icone={BadgeCheck} onClick={validerMois}>{moisCibles.length > 1 ? 'Valider la période' : 'Valider le mois'}</BoutonBande>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Masse salariale (brut)" value={formatMoney(totaux.brut)} sub="Cliquez pour le détail" accent="#7c3aed" icon={Receipt} onClick={() => setDetailOuvert('brut')} />
        <StatCard title="Net à payer" value={formatMoney(totaux.net)} sub="Cliquez pour le détail" accent="#16a34a" icon={Receipt} onClick={() => setDetailOuvert('net')} />
        <StatCard title="CNSS (sal. + emp.)" value={formatMoney(totaux.cnss)} sub="Cliquez pour le détail" accent="#0284c7" icon={Receipt} onClick={() => setDetailOuvert('cnss')} />
        <StatCard title="AMU et IRPP" value={formatMoney(totaux.amu + totaux.its)} sub="Cliquez pour le détail" accent="#0d9488" icon={HeartPulse} onClick={() => setDetailOuvert('amuirpp')} />
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
        <Landmark size={16} className="mt-0.5 shrink-0" />
        <span>Écriture comptable de paie (journal <strong>{COMPTA_PAIE.journal}</strong>) : débit <strong>{COMPTA_PAIE.compteCharge}</strong> Rémunérations, crédit <strong>{COMPTA_PAIE.comptePersonnel}</strong> Personnel dû et <strong>{COMPTA_PAIE.compteCnss}</strong> CNSS. La passerelle vers la Comptabilité se branche sur les bulletins validés.</span>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <p className="font-bold text-gray-800 dark:text-gray-100">Bulletins de {libellePeriode}</p>
          <p className="text-xs text-gray-500">{bulletinsMois.length} bulletin(s) · {actifs.length} employé(s) actif(s){mode !== 'mois' ? ' · un bulletin couvre un mois entier' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Employé</th>{moisCibles.length > 1 && <th className="px-3 py-2.5">Mois</th>}<th className="px-3 py-2.5">Poste</th>
                <th className="px-3 py-2.5 text-right">Brut</th><th className="px-3 py-2.5 text-right">CNSS</th>
                <th className="px-3 py-2.5 text-right">IRPP</th><th className="px-3 py-2.5 text-right">Net à payer</th>
                <th className="px-3 py-2.5">Statut</th><th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {bulletinsMois.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Aucun bulletin. Cliquez « Générer la paie ».</td></tr>}
              {bulletinsMois.filter((b) => correspond(recherche, b.employeNom)).map((b) => (
                <tr key={b.id} onClick={() => setBulletinId(b.id)} className="group cursor-pointer hover:bg-sky-50/60 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{b.employeNom}</td>
                  {moisCibles.length > 1 && <td className="px-3 py-2 text-gray-500">{moisLabel(b.mois)}</td>}
                  <td className="px-3 py-2 text-gray-500">{b.poste || '—'}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(b.brutTotal)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{formatMoney(b.cnssSalarie)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{formatMoney(b.its)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700 dark:text-green-400">{formatMoney(b.net)}</td>
                  <td className="px-3 py-2"><Badge tone={STATUTS_BULLETIN[b.statut]?.tone}>{STATUTS_BULLETIN[b.statut]?.label}</Badge></td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">
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
      <DetailFiche fiche={bulletinDetail ? ficheBulletin(bulletinDetail) : null} onClose={() => setBulletinId(null)}
        actions={bulletinDetail && bulletinDetail.statut === 'brouillon' ? [{ label: 'Valider ce bulletin', icone: CheckCircle2, tone: 'succes', onClick: () => { valider(bulletinDetail); setBulletinId(null) } }]
          : bulletinDetail && bulletinDetail.statut === 'valide' ? [{ label: 'Marquer payé', icone: BadgeCheck, tone: 'primaire', onClick: () => { marquerPaye(bulletinDetail); setBulletinId(null) } }] : []} />
      <DetailKpiModal fiche={detailOuvert ? fichesDetail[detailOuvert] : null} onClose={() => setDetailOuvert(null)} />
    </div>
  )
}

function moisLabel(mois) {
  const [a, m] = (mois || '').split('-')
  return m ? `${MOIS_LABELS[Number(m) - 1]} ${a}` : mois
}

// Mois (AAAA-MM) couverts par la période choisie : un jour donne son mois, une plage donne tous les mois qu'elle touche (24 au plus).
function moisDeLaPeriode(mode, { jour, mois, debut, fin }) {
  const courant = todayStr().slice(0, 7)
  if (mode === 'jour') return [(jour || '').slice(0, 7) || courant]
  if (mode !== 'plage') return [mois || courant]
  const a = (debut || fin || '').slice(0, 7)
  const z = (fin || debut || '').slice(0, 7)
  if (!a) return [courant]
  const liste = []
  let [y, m] = a.split('-').map(Number)
  while (liste.length < 24) {
    const c = `${y}-${String(m).padStart(2, '0')}`
    if (c > z) break
    liste.push(c)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return liste.length ? liste : [a]
}
