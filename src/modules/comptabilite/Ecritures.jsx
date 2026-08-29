// COMPTABILITÉ — saisie des écritures (partie double) et livre-journal.
import { useMemo, useState } from 'react'
import {
  Plus, Trash2, BookOpen, CheckCircle2, Pencil, ScrollText, AlertTriangle, Scale, Lock
} from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { useAuth } from '../../hooks/useAuth'
import { JOURNAUX, getJournal, journalDefaut, STATUTS_ECRITURE, COL } from './data'
import { validerEcriture, totalDebit, totalCredit, ecritureEquilibree, prochainNumeroPiece } from './logic'

const ligneVide = () => ({ compte: '', libelle: '', debit: '', credit: '', axe: '' })

export default function Ecritures() {
  const { plan, ecritures, centres, exercices, loading } = useCompta()
  const { user } = useAuth()
  const [modal, setModal] = useState(null)
  const [filtreJournal, setFiltreJournal] = useState('')
  const [erreurs, setErreurs] = useState([])

  const liste = useMemo(
    () => [...ecritures]
      .filter((e) => !filtreJournal || e.journal === filtreJournal)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)),
    [ecritures, filtreJournal]
  )

  const ouvrirNouvelle = () => {
    setErreurs([])
    setModal({
      date: todayStr(), journal: journalDefaut, libelle: '', piece: '',
      exercice: todayStr().slice(0, 4),
      statut: 'brouillon', lignes: [ligneVide(), ligneVide()]
    })
  }
  const ouvrirEdition = (ec) => {
    setErreurs([])
    setModal({ ...ec, lignes: (ec.lignes || []).map((l) => ({ ...l, debit: l.debit || '', credit: l.credit || '' })) })
  }

  const setLigne = (i, champ, val) => {
    const lignes = [...modal.lignes]
    lignes[i] = { ...lignes[i], [champ]: val }
    // Saisir un débit vide le crédit de la même ligne (et vice-versa).
    if (champ === 'debit' && val) lignes[i].credit = ''
    if (champ === 'credit' && val) lignes[i].debit = ''
    setModal({ ...modal, lignes })
  }
  const ajouterLigne = () => setModal({ ...modal, lignes: [...modal.lignes, ligneVide()] })
  const retirerLigne = (i) => setModal({ ...modal, lignes: modal.lignes.filter((_, x) => x !== i) })

  const enregistrer = async (statutCible) => {
    const candidat = { ...modal, statut: statutCible }
    if (statutCible === 'validee') {
      const { ok, erreurs: errs } = validerEcriture(candidat)
      if (!ok) { setErreurs(errs); return }
    }
    // Nettoyage des lignes (montants → nombres, on retire les lignes vides).
    const lignes = (modal.lignes || [])
      .filter((l) => l.compte && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
      .map((l) => ({ compte: String(l.compte), libelle: l.libelle || '', debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, axe: l.axe || '' }))
    const annee = (modal.date || todayStr()).slice(0, 4)
    const piece = modal.piece || prochainNumeroPiece(ecritures, modal.journal, annee)
    const payload = {
      date: modal.date, journal: modal.journal, libelle: modal.libelle || '',
      exercice: modal.exercice || annee,
      piece, statut: statutCible, lignes,
      ...(modal.id ? {} : { creePar: user?.email || user?.nom || '—' })
    }
    if (modal.id) await updateItem(COL.ecritures, modal.id, payload)
    else await addItem(COL.ecritures, payload)
    setModal(null)
  }

  const valider = async (ec) => {
    const { ok, erreurs: errs } = validerEcriture(ec)
    if (!ok) { alert('Écriture non validable :\n' + errs.join('\n')); return }
    await updateItem(COL.ecritures, ec.id, { statut: 'validee' })
  }
  const supprimer = async (ec) => {
    if (!confirm('Supprimer définitivement cette écriture ?')) return
    await removeItem(COL.ecritures, ec.id)
  }

  const d = modal ? totalDebit(modal.lignes) : 0
  const c = modal ? totalCredit(modal.lignes) : 0
  const equilibre = modal ? ecritureEquilibree(modal.lignes) : false
  const ecart = d - c

  // Options d'exercice : exercices déclarés, sinon année de la pièce ± 1.
  const anneePiece = (modal?.date || todayStr()).slice(0, 4)
  const optionsExercice = (exercices && exercices.length)
    ? exercices.map((x) => x.nom || String(x.annee || anneePiece))
    : [String(Number(anneePiece) - 1), anneePiece, String(Number(anneePiece) + 1)]

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <ScrollText className="text-orange-600" /> Écritures & journaux
          </h1>
          <p className="text-sm text-gray-500">{ecritures.length} écritures — livre-journal en partie double</p>
        </div>
        <Button onClick={ouvrirNouvelle}><Plus size={16} /> Nouvelle écriture</Button>
      </header>

      <Card>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFiltreJournal('')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${!filtreJournal ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
            Tous
          </button>
          {JOURNAUX.map((j) => (
            <button key={j.code} onClick={() => setFiltreJournal(j.code)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filtreJournal === j.code ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
              {j.code} · {j.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {liste.length === 0 && <Card><p className="py-8 text-center text-gray-400">Aucune écriture. Cliquez sur « Nouvelle écriture ».</p></Card>}
        {liste.map((ec) => {
          const j = getJournal(ec.journal)
          const eq = ecritureEquilibree(ec.lignes)
          return (
            <Card key={ec.id} className="!p-0 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
                <Badge tone={j?.tone || 'neutral'}>{ec.journal}</Badge>
                <span className="font-mono text-xs text-gray-500">{ec.piece}</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{ec.libelle || '—'}</span>
                <span className="text-xs text-gray-400">{formatDateShort(ec.date)}</span>
                <div className="ml-auto flex items-center gap-2">
                  {ec.source === 'auto'
                    ? <Badge tone="info" className="capitalize">Auto · {ec.module}</Badge>
                    : <Badge tone={STATUTS_ECRITURE[ec.statut]?.tone || 'warning'}>{STATUTS_ECRITURE[ec.statut]?.label || 'Brouillon'}</Badge>}
                  {!eq && <Badge tone="danger"><AlertTriangle size={12} /> Déséquilibrée</Badge>}
                  {ec.source === 'auto' ? (
                    <span title="Générée depuis un autre module — non modifiable ici" className="p-1.5 text-gray-300"><Lock size={15} /></span>
                  ) : (
                    <>
                      {ec.statut !== 'validee' && (
                        <>
                          <button onClick={() => valider(ec)} title="Valider" className="rounded-lg p-1.5 text-green-600 hover:bg-green-50"><CheckCircle2 size={16} /></button>
                          <button onClick={() => ouvrirEdition(ec)} title="Modifier" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={15} /></button>
                        </>
                      )}
                      <button onClick={() => supprimer(ec)} title="Supprimer" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {(ec.lignes || []).map((l, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0 dark:border-white/5">
                      <td className="px-4 py-1.5 font-mono text-xs text-gray-500">{l.compte}</td>
                      <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200">{l.libelle || plan.find((p) => p.num === String(l.compte))?.label || ''}</td>
                      <td className="px-4 py-1.5 text-right font-medium text-gray-800 dark:text-gray-100">{l.debit ? formatMoney(l.debit) : ''}</td>
                      <td className="px-4 py-1.5 text-right font-medium text-gray-800 dark:text-gray-100">{l.credit ? formatMoney(l.credit) : ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50/60 font-bold dark:bg-white/5">
                    <td className="px-4 py-1.5" colSpan={2}>Totaux</td>
                    <td className="px-4 py-1.5 text-right">{formatMoney(totalDebit(ec.lignes))}</td>
                    <td className="px-4 py-1.5 text-right">{formatMoney(totalCredit(ec.lignes))}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          )
        })}
      </div>

      {/* Saisie */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="xl"
        title={modal?.id ? 'Modifier l\'écriture' : 'Nouvelle écriture'}
        footer={modal && <>
          <div className={`mr-auto flex items-center gap-2 text-sm font-bold ${equilibre ? 'text-green-600' : 'text-red-600'}`}>
            <Scale size={16} />
            {equilibre ? 'Équilibrée' : `Écart : ${formatMoney(Math.abs(ecart))} ${ecart > 0 ? '(débit > crédit)' : '(crédit > débit)'}`}
          </div>
          <Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
          <Button variant="outline" onClick={() => enregistrer('brouillon')}>Enregistrer en brouillon</Button>
          <Button variant="success" onClick={() => enregistrer('validee')} disabled={!equilibre}><CheckCircle2 size={16} /> Valider</Button>
        </>}>
        {modal && (
          <div className="space-y-4">
            {erreurs.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {erreurs.map((e, i) => <p key={i}>• {e}</p>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Champ label="Date comptable">
                <input type="date" value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-white/10 dark:bg-white/5" />
              </Champ>
              <Champ label="Exercice fiscal">
                <select value={modal.exercice || (modal.date || todayStr()).slice(0, 4)} onChange={(e) => setModal({ ...modal, exercice: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                  {optionsExercice.map((ex) => <option key={ex} value={ex}>Exercice {ex}</option>)}
                </select>
              </Champ>
              <Champ label="Journal">
                <select value={modal.journal} onChange={(e) => setModal({ ...modal, journal: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                  {JOURNAUX.map((j) => <option key={j.code} value={j.code}>{j.code} — {j.label}</option>)}
                </select>
              </Champ>
              <Champ label="Libellé de la pièce" className="col-span-2 sm:col-span-3">
                <input value={modal.libelle} onChange={(e) => setModal({ ...modal, libelle: e.target.value })}
                  placeholder="ex. Achat carburant motos — MAXI LOGISTIQUE"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5" />
              </Champ>
            </div>

            {/* Sélecteur de compte (datalist partagée) */}
            <datalist id="plan-comptes">
              {plan.map((c) => <option key={c.num} value={c.num}>{c.num} — {c.label}</option>)}
            </datalist>

            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                    <th className="px-2 py-2">Compte</th>
                    <th className="px-2 py-2">Libellé ligne</th>
                    <th className="px-2 py-2">Axe analytique</th>
                    <th className="px-2 py-2 text-right">Débit</th>
                    <th className="px-2 py-2 text-right">Crédit</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {modal.lignes.map((l, i) => (
                    <tr key={i} className="border-t border-gray-50 dark:border-white/5">
                      <td className="px-2 py-1.5">
                        <input list="plan-comptes" value={l.compte} onChange={(e) => setLigne(i, 'compte', e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="N°" className="w-24 rounded border border-gray-200 px-2 py-1.5 font-mono text-sm dark:border-white/10 dark:bg-white/5" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={l.libelle} onChange={(e) => setLigne(i, 'libelle', e.target.value)}
                          placeholder={plan.find((p) => p.num === String(l.compte))?.label || 'Détail…'}
                          className="w-full min-w-[140px] rounded border border-gray-200 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={l.axe || ''} onChange={(e) => setLigne(i, 'axe', e.target.value)}
                          className="w-32 rounded border border-gray-200 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5">
                          <option value="">— Axe…</option>
                          {(centres || []).map((ce) => <option key={ce.id} value={ce.code || ce.libelle}>{ce.libelle}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input inputMode="numeric" value={l.debit} onChange={(e) => setLigne(i, 'debit', e.target.value.replace(/[^0-9]/g, ''))}
                          className="w-28 rounded border border-gray-200 px-2 py-1.5 text-right text-sm dark:border-white/10 dark:bg-white/5" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input inputMode="numeric" value={l.credit} onChange={(e) => setLigne(i, 'credit', e.target.value.replace(/[^0-9]/g, ''))}
                          className="w-28 rounded border border-gray-200 px-2 py-1.5 text-right text-sm dark:border-white/10 dark:bg-white/5" />
                      </td>
                      <td className="px-1">
                        {modal.lignes.length > 2 && (
                          <button onClick={() => retirerLigne(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-100 bg-gray-50/60 font-bold dark:border-white/10 dark:bg-white/5">
                    <td className="px-2 py-2" colSpan={3}>
                      <button onClick={ajouterLigne} className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:underline"><Plus size={13} /> Ajouter une ligne</button>
                    </td>
                    <td className="px-2 py-2 text-right">{formatMoney(d)}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(c)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  )
}
