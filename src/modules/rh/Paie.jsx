// RH — Paie & Bulletins (Temps & Paie). Génère les bulletins mensuels (CNSS/IRPP Togo).
import { useMemo, useState } from 'react'
import { Receipt, Zap, Trash2, Landmark, CheckCircle2, BadgeCheck, HeartPulse, UserX, Clock, Pencil, UserRound, Briefcase, Banknote, ShieldCheck, CalendarDays, Wallet, Gift, Settings2, FileDown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { calculerBulletin, STATUTS_BULLETIN, PAIE_CONFIG_DEFAUT, COMPTA_PAIE, MOIS_LABELS, COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh } from './rhui'
import { audit } from '../../core/audit'
import { useAuth } from '../../hooks/useAuth'
import { avatarGradient } from '../../utils/color'
import DetailKpiModal from './DetailKpiModal'
import { retenueDuMois, appliquerRetenues } from './avancesCircuit'
import { lireRegles, lireHoraires } from './horaires'
import { calculerRetenuePresence, detailRetenuePresence } from './retenuesPresence'
import { primesDuMois } from './primesCircuit'
import DetailFiche from './DetailFiche'
// Le générateur de PDF est lourd : chargé seulement au moment d'imprimer un bulletin.
const imprimerBulletin = async (b, libelleMois, par) => (await import('./bulletinPDF')).genererBulletinPDF({ bulletin: b, libelleMois, par })
import { usePeutSupprimerRh, supprimerAvecRetour } from './suppression'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'

export default function Paie() {
  const user = useAuth((s) => s.user)
  const { data: employes } = useCollection(COL.employes)
  const { data: bulletins } = useCollection(COL.bulletins)
  const { data: config } = useCollection(COL.config)
  const { data: avances } = useCollection(COL.avances)
  const { data: presences } = useCollection(COL.presences)
  const { data: primesDocs } = useCollection(COL.primes)
  const { data: postes } = useCollection(COL.postes)
  const regles = useMemo(() => lireRegles(config), [config])
  const horaires = useMemo(() => lireHoraires(config), [config])
  const paieConfig = config.find((c) => c.id === 'paie') || PAIE_CONFIG_DEFAUT

  const [recherche, setRecherche] = useState('')
  // Période : jour, mois ou plage. Un bulletin est mensuel : le jour choisi désigne le bulletin de son mois, une plage désigne tous les mois qu'elle touche.
  const [mode, setMode] = useState('mois')
  const [jour, setJour] = useState(todayStr())
  const [mois, setMois] = useState(todayStr().slice(0, 7))
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [bulletinId, setBulletinId] = useState(null)
  const [edition, setEdition] = useState(null) // fenêtre « Modifier le bulletin » (brouillon seulement)
  const [detailOuvert, setDetailOuvert] = useState(null) // 'brut' | 'net' | 'cnss' | 'amuirpp'
  const actifs = useMemo(() => employes.filter((e) => (e.statut || 'actif') === 'actif'), [employes])
  const moisCibles = useMemo(() => moisDeLaPeriode(mode, { jour, mois, debut, fin }), [mode, jour, mois, debut, fin])
  const libellePeriode = moisCibles.length === 1 ? moisLabel(moisCibles[0]) : `${moisLabel(moisCibles[0])} à ${moisLabel(moisCibles[moisCibles.length - 1])}`
  const bulletinsMois = useMemo(() => bulletins.filter((b) => moisCibles.includes(b.mois)), [bulletins, moisCibles])

  const totaux = useMemo(() => bulletinsMois.reduce((s, b) => ({
    brut: s.brut + (Number(b.brutTotal) || 0), net: s.net + (Number(b.net) || 0),
    cnss: s.cnss + (Number(b.cnssSalarie) || 0) + (Number(b.cnssEmployeur) || 0), amu: s.amu + (Number(b.amuEmployeur) || 0), amuSal: s.amuSal + (Number(b.amuSalarie) || 0), its: s.its + (Number(b.its) || 0)
  }), { brut: 0, net: 0, cnss: 0, amu: 0, amuSal: 0, its: 0 }), [bulletinsMois])

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
      titre: 'Net à payer', sous: `Bulletins de ${libellePeriode} : ce que chaque employé reçoit, brut moins la CNSS salarié, l'AMU salarié et l'IRPP.`, icone: Receipt, couleur: '#16a34a', vide,
      tuiles: [
        { icone: Receipt, titre: 'Net à payer', valeur: m(totaux.net), couleur: '#16a34a' },
        { icone: Receipt, titre: 'Brut', valeur: m(totaux.brut), couleur: '#7c3aed' },
        { icone: Receipt, titre: 'Retenues sur salaire', valeur: m(somme('cnssSalarie') + somme('amuSalarie') + totaux.its), sous: 'CNSS salarié + AMU salarié + IRPP', couleur: '#f59e0b' }
      ],
      lignes: bulletinsMois.map((b) => ligne(b, `Brut ${m(b.brutTotal)} − CNSS ${m(b.cnssSalarie)} − AMU ${m(b.amuSalarie)} − IRPP ${m(b.its)}`, m(b.net)))
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
    titre: 'AMU et IRPP', sous: `Bulletins de ${libellePeriode} : l'AMU est retenue sur le salaire (5 %) et payée aussi par l'employeur (5 %) ; l'IRPP est retenu sur le salaire de l'employé.`,
    icone: HeartPulse, couleur: '#0d9488',
    tuiles: [
      { icone: HeartPulse, titre: 'AMU (part salarié)', valeur: formatMoney(totaux.amuSal), sous: "5 % du brut, retenue sur le salaire de l'employé", couleur: '#0d9488' },
      { icone: HeartPulse, titre: 'AMU (part employeur)', valeur: formatMoney(totaux.amu), sous: "5 % du brut, à la charge de l'entreprise", couleur: '#0d9488' },
      { icone: Landmark, titre: 'IRPP retenu', valeur: formatMoney(totaux.its), sous: 'Impôt sur le revenu, retenu sur le salaire', couleur: '#f59e0b' }
    ],
    lignes: bulletinsMois.map((b) => ({ id: b.id, libelle: b.employeNom, sous: `AMU salarié ${formatMoney(b.amuSalarie || 0)} · AMU employeur ${formatMoney(b.amuEmployeur || 0)} · IRPP ${formatMoney(b.its || 0)}`, detail: formatMoney((Number(b.amuSalarie) || 0) + (Number(b.amuEmployeur) || 0) + (Number(b.its) || 0)) })),
    vide
  } }

  // Détail d'un bulletin (au clic) : du brut au net, les retenues du salarié, puis les charges de l'employeur.
  const bulletinDetail = bulletinsMois.find((b) => b.id === bulletinId)
  const ficheBulletin = (b) => ({
    titre: b.employeNom, sous: `Bulletin de ${moisLabel(b.mois)}${b.poste ? ` · ${b.poste}` : ''}`,
    badge: { label: STATUTS_BULLETIN[b.statut]?.label, tone: STATUTS_BULLETIN[b.statut]?.tone },
    tuiles: [
      { section: 'Rémunération', couleur: '#7c3aed' },
      { icone: Receipt, label: 'Salaire de base', valeur: formatMoney(b.salaireBase || 0), couleur: '#0284c7' },
      { icone: Receipt, label: 'Primes', valeur: formatMoney(b.primes || 0), couleur: '#16a34a' },
      ...(Number(b.retenuePresence) > 0 ? [{ icone: UserX, label: 'Retenue absences et retards', valeur: `− ${formatMoney(b.retenuePresence)}`, couleur: '#dc2626', large: true }] : []),
      { icone: Receipt, label: 'Brut', valeur: formatMoney(b.brutTotal || 0), couleur: '#7c3aed', large: true },
      { section: "Retenues sur le salaire de l'employé", couleur: '#dc2626' },
      { icone: Receipt, label: 'CNSS salarié', valeur: formatMoney(b.cnssSalarie || 0), couleur: '#0284c7' },
      { icone: HeartPulse, label: 'AMU salarié', valeur: formatMoney(b.amuSalarie || 0), couleur: '#0d9488' },
      { icone: Landmark, label: 'IRPP retenu', valeur: formatMoney(b.its || 0), couleur: '#f59e0b' },
      ...(Number(b.retenueAvances) > 0 ? [{ icone: Receipt, label: 'Retenue avances et prêts', valeur: formatMoney(b.retenueAvances), couleur: '#7c3aed' }] : []),
      { section: 'Net', couleur: '#16a34a' },
      { icone: BadgeCheck, label: 'Net à payer', valeur: formatMoney(b.net || 0), couleur: '#16a34a', large: true },
      { section: "Charges payées par l'entreprise", couleur: '#7c3aed' },
      { icone: Receipt, label: 'CNSS employeur', valeur: formatMoney(b.cnssEmployeur || 0), couleur: '#0284c7' },
      { icone: HeartPulse, label: 'AMU employeur', valeur: formatMoney(b.amuEmployeur || 0), couleur: '#0d9488' },
      { icone: Receipt, label: 'Coût total employeur', valeur: formatMoney(b.coutEmployeur || 0), large: true, couleur: '#7c3aed' }
    ],
    enfants: <DetailRetenuePresence b={b} employe={employes.find((e) => e.id === b.employeId)} presences={presences} regles={regles} horaires={horaires} postes={postes} />,
    note: [b.departement ? `Département : ${b.departement}.` : '',
      (b.primesDetail || []).length ? `Primes : ${b.primesDetail.map((p) => `${p.nom} ${formatMoney(p.montant)}`).join(', ')}.` : '',
      Number(b.retenuePresence) > 0 ? `Retenue du mois : ${b.absencesNonJustifiees || 0} absence(s) non justifiée(s) et ${b.retardsMois || 0} retard(s), sur la base d'une journée à ${formatMoney(b.salaireJournalier || 0)}.` : ''].filter(Boolean).join(' ')
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
        // Absences non justifiées et retards du mois : retenus sur le salaire selon les pourcentages des paramètres de présence.
        const presence = calculerRetenuePresence({ presences, employe: e, mois: m, regles })
        // Primes approuvées qui couvrent ce mois (attribuées dans Primes) : elles s'ajoutent au brut, en plus d'une éventuelle prime fixe de la fiche.
        const primesMois = primesDuMois(primesDocs, e, m)
        const totalPrimes = (Number(e.primes) || 0) + primesMois.total
        const calc = calculerBulletin(e.salaire, totalPrimes, paieConfig, retenue.total, presence.total)
        await setItem(COL.bulletins, `${m}_${e.id}`, {
          mois: m, employeId: e.id, employeNom: e.nom, poste: e.poste || '', departement: e.departement || '',
          salaireBase: Number(e.salaire) || 0, primes: totalPrimes, primesDetail: primesMois.details, statut: 'brouillon', ...calc, avancesRetenues: retenue.details,
          absencesNonJustifiees: presence.absencesNonJustifiees, retardsMois: presence.retards, salaireJournalier: presence.salaireJournalier
        })
        n++
      }
    }
    toast.success(`${n} bulletin(s) en brouillon pour ${libellePeriode}${saut ? ` · ${saut} déjà validé(s) conservé(s)` : ''}`)
  }
  // Modifier un bulletin en brouillon : salaire de base, primes, retenues. Les cotisations et le net sont recalculés avec les mêmes règles que la génération.
  const ouvrirEdition = (b) => setEdition({ id: b.id, employeNom: b.employeNom, mois: b.mois, salaireBase: String(b.salaireBase ?? 0), primes: String(b.primes ?? 0), retenuePresence: String(b.retenuePresence ?? 0), retenueAvances: String(b.retenueAvances ?? 0) })
  const calculEdition = edition ? calculerBulletin(Number(edition.salaireBase) || 0, Number(edition.primes) || 0, paieConfig, Number(edition.retenueAvances) || 0, Number(edition.retenuePresence) || 0) : null
  async function enregistrerEdition() {
    const champs = ['salaireBase', 'primes', 'retenuePresence', 'retenueAvances']
    if (champs.some((k) => !(Number(edition[k]) >= 0) || edition[k] === '')) return toast.error('Chaque montant doit être un nombre positif ou zéro')
    const b = bulletins.find((x) => x.id === edition.id)
    if (!b || (b.statut || 'brouillon') !== 'brouillon') { setEdition(null); return toast.error('Seul un bulletin en brouillon peut être modifié') }
    try {
      await updateItem(COL.bulletins, b.id, { ...calculEdition, salaireBase: Number(edition.salaireBase) || 0, primes: Number(edition.primes) || 0, modifie: true, modifiePar: user?.nom || '', modifieLe: new Date().toISOString() })
      await audit('rh', 'BULLETIN_MODIFIE', `${b.employeNom} ${b.mois} : net ${formatMoney(b.net || 0)} → ${formatMoney(calculEdition.net)}`)
      toast.success('Bulletin modifié ✓')
      setEdition(null)
    } catch (err) { toast.error(err?.message || 'Modification impossible : réessayez') }
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
    await supprimerAvecRetour(() => removeItem(COL.bulletins, b.id), `Bulletin de ${b.employeNom} supprimé : régénérez-le pour le corriger`)
  }
  const peutSupprimer = usePeutSupprimerRh() // le bouton Supprimer est réservé à l'administration

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
        <StatCard title="AMU et IRPP" value={formatMoney(totaux.amu + totaux.amuSal + totaux.its)} sub="Cliquez pour le détail" accent="#0d9488" icon={HeartPulse} onClick={() => setDetailOuvert('amuirpp')} />
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
                <th className="px-3 py-2.5"><Tete icone={UserRound}>Employé</Tete></th>{moisCibles.length > 1 && <th className="px-3 py-2.5"><Tete icone={CalendarDays}>Mois</Tete></th>}<th className="px-3 py-2.5"><Tete icone={Briefcase}>Poste</Tete></th>
                <th className="px-3 py-2.5 text-right" title="Retenue sur le salaire pour les absences non justifiées et les retards du mois. Cliquez sur la ligne pour le détail."><span className="inline-flex items-center gap-1"><UserX size={12} aria-hidden="true" />Absences et retards</span></th>
                <th className="px-3 py-2.5 text-right" title="Salaire de base et primes, moins la retenue d'absences et de retards"><Tete icone={Banknote} droite>Brut</Tete></th><th className="px-3 py-2.5 text-right"><Tete icone={ShieldCheck} droite>CNSS</Tete></th><th className="px-3 py-2.5 text-right" title="AMU retenue sur le salaire de l'employé"><Tete icone={HeartPulse} droite>AMU</Tete></th>
                <th className="px-3 py-2.5 text-right"><Tete icone={Landmark} droite>IRPP</Tete></th><th className="px-3 py-2.5 text-right"><Tete icone={Wallet} droite>Net à payer</Tete></th>
                <th className="px-3 py-2.5"><Tete icone={CheckCircle2}>Statut</Tete></th><th className="px-3 py-2.5 text-right"><Tete icone={Settings2} droite>Actions</Tete></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {bulletinsMois.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">Aucun bulletin. Cliquez « Générer la paie ».</td></tr>}
              {bulletinsMois.filter((b) => correspond(recherche, b.employeNom)).map((b) => (
                <tr key={b.id} onClick={() => setBulletinId(b.id)} className="group cursor-pointer hover:bg-sky-50/60 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">
                    <span className="inline-flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white shadow-sm" style={{ background: avatarGradient(b.employeNom || '?') }} aria-hidden="true">{String(b.employeNom || '?').trim().charAt(0).toUpperCase()}</span>
                      {b.employeNom}
                    </span>
                  </td>
                  {moisCibles.length > 1 && <td className="px-3 py-2 text-gray-500"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="shrink-0 text-sky-500" aria-hidden="true" />{moisLabel(b.mois)}</span></td>}
                  <td className="px-3 py-2 text-gray-500">{b.poste ? <span className="inline-flex items-center gap-1.5"><Briefcase size={14} className="shrink-0 text-gray-400" aria-hidden="true" />{b.poste}</span> : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {Number(b.retenuePresence) > 0
                      ? <span className="inline-flex flex-col items-end leading-tight"><span className="font-semibold text-red-600">− {formatMoney(b.retenuePresence)}</span><span className="text-[11px] text-gray-400">{b.absencesNonJustifiees || 0} abs. · {b.retardsMois || 0} retard(s)</span></span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right"><span className="inline-flex items-center gap-1.5 font-semibold"><Banknote size={14} className="shrink-0 text-violet-500" aria-hidden="true" />{formatMoney(b.brutTotal)}</span></td>
                  <td className="px-3 py-2 text-right text-gray-500"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="shrink-0 text-sky-500" aria-hidden="true" />{formatMoney(b.cnssSalarie)}</span></td>
                  <td className="px-3 py-2 text-right text-gray-500"><span className="inline-flex items-center gap-1.5"><HeartPulse size={14} className="shrink-0 text-teal-500" aria-hidden="true" />{formatMoney(b.amuSalarie || 0)}</span></td>
                  <td className="px-3 py-2 text-right text-gray-500"><span className="inline-flex items-center gap-1.5"><Landmark size={14} className="shrink-0 text-amber-500" aria-hidden="true" />{formatMoney(b.its)}</span></td>
                  <td className="px-3 py-2 text-right font-bold text-green-700 dark:text-green-400"><span className="inline-flex items-center gap-1.5"><Wallet size={14} className="shrink-0" aria-hidden="true" />{formatMoney(b.net)}</span></td>
                  <td className="px-3 py-2"><Badge tone={STATUTS_BULLETIN[b.statut]?.tone}>{b.statut === 'brouillon' ? <Clock size={11} aria-hidden="true" /> : b.statut === 'paye' ? <BadgeCheck size={11} aria-hidden="true" /> : <CheckCircle2 size={11} aria-hidden="true" />}{STATUTS_BULLETIN[b.statut]?.label}</Badge>{b.modifie && <span className="ml-1 text-[10px] font-semibold text-gray-400" title={`Modifié à la main par ${b.modifiePar || '?'}`}>modifié</span>}</td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">
                    {b.statut === 'brouillon' && <button onClick={() => ouvrirEdition(b)} title="Modifier ce bulletin (brouillon)" aria-label="Modifier ce bulletin" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={14} /></button>}
                    {b.statut === 'brouillon' && <button onClick={() => valider(b)} title="Valider (comptabiliser)" className="rounded p-1.5 text-green-600 hover:bg-green-50"><CheckCircle2 size={15} /></button>}
                    {b.statut === 'valide' && <button onClick={() => marquerPaye(b)} title="Marquer payé" className="rounded p-1.5 text-sky-600 hover:bg-sky-50"><BadgeCheck size={15} /></button>}
                    {b.statut === 'brouillon' && peutSupprimer && <button onClick={() => supprimer(b)} title="Supprimer le brouillon (puis régénérer pour le corriger)" aria-label="Supprimer le brouillon" className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <DetailFiche fiche={bulletinDetail ? ficheBulletin(bulletinDetail) : null} onClose={() => setBulletinId(null)}
        actions={bulletinDetail ? [
          { label: 'Bulletin PDF', icone: FileDown, tone: 'neutre', onClick: () => imprimerBulletin(bulletinDetail, moisLabel(bulletinDetail.mois), user?.nom || '').catch(() => toast.error('Impossible de générer le bulletin. Réessayez dans un instant.')) },
          ...(bulletinDetail.statut === 'brouillon' ? [{ label: 'Modifier', icone: Pencil, tone: 'primaire', onClick: () => { ouvrirEdition(bulletinDetail); setBulletinId(null) } }, { label: 'Valider ce bulletin', icone: CheckCircle2, tone: 'succes', onClick: () => { valider(bulletinDetail); setBulletinId(null) } }]
            : bulletinDetail.statut === 'valide' ? [{ label: 'Marquer payé', icone: BadgeCheck, tone: 'primaire', onClick: () => { marquerPaye(bulletinDetail); setBulletinId(null) } }] : [])
        ] : []} />
      <ModalRh open={!!edition} onClose={() => setEdition(null)} title="Modifier le bulletin" titreHero={edition?.employeNom} icone={Pencil} size="lg"
        intro={edition ? `Bulletin de ${moisLabel(edition.mois)} (brouillon). Les cotisations et le net se recalculent tout seuls.` : ''} libelleSave="Enregistrer les modifications" onSave={enregistrerEdition}>
        {edition && (<>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Salaire de base (FCFA)" icone={Banknote}><input type="number" min="0" value={edition.salaireBase} onChange={(e) => setEdition({ ...edition, salaireBase: e.target.value })} className="input-base" /></Champ>
            <Champ label="Primes (FCFA)" icone={Gift}><input type="number" min="0" value={edition.primes} onChange={(e) => setEdition({ ...edition, primes: e.target.value })} className="input-base" /></Champ>
            <Champ label="Retenue absences et retards (FCFA)" icone={UserX} aide="Calculée d'après les présences : modifiable ici si besoin."><input type="number" min="0" value={edition.retenuePresence} onChange={(e) => setEdition({ ...edition, retenuePresence: e.target.value })} className="input-base" /></Champ>
            <Champ label="Retenue avances et prêts (FCFA)" icone={Receipt}><input type="number" min="0" value={edition.retenueAvances} onChange={(e) => setEdition({ ...edition, retenueAvances: e.target.value })} className="input-base" /></Champ>
          </div>
          {calculEdition && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/80 bg-white/60 p-3 text-sm backdrop-blur-md sm:grid-cols-5">
              {[['Brut', calculEdition.brutTotal, Banknote, '#7c3aed'], ['CNSS salarié', calculEdition.cnssSalarie, ShieldCheck, '#0284c7'], ['AMU salarié', calculEdition.amuSalarie, HeartPulse, '#0d9488'], ['IRPP', calculEdition.its, Landmark, '#f59e0b'], ['Net à payer', calculEdition.net, Wallet, '#16a34a']].map(([l, v, Ic, c]) => (
                <div key={l} className="min-w-0"><p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-gray-500"><Ic size={12} style={{ color: c }} aria-hidden="true" />{l}</p><p className="truncate text-sm font-extrabold text-gray-800">{formatMoney(v)}</p></div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-500">Un bulletin modifié à la main est repéré par la mention « modifié ». Régénérer la paie remet ses valeurs calculées.</p>
        </>)}
      </ModalRh>
      <DetailKpiModal fiche={detailOuvert ? fichesDetail[detailOuvert] : null} onClose={() => setDetailOuvert(null)} />
    </div>
  )
}

// En-tête de colonne avec son icône.
const Tete = ({ icone: Icone, children, droite }) => <span className={`inline-flex items-center gap-1.5 ${droite ? 'justify-end' : ''}`}><Icone size={13} aria-hidden="true" />{children}</span>

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

// Durée en heures et minutes : 75 → « 1 h 15 min ».
const duree = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`)

// Détail de la retenue d'absences et de retards d'un bulletin : les jours d'absence, les retards en heures et minutes, et le calcul.
// Calculé d'après les présences enregistrées ; si elles ont changé depuis la génération du bulletin, un avertissement le dit.
function DetailRetenuePresence({ b, employe, presences, regles, horaires, postes }) {
  const d = detailRetenuePresence({ presences, employe, mois: b.mois, regles, horaires, postes })
  const retenue = Number(b.retenuePresence) || 0
  const nonJustifiees = d.absences.filter((a) => !a.justifiee)
  const changed = employe && d.total !== retenue
  const base = Number(b.salaireBase) || 0
  const partDuSalaire = base > 0 ? Math.round((retenue / base) * 1000) / 10 : 0 // part de la retenue dans le salaire de base, en %
  const partAbsences = base > 0 ? Math.round(((employe ? d.retenueAbsences : 0) / base) * 1000) / 10 : 0
  const partRetards = base > 0 ? Math.round(((employe ? d.retenueRetards : 0) / base) * 1000) / 10 : 0
  const pct = (n) => `${String(n).replace('.', ',')} %`
  return (
    <div className="space-y-2 rounded-2xl border border-red-200/70 bg-red-50/50 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-red-700"><UserX size={13} aria-hidden="true" /> Absences et retards de {moisLabel(b.mois)}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2"><p className="text-[11px] font-semibold uppercase text-gray-500">Jours d'absence retenus</p>
          <p className="text-sm font-bold text-gray-800">{b.absencesNonJustifiees ?? nonJustifiees.length} jour(s)</p><p className="text-xs font-semibold text-red-600">− {formatMoney(employe ? d.retenueAbsences : 0)}{retenue > 0 ? <span className="font-medium text-gray-500"> ({pct(partAbsences)} du salaire)</span> : null}</p><p className="mt-0.5 text-[11px] text-gray-500">{regles.pctAbsence} % d'une journée par absence non justifiée</p></div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2"><p className="text-[11px] font-semibold uppercase text-gray-500">Retards</p>
          <p className="text-sm font-bold text-gray-800">{b.retardsMois ?? d.retards.length} retard(s){d.minutesRetard > 0 ? ` · ${duree(d.minutesRetard)}` : ''}</p><p className="text-xs font-semibold text-red-600">− {formatMoney(employe ? d.retenueRetards : 0)}{retenue > 0 ? <span className="font-medium text-gray-500"> ({pct(partRetards)} du salaire)</span> : null}</p><p className="mt-0.5 text-[11px] text-gray-500">{regles.pctRetard} % d'une journée par retard</p></div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2"><p className="text-[11px] font-semibold uppercase text-gray-500">Salaire d'une journée</p>
          <p className="text-sm font-bold text-gray-800">{formatMoney(b.salaireJournalier || d.salaireJournalier || 0)}</p><p className="text-xs text-gray-400">salaire ÷ {d.joursTravailles || '?'} jours travaillés</p></div>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-xs text-gray-700">
        <span className="font-bold">Total retenu pour absences et retards :</span>
        <span className="font-extrabold text-red-600">− {formatMoney(retenue)}</span>
        {retenue > 0 ? <span className="font-semibold text-gray-600">soit {pct(partDuSalaire)} du salaire de base ({formatMoney(base)})</span> : <span className="text-emerald-700">aucune absence non justifiée ni retard ce mois-ci</span>}
      </p>
      {d.absences.length > 0 && (
        <div><p className="mb-1 text-xs font-bold text-gray-600">Absences</p>
          <ul className="space-y-1">{d.absences.map((a) => (
            <li key={a.date} className="flex flex-wrap items-center gap-x-2 text-xs text-gray-700">
              <UserX size={12} className={a.justifiee ? 'text-gray-400' : 'text-red-500'} aria-hidden="true" />
              <span className="font-semibold">{formatDateShort(a.date)}</span>
              <span className={a.justifiee ? 'text-emerald-700' : 'font-semibold text-red-600'}>{a.justifiee ? 'justifiée : aucune retenue' : `non justifiée : retenue de ${regles.pctAbsence} % d'une journée`}</span>
              {a.motif && <span className="text-gray-400">· {a.motif}</span>}
            </li>))}</ul></div>
      )}
      {d.retards.length > 0 && (
        <div><p className="mb-1 text-xs font-bold text-gray-600">Retards (arrivée prévue à {d.arriveePrevue})</p>
          <ul className="space-y-1">{d.retards.map((r) => (
            <li key={r.date} className="flex flex-wrap items-center gap-x-2 text-xs text-gray-700">
              <Clock size={12} className="text-amber-500" aria-hidden="true" />
              <span className="font-semibold">{formatDateShort(r.date)}</span>
              <span>arrivé à {r.heure || '?'}</span>
              <span className="font-semibold text-amber-700">{r.heure ? `${duree(r.minutes)} de retard` : 'retard'}</span>
              <span className="text-gray-400">· retenue de {regles.pctRetard} % d'une journée</span>
            </li>))}</ul></div>
      )}
      {changed && <p className="text-[11px] font-semibold text-amber-700">Les présences ont changé depuis la génération de ce bulletin (retenue actuelle : {formatMoney(d.total)}). Supprimez le brouillon puis régénérez la paie pour l'actualiser.</p>}
    </div>
  )
}
