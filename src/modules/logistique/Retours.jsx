// Retour de matériel — PILOTÉ PAR LA PRESTATION.
// On choisit une prestation non entièrement rendue → la liste du matériel pris
// s'affiche automatiquement. Pour chaque matériel, on AJOUTE les retours UN À UN :
// chaque entrée porte son état (OK / Cassé / Perdu), sa quantité, son motif et sa
// pénalité. On peut donc, pour un même matériel, enregistrer par exemple « 3 perdus »,
// puis « 2 cassés », puis « le reste OK » — au lieu d'un seul total figé.
//   - OK            → réintègre le stock (pas de pénalité)
//   - Cassé / Perdu → quantité + motif + pénalité (ne réintègre pas → perte)
// Chaque entrée est tracée (collection logistique_retours) et alimente, en lecture
// seule, la colonne « Retours » de la saisie magasin.
import { useMemo, useState } from 'react'
import { RotateCcw, Check, Plus, X } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import Input from '../../shared/forms/Input'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useLogistiqueStore } from './store/referentielStore'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { APPROVER_ROLES, isReadOnlyRole } from '../../core/roles'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatDateShort, formatMoney } from '../../utils/formatters'
import { useSite, matchSite } from './site/useSite'

const DRAFT_VIDE = { etat: 'none', qte: '', motif: '', penalite: '' }

