import { useState } from 'react'
import { Save, FileSpreadsheet, RotateCcw, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
import { audit } from '../../core/audit'
import { getAll, removeItem, setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { formatMoney } from '../../utils/formatters'
import { useGarderieStore } from './store/garderieStore'
import { GROUPES_AGE, STATUTS_ENFANT, POSTES_PERSONNEL, GRILLE_TARIFAIRE } from './data'
import { calcAge } from './logic'

export default function Params() {
  const { user, role } = useAuth()
  const { params, saveParams, grilleTarifaire, saveGrille } = useGarderieStore()
  const { data: enfants }   = useCollection('garderie_enfants')
  const { data: personnel } = useCollection('garderie_personnel')
  const { data: paiements } = useCollection('garderie_paiements')

  const [form, setForm]                 = useState({ ...params })
  const [saving, setSaving]             = useState(false)
  const [grille, setGrille]             = useState(grilleTarifaire)
  const [savingGrille, setSavingGrille] = useState(false)
  const [resetting, setResetting]       = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

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

  async function handleSaveGrille() {
    if (!canEdit) return
    for (const t of grille) {
      if (!t.tarif || Number(t.tarif) <= 0) return toast.error(`Tarif invalide pour "${t.label}"`)
    }
    setSavingGrille(true)
    try {
      await saveGrille(grille)
      audit('garderie', 'GRILLE_SAVE', 'Grille tarifaire mise à jour')
      toast.success('Grille tarifaire sauvegardée ✓')
    } finally {
      setSavingGrille(false)
    }
  }

  function setTarif(id, val) {
    setGrille((g) => g.map((t) => t.id === id ? { ...t, tarif: Number(val) } : t))
  }

  // Réinitialisation des paramètres aux valeurs par défaut
  async function reinitialiserParams() {
    setSaving(true)
    try {
      const defaut = {
        nom: 'Garderie La Termitière',
        tarifMensuel: 15000,
        tarifInscription: 5000,
        heureOuverture: '07:00',
        heureFermeture: '18:00',
        capaciteMax: 40,
        seuilAbsences: 3
      }
      await saveParams(defaut)
      setForm(defaut)
      audit('garderie', 'PARAMS_RESET', 'Paramètres réinitialisés aux valeurs par défaut')
      toast.success('Paramètres réinitialisés ✓')
    } finally {
      setSaving(false)
    }
  }

  // Réinitialisation complète de toutes les données garderie
  async function reinitialiserTout() {
    setResetting(true)
    try {
      const collections = [
        'garderie_enfants', 'garderie_presences', 'garderie_paiements',
        'garderie_incidents', 'garderie_menus', 'garderie_repas',
        'garderie_journaliers', 'garderie_nutrition', 'garderie_personnel'
      ]
      for (const col of collections) {
        const rows = await getAll(col)
        await Promise.all(rows.map((r) => removeItem(col, r.id)))
      }
      audit('garderie', 'RESET_TOUT', 'Toutes les données garderie réinitialisées')
      toast.success('Toutes les données ont été effacées ✓')
      setConfirmReset(false)
    } catch (err) {
      toast.error('Erreur lors de la réinitialisation')
    } finally {
      setResetting(false)
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
          <FormGroup label="Frais d'inscription (FCFA)">
            <Input type="number" value={form.tarifInscription} onChange={(e) => set('tarifInscription', Number(e.target.value))} disabled={!canEdit} />
          </FormGroup>
          <FormGroup label="Alerte absences répétées (jours consécutifs)">
            <Input type="number" min={1} max={30} value={form.seuilAbsences ?? 3} onChange={(e) => set('seuilAbsences', Number(e.target.value))} disabled={!canEdit} />
          </FormGroup>
        </div>

        {/* Grille tarifaire éditable */}
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase text-green-700">💰 Grille tarifaire par tranche d'âge</p>
            {canEdit && (
              <Button onClick={handleSaveGrille} loading={savingGrille} size="sm">
                <Save size={13} /> Sauvegarder la grille
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {grille.map((t) => (
              <div key={t.id} className="rounded-lg bg-white border border-green-100 px-3 py-3 shadow-sm">
                <p className="text-xs font-semibold text-green-700 mb-2">{t.label}</p>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min="0"
                      value={t.tarif}
                      onChange={(e) => setTarif(t.id, e.target.value)}
                      className="text-center font-bold"
                    />
                    <span className="text-xs text-gray-400 shrink-0">FCFA</span>
                  </div>
                ) : (
                  <p className="text-lg font-extrabold text-green-900 text-center">
                    {t.tarif.toLocaleString('fr-FR')} <span className="text-xs font-normal">FCFA</span>
                  </p>
                )}
                <p className="text-[10px] text-gray-400 text-center mt-1">par mois</p>
              </div>
            ))}
          </div>
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

      {/* ── Réinitialisation ── */}
      {canEdit && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Réinitialiser les paramètres seulement */}
          <Card title="🔄 Réinitialiser les paramètres">
            <p className="mb-3 text-sm text-gray-500">
              Remet les paramètres de configuration aux valeurs par défaut (nom, horaires, tarifs, capacité).
              Les données des enfants et du personnel ne sont pas affectées.
            </p>
            <Button variant="outline" onClick={() => {
              if (window.confirm('Réinitialiser les paramètres aux valeurs par défaut ?')) reinitialiserParams()
            }} loading={saving}>
              <RotateCcw size={16} /> Réinitialiser les paramètres
            </Button>
          </Card>

          {/* Tout réinitialiser */}
          <Card title="⚠️ Tout réinitialiser" className="border border-red-200">
            <p className="mb-3 text-sm text-gray-500">
              Efface <strong>toutes les données</strong> de la garderie : enfants, présences, paiements,
              incidents, menus, repas, nutrition et personnel.
              <strong className="text-red-600"> Cette action est irréversible.</strong>
            </p>
            {!confirmReset ? (
              <Button variant="danger" onClick={() => setConfirmReset(true)}>
                <AlertTriangle size={16} /> Tout réinitialiser
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-bold text-red-600">⚠️ Êtes-vous absolument sûr ? Cette action ne peut pas être annulée.</p>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={reinitialiserTout} loading={resetting}>
                    <RotateCcw size={16} /> Confirmer la réinitialisation
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmReset(false)}>Annuler</Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
