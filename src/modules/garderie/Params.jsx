import { useState } from 'react'
import { Save, FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { formatMoney } from '../../utils/formatters'
import { useGarderieStore } from './store/garderieStore'
import { GROUPES_AGE, STATUTS_ENFANT, POSTES_PERSONNEL } from './data'
import { calcAge } from './logic'

export default function Params() {
  const { user, role } = useAuth()
  const { params, saveParams } = useGarderieStore()
  const { data: enfants }   = useCollection('garderie_enfants')
  const { data: personnel } = useCollection('garderie_personnel')
  const { data: paiements } = useCollection('garderie_paiements')

  const [form, setForm]     = useState({ ...params })
  const [saving, setSaving] = useState(false)

  const canEdit = isFullAccessRole(role)

  async function handleSave() {
    if (!canEdit) return
    setSaving(true)
    try {
      await saveParams(form)
      audit('garderie', 'PARAMS_SAVE', 'Paramètres garderie mis à jour')
      toast.success('Paramètres sauvegardés ✓')
    } finally {
      setSaving(false)
    }
  }

  function exportEnfants() {
    const rows = enfants.map((e) => ({
      Prénom: e.prenom,
      Nom: e.nom,
      'Date naissance': formatDateShort(e.dateNaissance),
      Âge: calcAge(e.dateNaissance) || '—',
      Groupe: GROUPES_AGE.find((g) => g.id === e.groupe)?.label || '—',
      Statut: STATUTS_ENFANT[e.statut]?.label || e.statut,
      'Parent / Tuteur': e.parentNom || '—',
      'Contact principal': e.parentContact || '—',
      'Contact secondaire': e.parentContact2 || '—',
      Allergies: e.allergies || '—',
      'Info médicale': e.infoMedicale || '—',
      "Date d'inscription": formatDateShort(e.dateInscription),
      Notes: e.notes || ''
    }))
    exportRapportExcel({ theme: 'garderie',
      filename: `enfants-garderie-${todayStr()}.xlsx`,
      sections: [{
        id: 'enfants', name: 'Enfants inscrits',
        title: 'Liste des enfants inscrits — Garderie',
        subtitle: `Exporté le ${formatDateShort(todayStr())} · ${enfants.length} enfant(s)`,
        columns: [
          { key: 'Prénom', label: 'Prénom', width: 14 },
          { key: 'Nom', label: 'Nom', width: 14 },
          { key: 'Date naissance', label: 'Date naissance', width: 16 },
          { key: 'Âge', label: 'Âge', width: 12 },
          { key: 'Groupe', label: 'Groupe', width: 18 },
          { key: 'Statut', label: 'Statut', width: 12 },
          { key: 'Parent / Tuteur', label: 'Parent / Tuteur', width: 22 },
          { key: 'Contact principal', label: 'Contact 1', width: 16 },
          { key: 'Contact secondaire', label: 'Contact 2', width: 16 },
          { key: 'Allergies', label: 'Allergies', width: 20 },
          { key: 'Info médicale', label: 'Info médicale', width: 24 },
          { key: "Date d'inscription", label: "Date d'inscription", width: 16 },
          { key: 'Notes', label: 'Notes', width: 30 }
        ],
        rows
      }]
    })
  }

  function exportPersonnel() {
    const rows = personnel.map((p) => ({
      Prénom: p.prenom, Nom: p.nom,
      Poste: POSTES_PERSONNEL.find((x) => x.id === p.poste)?.label || p.poste,
      Téléphone: p.telephone || '—',
      Horaire: p.horaire || '—',
      "Date d'embauche": formatDateShort(p.dateEmbauche),
      Statut: p.statut === 'actif' ? 'Actif' : 'Inactif',
      Notes: p.notes || ''
    }))
    exportRapportExcel({ theme: 'garderie',
      filename: `personnel-garderie-${todayStr()}.xlsx`,
      sections: [{
        id: 'personnel', name: 'Personnel',
        title: 'Liste du personnel — Garderie',
        subtitle: `Exporté le ${formatDateShort(todayStr())} · ${personnel.length} membre(s)`,
        columns: [
          { key: 'Prénom', label: 'Prénom', width: 14 },
          { key: 'Nom', label: 'Nom', width: 14 },
          { key: 'Poste', label: 'Poste', width: 24 },
          { key: 'Téléphone', label: 'Téléphone', width: 16 },
          { key: 'Horaire', label: 'Horaire', width: 16 },
          { key: "Date d'embauche", label: "Date d'embauche", width: 16 },
          { key: 'Statut', label: 'Statut', width: 10 },
          { key: 'Notes', label: 'Notes', width: 30 }
        ],
        rows
      }]
    })
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-5">
      {/* Config générale */}
      <Card title="Configuration de la garderie">
        {!canEdit && (
          <div className="mb-3 rounded-lg bg-yellow-50 px-4 py-2 text-sm text-yellow-700">
            Lecture seule — réservé aux administrateurs.
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Nom de la garderie">
            <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} disabled={!canEdit} />
          </FormGroup>
          <FormGroup label="Capacité maximale (enfants)">
            <Input type="number" value={form.capaciteMax} onChange={(e) => set('capaciteMax', Number(e.target.value))} disabled={!canEdit} />
          </FormGroup>
          <FormGroup label="Heure d'ouverture">
            <Input type="time" value={form.heureOuverture} onChange={(e) => set('heureOuverture', e.target.value)} disabled={!canEdit} />
          </FormGroup>
          <FormGroup label="Heure de fermeture">
            <Input type="time" value={form.heureFermeture} onChange={(e) => set('heureFermeture', e.target.value)} disabled={!canEdit} />
          </FormGroup>
          <FormGroup label="Tarif mensuel (FCFA)">
            <Input type="number" value={form.tarifMensuel} onChange={(e) => set('tarifMensuel', Number(e.target.value))} disabled={!canEdit} />
          </FormGroup>
          <FormGroup label="Frais d'inscription (FCFA)">
            <Input type="number" value={form.tarifInscription} onChange={(e) => set('tarifInscription', Number(e.target.value))} disabled={!canEdit} />
          </FormGroup>
        </div>
        {canEdit && (
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSave} loading={saving}><Save size={16} /> Sauvegarder</Button>
          </div>
        )}
      </Card>

      {/* Statistiques rapides */}
      <Card title="Statistiques">
        <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
          <div className="rounded-lg bg-orange-50 p-3 text-center">
            <p className="text-2xl font-extrabold text-orange-700">{enfants.filter((e) => e.statut === 'actif').length}</p>
            <p className="text-xs text-orange-500">Enfants actifs</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-center">
            <p className="text-2xl font-extrabold text-blue-700">{personnel.filter((p) => p.statut === 'actif').length}</p>
            <p className="text-xs text-blue-500">Personnel actif</p>
          </div>
          <div className="rounded-lg bg-green-50 p-3 text-center">
            <p className="text-2xl font-extrabold text-green-700">
              {formatMoney(paiements.reduce((s, p) => s + (Number(p.montantPaye) || 0), 0))}
            </p>
            <p className="text-xs text-green-500">Total encaissé</p>
          </div>
          <div className="rounded-lg bg-orange-50 p-3 text-center">
            <p className="text-2xl font-extrabold text-orange-700">{params.capaciteMax - enfants.filter((e) => e.statut === 'actif').length}</p>
            <p className="text-xs text-orange-500">Places disponibles</p>
          </div>
        </div>
      </Card>

      {/* Exports */}
      <Card title="Exports">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={exportEnfants}>
            <FileSpreadsheet size={16} /> Exporter les enfants (Excel)
          </Button>
          <Button variant="outline" onClick={exportPersonnel}>
            <FileSpreadsheet size={16} /> Exporter le personnel (Excel)
          </Button>
        </div>
      </Card>
    </div>
  )
}
