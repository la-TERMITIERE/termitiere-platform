// Compte bancaire — mouvements de dépôts et retraits à la banque (miroir du relevé
// bancaire), avec solde courant calculé automatiquement. Permet de suivre les
// mouvements de la banque du côté de l'entreprise, indépendamment de la caisse.
import { useMemo, useState } from 'react'
import { Plus, FilePen, Trash2, Landmark, ArrowDownCircle, ArrowUpCircle, Pencil, FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import * as XLSXns from 'xlsx-js-style'
import { SECTEURS, TYPES_MOUVEMENT_BANQUE, MOIS_LABELS } from './data'
import { isReadOnlyRole, isFullAccessRole } from '../../core/roles'

// xlsx-js-style est un module CJS : selon l'interop, l'API est sur le namespace ou `.default`.
const XLSX = XLSXns.default || XLSXns

const empty = () => ({ date: todayStr(), type: 'depot', libelle: '', origine: '', personne: '', montant: '' })

// Suggestions de libellé/origine — celles du relevé (dépôt de recette, retrait chèque…)
// + secteurs de l'entreprise, pour retrouver vite les motifs récurrents.
const LIBELLES_SUGGERES = ['DEPOT', 'RETRAIT', 'RETRAIT CHEQUE', 'ALIMENTATION CAISSE']
const ORIGINES_SECTEURS = SECTEURS.map((s) => `RECETTE ${s.label}`)

export default function Banque() {
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)
  const isAdmin = isFullAccessRole(role)

  const { data: mouvementsBruts, loading } = useCollection('depense_banque')
  const ouverture = useMemo(() => mouvementsBruts.find((m) => m.ouverture), [mouvementsBruts])
  const soldeInitial = Number(ouverture?.montant) || 0

  const [filtreMois, setFiltreMois] = useState('')
  const [modal, setModal] = useState(null)
  const [modalOuverture, setModalOuverture] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Solde courant : trié chronologiquement (date, puis heure de saisie en cas d'égalité)
  // en partant du solde d'ouverture, puis on ajoute/retranche chaque mouvement.
  const avecSolde = useMemo(() => {
    const rows = mouvementsBruts
      .filter((m) => !m.ouverture)
      .sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1))
    let solde = soldeInitial
    const out = rows.map((m) => {
      const signe = TYPES_MOUVEMENT_BANQUE[m.type]?.signe || 0
      solde += signe * (Number(m.montant) || 0)
      return { ...m, solde }
    })
    return out
  }, [mouvementsBruts, soldeInitial])

  // Affichage chronologique (du plus ancien au plus récent), comme le relevé papier.
  // Une ligne « SOLDE AU … » ouvre la liste — celle du solde d'ouverture global si
  // aucun mois n'est filtré, ou le solde recalculé à la veille du mois filtré (même
  // logique que le relevé, qui reporte le solde du mois précédent en tête de chaque
  // feuille mensuelle).
  const liste = useMemo(() => {
    let rows = avecSolde
    let soldeAvant = soldeInitial
    let dateSolde = ouverture?.date || null
    if (filtreMois) {
      const avant = avecSolde.filter((m) => (m.date || '').slice(0, 7) < filtreMois)
      soldeAvant = avant.length ? avant[avant.length - 1].solde : soldeInitial
      dateSolde = avant.length ? avant[avant.length - 1].date : dateSolde
      rows = avecSolde.filter((m) => (m.date || '').startsWith(filtreMois))
    }
    const ligneOuverture = {
      id: '__ouverture__', __ouverture: true,
      libelle: dateSolde ? `SOLDE AU ${formatDateShort(dateSolde)}` : 'SOLDE D\'OUVERTURE',
      solde: soldeAvant
    }
    return [ligneOuverture, ...rows]
  }, [avecSolde, filtreMois, soldeInitial, ouverture])

  const soldeActuel = avecSolde.length ? avecSolde[avecSolde.length - 1].solde : soldeInitial
  const mouvementsListe = liste.filter((m) => !m.__ouverture)
  const totalDepots = mouvementsListe.filter((m) => m.type === 'depot').reduce((s, m) => s + (Number(m.montant) || 0), 0)
  const totalRetraits = mouvementsListe.filter((m) => m.type === 'retrait').reduce((s, m) => s + (Number(m.montant) || 0), 0)

  const libelleSuggestions = useMemo(
    () => [...new Set([...LIBELLES_SUGGERES, ...mouvementsBruts.map((m) => m.libelle).filter(Boolean)])],
    [mouvementsBruts]
  )
  const origineSuggestions = useMemo(
    () => [...new Set([...ORIGINES_SECTEURS, ...mouvementsBruts.map((m) => m.origine).filter(Boolean)])].sort(),
    [mouvementsBruts]
  )
  const personneSuggestions = useMemo(
    () => [...new Set(mouvementsBruts.map((m) => m.personne).filter(Boolean))].sort(),
    [mouvementsBruts]
  )

  function openCreate() { setModal({ data: empty(), isNew: true }) }
  function openEdit(m) { setModal({ data: { ...empty(), ...m }, isNew: false, id: m.id }) }
  const set = (k, v) => setModal((s) => ({ ...s, data: { ...s.data, [k]: v } }))

  async function handleSave() {
    if (saving) return
    const d = modal.data
    if (!d.date) return toast.error('Date requise')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    setSaving(true)
    try {
      const montant = Number(d.montant)
      const info = TYPES_MOUVEMENT_BANQUE[d.type]
      const desc = `${info.label} — ${montant.toLocaleString('fr-FR')} FCFA${d.origine ? ` (${d.origine})` : ''}`
      if (modal.isNew) {
        const id = genId()
        await setItem('depense_banque', id, { ...d, id, montant, enregistrePar: user?.nom || '—', enregistreParUid: user?.uid || null, createdAt: Date.now() })
        await audit('depense', 'BANQUE_MOUVEMENT_CREATE', desc, { type: d.type, montant, date: d.date })
        toast.success('Mouvement enregistré ✓')
      } else {
        await setItem('depense_banque', modal.id, { ...d, id: modal.id, montant })
        await audit('depense', 'BANQUE_MOUVEMENT_EDIT', desc, { type: d.type, montant, date: d.date })
        toast.success('Mouvement mis à jour ✓')
      }
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!toDelete || deleting) return
    setDeleting(true)
    try {
      await removeItem('depense_banque', toDelete.id)
      await audit('depense', 'BANQUE_MOUVEMENT_DELETE', `${TYPES_MOUVEMENT_BANQUE[toDelete.type]?.label || toDelete.type} — ${Number(toDelete.montant).toLocaleString('fr-FR')} FCFA`)
      toast.success('Mouvement supprimé ✓')
      setToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaveOuverture() {
    if (saving) return
    setSaving(true)
    try {
      const montant = Number(modalOuverture.montant) || 0
      await setItem('depense_banque', ouverture?.id || 'ouverture', {
        id: ouverture?.id || 'ouverture', ouverture: true, montant, date: modalOuverture.date, type: 'ouverture'
      })
      await audit('depense', 'BANQUE_SOLDE_INITIAL', `Solde d'ouverture fixé à ${montant.toLocaleString('fr-FR')} FCFA au ${formatDateShort(modalOuverture.date)}`)
      toast.success('Solde d\'ouverture mis à jour ✓')
      setModalOuverture(null)
    } finally {
      setSaving(false)
    }
  }

  // Export Excel repris à l'identique de la mise en forme du relevé papier fourni :
  // titre + « MOIS : … », en-tête sur fond jaune, dépôts en bleu, retraits en rouge,
  // colonne Solde toujours en gras, lignes « SOLDE AU … » en gras, bordures fines.
  function exportExcel() {
    const JAUNE = 'FCE4A0'
    const BLEU = '1F4E96'
    const ROUGE = 'C0392B'
    const NOIR = '1A1A1A'
    const thin = { style: 'thin', color: { rgb: 'D9CFA0' } }
    const allBorders = { top: thin, bottom: thin, left: thin, right: thin }
    const COLS = ['DATE COMPTABLE', 'LIBELLE', 'ORIGINE/DESTINATION DES FONDS', 'PERSONNE EN CHARGE', 'DEBIT', 'CREDIT', 'SOLDE']

    const [an, mm] = (filtreMois || '').split('-').map(Number)
    const moisLabel = filtreMois ? (MOIS_LABELS[mm - 1] || '') : ''
    const sousTitre = filtreMois ? `MOIS : ${moisLabel.toUpperCase()} ${an}` : 'TOUTES PÉRIODES'

    const aoa = [
      ['MOUVEMENT MIROIR COMPTE BANCAIRE', '', '', '', '', '', ''],
      [sousTitre, '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      COLS
    ]
    liste.forEach((m) => {
      if (m.__ouverture) aoa.push(['', m.libelle, '', '', '', '', m.solde])
      else aoa.push([
        formatDateShort(m.date), m.libelle || TYPES_MOUVEMENT_BANQUE[m.type]?.label || '', m.origine || '', m.personne || '',
        m.type === 'depot' ? Number(m.montant) || 0 : '', m.type === 'retrait' ? Number(m.montant) || 0 : '', m.solde
      ])
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }]
    ws['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 32 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 16 }]
    ws['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 6 }, { hpt: 20 }]
    ws['!freeze'] = { xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft', state: 'frozen' }

    const put = (r, c, s) => { const a = XLSX.utils.encode_cell({ r, c }); if (!ws[a]) ws[a] = { t: 's', v: '' }; ws[a].s = s }
    put(0, 0, { font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: NOIR } } })
    put(1, 0, { font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '6B7280' } } })

    const HEADER_ROW = 3
    for (let c = 0; c < COLS.length; c++) {
      put(HEADER_ROW, c, {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: NOIR } },
        fill: { fgColor: { rgb: JAUNE } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: allBorders
      })
    }

    liste.forEach((m, i) => {
      const r = HEADER_ROW + 1 + i
      for (let c = 0; c < COLS.length; c++) {
        const a = XLSX.utils.encode_cell({ r, c })
        if (!ws[a]) ws[a] = { t: 's', v: '' }
        let color = '374151'
        let bold = c === 6 // Solde toujours en gras
        if (m.__ouverture) {
          bold = c === 1 || c === 6
        } else if (m.type === 'depot' && (c === 1 || c === 4)) {
          color = BLEU
        } else if (m.type === 'retrait' && (c === 1 || c === 5)) {
          color = ROUGE
        }
        ws[a].s = {
          font: { name: 'Calibri', sz: 10, bold, color: { rgb: color } },
          alignment: { horizontal: c === 0 ? 'center' : (c >= 4 ? 'right' : 'left'), vertical: 'center' },
          border: allBorders,
          ...(c >= 4 ? { numFmt: '#,##0' } : {})
        }
        if (c >= 4 && typeof ws[a].v === 'number') ws[a].t = 'n'
      }
    })

    const wb = XLSX.utils.book_new()
    wb.Props = { Title: 'Compte bancaire — LA TERMITIÈRE', Company: 'LA TERMITIÈRE', CreatedDate: new Date() }
    XLSX.utils.book_append_sheet(wb, ws, 'Compte bancaire')
    const suffixe = filtreMois ? `${moisLabel}-${an}` : 'Toutes-periodes'
    XLSX.writeFile(wb, `Compte-bancaire-${suffixe}.xlsx`)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-teal-200/60 bg-teal-50/60 px-4 py-3 text-sm text-teal-800 shadow-[0_16px_36px_-16px_rgba(13,148,136,0.14)]">
        <strong>Compte bancaire :</strong> enregistrez ici chaque <strong>dépôt</strong> et <strong>retrait</strong> effectué à la banque, pour suivre le solde bancaire de l'entreprise indépendamment de la caisse — c'est le miroir de votre relevé bancaire.
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Landmark size={22} /></div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-500">Solde actuel</p>
            <p className="text-xl font-black text-gray-900">{soldeActuel.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-gray-400">FCFA</span></p>
          </div>
          {isAdmin && (
            <button onClick={() => setModalOuverture({ montant: soldeInitial, date: ouverture?.date || todayStr() })}
              title="Modifier le solde d'ouverture" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary">
              <Pencil size={14} />
            </button>
          )}
        </Card>
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ArrowDownCircle size={22} /></div>
          <div>
            <p className="text-xs font-semibold text-gray-500">Dépôts {filtreMois ? '(période)' : ''}</p>
            <p className="text-lg font-extrabold text-blue-600">+{totalDepots.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-gray-400">FCFA</span></p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><ArrowUpCircle size={22} /></div>
          <div>
            <p className="text-xs font-semibold text-gray-500">Retraits {filtreMois ? '(période)' : ''}</p>
            <p className="text-lg font-extrabold text-red-600">-{totalRetraits.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-gray-400">FCFA</span></p>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Mois</label>
          <input type="month" value={filtreMois} onChange={(e) => setFiltreMois(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={liste.length === 0}><FileSpreadsheet size={16} /> Export Excel</Button>
          {!lectureSeule && <Button onClick={openCreate}><Plus size={16} /> Ajouter un mouvement</Button>}
        </div>
      </div>

      <Table
        columns={[
          { key: 'date', label: 'Date', render: (m) => m.__ouverture ? null : <span className="whitespace-nowrap text-xs font-semibold text-gray-700">{formatDateShort(m.date)}</span> },
          { key: 'type', label: 'Type', render: (m) => m.__ouverture ? null : <Badge tone={TYPES_MOUVEMENT_BANQUE[m.type]?.tone}>{TYPES_MOUVEMENT_BANQUE[m.type]?.label || m.type}</Badge> },
          { key: 'libelle', label: 'Libellé / Origine', render: (m) => m.__ouverture ? (
            <p className="font-extrabold uppercase tracking-wide text-gray-500">{m.libelle}</p>
          ) : (
            <div>
              <p className="font-semibold text-gray-800">{m.libelle || '—'}</p>
              {m.origine && <p className="text-xs text-gray-400">{m.origine}</p>}
            </div>
          ) },
          { key: 'personne', label: 'Personne en charge', render: (m) => m.__ouverture ? null : (m.personne || <span className="text-gray-300">—</span>) },
          { key: 'montant', label: 'Montant', align: 'right', render: (m) => m.__ouverture ? null : (
            <span className={`font-bold ${m.type === 'depot' ? 'text-blue-600' : 'text-red-600'}`}>
              {m.type === 'depot' ? '+' : '-'}{Number(m.montant).toLocaleString('fr-FR')}
            </span>
          ) },
          { key: 'solde', label: 'Solde', align: 'right', render: (m) => <span className="font-extrabold text-gray-900">{m.solde.toLocaleString('fr-FR')}</span> },
          { key: 'actions', label: '', align: 'right', render: (m) => !lectureSeule && !m.__ouverture && (
            <div className="flex justify-end gap-1">
              <button onClick={(e) => { e.stopPropagation(); openEdit(m) }} className="rounded p-1.5 text-primary hover:bg-primary/10"><FilePen size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); setToDelete(m) }} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
            </div>
          ) }
        ]}
        rows={liste}
        rowKey="id"
        loading={loading}
        empty={loading ? 'Chargement…' : 'Aucun mouvement bancaire enregistré.'}
      />

      {/* Modal création / édition d'un mouvement — verre dépoli ambre (charte E-DÉPENSES) */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        panelClassName="relative overflow-hidden bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200"
        title={modal?.isNew ? 'Ajouter un mouvement bancaire' : 'Modifier le mouvement'}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={handleSave} loading={saving}>{modal?.isNew ? 'Enregistrer' : 'Mettre à jour'}</Button></>}>
        {modal && (
          <div className="relative space-y-3">
            {/* Halos décoratifs — reprennent l'accent du mouvement (bleu dépôt / rouge retrait) */}
            <div className={`pointer-events-none absolute -right-16 -top-16 -z-10 h-52 w-52 rounded-full opacity-30 blur-3xl transition-colors ${modal.data.type === 'depot' ? 'bg-blue-500' : 'bg-red-500'}`} />
            <div className="pointer-events-none absolute -bottom-20 -left-14 -z-10 h-48 w-48 rounded-full bg-amber-500 opacity-20 blur-3xl" />

            {/* Type de mouvement */}
            <div className="rounded-xl border border-amber-100 bg-white/80 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">🏦 Type de mouvement</p>
              <div className="flex gap-2">
                {Object.entries(TYPES_MOUVEMENT_BANQUE).map(([k, v]) => {
                  const active = modal.data.type === k
                  const accent = k === 'depot' ? { border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-700' } : { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700' }
                  return (
                    <button key={k} type="button" onClick={() => set('type', k)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2.5 text-sm font-bold shadow-sm transition-all ${active ? `${accent.border} ${accent.bg} ${accent.text}` : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}`}>
                      {k === 'depot' ? '⬇️' : '⬆️'} {v.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Détails */}
            <div className="rounded-xl border border-amber-100 bg-white/80 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">💰 Détails</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Date *"><Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} /></FormGroup>
                <FormGroup label="Montant (FCFA) *"><Input type="number" min="0" value={modal.data.montant} onChange={(e) => set('montant', e.target.value)} placeholder="ex: 100000" /></FormGroup>
              </div>
              <FormGroup label="Libellé" className="mt-1" hint="Ex: DEPOT, RETRAIT CHEQUE N°…">
                <ChampAutocomplete value={modal.data.libelle} onChange={(v) => set('libelle', v)} suggestions={libelleSuggestions} placeholder="ex: DEPOT" accent="amber" />
              </FormGroup>
            </div>

            {/* Traçabilité */}
            <div className="rounded-xl border border-amber-100 bg-white/80 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">📍 Traçabilité</p>
              <FormGroup label="Origine / destination des fonds" hint="D'où vient l'argent (dépôt) ou à quoi il sert (retrait).">
                <ChampAutocomplete value={modal.data.origine} onChange={(v) => set('origine', v)} suggestions={origineSuggestions} placeholder="ex: RECETTE LOGISTIQUE" accent="amber" />
              </FormGroup>
              <FormGroup label="Personne en charge" className="mt-1">
                <ChampAutocomplete value={modal.data.personne} onChange={(v) => set('personne', v)} suggestions={personneSuggestions} placeholder="ex: DONGNIMA BAWI" accent="amber" />
              </FormGroup>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal solde d'ouverture (admin) — verre dépoli ambre */}
      <Modal open={!!modalOuverture} onClose={() => setModalOuverture(null)} size="sm" title="Solde d'ouverture du compte"
        panelClassName="relative overflow-hidden bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200"
        footer={<><Button variant="outline" onClick={() => setModalOuverture(null)} disabled={saving}>Annuler</Button><Button onClick={handleSaveOuverture} loading={saving}>Enregistrer</Button></>}>
        {modalOuverture && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-100 bg-white/80 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700"><Landmark size={13} /> Solde de référence</p>
              <p className="mb-2 text-xs text-gray-500">Solde du compte bancaire avant le premier mouvement enregistré ici. Tous les soldes affichés en découlent.</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Date"><Input type="date" value={modalOuverture.date} onChange={(e) => setModalOuverture((s) => ({ ...s, date: e.target.value }))} /></FormGroup>
                <FormGroup label="Montant (FCFA)"><Input type="number" value={modalOuverture.montant} onChange={(e) => setModalOuverture((s) => ({ ...s, montant: e.target.value }))} /></FormGroup>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer ce mouvement ?"
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={handleDelete} loading={deleting}>Supprimer</Button></>}>
        {toDelete && (
          <p className="text-sm text-gray-600">
            Vous allez supprimer le mouvement de <span className="font-bold text-gray-900">{Number(toDelete.montant).toLocaleString('fr-FR')} FCFA</span> du {formatDateShort(toDelete.date)}.
            Cette action est <span className="font-semibold text-red-600">irréversible</span> et recalculera le solde des mouvements suivants.
          </p>
        )}
      </Modal>
    </div>
  )
}
