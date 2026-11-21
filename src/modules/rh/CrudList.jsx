// RH — Composant générique de liste CRUD (en-tête + table + formulaire modal).
// Configure colonnes et champs ; branche une collection Firebase. Sert aux écrans
// RH à structure « liste » (formations, évaluations, tâches, missions…).
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, UserRound, CalendarDays, Hash, Type, AlignLeft, ListFilter, Factory, Users } from 'lucide-react'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { PageHeader, Champ, ModalRh, ChoixBoutons, ChoixSimple, ChoixEmployes, GrilleCriteres, ResumeCriteres, ChoixPeriode, libellePeriodeEval } from './rhui'
import DetailFiche from './DetailFiche'
import { usePeutSupprimerRh, supprimerAvecRetour } from './suppression'
import { formatDateShort } from '../../utils/formatters'
import { useChoixDepartement } from './departementsChoix'
import { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'

// Icône d'un champ selon son type.
// Types à boutons : `departement` (les départements créés, avec « Autre département »), `choix` (suggestions `options` en texte, avec un bouton « Autre »
// dont le libellé se règle par `autre`), `boutons` (liste fermée `options` : [{ value, label }], un seul choix). Leur icône se place à côté du libellé.
const ICONE_CHAMP = { select: ListFilter, boutons: ListFilter, choix: ListFilter, departement: Factory, employes: Users, criteres: ListFilter, periode: CalendarDays, employe: UserRound, textarea: AlignLeft, date: CalendarDays, number: Hash }
const TYPES_BOUTONS = ['departement', 'choix', 'boutons', 'employes', 'criteres', 'periode']

export default function CrudList({
  collection, icon, sousModule, titre, sousTitre, boutonLabel = 'Ajouter',
  colonnes = [], champs = [], vide, emptyText = 'Aucun élément.', extraHeader = null, stats = null, tuilesDetail = null,
  // apresSauvegarde(ligne enregistrée, ancienne ligne ou null) ; ouvertureInitiale : valeurs d'un formulaire à ouvrir d'office (ex. depuis un autre écran) ;
  // actionsLigne(ligne) : boutons ajoutés dans le détail d'une ligne.
  apresSauvegarde = null, ouvertureInitiale = null, onOuvertureFaite = null, actionsLigne = null
}) {
  const { data } = useCollection(collection)
  const { data: employes } = useCollection('rh_employes')
  const choixDepartement = useChoixDepartement()
  const [modal, setModal] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [recherche, setRecherche] = useState('')
  // Formulaire ouvert d'office, avec des valeurs déjà remplies (une seule fois à l'arrivée sur l'écran).
  useEffect(() => {
    if (!ouvertureInitiale) return
    setModal({ ...vide(), ...ouvertureInitiale })
    onOuvertureFaite?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Recherche par nom : tous les textes de la ligne (employé, titre, nom…).
  const lignes = data.filter((row) => correspond(recherche, ...Object.values(row).filter((v) => typeof v === 'string')))

  async function save() {
    const ancien = modal.id ? data.find((r) => r.id === modal.id) || null : null
    const out = {}
    for (const c of champs) {
      let v = modal[c.key]
      if (c.type === 'number') v = Number(v) || 0
      out[c.key] = c.type === 'employes' ? (Array.isArray(v) ? v : []) : (c.type === 'criteres' || c.type === 'periode') ? (v && typeof v === 'object' ? v : (c.defaut ? c.defaut(modal) : {})) : (v ?? '')
      if ((c.type === 'criteres' || c.type === 'periode') && c.calculer) Object.assign(out, c.calculer(out[c.key]))
      if (c.type === 'employe' && v) out.employeNom = employes.find((e) => e.id === v)?.nom || ''
    }
    const req = champs.find((c) => c.required && !String(modal[c.key] || '').trim())
    if (req) return toast.error(`${req.label} requis`)
    let id = modal.id
    try {
      if (modal.id) await updateItem(collection, modal.id, out)
      else id = await addItem(collection, out)
    } catch (err) { return toast.error(err?.message || 'Enregistrement impossible : réessayez') }
    toast.success(modal.id ? 'Corrigé ✓' : 'Enregistré ✓'); setModal(null)
    await apresSauvegarde?.({ ...out, id }, ancien)
  }
  // Suppression réservée à l'administration ; la fenêtre « Motif » sert de confirmation.
  const peutSupprimer = usePeutSupprimerRh()
  const supprimer = (row) => supprimerAvecRetour(() => removeItem(collection, row.id))

  // Détail d'une ligne (au clic) : chaque champ du formulaire, avec sa valeur lisible (libellé du choix, nom de l'employé, date).
  const valeurChamp = (c, row) => {
    const v = row[c.key]
    if (v === undefined || v === null || v === '') return ''
    if (c.type === 'select' || c.type === 'boutons') { const o = (c.options || []).find((x) => (x.value ?? x) === v); return o ? (o.label ?? o) : String(v) }
    if (c.type === 'employe') return employes.find((e) => e.id === v)?.nom || row.employeNom || String(v)
    if (c.type === 'periode') return libellePeriodeEval(v && typeof v === 'object' ? v : c.defaut?.(row))
    if (c.type === 'criteres') return v && typeof v === 'object' ? <ResumeCriteres criteres={c.criteres} value={v} /> : ''
    if (c.type === 'employes') return Array.isArray(v) && v.includes('*') ? 'Tout le personnel' : Array.isArray(v) && v.length ? v.map((id) => employes.find((e) => e.id === id)?.nom).filter(Boolean).join(', ') : ''
    if (c.type === 'date') return formatDateShort(v)
    if (c.type === 'number') return Number(v).toLocaleString('fr-FR')
    return String(v)
  }
  const ficheDe = (row) => {
    const colBadge = colonnes.find((c) => c.badge)
    const b = colBadge ? colBadge.badge(row[colBadge.key]) : null
    return {
      titre: valeurChamp(champs[0], row) || titre, sous: titre,
      badge: b ? { label: b.label || row[colBadge.key], tone: b.tone } : null,
      tuiles: champs.slice(1).map((c) => ({ icone: ICONE_CHAMP[c.type] || Type, label: c.label, valeur: valeurChamp(c, row), large: c.type === 'textarea' || c.type === 'employes' || c.type === 'criteres' })).concat(tuilesDetail ? tuilesDetail(row) : [])
    }
  }
  const ligneDetail = data.find((r) => r.id === detailId)

  const renderCell = (col, row) => {
    if (col.render) return col.render(row, { employes })
    const v = row[col.key]
    if (col.badge) return <Badge tone={col.badge(v)?.tone || 'neutral'}>{col.badge(v)?.label || v}</Badge>
    return v ?? '—'
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={icon} sousModule={sousModule} titre={titre} sousTitre={sousTitre}
        action={<>
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher par nom…" />
          <BoutonBande anime icone={Plus} onClick={() => setModal(vide())}>{boutonLabel}</BoutonBande>
        </>} />

      {stats && stats(data)}
      {extraHeader}

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                {colonnes.map((c) => <th key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {lignes.length === 0 && <tr><td colSpan={colonnes.length + 1} className="px-3 py-8 text-center text-gray-400">{emptyText}</td></tr>}
              {lignes.map((row) => (
                <tr key={row.id} onClick={() => setDetailId(row.id)} className="group cursor-pointer hover:bg-sky-50/60 dark:hover:bg-white/5">
                  {colonnes.map((c) => <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''} ${c.strong ? 'font-medium text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>{renderCell(c, row)}</td>)}
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <button onClick={() => setModal({ ...row })} title="Corriger" aria-label="Corriger" className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                    {peutSupprimer && <button onClick={() => supprimer(row)} title="Supprimer" aria-label="Supprimer" className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DetailFiche fiche={ligneDetail ? ficheDe(ligneDetail) : null} onClose={() => setDetailId(null)}
        actions={ligneDetail ? [
          ...(actionsLigne ? actionsLigne(ligneDetail, () => setDetailId(null)) : []),
          { label: 'Modifier', icone: Pencil, tone: 'primaire', onClick: () => { setModal({ ...ligneDetail }); setDetailId(null) } },
          ...(peutSupprimer ? [{ label: 'Supprimer', icone: Trash2, tone: 'danger', onClick: () => { const r = ligneDetail; setDetailId(null); supprimer(r) } }] : [])
        ] : []} />

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier' : titre}
        icone={icon} intro={sousTitre} onSave={save}>
        {modal && champs.map((c) => (
          <Champ key={c.key} label={c.label} icone={ICONE_CHAMP[c.type] || Type} haut={c.type === 'textarea'} iconeLabel={TYPES_BOUTONS.includes(c.type)} required={c.required} aide={c.aide}>
            {c.type === 'periode' ? (
              <ChoixPeriode value={modal[c.key] || c.defaut?.(modal)} onChange={(v) => setModal({ ...modal, [c.key]: v, ...(c.calculer ? c.calculer(v) : {}) })} />
            ) : c.type === 'criteres' ? (
              <GrilleCriteres criteres={c.criteres} value={modal[c.key] || {}} onChange={(v) => setModal({ ...modal, [c.key]: v, ...(c.calculer ? c.calculer(v) : {}) })} />
            ) : c.type === 'employes' ? (
              <ChoixEmployes employes={employes} value={Array.isArray(modal[c.key]) ? modal[c.key] : []} onChange={(v) => setModal({ ...modal, [c.key]: v })} />
            ) : c.type === 'departement' ? (
              <ChoixBoutons options={choixDepartement.options} iconeOption={choixDepartement.iconeOption} value={modal[c.key] ?? ''} onChange={(v) => setModal({ ...modal, [c.key]: v })}
                autre="Autre département" placeholderAutre="Nom du département" vide="Aucun département : créez-en un dans Équipe, Départements, ou touchez Autre." />
            ) : c.type === 'choix' ? (
              <ChoixBoutons options={c.options || []} value={modal[c.key] ?? ''} onChange={(v) => setModal({ ...modal, [c.key]: v })}
                autre={c.autre || 'Autre'} placeholderAutre={c.placeholder || 'Précisez'} vide={c.vide} />
            ) : c.type === 'boutons' ? (
              <ChoixSimple options={c.options || []} value={modal[c.key] ?? ''} onChange={(v) => setModal({ ...modal, [c.key]: v })} />
            ) : c.type === 'select' ? (
              <select value={modal[c.key] ?? ''} onChange={(e) => setModal({ ...modal, [c.key]: e.target.value })} className="input-base">
                {(c.options || []).map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
              </select>
            ) : c.type === 'employe' ? (
              <select value={modal[c.key] ?? ''} onChange={(e) => setModal({ ...modal, [c.key]: e.target.value })} className="input-base">
                <option value="">{c.placeholder || 'Sélectionner…'}</option>
                {employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            ) : c.type === 'textarea' ? (
              <textarea rows={2} value={modal[c.key] ?? ''} onChange={(e) => setModal({ ...modal, [c.key]: e.target.value })} className="input-base" placeholder={c.placeholder} />
            ) : (
              <input type={c.type || 'text'} value={modal[c.key] ?? ''} onChange={(e) => setModal({ ...modal, [c.key]: e.target.value })} className="input-base" placeholder={c.placeholder} />
            )}
          </Champ>
        ))}
      </ModalRh>
    </div>
  )
}
