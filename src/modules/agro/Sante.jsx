// Santé animale MAXI-AGRO — onglets :
//   • Interventions : vaccinations / traitements (+ numéros des animaux traités,
//     produit issu du stock, rendez-vous de suivi).
//   • Stock vaccins & produits : entrées/sorties de stock + alertes (bas / périmé).
//   • Rendez-vous : suivis à venir + rappels envoyés à celui qui a enregistré.
//   • Bilan : synthèse (interventions par type, animaux traités, alertes).
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import BandeAgro from './BandeAgro'
import { BoutonBande, ChampBande, CLASSE_CHAMP_BANDE, OngletsBande } from '../../shared/ui/BandeauVolet'
import { Plus, FileDown, FileSpreadsheet, Trash2, Syringe, Boxes, CalendarClock, BarChart3, AlertTriangle, CheckCircle2, Bell, HeartPulse, Pill, Bug, Stethoscope, CalendarDays, CalendarCheck, PawPrint, Package } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import ModalAgro from './ModalAgro'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import { TuileVerre } from '../../shared/ui/ParamsVerre'
import { icone3D } from '../../utils/color'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole } from '../../core/roles'
import { useAgroStore } from './store/agroStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { exportRapportExcel } from '../../utils/excelReport'
import { todayStr, addDays, formatDateShort } from '../../utils/formatters'

const TYPES = [
  { value: 'vaccination', label: '💉 Vaccination', tone: 'info' },
  { value: 'traitement', label: '💊 Traitement', tone: 'warning' },
  { value: 'deparasitage', label: '🪱 Déparasitage', tone: 'success' },
  { value: 'autre', label: '🔧 Autre', tone: 'neutral' }
]
const toneOf = (t) => TYPES.find((x) => x.value === t)?.tone || 'neutral'
const labelOf = (t) => TYPES.find((x) => x.value === t)?.label || t

// Style par type d'intervention : icône et couleur (pastille 3D, filigrane, puces).
const TYPE_STYLE = {
  vaccination: { icone: Syringe, c: '#0284c7' },
  traitement: { icone: Pill, c: '#d97706' },
  deparasitage: { icone: Bug, c: '#16a34a' },
  autre: { icone: Stethoscope, c: '#64748b' }
}
const styleType = (t) => TYPE_STYLE[t] || TYPE_STYLE.autre
const sansEmoji = (t) => String(t || '').replace(/^\S+\s/, '')
const COUL_TONE = { danger: '#dc2626', warning: '#d97706', success: '#16a34a', info: '#0284c7', neutral: '#64748b' }

// Boutons d'action du volet : rendus dans la bande verte du haut (emplacement #agro-sante-actions) pour que
// chaque onglet y pose ses actions (export, création) sans quitter la bande.
function ActionsBande({ children }) {
  const [cible, setCible] = useState(null)
  useLayoutEffect(() => { setCible(document.getElementById('agro-sante-actions')) }, [])
  return cible ? createPortal(children, cible) : null
}

// Carte de verre d'une fiche (intervention, produit, rendez-vous) : halo de la couleur, entrée en cascade.
function CarteSante({ couleur, i = 0, children, className = '', onOuvrir }) {
  return (
    <article {...(onOuvrir ? { role: 'button', tabIndex: 0, onClick: onOuvrir, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir() } }, 'aria-label': 'Voir les détails' } : {})}
      className={`${onOuvrir ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ' : ''}ed-entree group relative overflow-hidden rounded-3xl border border-white/80 bg-white/65 p-4 shadow-[0_14px_28px_-18px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_34px_-18px_rgba(26,26,26,0.45),inset_0_1px_0_rgba(255,255,255,1)] ${className}`}
      style={{ animationDelay: `${Math.min(i, 9) * 45}ms`, borderColor: `${couleur}33` }}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-40" style={{ background: couleur }} />
      <div className="relative">{children}</div>
    </article>
  )
}

function Puce({ icone: Ic, children, couleur = '#475569' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/75 px-2 py-0.5 text-[11px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]" style={{ color: couleur }}>
      {Ic && <Ic size={12} aria-hidden="true" />}{children}
    </span>
  )
}

function VideSante({ icone: Ic, texte }) {
  return (
    <div className="ed-entree flex flex-col items-center gap-2 rounded-3xl border border-white/80 bg-white/60 px-6 py-10 text-center backdrop-blur-xl">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={icone3D('#2EAA3F')}><Ic size={22} /></span>
      <p className="max-w-sm text-sm text-gray-500">{texte}</p>
    </div>
  )
}

const PRODUIT_TYPES = ['Vaccin', 'Médicament', 'Antiparasitaire', 'Vitamine', 'Autre']

