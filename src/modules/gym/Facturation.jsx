// MAXI-GYM — Facturation : liste des factures générées (depuis Séances/Abonnements).
import { useMemo, useState } from 'react'
import { Receipt, FileDown, Pencil, Trash2, Printer } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { usePDF } from '../../hooks/usePDF'
import { useAuth } from '../../hooks/useAuth'
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole } from '../../core/roles'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { imprimerTicketSeance } from './printTicket'
import { formatMoney, formatDateShort } from '../../utils/formatters'
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
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')

  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)

  const toutes = useMemo(() => [...factures].sort((a, b) => (a.date < b.date ? 1 : -1)), [factures])
  const liste = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((f) => (f.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((f) => (f.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((f) => f.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee])
  const total = useMemo(() => liste.reduce((s, x) => s + (Number(x.montant) || 0), 0), [liste])

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

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Receipt size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Facturation</h2>
          <p className="text-sm text-white/80">{liste.length} facture(s) — {formatMoney(total)} au total</p>
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Une facture est générée automatiquement à chaque enregistrement d'une séance ou d'un abonnement. Si une facture manque pour un enregistrement plus ancien, une icône 🧾 permet de la générer directement depuis le volet Séances/Abonnements concerné. Pour les séances, le ticket de caisse s'imprime automatiquement (imprimante thermique) — l'icône 🖨️ permet de le réimprimer à tout moment.
      </div>

      <FiltrePeriode mode={modePeriode} onModeChange={setModePeriode}
        valeurJour={filtreJour} onJourChange={setFiltreJour}
        valeurMois={filtreMois} onMoisChange={setFiltreMois}
        avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee} />

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
                  <button onClick={() => imprimerTicketSeance(r)} title="Imprimer le ticket" className="rounded p-1.5 text-orange-600 hover:bg-orange-50"><Printer size={16} /></button>
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
    </div>
  )
}
