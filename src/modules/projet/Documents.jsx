// Documents — pièces jointes par projet.
import { useState, useMemo, useEffect } from 'react'
import { FileText, Search } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { STATUTS_PROJET } from './data'
import { useAuthStore } from '../../core/auth'
import { marquerVoletVu } from './vues'

const RUBRIQUES = [
  { id: 'cahier_charges', label: 'Cahier des charges' },
  { id: 'contrat',        label: 'Contrat / Accord'   },
  { id: 'rapport',        label: 'Rapport'             },
  { id: 'devis',          label: 'Devis / Facture'     },
  { id: 'plan',           label: 'Plan / Schéma'       },
  { id: 'autre',          label: 'Autre'               }
]

// ─── Onglet Documents ─────────────────────────────────────────────────────────

function OngletDocuments({ projets, taches }) {
  const [search, setSearch]       = useState('')
  const [projetSel, setProjetSel] = useState(null)
  const [saving, setSaving]       = useState(false)

  const liste = useMemo(() =>
    projets.filter((p) => !search || p.nom?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
  [projets, search])

  const totalDocs = useMemo(() =>
    projets.reduce((s, p) => s + (p.pieces?.length || 0), 0) +
    taches.reduce((s, t) => s + (t.pieces?.length || 0), 0),
  [projets, taches])

  const handleAdd = async (piece) => {
    if (!projetSel) return
    setSaving(true)
    try {
      const pieces = [...(projetSel.pieces || []), { ...piece, id: `pj_${Date.now()}` }]
      await updateItem('projets', projetSel.id, { pieces, updatedAt: Date.now() })
      setProjetSel((p) => ({ ...p, pieces }))
      await audit('projet', 'document_ajoute', `${piece.nom} → ${projetSel.nom}`)
    } finally { setSaving(false) }
  }

  const handleRemove = async (piece) => {
    if (!projetSel) return
    if (!window.confirm(`Supprimer "${piece.nom}" ?`)) return
    const pieces = (projetSel.pieces || []).filter((p) => p.id !== piece.id)
    await updateItem('projets', projetSel.id, { pieces, updatedAt: Date.now() })
    setProjetSel((p) => ({ ...p, pieces }))
  }

  const projetSelFrais = projetSel ? (projets.find((p) => p.id === projetSel.id) || projetSel) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-teal-50 px-4 py-3">
        <FileText size={20} className="text-teal-600" />
        <div>
          <p className="text-sm font-semibold text-teal-800">{totalDocs} document{totalDocs !== 1 ? 's' : ''} attaché{totalDocs !== 1 ? 's' : ''}</p>
          <p className="text-xs text-teal-600">PDF, images, contrats, plans…</p>
        </div>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Rechercher un projet…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!liste.length ? (
        <Card><p className="py-10 text-center text-sm text-gray-400">Aucun projet trouvé.</p></Card>
      ) : (
        <div className="space-y-2">
          {liste.map((p) => {
            const nbDocs = (p.pieces || []).length
            const tachesDuProjet = taches.filter((t) => t.projetId === p.id && (t.pieces?.length || 0) > 0)
            const nbTacheDocs = tachesDuProjet.reduce((s, t) => s + (t.pieces?.length || 0), 0)
            return (
              <Card key={p.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-800 truncate">{p.nom}</p>
                      <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {nbDocs} doc{nbDocs !== 1 ? 's' : ''} projet
                      {nbTacheDocs > 0 && ` · ${nbTacheDocs} doc${nbTacheDocs !== 1 ? 's' : ''} tâches`}
                    </p>
                  </div>
                  <Button size="sm" variant={nbDocs > 0 ? 'default' : 'ghost'} onClick={() => setProjetSel(p)}>
                    <FileText size={13} className="mr-1" />
                    {nbDocs > 0 ? `${nbDocs} fichier${nbDocs > 1 ? 's' : ''}` : 'Ajouter'}
                  </Button>
                </div>
                {tachesDuProjet.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    {tachesDuProjet.map((t) => (
                      <div key={t.id} className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="mb-1 text-xs font-semibold text-gray-600">Tâche : {t.titre}</p>
                        <PiecesJointes pieces={t.pieces || []} readOnly />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={!!projetSel} onClose={() => setProjetSel(null)} size="lg" title={`Documents — ${projetSelFrais?.nom || ''}`}>
        {projetSelFrais && (
          <div className="space-y-4">
            <PiecesJointes pieces={projetSelFrais.pieces || []} onAdd={handleAdd} onRemove={handleRemove} rubriques={RUBRIQUES} label="Fichiers du projet" />
            <div className="flex justify-end pt-1">
              <Button variant="ghost" onClick={() => setProjetSel(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Documents() {
  const { data: projets } = useCollection('projets')
  const { data: taches }  = useCollection('projet_taches')
  const { user } = useAuthStore()
  useEffect(() => { marquerVoletVu(user?.uid, 'projetDocuments') }, [user?.uid])

  return <OngletDocuments projets={projets} taches={taches} />
}
