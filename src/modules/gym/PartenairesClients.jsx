// MAXI-GYM — Clients partenaires : suivi des séances « portées au compte » d'une
// structure (CIMTOGO…). Ces clients ne paient pas sur place ; leur direction règle
// le lot en fin de mois. Ce volet regroupe les séances non réglées par structure,
// permet de marquer un mois réglé (génère UNE facture globale) et garde l'historique
// des règlements, exportable en Excel / PDF.
import { useMemo, useState } from 'react'
import { Handshake, FileSpreadsheet, FileDown, CheckCircle2, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import StatCard from '../../shared/ui/StatCard'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { usePDF } from '../../hooks/usePDF'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole, canExportExcel } from '../../core/roles'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatMoney, formatDateShort, todayStr, genNumero } from '../../utils/formatters'
import { categorieLabel } from './data'
import { useSite, matchSite, siteLabel } from './site/useSite'

const COULEUR = '#E8850F'
const finDeMois = (mois) => {
  const [a, m] = mois.split('-').map(Number)
  return new Date(a, m, 0).toISOString().slice(0, 10) // dernier jour du mois « YYYY-MM-DD »
}
const libelleMois = (mois) => {
  const [a, m] = mois.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

export default function PartenairesClients() {
  const site = useSite()
  const { user, role } = useAuth()
  const { generateRapportPDF } = usePDF('gym')
  const peutRegler = isFullAccessRole(role)

  const { data: allSeances } = useCollection('gym_seances')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allFactures } = useCollection('gym_factures')
  const { data: allReglements } = useCollection('gym_reglements_partenaires')

  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site) && s.partenaire), [allSeances, site])
  const clientsPartenaires = useMemo(() => allClients.filter((c) => matchSite(c, site) && c.partenaire), [allClients, site])
  const reglements = useMemo(
    () => allReglements.filter((r) => matchSite(r, site)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [allReglements, site]
  )

  // Mois de travail (sélecteur dans le bandeau) — on règle toutes les séances non
  // réglées dont la date est ≤ dernier jour de ce mois (le mois courant + les
  // éventuels arriérés des mois précédents).
  const [mois, setMois] = useState(todayStr().slice(0, 7))
  const dateLimite = finDeMois(mois)

  const [aConfirmer, setAConfirmer] = useState(null) // { structure, seances[], total }
  const [saving, setSaving] = useState(false)

  // Regroupement par structure — séances non réglées, réparties « à régler pour ce
  // mois » (date ≤ fin du mois sélectionné) et « à venir » (postérieures).
  const groupes = useMemo(() => {
    const map = new Map()
    for (const s of seances) {
      const structure = (s.partenaireStructure || '').trim() || 'Structure non renseignée'
      if (!map.has(structure)) map.set(structure, { structure, aRegler: [], futures: [], reglees: [] })
      const g = map.get(structure)
      if (s.regleParPartenaire) g.reglees.push(s)
      else if ((s.date || '') <= dateLimite) g.aRegler.push(s)
      else g.futures.push(s)
    }
    // Structures marquées sur une fiche client mais sans aucune séance : on les
    // affiche quand même (total 0) pour que la liste reflète le paramétrage.
    for (const c of clientsPartenaires) {
      const structure = (c.partenaireStructure || '').trim() || 'Structure non renseignée'
      if (!map.has(structure)) map.set(structure, { structure, aRegler: [], futures: [], reglees: [] })
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        montantARegler: g.aRegler.reduce((t, s) => t + (Number(s.montant) || 0), 0),
        aReglerTri: [...g.aRegler].sort((a, b) => (a.date < b.date ? 1 : -1))
      }))
      .sort((a, b) => b.montantARegler - a.montantARegler || a.structure.localeCompare(b.structure))
  }, [seances, clientsPartenaires, dateLimite])

  const totalDu = useMemo(() => groupes.reduce((t, g) => t + g.montantARegler, 0), [groupes])
  const nbSeancesDues = useMemo(() => groupes.reduce((t, g) => t + g.aRegler.length, 0), [groupes])

  async function confirmerReglement() {
    const { structure, seances: aRegler, total } = aConfirmer
    setSaving(true)
    try {
      const numero = genNumero('FACT-GYM', allFactures.length)
      const nb = aRegler.length
      const description = `Règlement partenaire ${structure} — ${libelleMois(mois)} — ${nb} séance${nb > 1 ? 's' : ''}`
      // 1) Une seule facture globale — comptée dans l'encaissement du mois où le
      //    règlement est effectué (date du jour).
      await addItem('gym_factures', {
        numero, date: todayStr(), sourceType: 'reglement_partenaire', sourceId: null, site,
        clientNom: structure, clientTelephone: '', categorie: '', description,
        montant: total, imprime: false,
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      // 2) Les séances passent « réglées par la structure ».
      for (const s of aRegler) {
        await updateItem('gym_seances', s.id, {
          regleParPartenaire: true, regleParPartenaireLe: Date.now(), regleParPartenaireMois: mois, regleParPartenaireFacture: numero
        })
      }
      // 3) Trace du règlement — alimente l'historique + les exports.
      await addItem('gym_reglements_partenaires', {
        structure, site, mois, nbSeances: nb, montant: total, factureNumero: numero,
        seanceIds: aRegler.map((s) => s.id),
        reglePar: user?.nom || user?.login || '—', regleParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('gym', 'REGLEMENT_PARTENAIRE', `${structure} — ${libelleMois(mois)} — ${nb} séance${nb > 1 ? 's' : ''} — ${formatMoney(total)} — facture ${numero}`, { structure, mois, nbSeances: nb, montant: total, factureNumero: numero, site })
      toast.success(`Mois réglé pour ${structure} — facture ${numero} générée ✓`)
      setAConfirmer(null)
    } finally { setSaving(false) }
  }

  function exportXLSX() {
    const sectionsDues = groupes
      .filter((g) => g.aRegler.length > 0)
      .map((g) => ({
        name: g.structure.slice(0, 28),
        title: `${g.structure} — séances à régler`,
        subtitle: `${g.aRegler.length} séance(s) jusqu'à ${formatDateShort(dateLimite)} — ${formatMoney(g.montantARegler)}`,
        columns: [
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Client', label: 'Client', width: 26 },
          { key: 'Catégorie', label: 'Catégorie', width: 14 },
          { key: 'Montant', label: 'Montant', width: 16, type: 'money' }
        ],
        rows: g.aReglerTri.map((s) => ({
          Date: formatDateShort(s.date), Client: s.clientNom || '—',
          Catégorie: categorieLabel(s.categorie), Montant: Number(s.montant) || 0
        })),
        totals: { __label: 'TOTAL', Montant: g.montantARegler }
      }))
    const sectionReglements = {
      name: 'Règlements',
      title: 'Règlements effectués — MAXI-GYM',
      subtitle: `${reglements.length} règlement(s)`,
      columns: [
        { key: 'Date', label: 'Date règlement', width: 14 },
        { key: 'Structure', label: 'Structure', width: 26 },
        { key: 'Mois', label: 'Mois concerné', width: 16 },
        { key: 'Séances', label: 'Séances', width: 10 },
        { key: 'Montant', label: 'Montant', width: 16, type: 'money' },
        { key: 'Facture', label: 'Facture', width: 16 }
      ],
      rows: reglements.map((r) => ({
        Date: formatDateShort(new Date(r.createdAt).toISOString().slice(0, 10)),
        Structure: r.structure, Mois: libelleMois(r.mois), Séances: r.nbSeances,
        Montant: Number(r.montant) || 0, Facture: r.factureNumero || '—'
      })),
      totals: { __label: 'TOTAL', Montant: reglements.reduce((t, r) => t + (Number(r.montant) || 0), 0) }
    }
    exportRapportExcel({
      filename: `clients-partenaires-maxi-gym-${siteLabel(site).toLowerCase()}-${todayStr()}.xlsx`,
      sections: [...sectionsDues, sectionReglements]
    })
  }

  function exportPDF() {
    const lignes = []
    for (const g of groupes.filter((x) => x.aRegler.length > 0)) {
      for (const s of g.aReglerTri) {
        lignes.push([g.structure, formatDateShort(s.date), s.clientNom || '—', categorieLabel(s.categorie), formatMoney(s.montant)])
      }
      lignes.push([`— Sous-total ${g.structure}`, '', '', `${g.aRegler.length} séance(s)`, formatMoney(g.montantARegler)])
    }
    lignes.push(['TOTAL DÛ', '', '', `${nbSeancesDues} séance(s)`, formatMoney(totalDu)])
    generateRapportPDF({
      titre: `Clients partenaires — MAXI-GYM ${siteLabel(site)} — arrêté au ${formatDateShort(dateLimite)}`,
      colonnes: ['Structure', 'Date', 'Client', 'Catégorie', 'Montant'],
      lignes,
      fichier: `clients-partenaires-maxi-gym-${siteLabel(site).toLowerCase()}-${todayStr()}.pdf`,
      module: 'gym'
    })
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Handshake size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Clients partenaires</h2>
          <p className="text-sm text-white/80">
            {groupes.length} structure(s) — {nbSeancesDues} séance(s) à régler — {formatMoney(totalDu)} dû
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur-sm">
          Arrêté au mois de
          <input type="month" value={mois} onChange={(e) => setMois(e.target.value)}
            className="rounded-lg border-0 bg-white/90 px-2 py-1 text-gray-800" />
        </label>
      </div>

      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Les séances des clients partenaires sont « portées au compte » de leur structure : aucun paiement ni ticket sur le moment.
        En fin de mois, « Marquer le mois réglé » solde toutes les séances non réglées jusqu'au {formatDateShort(dateLimite)} et
        génère <strong>une facture globale</strong> par structure (visible dans Facturation, comptée dans l'encaissement du mois du règlement).
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Structures partenaires" value={groupes.length} icon={Handshake} accent={COULEUR} />
        <StatCard title="Séances à régler" value={nbSeancesDues} icon={AlertTriangle} accent="#d97706" />
        <StatCard title="Montant dû" value={formatMoney(totalDu)} icon={FileDown} accent="#dc2626" />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={exportPDF} disabled={nbSeancesDues === 0}><FileDown size={16} /> Export PDF</Button>
        {canExportExcel(role) && (
          <Button variant="outline" onClick={exportXLSX} disabled={groupes.length === 0}><FileSpreadsheet size={16} /> Export Excel</Button>
        )}
      </div>

      {groupes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          Aucun client partenaire pour l'instant. Cochez « Client partenaire » sur une fiche client ou à l'enregistrement d'une séance.
        </Card>
      ) : (
        groupes.map((g) => (
          <Card key={g.structure} className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-sky-50/50 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-base font-extrabold text-sky-900">
                  🤝 {g.structure}
                  {g.futures.length > 0 && <Badge tone="info">{g.futures.length} à venir</Badge>}
                  {g.reglees.length > 0 && <Badge tone="success">{g.reglees.length} réglée(s)</Badge>}
                </p>
                <p className="text-xs text-gray-500">
                  {g.aRegler.length} séance(s) à régler jusqu'au {formatDateShort(dateLimite)} — <strong className="text-gray-700">{formatMoney(g.montantARegler)}</strong>
                </p>
              </div>
              {peutRegler && g.aRegler.length > 0 && (
                <Button onClick={() => setAConfirmer({ structure: g.structure, seances: g.aReglerTri, total: g.montantARegler })}>
                  <CheckCircle2 size={16} /> Marquer le mois réglé
                </Button>
              )}
            </div>
            {g.aRegler.length === 0 ? (
              <p className="px-4 py-4 text-center text-sm text-gray-400">Aucune séance en attente de règlement.</p>
            ) : (
              <Table
                columns={[
                  { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
                  { key: 'clientNom', label: 'Client' },
                  { key: 'categorie', label: 'Catégorie', render: (r) => categorieLabel(r.categorie) },
                  { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.montant)}</strong> },
                  { key: 'enregistrePar', label: 'Enregistrée par', render: (r) => r.enregistrePar || '—' }
                ]}
                rows={g.aReglerTri}
                empty="—"
              />
            )}
          </Card>
        ))
      )}

      <Card className="p-0">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-bold text-gray-700">Historique des règlements</p>
        </div>
        <Table
          columns={[
            { key: 'createdAt', label: 'Date règlement', render: (r) => formatDateShort(new Date(r.createdAt).toISOString().slice(0, 10)) },
            { key: 'structure', label: 'Structure' },
            { key: 'mois', label: 'Mois concerné', render: (r) => libelleMois(r.mois) },
            { key: 'nbSeances', label: 'Séances', align: 'right' },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.montant)}</strong> },
            { key: 'factureNumero', label: 'Facture', render: (r) => r.factureNumero || '—' },
            { key: 'reglePar', label: 'Réglé par', render: (r) => r.reglePar || '—' }
          ]}
          rows={reglements}
          empty="Aucun règlement enregistré."
        />
      </Card>

      <Modal open={!!aConfirmer} onClose={() => !saving && setAConfirmer(null)} title="Marquer le mois réglé"
        {...glassModalProps(COULEUR)}
        footer={<>
          <Button variant="outline" onClick={() => setAConfirmer(null)} disabled={saving}>Annuler</Button>
          <Button onClick={confirmerReglement} loading={saving}>Confirmer le règlement</Button>
        </>}>
        {aConfirmer && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 p-4 text-white">
              <p className="text-sm font-semibold opacity-90">🤝 {aConfirmer.structure}</p>
              <p className="mt-1 text-2xl font-extrabold">{formatMoney(aConfirmer.total)}</p>
              <p className="text-sm opacity-90">{aConfirmer.seances.length} séance(s) — {libelleMois(mois)} et antérieurs</p>
            </div>
            <p className="text-sm text-gray-600">
              Les {aConfirmer.seances.length} séance(s) non réglée(s) jusqu'au {formatDateShort(dateLimite)} seront marquées
              « réglées par la structure ». Une <strong>facture globale</strong> de {formatMoney(aConfirmer.total)} sera générée
              (datée d'aujourd'hui) et comptée dans l'encaissement du mois en cours.
            </p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <tbody>
                  {aConfirmer.seances.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-2 py-1.5 text-gray-500">{formatDateShort(s.date)}</td>
                      <td className="px-2 py-1.5 font-medium text-gray-700">{s.clientNom}</td>
                      <td className="px-2 py-1.5 text-gray-500">{categorieLabel(s.categorie)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{formatMoney(s.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
