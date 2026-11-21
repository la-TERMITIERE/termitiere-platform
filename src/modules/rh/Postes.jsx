// RH : Postes de travail. Grille « bento » de cartes en verre (le poste, son département, sa classification, son salaire, son effectif) ;
// un clic ouvre la fiche détaillée. Les postes ajoutés depuis la fiche d'un employé arrivent ici tout seuls.
import { useMemo, useState } from 'react'
import { ClipboardList, Plus, Pencil, Trash2, Briefcase, Building2, Layers, Banknote, AlignLeft, Users, ChevronRight } from 'lucide-react'
import Button from '../../shared/ui/Button'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { COL, STATUTS_EMPLOYE } from './store/rhStore'
import { useDepartements } from './useDepartements'
import { useChoixDepartement } from './departementsChoix'
import { PageHeader, Champ, ModalRh, ChoixBoutons } from './rhui'
import { usePeutSupprimerRh } from './suppression'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import DetailKpiModal from './DetailKpiModal'
import { visuelDepartement, LogoDepartement } from './departementsVisuel'
import { postesProposes } from './postesSuggeres'

const CLASSIFICATIONS = ['Ouvrier', 'Employé', 'Agent de maîtrise', 'Cadre', 'Direction']
const vide = () => ({ intitule: '', departement: '', classification: '', salaireBase: 0, missions: '' })
const norme = (t) => String(t || '').trim().toLowerCase()
// Rythme du « bento » : sur 6 colonnes, une rangée de 2 cartes larges puis une rangée de 3 cartes.
const RYTHME = ['lg:col-span-3', 'lg:col-span-3', 'lg:col-span-2', 'lg:col-span-2', 'lg:col-span-2']