export default function Sante() {
  const { user } = useAuth()
  const { data: fiches } = useCollection('agro_sante')
  const { data: stock } = useCollection('agro_vaccins')
  const especes = useAgroStore((s) => s.especes)
  const { generateRapportPDF } = usePDF()

  const [tab, setTab] = useState('interventions')

  // Rappels automatiques : RDV arrivant à échéance (≤ demain) → notifie son auteur.
  useRappelsRDV(fiches)

  return (
    <div className="space-y-4">
      <BandeAgro icone={HeartPulse} titre="Santé du cheptel" sous="Interventions, stock de vaccins, rendez-vous et bilan">
        <OngletsBande valeur={tab} onChange={setTab} options={[
          { id: 'interventions', label: 'Interventions' },
          { id: 'stock', label: 'Stock vaccins' },
          { id: 'rdv', label: 'Rendez-vous' },
          { id: 'bilan', label: 'Bilan' }
        ]} />
        <div id="agro-sante-actions" className="flex flex-wrap items-end gap-2" />
      </BandeAgro>

      {/* Chiffres du moment : toujours visibles, quel que soit l'onglet */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TuileVerre icone={Syringe} couleur="#0284c7" titre="Interventions" valeur={statsSante(fiches, stock).totalFiches} sous="enregistrées" />
        <TuileVerre icone={PawPrint} couleur="#16a34a" titre="Animaux traités" valeur={statsSante(fiches, stock).totalAnimaux} sous="cumul" />
        <TuileVerre icone={CalendarClock} couleur="#7c3aed" titre="RDV à venir" valeur={statsSante(fiches, stock).rdvAVenir} sous="suivis programmés" />
        <TuileVerre icone={AlertTriangle} couleur={statsSante(fiches, stock).rdvRetard + statsSante(fiches, stock).stockBas ? '#dc2626' : '#64748b'} titre="À surveiller" valeur={statsSante(fiches, stock).rdvRetard + statsSante(fiches, stock).stockBas} sous={`${statsSante(fiches, stock).rdvRetard} RDV en retard · ${statsSante(fiches, stock).stockBas} produit(s)`} />
      </div>

      {tab === 'interventions' && <Interventions fiches={fiches} stock={stock} especes={especes} user={user} generateRapportPDF={generateRapportPDF} />}
      {tab === 'stock' && <StockVaccins stock={stock} user={user} fiches={fiches} />}
      {tab === 'rdv' && <RendezVous fiches={fiches} user={user} />}
      {tab === 'bilan' && <Bilan fiches={fiches} stock={stock} />}
    </div>
  )
}

// ─────────── Onglet INTERVENTIONS ───────────
const joursJusqua = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000)

