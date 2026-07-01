import { useMemo, useState, useEffect } from 'react'
import { Baby, Users, CreditCard, AlertTriangle, UserCheck, Clock, ShieldAlert, BellRing } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useGarderieStore } from './store/garderieStore'
import { STATUTS_PRESENCE, GRAVITES_INCIDENT, GROUPES_AGE } from './data'
import { statsPresencesJour, calcAge, aImpayes, journaliersActifsSurDate, enfantsSansRenouvellement, journaliersActifsSurDate as _jsd } from './logic'

// Âge en mois depuis la date de naissance
function ageMoisDash(dateNaissance) {
  if (!dateNaissance) return null
  const n = new Date(dateNaissance), now = new Date()
  return (now.getFullYear() - n.getFullYear()) * 12 + (now.getMonth() - n.getMonth())
}
// Intervalle biberon recommandé en minutes
function intervalleBiberon(mois) {
  if (mois < 2) return 120
  if (mois < 4) return 180
  return 210
}
import { formatDateShort, todayStr } from '../../utils/formatters'
import { useNavigate } from 'react-router-dom'

// modal ouvert : null | 'enfants' | 'presences' | 'impayes' | 'incidents'
export default function Dashboard() {
  const { data: enfants }    = useCollection('garderie_enfants')
  const { data: presences }  = useCollection('garderie_presences')
  const { data: personnel }  = useCollection('garderie_personnel')
  const { data: paiements }  = useCollection('garderie_paiements')
  const { data: incidents }  = useCollection('garderie_incidents')
  const { data: journaliers } = useCollection('garderie_journaliers')
  const { data: nutrition }  = useCollection('garderie_nutrition')
  const params = useGarderieStore((s) => s.params)
  const deletedEnfantIds = useGarderieStore((s) => s.deletedEnfantIds)

  const today = todayStr()
  const navigate = useNavigate()

  const [modal, setModal] = useState(null)
  const [heureNow, setHeureNow] = useState(new Date().toTimeString().slice(0, 5))

  // Mise à jour chaque minute pour les rappels nourrissons
  useEffect(() => {
    const t = setInterval(() => setHeureNow(new Date().toTimeString().slice(0, 5)), 60000)
    return () => clearInterval(t)
  }, [])

  const enfantsVisibles = useMemo(
    () => enfants.filter((e) => !deletedEnfantIds.has(e.id)),
    [enfants, deletedEnfantIds]
  )

  const journaliersAujourdhui = useMemo(
    () => journaliersActifsSurDate(journaliers, today),
    [journaliers, today]
  )

  const presencesAujourdhui = useMemo(
    () => presences.filter((p) => p.date === today && p.enfantId && !p.personnelId),
    [presences, today]
  )
  const personnelAujourdhui = useMemo(
    () => personnel.filter((p) => p.statut === 'actif').map((p) => {
      const pointage = presences.find((pr) => pr.personnelId === p.id && pr.date === today)
      return { ...p, pointage }
    }),
    [personnel, presences, today]
  )

  // Stats globales : inscrits pointés + journaliers réellement pointés aujourd'hui
  const stats = useMemo(() => {
    const base = statsPresencesJour(presencesAujourdhui, enfantsVisibles)
    // Journaliers comptés uniquement s'ils ont une présence avec statut 'present'
    const joPresents = journaliersAujourdhui.filter((j) =>
      presences.some((p) => p.journalierId === j.id && p.date === today && p.statut === 'present')
    ).length
    return {
      ...base,
      presents: base.presents + joPresents,
      total: base.total + journaliersAujourdhui.length
    }
  }, [presencesAujourdhui, enfantsVisibles, journaliersAujourdhui, presences, today])

  const incidentsRecents = useMemo(
    () => [...incidents].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5),
    [incidents]
  )

  const sansRenouvellement = useMemo(
    () => enfantsSansRenouvellement(enfantsVisibles, paiements, presences),
    [enfantsVisibles, paiements, presences]
  )

  // ── Rappels nourrissons ──
  const rappelsNourrissons = useMemo(() => {
    const [hA, mA] = heureNow.split(':').map(Number)
    const maintenant = hA * 60 + mA
    const [hO, mO] = (params.heureOuverture  || '07:00').split(':').map(Number)
    const [hF, mF] = (params.heureFermeture || '18:00').split(':').map(Number)
    const ouverture = hO * 60 + mO
    const fermeture = hF * 60 + mF
    if (maintenant < ouverture || maintenant >= fermeture) return []

    // Enfants présents aujourd'hui
    const presentsIds = new Set(
      presences.filter((p) => p.date === today && p.enfantId && p.statut === 'present').map((p) => p.enfantId)
    )

    return enfants.filter((e) => {
      if (e.statut !== 'actif' || deletedEnfantIds.has(e.id)) return false
      if (!presentsIds.has(e.id)) return false
      // Détection nourrisson
      const m = ageMoisDash(e.dateNaissance)
      if (m !== null && m >= 6) return false
      if (m === null && e.groupe !== 'nourrisson') return false
      // Vérifier si biberon nécessaire
      const mois = m ?? 3
      const intervalle = intervalleBiberon(mois)
      const biberons = nutrition.filter((n) => n.date === today && n.enfantId === e.id && n.type === 'biberon')
      if (biberons.length === 0) return true // aucun biberon aujourd'hui
      const dernierHeure = biberons.sort((a, b) => a.heure > b.heure ? 1 : -1).slice(-1)[0]?.heure
      if (!dernierHeure) return true
      const [dH, dM] = dernierHeure.split(':').map(Number)
      const ecoulé = maintenant - (dH * 60 + dM)
      return ecoulé >= intervalle
    }).map((e) => {
      const biberons = nutrition.filter((n) => n.date === today && n.enfantId === e.id && n.type === 'biberon')
      return { ...e, dernierBiberon: biberons.length > 0 ? biberons.sort((a,b) => a.heure > b.heure ? 1:-1).slice(-1)[0]?.heure : null }
    })
  }, [enfants, presences, nutrition, today, deletedEnfantIds, params, heureNow])

  // ── Soldes partiels après le 15 du mois ──────────────────────────────────
  const enfantsPartielsNonSoldes = useMemo(() => {
    const jourDuMois = new Date().getDate()
    if (jourDuMois < 15) return [] // alerte inactive avant le 15

    const moisCourant = today.slice(0, 7) // "YYYY-MM"
    return enfantsVisibles
      .filter((e) => e.statut === 'actif')
      .map((e) => {
        const p = paiements.find(
          (p) => p.enfantId === e.id &&
          `${p.annee}-${String(p.mois).padStart(2, '0')}` === moisCourant &&
          p.statut === 'partiel'
        )
        if (!p) return null
        const reste = (Number(p.montantDu) || 0) - (Number(p.montantPaye) || 0)
        return reste > 0 ? { ...e, reste, montantPaye: p.montantPaye, montantDu: p.montantDu } : null
      })
      .filter(Boolean)
  }, [enfantsVisibles, paiements, today])

  // ── Absences répétées sans justification ─────────────────────────────────
  const enfantsAbsentsRepetes = useMemo(() => {
    const seuil = Number(params.seuilAbsences) || 3
    return enfantsVisibles
      .filter((e) => e.statut === 'actif')
      .map((e) => {
        // Remonter les X derniers jours calendaires (hors aujourd'hui)
        let consecutifs = 0
        for (let j = 1; j <= 30; j++) {
          const d = new Date()
          d.setDate(d.getDate() - j)
          const dateStr = d.toISOString().slice(0, 10)
          const p = presences.find((pr) => pr.enfantId === e.id && pr.date === dateStr && !pr.personnelId)
          if (p && p.statut === 'absent') {
            consecutifs++
          } else if (p && p.statut !== 'absent') {
            break // présent ou excusé — on arrête
          }
          // pas de pointage = on ne compte pas (jour non ouvert possible)
          else if (!p) {
            break
          }
        }
        return consecutifs >= seuil ? { ...e, joursAbsents: consecutifs } : null
      })
      .filter(Boolean)
  }, [enfantsVisibles, presences, params])

  // Alarmes actives : incidents non résolus avec alarme > 0, triés par niveau décroissant
  const alarmsActives = useMemo(
    () => incidents
      .filter((i) => !i.resolu && (i.alarme || 0) > 0)
      .sort((a, b) => (b.alarme || 0) - (a.alarme || 0)),
    [incidents]
  )
  const urgences = alarmsActives.filter((i) => (i.alarme || 0) === 3)
  const alertes  = alarmsActives.filter((i) => (i.alarme || 0) === 2)
  const surveillances = alarmsActives.filter((i) => (i.alarme || 0) === 1)

  // Tous les enfants qui n'ont pas payé : impayé déclaré OU pas de renouvellement ce mois
  const enfantsNonPayes = useMemo(() => {
    const avecImpaye = enfantsVisibles.filter((e) => e.statut === 'actif' && aImpayes(paiements, e.id))
    // Fusionner sans doublons (un enfant peut être dans les deux listes)
    const ids = new Set(avecImpaye.map((e) => e.id))
    const nonRenouveles = sansRenouvellement.filter((e) => !ids.has(e.id))
    return [
      ...avecImpaye.map((e) => ({ ...e, _raisonImpaye: 'impaye' })),
      ...nonRenouveles.map((e) => ({ ...e, _raisonImpaye: 'non_renouvele' }))
    ]
  }, [enfantsVisibles, paiements, sansRenouvellement])

  const parGroupe = useMemo(() => {
    const actifs = enfantsVisibles.filter((e) => e.statut === 'actif')
    return GROUPES_AGE.map((g) => ({
      ...g,
      count: actifs.filter((e) => e.groupe === g.id).length
    }))
  }, [enfantsVisibles])

  const presentsAujourdhui = useMemo(
    () => {
      const actifs = enfantsVisibles.filter((e) => e.statut === 'actif')
      return actifs.map((e) => {
        const p = presencesAujourdhui.find((pr) => pr.enfantId === e.id)
        return { ...e, presence: p || null }
      })
    },
    [enfantsVisibles, presencesAujourdhui]
  )

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-4 text-white flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, #E8390E 0%, #F5A800 100%)' }}>
        {/* Logo garderie dans un cercle avec bordure qui pulse */}
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <style>{`
            @keyframes gard-glow {
              0%   { box-shadow: 0 0 0 2px #F5A800aa, 0 0 6px 2px #E8390E33; }
              50%  { box-shadow: 0 0 0 4px #F5A800,   0 0 12px 4px #E8390E66; }
              100% { box-shadow: 0 0 0 2px #F5A800aa, 0 0 6px 2px #E8390E33; }
            }
          `}</style>
          <img src="/garderie-logo.png" alt="Garderie La Termitière"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              objectFit: 'cover', background: 'white', padding: 4,
              animation: 'gard-glow 2.5s ease-in-out infinite',
              display: 'block'
            }} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold drop-shadow">{params.nom}</h2>
          <p className="text-sm text-orange-100">
            Enfants · Personnel · Présences · Paiements · Incidents — {formatDateShort(today)}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Enfants inscrits"
          value={enfantsVisibles.filter((e) => e.statut === 'actif').length}
          icon={Baby} accent="#E8390E"
          sub={`+ ${journaliersAujourdhui.length} journalier(s) aujourd'hui`}
          onClick={() => setModal('enfants')}
        />
        <StatCard
          title="Présents aujourd'hui"
          value={stats.presents}
          icon={UserCheck} accent="#16a34a"
          sub={`${stats.absents} absent(s) · ${stats.excuses} excusé(s)${journaliersAujourdhui.length > 0 ? ` · ${journaliersAujourdhui.length} journalier(s)` : ''}`}
          onClick={() => setModal('presences')}
        />
        <StatCard
          title="Impayés ce mois"
          value={enfantsNonPayes.length}
          icon={CreditCard} accent="#dc2626"
          sub={`${enfantsNonPayes.filter(e => e._raisonImpaye === 'impaye').length} déclaré(s) · ${enfantsNonPayes.filter(e => e._raisonImpaye === 'non_renouvele').length} non renouvelé(s)`}
          onClick={() => setModal('impayes')}
        />
        <StatCard
          title="Incidents ouverts"
          value={incidents.filter((i) => !i.resolu).length}
          icon={alarmsActives.length > 0 ? ShieldAlert : AlertTriangle}
          accent={urgences.length > 0 ? '#dc2626' : alertes.length > 0 ? '#ea580c' : '#d97706'}
          sub={alarmsActives.length > 0
            ? `${urgences.length > 0 ? `🔴 ${urgences.length} urgence(s)` : ''} ${alertes.length > 0 ? `🟠 ${alertes.length} alerte(s)` : ''} ${surveillances.length > 0 ? `🟡 ${surveillances.length}` : ''}`.trim()
            : 'aucune alarme active'}
          onClick={() => setModal('incidents')}
        />
      </div>

      {/* ── Alerte renouvellement paiement (compact) ── */}
      {enfantsNonPayes.length > 0 && (
        <button
          onClick={() => setModal('impayes')}
          className="w-full rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-left hover:bg-red-100 transition-colors">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-500 shrink-0" />
            <div>
              <p className="font-bold text-red-700 text-sm">
                ⚠️ {enfantsNonPayes.length} enfant{enfantsNonPayes.length > 1 ? 's' : ''} non à jour ce mois
              </p>
              <p className="text-xs text-red-500">Cette alerte disparaît automatiquement dès que le paiement est enregistré · Cliquez pour régler</p>
            </div>
          </div>
        </button>
      )}

      {/* ── Alerte soldes partiels après le 15 ── */}
      {enfantsPartielsNonSoldes.length > 0 && (
        <button
          onClick={() => navigate('/garderie/paiements')}
          className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition-colors">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-700 text-sm">
                🟡 {enfantsPartielsNonSoldes.length} enfant{enfantsPartielsNonSoldes.length > 1 ? 's' : ''} n'a pas soldé ce mois (après le 15)
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {enfantsPartielsNonSoldes.map((e) => (
                  <span key={e.id} className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    {e.prenom} {e.nom} — reste {Number(e.reste).toLocaleString('fr-FR')} FCFA
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-500 mt-1">Cliquez pour accéder aux paiements</p>
            </div>
          </div>
        </button>
      )}

      {/* ── Alerte absences répétées ── */}
      {enfantsAbsentsRepetes.length > 0 && (
        <button
          onClick={() => navigate('/garderie/presences')}
          className="w-full rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-left hover:bg-orange-100 transition-colors">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-orange-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-orange-700 text-sm">
                🟠 {enfantsAbsentsRepetes.length} enfant{enfantsAbsentsRepetes.length > 1 ? 's' : ''} absent{enfantsAbsentsRepetes.length > 1 ? 's' : ''} sans justification depuis {params.seuilAbsences ?? 3}+ jours
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {enfantsAbsentsRepetes.map((e) => (
                  <span key={e.id} className="rounded-full bg-orange-100 border border-orange-300 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
                    {e.prenom} {e.nom} — {e.joursAbsents}j consécutifs
                  </span>
                ))}
              </div>
              <p className="text-xs text-orange-500 mt-1">Cliquez pour voir les présences</p>
            </div>
          </div>
        </button>
      )}

      {/* ── Rappels nourrissons ── */}
      {rappelsNourrissons.length > 0 && (
        <button
          onClick={() => navigate('/garderie/cantine')}
          className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-left hover:bg-blue-100 transition-colors flex items-center gap-3">
          <span className="text-lg shrink-0">🍼</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-blue-700">
              Biberon requis pour {rappelsNourrissons.length} nourrisson{rappelsNourrissons.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-2 mt-0.5">
              {rappelsNourrissons.map((e) => (
                <span key={e.id} className="text-[10px] text-blue-600 font-semibold">
                  {e.prenom} {e.dernierBiberon ? `(dernier : ${e.dernierBiberon})` : '(aucun aujourd\'hui)'}
                </span>
              ))}
            </div>
          </div>
          <span className="text-xs text-blue-400 shrink-0">→ Cantine</span>
        </button>
      )}

      {/* ── Bandeau alarmes incidents ── */}
      {alarmsActives.length > 0 && (
        <button
          onClick={() => { setModal(null); navigate('/garderie/incidents') }}
          className="w-full rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-left hover:bg-red-100 transition-colors"
          style={{ animation: urgences.length > 0 ? 'pulse 1.5s infinite' : 'none' }}>
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-red-700 text-sm flex items-center gap-2">
                {urgences.length > 0 && `🔴 ${urgences.length} URGENCE(S)`}
                {alertes.length > 0 && `  🟠 ${alertes.length} ALERTE(S)`}
                {surveillances.length > 0 && `  🟡 ${surveillances.length} SURVEILLANCE(S)`}
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                Ces alarmes disparaîtront uniquement quand les incidents seront résolus · Cliquez pour gérer
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {alarmsActives.map((i) => (
                  <span key={i.id} className={`rounded-full px-2 py-0.5 text-xs font-semibold border ${
                    (i.alarme || 0) === 3 ? 'bg-red-100 border-red-300 text-red-800' :
                    (i.alarme || 0) === 2 ? 'bg-orange-100 border-orange-300 text-orange-800' :
                    'bg-yellow-100 border-yellow-300 text-yellow-800'
                  }`}>
                    {(i.alarme || 0) === 3 ? '🔴' : (i.alarme || 0) === 2 ? '🟠' : '🟡'} {i.enfantNom}
                  </span>
                ))}
              </div>
            </div>
            <BellRing size={16} className="text-red-400 shrink-0" />
          </div>
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Présences du jour */}
        <Card title="Présences du jour" className="lg:col-span-2">
          {presentsAujourdhui.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucun enfant actif enregistré.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1">
              {presentsAujourdhui.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold">{e.prenom} {e.nom}</span>
                    <span className="ml-2 text-xs text-gray-400">{calcAge(e.dateNaissance)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.presence ? (
                      <>
                        {e.presence.heureArrivee && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock size={12} /> {e.presence.heureArrivee}
                          </span>
                        )}
                        <Badge tone={STATUTS_PRESENCE[e.presence.statut]?.tone}>
                          {STATUTS_PRESENCE[e.presence.statut]?.label}
                        </Badge>
                      </>
                    ) : (
                      <Badge tone="neutral">Non pointé</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Répartition par groupe */}
        <Card title="Groupes d'âge">
          <div className="space-y-2">
            {parGroupe.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg bg-orange-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-orange-900">{g.label}</p>
                  <p className="text-xs text-orange-500">{g.desc}</p>
                </div>
                <span className="text-xl font-extrabold text-orange-700">{g.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Personnel du jour */}
        <Card title="Personnel — pointage du jour">
          {personnelAujourdhui.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucun membre du personnel actif.</p>
          ) : (
            <div className="space-y-1">
              {personnelAujourdhui.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold">{p.prenom} {p.nom}</span>
                    <span className="ml-2 text-xs text-gray-400">{p.poste}</span>
                  </div>
                  {p.pointage ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock size={12} /> {p.pointage.heureArrivee || '—'}
                      {p.pointage.heureDepart && <span>→ {p.pointage.heureDepart}</span>}
                      <Badge tone="success">Présent</Badge>
                    </div>
                  ) : (
                    <Badge tone="neutral">Non pointé</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Incidents récents */}
        <Card title="Incidents récents">
          {incidentsRecents.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucun incident enregistré.</p>
          ) : (
            <div className="space-y-1">
              {incidentsRecents.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold">{i.enfantNom || '—'}</p>
                    <p className="text-xs text-gray-500">{i.type} · {formatDateShort(i.date)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge tone={GRAVITES_INCIDENT[i.gravite]?.tone}>{GRAVITES_INCIDENT[i.gravite]?.label}</Badge>
                    {i.resolu && <Badge tone="success">Résolu</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>


      {/* ── Modal : Enfants inscrits + journaliers ── */}
      <Modal
        open={modal === 'enfants'}
        onClose={() => setModal(null)}
        title="Enfants du jour"
        size="lg"
      >
        <div className="space-y-3">
          {/* Inscrits */}
          <p className="text-xs font-bold uppercase text-gray-500">Enfants inscrits actifs</p>
          {enfantsVisibles.filter((e) => e.statut === 'actif').length === 0 ? (
            <p className="text-sm text-gray-400">Aucun enfant actif.</p>
          ) : (
            <div className="space-y-2">
              {enfantsVisibles.filter((e) => e.statut === 'actif').map((e) => (
                <div key={e.id} className={`rounded-lg px-3 py-2 text-sm border ${e.allergies ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{e.prenom} {e.nom}</span>
                      <span className="text-xs text-gray-400">{calcAge(e.dateNaissance)}</span>
                      {e.groupe && <span className="text-xs text-orange-600 font-medium">{GROUPES_AGE.find((g) => g.id === e.groupe)?.label}</span>}
                    </div>
                    <Badge tone={e.typeAbonnement === 'annuel' ? 'neutral' : 'success'}>
                      {e.typeAbonnement === 'annuel' ? 'Annuel' : 'Mensuel'}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                    {e.parentNom && <span>👤 {e.parentNom}</span>}
                    {e.parentContact && <span>📞 {e.parentContact}</span>}
                  </div>
                  {e.allergies && (
                    <p className="mt-1 text-xs font-semibold text-orange-700">
                      ⚠️ Allergie : {e.allergies}
                    </p>
                  )}
                  {e.infoMedicale && (
                    <p className="mt-0.5 text-xs text-red-600">
                      🏥 {e.infoMedicale}
                    </p>
                  )}
                  {!e.allergies && (
                    <p className="mt-0.5 text-xs text-green-600">✓ Pas d'allergie connue</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* Journaliers du jour */}
          {journaliersAujourdhui.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase text-orange-500 mt-2">🚪 Journaliers présents aujourd'hui</p>
              <div className="space-y-2">
                {journaliersAujourdhui.map((j) => (
                  <div key={j.id} className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{j.prenom} {j.nom}</span>
                        {j.ageApprox && <span className="text-xs text-gray-400">~{j.ageApprox}</span>}
                      </div>
                      <Badge tone="warning">
                        {j.nombreJours > 1
                          ? `Jour ${Math.floor((new Date(today) - new Date(j.date)) / 86400000) + 1}/${j.nombreJours}`
                          : 'Journalier'}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                      {j.parentNom && (
                        <span className="flex items-center gap-1">👤 {j.parentNom}</span>
                      )}
                      {j.parentContact && (
                        <span className="flex items-center gap-1">📞 {j.parentContact}</span>
                      )}
                      {j.date && (
                        <span className="flex items-center gap-1">📅 Depuis le {formatDateShort(j.date)}</span>
                      )}
                      {j.notes && (
                        <span className="italic text-gray-400">{j.notes}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Modal : Présents aujourd'hui ── */}
      <Modal
        open={modal === 'presences'}
        onClose={() => setModal(null)}
        title={`Présences du jour — ${formatDateShort(today)}`}
        size="lg"
      >
        {presentsAujourdhui.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun enfant actif enregistré.</p>
        ) : (
          <div className="space-y-1">
            {presentsAujourdhui.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold">{e.prenom} {e.nom}</span>
                  <span className="ml-2 text-xs text-gray-400">{calcAge(e.dateNaissance)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {e.presence?.heureArrivee && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock size={12} /> {e.presence.heureArrivee}
                    </span>
                  )}
                  {e.presence ? (
                    <Badge tone={STATUTS_PRESENCE[e.presence.statut]?.tone}>
                      {STATUTS_PRESENCE[e.presence.statut]?.label}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Non pointé</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ── Modal : Impayés ce mois ── */}
      <Modal
        open={modal === 'impayes'}
        onClose={() => setModal(null)}
        title={`💰 Enfants non à jour — ${enfantsNonPayes.length} concerné(s)`}
        size="md"
      >
        {enfantsNonPayes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Tous les enfants sont à jour ce mois. ✓</p>
        ) : (
          <div className="space-y-3">
            {/* Paiements déclarés impayés */}
            {enfantsNonPayes.filter(e => e._raisonImpaye === 'impaye').length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase text-red-600 mb-1">Paiement enregistré comme impayé</p>
                <div className="space-y-1">
                  {enfantsNonPayes.filter(e => e._raisonImpaye === 'impaye').map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm">
                      <div>
                        <span className="font-semibold text-red-800">{e.prenom} {e.nom}</span>
                        {e.groupe && <span className="ml-2 text-xs text-gray-400">{GROUPES_AGE.find((g) => g.id === e.groupe)?.label}</span>}
                        {e.parentNom && <p className="text-xs text-gray-400 mt-0.5">👤 {e.parentNom} {e.parentContact ? `· ${e.parentContact}` : ''}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="danger">Impayé</Badge>
                        <button onClick={() => { setModal(null); navigate('/garderie/paiements') }}
                          className="rounded-lg bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700">
                          Payer →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Présents sans renouvellement */}
            {enfantsNonPayes.filter(e => e._raisonImpaye === 'non_renouvele').length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase text-orange-600 mb-1">Présents ce mois sans paiement renouvelé</p>
                <div className="space-y-1">
                  {enfantsNonPayes.filter(e => e._raisonImpaye === 'non_renouvele').map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm">
                      <div>
                        <span className="font-semibold text-orange-800">{e.prenom} {e.nom}</span>
                        {e.groupe && <span className="ml-2 text-xs text-gray-400">{GROUPES_AGE.find((g) => g.id === e.groupe)?.label}</span>}
                        {e.parentNom && <p className="text-xs text-gray-400 mt-0.5">👤 {e.parentNom} {e.parentContact ? `· ${e.parentContact}` : ''}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="warning">Non renouvelé</Badge>
                        <button onClick={() => { setModal(null); navigate('/garderie/paiements') }}
                          className="rounded-lg bg-orange-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-orange-600">
                          Renouveler →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal : Incidents ouverts ── */}
      <Modal
        open={modal === 'incidents'}
        onClose={() => setModal(null)}
        title="Incidents ouverts (non résolus)"
        size="lg"
      >
        {incidents.filter((i) => !i.resolu).length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun incident ouvert.</p>
        ) : (
          <>
          <p className="text-xs text-gray-400 mb-2">Cliquez sur un enfant pour voir l'incident dans le module.</p>
          <div className="space-y-1">
            {incidents
              .filter((i) => !i.resolu)
              .sort((a, b) => (b.alarme || 0) - (a.alarme || 0) || (b.createdAt || 0) - (a.createdAt || 0))
              .map((i) => (
                <button
                  key={i.id}
                  onClick={() => { setModal(null); navigate('/garderie/incidents') }}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-left transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer border ${
                    (i.alarme || 0) === 3 ? 'bg-red-50 border-red-200 hover:bg-red-100' :
                    (i.alarme || 0) === 2 ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' :
                    'bg-gray-50 border-transparent hover:bg-gray-100'
                  }`}>
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      {(i.alarme || 0) === 3 && <span>🔴</span>}
                      {(i.alarme || 0) === 2 && <span>🟠</span>}
                      {(i.alarme || 0) === 1 && <span>🟡</span>}
                      {i.enfantNom || '—'}
                    </p>
                    <p className="text-xs text-gray-500">{i.type} · {formatDateShort(i.date)}</p>
                    {i.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{i.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Badge tone={GRAVITES_INCIDENT[i.gravite]?.tone}>
                      {GRAVITES_INCIDENT[i.gravite]?.label}
                    </Badge>
                    <span className="text-xs text-gray-400">→</span>
                  </div>
                </button>
              ))}
          </div>
          </>
        )}
      </Modal>
    </div>
  )
}
