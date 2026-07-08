// Gestionnaire de pièces jointes (PDF / images) réutilisable.
// Découplé du stockage : le parent fournit `pieces` et les callbacks onAdd/onRemove.
// Les fichiers images sont compressés ; tout est encodé en data URL (cf. utils/fichiers).
import { useRef, useState } from 'react'
import { Paperclip, Eye, Trash2, Loader2, FileText, Image as ImageIcon } from 'lucide-react'
import { lireFichier, ouvrirPiece, formatTaille } from '../../utils/fichiers'
import { toast } from '../../core/notifications'

export default function PiecesJointes({ pieces = [], onAdd, onRemove, readOnly = false, label = 'Pièces jointes', rubriques = null, withProprietaire = false }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [rubrique, setRubrique] = useState('')
  const [rubriqueLibre, setRubriqueLibre] = useState(false)
  const [proprietaire, setProprietaire] = useState('')

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy(true)
    try {
      for (const f of files) {
        try {
          const piece = await lireFichier(f)
          await onAdd?.({ ...piece, rubrique: rubrique || '', proprietaire: proprietaire.trim() })
        } catch (e) {
          toast.error(`${f.name} : ${e.message}`)
        }
      }
    } finally {
      setBusy(false)
      setProprietaire('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase text-gray-500">{label}</span>
        {!readOnly && rubriques?.length > 0 && (
          rubriqueLibre ? (
            <input value={rubrique} onChange={(e) => setRubrique(e.target.value)}
              autoFocus placeholder="Nom de la rubrique…"
              className="rounded border border-teal-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" />
          ) : (
            <select value={rubrique}
              onChange={(e) => {
                if (e.target.value === '__libre__') { setRubriqueLibre(true); setRubrique('') }
                else setRubrique(e.target.value)
              }}
              className="rounded border border-gray-200 px-2 py-1 text-xs">
              <option value="">— Rubrique —</option>
              {rubriques.map((r) => <option key={r.id || r} value={r.id || r}>{r.label || r}</option>)}
              <option value="__libre__">✏️ Saisir une rubrique…</option>
            </select>
          )
        )}
        {!readOnly && withProprietaire && (
          <input value={proprietaire} onChange={(e) => setProprietaire(e.target.value)}
            placeholder="Nom du propriétaire de la pièce"
            className="rounded border border-gray-200 px-2 py-1 text-xs" />
        )}
        {!readOnly && (
          <>
            <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
              onChange={(e) => handleFiles(e.target.files)} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
              {busy ? 'Lecture…' : 'Ajouter un fichier'}
            </button>
          </>
        )}
      </div>

      {pieces.length === 0 ? (
        <p className="text-xs text-gray-400">Aucune pièce jointe.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {pieces.map((p) => {
            const estImage = (p.type || '').startsWith('image/')
            return (
              <li key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                {estImage ? <ImageIcon size={15} className="shrink-0 text-sky-500" /> : <FileText size={15} className="shrink-0 text-red-500" />}
                <span className="flex-1 truncate" title={p.nom}>
                  {p.nom}
                  {p.proprietaire && <span className="ml-1 text-[11px] text-gray-500">· {p.proprietaire}</span>}
                </span>
                {p.rubrique && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{p.rubriqueLabel || p.rubrique}</span>}
                <span className="text-[10px] text-gray-400">{formatTaille(p.taille)}</span>
                <button type="button" title="Voir" onClick={() => ouvrirPiece(p)} className="rounded p-1 text-gray-500 hover:bg-gray-100"><Eye size={15} /></button>
                {!readOnly && (
                  <button type="button" title="Supprimer" onClick={() => onRemove?.(p)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
