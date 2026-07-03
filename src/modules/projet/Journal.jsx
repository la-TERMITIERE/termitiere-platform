// Journal d'activité + Commentaires — module Projet.
import { useMemo, useState } from 'react'
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

const EVENTS = {
  projet_cree:       { label: 'Projet créé',       emoji: '📁' },
  projet_modifie:    { label: 'Projet modifié',     emoji: '✏️' },
  projet_supprime:   { label: 'Projet supprimé',    emoji: '🗑️' },
  tache_creee:       { label: 'Tâche créée',        emoji: '✅' },
  tache_modifiee:    { label: 'Tâche modifiée',     emoji: '✏️' },
  tache_supprimee:   { label: 'Tâche supprimée',    emoji: '🗑️' },
  document_ajoute:   { label: 'Document ajouté',    emoji: '📎' },
  photo_ajoutee:     { label: 'Photo ajoutée',      emoji: '📷' },
  depense_ajoutee:   { label: 'Dépense enregistrée',emoji: '💰' },
  checklist_cree:    { label: 'Checklist créée',    emoji: '☑️' },
  rapport_pdf_genere:{ label: 'Rapport PDF généré', emoji: '📄' },
  commentaire_ajoute:{ label: 'Commentaire ajouté', emoji: '💬' }
}
const ACTIONS_PROJET = new Set(Object.keys(EVENTS))

// ─── Onglet Journal ───────────────────────────────────────────────────────────

function OngletJournal() {
  const { data: events } = useCollection('audit_global')
  const [search, setSearch] = useState('')

  const liste = useMemo(() =>
    events
      .filter((e) => ACTIONS_PROJET.has(e.action))
      .filter((e) => !search || JSON.stringify(e).toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0))
      .slice(0, 100),
  [events, search])

  return (
    <div className="space-y-4">
      <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        placeholder="Rechercher dans le journal…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {!liste.length ? (
        <Card><p className="py-10 text-center text-sm text-gray-400">Aucune activité enregistrée.</p></Card>
      ) : (
        <div className="space-y-2">
          {liste.map((e, i) => {
            const ev = EVENTS[e.action] || { label: e.action, emoji: '•' }
            return (
              <div key={e.id || i} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
                <span className="text-base">{ev.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-700">{ev.label}</p>
                  {e.data?.nom   && <p className="text-xs text-gray-500">{e.data.nom}</p>}
                  {e.data?.titre && <p className="text-xs text-gray-500">{e.data.titre}</p>}
                  <p className="text-[10px] text-gray-400">
                    {e.userEmail || e.userId || 'Système'} · {formatDateTime(e.timestamp || e.createdAt)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Onglet Commentaires ──────────────────────────────────────────────────────

function OngletCommentaires() {
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
    if (!texte.trim() || !projetId) return
    setSending(true)
    try {
      await addItem('projet_commentaires', {
        projetId, texte: texte.trim(),
        auteur: user?.nom || user?.login || 'Anonyme',
        role:   user?.role || '',
        userId: user?.uid || null
      })
      await audit('projet', 'commentaire_ajoute', projetActif?.nom || projetId)
      setTexte('')
    } finally { setSending(false) }
  }

  const supprimer = async (c) => {
    if (!window.confirm('Supprimer ce commentaire ?')) return
    await removeItem('projet_commentaires', c.id)
  }

  return (
    <div className="space-y-4">
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
              <textarea rows={2}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                placeholder="Note d'avancement… (Ctrl+Entrée pour envoyer)"
                value={texte} onChange={(e) => setTexte(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) envoyer() }}
              />
              <Button onClick={envoyer} disabled={sending || !texte.trim()} size="sm">
                <Send size={14} className="mr-1" />{sending ? '…' : 'Envoyer'}
              </Button>
            </div>
          )}
        </div>
      </Card>

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

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Journal() {
  const [onglet, setOnglet] = useState('journal')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {[
          { id: 'journal',      label: '📋 Journal d\'activité' },
          { id: 'commentaires', label: '💬 Commentaires'        }
        ].map((o) => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${onglet === o.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'journal' ? <OngletJournal /> : <OngletCommentaires />}
    </div>
  )
}
