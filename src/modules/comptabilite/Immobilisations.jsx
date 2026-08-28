// COMPTABILITÉ — registre des immobilisations et amortissements (linéaire SYSCOHADA).
import { useMemo, useState } from 'react'
import { Boxes, Plus, Pencil, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { CATEGORIES_IMMO, getCategorieImmo, COL } from './data'
import { planAmortissement } from './logic'

const vide = () => ({ libelle: '', categorie: 'materiel', valeur: '', dateAcquisition: todayStr(), dureeAmort: '', reference: '', affectation: '' })

export default function Immobilisations() {
  const { immobilisations, loading } = useCompta()
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)

  const enrichies = useMemo(() => immobilisations.map((im) => {
    const cat = getCategorieImmo(im.categorie)
    const amort = planAmortissement({ ...im, dureeAmort: im.dureeAmort ?? cat?.dureeAmort })
    return { ...im, cat, amort }
  }).sort((a, b) => (b.dateAcquisition || '').localeCompare(a.dateAcquisition || '')), [immobilisations])

  const totaux = useMemo(() => enrichies.reduce((t, im) => ({
    brut: t.brut + (Number(im.valeur) || 0),
    amort: t.amort + im.amort.cumul,
    vnc: t.vnc + im.amort.vnc
  }), { brut: 0, amort: 0, vnc: 0 }), [enrichies])

  const enregistrer = async () => {
    const v = {
      libelle: modal.libelle.trim(),
      categorie: modal.categorie,
      valeur: Number(modal.valeur) || 0,
      dateAcquisition: modal.dateAcquisition,
      dureeAmort: modal.dureeAmort === '' ? (getCategorieImmo(modal.categorie)?.dureeAmort || 0) : Number(modal.dureeAmort),
      reference: modal.reference || '',
      affectation: modal.affectation || ''
    }
    if (!v.libelle || !v.valeur) return
    if (modal.id) await updateItem(COL.immobilisations, modal.id, v)
    else await addItem(COL.immobilisations, v)
    setModal(null)
  }
  const supprimer = async (im) => {
    if (!confirm(`Supprimer l'immobilisation « ${im.libelle} » ?`)) return
    await removeItem(COL.immobilisations, im.id)
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Boxes className="text-orange-600" /> Immobilisations &amp; Actifs
          </h1>
          <p className="text-sm text-gray-500">Gérez le registre des actifs physiques et incorporels, simulez les plans d'amortissement et passez automatiquement les écritures de dotation et de cession.</p>
        </div>
        <Button onClick={() => setModal(vide())}><Plus size={16} /> Créer un Actif</Button>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="VALEUR BRUTE GLOBALE" value={formatMoney(totaux.brut)} sub="Valeur d'origine (HT) des actifs en service" accent="#0d9488" icon={Boxes} />
        <StatCard title="AMORTISSEMENTS CUMULÉS" value={formatMoney(totaux.amort)} sub="Perte de valeur totale déjà comptabilisée" accent="#f59e0b" icon={Boxes} />
        <StatCard title="VALEUR NETTE COMPTABLE (VNC)" value={formatMoney(totaux.vnc)} sub="Valeur comptable nette restante à amortir" accent="#2563eb" icon={Boxes} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Désignation</th>
                <th className="px-3 py-2.5">Date d'Acquisition</th>
                <th className="px-3 py-2.5">Méthode</th>
                <th className="px-3 py-2.5 text-right">Valeur d'Origine</th>
                <th className="px-3 py-2.5 text-right">Amort. Cumulé</th>
                <th className="px-3 py-2.5 text-right">Valeur Nette (VNC)</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {enrichies.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Aucun actif immobilisé n'a été enregistré pour le moment.</td></tr>}
              {enrichies.map((im) => (
                <tr key={im.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5" onClick={() => setDetail(im)}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800 dark:text-gray-100">{im.libelle}</div>
                    <div className="text-xs text-gray-400">{im.cat?.label || im.categorie}{im.affectation ? ` · ${im.affectation}` : ''}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateShort(im.dateAcquisition)}</td>
                  <td className="px-3 py-2">{im.amort.amortissable ? <Badge tone="info">Linéaire · {im.amort.duree} ans</Badge> : <Badge tone="neutral">Non amortissable</Badge>}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatMoney(im.valeur)}</td>
                  <td className="px-3 py-2 text-right text-amber-600">{formatMoney(im.amort.cumul)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(im.amort.vnc)}</td>
                  <td className="px-3 py-2">{im.amort.vnc > 0 ? <Badge tone="success">En service</Badge> : <Badge tone="neutral">Amorti</Badge>}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setModal({ ...im, valeur: String(im.valeur), dureeAmort: String(im.dureeAmort ?? '') })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                      <button onClick={() => supprimer(im)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Saisie */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier l\'immobilisation' : 'Nouvelle immobilisation'}
        footer={<>
          <Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
          <Button onClick={enregistrer}>Enregistrer</Button>
        </>}>
        {modal && (
          <div className="space-y-3">
            <Champ label="Désignation du bien">
              <input value={modal.libelle} onChange={(e) => setModal({ ...modal, libelle: e.target.value })}
                placeholder="ex. Camion Isuzu — MAXI LOGISTIQUE" className="input-base" />
            </Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Catégorie">
                <select value={modal.categorie} onChange={(e) => setModal({ ...modal, categorie: e.target.value, dureeAmort: '' })} className="input-base">
                  {CATEGORIES_IMMO.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Champ>
              <Champ label="Valeur d'acquisition (FCFA)">
                <input inputMode="numeric" value={modal.valeur} onChange={(e) => setModal({ ...modal, valeur: e.target.value.replace(/[^0-9]/g, '') })} className="input-base" />
              </Champ>
              <Champ label="Date d'acquisition">
                <input type="date" value={modal.dateAcquisition} onChange={(e) => setModal({ ...modal, dateAcquisition: e.target.value })} className="input-base" />
              </Champ>
              <Champ label="Durée d'amortissement (ans)">
                <input inputMode="numeric" value={modal.dureeAmort}
                  onChange={(e) => setModal({ ...modal, dureeAmort: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder={String(getCategorieImmo(modal.categorie)?.dureeAmort || 0)} className="input-base" />
              </Champ>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Référence / n° facture"><input value={modal.reference} onChange={(e) => setModal({ ...modal, reference: e.target.value })} className="input-base" /></Champ>
              <Champ label="Affectation (secteur / site)"><input value={modal.affectation} onChange={(e) => setModal({ ...modal, affectation: e.target.value })} placeholder="ex. Kara" className="input-base" /></Champ>
            </div>
            {modal.valeur && (
              <p className="text-xs text-gray-500">
                Compte SYSCOHADA : <span className="font-mono font-semibold">{getCategorieImmo(modal.categorie)?.compte}</span> — {getCategorieImmo(modal.categorie)?.methode !== 'aucune' ? 'amortissable' : 'non amortissable (terrain)'}.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Détail : plan d'amortissement */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.libelle}>
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Info label="Valeur brute" value={formatMoney(detail.valeur)} />
              <Info label="Amort. cumulé" value={formatMoney(detail.amort.cumul)} />
              <Info label="VNC actuelle" value={formatMoney(detail.amort.vnc)} />
            </div>
            {!detail.amort.amortissable ? (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-white/5">Bien non amortissable (ex. terrain) — pas de plan d'amortissement.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                      <th className="px-3 py-2">Année</th>
                      <th className="px-3 py-2 text-right">Dotation ({detail.amort.tauxLineaire.toFixed(1)} %)</th>
                      <th className="px-3 py-2 text-right">Cumul</th>
                      <th className="px-3 py-2 text-right">VNC fin d'année</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                    {detail.amort.annuites.map((a) => (
                      <tr key={a.annee}>
                        <td className="px-3 py-1.5 font-medium">{a.annee}</td>
                        <td className="px-3 py-1.5 text-right">{formatMoney(a.dotation)}</td>
                        <td className="px-3 py-1.5 text-right text-amber-600">{formatMoney(a.cumul)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{formatMoney(a.vnc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
function Info({ label, value }) {
  return <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-white/5"><div className="text-xs text-gray-400">{label}</div><div className="font-bold">{value}</div></div>
}
