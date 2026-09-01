// COMPTABILITÉ — onglet IMMOBILIER / PATRIMOINE de l'entreprise.
// Recense les biens immobiliers (terrains, bâtiments, locaux…), leur valeur, leur
// statut juridique et, le cas échéant, les revenus locatifs. Chaque bien est
// rattaché à un compte SYSCOHADA (211 terrains / 213 constructions).
import { useMemo, useState } from 'react'
import { Building2, Plus, Pencil, Trash2, MapPin, Ruler, FileText } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { NATURES_BIEN, getNatureBien, STATUTS_BIEN, COL } from './data'

const vide = () => ({
  designation: '', nature: 'terrain', statut: 'proprietaire',
  valeur: '', dateAcquisition: todayStr(), localisation: '', superficie: '',
  titreFoncier: '', loyerMensuel: '', locataire: '', affectation: '', note: ''
})

export default function Patrimoine() {
  const { patrimoine, loading } = useCompta()
  const [modal, setModal] = useState(null)
  const [filtreStatut, setFiltreStatut] = useState('')

  const liste = useMemo(() => [...patrimoine]
    .filter((b) => !filtreStatut || b.statut === filtreStatut)
    .sort((a, b) => (Number(b.valeur) || 0) - (Number(a.valeur) || 0)), [patrimoine, filtreStatut])

  const totaux = useMemo(() => patrimoine.reduce((t, b) => ({
    valeur: t.valeur + (Number(b.valeur) || 0),
    loyer: t.loyer + (Number(b.loyerMensuel) || 0),
    nb: t.nb + 1,
    loues: t.loues + (b.statut === 'loue' ? 1 : 0)
  }), { valeur: 0, loyer: 0, nb: 0, loues: 0 }), [patrimoine])

  const enregistrer = async () => {
    const v = {
      designation: modal.designation.trim(),
      nature: modal.nature,
      statut: modal.statut,
      valeur: Number(modal.valeur) || 0,
      dateAcquisition: modal.dateAcquisition,
      localisation: modal.localisation || '',
      superficie: modal.superficie || '',
      titreFoncier: modal.titreFoncier || '',
      loyerMensuel: Number(modal.loyerMensuel) || 0,
      locataire: modal.locataire || '',
      affectation: modal.affectation || '',
      note: modal.note || ''
    }
    if (!v.designation) return
    if (modal.id) await updateItem(COL.patrimoine, modal.id, v)
    else await addItem(COL.patrimoine, v)
    setModal(null)
  }
  const supprimer = async (b) => {
    if (!confirm(`Supprimer le bien « ${b.designation} » du patrimoine ?`)) return
    await removeItem(COL.patrimoine, b.id)
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Building2 className="text-orange-600" /> Immobilier / Patrimoine
          </h1>
          <p className="text-sm text-gray-500">Biens immobiliers de l'entreprise — terrains, bâtiments, locaux</p>
        </div>
        <Button onClick={() => setModal(vide())}><Plus size={16} /> Nouveau bien</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Valeur du patrimoine" value={formatMoney(totaux.valeur)} accent="#0d9488" icon={Building2} />
        <StatCard title="Nombre de biens" value={totaux.nb} accent="#2563eb" icon={MapPin} />
        <StatCard title="Biens en location" value={totaux.loues} accent="#0ea5e9" icon={FileText} />
        <StatCard title="Loyers mensuels perçus" value={formatMoney(totaux.loyer)} accent="#16a34a" icon={FileText} />
      </div>

      <Card>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFiltreStatut('')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${!filtreStatut ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>Tous</button>
          {Object.entries(STATUTS_BIEN).map(([k, s]) => (
            <button key={k} onClick={() => setFiltreStatut(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filtreStatut === k ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>{s.label}</button>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {liste.length === 0 && <Card className="sm:col-span-2 lg:col-span-3"><p className="py-8 text-center text-gray-400">Aucun bien enregistré. Cliquez sur « Nouveau bien ».</p></Card>}
        {liste.map((b) => {
          const nat = getNatureBien(b.nature)
          const st = STATUTS_BIEN[b.statut]
          return (
            <Card key={b.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-100">{b.designation}</h3>
                  <p className="text-xs text-gray-400">{nat?.label} · compte {nat?.compte}</p>
                </div>
                <Badge tone={st?.tone || 'neutral'}>{st?.label}</Badge>
              </div>
              <div className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">{formatMoney(b.valeur)}</div>
              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                {b.localisation && <p className="flex items-center gap-1.5"><MapPin size={13} className="text-gray-400" /> {b.localisation}</p>}
                {b.superficie && <p className="flex items-center gap-1.5"><Ruler size={13} className="text-gray-400" /> {b.superficie}</p>}
                {b.titreFoncier && <p className="flex items-center gap-1.5"><FileText size={13} className="text-gray-400" /> TF : {b.titreFoncier}</p>}
                {b.dateAcquisition && <p className="text-xs text-gray-400">Acquis le {formatDateShort(b.dateAcquisition)}</p>}
                {Number(b.loyerMensuel) > 0 && <p className="text-green-600">Loyer : {formatMoney(b.loyerMensuel)}/mois{b.locataire ? ` — ${b.locataire}` : ''}</p>}
                {b.affectation && <p className="text-xs text-gray-400">Affectation : {b.affectation}</p>}
              </div>
              <div className="mt-auto flex justify-end gap-1 pt-1">
                <button onClick={() => setModal({ ...b, valeur: String(b.valeur ?? ''), loyerMensuel: String(b.loyerMensuel ?? '') })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={15} /></button>
                <button onClick={() => supprimer(b)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} size="lg" title={modal?.id ? 'Modifier le bien' : 'Nouveau bien immobilier'}
        footer={<>
          <Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
          <Button onClick={enregistrer}>Enregistrer</Button>
        </>}>
        {modal && (
          <div className="space-y-3">
            <Champ label="Désignation">
              <input value={modal.designation} onChange={(e) => setModal({ ...modal, designation: e.target.value })}
                placeholder="ex. Immeuble R+2 — Adidogomé" className="input-base" />
            </Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Nature du bien">
                <select value={modal.nature} onChange={(e) => setModal({ ...modal, nature: e.target.value })} className="input-base">
                  {NATURES_BIEN.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </Champ>
              <Champ label="Statut juridique">
                <select value={modal.statut} onChange={(e) => setModal({ ...modal, statut: e.target.value })} className="input-base">
                  {Object.entries(STATUTS_BIEN).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              </Champ>
              <Champ label="Valeur (FCFA)">
                <input inputMode="numeric" value={modal.valeur} onChange={(e) => setModal({ ...modal, valeur: e.target.value.replace(/[^0-9]/g, '') })} className="input-base" />
              </Champ>
              <Champ label="Date d'acquisition">
                <input type="date" value={modal.dateAcquisition} onChange={(e) => setModal({ ...modal, dateAcquisition: e.target.value })} className="input-base" />
              </Champ>
              <Champ label="Localisation">
                <input value={modal.localisation} onChange={(e) => setModal({ ...modal, localisation: e.target.value })} placeholder="Ville / quartier" className="input-base" />
              </Champ>
              <Champ label="Superficie">
                <input value={modal.superficie} onChange={(e) => setModal({ ...modal, superficie: e.target.value })} placeholder="ex. 600 m²" className="input-base" />
              </Champ>
              <Champ label="N° titre foncier / réf.">
                <input value={modal.titreFoncier} onChange={(e) => setModal({ ...modal, titreFoncier: e.target.value })} placeholder="TF n°…" className="input-base" />
              </Champ>
              <Champ label="Affectation (secteur)">
                <input value={modal.affectation} onChange={(e) => setModal({ ...modal, affectation: e.target.value })} placeholder="ex. MAXI-AGRO" className="input-base" />
              </Champ>
              <Champ label="Loyer mensuel (si loué)">
                <input inputMode="numeric" value={modal.loyerMensuel} onChange={(e) => setModal({ ...modal, loyerMensuel: e.target.value.replace(/[^0-9]/g, '') })} className="input-base" />
              </Champ>
              <Champ label="Locataire">
                <input value={modal.locataire} onChange={(e) => setModal({ ...modal, locataire: e.target.value })} className="input-base" />
              </Champ>
            </div>
            <Champ label="Note">
              <textarea value={modal.note} onChange={(e) => setModal({ ...modal, note: e.target.value })} rows={2} className="input-base" />
            </Champ>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
