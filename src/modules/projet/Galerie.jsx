// Galerie photos — avancement de projet (upload + prise de photo directe).
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Camera, Upload, Trash2, ZoomIn, X, ChevronLeft, ChevronRight, ImageIcon, SwitchCamera } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { updateItem } from '../../core/db'
import { compresserImageFichier } from '../../utils/fichiers'
import { STATUTS_PROJET } from './data'
import { formatDateShort } from '../../utils/formatters'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { useAuthStore } from '../../core/auth'
import { marquerVoletVu } from './vues'
import { projetsVisibles } from './logic'

// ── Helpers ────────────────────────────────────────────────────────────────

function genId() { return `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

function formatTaille(octets) {
  if (!octets) return ''
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`
}

// ───────────────────────────────────────────────────────────────────────────

export default function Galerie() {
  const { data: projetsTous } = useCollection('projets')
  const { user, role } = useAuthStore()
  // Le superviseur ajoute des photos, mais ne les supprime pas.
  const peutSupprimer = role !== 'superviseur'
  useEffect(() => { marquerVoletVu(user?.uid, 'projetGalerie') }, [user?.uid])
  // Cloisonnement : un chef de projet ne voit que la galerie de ses projets.
  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const [filtreProjet, setFiltreProjet] = useState('')
  const [legende, setLegende]           = useState('')
  const [uploading, setUploading]       = useState(false)

  // Lightbox
  const [lightbox, setLightbox] = useState(null) // { images, index }

  // Caméra
  const [cameraOpen, setCameraOpen]   = useState(false)
  const [cameraFace, setCameraFace]   = useState('environment') // 'environment' | 'user'
  const [cameraErr, setCameraErr]     = useState('')
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)

  // Refs pour les inputs fichier
  const inputUpload = useRef(null)

  // ── Projet sélectionné ─────────────────────────────────────────────────

  const projetActif = useMemo(() =>
    filtreProjet ? projets.find((p) => p.id === filtreProjet) : null,
  [projets, filtreProjet])

  // ── Toutes les images (tous projets ou projet filtré) ──────────────────

  const toutesImages = useMemo(() => {
    const src = filtreProjet
      ? projets.filter((p) => p.id === filtreProjet)
      : projets
    const imgs = []
    src.forEach((p) => {
      (p.galerie || []).forEach((img) => imgs.push({ ...img, projetNom: p.nom, projetId: p.id, projetStatut: p.statut }))
    })
    return imgs.sort((a, b) => (b.date || 0) - (a.date || 0))
  }, [projets, filtreProjet])

  // ── Ajout d'images ─────────────────────────────────────────────────────

  const ajouterImages = async (files) => {
    if (!projetActif) { toast.error('Sélectionnez un projet avant d\'ajouter des photos.'); return }
    if (!files?.length) return
    setUploading(true)
    try {
      const nouvelles = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) { toast.error(`${file.name} : ce n'est pas une image.`); continue }
        try {
          const dataURL = await compresserImageFichier(file)
          nouvelles.push({
            id: genId(),
            nom: file.name,
            dataURL,
            legende: legende.trim() || '',
            date: Date.now(),
            taille: Math.floor(dataURL.length * 3 / 4)
          })
        } catch (e) { toast.error(`${file.name} : ${e.message}`) }
      }
      if (!nouvelles.length) return
      const galerie = [...(projetActif.galerie || []), ...nouvelles]
      await updateItem('projets', projetActif.id, { galerie, updatedAt: Date.now() })
      await audit('projet', 'photos_ajoutees', `${nouvelles.length} photo(s) → ${projetActif.nom}`)
      setLegende('')
      toast.success(`${nouvelles.length} photo${nouvelles.length > 1 ? 's' : ''} ajoutée${nouvelles.length > 1 ? 's' : ''}`)
    } finally {
      setUploading(false)
      if (inputUpload.current) inputUpload.current.value = ''
    }
  }

  // ── Caméra getUserMedia ────────────────────────────────────────────────

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async (facing) => {
    stopStream()
    setCameraErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (e) {
      setCameraErr('Impossible d\'accéder à la caméra. Vérifiez les permissions du navigateur.')
    }
  }, [stopStream])

  const ouvrirCamera = () => {
    if (!projetActif) { toast.error('Sélectionnez un projet avant de prendre une photo.'); return }
    setCameraOpen(true)
    setCameraErr('')
  }

  const fermerCamera = () => {
    stopStream()
    setCameraOpen(false)
  }

  // Démarrer le flux quand la modale s'ouvre
  useEffect(() => {
    if (cameraOpen) startCamera(cameraFace)
    else stopStream()
  }, [cameraOpen, cameraFace, startCamera, stopStream])

  const retournerCamera = () => {
    const next = cameraFace === 'environment' ? 'user' : 'environment'
    setCameraFace(next)
  }

  const prendrePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)
    const dataURL = canvas.toDataURL('image/jpeg', 0.85)
    const taille  = Math.floor(dataURL.length * 3 / 4)
    const img = {
      id:      genId(),
      nom:     `photo_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.jpg`,
      dataURL,
      legende: legende.trim() || '',
      date:    Date.now(),
      taille
    }
    const galerie = [...(projetActif.galerie || []), img]
    await updateItem('projets', projetActif.id, { galerie, updatedAt: Date.now() })
    await audit('projet', 'photos_ajoutees', `1 photo → ${projetActif.nom}`)
    toast.success('Photo enregistrée !')
    fermerCamera()
    setLegende('')
  }

  // ── Suppression ────────────────────────────────────────────────────────

  const supprimerImage = async (projetId, imgId) => {
    if (!peutSupprimer) return
    if (!window.confirm('Supprimer cette photo ?')) return
    const projet = projets.find((p) => p.id === projetId)
    if (!projet) return
    const galerie = (projet.galerie || []).filter((i) => i.id !== imgId)
    await updateItem('projets', projetId, { galerie, updatedAt: Date.now() })
    // Fermer lightbox si l'image supprimée est affichée
    if (lightbox && lightbox.images[lightbox.index]?.id === imgId) setLightbox(null)
  }

  // ── Lightbox navigation ────────────────────────────────────────────────

  const openLightbox = (images, index) => setLightbox({ images, index })
  const prevImg = () => setLightbox((l) => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length }))
  const nextImg = () => setLightbox((l) => ({ ...l, index: (l.index + 1) % l.images.length }))

  // Clavier lightbox
  const onKey = (e) => {
    if (!lightbox) return
    if (e.key === 'ArrowLeft')  prevImg()
    if (e.key === 'ArrowRight') nextImg()
    if (e.key === 'Escape')     setLightbox(null)
  }

  return (
    <div className="space-y-4" onKeyDown={onKey} tabIndex={-1}>

      {/* En-tête */}
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),0_8px_20px_-8px_rgba(13,148,136,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.85) 0%, rgba(15,84,80,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0d9488', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <ImageIcon size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Galerie photos</h2>
          <p className="text-sm text-white/80">{toutesImages.length} photo{toutesImages.length !== 1 ? 's' : ''} — avancement de chantier</p>
        </div>
      </div>

      {/* Sélecteur projet + actions upload */}
      <Card>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Projet concerné</label>
            <select
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}
            >
              <option value="">— Voir toute la galerie —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>

          {projetActif && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Légende (optionnel)</label>
                <input
                  className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="Ex : Coulage dalle RDC — 30 juin 2026"
                  value={legende} onChange={(e) => setLegende(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Upload depuis fichiers */}
                <input ref={inputUpload} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => ajouterImages(e.target.files)} />
                <Button onClick={() => inputUpload.current?.click()} disabled={uploading} size="sm">
                  <Upload size={14} className="mr-1.5" />
                  {uploading ? 'Ajout en cours…' : 'Choisir des photos'}
                </Button>

                {/* Prise de photo directe (caméra) */}
                <Button onClick={ouvrirCamera} disabled={uploading} size="sm" variant="ghost">
                  <Camera size={14} className="mr-1.5" />
                  Prendre une photo
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Compteur */}
      {toutesImages.length > 0 && (
        <p className="text-xs text-gray-400">
          {toutesImages.length} photo{toutesImages.length > 1 ? 's' : ''}
          {filtreProjet && projetActif ? ` — ${projetActif.nom}` : ' — tous les projets'}
        </p>
      )}

      {/* Galerie par projet */}
      {!filtreProjet ? (
        // Vue globale : regroupée par projet
        <div className="space-y-5">
          {projets.filter((p) => (p.galerie || []).length > 0).map((p) => (
            <div key={p.id}>
              <div className="mb-2 flex items-center gap-2">
                <p className="font-semibold text-gray-700">{p.nom}</p>
                <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label}</Badge>
                <span className="text-xs text-gray-400">{p.galerie.length} photo{p.galerie.length > 1 ? 's' : ''}</span>
              </div>
              <GrilleImages
                images={p.galerie}
                projetId={p.id}
                onOpen={(idx) => openLightbox(p.galerie, idx)}
                onDelete={peutSupprimer ? (imgId) => supprimerImage(p.id, imgId) : null}
              />
            </div>
          ))}
          {projets.every((p) => !(p.galerie || []).length) && (
            <Card>
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <ImageIcon size={36} className="opacity-30" />
                <p className="text-sm">Aucune photo — sélectionnez un projet et ajoutez des photos d'avancement</p>
              </div>
            </Card>
          )}
        </div>
      ) : (
        // Vue filtrée : un seul projet
        projetActif && (projetActif.galerie || []).length > 0 ? (
          <GrilleImages
            images={projetActif.galerie || []}
            projetId={projetActif.id}
            onOpen={(idx) => openLightbox(projetActif.galerie, idx)}
            onDelete={peutSupprimer ? (imgId) => supprimerImage(projetActif.id, imgId) : null}
          />
        ) : (
          <Card>
            <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
              <ImageIcon size={36} className="opacity-30" />
              <p className="text-sm">Aucune photo pour ce projet — ajoutez-en via les boutons ci-dessus</p>
            </div>
          </Card>
        )
      )}

      {/* Canvas caché pour capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Modale caméra */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          {/* Barre du haut */}
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={fermerCamera} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
              <X size={20} />
            </button>
            <p className="text-sm font-semibold text-white">
              {projetActif?.nom}
            </p>
            <button onClick={retournerCamera} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" title="Retourner la caméra">
              <SwitchCamera size={20} />
            </button>
          </div>

          {/* Flux vidéo */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {cameraErr ? (
              <div className="flex flex-col items-center gap-3 px-8 text-center">
                <Camera size={40} className="text-white/40" />
                <p className="text-sm text-white/70">{cameraErr}</p>
                <Button onClick={() => startCamera(cameraFace)} size="sm">Réessayer</Button>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          {/* Légende + déclencheur */}
          <div className="flex flex-col items-center gap-3 px-4 pb-8 pt-4">
            <input
              className="w-full max-w-sm rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="Légende (optionnel)"
              value={legende}
              onChange={(e) => setLegende(e.target.value)}
            />
            <button
              onClick={prendrePhoto}
              disabled={!!cameraErr}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white shadow-lg transition-transform active:scale-95 hover:bg-white/30 disabled:opacity-40"
              title="Prendre la photo"
            >
              <Camera size={28} />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(null)}
        >
          {/* Bouton fermer */}
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>

          {/* Navigation gauche */}
          {lightbox.images.length > 1 && (
            <button
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); prevImg() }}
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Image */}
          <div className="flex max-h-screen max-w-4xl flex-col items-center gap-3 p-4"
            onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.images[lightbox.index]?.dataURL}
              alt={lightbox.images[lightbox.index]?.legende || ''}
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            {lightbox.images[lightbox.index]?.legende && (
              <p className="text-center text-sm text-white/80">{lightbox.images[lightbox.index].legende}</p>
            )}
            <p className="text-xs text-white/50">
              {lightbox.index + 1} / {lightbox.images.length}
              {lightbox.images[lightbox.index]?.date && ` · ${formatDateShort(lightbox.images[lightbox.index].date)}`}
            </p>
          </div>

          {/* Navigation droite */}
          {lightbox.images.length > 1 && (
            <button
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); nextImg() }}
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Grille d'images ────────────────────────────────────────────────────────

