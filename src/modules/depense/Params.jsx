// Paramètres Dépenses — export des dépenses + réinitialisation.
import { useState, useEffect } from 'react'
import { FileSpreadsheet, FileText, FileDown, Trash2, AlertTriangle, Archive, Save, RotateCcw } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { usePDF } from '../../hooks/usePDF'
import { isFullAccessRole } from '../../core/roles'
import { removeItem, setItem } from '../../core/db'
import { reinitialiserApplication, COLLECTIONS_A_REINITIALISER } from '../../core/resetApplication'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { SECTEURS } from './data'

// Conservation des données : au bout de combien d'années les dépenses E-DÉPENSES
// sont supprimées automatiquement. Réglage INDÉPENDANT de celui d'E-G.Pro (chaque
// module a sa propre durée de conservation, dans sa propre collection de
// paramètres) — voir DepensePurgeWatcher pour le mécanisme de purge lui-même.
function SectionConservation() {
  const { role } = useAuth()
  const peutModifier = isFullAccessRole(role)
  const { data: configs } = useCollection('depense_params')
  const [annees, setAnnees] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    const cfg = configs.find((c) => c.id === 'retention')
    setAnnees(cfg?.anneesDepenses ? String(cfg.anneesDepenses) : '')
  }, [configs])

  const handleSave = async () => {
    if (!peutModifier) return
    setSaving(true)
    try {
      const n = Number(annees) || 0
      await setItem('depense_params', 'retention', { id: 'retention', anneesDepenses: n, updatedAt: Date.now() })
      await audit('depense', 'retention_modifiee', n > 0 ? `Purge des dépenses de plus de ${n} an(s)` : 'Purge automatique désactivée')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  return (
    <Card title={<span className="flex items-center gap-2"><Archive size={15} className="text-slate-500" />Conservation des données</span>}>
      <p className="mb-4 text-xs text-gray-500">
        Supprime automatiquement les dépenses E-DÉPENSES de plus de X années. Réglage propre à ce module (indépendant d'E-G.Pro).
      </p>
      <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 backdrop-blur-sm">
        <p className="text-sm font-semibold text-slate-700">Purge des anciennes dépenses</p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number" min={0} max={50} disabled={!peutModifier}
            placeholder="désactivé"
            className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-gray-100 disabled:text-gray-500"
            value={annees}
            onChange={(e) => setAnnees(e.target.value)}
          />
          <span className="text-sm font-semibold text-slate-600">an(s)</span>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Laisser vide ou 0 = purge désactivée (rien n'est supprimé automatiquement).
        </p>
      </div>

      {peutModifier ? (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><RotateCcw size={14} className="mr-1.5 animate-spin" />Enregistrement…</> : <><Save size={14} className="mr-1.5" />Enregistrer</>}
          </Button>
          {saved && <span className="text-xs font-semibold text-green-600">✓ Enregistré</span>}
        </div>
      ) : (
        <p className="mt-4 text-xs italic text-gray-400">Réservé à la direction.</p>
      )}
    </Card>
  )
}

const ENTETES = ['Date', 'Secteur', 'Catégorie', 'Montant (FCFA)', 'Description', 'Enregistré par']

function ligneDe(d) {
  return [
    formatDateShort(d.date),
    SECTEURS.find((s) => s.id === d.secteurId)?.label || d.secteurId || '—',
    d.categorie || '—',
    Number(d.montant) || 0,
    d.description || '—',
    d.enregistrePar || '—'
  ]
}

const PHRASE_CONFIRMATION_APP = 'SUPPRIMER TOUT'

export default function Params() {
  const { role, user, login, logout } = useAuth()
  const { data: depenses } = useCollection('depense_depenses')
  const { data: budgets }  = useCollection('depense_budgets')
  const { generateRapportPDF } = usePDF('depense')

  const [exportingXLSX, setExportingXLSX] = useState(false)
  const [exportingPDF, setExportingPDF] = useState(false)
  const [exportingCSV, setExportingCSV] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Réinitialisation TOTALE de l'application (tous modules, tous secteurs) —
  // strictement réservée au super-administrateur, contrairement au reset
  // ci-dessus (dépenses/budgets E-DÉPENSES uniquement) ouvert à isAdmin au sens
  // large. Double confirmation volontaire (phrase à recopier + mot de passe
  // re-saisi) : action IRRÉVERSIBLE.
  const [resetAppOpen, setResetAppOpen] = useState(false)
  const [etapeResetApp, setEtapeResetApp] = useState('phrase') // 'phrase' | 'motdepasse' | 'suppression' | 'termine'
  const [phraseResetApp, setPhraseResetApp] = useState('')
  const [motDePasseResetApp, setMotDePasseResetApp] = useState('')
  const [erreurResetApp, setErreurResetApp] = useState('')
  const [verificationResetApp, setVerificationResetApp] = useState(false)
  const [progressionResetApp, setProgressionResetApp] = useState(null)

  const isAdmin = isFullAccessRole(role)
  // 'admin' est l'ancien identifiant du rôle « accès total » (concepteur) —
  // toujours en usage sur ce déploiement (cf. core/roles.js) — donc traité
  // ici au même titre que 'super_admin' pour cette action technique sensible.
  const estSuperAdmin = role === 'super_admin' || role === 'admin'

  function fermerResetApp() {
    if (etapeResetApp === 'suppression') return // pas d'annulation en cours de suppression
    setResetAppOpen(false)
    setEtapeResetApp('phrase')
    setPhraseResetApp('')
    setMotDePasseResetApp('')
    setErreurResetApp('')
    setProgressionResetApp(null)
  }

  async function confirmerResetApp() {
    setErreurResetApp('')
    if (!motDePasseResetApp) { setErreurResetApp('Saisissez votre mot de passe.'); return }
    setVerificationResetApp(true)
    try {
      const ok = await login(user.login, motDePasseResetApp)
      if (!ok) { setErreurResetApp('Mot de passe incorrect.'); return }
      setEtapeResetApp('suppression')
      const resultats = await reinitialiserApplication({
        keepUserId: user.uid,
        onProgress: (info) => setProgressionResetApp(info)
      })
      const totalSupprime = resultats.reduce((s, r) => s + r.removed, 0)
      await audit('portail', 'RESET_APPLICATION', `Réinitialisation complète de l'application (${totalSupprime} enregistrements supprimés sur ${resultats.length} collections)`)
      setEtapeResetApp('termine')
    } catch (e) {
      setErreurResetApp(e?.message || 'Une erreur est survenue pendant la réinitialisation.')
      setEtapeResetApp('motdepasse')
    } finally {
      setVerificationResetApp(false)
    }
  }

  async function terminerEtRechargerResetApp() {
    await logout()
    window.location.reload()
  }

  async function exportXLSX() {
    setExportingXLSX(true)
    try {
      const rows = depenses.map((d) => ({
        Date: formatDateShort(d.date),
        Secteur: SECTEURS.find((s) => s.id === d.secteurId)?.label || d.secteurId || '—',
        Catégorie: d.categorie || '—',
        Montant: Number(d.montant) || 0,
        Description: d.description || '—',
        'Enregistré par': d.enregistrePar || '—'
      }))
      await exportRapportExcel({
        filename: `depenses-${todayStr()}.xlsx`,
        sections: [{
          id: 'depenses', name: 'Dépenses',
          title: 'Suivi des dépenses — La Termitière',
          subtitle: `Exporté le ${formatDateShort(todayStr())} · ${depenses.length} dépense(s)`,
          columns: [
            { key: 'Date', label: 'Date', width: 14 },
            { key: 'Secteur', label: 'Secteur', width: 22 },
            { key: 'Catégorie', label: 'Catégorie', width: 22 },
            { key: 'Montant', label: 'Montant (FCFA)', width: 16 },
            { key: 'Description', label: 'Description', width: 40 },
            { key: 'Enregistré par', label: 'Enregistré par', width: 20 }
          ],
          rows
        }]
      })
      toast.success('Export Excel généré ✓')
    } finally {
      setExportingXLSX(false)
    }
  }

  async function exportPDF() {
    setExportingPDF(true)
    try {
      await generateRapportPDF({
        titre: 'Suivi des dépenses',
        colonnes: ENTETES,
        lignes: depenses.map(ligneDe),
        fichier: `depenses-${todayStr()}.pdf`
      })
      toast.success('Export PDF généré ✓')
    } finally {
      setExportingPDF(false)
    }
  }

  function exportCSV() {
    setExportingCSV(true)
    try {
      const escape = (v) => {
        const s = String(v ?? '')
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lignes = [ENTETES, ...depenses.map(ligneDe)]
      const csv = lignes.map((l) => l.map(escape).join(';')).join('\r\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `depenses-${todayStr()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export CSV généré ✓')
    } finally {
      setExportingCSV(false)
    }
  }

  async function resetDonnees() {
    if (!isAdmin) return toast.error('Action réservée à l\'administrateur')
    setResetting(true)
    try {
      for (const d of depenses) await removeItem('depense_depenses', d.id)
      for (const b of budgets) await removeItem('depense_budgets', b.id)
      await audit('depense', 'RESET', 'Réinitialisation complète des dépenses et budgets')
      toast.success('Données réinitialisées ✓')
      setResetOpen(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Export des dépenses">
        <p className="mb-4 text-sm text-gray-500">
          Exporte l'ensemble des dépenses enregistrées ({depenses.length}) dans le format de ton choix.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportXLSX} loading={exportingXLSX}>
            <FileSpreadsheet size={16} /> Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} loading={exportingPDF}>
            <FileText size={16} /> PDF
          </Button>
          <Button variant="outline" onClick={exportCSV} loading={exportingCSV}>
            <FileDown size={16} /> CSV
          </Button>
        </div>
      </Card>

      <Card title="Statistiques rapides">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SECTEURS.map((s) => {
            const count = depenses.filter((d) => d.secteurId === s.id).length
            return (
              <div key={s.id} className="rounded-2xl border border-gray-200/60 bg-white/50 p-3 shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150">
                <p className="text-xl font-extrabold text-gray-800">{count}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            )
          })}
        </div>
      </Card>

      <SectionConservation />

      {isAdmin && (
        <Card title="Réinitialisation des données" className="border-red-200">
          <div className="flex items-start gap-3 rounded-2xl border border-red-200/60 bg-red-50/60 p-4 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-900">Zone dangereuse</p>
              <p className="mt-1 text-sm text-red-700">
                Cette action supprime définitivement toutes les dépenses et tous les budgets alloués.
              </p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => setResetOpen(true)}>
                <Trash2 size={15} /> Réinitialiser les données
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Confirmer la réinitialisation"
        footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Annuler</Button><Button variant="danger" onClick={resetDonnees} loading={resetting}>Confirmer</Button></>}>
        <p className="text-sm text-red-700 font-semibold">Toutes les {depenses.length} dépenses et {budgets.length} budgets seront supprimés définitivement.</p>
        <p className="mt-2 text-sm text-gray-500">Cette action est irréversible.</p>
      </Modal>

      {estSuperAdmin && (
        <Card title="⚠️ Zone de danger — application entière" className="border-red-200">
          <div className="flex items-start gap-3 rounded-2xl border border-red-200/60 bg-red-50/60 p-4 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-900">Réinitialiser toute l'application</p>
              <p className="mt-1 text-sm text-red-700">
                Supprime définitivement les données de <strong>tous les secteurs et modules</strong> ({COLLECTIONS_A_REINITIALISER.length} collections :
                dépenses, recettes, stocks, comptes utilisateurs, journal d'audit…) — pas seulement E-DÉPENSES. Seul votre propre compte est conservé.
                Cette action est irréversible.
              </p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => setResetAppOpen(true)}>
                <Trash2 size={15} /> Réinitialiser l'application
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={resetAppOpen}
        onClose={fermerResetApp}
        title="Réinitialisation complète de l'application"
        footer={
          etapeResetApp === 'phrase' ? (
            <>
              <Button variant="ghost" onClick={fermerResetApp}>Annuler</Button>
              <Button variant="danger" disabled={phraseResetApp !== PHRASE_CONFIRMATION_APP} onClick={() => setEtapeResetApp('motdepasse')}>
                Continuer
              </Button>
            </>
          ) : etapeResetApp === 'motdepasse' ? (
            <>
              <Button variant="ghost" onClick={fermerResetApp}>Annuler</Button>
              <Button variant="danger" loading={verificationResetApp} onClick={confirmerResetApp}>
                Confirmer la réinitialisation
              </Button>
            </>
          ) : etapeResetApp === 'termine' ? (
            <Button variant="danger" onClick={terminerEtRechargerResetApp}>Fermer et recharger l'application</Button>
          ) : null
        }
      >
        {etapeResetApp === 'phrase' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-red-700">
              Cette action supprime définitivement toutes les données de tous les secteurs et modules (sauf votre compte). Irréversible.
            </p>
            <p className="text-sm text-gray-600">Pour continuer, recopiez exactement la phrase suivante :</p>
            <p className="rounded-lg bg-gray-100 px-3 py-2 text-center font-mono text-sm font-bold tracking-wide text-gray-800">
              {PHRASE_CONFIRMATION_APP}
            </p>
            <input
              type="text"
              value={phraseResetApp}
              onChange={(e) => setPhraseResetApp(e.target.value)}
              placeholder="Recopiez la phrase ci-dessus"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            {erreurResetApp && <p className="text-sm font-semibold text-red-600">{erreurResetApp}</p>}
          </div>
        )}

        {etapeResetApp === 'motdepasse' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Dernière étape : ressaisissez votre mot de passe pour confirmer.</p>
            <input
              type="password"
              value={motDePasseResetApp}
              onChange={(e) => setMotDePasseResetApp(e.target.value)}
              placeholder="Votre mot de passe"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && confirmerResetApp()}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            {erreurResetApp && <p className="text-sm font-semibold text-red-600">{erreurResetApp}</p>}
          </div>
        )}

        {etapeResetApp === 'suppression' && (
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm font-semibold text-gray-700">Réinitialisation en cours — ne fermez pas cette fenêtre…</p>
            {progressionResetApp && (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{ width: `${Math.round((progressionResetApp.index / progressionResetApp.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {progressionResetApp.index} / {progressionResetApp.total} collections traitées — {progressionResetApp.collection}
                </p>
              </>
            )}
          </div>
        )}

        {etapeResetApp === 'termine' && (
          <div className="space-y-2 py-2 text-center">
            <p className="text-sm font-semibold text-green-700">Réinitialisation terminée ✓</p>
            <p className="text-sm text-gray-600">L'application va se déconnecter et recharger sur un état vierge.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
