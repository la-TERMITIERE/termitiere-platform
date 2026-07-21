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
  // Accès complet pour la secrétaire/l'agent, sauf la suppression (réservée).
  const peutSupprimer = !['superviseur', 'partenaire', 'secretaire', 'agent'].includes(role)
  useEffect(() => { marquerVoletVu(user?.uid, 'projetDocuments') }, [user?.uid])

  // Cloisonnement : un chef de projet ne voit que ses projets et leurs tâches.
  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const taches  = useMemo(() => scopeParProjets(tachesTous, projets), [tachesTous, projets])

  const [projetId, setProjetId]   = useState('')
  const [tacheIdAjout, setTacheIdAjout] = useState('')
  const [filtreRub, setFiltreRub] = useState('')

  const totalDocs = useMemo(() =>
    projets.reduce((s, p) => s + (p.pieces?.length || 0), 0) +
    taches.reduce((s, t) => s + (t.pieces?.length || 0), 0),
  [projets, taches])

  const projet = useMemo(() => projets.find((p) => p.id === projetId) || null, [projets, projetId])
  // Toutes les tâches du projet (pas seulement celles qui ont déjà des documents) —
  // pour pouvoir choisir sur laquelle rattacher un nouveau document, comme pour les besoins.
  const tachesDuProjetToutes = useMemo(() =>
    projet ? taches.filter((t) => t.projetId === projet.id) : [],
  [taches, projet])
  const tacheAjout = useMemo(() =>
    tachesDuProjetToutes.find((t) => t.id === tacheIdAjout) || null,
  [tachesDuProjetToutes, tacheIdAjout])
  // Tâches qui ont déjà des documents, affichées en dessous — sauf celle actuellement
  // sélectionnée dans le sélecteur d'ajout (déjà montrée dans le bloc principal).
  const tachesDuProjet = useMemo(() =>
    tachesDuProjetToutes.filter((t) => t.id !== tacheIdAjout && (t.pieces?.length || 0) > 0),
  [tachesDuProjetToutes, tacheIdAjout])

  const piecesFiltrees = useMemo(() =>
    ((tacheAjout ? tacheAjout.pieces : projet?.pieces) || []).filter((p) => !filtreRub || p.rubrique === filtreRub),
  [projet, tacheAjout, filtreRub])

  // Vue globale (aucun projet sélectionné) : tous les documents déjà ajoutés,
  // groupés par projet — pour les avoir sous les yeux dès l'ouverture du volet.
  const projetsAvecDocs = useMemo(() =>
    projets
      .map((p) => ({
        ...p,
        piecesProjet: (p.pieces || []).filter((pc) => !filtreRub || pc.rubrique === filtreRub),
        tachesAvecDocs: taches
          .filter((t) => t.projetId === p.id)
          .map((t) => ({ ...t, pieces: (t.pieces || []).filter((pc) => !filtreRub || pc.rubrique === filtreRub) }))
          .filter((t) => t.pieces.length > 0)
      }))
      .filter((p) => p.piecesProjet.length > 0 || p.tachesAvecDocs.length > 0),
  [projets, taches, filtreRub])

  const handleAdd = async (piece) => {
    if (!projet) return
    if (tacheAjout) {
      const pieces = [...(tacheAjout.pieces || []), { ...piece, id: `pj_${Date.now()}` }]
      await updateItem('projet_taches', tacheAjout.id, { pieces, updatedAt: Date.now() })
      await audit('projet', 'document_ajoute', `${piece.nom} → ${projet.nom} / ${tacheAjout.titre}`)
    } else {
      const pieces = [...(projet.pieces || []), { ...piece, id: `pj_${Date.now()}` }]
      await updateItem('projets', projet.id, { pieces, updatedAt: Date.now() })
      await audit('projet', 'document_ajoute', `${piece.nom} → ${projet.nom}`)
    }
  }

  // Suppression générique (utilisée aussi bien depuis la vue détail que depuis la
  // vue globale et le bloc "documents des autres tâches", où aucun projet/tâche
  // n'est "actif" dans le formulaire).
  const supprimerPieceProjet = async (p, piece) => {
    if (!peutSupprimer) return
    if (!window.confirm(`Supprimer "${piece.nom}" ?`)) return
    const pieces = (p.pieces || []).filter((pc) => pc.id !== piece.id)
    await updateItem('projets', p.id, { pieces, updatedAt: Date.now() })
  }
  const supprimerPieceTache = async (t, piece) => {
    if (!peutSupprimer) return
    if (!window.confirm(`Supprimer "${piece.nom}" ?`)) return
    const pieces = (t.pieces || []).filter((pc) => pc.id !== piece.id)
    await updateItem('projet_taches', t.id, { pieces, updatedAt: Date.now() })
  }

  const handleRemove = async (piece) => {
    if (!projet) return
    if (tacheAjout) await supprimerPieceTache(tacheAjout, piece)
    else await supprimerPieceProjet(projet, piece)
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
              value={projetId} onChange={(e) => { setProjetId(e.target.value); setTacheIdAjout('') }}>
              <option value="">— Choisir un projet —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          {projet && <Badge tone={STATUTS_PROJET[projet.statut]?.tone}>{STATUTS_PROJET[projet.statut]?.label}</Badge>}
          {projet && tachesDuProjetToutes.length > 0 && (
            <div className="flex min-w-[200px] items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 focus-within:ring-2 focus-within:ring-teal-400">
              <select className="w-full bg-transparent text-sm focus:outline-none"
                value={tacheIdAjout} onChange={(e) => setTacheIdAjout(e.target.value)}>
                <option value="">— Documents généraux du projet —</option>
                {tachesDuProjetToutes.map((t) => <option key={t.id} value={t.id}>📋 {t.titre}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 focus-within:ring-2 focus-within:ring-teal-400">
            <Filter size={14} className="shrink-0 text-gray-400" />
            <select className="bg-transparent text-sm focus:outline-none"
              value={filtreRub} onChange={(e) => setFiltreRub(e.target.value)}>
              <option value="">Toutes les rubriques</option>
              {RUBRIQUES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <ChevronDown size={12} className="pointer-events-none text-gray-400" />
          </div>
        </div>
      </Card>

      {!projet ? (
        projetsAvecDocs.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
              <FolderOpen size={36} className="opacity-30" />
              <p className="text-sm">Aucun document ajouté pour l'instant. Sélectionnez un projet pour en ajouter.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {projetsAvecDocs.map((p) => (
              <Card key={p.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <FolderKanban size={15} className="shrink-0 text-teal-500" />
                  <button onClick={() => setProjetId(p.id)} className="text-sm font-bold text-gray-800 hover:text-teal-600 hover:underline">{p.nom}</button>
                  <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label}</Badge>
                </div>
                {p.piecesProjet.length > 0 && (
                  <PiecesJointes pieces={p.piecesProjet} noAdd noDelete={!peutSupprimer}
                    onRemove={(piece) => supprimerPieceProjet(p, piece)} label="Documents du projet" />
                )}
                {p.tachesAvecDocs.map((t) => (
                  <div key={t.id} className="mt-2 rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="mb-1.5 text-xs font-semibold text-gray-600">📋 {t.titre}</p>
                    <PiecesJointes pieces={t.pieces} noAdd noDelete={!peutSupprimer}
                      onRemove={(piece) => supprimerPieceTache(t, piece)} />
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )
      ) : (
        <>
          <Card>
            <PiecesJointes
              pieces={piecesFiltrees}
              onAdd={handleAdd}
              onRemove={handleRemove}
              noDelete={!peutSupprimer}
              rubriques={RUBRIQUES}
              label={tacheAjout ? `Documents — ${projet.nom} / ${tacheAjout.titre}` : `Documents — ${projet.nom}`}
              withLegende
            />
          </Card>

          {tachesDuProjet.length > 0 && (
            <Card title="Documents attachés aux autres tâches de ce projet">
              <div className="space-y-3">
                {tachesDuProjet.map((t) => (
                  <div key={t.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="mb-1.5 text-xs font-semibold text-gray-600">📋 {t.titre}</p>
                    <PiecesJointes pieces={t.pieces || []} noAdd noDelete={!peutSupprimer}
                      onRemove={(piece) => supprimerPieceTache(t, piece)} />
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
