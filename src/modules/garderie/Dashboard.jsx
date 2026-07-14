import { useMemo, useState, useEffect } from 'react'
import { Baby, Users, CreditCard, AlertTriangle, UserCheck, Clock, ShieldAlert, BellRing, ChevronRight } from 'lucide-react'
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
    () => enfants.filter((e) => !deletedEnfantIds.has(e.id) && e.statut !== 'supprime'),
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

  const incidentsAccent = urgences.length > 0 ? '#1A1A1A' : alertes.length > 0 ? '#E8390E' : '#F5A800'

  return (
    <div className="space-y-5">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,57,14,0.35),0_8px_20px_-8px_rgba(232,57,14,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.85) 0%, rgba(245,168,0,0.8) 100%)' }}>
        {/* Logo garderie dans un cercle avec bordure blanche fixe (pas d'animation) */}
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <img src="/garderie-logo.png" alt="Garderie La Termitière"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              objectFit: 'cover', background: 'white', padding: 4,
              boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55',
              display: 'block'
            }} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold drop-shadow">{params.nom}</h2>
          <p className="text-sm text-orange-50/90">
            Enfants · Personnel · Présences · Paiements · Incidents — {formatDateShort(today)}
          </p>
        </div>
      </div>

      {/* KPIs — verre dépoli, même disposition qu'avant (4 tuiles égales), couleurs du logo + ombres douces */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          onClick={() => setModal('enfants')}
          className="card group flex w-full items-center gap-4 rounded-3xl border border-white/50 bg-white/40 p-4 text-left shadow-[0_24px_48px_-16px_rgba(26,26,26,0.18),0_6px_16px_-6px_rgba(26,26,26,0.08),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:-translate-y-1 hover:shadow-[0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: '#E8390E1a', color: '#E8390E' }}>
            <Baby size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Enfants inscrits</p>
            <p className="text-2xl font-extrabold text-[#1A1A1A]">{enfantsVisibles.filter((e) => e.statut === 'actif').length}</p>
            <p className="mt-0.5 truncate text-xs text-[#1A1A1A]/40">+ {journaliersAujourdhui.length} journalier(s) aujourd'hui</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-[#1A1A1A]/20 transition-colors group-hover:text-[#1A1A1A]/50" />
        </button>

        <button
          onClick={() => setModal('presences')}
          className="card group flex w-full items-center gap-4 rounded-3xl border border-white/50 bg-white/40 p-4 text-left shadow-[0_24px_48px_-16px_rgba(26,26,26,0.18),0_6px_16px_-6px_rgba(26,26,26,0.08),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:-translate-y-1 hover:shadow-[0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: '#F5A8001a', color: '#F5A800' }}>
            <UserCheck size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Présents aujourd'hui</p>
            <p className="text-2xl font-extrabold text-[#1A1A1A]">{stats.presents}</p>
            <p className="mt-0.5 truncate text-xs text-[#1A1A1A]/40">{stats.absents} absent(s) · {stats.excuses} excusé(s){journaliersAujourdhui.length > 0 ? ` · ${journaliersAujourdhui.length} journalier(s)` : ''}</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-[#1A1A1A]/20 transition-colors group-hover:text-[#1A1A1A]/50" />
        </button>

        <button
          onClick={() => setModal('impayes')}
          className="card group flex w-full items-center gap-4 rounded-3xl border border-white/50 bg-white/40 p-4 text-left shadow-[0_24px_48px_-16px_rgba(26,26,26,0.18),0_6px_16px_-6px_rgba(26,26,26,0.08),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:-translate-y-1 hover:shadow-[0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: '#E8390E1a', color: '#E8390E' }}>
            <CreditCard size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Impayés ce mois</p>
            <p className="text-2xl font-extrabold text-[#1A1A1A]">{enfantsNonPayes.length}</p>
            <p className="mt-0.5 truncate text-xs text-[#1A1A1A]/40">{enfantsNonPayes.filter(e => e._raisonImpaye === 'impaye').length} déclaré(s) · {enfantsNonPayes.filter(e => e._raisonImpaye === 'non_renouvele').length} non renouvelé(s)</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-[#1A1A1A]/20 transition-colors group-hover:text-[#1A1A1A]/50" />
        </button>

        <button
          onClick={() => setModal('incidents')}
          className="card group flex w-full items-center gap-4 rounded-3xl border border-white/50 bg-white/40 p-4 text-left shadow-[0_24px_48px_-16px_rgba(26,26,26,0.18),0_6px_16px_-6px_rgba(26,26,26,0.08),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:-translate-y-1 hover:shadow-[0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: incidentsAccent + '1a', color: incidentsAccent }}>
            {alarmsActives.length > 0 ? <ShieldAlert size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Incidents ouverts</p>
            <p className="text-2xl font-extrabold text-[#1A1A1A]">{incidents.filter((i) => !i.resolu).length}</p>
            <p className="mt-0.5 truncate text-xs text-[#1A1A1A]/40">
              {alarmsActives.length > 0
                ? `${urgences.length > 0 ? `🔴 ${urgences.length} urgence(s)` : ''} ${alertes.length > 0 ? `🟠 ${alertes.length} alerte(s)` : ''} ${surveillances.length > 0 ? `🟡 ${surveillances.length}` : ''}`.trim()
                : 'aucune alarme active'}
            </p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-[#1A1A1A]/20 transition-colors group-hover:text-[#1A1A1A]/50" />
        </button>
      </div>

      {/* ── Alerte renouvellement paiement (compact) ── */}
      {enfantsNonPayes.length > 0 && (
        <button
          onClick={() => setModal('impayes')}
          className="w-full rounded-2xl border px-4 py-3 text-left shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150 transition-colors"
          style={{ borderColor: '#E8390E4d', background: '#E8390E14' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="shrink-0" style={{ color: '#E8390E' }} />
            <div>
              <p className="font-bold text-sm" style={{ color: '#E8390E' }}>
                ⚠️ {enfantsNonPayes.length} enfant{enfantsNonPayes.length > 1 ? 's' : ''} non à jour ce mois
              </p>
              <p className="text-xs" style={{ color: '#E8390Ecc' }}>Cette alerte disparaît automatiquement dès que le paiement est enregistré · Cliquez pour régler</p>
            </div>
          </div>
        </button>
      )}

      {/* ── Alerte soldes partiels après le 15 ── */}
      {enfantsPartielsNonSoldes.length > 0 && (
        <button
          onClick={() => navigate('/garderie/paiements')}
          className="w-full rounded-2xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 text-left shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150 transition-colors hover:bg-amber-50/70">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-700 text-sm">
                🟡 {enfantsPartielsNonSoldes.length} enfant{enfantsPartielsNonSoldes.length > 1 ? 's' : ''} n'a pas soldé ce mois (après le 15)
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {enfantsPartielsNonSoldes.map((e) => (
                  <span key={e.id} className="rounded-full border border-amber-300/70 bg-amber-100/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
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
          className="w-full rounded-2xl border border-orange-200/60 bg-orange-50/50 px-4 py-3 text-left shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150 transition-colors hover:bg-orange-50/70">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-orange-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-orange-700 text-sm">
                🟠 {enfantsAbsentsRepetes.length} enfant{enfantsAbsentsRepetes.length > 1 ? 's' : ''} absent{enfantsAbsentsRepetes.length > 1 ? 's' : ''} sans justification depuis {params.seuilAbsences ?? 3}+ jours
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {enfantsAbsentsRepetes.map((e) => (
                  <span key={e.id} className="rounded-full border border-orange-300/70 bg-orange-100/70 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
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
          className="flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150 transition-colors"
          style={{ borderColor: '#F5A8004d', background: '#F5A80014' }}>
          <span className="text-lg shrink-0">🍼</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold" style={{ color: '#8a5c00' }}>
              Biberon requis pour {rappelsNourrissons.length} nourrisson{rappelsNourrissons.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-2 mt-0.5">
              {rappelsNourrissons.map((e) => (
                <span key={e.id} className="text-[10px] font-semibold" style={{ color: '#a3720a' }}>
                  {e.prenom} {e.dernierBiberon ? `(dernier : ${e.dernierBiberon})` : '(aucun aujourd\'hui)'}
                </span>
              ))}
            </div>
          </div>
          <span className="text-xs shrink-0" style={{ color: '#c99128' }}>→ Cantine</span>
        </button>
      )}

      {/* ── Bandeau alarmes incidents ── */}
      {alarmsActives.length > 0 && (
        <button
          onClick={() => { setModal(null); navigate('/garderie/incidents') }}
          className="w-full rounded-2xl border-2 px-4 py-3 text-left shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150 transition-colors"
          style={{
            borderColor: incidentsAccent + '80',
            background: incidentsAccent + '14',
            animation: urgences.length > 0 ? 'pulse 1.5s infinite' : 'none'
          }}>
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="shrink-0 mt-0.5" style={{ color: incidentsAccent }} />
            <div className="flex-1">
              <p className="font-bold text-sm flex items-center gap-2" style={{ color: incidentsAccent }}>
                {urgences.length > 0 && `⚫ ${urgences.length} URGENCE(S)`}
                {alertes.length > 0 && `  🟠 ${alertes.length} ALERTE(S)`}
                {surveillances.length > 0 && `  🟡 ${surveillances.length} SURVEILLANCE(S)`}
              </p>
              <p className="text-xs mt-0.5" style={{ color: incidentsAccent + 'cc' }}>
                Ces alarmes disparaîtront uniquement quand les incidents seront résolus · Cliquez pour gérer
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {alarmsActives.map((i) => {
                  const c = (i.alarme || 0) === 3 ? '#1A1A1A' : (i.alarme || 0) === 2 ? '#E8390E' : '#F5A800'
                  return (
                    <span key={i.id} className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                      style={{ background: c + '1a', borderColor: c + '55', color: c }}>
                      {(i.alarme || 0) === 3 ? '⚫' : (i.alarme || 0) === 2 ? '🟠' : '🟡'} {i.enfantNom}
                    </span>
                  )
                })}
              </div>
            </div>
            <BellRing size={16} className="shrink-0" style={{ color: incidentsAccent + 'aa' }} />
          </div>
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Présences du jour */}
        <div className="rounded-3xl border border-white/50 bg-white/40 p-4 shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 md:p-5 lg:col-span-2">
          <h3 className="mb-3 text-base font-bold text-[#1A1A1A]">Présences du jour</h3>
          {presentsAujourdhui.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucun enfant actif enregistré.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1">
              {presentsAujourdhui.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-2xl bg-white/50 px-3 py-2 text-sm">
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
        </div>

        {/* Répartition par groupe */}
        <div className="rounded-3xl border border-white/50 bg-white/40 p-4 shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 md:p-5">
          <h3 className="mb-3 text-base font-bold text-[#1A1A1A]">Groupes d'âge</h3>
          <div className="space-y-2">
            {parGroupe.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-2xl bg-orange-50/60 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-orange-900">{g.label}</p>
                  <p className="text-xs text-orange-500">{g.desc}</p>
                </div>
                <span className="text-xl font-extrabold text-orange-700">{g.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Personnel du jour */}
        <div className="rounded-3xl border border-white/50 bg-white/40 p-4 shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 md:p-5">
          <h3 className="mb-3 text-base font-bold text-[#1A1A1A]">Personnel — pointage du jour</h3>
          {personnelAujourdhui.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucun membre du personnel actif.</p>
          ) : (
            <div className="space-y-1">
              {personnelAujourdhui.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white/50 px-3 py-2 text-sm">
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
        </div>

        {/* Incidents récents */}
        <div className="rounded-3xl border border-white/50 bg-white/40 p-4 shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 md:p-5">
          <h3 className="mb-3 text-base font-bold text-[#1A1A1A]">Incidents récents</h3>
          {incidentsRecents.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucun incident enregistré.</p>
          ) : (
            <div className="space-y-1">
              {incidentsRecents.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-2xl bg-white/50 px-3 py-2 text-sm">
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
        </div>
      </div>

      {/* ── Modal : Enfants inscrits + journaliers ── */}
      <Modal
        open={modal === 'enfants'}
        onClose={() => setModal(null)}
        title="Enfants du jour"
        size="lg"
        panelClassName="bg-gradient-to-br from-orange-200/85 via-orange-100/75 to-amber-300/75 backdrop-blur-2xl backdrop-saturate-200"
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
        panelClassName="bg-gradient-to-br from-orange-200/85 via-orange-100/75 to-amber-300/75 backdrop-blur-2xl backdrop-saturate-200"
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
        panelClassName="bg-gradient-to-br from-orange-200/85 via-orange-100/75 to-amber-300/75 backdrop-blur-2xl backdrop-saturate-200"
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
        panelClassName="bg-gradient-to-br from-orange-200/85 via-orange-100/75 to-amber-300/75 backdrop-blur-2xl backdrop-saturate-200"
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