export default function Retours() {
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)
  const site = useSite()
  const { data: allRetours } = useCollection('logistique_retours')
  const { data: allPrestations } = useCollection('logistique_prestations')
  const materiel = useLogistiqueStore((s) => s.materiel)
  const coutOf = useMemo(() => { const m = {}; materiel.forEach((x) => { m[x.id] = x.coutAchat || 0 }); return m }, [materiel])

  // Cloisonnement par site (sous-application Lomé / Kara).
  const retours = useMemo(() => allRetours.filter((r) => matchSite(r, site)), [allRetours, site])
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])

  const [prestationId, setPrestationId] = useState('')
  // Retours AJOUTÉS, prêts à enregistrer : { materielId: [ { etat, qte, motif, penalite } ] }
  const [entrees, setEntrees] = useState({})
  // Brouillon de l'entrée en cours de saisie, par matériel : { materielId: { etat, qte, motif, penalite } }
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)

  // Quantité déjà retournée (enregistrée en base) pour un (prestation, matériel).
  const renduPour = (presId, matId) => retours
    .filter((r) => r.prestationId === presId && r.materielId === matId)
    .reduce((s, r) => s + (parseInt(r.qte) || 0), 0)

  // Lignes « matériel restant à rendre » d'une prestation.
  const lignesRestantes = (p) => (p?.lignes || [])
    .filter((l) => l.materielId) // hors « Autre » / frais (pas de stock)
    .map((l) => {
      const pris = parseInt(l.qte) || 0
      const rendu = renduPour(p.id, l.materielId)
      return { materielId: l.materielId, materielNom: l.materielNom, pris, rendu, restant: Math.max(0, pris - rendu) }
    })

  // Prestations avec au moins un matériel pas encore entièrement rendu.
  const prestationsNonRendues = useMemo(
    () => prestations.filter((p) => lignesRestantes(p).some((l) => l.restant > 0)),
    [prestations, retours]
  )

  const prestation = prestations.find((p) => p.id === prestationId)
  const lignes = prestation ? lignesRestantes(prestation).filter((l) => l.restant > 0) : []

  function choisirPrestation(id) {
    setPrestationId(id)
    setEntrees({}) // remet à zéro les retours en cours
    setDraft({})
  }
  const setDraftMat = (matId, patch) => setDraft((d) => ({ ...d, [matId]: { ...(d[matId] || DRAFT_VIDE), ...patch } }))

  // Quantité déjà répartie dans les entrées ajoutées (non encore enregistrées).
  const repartiPour = (matId) => (entrees[matId] || []).reduce((s, e) => s + (parseInt(e.qte) || 0), 0)
  // Quantité qu'il reste à affecter pour ce matériel (restant − déjà réparti).
  const resteAffecter = (l) => Math.max(0, l.restant - repartiPour(l.materielId))

  // Ajoute une entrée de retour (un à un) pour un matériel.
  function ajouterEntree(l) {
    const d = draft[l.materielId] || DRAFT_VIDE
    if (!d.etat || d.etat === 'none') return toast.error("Choisissez l'état du retour")
    const reste = resteAffecter(l)
    if (reste <= 0) return toast.error('Tout le restant de ce matériel est déjà réparti')
    // Quantité : OK → par défaut tout le reste ; Cassé/Perdu → par défaut 1 (unité par unité).
    const saisie = d.qte === '' || d.qte === undefined ? (d.etat === 'OK' ? reste : 1) : parseInt(d.qte)
    const qte = Math.min(reste, Math.max(1, saisie || 1))
    const penalite = d.etat === 'OK' ? 0
      : (d.penalite !== undefined && d.penalite !== '' ? parseFloat(d.penalite) || 0 : (coutOf[l.materielId] || 0) * qte)
    const entree = { etat: d.etat, qte, motif: (d.motif || '').trim(), penalite }
    setEntrees((m) => ({ ...m, [l.materielId]: [...(m[l.materielId] || []), entree] }))
    setDraftMat(l.materielId, DRAFT_VIDE)
  }
  function retirerEntree(matId, idx) {
    setEntrees((m) => ({ ...m, [matId]: (m[matId] || []).filter((_, i) => i !== idx) }))
  }

  async function enregistrer() {
    if (!prestation) return toast.error('Choisissez une prestation')
    const toutes = lignes.flatMap((l) => (entrees[l.materielId] || []).map((e) => ({ l, e })))
    if (!toutes.length) return toast.error('Ajoutez au moins un retour (bouton « Ajouter »)')

    setSaving(true)
    try {
      let n = 0
      for (const { l, e } of toutes) {
        const num = genNumero(`RET-${site.toUpperCase()}`, retours.length + n)
        await addItem('logistique_retours', {
          num, date: todayStr(), site,
          prestationId: prestation.id, prestationNum: prestation.num, clientNom: prestation.clientNom,
          materielId: l.materielId, materielNom: l.materielNom,
          type: e.etat, qte: e.qte, motif: e.motif,
          penalite: e.penalite, penalitePayee: false,
          agentId: user.uid, agentNom: user.nom
        })
        n++
        if (e.etat !== 'OK') {
          await notify({
            type: 'warning',
            title: `Retour matériel — ${e.etat}`,
            body: `${e.qte} × ${l.materielNom} (${e.etat})${e.penalite > 0 ? ` — pénalité ${formatMoney(e.penalite)}` : ''} · prestation ${prestation.num}`,
            module: 'logistique',
            forRoles: APPROVER_ROLES,
            link: '/logistique/retours'
          })
        }
      }
      await audit('logistique', 'RETOUR', `${n} retour(s) — prestation ${prestation.num}`)
      toast.success(`${n} retour(s) enregistré(s) ✓ — visibles en lecture seule dans la saisie magasin`)
      setPrestationId('')
      setEntrees({})
      setDraft({})
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const totalEntrees = lignes.reduce((s, l) => s + (entrees[l.materielId]?.length || 0), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Le retour se fait <strong>par prestation</strong> : choisissez la prestation, la liste du matériel pris s'affiche.
        Pour chaque matériel, <strong>ajoutez les retours un à un</strong> : vous pouvez enregistrer plusieurs entrées
        (par ex. <strong>3 perdus</strong>, puis <strong>2 cassés</strong>, puis <strong>le reste OK</strong>) sans avoir à saisir un total unique.
        <strong> OK</strong> réintègre le stock ; <strong>Cassé / Perdu</strong> demandent une quantité, un motif et une <strong>pénalité</strong> à rembourser (suivi des pertes).
        Les <strong>retours partiels</strong> restent gérés d'un passage à l'autre : on ne voit chaque fois que le <strong>restant</strong> à rendre.
      </div>

      {!lectureSeule && (
      <Card title="Nouveau retour (par prestation)">
        <FormGroup label="Prestation liée" required>
          <Select value={prestationId} onChange={(e) => choisirPrestation(e.target.value)}>
            <option value="">— Choisir une prestation à retourner —</option>
            {prestationsNonRendues.map((p) => (
              <option key={p.id} value={p.id}>{p.num} — {p.clientNom} ({formatDateShort(p.dateDebut)})</option>
            ))}
          </Select>
        </FormGroup>

        {prestation && lignes.length === 0 && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✅ Tout le matériel de cette prestation a déjà été retourné.</p>
        )}

        {lignes.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase text-gray-500">Matériel à retourner</p>
            {lignes.map((l) => {
              const liste = entrees[l.materielId] || []
              const reste = resteAffecter(l)
              const d = draft[l.materielId] || DRAFT_VIDE
              const cassePerdu = d.etat === 'Cassé' || d.etat === 'Perdu'
              const qApercu = Math.min(reste || 1, Math.max(1, parseInt(d.qte) || 1))
              const penatDefaut = (coutOf[l.materielId] || 0) * qApercu
              return (
                <div key={l.materielId} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 font-semibold">{l.materielNom}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        pris {l.pris} · déjà rendu {l.rendu} · restant <strong className="text-gray-600">{l.restant}</strong>
                        {liste.length > 0 && <> · à enregistrer <strong className="text-sky-600">{repartiPour(l.materielId)}</strong> · reste à répartir <strong className="text-gray-600">{reste}</strong></>}
                      </span>
                    </span>
                  </div>

                  {/* Entrées déjà ajoutées (un à un) */}
                  {liste.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {liste.map((e, i) => (
                        <span key={i} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${e.etat === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {e.etat} · {e.qte}
                          {e.penalite > 0 && <span className="text-red-500">· {formatMoney(e.penalite)}</span>}
                          {e.motif && <span className="font-normal text-gray-500">· {e.motif}</span>}
                          <button type="button" onClick={() => retirerEntree(l.materielId, i)} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10" title="Retirer">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Ligne d'ajout d'une entrée */}
                  {reste > 0 ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-12">
                      <Select className="col-span-2 md:col-span-3" value={d.etat} onChange={(e) => setDraftMat(l.materielId, { etat: e.target.value })}>
                        <option value="none">— État —</option>
                        <option value="OK">OK — bon état</option>
                        <option value="Cassé">Cassé</option>
                        <option value="Perdu">Perdu</option>
                      </Select>
                      {d.etat !== 'none' && (
                        <Input className="md:col-span-2" type="number" min="1" max={reste}
                          value={d.qte} onChange={(e) => setDraftMat(l.materielId, { qte: e.target.value })}
                          placeholder={d.etat === 'OK' ? `Qté (${reste})` : 'Qté'} />
                      )}
                      {cassePerdu && (
                        <>
                          <Input className="col-span-2 md:col-span-4" value={d.motif}
                            onChange={(e) => setDraftMat(l.materielId, { motif: e.target.value })}
                            placeholder="Motif (détail de la casse / perte)" />
                          <div className="col-span-2 md:col-span-3">
                            <Input type="number" min="0" value={d.penalite}
                              onChange={(e) => setDraftMat(l.materielId, { penalite: e.target.value })}
                              placeholder={`Pénalité (${formatMoney(penatDefaut)})`} />
                            <p className="mt-0.5 text-[10px] text-gray-400">💰 à rembourser · défaut = coût de remplacement</p>
                          </div>
                        </>
                      )}
                      {d.etat !== 'none' && (
                        <div className={cassePerdu ? 'col-span-2 md:col-span-12' : 'col-span-2 md:col-span-7'}>
                          <Button type="button" variant="outline" onClick={() => ajouterEntree(l)}>
                            <Plus size={15} /> Ajouter ce retour
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-green-600">✓ Tout le restant est réparti.</p>
                  )}
                </div>
              )
            })}
            <Button className="mt-1" onClick={enregistrer} loading={saving} disabled={!totalEntrees}>
              <RotateCcw size={16} /> Enregistrer les retours{totalEntrees ? ` (${totalEntrees})` : ''}
            </Button>
          </div>
        )}
      </Card>
      )}

      <Card title="Historique des retours" className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Prestation</th>
              <th className="px-3 py-2">Matériel</th>
              <th className="px-3 py-2 text-center">Qté</th>
              <th className="px-3 py-2">État</th>
              <th className="px-3 py-2 text-right">Pénalité</th>
              <th className="px-3 py-2 text-center">Remboursée ?</th>
              <th className="px-3 py-2">Motif</th>
              <th className="px-3 py-2">Agent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...retours].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => {
              const casse = r.type !== 'OK'
              return (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-xs">{formatDateShort(r.date)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.prestationNum || '—'}</td>
                <td className="px-3 py-2 font-semibold">{r.materielNom}</td>
                <td className="px-3 py-2 text-center">{r.qte}</td>
                <td className="px-3 py-2"><Badge tone={r.type === 'OK' ? 'success' : 'danger'}>{r.type}</Badge></td>
                <td className="px-3 py-2 text-right font-semibold">{casse && r.penalite > 0 ? formatMoney(r.penalite) : '—'}</td>
                <td className="px-3 py-2 text-center">
                  {casse && r.penalite > 0 ? (
                    lectureSeule ? (
                      <Badge tone={r.penalitePayee ? 'success' : 'warning'}>{r.penalitePayee ? 'Payée' : 'En attente'}</Badge>
                    ) : (
                      <button onClick={() => togglePaye(r)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${r.penalitePayee ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                        {r.penalitePayee ? <><Check size={12} /> Payée</> : 'À encaisser'}
                      </button>
                    )
                  ) : '—'}
                </td>
                <td className="px-3 py-2 text-gray-500">{r.motif || '—'}</td>
                <td className="px-3 py-2 text-xs">{r.agentNom}</td>
              </tr>
            )})}
          </tbody>
        </table>
        {!retours.length && <p className="py-10 text-center text-gray-400">Aucun retour enregistré.</p>}
      </Card>
    </div>
  )

  // Bascule l'état « pénalité remboursée » d'un retour cassé / perdu.
  async function togglePaye(r) {
    const payee = !r.penalitePayee
    await updateItem('logistique_retours', r.id, { penalitePayee: payee })
    await audit('logistique', 'PENALITE', `${r.materielNom} (${r.type}) — ${payee ? 'remboursée' : 'remise en attente'} · ${formatMoney(r.penalite || 0)}`)
    toast.success(payee ? 'Pénalité marquée remboursée ✓' : 'Pénalité remise en attente')
  }
}
