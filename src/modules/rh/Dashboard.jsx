// RH — Tableau de bord (3 vues : Admin / Manager / Employé), aligné FEZIRE /hr/dashboard.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Wallet, Users, CalendarCheck, CalendarDays, Receipt, FileText, BadgeCheck, ListChecks, Award, Clock, LayoutDashboard, UserX, PartyPopper, ShieldAlert, TrendingUp, GraduationCap, Plane } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { calculerBulletin, DROIT_CONGE_ANNUEL, MOIS_LABELS, PAIE_CONFIG_DEFAUT, TYPES_PRESENCE, TYPES_CONGE } from './store/rhStore'
import DetailKpiModal from './DetailKpiModal'
import { ListeCarte, EffectifAnneauCarte } from './CartesDashboard'
import { PageHeader } from './rhui'
import { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'

const VUES = [
  { id: 'admin', label: 'Vue Admin RH', perimetre: "Toute l'Organisation" },
  { id: 'manager', label: 'Vue Manager', perimetre: 'Mon Équipe / Départements' },
  { id: 'employe', label: 'Vue Employé (Self-Service)', perimetre: 'Moi uniquement (Self-Service)' }
]

export default function Dashboard() {
  const { data: employes } = useCollection('rh_employes')
  const { data: presences } = useCollection('rh_presences')
  const { data: conges } = useCollection('rh_conges')
  const { data: bulletins } = useCollection('rh_bulletins')
  const { data: contrats } = useCollection('rh_contrats')
  const { data: formations } = useCollection('rh_formations')
  const { data: evaluations } = useCollection('rh_evaluations')
  const { data: taches } = useCollection('rh_taches')
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  const [vue, setVue] = useState('admin')
  const [ouvert, setOuvert] = useState(null) // KPI dont la fenêtre de détail est ouverte

  const today = todayStr()
  const moisCourant = today.slice(0, 7)

  const kpi = useMemo(() => {
    const actifs = employes.filter((e) => (e.statut || 'actif') === 'actif')
    const presToday = presences.filter((p) => p.date === today)
    const retards = presToday.filter((p) => p.statut === 'retard').length
    const absents = presToday.filter((p) => p.statut === 'absent').length
    const congesAttente = conges.filter((c) => (c.statut || 'en_attente') === 'en_attente')
    const bulletinsMois = bulletins.filter((b) => (b.mois || '') === moisCourant)
    const masseSalariale = bulletinsMois.length
      ? bulletinsMois.reduce((s, b) => s + (Number(b.brutTotal) || 0), 0)
      : actifs.reduce((s, e) => s + calculerBulletin(e.salaire).brutTotal, 0)
    const dans30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    const cddProches = contrats.filter((c) => c.type === 'cdd' && c.dateFin && c.dateFin >= today && c.dateFin <= dans30)
    const bulletinsAValider = bulletinsMois.filter((b) => (b.statut || 'brouillon') === 'brouillon').length
    return { actifs: actifs.length, total: employes.length, presToday: presToday.length, retards, absents,
      congesAttente: congesAttente.length, masseSalariale, nbBulletins: bulletinsMois.length,
      cddProches, bulletinsAValider, coutEmployeur: Math.round(masseSalariale * (1 + PAIE_CONFIG_DEFAUT.tauxCnssEmployeur)) }
  }, [employes, presences, conges, bulletins, contrats, today, moisCourant])

  const perimetre = VUES.find((v) => v.id === vue)?.perimetre

  // Détails des cartes (vue Admin) et données personnelles (vue Employé).
  const details = useMemo(() => {
    const nom = (e) => e?.nom || 'Sans nom'
    const enPoste = employes.filter((e) => (e.statut || 'actif') !== 'sorti')
    const auj = new Date(); auj.setHours(0, 0, 0, 0)

    // Absents aujourd'hui : absence pointée ou congé approuvé qui couvre la date, avec le retour prévu.
    const absents = new Map()
    presences.filter((p) => p.date === today && (p.statut === 'absent' || p.statut === 'conge'))
      .forEach((p) => absents.set(p.employeId, { id: p.employeId, libelle: p.employeNom || 'Employé', detail: p.statut === 'conge' ? 'En congé' : 'Absent' }))
    conges.filter((c) => c.statut === 'approuve' && c.dateDebut <= today && c.dateFin >= today)
      .forEach((c) => absents.set(c.employeId, { id: c.employeId, libelle: c.employeNom || 'Employé', detail: `En congé jusqu'au ${formatDateShort(c.dateFin)}` }))

    // Anniversaires d'embauche des 7 prochains jours (1 an et plus).
    const anciennete = enPoste.map((e) => {
      if (!e.dateEmbauche) return null
      const [y, m, d] = e.dateEmbauche.split('-').map(Number)
      const fete = new Date(auj.getFullYear(), m - 1, d)
      if (fete < auj) fete.setFullYear(fete.getFullYear() + 1)
      const jours = Math.round((fete - auj) / 864e5)
      const ans = fete.getFullYear() - y
      if (jours > 7 || ans < 1) return null
      return { id: e.id, libelle: nom(e), detail: `${ans} an${ans > 1 ? 's' : ''} ${jours === 0 ? "aujourd'hui" : `le ${String(fete.getDate()).padStart(2, '0')}/${String(fete.getMonth() + 1).padStart(2, '0')}`}`, jours }
    }).filter(Boolean).sort((a, b) => a.jours - b.jours)

    // CDD qui se terminent dans les 30 jours.
    const dans30 = new Date(auj.getTime() + 30 * 864e5).toISOString().slice(0, 10)
    const cdd = contrats.filter((c) => c.type === 'cdd' && c.dateFin && c.dateFin >= today && c.dateFin <= dans30)
      .sort((a, b) => (a.dateFin < b.dateFin ? -1 : 1))
      .map((c) => ({ id: `c_${c.id}`, libelle: c.employeNom || 'Employé', detail: `CDD : fin le ${formatDateShort(c.dateFin)}` }))

    // En période d'essai : statut de l'employé ou contrat d'essai.
    const essaiIds = new Set([...enPoste.filter((e) => e.statut === 'essai').map((e) => e.id), ...contrats.filter((c) => c.type === 'essai').map((c) => c.employeId)])
    const essai = enPoste.filter((e) => essaiIds.has(e.id)).map((e) => ({ id: `s_${e.id}`, libelle: nom(e), detail: e.dateEmbauche ? `Essai depuis le ${formatDateShort(e.dateEmbauche)}` : 'En essai' }))

    // Dossiers incomplets : contrat, salaire ou contact manquant.
    const incomplets = enPoste.map((e) => {
      const manque = []
      if (!contrats.some((c) => c.employeId === e.id)) manque.push('contrat')
      if (!(Number(e.salaire) > 0)) manque.push('salaire')
      if (!e.contact) manque.push('contact')
      return manque.length ? { id: `i_${e.id}`, libelle: nom(e), detail: `Manque : ${manque.join(', ')}` } : null
    }).filter(Boolean)

    // Effectif par département.
    const comptes = {}
    enPoste.forEach((e) => { const d = e.departement || 'Non renseigné'; comptes[d] = (comptes[d] || 0) + 1 })
    const parDepartement = Object.entries(comptes).map(([nomDep, nb]) => ({ nom: nomDep, nb })).sort((a, b) => b.nb - a.nb)

    // Masse salariale : 6 derniers mois, d'après les bulletins générés.
    const mois5 = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(auj.getFullYear(), auj.getMonth() - 1 - i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    const paie5 = mois5.map((m) => {
      const bs = bulletins.filter((b) => b.mois === m)
      const [a, mm] = m.split('-').map(Number)
      return { id: m, libelle: `${MOIS_LABELS[mm - 1]} ${a}`, detail: bs.length ? formatMoney(bs.reduce((t, b) => t + (Number(b.brutTotal) || 0), 0)) : 'Aucun bulletin' }
    })

    // Congés approuvés du mois courant qui ne sont pas encore terminés.
    const debutMois = `${today.slice(0, 7)}-01`
    const finMois = `${today.slice(0, 7)}-31`
    const congesPrevus = conges.filter((c) => c.statut === 'approuve' && c.dateFin >= today && c.dateDebut <= finMois && c.dateFin >= debutMois)
      .sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1))
      .map((c) => ({ id: c.id, libelle: c.employeNom || 'Employé', detail: `${formatDateShort(c.dateDebut)} au ${formatDateShort(c.dateFin)}` }))

    // Formations dont la date est passée sans être commencées, et évaluations absentes cette année.
    const annee = today.slice(0, 4)
    const retard = [
      ...formations.filter((f) => f.statut === 'planifiee' && f.dateDebut && f.dateDebut < today)
        .map((f) => ({ id: `f_${f.id}`, libelle: f.titre || 'Formation', detail: `Prévue le ${formatDateShort(f.dateDebut)}` })),
      ...enPoste.filter((e) => !evaluations.some((v) => v.employeId === e.id && String(v.periode || '').includes(annee)))
        .map((e) => ({ id: `e_${e.id}`, libelle: nom(e), detail: `Évaluation ${annee} à faire` }))
    ]

    // Vue Employé : la fiche rattachée au compte connecté.
    const moi = employes.find((e) => e.userId && (e.userId === user?.uid || e.userId === user?.id))
    const departement = moi?.departement || ''
    const idsEquipe = departement ? new Set(employes.filter((e) => e.departement === departement && (e.statut || 'actif') === 'actif').map((e) => e.id)) : null
    const dansEquipe = (id) => !idsEquipe || idsEquipe.has(id)
    const presEquipe = presences.filter((p) => p.date === today && dansEquipe(p.employeId))
    const equipe = {
      departement,
      effectif: idsEquipe ? idsEquipe.size : employes.filter((e) => (e.statut || 'actif') === 'actif').length,
      congesAttente: conges.filter((c) => (c.statut || 'en_attente') === 'en_attente' && dansEquipe(c.employeId)).length,
      retards: presEquipe.filter((p) => p.statut === 'retard').length,
      absents: presEquipe.filter((p) => p.statut === 'absent').length
    }
    let perso = null
    if (moi) {
      const pris = conges.filter((c) => c.employeId === moi.id && c.statut === 'approuve' && c.type === 'annuel' && (c.dateDebut || '').startsWith(annee))
        .reduce((t, c) => t + (Number(c.jours) || 0), 0)
      const dernier = bulletins.filter((b) => b.employeId === moi.id).sort((a, b) => (a.mois < b.mois ? 1 : -1))[0]
      const mesTaches = taches.filter((t) => t.assigneId === moi.id && t.statut !== 'termine' && t.echeance && t.echeance <= today)
      perso = { pris, solde: Math.max(0, DROIT_CONGE_ANNUEL - pris), dernier, mesTaches: mesTaches.length, enRetard: mesTaches.filter((t) => t.echeance < today).length }
    }
    const contratsASurveiller = [...cdd, ...essai, ...incomplets]
    // Fiches de détail des KPI (fenêtre au clic). Les listes de l'équipe ne contiennent que le département du manager.
    const jourDe = (iso) => Math.round((new Date(`${iso}T00:00:00`) - auj) / 864e5)
    const lignePresence = (p) => ({ id: p.id || `${p.date}_${p.employeId}`, libelle: p.employeNom || 'Employé', sous: p.heureArrivee ? `Arrivée à ${p.heureArrivee}` : '', detail: TYPES_PRESENCE[p.statut]?.label || p.statut || 'Pointé',
      ton: p.statut === 'absent' ? 'rouge' : p.statut === 'retard' ? 'orange' : p.statut === 'present' ? 'vert' : 'gris' })
    const ligneConge = (c) => ({ id: c.id, libelle: c.employeNom || 'Employé', sous: TYPES_CONGE[c.type]?.label || c.type || '', detail: `${formatDateShort(c.dateDebut)} au ${formatDateShort(c.dateFin)}${c.jours ? ` · ${c.jours} j` : ''}`, ton: 'orange' })
    const actifsLignes = (ids) => employes.filter((e) => (e.statut || 'actif') === 'actif' && (!ids || ids.has(e.id)))
      .sort((a, b) => (nom(a) < nom(b) ? -1 : 1)).map((e) => ({ id: e.id, libelle: nom(e), sous: e.poste || '', detail: e.departement || 'Sans département', ton: 'gris' }))
    const bulletinsMois = bulletins.filter((b) => b.mois === today.slice(0, 7))
    const masse = bulletinsMois.length ? bulletinsMois.reduce((t, b) => t + (Number(b.brutTotal) || 0), 0)
      : employes.filter((e) => (e.statut || 'actif') === 'actif').reduce((t, e) => t + calculerBulletin(e.salaire).brutTotal, 0)
    const congesAttenteListe = conges.filter((c) => (c.statut || 'en_attente') === 'en_attente')
    const fiches = {
      effectif: { titre: 'Effectif actif', sous: 'Les employés actifs, avec leur poste et leur département.', icone: Users, couleur: '#0284c7',
        tuiles: [{ icone: Users, titre: 'Actifs', valeur: actifsLignes().length }, { icone: Wallet, titre: 'Répertoriés', valeur: employes.length, sous: 'sorties comprises' }, { icone: Building2, titre: 'Départements', valeur: new Set(actifsLignes().map((l) => l.detail)).size }],
        lignes: actifsLignes(), vide: 'Aucun employé actif enregistré.', lien: { to: '/rh/employes', label: 'Ouvrir les employés' } },
      presences: { titre: 'Présences du jour', sous: 'Les pointages enregistrés aujourd\'hui.', icone: CalendarCheck, couleur: '#16a34a',
        tuiles: [{ icone: CalendarCheck, titre: 'Pointages', valeur: presences.filter((p) => p.date === today).length }, { icone: Clock, titre: 'Retards', valeur: presences.filter((p) => p.date === today && p.statut === 'retard').length, couleur: '#f59e0b' }, { icone: UserX, titre: 'Absents', valeur: presences.filter((p) => p.date === today && p.statut === 'absent').length, couleur: '#dc2626' }],
        lignes: presences.filter((p) => p.date === today).map(lignePresence), vide: "Aucun pointage enregistré aujourd'hui.", lien: { to: '/rh/presences', label: 'Ouvrir les présences' } },
      conges: { titre: 'Congés à traiter', sous: 'Les demandes en attente de validation.', icone: CalendarDays, couleur: '#f59e0b',
        tuiles: [{ icone: CalendarDays, titre: 'En attente', valeur: congesAttenteListe.length }, { icone: Clock, titre: 'Jours demandés', valeur: congesAttenteListe.reduce((t, c) => t + (Number(c.jours) || 0), 0) }],
        lignes: congesAttenteListe.map(ligneConge), vide: 'Aucune demande en attente.', lien: { to: '/rh/conges', label: 'Ouvrir les congés' } },
      paie: { titre: 'Paie du mois', sous: bulletinsMois.length ? 'Les bulletins générés ce mois-ci.' : 'Aucun bulletin généré : estimation à partir des salaires actifs.', icone: Receipt, couleur: '#7c3aed',
        tuiles: [{ icone: Receipt, titre: 'Masse brute', valeur: formatMoney(masse) }, { icone: Wallet, titre: 'Coût employeur', valeur: formatMoney(Math.round(masse * (1 + PAIE_CONFIG_DEFAUT.tauxCnssEmployeur))), sous: 'charges patronales incluses' }, { icone: BadgeCheck, titre: 'Bulletins', valeur: bulletinsMois.length }],
        lignes: bulletinsMois.length
          ? bulletinsMois.map((b) => ({ id: b.id || `${b.mois}_${b.employeId}`, libelle: b.employeNom || 'Employé', sous: b.poste || '', detail: formatMoney(b.brutTotal), ton: (b.statut || 'brouillon') === 'brouillon' ? 'orange' : 'vert' }))
          : employes.filter((e) => (e.statut || 'actif') === 'actif').map((e) => ({ id: e.id, libelle: nom(e), sous: 'Estimation', detail: formatMoney(calculerBulletin(e.salaire).brutTotal), ton: 'gris' })),
        vide: 'Aucun bulletin ni salaire enregistré.', lien: { to: '/rh/paie', label: 'Ouvrir la paie' } },
      cdd: { titre: 'Échéances CDD', sous: 'Les CDD qui se terminent dans les 30 prochains jours.', icone: FileText, couleur: '#dc2626',
        tuiles: [{ icone: FileText, titre: 'Fins de contrat', valeur: cdd.length }, { icone: Clock, titre: 'Sous 7 jours', valeur: contrats.filter((c) => c.type === 'cdd' && c.dateFin >= today && jourDe(c.dateFin) <= 7).length, couleur: '#dc2626' }],
        lignes: contrats.filter((c) => c.type === 'cdd' && c.dateFin && c.dateFin >= today && jourDe(c.dateFin) <= 30).sort((a, b) => (a.dateFin < b.dateFin ? -1 : 1))
          .map((c) => ({ id: c.id, libelle: c.employeNom || 'Employé', sous: `Fin le ${formatDateShort(c.dateFin)}`, detail: jourDe(c.dateFin) === 0 ? "Aujourd'hui" : `Dans ${jourDe(c.dateFin)} j`, ton: jourDe(c.dateFin) <= 7 ? 'rouge' : 'orange' })),
        vide: 'Aucun CDD ne se termine dans les 30 jours.', lien: { to: '/rh/contrats', label: 'Ouvrir les contrats' } },
      bulletins: { titre: 'Bulletins à valider', sous: 'Les bulletins du mois encore en brouillon.', icone: BadgeCheck, couleur: '#0d9488',
        tuiles: [{ icone: BadgeCheck, titre: 'À valider', valeur: bulletinsMois.filter((b) => (b.statut || 'brouillon') === 'brouillon').length }, { icone: Receipt, titre: 'Bulletins du mois', valeur: bulletinsMois.length }],
        lignes: bulletinsMois.filter((b) => (b.statut || 'brouillon') === 'brouillon').map((b) => ({ id: b.id || `${b.mois}_${b.employeId}`, libelle: b.employeNom || 'Employé', sous: b.poste || '', detail: formatMoney(b.brutTotal), ton: 'orange' })),
        vide: 'Aucun bulletin en brouillon.', lien: { to: '/rh/paie', label: 'Ouvrir la paie' } },
      equipeEffectif: { titre: "Effectif de l'équipe", sous: departement ? `Département : ${departement}` : "Toute l'organisation", icone: Users, couleur: '#0284c7',
        tuiles: [{ icone: Users, titre: 'Collaborateurs', valeur: actifsLignes(idsEquipe).length }], lignes: actifsLignes(idsEquipe), vide: 'Aucun collaborateur actif.', lien: { to: '/rh/organigramme', label: "Ouvrir l'organigramme" } },
      equipeConges: { titre: 'Congés équipe à valider', sous: 'Les demandes en attente de votre équipe.', icone: CalendarDays, couleur: '#f59e0b',
        tuiles: [{ icone: CalendarDays, titre: 'En attente', valeur: congesAttenteListe.filter((c) => dansEquipe(c.employeId)).length }],
        lignes: congesAttenteListe.filter((c) => dansEquipe(c.employeId)).map(ligneConge), vide: 'Aucune demande en attente.', lien: { to: '/rh/conges', label: 'Ouvrir les congés' } },
      equipePointage: { titre: 'Anomalies de pointage', sous: "Retards et absences d'aujourd'hui dans votre équipe.", icone: Clock, couleur: '#dc2626',
        tuiles: [{ icone: Clock, titre: 'Retards', valeur: equipe.retards, couleur: '#f59e0b' }, { icone: UserX, titre: 'Absents', valeur: equipe.absents, couleur: '#dc2626' }],
        lignes: presEquipe.filter((p) => p.statut === 'retard' || p.statut === 'absent').map(lignePresence), vide: "Aucune anomalie aujourd'hui.", lien: { to: '/rh/presences', label: 'Ouvrir les présences' } }
    }
    return { fiches, absents: [...absents.values()], anciennete, contratsASurveiller, congesPrevus, parDepartement, paie5, retard, perso, equipe }
  }, [employes, presences, conges, bulletins, contrats, formations, evaluations, taches, today, user])

  return (
    <div className="space-y-5">
      <PageHeader icon={LayoutDashboard} titre="Tableau de Bord RH" sousTitre="Vue globale d'administration des ressources humaines, paie et conformité."
        action={<>
          <OngletsBande options={VUES.map((v) => ({ id: v.id, label: v.label }))} valeur={vue} onChange={setVue} taille="sm" />
          <Link to="/rh/employes" className="inline-flex items-center gap-1.5 rounded-2xl border border-white bg-white px-3.5 py-2 text-xs font-extrabold text-[color:var(--bv)] shadow-md transition-all hover:-translate-y-0.5"><Users size={15} /> Nouvel Employé</Link>
        </>} />

      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Périmètre : {perimetre}</p>

      {vue === 'admin' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Effectif Actif" value={kpi.actifs} sub={`sur ${kpi.total} répertorié(s)`} accent="#0284c7" icon={Users} onClick={() => setOuvert('effectif')} />
          <StatCard title="Présences du Jour" value={kpi.presToday} sub={`${kpi.retards} retard(s) • ${kpi.absents} absent(s)`} accent="#16a34a" icon={CalendarCheck} onClick={() => setOuvert('presences')} />
          <StatCard title="Congés à Traiter" value={kpi.congesAttente} sub="À valider par RH/Manager" accent="#f59e0b" icon={CalendarDays} onClick={() => setOuvert('conges')} />
          <StatCard title="Paie du Mois" value={formatMoney(kpi.masseSalariale)} sub={`Coût employeur : ${formatMoney(kpi.coutEmployeur)}`} accent="#7c3aed" icon={Receipt} onClick={() => setOuvert('paie')} />
          <StatCard title="Échéances CDD" value={kpi.cddProches.length} sub="Fins de contrat < 30 jours" accent="#dc2626" icon={FileText} onClick={() => setOuvert('cdd')} />
          <StatCard title="Bulletins à Valider" value={kpi.bulletinsAValider} sub={`sur ${kpi.nbBulletins} bulletin(s) du mois`} accent="#0d9488" icon={BadgeCheck} onClick={() => setOuvert('bulletins')} />
        </div>
      )}

      {vue === 'admin' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <EffectifAnneauCarte parDepartement={details.parDepartement} rang={0} />
          <ListeCarte rang={1} icone={UserX} couleur="#dc2626" titre="Absents aujourd'hui" sous="Absences et congés en cours" lignes={details.absents} vide="Personne n'est absent aujourd'hui." />
          <ListeCarte rang={2} icone={PartyPopper} couleur="#f59e0b" titre="Ancienneté à fêter" sous="Anniversaires d'embauche des 7 prochains jours" lignes={details.anciennete} vide="Aucun anniversaire d'embauche cette semaine." />
          <ListeCarte rang={3} icone={ShieldAlert} couleur="#ea580c" titre="Contrats à surveiller" sous="Fins de CDD, essais en cours, dossiers incomplets" lignes={details.contratsASurveiller} vide="Aucun contrat à surveiller." max={6} />
          <ListeCarte rang={4} icone={Plane} couleur="#0284c7" titre="Congés prévus ce mois-ci" sous="Congés approuvés, en cours ou à venir" lignes={details.congesPrevus} vide="Aucun congé prévu ce mois-ci." />
          <ListeCarte rang={5} icone={TrendingUp} couleur="#0d9488" titre="Paie des mois précédents" sous="Total brut des 5 derniers mois (le mois en cours est dans « Paie du mois »)" lignes={details.paie5} vide="" max={5} />
          <ListeCarte rang={6} icone={GraduationCap} couleur="#16a34a" titre="Formations et évaluations en retard" sous="Formations passées non commencées, évaluations de l'année" lignes={details.retard} vide="Rien en retard." />
        </div>
      )}

      {vue === 'manager' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard title="Congés Équipe à Valider" value={details.equipe.congesAttente} sub="Demandes en attente" accent="#f59e0b" icon={CalendarDays} onClick={() => setOuvert('equipeConges')} />
            <StatCard title="Anomalies de Pointage" value={details.equipe.retards + details.equipe.absents} sub={`${details.equipe.retards} retard(s) • ${details.equipe.absents} absent(s)`} accent="#dc2626" icon={Clock} onClick={() => setOuvert('equipePointage')} />
            <StatCard title="Effectif de l'Équipe" value={details.equipe.effectif} sub={details.equipe.departement ? `Département : ${details.equipe.departement}` : 'Collaborateurs actifs'} accent="#0284c7" icon={Users} onClick={() => setOuvert('equipeEffectif')} />
          </div>
          {!details.equipe.departement && (
            <p className="text-xs text-gray-500">Votre compte n'est pas rattaché à une fiche employé avec un département : les chiffres couvrent toute l'organisation.</p>
          )}
          <Card title="Actions de Pilotage d'Équipe">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ActionTile to="/rh/organigramme" icon={Users} label="Organigramme" />
              <ActionTile to="/rh/evaluations" icon={ListChecks} label="Évaluations Équipe" />
              <ActionTile to="/rh/competences" icon={Award} label="GPEC & Compétences" />
              <ActionTile to="/rh/onboarding" icon={Receipt} label="Onboarding Membres" />
            </div>
          </Card>
        </>
      )}

      <DetailKpiModal fiche={ouvert ? details.fiches[ouvert] : null} onClose={() => setOuvert(null)} />

      {vue === 'employe' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Mon Solde de Congés" value={details.perso ? `${details.perso.solde} j` : '—'} sub={details.perso ? `sur ${DROIT_CONGE_ANNUEL} jours, ${details.perso.pris} pris cette année` : 'Compte non rattaché'} accent="#0284c7" icon={CalendarDays} onClick={() => navigate('/rh/conges')} />
            <StatCard title="Mon Dernier Bulletin" value={details.perso?.dernier ? formatMoney(details.perso.dernier.net) : '—'} sub={details.perso?.dernier ? `Net à payer · ${MOIS_LABELS[Number(details.perso.dernier.mois.slice(5, 7)) - 1]} ${details.perso.dernier.mois.slice(0, 4)}` : 'Aucun bulletin pour le moment'} accent="#7c3aed" icon={Receipt} onClick={() => navigate('/rh/paie')} />
            <StatCard title="Mes Tâches du Jour" value={details.perso ? details.perso.mesTaches : '—'} sub={details.perso ? (details.perso.enRetard ? `dont ${details.perso.enRetard} en retard` : "à faire d'ici ce soir") : 'Compte non rattaché'} accent="#f59e0b" icon={ListChecks} onClick={() => navigate('/rh/taches')} />
          </div>
          {!details.perso && (
            <p className="rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
              Votre compte n'est pas encore rattaché à une fiche employé. Demandez à l'administration RH de le faire dans « Rattachement des comptes ».
            </p>
          )}
          <Card title="Actions rapides (Self-Service)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ActionTile to="/rh/conges" icon={CalendarDays} label="Poser une demande" />
              <ActionTile to="/rh/paie" icon={Receipt} label="Voir mon bulletin" />
              <ActionTile to="/rh/presences" icon={Clock} label="Pointer arrivée/départ" />
              <ActionTile to="/rh/impacts" icon={Award} label="Publier une reconnaissance" />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function ActionTile({ to, icon: Icon, label }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 p-3 text-center text-xs font-semibold text-gray-600 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
      <Icon size={18} className="text-sky-500" /> {label}
    </Link>
  )
}
