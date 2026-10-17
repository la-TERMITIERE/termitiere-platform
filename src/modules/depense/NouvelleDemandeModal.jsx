// Fenêtre « Nouvelle demande de décaissement » : partagée par le volet Demandes et par la page Dépenses.
// Une fois envoyée, la demande alerte le PAU, la GE, l'Info et la direction, qui la valident ou la refusent.
import { useEffect, useState } from 'react'
import { Send, X, Layers, MapPin, Tag, Wallet, MessageSquareText, UserRound, CalendarDays, PiggyBank, Check, Clock, Zap, Siren, Briefcase, Phone, Gauge } from 'lucide-react'
import Button from '../../shared/ui/Button'
import BoutonVerre from '../../shared/ui/BoutonVerre'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import ChampBeneficiaire from './ChampBeneficiaire'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { genId, todayStr } from '../../utils/formatters'
import { glassModalProps, icone3D } from '../../utils/color'
import { SECTEURS, CATEGORIES_DEPENSE, LOGISTIQUE_SITES, natureFluxDefaut } from './data'
import { libelleSecteurSite } from './logic'

// Ceux qui reçoivent l'alerte d'une nouvelle demande et qui peuvent la valider ou la refuser (un seul suffit).
// Le directeur compte ici, alors que dans le reste d'E-DÉPENSES il est traité comme un agent.
export const DESTINATAIRES_DEMANDE = ['pau', 'ge', 'info', 'directeur', 'super_admin']

function Etiquette({ icone: Icone, couleur = '#B45309', children }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ ...icone3D(couleur), animation: 'nd-flotte 3.2s ease-in-out infinite' }}><Icone size={13} /></span>
      {children}
    </span>
  )
}

