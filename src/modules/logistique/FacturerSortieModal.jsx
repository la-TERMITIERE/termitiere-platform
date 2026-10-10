// « Facturer et demander la sortie » : depuis une prestation en brouillon, émet la facture (brouillon)
// ET envoie l'autorisation de sortie du matériel à la hiérarchie, en une seule action. Reprend
// exactement ce que font les volets Factures (émettre) et Demandes (nouvelle autorisation).
import { useEffect, useMemo, useState } from 'react'
import { FileText, Send, ShieldCheck, AlertTriangle, Boxes, Wallet, UserRound } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { APPROVER_ROLES } from '../../core/roles'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import { todayStr, nowHM, genNumero, formatMoney } from '../../utils/formatters'
import { matchSite, siteLabel } from './site/useSite'

// Lignes de matériel du référentiel (avec stock) d'une prestation : celles qui sortent du magasin.
const lignesMateriel = (p) => (p?.lignes || [])
  .filter((l) => l.materielId)
  .map((l) => ({ materielId: l.materielId, materielNom: l.materielNom, materielCat: l.cat, qte: parseInt(l.qte) || 0 }))

// Émet la facture (brouillon) d'une prestation ET envoie l'autorisation de sortie du matériel.
// Utilisé par la fenêtre ci-dessous et par la case « Facturer et demander la sortie tout de suite »
// du formulaire de prestation. Renvoie { numFacture, numDemande, destinataires }.
export async function facturerEtDemander({ p, site, user, factureDate, dateSortie, message, facturesSite, demandesSite }) {
  const lignes = lignesMateriel(p)
  const totalPieces = lignes.reduce((s, l) => s + l.qte, 0)
  const numFacture = genNumero(`FAC-LOG-${site.toUpperCase()}`, facturesSite.length)
  const factureId = await addItem('logistique_factures', {
    num: numFacture, date: factureDate, site,
    prestationId: p.id, prestationNum: p.num,
    clientNom: p.clientNom, evenement: p.evenement || '',
    dateDebut: p.dateDebut || '', dateFin: p.dateFin || '',
    lignes: p.lignes, frais: p.frais || [], totalHT: p.total, totalTTC: p.total,
    statut: 'brouillon', agentNom: user.nom, agentId: user.uid
  })
  await updateItem('logistique_prestations', p.id, { statut: 'facturee', factureId, factureNum: numFacture })
  await audit('logistique', 'FACTURE', `${siteLabel(site)} : ${numFacture} : ${formatMoney(p.total)} (brouillon)`)
  let numDemande = null
  let destinataires = null
  if (lignes.length) {
    numDemande = genNumero(`AUT-${site.toUpperCase()}`, demandesSite.length)
    await addItem('logistique_demandes', {
      num: numDemande, date: todayStr(), heure: nowHM(), site,
      demandeur: user.login, demandeurNom: user.nom,
      factureId, factureNum: numFacture,
      prestationId: p.id, prestationNum: p.num, clientNom: p.clientNom,
      lignes, dateSortie, message: (message || '').trim(), statut: 'en_attente'
    })
    const alerte = await notify({
      type: 'demande',
      title: 'Autorisation de sortie matériel',
      body: `${siteLabel(site)} : ${totalPieces} pièce(s) · prestation ${p.num} : facture ${numFacture} : par ${user.nom}`,
      module: 'logistique',
      forRoles: [...APPROVER_ROLES, 'secretaire'],
      excludeUid: user.uid,
      link: `/logistique/${site}/demandes`
    })
    destinataires = alerte ? alerte.destinataires : null
    await audit('logistique', 'DEMANDE_SORTIE', `${siteLabel(site)} : ${numDemande} : prestation ${p.num}`)
  }
  return { numFacture, numDemande, destinataires }
}

