// Documents & Galerie — projets.
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { FileText, Search, Camera, Upload, Trash2, ZoomIn, X, ChevronLeft, ChevronRight, ImageIcon, SwitchCamera } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { STATUTS_PROJET } from './data'
import { compresserImageFichier } from '../../utils/fichiers'

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

// ─── Onglet Galerie ───────────────────────────────────────────────────────────

function OngletGalerie({ projets }) {
  const [projetId, setProjetId]   = useState('')
  const [lightbox, setLightbox]   = useState(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraFace, setCameraFace] = useState('environment')
  const [cameraErr, setCameraErr]   = useState('')
  const [caption, setCaption]       = useState('')
  const [uploading, setUploading]   = useState(false)

  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const inputRef  = useRef(null)

  const projet = useMemo(() => projets.find((p) => p.id === projetId), [projets, projetId])
  const photos  = projet?.galerie || []

  const projetsAvecPhotos = useMemo(() => projets.filter((p) => (p.galerie || []).length > 0), [projets])

  // ── Camera ──────────────────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const openCamera = useCallback(async (face = cameraFace) => {
    stopStream()
    setCameraErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face }, audio: false })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setCameraOpen(true)
    } catch {
      setCameraErr('Caméra non accessible. Vérifiez les permissions.')
    }
  }, [cameraFace, stopStream])

  const flipCamera = () => {
    const next = cameraFace === 'environment' ? 'user' : 'environment'
    setCameraFace(next)
    openCamera(next)
  }

  const closeCamera = () => { stopStream(); setCameraOpen(false); setCameraErr('') }

  useEffect(() => () => stopStream(), [stopStream])

  const prendrePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const v = videoRef.current
    canvasRef.current.width = v.videoWidth
    canvasRef.current.height = v.videoHeight
    canvasRef.current.getContext('2d').drawImage(v, 0, 0)
    const dataURL = canvasRef.current.toDataURL('image/jpeg', 0.8)
    ajouterPhoto(dataURL, caption || `Photo ${new Date().toLocaleString('fr-FR')}`)
    setCaption('')
    closeCamera()
  }

  const ajouterPhoto = async (dataURL, nom) => {
    if (!projet) return
    const photo = { id: `ph_${Date.now()}`, dataURL, nom, date: Date.now() }
    const galerie = [...(projet.galerie || []), photo]
    await updateItem('projets', projet.id, { galerie, updatedAt: Date.now() })
    await audit('projet', 'photo_ajoutee', projet.nom)
  }

  const supprimerPhoto = async (photoId) => {
    if (!projet || !window.confirm('Supprimer cette photo ?')) return
    const galerie = (projet.galerie || []).filter((p) => p.id !== photoId)
    await updateItem('projets', projet.id, { galerie, updatedAt: Date.now() })
  }

  const handleFichiers = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!projet || !files.length) return
    setUploading(true)
    try {
      for (const f of files) {
        const dataURL = await compresserImageFichier(f)
        await ajouterPhoto(dataURL, f.name)
      }
    } finally { setUploading(false); e.target.value = '' }
  }

  const navLight = (dir) => {
    if (lightbox === null) return
    const next = (lightbox + dir + photos.length) % photos.length
    setLightbox(next)
  }

  return (
    <div className="space-y-4">
      {/* Sélecteur projet */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          value={projetId} onChange={(e) => setProjetId(e.target.value)}>
          <option value="">— Sélectionner un projet —</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        {projet && (
          <>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFichiers} />
            <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Upload size={14} className="mr-1" />{uploading ? 'Import…' : 'Importer'}
            </Button>
            <Button size="sm" onClick={() => openCamera()}>
              <Camera size={14} className="mr-1" />Prendre photo
            </Button>
          </>
        )}
      </div>

      {/* Résumé global si aucun projet sélectionné */}
      {!projetId && projetsAvecPhotos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {projetsAvecPhotos.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{p.nom}</p>
                  <p className="text-xs text-gray-400">{(p.galerie || []).length} photo(s)</p>
                </div>
                <button onClick={() => setProjetId(p.id)} className="text-xs text-teal-600 hover:underline">Voir</button>
              </div>
              {(p.galerie || []).length > 0 && (
                <div className="mt-2 flex gap-1 overflow-hidden rounded">
                  {(p.galerie || []).slice(0, 4).map((ph) => (
                    <img key={ph.id} src={ph.dataURL} alt="" className="h-12 w-12 object-cover rounded" />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Grille photos */}
      {projet && (
        !photos.length ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
              <ImageIcon size={40} className="opacity-20" />
              <p className="text-sm">Aucune photo — importez ou prenez une photo.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((ph, idx) => (
              <div key={ph.id} className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100">
                <img src={ph.dataURL} alt={ph.nom} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <button onClick={() => setLightbox(idx)} className="rounded-full bg-white/20 p-2 text-white hover:bg-white/40"><ZoomIn size={16} /></button>
                  <button onClick={() => supprimerPhoto(ph.id)} className="rounded-full bg-white/20 p-2 text-white hover:bg-red-500/80"><Trash2 size={16} /></button>
                </div>
                {ph.nom && <p className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-2 py-1 text-[10px] text-white">{ph.nom}</p>}
              </div>
            ))}
          </div>
        )
      )}

      {/* Lightbox */}
      {lightbox !== null && photos[lightbox] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLightbox(null)}>
          <button className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white hover:bg-white/40" onClick={(e) => { e.stopPropagation(); navLight(-1) }}><ChevronLeft size={24} /></button>
          <img src={photos[lightbox].dataURL} alt="" className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white hover:bg-white/40" onClick={(e) => { e.stopPropagation(); navLight(1) }}><ChevronRight size={24} /></button>
          <button className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40" onClick={() => setLightbox(null)}><X size={18} /></button>
          {photos[lightbox].nom && <p className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1 text-sm text-white">{photos[lightbox].nom}</p>}
        </div>
      )}

      {/* Camera modal */}
      {(cameraOpen || cameraErr) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
          <button className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white" onClick={closeCamera}><X size={20} /></button>
          {cameraErr ? (
            <p className="text-center text-sm text-red-400 px-6">{cameraErr}</p>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="max-h-[65vh] w-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="mt-4 flex w-full max-w-sm flex-col gap-3 px-4">
                <input className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none"
                  placeholder="Légende (optionnel)" value={caption} onChange={(e) => setCaption(e.target.value)} />
                <div className="flex gap-3">
                  <button onClick={flipCamera} className="flex-1 rounded-xl border border-white/30 py-3 text-white flex items-center justify-center gap-2">
                    <SwitchCamera size={18} />Retourner
                  </button>
                  <button onClick={prendrePhoto} className="flex-1 rounded-xl bg-teal-500 py-3 font-bold text-white hover:bg-teal-400">
                    📸 Capturer
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Documents() {
  const { data: projets } = useCollection('projets')
  const { data: taches }  = useCollection('projet_taches')
  const [onglet, setOnglet] = useState('documents')

  return (
    <div className="space-y-4">
      {/* Onglets */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {[
          { id: 'documents', label: '📄 Fichiers' },
          { id: 'galerie',   label: '🖼️ Galerie photos' }
        ].map((o) => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${onglet === o.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'documents'
        ? <OngletDocuments projets={projets} taches={taches} />
        : <OngletGalerie projets={projets} />
      }
    </div>
  )
}