function Choix({ actif, onClick, point, couleur = '#B45309', icone: Icone, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${actif ? 'text-white shadow-md' : 'border-gray-200 bg-white text-gray-600 hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50'}`}
      style={actif ? { background: `linear-gradient(135deg, ${couleur}, ${couleur}cc)`, borderColor: couleur, animation: 'nd-pop 0.28s ease-out' } : undefined}>
      {Icone && <Icone size={13} />}
      {point && <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white" style={{ background: point }} />}
      {children}
      {actif && <Check size={12} strokeWidth={3} />}
    </button>
  )
}

// Niveaux d'urgence d'une demande : rang servant au tri (le plus urgent d'abord).
export const URGENCES = {
  normale: { label: 'Normale', couleur: '#16a34a', icone: Clock, rang: 0 },
  urgente: { label: 'Urgente', couleur: '#f59e0b', icone: Zap, rang: 1 },
  critique: { label: 'Très urgente', couleur: '#dc2626', icone: Siren, rang: 2 }
}

const VIDE = () => ({
  secteurId: '', site: '', categorie: '', montant: '', date: todayStr(), description: '', urgence: 'normale', caisseCommune: false,
  beneficiaireType: 'interne', beneficiaireUid: '', beneficiaireNom: '', beneficiaireFonction: '', beneficiaireTelephone: ''
})

export default function NouvelleDemandeModal({ open, onClose }) {
  const { user } = useAuth()
  const [nouvelle, setNouvelle] = useState(null)
  const [busy, setBusy] = useState(false)
  const { data: users } = useCollection('users')

  useEffect(() => { if (open) setNouvelle(VIDE()) }, [open])

  const run = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); toast.success(okMsg); return true }
    catch (e) { toast.error('Erreur : ' + e.message); return false }
    finally { setBusy(false) }
  }

  async function envoyerDemande() {
    const f = nouvelle
    if (!f || busy) return
    const montant = Number(f.montant) || 0
    if (!f.secteurId) return toast.error('Choisissez le secteur')
    if (!f.categorie) return toast.error('Choisissez la catégorie')
    if (!(montant > 0)) return toast.error('Indiquez le montant')
    if (!f.description.trim()) return toast.error('Indiquez le motif de la demande')
    if (!f.beneficiaireNom.trim()) return toast.error('Indiquez le bénéficiaire')
    const secteur = SECTEURS.find((x) => x.id === f.secteurId)
    const site = f.secteurId === 'logistique' ? (f.site || 'lome') : undefined
    const libelle = libelleSecteurSite(secteur, { secteurId: f.secteurId, site })
    const ok = await run(async () => {
      const id = genId()
      await setItem('depense_depenses', id, {
        id, secteurId: f.secteurId, ...(site ? { site } : {}), categorie: f.categorie, montant, date: f.date || todayStr(),
        description: f.description.trim(), urgence: f.urgence || 'normale', modePaiement: 'espece',
        beneficiaireType: f.beneficiaireType, beneficiaireUid: f.beneficiaireType === 'externe' ? '' : (f.beneficiaireUid || ''), beneficiaireNom: f.beneficiaireNom.trim(),
        beneficiaireFonction: f.beneficiaireFonction || '', beneficiaireTelephone: f.beneficiaireTelephone || '',
        natureFlux: natureFluxDefaut, sourceFinancement: 'entreprise', financePar: f.caisseCommune ? 'caisse_commune' : '',
        justificatifRequis: true, justificatifRecu: false,
        statut: 'en_attente', demande: true, origineSaisie: 'e_depenses',
        enregistrePar: user?.nom || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('depense', 'DEMANDE_CREEE', `${libelle} : ${montant.toLocaleString('fr-FR')} FCFA : ${f.description.trim()}`, { secteurId: f.secteurId, montant })
      // Alerte au PAU, à la GE, à l'Info et à la direction : l'un d'eux valide ou refuse.
      await notify({
        type: f.urgence === 'critique' ? 'danger' : 'warning',
        title: `${f.urgence === 'critique' ? '🚨 TRÈS URGENT' : f.urgence === 'urgente' ? '⚡ URGENT' : '💰'} Nouvelle demande : ${libelle}`,
        body: `${montant.toLocaleString('fr-FR')} FCFA · ${f.categorie} : ${f.description.trim()} · demandé par ${user?.nom || '—'}. Urgence : ${(URGENCES[f.urgence] || URGENCES.normale).label}. À valider ou à refuser.`,
        module: 'depense', forRoles: DESTINATAIRES_DEMANDE, excludeUid: user?.uid, link: '/depense/demandes'
      }).catch(() => {})
      if (user?.uid) {
        await notify({ type: 'info', title: '⏳ Demande envoyée', body: `${montant.toLocaleString('fr-FR')} FCFA · ${libelle} : en attente de la décision du PAU, de la GE, de l'Info ou de la direction.`, module: 'depense', forUsers: [user.uid], link: '/depense/demandes' }).catch(() => {})
      }
    }, '📨 Demande envoyée : le PAU, la GE, l\'Info et la direction sont alertés')
    if (ok) onClose()
  }

  const f = nouvelle
  const COULEUR = '#B45309'
  const valeur = Number(f?.montant) || 0
  const bloc = 'rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm'
  const sect = SECTEURS.find((x) => x.id === f?.secteurId)
  const maj = (patch) => setNouvelle((x) => ({ ...x, ...patch }))

  return (
    <Modal open={open && !!f} onClose={onClose} title="Nouvelle demande" size="md" {...glassModalProps(COULEUR)}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={busy}><X size={15} /> Annuler</Button>
        <BoutonVerre icone={Send} animation="pieces" onClick={envoyerDemande} loading={busy} disabled={!f || !f.secteurId || !f.categorie || !(valeur > 0) || !f.description.trim() || !f.beneficiaireNom.trim()}>Envoyer la demande</BoutonVerre>
      </>}>
      <style>{`
        @keyframes nd-entre { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes nd-pop { 0% { transform: scale(0.92); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
        @keyframes nd-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
        @keyframes nd-vol { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(3px, -3px) rotate(8deg); } }
        @keyframes nd-montant { 0% { transform: scale(0.97); opacity: 0.6; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
      {f && (
        <div className="space-y-3">
          {/* Bandeau : la demande part vers les décideurs */}
          <div className="relative flex items-center gap-3 overflow-hidden rounded-3xl p-3.5 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]" style={{ background: 'linear-gradient(135deg, #E08A1E 0%, #B45309 55%, #5c2a05 130%)', animation: 'nd-entre 0.35s ease-out' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
              <Send size={24} style={{ animation: 'nd-vol 2.4s ease-in-out infinite' }} />
            </span>
            <p className="relative text-sm font-extrabold leading-tight">Faire une demande de décaissement</p>
          </div>

          <div className={bloc} style={{ animation: 'nd-entre 0.4s ease-out 0.03s both' }}>
            <Etiquette icone={Gauge} couleur={URGENCES[f.urgence].couleur}>Niveau d'urgence</Etiquette>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(URGENCES).map(([k, u]) => <Choix key={k} actif={f.urgence === k} couleur={u.couleur} icone={u.icone} onClick={() => maj({ urgence: k })}>{u.label}</Choix>)}
            </div>
          </div>

          <div className={`${bloc} space-y-3`} style={{ animation: 'nd-entre 0.4s ease-out 0.05s both' }}>
            <div>
              <Etiquette icone={Layers}>Secteur <span className="text-red-500">*</span></Etiquette>
              <div className="flex flex-wrap gap-1.5">
                {SECTEURS.map((x) => <Choix key={x.id} actif={f.secteurId === x.id} point={x.color} couleur={x.color} onClick={() => maj({ secteurId: x.id, site: '' })}>{x.label}</Choix>)}
              </div>
            </div>
            {f.secteurId === 'logistique' && (
              <div style={{ animation: 'nd-entre 0.3s ease-out' }}>
                <Etiquette icone={MapPin} couleur="#E8850F">Site</Etiquette>
                <div className="flex flex-wrap gap-1.5">
                  {LOGISTIQUE_SITES.map((x) => <Choix key={x.id} actif={(f.site || 'lome') === x.id} couleur={sect?.color || COULEUR} onClick={() => maj({ site: x.id })}>{x.label}</Choix>)}
                </div>
              </div>
            )}
            <div>
              <Etiquette icone={Tag} couleur="#7c3aed">Catégorie <span className="text-red-500">*</span></Etiquette>
              <Select value={f.categorie} onChange={(e) => maj({ categorie: e.target.value })}>
                <option value="">Choisir une catégorie</option>
                {CATEGORIES_DEPENSE.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
              </Select>
            </div>
          </div>

          <div className={`${bloc} space-y-3`} style={{ animation: 'nd-entre 0.4s ease-out 0.12s both' }}>
            <div>
              <Etiquette icone={Wallet} couleur="#0d9488">Montant <span className="text-red-500">*</span></Etiquette>
              <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-200">
                <input type="number" min="0" inputMode="numeric" value={f.montant} onChange={(e) => maj({ montant: e.target.value })} placeholder="0" aria-label="Montant demandé"
                  className="min-w-0 flex-1 bg-transparent text-2xl font-black text-gray-900 outline-none placeholder:text-gray-300" />
                <span className="text-sm font-bold text-gray-400">FCFA</span>
              </div>
              {valeur > 0 && <p key={valeur} className="mt-1 text-sm font-extrabold text-amber-700" style={{ animation: 'nd-montant 0.25s ease-out' }}>{Math.round(valeur).toLocaleString('fr-FR')} FCFA</p>}
            </div>
            <div>
              <Etiquette icone={MessageSquareText} couleur="#475569">Motif <span className="text-red-500">*</span></Etiquette>
              <textarea rows={2} className="input-base w-full" value={f.description} onChange={(e) => maj({ description: e.target.value })} aria-label="Motif de la demande" />
            </div>
          </div>

          <div className={`${bloc} space-y-3`} style={{ animation: 'nd-entre 0.4s ease-out 0.2s both' }}>
            <div>
              <Etiquette icone={UserRound} couleur="#7c3aed">Bénéficiaire <span className="text-red-500">*</span></Etiquette>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Choix actif={f.beneficiaireType !== 'externe'} couleur="#7c3aed" onClick={() => maj({ beneficiaireType: 'interne', beneficiaireUid: '', beneficiaireNom: '', beneficiaireFonction: '', beneficiaireTelephone: '' })}>Membre de l'entreprise</Choix>
                <Choix actif={f.beneficiaireType === 'externe'} couleur="#7c3aed" onClick={() => maj({ beneficiaireType: 'externe', beneficiaireUid: '', beneficiaireNom: '', beneficiaireFonction: '', beneficiaireTelephone: '' })}>Externe</Choix>
              </div>
              {f.beneficiaireType === 'externe'
                ? <Input value={f.beneficiaireNom} onChange={(e) => maj({ beneficiaireNom: e.target.value })} aria-label="Nom du bénéficiaire" placeholder="Nom de la personne" />
                : <ChampBeneficiaire value={f.beneficiaireNom} users={users}
                    onChange={(v) => maj({ beneficiaireNom: v, beneficiaireUid: '' })}
                    onSelectUser={(u) => maj({ beneficiaireUid: u.uid, beneficiaireNom: u.nom || '', beneficiaireFonction: u.poste || '', beneficiaireTelephone: u.telephone || '' })} />}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Etiquette icone={Briefcase} couleur="#64748b">Fonction</Etiquette>
                <Input value={f.beneficiaireFonction} onChange={(e) => maj({ beneficiaireFonction: e.target.value })} aria-label="Fonction" />
              </div>
              <div>
                <Etiquette icone={Phone} couleur="#16a34a">Téléphone</Etiquette>
                <Input value={f.beneficiaireTelephone} onChange={(e) => maj({ beneficiaireTelephone: e.target.value })} aria-label="Téléphone" />
              </div>
            </div>
            <div>
              <Etiquette icone={CalendarDays} couleur="#7c3aed">Date</Etiquette>
              <Input type="date" value={f.date} onChange={(e) => maj({ date: e.target.value })} />
            </div>
            <Choix actif={f.caisseCommune} couleur="#7c3aed" icone={PiggyBank} onClick={() => maj({ caisseCommune: !f.caisseCommune })}>Payée depuis la caisse commune</Choix>
          </div>
        </div>
      )}
    </Modal>
  )
}
