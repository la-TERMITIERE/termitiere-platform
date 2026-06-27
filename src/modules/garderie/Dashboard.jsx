import { useMemo, useState } from 'react'
import { Baby, Users, CreditCard, AlertTriangle, UserCheck, Clock } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useGarderieStore } from './store/garderieStore'
import { STATUTS_PRESENCE, GRAVITES_INCIDENT, GROUPES_AGE } from './data'
import { statsPresencesJour, calcAge, aImpayes } from './logic'
import { formatDateShort, todayStr } from '../../utils/formatters'

export default function Dashboard() {
  const { data: enfants }    = useCollection('garderie_enfants')
  const { data: presences }  = useCollection('garderie_presences')
  const { data: personnel }  = useCollection('garderie_personnel')
  const { data: paiements }  = useCollection('garderie_paiements')
  const { data: incidents }  = useCollection('garderie_incidents')
  const params = useGarderieStore((s) => s.params)

  const today = todayStr()

  const presencesAujourdhui = useMemo(
    () => presences.filter((p) => p.date === today),
    [presences, today]
  )
  const personnelAujourdhui = useMemo(
    () => personnel.filter((p) => p.statut === 'actif').map((p) => {
      const pointage = presences.find((pr) => pr.personnelId === p.id && pr.date === today)
      return { ...p, pointage }
    }),
    [personnel, presences, today]
  )

  const stats = useMemo(() => statsPresencesJour(presencesAujourdhui, enfants), [presencesAujourdhui, enfants])

  const enfantsAvecImpayes = useMemo(
    () => enfants.filter((e) => e.statut === 'actif' && aImpayes(paiements, e.id)),
    [enfants, paiements]
  )

  const incidentsRecents = useMemo(
    () => [...incidents].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5),
    [incidents]
  )

  const parGroupe = useMemo(() => {
    const actifs = enfants.filter((e) => e.statut === 'actif')
    return GROUPES_AGE.map((g) => ({
      ...g,
      count: actifs.filter((e) => e.groupe === g.id).length
    }))
  }, [enfants])

  const presentsAujourdhui = useMemo(
    () => {
      const actifs = enfants.filter((e) => e.statut === 'actif')
      return actifs.map((e) => {
        const p = presencesAujourdhui.find((pr) => pr.enfantId === e.id)
        return { ...e, presence: p || null }
      })
    },
    [enfants, presencesAujourdhui]
  )

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-4 text-white flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, #E8390E 0%, #F5A800 100%)' }}>
        <img src="/garderie-logo.png" alt="Garderie La Termitière"
          className="h-16 w-auto object-contain rounded-lg bg-white p-1 shadow" />
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
          value={enfants.filter((e) => e.statut === 'actif').length}
          icon={Baby} accent="#E8390E"
          sub={`/ ${params.capaciteMax} places`}
        />
        <StatCard
          title="Présents aujourd'hui"
          value={stats.presents}
          icon={UserCheck} accent="#16a34a"
          sub={`${stats.absents} absent(s) · ${stats.excuses} excusé(s)`}
        />
        <StatCard
          title="Impayés ce mois"
          value={enfantsAvecImpayes.length}
          icon={CreditCard} accent="#dc2626"
          sub="enfants concernés"
        />
        <StatCard
          title="Incidents ouverts"
          value={incidents.filter((i) => !i.resolu).length}
          icon={AlertTriangle} accent="#d97706"
          sub="non résolus"
        />
      </div>

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

      {/* Impayés */}
      {enfantsAvecImpayes.length > 0 && (
        <Card title="⚠️ Enfants avec impayés ce mois">
          <div className="flex flex-wrap gap-2">
            {enfantsAvecImpayes.map((e) => (
              <span key={e.id} className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                {e.prenom} {e.nom}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
