// Documents — pièces jointes par projet.
// Sélection du projet via menu déroulant, filtre par rubrique, légende/commentaire
// optionnel à l'ajout d'un fichier (pour aider la direction à s'y retrouver).
import { useState, useMemo, useEffect } from 'react'
import { FileText, FolderKanban, Filter, ChevronDown, FolderOpen } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { useAuthStore } from '../../core/auth'
import { marquerVoletVu } from './vues'
import { projetsVisibles, scopeParProjets } from './logic'
import { STATUTS_PROJET } from './data'

const RUBRIQUES = [
  { id: 'cahier_charges', label: 'Cahier des charges' },
  { id: 'contrat',        label: 'Contrat / Accord'   },
  { id: 'rapport',        label: 'Rapport'             },
  { id: 'devis',          label: 'Devis / Facture'     },
  { id: 'plan',           label: 'Plan / Schéma'       },
  { id: 'autre',          label: 'Autre'               }
]

export default function Documents() {
  const { data: projetsTous } = useCollection('projets')
  const { data: tachesTous }  = useCollection('projet_taches')
  const { user, role } = useAuthStore()
  // Le superviseur ajoute/consulte des documents, mais ne les supprime pas.
  const peutSupprimer = role !== 'superviseur'
  useEffect(() => { marquerVoletVu(user?.uid, 'projetDocuments') }, [user?.uid])

  // Cloisonnement : un chef de projet ne voit que ses projets et leurs tâches.
  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const taches  = useMemo(() => scopeParProjets(tachesTous, projets), [tachesTous, projets])

  const [projetId, setProjetId]   = useState('')
  const [filtreRub, setFiltreRub] = useState('')

  const totalDocs = useMemo(() =>
    projets.reduce((s, p) => s + (p.pieces?.length || 0), 0) +
    taches.reduce((s, t) => s + (t.pieces?.length || 0), 0),
  [projets, taches])

  const projet = useMemo(() => projets.find((p) => p.id === projetId) || null, [projets, projetId])
  const tachesDuProjet = useMemo(() =>
    projet ? taches.filter((t) => t.projetId === projet.id && (t.pieces?.length || 0) > 0) : [],
  [taches, projet])

  const piecesFiltrees = useMemo(() =>
    (projet?.pieces || []).filter((p) => !filtreRub || p.rubrique === filtreRub),
  [projet, filtreRub])

  const handleAdd = async (piece) => {
    if (!projet) return
    const pieces = [...(projet.pieces || []), { ...piece, id: `pj_${Date.now()}` }]
    await updateItem('projets', projet.id, { pieces, updatedAt: Date.now() })
    await audit('projet', 'document_ajoute', `${piece.nom} → ${projet.nom}`)
  }

  const handleRemove = async (piece) => {
    if (!peutSupprimer || !projet) return
    if (!window.confirm(`Supprimer "${piece.nom}" ?`)) return
    const pieces = (projet.pieces || []).filter((p) => p.id !== piece.id)
    await updateItem('projets', projet.id, { pieces, updatedAt: Date.now() })
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),0_8px_20px_-8px_rgba(13,148,136,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.85) 0%, rgba(15,84,80,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0d9488', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <FileText size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Documents</h2>
          <p className="text-sm text-white/80">{totalDocs} document{totalDocs !== 1 ? 's' : ''} attaché{totalDocs !== 1 ? 's' : ''} — PDF, images, contrats, plans</p>
        </div>
      </div>

      {/* Sélection du projet + filtre par rubrique */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 focus-within:ring-2 focus-within:ring-teal-400">
            <FolderKanban size={16} className="shrink-0 text-teal-500" />
            <select className="w-full bg-transparent text-sm focus:outline-none"
              value={projetId} onChange={(e) => setProjetId(e.target.value)}>
              <option value="">— Choisir un projet —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          {projet && (
            <>
              <Badge tone={STATUTS_PROJET[projet.statut]?.tone}>{STATUTS_PROJET[projet.statut]?.label}</Badge>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 focus-within:ring-2 focus-within:ring-teal-400">
                <Filter size={14} className="shrink-0 text-gray-400" />
                <select className="bg-transparent text-sm focus:outline-none"
                  value={filtreRub} onChange={(e) => setFiltreRub(e.target.value)}>
                  <option value="">Toutes les rubriques</option>
                  {RUBRIQUES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <ChevronDown size={12} className="pointer-events-none text-gray-400" />
              </div>
            </>
          )}
        </div>
      </Card>

      {!projet ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <FolderOpen size={36} className="opacity-30" />
            <p className="text-sm">Sélectionnez un projet pour voir ou ajouter ses documents.</p>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <PiecesJointes
              pieces={piecesFiltrees}
              onAdd={handleAdd}
              onRemove={handleRemove}
              noDelete={!peutSupprimer}
              rubriques={RUBRIQUES}
              label={`Documents — ${projet.nom}`}
              withLegende
            />
          </Card>

          {tachesDuProjet.length > 0 && (
            <Card title="Documents attachés aux tâches de ce projet">
              <div className="space-y-3">
                {tachesDuProjet.map((t) => (
                  <div key={t.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="mb-1.5 text-xs font-semibold text-gray-600">📋 {t.titre}</p>
                    <PiecesJointes pieces={t.pieces || []} readOnly />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
