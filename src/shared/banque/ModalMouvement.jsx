// Fenêtre d'ajout / modification d'un mouvement bancaire (dépôt ou retrait), utilisée par la page
// « Mouvements bancaires » de la Comptabilité. Un mouvement est enregistré dans la collection
// `${secteur}_banque`, avec la banque choisie (`banqueId` + `banqueNom`, pour rester lisible même si la
// banque est renommée ou supprimée). Ordre de saisie : type de mouvement, secteur, banque, puis le reste.
// La fenêtre garde la couleur du module (Comptabilité), quel que soit le secteur choisi.
import { useEffect, useState } from 'react'
import { Plus, Paperclip, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Layers, Landmark, Wallet, MapPin, Check, ChevronDown, ChevronUp } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import FormGroup from '../forms/FormGroup'
import Input from '../forms/Input'
import ChampAutocomplete from '../forms/ChampAutocomplete'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genId } from '../../utils/formatters'
import { lireFichier, formatTaille } from '../../utils/fichiers'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import { TYPES_MOUVEMENT_BANQUE } from '../../modules/depense/data'
import { COL } from '../../modules/comptabilite/data'
import { PREFIXE_AUTRE, SECTEUR_SANS, estAutreSource, collectionBanque, moduleAudit, idSource } from './comptes'

const COULEUR = COULEUR_MODULE.comptabilite || '#ea580c'
const COULEUR_BANQUE = '#0f766e' // les banques se distinguent des secteurs (orange du module) par leur teinte
const MAX_BANQUES_VISIBLES = 3 // à partir de 4 banques, la liste est réduite avec un bouton « Voir tout »

const vide = (secteurId) => ({ secteurId: secteurId || '', site: '', date: todayStr(), type: 'depot', libelle: '', origine: '', personne: '', montant: '', banqueId: '', piece: null })

// Étiquette d'une section : petite icône 3D qui flotte doucement, puis le libellé.
function Etiquette({ icone: Icone, couleur = COULEUR, children }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ ...icone3D(couleur), animation: 'mm-flotte 3.2s ease-in-out infinite' }}><Icone size={13} /></span>
      {children}
    </span>
  )
}

