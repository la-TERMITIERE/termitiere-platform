// RH : lecture d'une annonce (fenêtre en verre). L'ouvrir la marque « lue » pour la personne connectée ; les fichiers joints sont chargés à ce moment.
import { useEffect, useState } from 'react'
import { Paperclip, Download, Eye, CalendarClock, Pin, Users } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, icone3D } from '../../utils/color'
import { getAll, setItem, getOne } from '../../core/db'
import { useAuth } from '../../hooks/useAuth'
import { ouvrirPiece, formatTaille } from '../../utils/fichiers'
import { formatDateShort, formatDateTime } from '../../utils/formatters'
import { COL_LECTURES, COL_PIECES, categorieAnnonce, cleLecture, libelleAudience } from './annoncesData'

export default function LectureAnnonce({ annonce, utilisateurs = [], onClose }) {
  const user = useAuth((s) => s.user)
  const [pieces, setPieces] = useState([])
  const cat = categorieAnnonce(annonce)

  useEffect(() => {
    if (!annonce) return
    let vivant = true
    // Marquée « lue » une seule fois par personne.
    if (user?.uid) {
      const id = cleLecture(annonce.id, user.uid)
      getOne(COL_LECTURES, id).then((deja) => { if (!deja) setItem(COL_LECTURES, id, { annonceId: annonce.id, uid: user.uid, nom: user.nom || '', ts: Date.now() }).catch(() => {}) }).catch(() => {})
    }
    if (annonce.nbPieces > 0) getAll(COL_PIECES).then((l) => { if (vivant) setPieces(l.filter((p) => p.annonceId === annonce.id)) }).catch(() => {})
    return () => { vivant = false }
  }, [annonce?.id, user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!annonce) return null
  const Icone = cat.icone
  return (
    <Modal open onClose={onClose} size="lg" title="Annonce" {...glassModalProps(cat.couleur)}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={icone3D(cat.couleur)}><Icone size={22} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2"><span className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white" style={{ background: cat.couleur }}>{cat.label}</span>{annonce.epinglee && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600"><Pin size={12} aria-hidden="true" />Épinglée</span>}</p>
            <h2 className="mt-1 break-words text-lg font-extrabold leading-tight text-gray-900">{annonce.titre}</h2>
            <p className="mt-0.5 text-xs text-gray-500">Par {annonce.parNom || 'la RH'}{annonce.createdAt ? ` · ${formatDateTime(annonce.createdAt)}` : ''}</p>
          </div>
        </div>

        <p className="whitespace-pre-wrap break-words rounded-2xl border border-white/80 bg-white/65 px-4 py-3 text-sm leading-relaxed text-gray-800 backdrop-blur-md">{annonce.texte}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5"><Users size={13} aria-hidden="true" />{libelleAudience(annonce)}</span>
          {annonce.dateFin && <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} aria-hidden="true" />Jusqu'au {formatDateShort(annonce.dateFin)}</span>}
        </div>

        {pieces.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500"><Paperclip size={13} aria-hidden="true" />Fichiers joints</p>
            {pieces.map((p) => (
              <button key={p.id} type="button" onClick={() => ouvrirPiece(p)} className="flex w-full items-center gap-2 rounded-2xl border border-white/80 bg-white/65 px-3 py-2 text-left text-sm font-semibold text-sky-700 backdrop-blur-md hover:bg-white/90">
                {(p.type || '').startsWith('image/') ? <Eye size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{p.nom}</span><span className="shrink-0 text-xs font-medium text-gray-400">{formatTaille(p.taille)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
