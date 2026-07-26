// Retour de matériel — PILOTÉ PAR LA PRESTATION.
// On choisit une prestation non entièrement rendue → la liste du matériel pris
// s'affiche automatiquement. Pour chaque matériel : état du retour
//   - OK   → réintègre le stock (pas de quantité à saisir : tout le restant revient)
//   - Cassé / Perdu → quantité + motif (ne réintègre pas → décompté en perte)
// Chaque retour est tracé (collection logistique_retours) et alimente, en lecture
// seule, la colonne « Retours » de la saisie magasin.
import { useMemo, useState } from 'react'
import { RotateCcw, Coins, Check } from 'lucide-react'
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
  const [etats, setEtats] = useState({}) // { materielId: { etat, qte, motif } }
  const [saving, setSaving] = useState(false)

  // Quantité déjà retournée pour un (prestation, matériel).
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
    setEtats({}) // remet à zéro le formulaire d'états
  }
  const setEtat = (matId, patch) => setEtats((e) => ({ ...e, [matId]: { ...(e[matId] || { etat: 'none' }), ...patch } }))

  // Bascule l'état « pénalité remboursée » d'un retour cassé / perdu.
  async function togglePaye(r) {
    const payee = !r.penalitePayee
    await updateItem('logistique_retours', r.id, { penalitePayee: payee })
    await audit('logistique', 'PENALITE', `${r.materielNom} (${r.type}) — ${payee ? 'remboursée' : 'remise en attente'} · ${formatMoney(r.penalite || 0)}`)
    toast.success(payee ? 'Pénalité marquée remboursée ✓' : 'Pénalité remise en attente')
  }

  async function enregistrer() {
    if (!prestation) return toast.error('Choisissez une prestation')
    const aTraiter = lignes
      .map((l) => ({ l, st: etats[l.materielId] }))
      .filter(({ st }) => st && st.etat && st.etat !== 'none')
    if (!aTraiter.length) return toast.error('Indiquez l\'état d\'au moins un matériel')

    setSaving(true)
    try {
      let n = 0
      for (const { l, st } of aTraiter) {
        // OK → tout le restant revient ; Cassé/Perdu → quantité saisie (bornée au restant).
        const qte = st.etat === 'OK' ? l.restant : Math.min(l.restant, Math.max(1, parseInt(st.qte) || 0))
        // Pénalité (Cassé / Perdu) : montant à faire rembourser au client. Par défaut
        // le coût de remplacement (coût d'achat × qté), modifiable à la saisie.
        const penalite = st.etat === 'OK' ? 0
          : (st.penalite !== undefined && st.penalite !== '' ? parseFloat(st.penalite) || 0 : (coutOf[l.materielId] || 0) * qte)
        const num = genNumero(`RET-${site.toUpperCase()}`, retours.length + n)
        await addItem('logistique_retours', {
          num, date: todayStr(), site,
          prestationId: prestation.id, prestationNum: prestation.num, clientNom: prestation.clientNom,
          materielId: l.materielId, materielNom: l.materielNom,
          type: st.etat, qte, motif: (st.motif || '').trim(),
          penalite, penalitePayee: false,
          agentId: user.uid, agentNom: user.nom
        })
        n++
        if (st.etat !== 'OK') {
          await notify({
            type: 'warning',
            title: `Retour matériel — ${st.etat}`,
            body: `${qte} × ${l.materielNom} (${st.etat})${penalite > 0 ? ` — pénalité ${formatMoney(penalite)}` : ''} · prestation ${prestation.num}`,
            module: 'logistique',
            forRoles: APPROVER_ROLES,
            link: '/logistique/retours'
          })
        }
      }
      await audit('logistique', 'RETOUR', `${n} retour(s) — prestation ${prestation.num}`)
      toast.success(`${n} retour(s) enregistré(s) ✓ — visibles en lecture seule dans la saisie magasin`)
      setPrestationId('')
      setEtats({})
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Le retour se fait <strong>par prestation</strong> : choisissez la prestation, la liste du matériel pris s'affiche.
        <strong> OK</strong> réintègre le stock (sans quantité), <strong> Cassé / Perdu</strong> demande la quantité et une <strong>pénalité</strong> à rembourser (suivi des pertes).
        Les <strong>retours partiels</strong> sont gérés : un client peut rapporter le matériel en plusieurs fois (ex. 20 puis 20 puis 10) — à chaque passage on ne voit que le <strong>restant</strong> à rendre.
        Les retours apparaissent ensuite en <strong>lecture seule</strong> dans la saisie magasin.
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
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase text-gray-500">Matériel à retourner</p>
            {lignes.map((l) => {
              const st = etats[l.materielId] || { etat: 'none', qte: l.restant, motif: '' }
              return (
                <div key={l.materielId} className="rounded-lg border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 font-semibold">{l.materielNom}
                      <span className="ml-2 text-xs font-normal text-gray-400">pris {l.pris} · déjà rendu {l.rendu} · restant <strong className="text-gray-600">{l.restant}</strong></span>
                    </span>
                    <Select className="w-40" value={st.etat} onChange={(e) => setEtat(l.materielId, { etat: e.target.value })}>
                      <option value="none">— État du retour —</option>
                      <option value="OK">OK — bon état (tout le restant)</option>
                      <option value="Cassé">Cassé</option>
                      <option value="Perdu">Perdu</option>
                    </Select>
                  </div>
                  {(st.etat === 'Cassé' || st.etat === 'Perdu') && (() => {
                    const q = Math.min(l.restant, Math.max(1, parseInt(st.qte ?? l.restant) || 1))
                    const penatDefaut = (coutOf[l.materielId] || 0) * q
                    return (
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-12">
                      <Input className="md:col-span-2" type="number" min="1" max={l.restant} value={st.qte ?? l.restant}
                        onChange={(e) => setEtat(l.materielId, { qte: e.target.value })} placeholder="Qté" />
                      <Input className="col-span-2 md:col-span-6" value={st.motif || ''} onChange={(e) => setEtat(l.materielId, { motif: e.target.value })}
                        placeholder="Motif (détail de la casse / perte)" />
                      <div className="col-span-2 md:col-span-4">
                        <Input type="number" min="0" value={st.penalite ?? penatDefaut}
                          onChange={(e) => setEtat(l.materielId, { penalite: e.target.value })} placeholder="Pénalité (FCFA)" />
                        <p className="mt-0.5 text-[10px] text-gray-400">💰 à rembourser · défaut = coût de remplacement ({formatMoney(penatDefaut)})</p>
                      </div>
                    </div>
                    )
                  })()}
                </div>
              )
            })}
            <Button className="mt-2" onClick={enregistrer} loading={saving}><RotateCcw size={16} /> Enregistrer les retours</Button>
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
}
