// MAXI-GYM — Modale « QR carnet » : affiche le code QR menant au carnet de
// présence public du client (cf. carnet/CarnetPresence.jsx). Génère le jeton à
// la volée s'il manque encore (comptes créés avant cette fonctionnalité).
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ScanLine } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { updateItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { genQrToken } from './data'

export default function QrCarnetModal({ client, onClose }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [pret, setPret] = useState(false)

  useEffect(() => {
    if (!client) { setDataUrl(null); setPret(false); return }
    let annule = false
    ;(async () => {
      let token = client.qrToken
      if (!token) {
        token = genQrToken()
        try { await updateItem('gym_clients', client.id, { qrToken: token }) }
        catch { toast.error('Impossible de générer le QR pour l\'instant'); return }
      }
      const lien = `${window.location.origin}/gym/carnet/${token}`
      const url = await QRCode.toDataURL(lien, { width: 320, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } })
      if (!annule) { setDataUrl(url); setPret(true) }
    })()
    return () => { annule = true }
  }, [client])

  return (
    <Modal open={!!client} onClose={onClose} title={client ? `QR carnet — ${client.nom}` : ''}
      {...glassModalProps(COULEUR_MODULE.gym)}
      footer={<Button variant="outline" onClick={onClose}>Fermer</Button>}>
      {client && (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex h-72 w-72 items-center justify-center rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            {pret ? <img src={dataUrl} alt="QR code du carnet de présence" className="h-full w-full" /> : (
              <p className="text-sm text-gray-400">Génération du QR…</p>
            )}
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-orange-50 px-3.5 py-3 text-sm text-orange-800">
            <ScanLine size={18} className="mt-0.5 shrink-0" />
            <p>
              Faites scanner ce code par l'appareil photo du téléphone de <strong>{client.nom}</strong>, puis proposez-lui
              d'ajouter la page à son écran d'accueil (« Ajouter à l'écran d'accueil » / partager → « Sur l'écran d'accueil »)
              pour y revenir comme une application — nommée <strong>« MAXI GYM Carnet-présence »</strong>.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}
