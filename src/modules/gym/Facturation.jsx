// MAXI-GYM — Facturation : liste des factures générées (depuis Séances/Abonnements).
import { useMemo, useState } from 'react'
import { Receipt, FileDown, FileSpreadsheet, Pencil, Trash2, Printer, Wallet, Ticket, CreditCard, Check } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import StatCard from '../../shared/ui/StatCard'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { usePDF } from '../../hooks/usePDF'
import { useAuth } from '../../hooks/useAuth'
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole, canExportExcel } from '../../core/roles'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { imprimerTicketSeance } from './printTicket'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useSite, matchSite } from './site/useSite'

const COULEUR = '#E8850F'

export default function Facturation() {
  const site = useSite()
  const { data: allFactures } = useCollection('gym_factures')
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const { generateFacturePDF } = usePDF('gym')
  const { role } = useAuth()
  const peutSupprimer = isFullAccessRole(role)

  // Filtre de période — Jour / Mois / Année, sur la liste affichée ci-dessous.
  // Par défaut sur le MOIS EN COURS (pas « Tous ») : c'est ce qui permet au Cumul
  // facturation de correspondre, dès l'ouverture, au « Total encaissé » du
  // Dashboard (lui aussi calé sur le mois en cours) — sans ça les deux chiffres
  // divergent simplement parce qu'ils ne couvrent pas la même période.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : modePeriode === 'annee' ? filtreAnnee : modePeriode === 'plage' ? (filtreDebut || filtreFin) : filtreJour

  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)

  const toutes = useMemo(() => [...factures].sort((a, b) => (a.date < b.date ? 1 : -1)), [factures])
  const liste = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((f) => (f.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((f) => (f.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      return toutes.filter((f) => (!filtreDebut || f.date >= filtreDebut) && (!filtreFin || f.date <= filtreFin))
    }
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((f) => f.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
  const total = useMemo(() => liste.reduce((s, x) => s + (Number(x.montant) || 0), 0), [liste])
  // Cumuls détaillés — séances / abonnements / les deux combinés (3 KPI distincts,
  // visibles de TOUS les rôles y compris l'agent : décision explicite, contrairement
  // au reste de l'app où ces totaux restent réservés à l'administration).
  const seancesListe = useMemo(() => liste.filter((f) => f.sourceType !== 'abonnement'), [liste])
  const abonnementsListe = useMemo(() => liste.filter((f) => f.sourceType === 'abonnement'), [liste])
  const totalSeances = useMemo(() => seancesListe.reduce((s, x) => s + (Number(x.montant) || 0), 0), [seancesListe])
  const totalAbonnements = useMemo(() => abonnementsListe.reduce((s, x) => s + (Number(x.montant) || 0), 0), [abonnementsListe])

  function reimprimer(f) {
    generateFacturePDF({
      numero: f.numero, date: f.date,
      client: { nom: f.clientNom, tel: f.clientTelephone || '' },
      lignes: [{ article: f.description, qte: 1, prixUnit: f.montant, total: f.montant }],
      totalHT: f.montant, totalTTC: f.montant
    })
  }

  async function enregistrerEdit() {
    if (!edit.clientNom.trim()) return toast.error('Nom du client requis')
    if (!edit.montant || Number(edit.montant) <= 0) return toast.error('Montant requis')
    setSaving(true)
    try {
      await updateItem('gym_factures', edit.id, {
        clientNom: edit.clientNom.trim(), montant: Number(edit.montant), description: edit.description.trim()
      })
      await audit('gym', 'FACTURE_MODIFIEE', `${edit.numero} — ${edit.clientNom.trim()} — ${Number(edit.montant).toLocaleString('fr-FR')} FCFA`)
      toast.success('Facture modifiée ✓')
      setEdit(null)
    } finally { setSaving(false) }
  }

  async function supprimer(f) {
    if (!confirm(`Supprimer la facture ${f.numero} de ${f.clientNom} ?`)) return
    await removeItem('gym_factures', f.id)
    await audit('gym', 'FACTURE_SUPPRIMEE', `${f.numero} — ${f.clientNom}`)
    toast.success('Facture supprimée')
  }

  // Export Excel — réservé à PAU/GE/Info (cf. canExportExcel). Plutôt qu'exporter
  // aveuglément toute la liste mélangée, on demande d'abord CE QUI doit être exporté
  // (séances / abonnements / les deux) — cf. modal ci-dessous — puis on génère UNE
  // FEUILLE PAR CATÉGORIE (au lieu d'une seule liste mêlant les deux avec une colonne
  // « Origine ») : plus lisible à l'ouverture, chaque feuille a ses propres totaux.
  const [exportOpen, setExportOpen] = useState(false)
  const [exportChoix, setExportChoix] = useState('both') // 'seances' | 'abonnements' | 'both'

  const feuilleDe = (nom, sousListe) => {
    const rows = sousListe.map((f) => ({
      'N°': f.numero,
      'Date': formatDateShort(f.date),
      'Client': f.clientNom || '—',
      'Description': f.description || '—',
      'Montant': Number(f.montant) || 0
    }))
    return {
      name: nom,
      title: `${nom} — MAXI-GYM`,
      subtitle: `${sousListe.length} ${nom.toLowerCase()}${sousListe.length > 1 ? 's' : ''} — ${formatMoney(rows.reduce((s, r) => s + r['Montant'], 0))} au total`,
      columns: [
        { key: 'N°', label: 'N°', width: 14 },
        { key: 'Date', label: 'Date', width: 12 },
        { key: 'Client', label: 'Client', width: 22 },
        { key: 'Description', label: 'Description', width: 34 },
        { key: 'Montant', label: 'Montant', width: 16, type: 'money' }
      ],
      rows,
      totals: { __label: 'TOTAL', 'Montant': rows.reduce((s, r) => s + r['Montant'], 0) }
    }
  }

  function exportXLSX() {
    const sections = []
    if (exportChoix === 'seances' || exportChoix === 'both') sections.push(feuilleDe('Séances', seancesListe))
    if (exportChoix === 'abonnements' || exportChoix === 'both') sections.push(feuilleDe('Abonnements', abonnementsListe))
    const suffixe = exportChoix === 'seances' ? 'seances' : exportChoix === 'abonnements' ? 'abonnements' : 'completes'
    exportRapportExcel({
      filename: `factures-maxi-gym-${suffixe}-${todayStr()}.xlsx`,
      sections
    })
    setExportOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Receipt size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Facturation</h2>
          <p className="text-sm text-white/80">{liste.length} facture(s) — {formatMoney(total)} au total</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism). */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
      </div>

      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Une facture est générée automatiquement à chaque enregistrement d'une séance ou d'un abonnement. Si une facture manque pour un enregistrement plus ancien, une icône 🧾 permet de la générer directement depuis le volet Séances/Abonnements concerné. Pour les séances, le ticket de caisse s'imprime automatiquement (imprimante thermique) — l'icône 🖨️ permet de le réimprimer à tout moment.
      </div>

      {/* 3 KPI de cumul — Séances, Abonnements, et les deux combinés — recalculés
          selon le filtre de période ci-dessous (`liste`). Visibles à TOUS les
          rôles, y compris l'agent (décision explicite). */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          title="Cumul séances"
          value={formatMoney(totalSeances)}
          sub={`${seancesListe.length} séance${seancesListe.length > 1 ? 's' : ''}${filtrePeriodeActif ? ' · période filtrée' : ''}`}
          icon={Ticket} accent={COULEUR_MODULE.gym} />
        <StatCard
          title="Cumul abonnements"
          value={formatMoney(totalAbonnements)}
          sub={`${abonnementsListe.length} abonnement${abonnementsListe.length > 1 ? 's' : ''}${filtrePeriodeActif ? ' · période filtrée' : ''}`}
          icon={CreditCard} accent="#A6342A" />
        <StatCard
          title="Cumul facturation (total)"
          value={formatMoney(total)}
          sub={`${liste.length} facture${liste.length > 1 ? 's' : ''}${filtrePeriodeActif ? ' · période filtrée' : ''}`}
          icon={Wallet} accent="#16a34a" />
      </div>

      {canExportExcel(role) && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setExportOpen(true)}><FileSpreadsheet size={16} /> Export Excel</Button>
        </div>
      )}

      <Card className="p-0">
        <Table
          columns={[
            { key: 'numero', label: 'N°', render: (r) => <span className="font-mono text-xs">{r.numero}</span> },
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'clientNom', label: 'Client' },
            { key: 'sourceType', label: 'Origine', render: (r) => <Badge tone="info">{r.sourceType === 'abonnement' ? 'Abonnement' : 'Séance'}</Badge> },
            { key: 'description', label: 'Description', render: (r) => r.description || '—' },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.montant)}</strong> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                {r.sourceType === 'seance' ? (
                  <button onClick={() => imprimerTicketSeance(r)}
                    title={r.imprime === false ? 'Pas encore imprimé — cliquer pour imprimer' : 'Réimprimer le ticket'}
                    className={`rounded p-1.5 hover:bg-orange-50 ${r.imprime === false ? 'text-amber-500' : 'text-orange-600'}`}><Printer size={16} /></button>
                ) : (
                  <button onClick={() => reimprimer(r)} title="Télécharger le PDF" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><FileDown size={16} /></button>
                )}
                <button onClick={() => setEdit({ id: r.id, numero: r.numero, clientNom: r.clientNom, montant: String(r.montant), description: r.description || '' })}
                  title="Modifier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                {peutSupprimer && (
                  <button onClick={() => supprimer(r)} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                )}
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucune facture générée pour l'instant."
        />
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Modifier la facture ${edit.numero}` : 'Modifier'}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<><Button variant="outline" onClick={() => setEdit(null)} disabled={saving}>Annuler</Button><Button onClick={enregistrerEdit} loading={saving}>Enregistrer</Button></>}>
        {edit && (
          <div className="space-y-3">
            <FormGroup label="Client" required>
              <Input value={edit.clientNom} onChange={(e) => setEdit((f) => ({ ...f, clientNom: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Montant (FCFA)" required>
              <Input type="number" min="0" value={edit.montant} onChange={(e) => setEdit((f) => ({ ...f, montant: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Description" hint="Optionnel">
              <Input value={edit.description} onChange={(e) => setEdit((f) => ({ ...f, description: e.target.value }))} />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Choix de l'export Excel — plutôt que d'exporter tout d'un coup, on demande
          d'abord la catégorie (séances / abonnements / les deux) : chaque catégorie
          choisie devient sa propre feuille, bien organisée, plutôt qu'une liste unique
          mélangée avec une colonne « Origine ». */}
      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Exporter la facturation"
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<><Button variant="outline" onClick={() => setExportOpen(false)}>Annuler</Button><Button onClick={exportXLSX}><FileSpreadsheet size={16} /> Effectuer l'export</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Que voulez-vous exporter ? (période actuellement filtrée : {liste.length} facture(s))</p>
          <div className="flex gap-2">
            {[
              { id: 'seances', label: 'Séances', icon: Ticket, desc: `${seancesListe.length} séance${seancesListe.length > 1 ? 's' : ''}` },
              { id: 'abonnements', label: 'Abonnements', icon: CreditCard, desc: `${abonnementsListe.length} abonnement${abonnementsListe.length > 1 ? 's' : ''}` },
              { id: 'both', label: 'Les deux', icon: Wallet, desc: `${liste.length} facture${liste.length > 1 ? 's' : ''}` }
            ].map((opt) => {
              const actif = exportChoix === opt.id
              const Icone = opt.icon
              return (
                <button key={opt.id} type="button" onClick={() => setExportChoix(opt.id)}
                  className={`relative flex flex-1 flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-sm font-bold transition-all ${actif ? 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.25)]' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
                  style={actif ? { borderColor: COULEUR, background: `${COULEUR}14`, color: COULEUR } : undefined}>
                  {actif && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ background: COULEUR }}>
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                  <Icone size={18} />
                  <span>{opt.label}</span>
                  <span className="text-[10px] font-normal text-gray-400">{opt.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </Modal>
    </div>
  )
}