// Pastille de choix (secteur, banque) : pleine à la couleur du module quand elle est choisie.
function Choix({ actif, onClick, children, point, couleur = COULEUR }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${actif ? 'text-white shadow-md' : 'border-gray-200 bg-white text-gray-600 hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50'}`}
      style={actif ? { background: `linear-gradient(135deg, ${couleur}, ${couleur}cc)`, borderColor: couleur, animation: 'mm-pop 0.28s ease-out' } : undefined}>
      {point && <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white" style={{ background: point }} />}
      {children}
      {actif && <Check size={12} strokeWidth={3} />}
    </button>
  )
}

// secteurs : [{ id, nom, color }] ; fixeSecteur : le secteur ne se choisit pas (modification) ;
// mouvement : le mouvement à modifier (null = nouveau) ; banques : [{ id, nom }].
export default function ModalMouvement({ open, onClose, secteurs, secteurId, fixeSecteur = false, mouvement = null, banques = [], suggestions = {}, user }) {
  const [d, setD] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toutesBanques, setToutesBanques] = useState(false)
  const [nouvelleSource, setNouvelleSource] = useState(null) // null = fermé, sinon le nom en cours de saisie

  useEffect(() => {
    if (!open) return
    setToutesBanques(false)
    setNouvelleSource(null)
    setD(mouvement ? { ...vide(secteurId), ...mouvement, secteurId } : vide(secteurId))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !d) return null
  const secteur = secteurs.find((s) => s.id === d.secteurId) || null
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const edition = !!mouvement
  const origines = [...new Set([...(secteur ? [`RECETTE ${secteur.nom.toUpperCase()}`] : []), ...(suggestions.origines || [])])]

  // Banques affichées : toutes, ou les 3 premières (+ la banque choisie) à partir de 4 banques.
  const reduit = banques.length > MAX_BANQUES_VISIBLES && !toutesBanques
  let banquesVisibles = reduit ? banques.slice(0, MAX_BANQUES_VISIBLES) : banques
  if (reduit && d.banqueId && !banquesVisibles.some((b) => b.id === d.banqueId)) {
    const choisie = banques.find((b) => b.id === d.banqueId)
    if (choisie) banquesVisibles = [...banquesVisibles.slice(0, MAX_BANQUES_VISIBLES - 1), choisie]
  }

  async function choisirPiece(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try { set('piece', await lireFichier(file)) } catch (err) { toast.error(err.message || 'Fichier illisible') } finally { setUploading(false) }
  }

  // Crée une autre source de revenus (hors secteurs) : elle apparaît ensuite dans la liste et dans les filtres.
  async function creerSource() {
    const nom = (nouvelleSource || '').trim()
    if (!nom) return toast.error('Donnez un nom à la source')
    if (secteurs.some((x) => x.nom.toLowerCase() === nom.toLowerCase())) return toast.error('Cette source existe déjà')
    const id = genId()
    await setItem(COL.sourcesRevenus, id, { id, nom, creePar: user?.nom || '', createdAt: Date.now() })
    await audit('comptabilite', 'BANQUE_SOURCE_CREATE', `Nouvelle source de revenus : ${nom}`)
    setD((v) => ({ ...v, secteurId: `${PREFIXE_AUTRE}${id}`, site: '' }))
    setNouvelleSource(null)
    toast.success('Source ajoutée ✓')
  }

  async function enregistrer() {
    if (saving) return
    if (secteur?.sites?.length && !d.site) return toast.error(`Choisissez le site de ${secteur.nom}`)
    if (!d.banqueId) return toast.error(banques.length ? 'Précisez la banque du mouvement' : 'Aucune banque enregistrée : ajoutez-en dans Comptabilité, Paramètres')
    if (!d.date) return toast.error('Date requise')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    setSaving(true)
    try {
      const montant = Number(d.montant)
      const banque = banques.find((b) => b.id === d.banqueId)
      const { secteurId: sidChoisi, secteurNom, siteNom, solde, ...champs } = d // champs d'affichage : jamais enregistrés
      const sid = sidChoisi || SECTEUR_SANS // aucun secteur choisi : le mouvement va dans le compte « SANS SECTEUR »
      void secteurNom; void siteNom; void solde
      const donnees = { ...champs, site: secteur?.sites?.length ? d.site : '', montant, banqueId: banque?.id || '', banqueNom: banque?.nom || '', banqueNumero: banque?.numero || '', ...(estAutreSource(sid) ? { sourceId: idSource(sid) } : {}) }
      const collection = collectionBanque(sid)
      const info = TYPES_MOUVEMENT_BANQUE[d.type]
      const desc = `${info.label} : ${montant.toLocaleString('fr-FR')} FCFA${banque ? ` (${banque.nom})` : ''}${d.origine ? ` (${d.origine})` : ''}`
      if (!edition) {
        const id = genId()
        await setItem(collection, id, { ...donnees, id, enregistrePar: user?.nom || ':', enregistreParUid: user?.uid || null, createdAt: Date.now() })
        await audit(moduleAudit(sid), 'BANQUE_MOUVEMENT_CREATE', desc, { type: d.type, montant, date: d.date })
        toast.success('Mouvement enregistré ✓')
      } else {
        await setItem(collection, mouvement.id, { ...donnees, id: mouvement.id })
        await audit(moduleAudit(sid), 'BANQUE_MOUVEMENT_EDIT', desc, { type: d.type, montant, date: d.date })
        toast.success('Mouvement mis à jour ✓')
      }
      onClose()
    } catch (e) {
      // Jamais d'échec silencieux : le motif du refus (droits, réseau…) s'affiche.
      console.error('[banque] enregistrement impossible', e)
      toast.error(e?.message || "L'enregistrement a échoué : réessayez ou prévenez l'administration.")
    } finally {
      setSaving(false)
    }
  }

  const bloc = 'rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm'
  const entree = (i) => ({ animation: `mm-entre 0.4s ease-out ${i * 0.07}s both` })
  const depot = d.type === 'depot'
  const teinteType = depot ? '#2563eb' : '#dc2626'
  return (
    <Modal open onClose={onClose} size="md" {...glassModalProps(COULEUR)}
      title={edition ? 'Modifier le mouvement' : 'Ajouter un mouvement bancaire'}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button><Button style={{ backgroundColor: COULEUR }} onClick={enregistrer} loading={saving}>{edition ? 'Mettre à jour' : 'Enregistrer'}</Button></>}>
      <style>{`
        @keyframes mm-entre { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes mm-pop { 0% { transform: scale(0.92); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
        @keyframes mm-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
        @keyframes mm-souffle { 0%, 100% { box-shadow: 0 4px 10px -3px rgba(0,0,0,0.4), 0 0 0 0 color-mix(in srgb, var(--t) 40%, transparent); } 50% { box-shadow: 0 4px 10px -3px rgba(0,0,0,0.4), 0 0 0 5px color-mix(in srgb, var(--t) 0%, transparent); } }
        @keyframes mm-doux-bas { from { transform: translateY(-1.5px); } to { transform: translateY(1.5px); } }
        @keyframes mm-doux-haut { from { transform: translateY(1.5px); } to { transform: translateY(-1.5px); } }
        @keyframes mm-onde { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--t) 55%, transparent); } 100% { box-shadow: 0 0 0 14px transparent; } }
        @keyframes mm-montant { 0% { transform: scale(0.96); opacity: 0.6; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
      <div className="space-y-3">
        {/* Compte concerné : type de mouvement d'abord, puis secteur et banque */}
        <div className={`${bloc} space-y-3`} style={entree(0)}>
          <div>
            <Etiquette icone={ArrowLeftRight} couleur={teinteType}>Type de mouvement</Etiquette>
            {/* Curseur animé : il glisse d'un choix à l'autre en changeant de couleur */}
            <div className="relative flex rounded-full bg-gray-100 p-1 shadow-inner" role="group" aria-label="Type de mouvement">
              {/* Curseur : sans « key », il GLISSE d'un choix à l'autre (et change de couleur) au lieu de réapparaître */}
              <span aria-hidden="true" className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full shadow-[0_4px_10px_-3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all duration-[380ms]"
                style={{ '--t': teinteType, transform: depot ? 'translateX(0)' : 'translateX(100%)', transitionTimingFunction: 'cubic-bezier(0.34, 1.3, 0.64, 1)', background: `linear-gradient(135deg, ${teinteType}, ${teinteType}cc)`, animation: 'mm-souffle 2.8s ease-in-out infinite' }} />
              {/* Onde qui s'étend à l'arrivée du curseur, à chaque changement de type */}
              <span key={d.type} aria-hidden="true" className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full"
                style={{ '--t': teinteType, transform: depot ? 'translateX(0)' : 'translateX(100%)', animation: 'mm-onde 0.6s ease-out 0.2s both' }} />
              {Object.entries(TYPES_MOUVEMENT_BANQUE).map(([k, v]) => {
                const actif = d.type === k
                const Icone = k === 'depot' ? ArrowDownCircle : ArrowUpCircle
                return (
                  <button key={k} type="button" onClick={() => set('type', k)} aria-pressed={actif}
                    className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-bold transition-colors ${actif ? 'text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                    <Icone size={16} style={actif ? { animation: `mm-pop 0.35s ease-out, ${k === 'depot' ? 'mm-doux-bas' : 'mm-doux-haut'} 1.8s ease-in-out 0.35s infinite alternate` } : undefined} /> {v.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <Etiquette icone={Layers}>Secteur {!fixeSecteur && <span className="font-semibold normal-case tracking-normal text-gray-400">(facultatif)</span>}</Etiquette>
            {!fixeSecteur ? (
              <>
              <div className="flex flex-wrap gap-1.5">
                {secteurs.map((x) => <Choix key={x.id} actif={d.secteurId === x.id} point={x.color} onClick={() => setD((v) => ({ ...v, secteurId: v.secteurId === x.id ? '' : x.id, site: '' }))}>{x.nom}</Choix>)}
                {nouvelleSource === null && (
                  <button type="button" onClick={() => setNouvelleSource('')}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-xs font-bold transition-all hover:-translate-y-0.5"
                    style={{ borderColor: COULEUR, color: COULEUR }}>
                    <Plus size={12} strokeWidth={3} /> Autre source
                  </button>
                )}
              </div>
              {nouvelleSource !== null && (
                <div className="mt-2 flex items-center gap-2" style={{ animation: 'mm-entre 0.3s ease-out' }}>
                  <input autoFocus value={nouvelleSource} onChange={(e) => setNouvelleSource(e.target.value)} placeholder="Nom de la source de revenus (ex: LOCATION)"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); creerSource() } if (e.key === 'Escape') setNouvelleSource(null) }}
                    className="input-base min-w-0 flex-1 !py-1.5 text-sm" />
                  <Button size="sm" style={{ backgroundColor: COULEUR }} onClick={creerSource}>Ajouter</Button>
                  <Button size="sm" variant="outline" onClick={() => setNouvelleSource(null)}>Annuler</Button>
                </div>
              )}
              </>
            ) : (
              <Choix actif onClick={() => {}} point={secteur?.color || '#64748b'}>{secteur?.nom || (d.secteurId === SECTEUR_SANS ? 'SANS SECTEUR' : ':')}</Choix>
            )}
          </div>

          {secteur?.sites?.length > 0 && (
            <div style={{ animation: 'mm-entre 0.3s ease-out' }}>
              <Etiquette icone={MapPin} couleur="#E8850F">Site de {secteur.nom} <span className="text-red-500">*</span></Etiquette>
              <div className="flex flex-wrap gap-1.5">
                {secteur.sites.map((st) => <Choix key={st.id} actif={d.site === st.id} couleur="#E8850F" onClick={() => set('site', d.site === st.id ? '' : st.id)}>{st.label}</Choix>)}
              </div>
            </div>
          )}

          <div>
            <Etiquette icone={Landmark} couleur={COULEUR_BANQUE}>Banque <span className="text-red-500">*</span></Etiquette>
            {banques.length === 0 ? (
              <p className="text-xs text-gray-400">Aucune banque enregistrée : ajoutez-en dans Comptabilité, Paramètres.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {banquesVisibles.map((b) => (
                  <Choix key={b.id} actif={d.banqueId === b.id} couleur={COULEUR_BANQUE} onClick={() => set('banqueId', d.banqueId === b.id ? '' : b.id)}><Landmark size={12} /> {b.nom}{b.numero ? <span className="font-mono text-[10px] opacity-80">••{String(b.numero).slice(-4)}</span> : null}</Choix>
                ))}
                {banques.length > MAX_BANQUES_VISIBLES && (
                  <button type="button" onClick={() => setToutesBanques((x) => !x)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-500 transition-all hover:-translate-y-0.5 hover:border-gray-400 hover:text-gray-700">
                    {toutesBanques ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Voir tout ({banques.length})</>}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Détails */}
        <div className={`${bloc} space-y-3`} style={entree(1)}>
          <div>
            <Etiquette icone={Wallet} couleur="#0d9488">Action, date et montant</Etiquette>
            <FormGroup label="Type d'action" className="!mb-2" hint="DEPOT, RETRAIT CHEQUE N°…, ALIMENTATION CAISSE…">
              <ChampAutocomplete value={d.libelle} onChange={(v) => set('libelle', v)} suggestions={suggestions.libelles || []} placeholder="ex: DEPOT" />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Date *" className="!mb-0"><Input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} /></FormGroup>
              <FormGroup label="Montant (FCFA) *" className="!mb-0"><Input type="number" min="0" value={d.montant} onChange={(e) => set('montant', e.target.value)} placeholder="ex: 100000" /></FormGroup>
            </div>
          </div>
          {Number(d.montant) > 0 && (
            <p key={d.montant} className={`text-sm font-extrabold ${depot ? 'text-blue-600' : 'text-red-600'}`} style={{ animation: 'mm-montant 0.25s ease-out' }}>{depot ? '+' : '-'}{Number(d.montant).toLocaleString('fr-FR')} FCFA</p>
          )}
        </div>

        {/* Traçabilité et justificatif */}
        <div className={`${bloc} space-y-3`} style={entree(2)}>
          <div>
            <Etiquette icone={MapPin} couleur="#7c3aed">Traçabilité</Etiquette>
            <FormGroup label="Origine / destination des fonds" className="!mb-2" hint="D'où vient l'argent (dépôt) ou à quoi il sert (retrait).">
              <ChampAutocomplete value={d.origine} onChange={(v) => set('origine', v)} suggestions={origines} placeholder="ex: RECETTE" />
            </FormGroup>
            <FormGroup label="Personne en charge" className="!mb-0">
              <ChampAutocomplete value={d.personne} onChange={(v) => set('personne', v)} suggestions={suggestions.personnes || []} placeholder="ex: DONGNIMA BAWI" />
            </FormGroup>
          </div>
          <div>
            <Etiquette icone={Paperclip} couleur="#475569">Justificatif <span className="font-medium normal-case text-gray-400">(optionnel)</span></Etiquette>
            {d.piece ? (
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" style={{ animation: 'mm-pop 0.28s ease-out' }}>
                <span className="flex min-w-0 items-center gap-2 text-gray-700"><Paperclip size={14} className="shrink-0" /> <span className="truncate">{d.piece.nom}</span> <span className="shrink-0 text-xs text-gray-400">({formatTaille(d.piece.taille)})</span></span>
                <button type="button" onClick={() => set('piece', null)} className="shrink-0 text-xs text-red-500 hover:underline">Retirer</button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-500 transition-all hover:-translate-y-0.5 hover:bg-gray-50">
                <Paperclip size={14} /> {uploading ? 'Chargement…' : 'Ajouter un justificatif (photo, PDF, Excel…)'}
                <input type="file" accept="image/*,application/pdf,.xlsx,.xls,.csv,.doc,.docx" className="hidden" onChange={choisirPiece} disabled={uploading} />
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
