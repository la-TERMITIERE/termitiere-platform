// Gestionnaire de pièces jointes (PDF / images) réutilisable.
// Découplé du stockage : le parent fournit `pieces` et les callbacks onAdd/onRemove.
// Les fichiers images sont compressés ; tout est encodé en data URL (cf. utils/fichiers).
import { useRef, useState } from 'react'
import { Paperclip, Eye, Trash2, Loader2, FileText, Image as ImageIcon, ChevronDown } from 'lucide-react'
import { lireFichier, ouvrirPiece, formatTaille } from '../../utils/fichiers'
import { toast } from '../../core/notifications'

export default function PiecesJointes({ pieces = [], onAdd, onRemove, readOnly = false, label = 'Pièces jointes', rubriques = null, withProprietaire = false, withLegende = false }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [rubrique, setRubrique] = useState('')
  const [rubriqueLibre, setRubriqueLibre] = useState(false)
  const [proprietaire, setProprietaire] = useState('')
  const [legende, setLegende] = useState('')

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy(true)
    try {
      for (const f of files) {
        try {
          const piece = await lireFichier(f)
          await onAdd?.({ ...piece, rubrique: rubrique || '', proprietaire: proprietaire.trim(), legende: legende.trim() })
        } catch (e) {
          toast.error(`${f.name} : ${e.message}`)
        }
      }
    } finally {
      setBusy(false)
      setProprietaire('')
      setLegende('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
        {pieces.length > 0 && (
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">{pieces.length}</span>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-2.5">
          {rubriques?.length > 0 && (
            rubriqueLibre ? (
              <input value={rubrique} onChange={(e) => setRubrique(e.target.value)}
                autoFocus placeholder="Nom de la rubrique…"
                className="rounded-lg border border-teal-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400" />
            ) : (
              <div className="relative">
                <select value={rubrique}
                  onChange={(e) => {
                    if (e.target.value === '__libre__') { setRubriqueLibre(true); setRubrique('') }
                    else setRubrique(e.target.value)
                  }}
                  className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400">
                  <option value="">— Rubrique —</option>
                  {rubriques.map((r) => <option key={r.id || r} value={r.id || r}>{r.label || r}</option>)}
                  <option value="__libre__">✏️ Saisir une rubrique…</option>
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            )
          )}
          {withProprietaire && (
            <input value={proprietaire} onChange={(e) => setProprietaire(e.target.value)}
              placeholder="Nom du propriétaire de la pièce"
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400" />
          )}
          {withLegende && (
            <input value={legende} onChange={(e) => setLegende(e.target.value)}
              placeholder="Légende / commentaire (optionnel)"
              className="min-w-[200px] flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400" />
          )}
          <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
            onChange={(e) => handleFiles(e.target.files)} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            {busy ? 'Lecture…' : 'Ajouter un fichier'}
          </button>
        </div>
      )}

      {pieces.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50/50 py-8 text-gray-400">
          <Paperclip size={24} className="opacity-30" />
          <p className="text-xs">Aucune pièce jointe.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {pieces.map((p) => {
            const estImage = (p.type || '').startsWith('image/')
            return (
              <div key={p.id} className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm transition-all hover:border-teal-200 hover:shadow-md">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${estImage ? 'bg-sky-50 text-sky-500' : 'bg-red-50 text-red-500'}`}>
                  {estImage ? <ImageIcon size={17} /> : <FileText size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-gray-700" title={p.nom}>{p.nom}</span>
                    {p.rubrique && <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{p.rubriqueLabel || p.rubrique}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                    {p.proprietaire && <span>{p.proprietaire}</span>}
                    <span>{formatTaille(p.taille)}</span>
                  </div>
                  {p.legende && <p className="mt-0.5 truncate text-[11px] italic text-teal-700" title={p.legende}>« {p.legende} »</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  <button type="button" title="Voir" onClick={() => ouvrirPiece(p)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-teal-50 hover:text-teal-600"><Eye size={15} /></button>
                  {!readOnly && (
                    <button type="button" title="Supprimer" onClick={() => onRemove?.(p)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
