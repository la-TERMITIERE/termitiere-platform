// Commentaires & journal de bord par projet.
import { useState, useMemo } from 'react'
import { Send, Trash2, MessageSquare } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, removeItem } from '../../core/db'
import { useAuth } from '../../hooks/useAuth'
import { STATUTS_PROJET } from './data'
import { formatDateTime } from '../../utils/formatters'
import { audit } from '../../core/audit'

export default function Commentaires() {
  const { data: projets }      = useCollection('projets')
  const { data: commentaires } = useCollection('projet_commentaires')
  const { user } = useAuth()

  const [projetId, setProjetId] = useState('')
  const [texte, setTexte]       = useState('')
  const [sending, setSending]   = useState(false)

  const projetActif = useMemo(() => projets.find((p) => p.id === projetId), [projets, projetId])

  const liste = useMemo(() =>
    commentaires
      .filter((c) => !projetId || c.projetId === projetId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  [commentaires, projetId])

  const envoyer = async () => {
    if (!texte.trim()) return
    if (!projetId) { return }
    setSending(true)
    try {
      await addItem('projet_commentaires', {
        projetId,
        texte:    texte.trim(),
        auteur:   user?.nom || user?.login || 'Anonyme',
        role:     user?.role || '',
        userId:   user?.uid || null
      })
      await audit('projet', 'commentaire_ajoute', projetActif?.nom || projetId)
      setTexte('')
    } finally { setSending(false) }
  }

  const supprimer = async (c) => {
    if (!window.confirm('Supprimer ce commentaire ?')) return
    await removeItem('projet_commentaires', c.id)
  }

  const onKey = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) envoyer() }

  return (
    <div className="space-y-4">
      {/* Sélecteur projet */}
      <Card>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Projet</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={projetId} onChange={(e) => setProjetId(e.target.value)}>
              <option value="">— Tous les projets —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>

          {projetId && (
            <div className="flex gap-2">
              <textarea
                rows={2}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                placeholder="Écrivez une note d'avancement… (Ctrl+Entrée pour envoyer)"
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                onKeyDown={onKey}
              />
              <Button onClick={envoyer} disabled={sending || !texte.trim()} size="sm">
                <Send size={14} className="mr-1" />
                {sending ? '…' : 'Envoyer'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Liste commentaires */}
      {!liste.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <MessageSquare size={32} className="opacity-30" />
            <p className="text-sm">Aucun commentaire{projetId ? ' sur ce projet' : ''}.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {liste.map((c) => {
            const projet = projets.find((p) => p.id === c.projetId)
            const estMoi = c.userId && c.userId === user?.uid
            return (
              <div key={c.id} className={`flex gap-3 rounded-xl border px-4 py-3 ${estMoi ? 'border-teal-100 bg-teal-50' : 'border-gray-100 bg-white'}`}>
                {/* Avatar initiales */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: estMoi ? '#0d9488' : '#94a3b8' }}>
                  {(c.auteur || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">{c.auteur}</span>
                    {c.role && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{c.role}</span>}
                    {projet && <Badge tone={STATUTS_PROJET[projet.statut]?.tone}>{projet.nom}</Badge>}
                    <span className="text-[10px] text-gray-400">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{c.texte}</p>
                </div>
                {estMoi && (
                  <button onClick={() => supprimer(c)} className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
