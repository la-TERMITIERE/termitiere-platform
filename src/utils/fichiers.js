// Lecture de fichiers (pièces jointes) en data URL base64, avec compression
// des images pour limiter le poids stocké en base. Les PDF sont lus tels quels
// (avec garde-fou de taille). Conçu pour fonctionner sans infrastructure de
// stockage : les fichiers sont conservés en base (data URL).

const MAX_PDF_BYTES = 4 * 1024 * 1024   // 4 Mo max pour un PDF
const IMG_MAX_DIM = 1600                  // côté max d'une image après compression
const IMG_QUALITY = 0.72                  // qualité JPEG

const lireDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Lecture du fichier impossible'))
    r.readAsDataURL(file)
  })

// Compresse une image (redimensionne + JPEG) ; renvoie un data URL.
const compresserImage = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width: w, height: h } = img
        if (w > IMG_MAX_DIM || h > IMG_MAX_DIM) {
          const ratio = Math.min(IMG_MAX_DIM / w, IMG_MAX_DIM / h)
          w = Math.round(w * ratio); h = Math.round(h * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        try {
          resolve(canvas.toDataURL('image/jpeg', IMG_QUALITY))
        } catch (e) { reject(new Error('Compression image impossible')) }
      }
      img.onerror = () => reject(new Error('Image illisible'))
      img.src = r.result
    }
    r.onerror = () => reject(new Error('Lecture du fichier impossible'))
    r.readAsDataURL(file)
  })

// Taille approximative (octets) d'un data URL base64.
export const tailleDataURL = (dataURL) => {
  const i = (dataURL || '').indexOf(',')
  if (i < 0) return 0
  const b64 = dataURL.slice(i + 1)
  return Math.floor(b64.length * 3 / 4)
}

export const formatTaille = (octets) => {
  if (!octets) return '0 o'
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`
}

// Compresse une image fichier et retourne directement le data URL.
export const compresserImageFichier = (file) => compresserImage(file)

// Lit un fichier en pièce jointe : { nom, type, taille, dataURL }.
// Images → compressées. PDF/autres → lus tels quels (garde-fou de taille).
export async function lireFichier(file) {
  if (!file) throw new Error('Aucun fichier')
  const estImage = file.type.startsWith('image/')
  const estPdf = file.type === 'application/pdf'
  if (!estImage && !estPdf) {
    throw new Error('Format non supporté (PDF ou image uniquement)')
  }
  let dataURL
  if (estImage) {
    dataURL = await compresserImage(file)
  } else {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`PDF trop volumineux (${formatTaille(file.size)}). Limite : 4 Mo.`)
    }
    dataURL = await lireDataURL(file)
  }
  return {
    nom: file.name,
    type: estImage ? 'image/jpeg' : file.type,
    taille: tailleDataURL(dataURL),
    dataURL
  }
}

// Ouvre une pièce jointe (data URL) dans un nouvel onglet.
// Les PDF sont téléchargés via un lien temporaire (les navigateurs bloquent
// l'ouverture directe d'un data URL PDF pour raisons de sécurité).
export function ouvrirPiece(piece) {
  if (!piece?.dataURL) return
  if ((piece.type || '').startsWith('image/')) {
    const w = window.open()
    if (!w) return
    w.document.write(`<img src="${piece.dataURL}" style="max-width:100%;margin:auto;display:block" alt="${piece.nom || ''}">`)
  } else {
    // PDF ou autre : conversion data URL → Blob puis ouverture via URL.createObjectURL
    try {
      const [header, b64] = piece.dataURL.split(',')
      const mime = header.match(/:(.*?);/)?.[1] || 'application/pdf'
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: mime })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.target   = '_blank'
      a.rel      = 'noopener noreferrer'
      // Essaie d'abord d'ouvrir dans un onglet ; si bloqué → téléchargement
      const w = window.open(url, '_blank')
      if (!w) { a.download = piece.nom || 'document.pdf'; a.click() }
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      // Fallback : téléchargement direct
      const a = document.createElement('a')
      a.href = piece.dataURL
      a.download = piece.nom || 'document.pdf'
      a.click()
    }
  }
}