// Fenêtre « fiche » : en-tête coloré, chiffres clés en tuiles, puis lignes libellé / valeur, note et liste liée éventuelles.
function FicheSante({ ouvert, onClose, icone, couleur, titre, sous, tuiles = [], lignes = [], puces = [], puceTitre, note, liee, pied }) {
  const lignesVisibles = lignes.filter(([, v]) => v !== undefined && v !== null && v !== '')
  return (
    <ModalAgro open={ouvert} onClose={onClose} title={titre} titreHero={titre} icone={icone} intro={sous} size="lg"
      footer={<>{pied}<Button variant="ghost" onClick={onClose}>Fermer</Button></>}>
      <div className="space-y-3">
        {tuiles.length > 0 && (
          <div className={`grid gap-2.5 ${tuiles.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
            {tuiles.map((t) => <TuileVerre key={t.titre} icone={t.icone} couleur={t.couleur || couleur} titre={t.titre} valeur={t.valeur} sous={t.sous} />)}
          </div>
        )}
        {lignesVisibles.length > 0 && (
          <dl className="divide-y divide-white/70 overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-md">
            {lignesVisibles.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
                <dt className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500">{k}</dt>
                <dd className="min-w-0 text-right text-sm font-semibold text-gray-800">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {puces.length > 0 && (
          <div className="rounded-2xl border border-white/80 bg-white/60 p-3 backdrop-blur-md">
            <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">{puceTitre}</p>
            <div className="flex flex-wrap gap-1.5">{puces.map((p) => <span key={p} className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 font-mono text-[11px] font-bold text-gray-700">{p}</span>)}</div>
          </div>
        )}
        {note && (
          <div className="rounded-2xl border border-white/80 bg-white/60 p-3 backdrop-blur-md">
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">Notes</p>
            <p className="whitespace-pre-line text-sm text-gray-700">{note}</p>
          </div>
        )}
        {liee}
      </div>
    </ModalAgro>
  )
}

function statsSante(fiches, stock) {
  const parType = {}
  let totalAnimaux = 0
  fiches.forEach((f) => { parType[f.type] = (parType[f.type] || 0) + 1; totalAnimaux += f.nombreAnimaux || 0 })
  const rdvAVenir = fiches.filter((f) => f.prochainRdv && !f.rdvFait && f.prochainRdv >= todayStr()).length
  const rdvRetard = fiches.filter((f) => f.prochainRdv && !f.rdvFait && f.prochainRdv < todayStr()).length
  const stockBas = stock.filter((x) => {
    const perime = x.peremption && x.peremption < todayStr()
    return perime || (x.quantite || 0) <= 0 || (x.seuilAlerte && (x.quantite || 0) <= x.seuilAlerte)
  }).length
  return { parType, totalAnimaux, rdvAVenir, rdvRetard, stockBas, totalFiches: fiches.length }
}

function Interventions({ fiches, stock, especes, user, generateRapportPDF }) {
  const lectureSeule = isReadOnlyRole(useAuth((s) => s.role))
  const [filtreType, setFiltreType] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [detailId, setDetailId] = useState(null)

  const liste = useMemo(
    () => [...fiches].filter((f) => !filtreType || f.type === filtreType).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [fiches, filtreType]
  )

  function openCreate() {
    setForm({
      date: todayStr(), especeId: especes[0]?.id || '', type: 'vaccination',
      produit: '', produitStockId: '', quantiteUtilisee: 0,
      dosage: '', veterinaire: '', nombreAnimaux: 1, animauxIds: '',
      prochainRdv: '', rdvNote: '', description: ''
    })
    setOpen(true)
  }

  async function save() {
    if (!form.produit.trim() && !form.produitStockId) return toast.error('Indiquez le produit (saisi ou issu du stock)')
    const esp = especes.find((e) => e.id === form.especeId)
    const stockItem = stock.find((s) => s.id === form.produitStockId)
    const produitNom = stockItem?.nom || form.produit.trim()
    const qteUtil = parseInt(form.quantiteUtilisee) || 0

    const fiche = {
      ...form,
      produit: produitNom,
      especeNom: esp?.nom || '',
      nombreAnimaux: parseInt(form.nombreAnimaux) || 0,
      quantiteUtilisee: qteUtil,
      animauxIds: form.animauxIds.trim(),
      agentId: user.uid,
      creeParLogin: user.login,
      creeParNom: user.nom,
      rappelNotifie: false,
      rdvFait: false
    }
    const id = await addItem('agro_sante', fiche)

    // Décrémente le stock si un produit du stock a été utilisé.
    if (stockItem && qteUtil > 0) {
      await updateItem('agro_vaccins', stockItem.id, { quantite: Math.max(0, (stockItem.quantite || 0) - qteUtil) })
    }

    await audit('agro', 'VACCIN', `${labelOf(form.type)} : ${esp?.nom} (${produitNom}) sur ${fiche.nombreAnimaux} animal(aux)`, {
      Type: labelOf(form.type), Espèce: esp?.nom, Produit: produitNom, Dosage: form.dosage,
      'Nb animaux': fiche.nombreAnimaux, 'Numéros animaux': fiche.animauxIds || '—',
      Vétérinaire: form.veterinaire || '—', 'Stock décrémenté': stockItem ? `${qteUtil} ${stockItem.unite || ''}` : '—',
      'Prochain RDV': form.prochainRdv || '—'
    })

    if (form.prochainRdv) {
      await audit('agro', 'RDV', `Suivi programmé le ${form.prochainRdv} : ${esp?.nom} (${produitNom})`, {
        'Date RDV': form.prochainRdv, Espèce: esp?.nom, Note: form.rdvNote || '—', 'Programmé par': user.nom
      })
    }

    // Notification immédiate à la GE et au PAU (tout enregistrement doit les alerter).
    await notify({
      type: 'info',
      title: `Intervention sanitaire : ${user.nom}`,
      body: `${labelOf(form.type)} · ${esp?.nom || ''} (${produitNom}) : ${fiche.nombreAnimaux} animal(aux)`,
      module: 'agro', forRoles: ['ge', 'df', 'pau'], excludeUid: user.uid, link: '/agro/sante'
    })

    toast.success('Intervention enregistrée ✓')
    setOpen(false)
  }

  async function supprimer(f) {
    if (!confirm('Supprimer cette intervention ?')) return
    await removeItem('agro_sante', f.id)
    await audit('agro', 'VACCIN', `Intervention supprimée : ${f.especeNom} (${f.produit})`)
    toast.success('Supprimée')
  }

  function exportPDF() {
    generateRapportPDF({
      titre: 'Rapport sanitaire',
      colonnes: ['Date', 'Espèce', 'Type', 'Produit', 'Nb', 'N° animaux', 'Vétérinaire', 'Prochain RDV'],
      lignes: liste.map((f) => [
        formatDateShort(f.date), f.especeNom, labelOf(f.type), f.produit,
        String(f.nombreAnimaux), f.animauxIds || '—', f.veterinaire || '—',
        f.prochainRdv ? formatDateShort(f.prochainRdv) : '—'
      ]),
      fichier: 'rapport-sanitaire.pdf'
    })
  }

  function exportXLSX() {
    exportRapportExcel({
      filename: 'rapport-sanitaire.xlsx',
      sections: [{
        name: 'Santé animale',
        title: 'Rapport sanitaire',
        subtitle: `${liste.length} intervention(s)${filtreType ? ` · ${labelOf(filtreType)}` : ''}`,
        columns: [
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Espèce', label: 'Espèce', width: 18 },
          { key: 'Type', label: 'Type', width: 14 },
          { key: 'Produit', label: 'Produit', width: 20 },
          { key: 'Dosage', label: 'Dosage', width: 14 },
          { key: 'Nb animaux', label: 'Nb animaux', width: 11, type: 'number' },
          { key: 'N° animaux', label: 'N° animaux', width: 20 },
          { key: 'Vétérinaire', label: 'Vétérinaire', width: 18 },
          { key: 'Prochain RDV', label: 'Prochain RDV', width: 14 },
          { key: 'Notes', label: 'Notes', width: 28 }
        ],
        rows: liste.map((f) => ({
          Date: formatDateShort(f.date),
          Espèce: f.especeNom,
          Type: labelOf(f.type).replace(/^[^\sA-Za-zÀ-ÿ]+\s*/, ''),
          Produit: f.produit,
          Dosage: f.dosage || '',
          'Nb animaux': f.nombreAnimaux || 0,
          'N° animaux': f.animauxIds || '',
          Vétérinaire: f.veterinaire || '',
          'Prochain RDV': f.prochainRdv ? formatDateShort(f.prochainRdv) : '',
          Notes: f.description || ''
        })),
        totals: { __label: 'TOTAL', 'Nb animaux': liste.reduce((s, f) => s + (f.nombreAnimaux || 0), 0) }
      }]
    })
    toast.success('Rapport santé Excel généré ✓')
  }

  return (
    <div className="space-y-4">
      <ActionsBande>
        <BoutonBande icone={FileSpreadsheet} plein={false} onClick={exportXLSX}>Rapport Excel</BoutonBande>
        <BoutonBande icone={FileDown} plein={false} onClick={exportPDF}>Rapport PDF</BoutonBande>
        {!lectureSeule && <BoutonBande anime icone={Plus} onClick={openCreate}>Nouvelle intervention</BoutonBande>}
      </ActionsBande>

      {/* Filtre par type : puces de verre à la couleur du type */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFiltreType('')} data-actif={!filtreType} aria-pressed={!filtreType} className="puce-verre rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ '--puce': '#475569' }}>Tous</button>
        {TYPES.map((t) => {
          const Ic = styleType(t.value).icone
          return (
            <button key={t.value} type="button" onClick={() => setFiltreType(filtreType === t.value ? '' : t.value)} data-actif={filtreType === t.value} aria-pressed={filtreType === t.value}
              className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ '--puce': styleType(t.value).c }}>
              <Ic size={13} aria-hidden="true" />{sansEmoji(t.label)}
            </button>
          )
        })}
      </div>

      {liste.length === 0 ? <VideSante icone={Syringe} texte="Aucune intervention enregistrée. Ajoutez une vaccination, un traitement ou un déparasitage." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {liste.map((r, i) => {
            const st = styleType(r.type)
            const Ic = st.icone
            return (
              <CarteSante key={r.id} couleur={st.c} i={i} onOuvrir={() => setDetailId(r.id)}>
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D(st.c)}><Ic size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-gray-900">{r.produit}</p>
                    <p className="text-xs font-semibold" style={{ color: st.c }}>{sansEmoji(labelOf(r.type))} · {r.especeNom}</p>
                  </div>
                  {!lectureSeule && <button onClick={(e) => { e.stopPropagation(); supprimer(r) }} aria-label="Supprimer" className="icone-verre icone-verre--danger rounded-xl p-1.5"><Trash2 size={15} /></button>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Puce icone={CalendarDays}>{formatDateShort(r.date)}</Puce>
                  <Puce icone={PawPrint}>{r.nombreAnimaux || 0} animal(aux)</Puce>
                  {r.veterinaire && <Puce icone={Stethoscope}>{r.veterinaire}</Puce>}
                  {r.prochainRdv && <Puce icone={CalendarClock} couleur="#0369a1">RDV {formatDateShort(r.prochainRdv)}</Puce>}
                </div>
                {r.animauxIds && <p className="mt-2 truncate font-mono text-[11px] text-gray-500">N° {r.animauxIds}</p>}
              </CarteSante>
            )
          })}
        </div>
      )}

      {(() => {
        const r = fiches.find((x) => x.id === detailId)
        if (!r) return null
        const st = styleType(r.type)
        const prod = stock.find((x) => x.id === r.produitStockId)
        const j = r.prochainRdv ? joursJusqua(r.prochainRdv) : null
        return (
          <FicheSante ouvert onClose={() => setDetailId(null)} icone={st.icone} couleur={st.c} titre={r.produit || 'Intervention'}
            sous={`${sansEmoji(labelOf(r.type))} · ${r.especeNom || 'espèce non précisée'} · ${formatDateShort(r.date)}`}
            tuiles={[
              { icone: PawPrint, titre: 'Animaux traités', valeur: r.nombreAnimaux || 0, sous: r.especeNom || '', couleur: '#16a34a' },
              { icone: Syringe, titre: 'Produit utilisé', valeur: r.produitStockId ? `${r.quantiteUtilisee || 0} ${prod?.unite || ''}` : (r.dosage || 'Saisie libre'), sous: prod ? `Stock : ${prod.nom}` : (r.dosage ? 'Dosage' : ''), couleur: st.c },
              { icone: CalendarClock, titre: 'Prochain RDV', valeur: r.prochainRdv ? formatDateShort(r.prochainRdv) : 'Aucun', sous: r.prochainRdv ? (r.rdvFait ? 'Clôturé' : j < 0 ? `En retard de ${-j} j` : j === 0 ? "Aujourd'hui" : `Dans ${j} j`) : '', couleur: r.prochainRdv && !r.rdvFait && j < 0 ? '#dc2626' : '#7c3aed' }
            ]}
            lignes={[
              ['Date', formatDateShort(r.date)], ['Type', sansEmoji(labelOf(r.type))], ['Espèce', r.especeNom], ['Produit', r.produit],
              ['Dosage', r.dosage], ['Vétérinaire', r.veterinaire], ['Note du rendez-vous', r.rdvNote], ['Enregistré par', r.creeParNom]
            ]}
            puces={String(r.animauxIds || '').split(',').map((x) => x.trim()).filter(Boolean)} puceTitre="Numéros des animaux"
            note={r.description}
            pied={!lectureSeule && <Button variant="danger" onClick={() => { setDetailId(null); supprimer(r) }}><Trash2 size={15} /> Supprimer</Button>} />
        )
      })()}

      <ModalAgro open={open} onClose={() => setOpen(false)} title="Nouvelle intervention sanitaire" size="lg" intro="Soin ou vaccination : le produit du stock est décompté automatiquement."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {form && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Date" required><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></FormGroup>
              <FormGroup label="Espèce" required>
                <Select value={form.especeId} onChange={(e) => setForm((f) => ({ ...f, especeId: e.target.value }))}>
                  {especes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Type" required>
                <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  options={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
              </FormGroup>
              <FormGroup label="Nombre d'animaux"><Input type="number" min="1" value={form.nombreAnimaux} onChange={(e) => setForm((f) => ({ ...f, nombreAnimaux: e.target.value }))} /></FormGroup>
            </div>

            <FormGroup label="Numéros des animaux traités / vaccinés" hint="ex : B-001, B-014, B-027 (béliers, boucles…)">
              <Input value={form.animauxIds} onChange={(e) => setForm((f) => ({ ...f, animauxIds: e.target.value }))} placeholder="B-001, B-014…" />
            </FormGroup>

            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Produit du stock" hint="Décrémente le stock automatiquement">
                <Select value={form.produitStockId} onChange={(e) => setForm((f) => ({ ...f, produitStockId: e.target.value }))}>
                  <option value="">Saisie libre ci-contre</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.nom} ({s.quantite ?? 0} {s.unite || ''})</option>)}
                </Select>
              </FormGroup>
              {form.produitStockId
                ? <FormGroup label="Quantité utilisée"><Input type="number" min="0" value={form.quantiteUtilisee} onChange={(e) => setForm((f) => ({ ...f, quantiteUtilisee: e.target.value }))} /></FormGroup>
                : <FormGroup label="Produit (saisie libre)" required><Input value={form.produit} onChange={(e) => setForm((f) => ({ ...f, produit: e.target.value }))} placeholder="ex : Vaccin PPR" /></FormGroup>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Dosage"><Input value={form.dosage} onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))} placeholder="ex : 1 ml / tête" /></FormGroup>
              <FormGroup label="Vétérinaire"><Input value={form.veterinaire} onChange={(e) => setForm((f) => ({ ...f, veterinaire: e.target.value }))} /></FormGroup>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg bg-sky-50 p-3">
              <FormGroup label="📅 Prochain rendez-vous (suivi)" hint="Un rappel vous sera envoyé">
                <Input type="date" value={form.prochainRdv} min={form.date} onChange={(e) => setForm((f) => ({ ...f, prochainRdv: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Note du rendez-vous"><Input value={form.rdvNote} onChange={(e) => setForm((f) => ({ ...f, rdvNote: e.target.value }))} placeholder="ex : rappel vaccin, 2e dose" /></FormGroup>
            </div>

            <FormGroup label="Description / notes">
              <textarea className="input-base" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </FormGroup>
          </>
        )}
      </ModalAgro>
    </div>
  )
}

// ─────────── Onglet STOCK VACCINS ───────────
function StockVaccins({ stock, user, fiches = [] }) {
  const lectureSeule = isReadOnlyRole(useAuth((s) => s.role))
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [detailId, setDetailId] = useState(null)

  const liste = useMemo(() => [...stock].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')), [stock])

  const etatStock = (s) => {
    const q = s.quantite || 0
    const seuil = s.seuilAlerte || 0
    const perime = s.peremption && s.peremption < todayStr()
    if (perime) return { label: 'Périmé', tone: 'danger' }
    if (q <= 0) return { label: 'Rupture', tone: 'danger' }
    if (seuil && q <= seuil) return { label: 'Stock bas', tone: 'warning' }
    return { label: 'OK', tone: 'success' }
  }

  function openCreate(item = null) {
    setForm(item
      ? { ...item }
      : { nom: '', type: 'Vaccin', quantite: 0, unite: 'doses', seuilAlerte: 5, peremption: '', note: '' })
    setOpen(true)
  }

  async function save() {
    if (!form.nom.trim()) return toast.error('Nom du produit requis')
    const data = {
      nom: form.nom.trim(), type: form.type,
      quantite: parseInt(form.quantite) || 0, unite: form.unite.trim() || 'unités',
      seuilAlerte: parseInt(form.seuilAlerte) || 0, peremption: form.peremption || '', note: form.note || ''
    }
    if (form.id) {
      await updateItem('agro_vaccins', form.id, data)
      await audit('agro', 'STOCK_VACCIN', `Stock modifié : ${data.nom} : ${data.quantite} ${data.unite}`, data)
    } else {
      await addItem('agro_vaccins', { ...data, creeParNom: user.nom })
      await audit('agro', 'STOCK_VACCIN', `Produit ajouté au stock : ${data.nom} : ${data.quantite} ${data.unite}`, data)
    }
    toast.success('Stock enregistré ✓')
    setOpen(false)
  }

  async function supprimer(s) {
    if (!confirm(`Supprimer « ${s.nom} » du stock ?`)) return
    await removeItem('agro_vaccins', s.id)
    await audit('agro', 'STOCK_VACCIN', `Produit retiré du stock : ${s.nom}`)
    toast.success('Supprimé')
  }

  const alertes = liste.filter((s) => ['danger', 'warning'].includes(etatStock(s).tone))

  return (
    <div className="space-y-4">
      <ActionsBande>
        {!lectureSeule && <BoutonBande anime icone={Plus} onClick={() => openCreate()}>Ajouter un produit</BoutonBande>}
      </ActionsBande>

      {alertes.length > 0 && (
        <div className="ed-entree flex items-center gap-2.5 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 to-white/70 px-4 py-3 text-sm font-semibold text-amber-900 backdrop-blur-md">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={icone3D('#d97706')}><AlertTriangle size={16} /></span>
          {alertes.length} produit(s) à réapprovisionner ou périmé(s)
        </div>
      )}

      {liste.length === 0 ? <VideSante icone={Package} texte="Aucun produit en stock. Ajoutez vos vaccins et médicaments." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {liste.map((r, i) => {
            const e = etatStock(r)
            const c = COUL_TONE[e.tone] || '#64748b'
            const q = r.quantite ?? 0
            const base = Math.max((r.seuilAlerte || 0) * 3, q, 1)
            const pct = Math.max(q > 0 ? 6 : 0, Math.min(100, Math.round((q / base) * 100)))
            return (
              <CarteSante key={r.id} couleur={c} i={i} onOuvrir={() => setDetailId(r.id)}>
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D(c)}><Package size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <span className="block max-w-full truncate text-left font-extrabold text-gray-900">{r.nom}</span>
                    <p className="text-xs text-gray-500">{r.type || 'Produit'}</p>
                  </div>
                  <Badge tone={e.tone}>{e.label}</Badge>
                  {!lectureSeule && <button onClick={(e) => { e.stopPropagation(); supprimer(r) }} aria-label="Supprimer" className="icone-verre icone-verre--danger rounded-xl p-1.5"><Trash2 size={15} /></button>}
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <p className="text-2xl font-black tabular-nums text-gray-900">{q}<span className="ml-1 text-sm font-bold text-gray-500">{r.unite || ''}</span></p>
                  {r.seuilAlerte ? <span className="text-[11px] font-semibold text-gray-500">alerte à {r.seuilAlerte}</span> : null}
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/5">
                  <div className="agro-barre h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${c}, ${c}bb)` }} />
                </div>
                {r.peremption && <div className="mt-2"><Puce icone={CalendarClock} couleur={r.peremption < todayStr() ? '#dc2626' : '#475569'}>Péremption {formatDateShort(r.peremption)}</Puce></div>}
              </CarteSante>
            )
          })}
        </div>
      )}

      {(() => {
        const r = liste.find((x) => x.id === detailId)
        if (!r) return null
        const e = etatStock(r)
        const c = COUL_TONE[e.tone] || '#64748b'
        const jp = r.peremption ? joursJusqua(r.peremption) : null
        const emplois = fiches.filter((f) => f.produitStockId === r.id || (f.produit || '').trim().toLowerCase() === (r.nom || '').trim().toLowerCase())
          .sort((a, b) => (a.date < b.date ? 1 : -1))
        return (
          <FicheSante ouvert onClose={() => setDetailId(null)} icone={Package} couleur={c} titre={r.nom}
            sous={`${r.type || 'Produit'} · ${e.label}`}
            tuiles={[
              { icone: Package, titre: 'En stock', valeur: `${r.quantite ?? 0} ${r.unite || ''}`, sous: r.seuilAlerte ? `Alerte à ${r.seuilAlerte}` : 'Pas de seuil', couleur: c },
              { icone: CalendarClock, titre: 'Péremption', valeur: r.peremption ? formatDateShort(r.peremption) : 'Non renseignée', sous: r.peremption ? (jp < 0 ? `Périmé depuis ${-jp} j` : jp === 0 ? "Périme aujourd'hui" : `Dans ${jp} j`) : '', couleur: r.peremption && jp < 0 ? '#dc2626' : '#475569' },
              { icone: Syringe, titre: 'Utilisations', valeur: emplois.length, sous: emplois.length ? `Dernière : ${formatDateShort(emplois[0].date)}` : 'Jamais utilisé', couleur: '#0284c7' }
            ]}
            lignes={[['Type', r.type], ['Unité', r.unite], ["Seuil d'alerte", r.seuilAlerte || ''], ['État', e.label]]}
            note={r.note}
            liee={emplois.length > 0 && (
              <div className="rounded-2xl border border-white/80 bg-white/60 p-3 backdrop-blur-md">
                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">Dernières interventions avec ce produit</p>
                <ul className="space-y-1">
                  {emplois.slice(0, 5).map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-semibold text-gray-800">{f.especeNom || 'Espèce non précisée'} · {sansEmoji(labelOf(f.type))}</span>
                      <span className="shrink-0 text-xs text-gray-500">{formatDateShort(f.date)} · {f.nombreAnimaux || 0} animal(aux)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            pied={!lectureSeule && <>
              <Button variant="danger" onClick={() => { setDetailId(null); supprimer(r) }}><Trash2 size={15} /> Supprimer</Button>
              <Button variant="outline" onClick={() => { setDetailId(null); openCreate(r) }}>Modifier</Button>
            </>} />
        )
      })()}

      <ModalAgro open={open} onClose={() => setOpen(false)} title={form?.id ? 'Modifier le produit' : 'Nouveau produit'}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {form && (
          <>
            <FormGroup label="Nom du produit" required>
              <Input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} placeholder="ex : Vaccin PPR" autoFocus />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Type">
                <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {PRODUIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Unité"><Input value={form.unite} onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))} placeholder="doses, ml, flacons…" /></FormGroup>
              <FormGroup label="Quantité en stock"><Input type="number" min="0" value={form.quantite} onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))} /></FormGroup>
              <FormGroup label="Seuil d'alerte" hint="Alerte si stock ≤ seuil"><Input type="number" min="0" value={form.seuilAlerte} onChange={(e) => setForm((f) => ({ ...f, seuilAlerte: e.target.value }))} /></FormGroup>
              <FormGroup label="Date de péremption" className="col-span-2"><Input type="date" value={form.peremption} onChange={(e) => setForm((f) => ({ ...f, peremption: e.target.value }))} /></FormGroup>
            </div>
            <FormGroup label="Note"><Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></FormGroup>
          </>
        )}
      </ModalAgro>
    </div>
  )
}