export default function FacturerSortieModal({ prestation, site, user, voitMontants, onClose }) {
  const { data: allFactures } = useCollection('logistique_factures')
  const { data: allDemandes } = useCollection('logistique_demandes')
  const [factureDate, setFactureDate] = useState(todayStr())
  const [dateSortie, setDateSortie] = useState(todayStr())
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!prestation) return
    setFactureDate(todayStr())
    setDateSortie(prestation.dateDebut || todayStr())
    setMessage(`Sortie du matériel pour ${prestation.clientNom || 'le client'}${prestation.evenement ? ` : ${prestation.evenement}` : ''}`)
  }, [prestation?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const lignes = useMemo(() => lignesMateriel(prestation), [prestation])
  const totalPieces = lignes.reduce((s, l) => s + l.qte, 0)

  async function valider() {
    if (saving || !prestation) return
    if (!factureDate) return toast.error('Date de la facture requise')
    if (lignes.length && !message.trim()) return toast.error('Motif de la sortie obligatoire')
    setSaving(true)
    try {
      const r = await facturerEtDemander({
        p: prestation, site, user, factureDate, dateSortie, message,
        facturesSite: allFactures.filter((f) => matchSite(f, site)),
        demandesSite: allDemandes.filter((d) => matchSite(d, site))
      })
      toast.success(r.numDemande
        ? `Facture ${r.numFacture} émise et autorisation ${r.numDemande} envoyée à la hiérarchie ✓`
        : `Facture ${r.numFacture} émise ✓ (aucun matériel du référentiel à sortir)`)
      // Garde-fou : si personne n'a le rôle de validation ET le module Logistique, on le dit.
      if (r.destinataires === 0) toast.warning(`Aucun validateur n'a accès au module Logistique : personne n'a été alerté. Prévenez la hiérarchie.`)
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const etapes = [
    { icone: FileText, titre: 'Facture', sous: 'En brouillon', couleur: '#BC3C31' },
    { icone: Send, titre: 'Autorisation', sous: 'Envoyée', couleur: '#7C3AED' },
    { icone: ShieldCheck, titre: 'Validation', sous: 'Approbation, certification', couleur: '#16A34A' }
  ]

  return (
    <Modal open={!!prestation} onClose={() => !saving && onClose()} size="lg" {...glassModalProps(COULEUR_MODULE.logistique)}
      title="Facturer et demander la sortie"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
        <Button onClick={valider} loading={saving}><Send size={15} /> Facturer et demander la sortie</Button>
      </>}>
      <style>{`
        @keyframes fs-point { 0%, 100% { opacity: 0.2; transform: translateX(0); } 50% { opacity: 1; transform: translateX(4px); } }
        @keyframes fs-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      `}</style>
      {prestation && (
        <div className="space-y-3">
          {/* Les trois étapes enchaînées, avec des points qui avancent */}
          <div className="tuile-verre flex items-center justify-between gap-1 !p-3">
            {etapes.map((e, i) => (
              <div key={e.titre} className="flex min-w-0 flex-1 items-center">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ ...icone3D(e.couleur), animation: `fs-flotte 2.6s ease-in-out ${i * 0.4}s infinite` }}><e.icone size={20} /></span>
                  <span className="text-xs font-extrabold text-gray-700">{e.titre}</span>
                  <span className="text-[10px] leading-tight text-gray-400">{e.sous}</span>
                </div>
                {i < etapes.length - 1 && (
                  <span aria-hidden="true" className="flex shrink-0 gap-0.5 px-1 text-red-400">
                    {[0, 1, 2].map((k) => <i key={k} className="block h-1.5 w-1.5 rounded-full bg-current" style={{ animation: `fs-point 1.4s ease-in-out ${k * 0.2}s infinite` }} />)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Récapitulatif de la prestation */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="tuile-verre flex items-center gap-3 !p-2.5 sm:col-span-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(COULEUR_MODULE.logistique)}><UserRound size={16} /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Prestation {prestation.num}</p>
                <p className="break-words text-sm font-semibold text-gray-800">{prestation.clientNom}{prestation.evenement ? ` · ${prestation.evenement}` : ''}</p>
              </div>
            </div>
            <div className="tuile-verre flex items-center gap-3 !p-2.5 sm:col-span-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#7C3AED')}><Boxes size={16} /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Matériel à sortir</p>
                <p className="text-sm font-semibold text-gray-800">{totalPieces} pièce(s) · {lignes.length} article(s)</p>
              </div>
            </div>
            {voitMontants && (
              <div className="tuile-verre flex items-center gap-3 !p-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#16A34A')}><Wallet size={16} /></span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Montant</p>
                  <p className="whitespace-nowrap text-sm font-extrabold text-gray-800">{formatMoney(prestation.total || 0)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            <FormGroup label="Date de la facture" required>
              <Input type="date" value={factureDate} onChange={(e) => setFactureDate(e.target.value)} />
            </FormGroup>
            {lignes.length > 0 && (
              <FormGroup label="Date de sortie" required>
                <Input type="date" value={dateSortie} onChange={(e) => setDateSortie(e.target.value)} />
              </FormGroup>
            )}
            {lignes.length > 0 && (
              <FormGroup label="Motif de la sortie" required className="col-span-2">
                <Input value={message} onChange={(e) => setMessage(e.target.value)} />
              </FormGroup>
            )}
          </div>

          {lignes.length === 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900 backdrop-blur-md">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <span>Cette prestation ne contient aucun matériel du référentiel : seule la facture sera émise, aucune autorisation de sortie n'est nécessaire.</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