function GrilleImages({ images, projetId, onOpen, onDelete }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {[...images].sort((a, b) => (b.date || 0) - (a.date || 0)).map((img, idx) => (
        <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100">
          <img
            src={img.dataURL}
            alt={img.legende || img.nom || ''}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />

          {/* Overlay au hover */}
          <div className="absolute inset-0 flex flex-col justify-between bg-black/0 p-2 transition-colors group-hover:bg-black/40">
            {/* Bouton supprimer */}
            {onDelete && (
              <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(img.id) }}
                  className="rounded-full bg-red-500/80 p-1.5 text-white hover:bg-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            {/* Légende + zoom */}
            <div className="opacity-0 transition-opacity group-hover:opacity-100">
              {img.legende && (
                <p className="mb-1 line-clamp-2 rounded bg-black/50 px-1.5 py-1 text-[11px] text-white">{img.legende}</p>
              )}
              <button
                onClick={() => onOpen(idx)}
                className="flex w-full items-center justify-center gap-1 rounded-lg bg-white/20 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/30"
              >
                <ZoomIn size={13} /> Agrandir
              </button>
            </div>
          </div>

          {/* Date en bas à gauche (toujours visible) */}
          {img.date && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/40 px-1 py-0.5 text-[9px] text-white backdrop-blur-sm">
              {formatDateShort(img.date)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