// ─────────── Onglet RENDEZ-VOUS ───────────
function RendezVous({ fiches, user }) {
  const lectureSeule = isReadOnlyRole(useAuth((s) => s.role))
  const [detailId, setDetailId] = useState(null)
  const rdvs = useMemo(
    () => fiches.filter((f) => f.prochainRdv).sort((a, b) => (a.prochainRdv < b.prochainRdv ? -1 : 1)),
    [fiches]
  )
  const aVenir = rdvs.filter((r) => !r.rdvFait && r.prochainRdv >= todayStr())
  const enRetard = rdvs.filter((r) => !r.rdvFait && r.prochainRdv < todayStr())
  const faits = rdvs.filter((r) => r.rdvFait)

  async function marquerFait(r) {
    await updateItem('agro_sante', r.id, { rdvFait: true })
    await audit('agro', 'RDV_FAIT', `Rendez-vous clôturé : ${r.especeNom} (${r.produit}) du ${r.prochainRdv}`)
    toast.success('Rendez-vous clôturé ✓')
  }

  const Item = ({ r, retard, i = 0 }) => {
    const d = new Date(r.prochainRdv + 'T00:00:00')
    const c = retard ? '#dc2626' : '#16a34a'
    return (
      <CarteSante couleur={c} i={i} onOuvrir={() => setDetailId(r.id)}>
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-white" style={icone3D(c)}>
            <span className="text-xl font-black leading-none">{d.getDate()}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide">{d.toLocaleDateString('fr-FR', { month: 'short' })}</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold text-gray-900">{r.especeNom} : {r.produit}</p>
            <p className="text-xs text-gray-500">{sansEmoji(labelOf(r.type))}{r.animauxIds ? ` · N° ${r.animauxIds}` : ''}</p>
            {r.rdvNote && <p className="mt-0.5 truncate text-xs italic text-gray-600">« {r.rdvNote} »</p>}
            <p className="mt-0.5 text-[11px] text-gray-400">Programmé par {r.creeParNom || '—'}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {retard && <Badge tone="danger">En retard</Badge>}
            {!lectureSeule && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); marquerFait(r) }}><CheckCircle2 size={15} /> Fait</Button>}
          </div>
        </div>
      </CarteSante>
    )
  }

  return (
    <div className="space-y-4">
      {(() => {
        const r = fiches.find((x) => x.id === detailId)
        if (!r) return null
        const j = joursJusqua(r.prochainRdv)
        const retard = !r.rdvFait && j < 0
        const c = r.rdvFait ? '#64748b' : retard ? '#dc2626' : '#16a34a'
        const st = styleType(r.type)
        return (
          <FicheSante ouvert onClose={() => setDetailId(null)} icone={CalendarClock} couleur={c} titre={`${r.especeNom || 'Rendez-vous'} : ${r.produit || ''}`}
            sous={`Suivi ${sansEmoji(labelOf(r.type)).toLowerCase()} · ${formatDateShort(r.prochainRdv)}`}
            tuiles={[
              { icone: CalendarClock, titre: 'Date du rendez-vous', valeur: formatDateShort(r.prochainRdv), sous: r.rdvFait ? 'Clôturé' : retard ? `En retard de ${-j} j` : j === 0 ? "Aujourd'hui" : `Dans ${j} j`, couleur: c },
              { icone: PawPrint, titre: 'Animaux concernés', valeur: r.nombreAnimaux || 0, sous: r.especeNom || '', couleur: '#16a34a' },
              { icone: st.icone, titre: 'Intervention d\'origine', valeur: sansEmoji(labelOf(r.type)), sous: formatDateShort(r.date), couleur: st.c }
            ]}
            lignes={[['Produit', r.produit], ['Dosage', r.dosage], ['Vétérinaire', r.veterinaire], ['Programmé par', r.creeParNom], ['Statut', r.rdvFait ? 'Clôturé' : retard ? 'En retard' : 'À venir']]}
            puces={String(r.animauxIds || '').split(',').map((x) => x.trim()).filter(Boolean)} puceTitre="Numéros des animaux"
            note={r.rdvNote}
            pied={!lectureSeule && !r.rdvFait && <Button variant="success" onClick={() => { setDetailId(null); marquerFait(r) }}><CheckCircle2 size={15} /> Marquer comme fait</Button>} />
        )
      })()}

      <div className="ed-entree flex items-center gap-2.5 rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50/90 to-white/70 px-4 py-3 text-sm text-sky-900 backdrop-blur-md">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#0284c7')}><Bell size={16} /></span>
        Un rappel automatique est envoyé à l'auteur d'un rendez-vous dès qu'il arrive à échéance (la veille ou le jour même).
      </div>

      {enRetard.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-red-600">En retard ({enRetard.length})</p>
          {enRetard.map((r, i) => <Item key={r.id} r={r} i={i} retard />)}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">À venir ({aVenir.length})</p>
        {aVenir.length === 0 ? <VideSante icone={CalendarCheck} texte="Aucun rendez-vous à venir." />
          : aVenir.map((r, i) => <Item key={r.id} r={r} i={i} />)}
      </div>

      {faits.length > 0 && (
        <details className="rounded-2xl border border-white/80 bg-white/60 p-3 backdrop-blur-md">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-gray-500">Clôturés ({faits.length})</summary>
          <div className="mt-2 space-y-1">
            {faits.map((r) => (
              <p key={r.id} className="flex items-center gap-1.5 text-sm text-gray-500"><CalendarCheck size={14} className="text-green-600" /> {formatDateShort(r.prochainRdv)} : {r.especeNom} ({r.produit})</p>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ─────────── Onglet BILAN ───────────
function Bilan({ fiches, stock }) {
  const stats = useMemo(() => {
    const parType = {}
    let totalAnimaux = 0
    fiches.forEach((f) => {
      parType[f.type] = (parType[f.type] || 0) + 1
      totalAnimaux += f.nombreAnimaux || 0
    })
    const rdvAVenir = fiches.filter((f) => f.prochainRdv && !f.rdvFait && f.prochainRdv >= todayStr()).length
    const rdvRetard = fiches.filter((f) => f.prochainRdv && !f.rdvFait && f.prochainRdv < todayStr()).length
    const stockBas = stock.filter((s) => {
      const perime = s.peremption && s.peremption < todayStr()
      return perime || (s.quantite || 0) <= 0 || (s.seuilAlerte && (s.quantite || 0) <= s.seuilAlerte)
    }).length
    return { parType, totalAnimaux, rdvAVenir, rdvRetard, stockBas, totalFiches: fiches.length }
  }, [fiches, stock])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Interventions par type">
          {stats.totalFiches === 0 ? <p className="py-4 text-center text-sm text-gray-400">Aucune intervention.</p> : (
            <div className="space-y-2">
              {TYPES.map((t) => {
                const n = stats.parType[t.value] || 0
                const pct = stats.totalFiches ? Math.round((n / stats.totalFiches) * 100) : 0
                return (
                  <div key={t.value}>
                    <div className="mb-1 flex items-center justify-between text-sm"><span className="inline-flex items-center gap-1.5 font-semibold text-gray-700">{(() => { const Ic = styleType(t.value).icone; return <Ic size={14} style={{ color: styleType(t.value).c }} aria-hidden="true" /> })()}{sansEmoji(t.label)}</span><span className="font-extrabold tabular-nums">{n}</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-black/5"><div className="agro-barre h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${styleType(t.value).c}, ${styleType(t.value).c}aa)` }} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="État du stock de produits">
          <div className="space-y-2 text-sm">
            <p className="flex justify-between"><span>Produits référencés</span><strong>{stock.length}</strong></p>
            <p className="flex justify-between"><span className="text-amber-700">À réapprovisionner / périmés</span><strong className="text-amber-700">{stats.stockBas}</strong></p>
            {stats.stockBas > 0 && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">Consultez l'onglet « Stock vaccins » pour le détail.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─────────── Rappels RDV (effet) ───────────
// Parcourt les fiches : si un RDV arrive à échéance (≤ demain), pas encore notifié
// ni clôturé → crée une notification ciblée sur l'auteur et marque la fiche notifiée.
function useRappelsRDV(fiches) {
  useEffect(() => {
    const seuil = addDays(todayStr(), 1) // aujourd'hui + demain
    fiches
      .filter((f) => f.prochainRdv && !f.rappelNotifie && !f.rdvFait && f.prochainRdv <= seuil)
      .forEach(async (f) => {
        // Marque d'abord pour éviter les doublons en cas de re-render concurrent.
        await updateItem('agro_sante', f.id, { rappelNotifie: true })
        await notify({
          type: 'rappel',
          title: '📅 Rappel : rendez-vous santé',
          body: `${f.especeNom} : ${f.produit} prévu le ${formatDateShort(f.prochainRdv)}${f.rdvNote ? ` (${f.rdvNote})` : ''}`,
          module: 'agro',
          forUsers: f.creeParLogin ? [f.creeParLogin] : [],
          link: '/agro/sante'
        })
      })
  }, [fiches])
}