export default function Postes() {
  const departements = useDepartements()
  const choixDep = useChoixDepartement()
  const peutSupprimer = usePeutSupprimerRh() // le bouton Supprimer est réservé à l'administration
  const { data: postes } = useCollection(COL.postes)
  const { data: employes } = useCollection(COL.employes)
  const { data: departementsDocs } = useCollection(COL.departements)
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [filtreDep, setFiltreDep] = useState('')

  const effectif = (intitule) => employes.filter((e) => norme(e.poste) === norme(intitule)).length
  // Visuel (logo, couleur) du département d'un poste ; bleu du module quand le département est inconnu.
  const visuelDe = (p) => {
    const doc = departementsDocs.find((d) => norme(d.nom) === norme(p.departement))
    return p.departement ? visuelDepartement(doc || { nom: p.departement }) : { ...visuelDepartement({ nom: '' }), Icone: Briefcase, couleur: '#0284c7', logo: '' }
  }

  const liste = useMemo(() => [...postes].sort((a, b) => (a.intitule || '').localeCompare(b.intitule || '', 'fr')), [postes])
  const departementsPresents = useMemo(() => [...new Set(liste.map((p) => p.departement).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [liste])
  const affiches = filtreDep ? liste.filter((p) => norme(p.departement) === norme(filtreDep)) : liste

  // Suggestions du formulaire : le catalogue, puis des postes types selon la catégorie du département choisi.
  const categorieModal = useMemo(() => {
    if (!modal?.departement) return ''
    const doc = departementsDocs.find((d) => norme(d.nom) === norme(modal.departement))
    return visuelDepartement(doc || { nom: modal.departement }).categorie.id
  }, [modal?.departement, departementsDocs])
  const propositions = useMemo(() => postesProposes(postes.filter((p) => p.id !== modal?.id), modal?.departement, categorieModal), [postes, modal?.id, modal?.departement, categorieModal])

  async function save() {
    const intitule = (modal.intitule || '').trim()
    if (!intitule) return toast.error('Intitulé requis')
    const data = { intitule, departement: modal.departement || '', classification: modal.classification || '', salaireBase: Number(modal.salaireBase) || 0, missions: modal.missions || '' }
    if (modal.id) await updateItem(COL.postes, modal.id, data)
    else await addItem(COL.postes, data)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(p) {
    try {
      await removeItem(COL.postes, p.id)
      toast.success('Supprimé')
      setDetail(null)
    } catch (e) {
      if (e?.name === 'SuppressionAnnulee' || e?.code === 'SUPPRESSION_ANNULEE') return
      toast.error(e?.message || 'Suppression impossible')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={ClipboardList} sousModule="Équipe" titre="Postes de travail" sousTitre="Les emplois de l'entreprise : département, classification, salaire de base et effectif."
        action={<BoutonBande anime icone={Plus} onClick={() => setModal(vide())}>Nouveau poste</BoutonBande>} />

      {departementsPresents.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par département">
          <button type="button" onClick={() => setFiltreDep('')} data-actif={!filtreDep} aria-pressed={!filtreDep} className="puce-verre rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ '--puce': '#0284c7' }}>Tous ({liste.length})</button>
          {departementsPresents.map((d) => (
            <button key={d} type="button" onClick={() => setFiltreDep(filtreDep === d ? '' : d)} data-actif={norme(filtreDep) === norme(d)} aria-pressed={norme(filtreDep) === norme(d)}
              className="puce-verre rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ '--puce': visuelDe({ departement: d }).couleur }}>{d}</button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {affiches.map((p, i) => {
          const v = visuelDe(p)
          const c = v.couleur
          const nb = effectif(p.intitule)
          const large = RYTHME[i % RYTHME.length] === 'lg:col-span-3'
          return (
            <div key={p.id} role="button" tabIndex={0} aria-label={`Voir le poste ${p.intitule}`}
              onClick={() => setDetail(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(p) } }}
              className={`ed-entree group relative cursor-pointer overflow-hidden rounded-[1.75rem] p-4 outline-none backdrop-blur-2xl backdrop-saturate-150 transition-all duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-sky-400 sm:p-5 ${RYTHME[i % RYTHME.length]} ${large ? 'sm:col-span-2' : ''}`}
              style={{
                background: `linear-gradient(150deg, ${c}34 0%, rgba(255,255,255,0.64) 58%, ${c}12 100%)`,
                border: `1px solid ${c}50`,
                boxShadow: `0 22px 40px -26px ${c}, 0 2px 0 rgba(255,255,255,0.9) inset, 0 -14px 24px -22px ${c}66 inset`,
                animationDelay: `${Math.min(i, 9) * 55}ms`
              }}>
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full opacity-30 blur-3xl transition-opacity group-hover:opacity-50" style={{ background: c }} />
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
              <Briefcase aria-hidden="true" size={110} strokeWidth={1.2} className="pointer-events-none absolute -bottom-6 -right-3 rotate-[-10deg] opacity-[0.07] transition-transform duration-300 group-hover:scale-110" style={{ color: c }} />

              <div className="relative flex items-start gap-3">
                <LogoDepartement visuel={v} taille={large ? 52 : 44} />
                <div className="min-w-0 flex-1">
                  <h3 className={`font-black leading-tight tracking-tight text-gray-900 dark:text-gray-100 ${large ? 'text-xl' : 'text-base'}`}>{p.intitule}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-semibold text-gray-600">
                    <Building2 size={12} className="shrink-0" aria-hidden="true" /> {p.departement || 'Sans département'}
                  </p>
                </div>
                {p.classification && (
                  <span className="shrink-0 rounded-full border border-white/80 bg-white/75 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]" style={{ color: c }}>{p.classification}</span>
                )}
              </div>

              {large && p.missions && <p className="relative mt-3 line-clamp-2 text-sm text-gray-600">{p.missions}</p>}

              <div className="relative mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Salaire de base</p>
                  <p className="text-lg font-black tabular-nums leading-tight" style={{ color: p.salaireBase ? c : '#9ca3af' }}>{p.salaireBase ? formatMoney(p.salaireBase) : 'Non défini'}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-extrabold tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md" style={{ color: c }}>
                  <Users size={13} aria-hidden="true" /> {nb}
                </span>
              </div>

              <div className="relative mt-3 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="inline-flex items-center text-xs font-semibold text-gray-500 transition-transform group-hover:translate-x-0.5">Détails <ChevronRight size={14} aria-hidden="true" /></span>
                <span className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setModal({ ...vide(), ...p })} aria-label={`Modifier ${p.intitule}`} title="Modifier"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/80 bg-white/70 text-gray-500 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white hover:text-sky-700 active:scale-90"><Pencil size={14} /></button>
                  {peutSupprimer && <button type="button" onClick={() => supprimer(p)} aria-label={`Supprimer ${p.intitule}`} title="Supprimer"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-white/70 text-red-500 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-red-50 hover:text-red-700 active:scale-90"><Trash2 size={14} /></button>}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {liste.length === 0 && (
        <div className="ed-entree flex flex-col items-center gap-3 rounded-3xl border border-white/80 bg-white/60 px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#0284c7,#0369a1)', color: '#fff' }}><Briefcase size={26} /></span>
          <p className="text-base font-bold text-gray-800">Aucun poste pour le moment</p>
          <p className="max-w-sm text-sm text-gray-500">Ajoutez un poste ici, ou renseignez simplement un employé : son poste rejoint automatiquement cette page.</p>
          <Button onClick={() => setModal(vide())} style={{ backgroundColor: '#0284c7' }}><Plus size={16} /> Nouveau poste</Button>
        </div>
      )}

      {/* Fiche d'un poste : ses chiffres clés et les agents qui l'occupent. */}
      {detail && (() => {
        const v = visuelDe(detail)
        const agents = employes.filter((e) => norme(e.poste) === norme(detail.intitule))
        return (
          <DetailKpiModal onClose={() => setDetail(null)}
            fiche={{
              titre: detail.intitule, icone: v.Icone, logo: v.logo, couleur: v.couleur,
              sous: `${detail.departement || 'Sans département'}${detail.missions ? ' : ' + detail.missions : ''}`,
              tuiles: [
                { icone: Users, titre: 'Agents', valeur: agents.length },
                { icone: Banknote, titre: 'Salaire de base', valeur: detail.salaireBase ? formatMoney(detail.salaireBase) : 'Non défini' },
                { icone: Layers, titre: 'Classification', valeur: detail.classification || 'Non définie' }
              ],
              lignes: agents.map((e) => ({ id: e.id, libelle: e.nom || 'Sans nom', sous: [e.departement, e.localite].filter(Boolean).join(' · '), detail: STATUTS_EMPLOYE[e.statut || 'actif']?.label || 'Actif', ton: (e.statut || 'actif') === 'actif' ? 'vert' : 'orange' })),
              vide: 'Personne n\'occupe ce poste pour le moment.', lien: { to: '/rh/employes', label: 'Ouvrir l\'annuaire' }
            }}
            pied={<>
              <Button variant="ghost" onClick={() => { const p = detail; setDetail(null); setModal({ ...vide(), ...p }) }}><Pencil size={15} /> Modifier</Button>
              {peutSupprimer && <Button variant="ghost" onClick={() => supprimer(detail)} style={{ color: '#dc2626' }}><Trash2 size={15} /> Supprimer</Button>}
            </>} />
        )
      })()}

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le poste' : 'Nouveau poste'} titreHero={modal?.intitule?.trim() || undefined}
        icone={Briefcase} intro="Un poste décrit un emploi : son département, sa classification et son salaire de base." onSave={save}>
        {modal && (<>
          <Champ label="Intitulé du poste" icone={Briefcase} required aide="Touchez le champ : des postes sont proposés selon le département.">
            <ChampAutocomplete accent="sky" className="input-base" autoFocus value={modal.intitule} onChange={(v) => setModal((m) => ({ ...m, intitule: v }))}
              suggestions={propositions} getLabel={(x) => x.intitule} getDetail={(x) => (x.source === 'catalogue' ? (x.departement || 'Catalogue') : 'Suggestion')} maxSuggestions={12}
              placeholder="Ex. Responsable d'élevage" emptyLabel="Aucune proposition : votre saisie sera utilisée." />
          </Champ>
          <Champ label="Département" icone={Building2} iconeLabel>
            <ChoixBoutons options={choixDep.options} iconeOption={choixDep.iconeOption} value={modal.departement} onChange={(v) => setModal({ ...modal, departement: v })}
              placeholderAutre="Nom du département" vide="Aucun département créé : saisissez-en un ci-dessous ou créez-les dans l'onglet Départements." />
          </Champ>
          <Champ label="Classification" icone={Layers} iconeLabel>
            <ChoixBoutons options={CLASSIFICATIONS} value={modal.classification} onChange={(v) => setModal({ ...modal, classification: v })} placeholderAutre="Autre classification" />
          </Champ>
          <Champ label="Salaire de base (XOF)" icone={Banknote}>
            <input type="number" min="0" value={modal.salaireBase} onChange={(e) => setModal({ ...modal, salaireBase: e.target.value })} className="input-base" />
          </Champ>
          <Champ label="Missions principales" icone={AlignLeft} haut>
            <textarea rows={2} value={modal.missions} onChange={(e) => setModal({ ...modal, missions: e.target.value })} className="input-base" />
          </Champ>
        </>)}
      </ModalRh>
    </div>
  )
}
