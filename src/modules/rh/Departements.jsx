// RH : Départements. Les départements sont les modules de l'entreprise (sauf E-DÉPENSES et E-G.Pro) :
// en tapant ou en touchant le nom, on choisit un module disponible, dont le logo est repris. Un logo propre peut être ajouté ;
// sans choix ni logo, une icône est utilisée. CRUD sur rh_departements + effectifs.
import { useMemo, useRef, useState } from 'react'
import { Factory, Plus, Pencil, Trash2, Building2, UserRound, AlignLeft, ChevronRight, Users, ImagePlus, X, ClipboardList, LayoutGrid, Sparkles, Check, Tag, PencilLine } from 'lucide-react'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem, repairCustomIds } from '../../core/db'
import { toast } from '../../core/notifications'
import { compresserLogo } from '../../utils/fichiers'
import { COL, STATUTS_EMPLOYE } from './store/rhStore'
import DetailKpiModal from './DetailKpiModal'
import { PageHeader, Champ, ModalRh } from './rhui'
import { usePeutSupprimerRh } from './suppression'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { MODULES_DEPARTEMENTS, CATEGORIES_DEPARTEMENT, categorieAuto, visuelDepartement, LogoDepartement } from './departementsVisuel'

const vide = () => ({ nom: '', responsable: '', description: '', moduleId: '', logo: '', categorie: '', categorieLibelle: '' })

export default function Departements() {
  const peutSupprimer = usePeutSupprimerRh() // le bouton Supprimer est réservé à l'administration
  const { data: departements } = useCollection(COL.departements)
  const { data: employes } = useCollection(COL.employes)
  const { data: postes } = useCollection(COL.postes)
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null) // département dont on consulte la fiche
  const [tente, setTente] = useState(false) // une validation a déjà échoué : le champ obligatoire est signalé
  const [propositions, setPropositions] = useState(false) // liste des modules proposés sous le nom
  const [filtreCat, setFiltreCat] = useState('') // catégorie affichée (vide = toutes)
  const fichier = useRef(null)
  const ouvrir = (d) => { setTente(false); setPropositions(false); setModal(d) }

  // Les départements sont tous créés par l'utilisateur.
  const liste = useMemo(() => departements.filter((d) => !d.masque).map((d) => ({ ...d })).sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')), [departements])
  const effectif = (nom) => employes.filter((e) => e.departement === nom).length
  // Responsable : seulement les employés déjà renseignés dans l'Annuaire (un par nom, ordre alphabétique).
  const personnes = useMemo(() => {
    const vus = new Set()
    return employes
      .filter((e) => { const k = String(e.nom || '').trim().toLowerCase(); if (!k || vus.has(k)) return false; vus.add(k); return true })
      .map((e) => ({ nom: e.nom.trim(), detail: e.poste || e.departement || '' }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [employes])
  const categoriesPresentes = useMemo(() => {
    const n = {}
    const vues = {}
    liste.forEach((d) => { const c = visuelDepartement(d).categorie; n[c.cle] = (n[c.cle] || 0) + 1; vues[c.cle] = c })
    return Object.keys(n).map((cle) => ({ ...vues[cle], id: cle, nb: n[cle] }))
      .sort((a, b) => CATEGORIES_DEPARTEMENT.findIndex((x) => x.id === a.id.split(':')[0]) - CATEGORIES_DEPARTEMENT.findIndex((x) => x.id === b.id.split(':')[0]) || a.label.localeCompare(b.label, 'fr'))
  }, [liste])
  const affiches = filtreCat ? liste.filter((d) => visuelDepartement(d).categorie.cle === filtreCat) : liste

  // Modules encore disponibles comme département (ceux déjà ajoutés sont écartés, sauf celui qu'on modifie), filtrés par ce qui est tapé.
  const modulesDispo = useMemo(() => {
    const pris = new Set(liste.filter((d) => d.id !== modal?.id).map((d) => d.moduleId || visuelDepartement(d).module?.id).filter(Boolean))
    const t = String(modal?.nom || '').trim().toLowerCase()
    return MODULES_DEPARTEMENTS.filter((m) => !pris.has(m.id) && (!t || m.nom.toLowerCase().includes(t)))
  }, [liste, modal])

  function choisirModule(m) {
    setModal((x) => ({ ...x, nom: m.nom, moduleId: m.id, categorie: '', categorieLibelle: '' }))
    setPropositions(false)
  }
  function saisirNom(v) {
    const m = MODULES_DEPARTEMENTS.find((x) => x.nom.toLowerCase() === v.trim().toLowerCase())
    setModal((x) => ({ ...x, nom: v, moduleId: m ? m.id : '' }))
    setPropositions(true)
  }
  async function ajouterLogo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { const logo = await compresserLogo(f); setModal((x) => ({ ...x, logo })) } catch (err) { toast.error(err.message || 'Logo impossible à lire') }
  }

  async function save() {
    const nom = (modal.nom || '').trim()
    if (!nom) { setTente(true); return toast.error('Nom requis') }
    const data = { nom, responsable: modal.responsable || '', description: modal.description || '', moduleId: modal.moduleId || '', logo: modal.logo || '', categorie: modal.categorie || categorieAuto(modal) || '', categorieLibelle: (modal.categorie === 'autre' ? (modal.categorieLibelle || '').trim() : '') }
    if (modal.id) await updateItem(COL.departements, modal.id, data)
    else await addItem(COL.departements, data)
    toast.success('Enregistré ✓'); setModal(null)
  }
  // La fenêtre « Motif de la suppression » sert de confirmation. Une erreur est affichée (au lieu d'échouer sans rien dire) ;
  // annuler la fenêtre n'est pas une erreur.
  async function supprimer(d) {
    if (!d?.id) return toast.error('Ce département est introuvable : rechargez la page.')
    try {
      // Un département dont l'identifiant ne correspond pas à sa clé en base ne se supprimait pas (rien ne se passait) : on le remet d'abord en ordre.
      await repairCustomIds(COL.departements).catch(() => {})
      await removeItem(COL.departements, d.id)
      const n = effectif(d.nom)
      toast.success(n ? `Supprimé : ${n} employé(s) gardent leur fiche` : 'Supprimé')
      setDetail(null)
    } catch (e) {
      if (e?.name === 'SuppressionAnnulee' || e?.code === 'SUPPRESSION_ANNULEE') return
      console.error('Suppression du département impossible', e)
      toast.error(e?.message || 'Suppression impossible')
    }
  }

  const catConseillee = modal ? categorieAuto(modal) : ''
  const visuelModal = modal ? visuelDepartement({ ...modal, categorie: modal.categorie || catConseillee }) : null

  return (
    <div className="space-y-5">
      <PageHeader icon={Factory} sousModule="Équipe" titre="Départements" sousTitre="Chaque département est un module de l'entreprise : responsable, logo et effectifs."
        action={<BoutonBande anime icone={Plus} onClick={() => ouvrir(vide())}>Nouveau département</BoutonBande>} />

      {categoriesPresentes.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
          <button type="button" onClick={() => setFiltreCat('')} data-actif={!filtreCat} aria-pressed={!filtreCat} className="puce-verre rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ '--puce': '#0284c7' }}>Toutes ({liste.length})</button>
          {categoriesPresentes.map((c) => {
            const Ic = c.icone
            return (
              <button key={c.id} type="button" onClick={() => setFiltreCat(filtreCat === c.id ? '' : c.id)} data-actif={filtreCat === c.id} aria-pressed={filtreCat === c.id}
                className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ '--puce': c.couleur }}>
                <Ic size={13} aria-hidden="true" />{c.label} ({c.nb})
              </button>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {affiches.map((d, i) => {
          const v = visuelDepartement(d)
          const c = v.couleur
          const nb = effectif(d.nom)
          return (
            <div key={d.id || d.nom} role="button" tabIndex={0} aria-label={`Voir le département ${d.nom}`}
              onClick={() => setDetail(d)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(d) } }}
              className="ed-entree group relative cursor-pointer overflow-hidden rounded-[1.75rem] p-4 outline-none backdrop-blur-2xl backdrop-saturate-150 transition-all duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-sky-400 sm:p-5"
              style={{
                background: `linear-gradient(150deg, ${c}40 0%, rgba(255,255,255,0.62) 55%, ${c}14 100%)`,
                border: `1px solid ${c}55`,
                boxShadow: `0 22px 40px -24px ${c}, 0 2px 0 rgba(255,255,255,0.9) inset, 0 -14px 24px -20px ${c}66 inset`,
                animationDelay: `${Math.min(i, 8) * 60}ms`
              }}>
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full opacity-30 blur-3xl transition-opacity group-hover:opacity-50" style={{ background: c }} />
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
              <v.Icone aria-hidden="true" size={120} strokeWidth={1.2} className="pointer-events-none absolute -bottom-6 -right-4 rotate-[-12deg] opacity-[0.08] transition-transform duration-300 group-hover:scale-110" style={{ color: c }} />

              <div className="relative flex items-center gap-3.5">
                <LogoDepartement visuel={v} taille={60} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-black leading-tight tracking-tight text-gray-900 dark:text-gray-100">{d.nom}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-semibold text-gray-600">
                    <UserRound size={12} className="shrink-0" aria-hidden="true" /> {d.responsable || 'Aucun responsable'}
                  </p>
                  <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide" style={{ color: c }}>
                    <v.categorie.icone size={11} className="shrink-0" aria-hidden="true" /><span className="truncate">{v.categorie.label}</span>
                  </p>
                </div>
              </div>

              {d.description && <p className="relative mt-3 line-clamp-2 text-sm text-gray-600">{d.description}</p>}

              <div className="relative mt-4 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-extrabold tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md" style={{ color: c }}>
                  <Users size={13} aria-hidden="true" /> {nb} employé{nb > 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => ouvrir({ ...vide(), ...d })} aria-label={`Modifier ${d.nom}`} title="Modifier"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/80 bg-white/70 text-gray-500 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white hover:text-sky-700 active:scale-90"><Pencil size={14} /></button>
                  {peutSupprimer && <button type="button" onClick={() => supprimer(d)} aria-label={`Supprimer ${d.nom}`} title="Supprimer"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-white/70 text-red-500 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-red-50 hover:text-red-700 active:scale-90"><Trash2 size={14} /></button>}
                  <span className="ml-0.5 inline-flex items-center text-xs font-semibold text-gray-500 transition-transform group-hover:translate-x-0.5">Détails <ChevronRight size={14} aria-hidden="true" /></span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {liste.length === 0 && (
        <div className="ed-entree flex flex-col items-center gap-3 rounded-3xl border border-white/80 bg-white/60 px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#0284c7,#0369a1)', color: '#fff' }}><Building2 size={26} /></span>
          <p className="text-base font-bold text-gray-800">Aucun département pour le moment</p>
          <p className="max-w-sm text-sm text-gray-500">Ajoutez vos départements : choisissez un module de l'entreprise, ou saisissez un autre nom. Ils seront proposés dans les fiches des employés, les postes et les offres.</p>
          <Button onClick={() => ouvrir(vide())} style={{ backgroundColor: '#0284c7' }}><Plus size={16} /> Nouveau département</Button>
        </div>
      )}

      {/* Fiche d'un département : logo, module lié, postes, employés, avec les actions Modifier et Supprimer. */}
      {detail && (() => {
        const v = visuelDepartement(detail)
        const agents = employes.filter((e) => e.departement === detail.nom)
        const nbPostes = postes.filter((p) => p.departement === detail.nom).length
        return (
          <DetailKpiModal onClose={() => setDetail(null)}
            fiche={{
              titre: detail.nom, icone: v.Icone, logo: v.logo, couleur: v.couleur,
              sous: `${v.categorie.label}${v.module ? ` · Module ${v.module.nom}` : ''} : ${detail.description || 'aucune description.'}`,
              tuiles: [
                { icone: Users, titre: 'Employés', valeur: agents.length },
                { icone: ClipboardList, titre: 'Postes', valeur: nbPostes },
                { icone: UserRound, titre: 'Responsable', valeur: detail.responsable || 'Non défini' }
              ],
              lignes: agents.map((e) => ({ id: e.id, libelle: e.nom || 'Sans nom', sous: [e.poste, e.localite].filter(Boolean).join(' · '), detail: STATUTS_EMPLOYE[e.statut || 'actif']?.label || 'Actif', ton: (e.statut || 'actif') === 'actif' ? 'vert' : 'orange' })),
              vide: 'Aucun employé dans ce département.', lien: { to: '/rh/employes', label: 'Ouvrir les employés' }
            }}
            pied={<>
              <Button variant="ghost" onClick={() => { const d = detail; setDetail(null); ouvrir({ ...vide(), ...d }) }}><Pencil size={15} /> Modifier</Button>
              {peutSupprimer && <Button variant="ghost" onClick={() => supprimer(detail)} style={{ color: '#dc2626' }}><Trash2 size={15} /> Supprimer</Button>}
            </>} />
        )
      })()}

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le département' : 'Nouveau département'} titreHero={modal?.nom?.trim() || 'Nouveau département'}
        iconeNode={visuelModal ? <LogoDepartement visuel={visuelModal} taille={56} /> : null} icone={Building2}
        intro={visuelModal?.module ? `Module ${visuelModal.module.nom}` : 'Un département regroupe des employés sous un même responsable.'} onSave={save}>
        {modal && (<>
          <Champ label="Nom du département" icone={Building2} required erreur={tente && !(modal.nom || '').trim() ? 'Le nom est obligatoire.' : undefined}
            aide="Touchez le champ : les modules disponibles sont proposés. Vous pouvez aussi saisir un autre nom.">
            <input value={modal.nom} onChange={(e) => saisirNom(e.target.value)} onFocus={() => setPropositions(true)} onClick={() => setPropositions(true)} onBlur={() => setTimeout(() => setPropositions(false), 150)}
              className="input-base" placeholder="Ex. MAXI-AGRO, Direction…" autoFocus autoComplete="off" />
            {propositions && modulesDispo.length > 0 && (
              <div className="ed-entree mt-2 overflow-hidden rounded-2xl border border-white bg-white/95 p-1.5 shadow-[0_24px_44px_-18px_rgba(2,52,87,0.6)] backdrop-blur-2xl" role="listbox" aria-label="Modules disponibles">
                <p className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-[10px] font-extrabold uppercase tracking-wider text-gray-400"><LayoutGrid size={11} aria-hidden="true" /> Modules disponibles</p>
                <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                  {modulesDispo.map((m) => {
                    const actif = modal.moduleId === m.id
                    return (
                      <button key={m.id} type="button" role="option" aria-selected={actif} onMouseDown={(e) => e.preventDefault()} onClick={() => choisirModule(m)}
                        className="group flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-left transition-all hover:border-white hover:bg-white hover:shadow-sm active:scale-[0.98]"
                        style={actif ? { background: `${m.color}18`, borderColor: `${m.color}55` } : undefined}>
                        <LogoDepartement visuel={visuelDepartement({ moduleId: m.id })} taille={34} />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-800">{m.nom}</span>
                        {actif && <Check size={15} className="shrink-0" style={{ color: m.color }} aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </Champ>

          <Champ label="Catégorie" icone={Tag} iconeLabel
            aide={modal.categorie ? 'Catégorie choisie par vous.' : catConseillee ? "Proposée d'après le nom ou le module : touchez une autre catégorie pour la changer." : 'Touchez une catégorie : elle détermine le logo par défaut.'}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Catégorie du département">
              {CATEGORIES_DEPARTEMENT.filter((c) => c.id !== 'autre').map((c) => {
                const choisie = modal.categorie === c.id
                const conseillee = !modal.categorie && catConseillee === c.id
                const Ic = c.icone
                return (
                  <button key={c.id} type="button" aria-pressed={choisie || conseillee} onClick={() => setModal({ ...modal, categorie: choisie ? '' : c.id })}
                    className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" data-actif={choisie || conseillee} style={{ '--puce': c.couleur }}>
                    <Ic size={13} aria-hidden="true" />{c.label}{conseillee && <Sparkles size={11} aria-hidden="true" />}
                  </button>
                )
              })}
              <button type="button" aria-pressed={modal.categorie === 'autre'} onClick={() => setModal({ ...modal, categorie: modal.categorie === 'autre' ? '' : 'autre' })}
                className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" data-actif={modal.categorie === 'autre'} style={{ '--puce': '#0284c7' }}>
                <Plus size={13} aria-hidden="true" />Autre catégorie
              </button>
            </div>
            {modal.categorie === 'autre' && (
              <div className="rh-champ-icone relative mt-2 ed-entree">
                <PencilLine size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-sky-500" />
                <input value={modal.categorieLibelle || ''} onChange={(e) => setModal({ ...modal, categorieLibelle: e.target.value })} className="input-base !rounded-2xl"
                  placeholder="Nom de la catégorie, ex. Sécurité" autoFocus maxLength={40} />
              </div>
            )}
          </Champ>

          <Champ label="Logo du département" icone={Sparkles} iconeLabel aide="Facultatif : sans logo, celui du module est utilisé, sinon l'icône de la catégorie.">
            <div className="flex flex-wrap items-center gap-3">
              <LogoDepartement visuel={visuelModal} taille={64} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fichier.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white/80 px-3 py-2 text-xs font-bold text-sky-700 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white active:scale-95">
                  <ImagePlus size={15} aria-hidden="true" /> {modal.logo ? 'Changer le logo' : 'Ajouter un logo'}
                </button>
                {modal.logo && (
                  <button type="button" onClick={() => setModal({ ...modal, logo: '' })}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-xs font-bold text-gray-500 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:text-red-600 active:scale-95">
                    <X size={14} aria-hidden="true" /> Retirer
                  </button>
                )}
              </div>
              <input ref={fichier} type="file" accept="image/*" className="hidden" onChange={ajouterLogo} />
            </div>
          </Champ>

          <Champ label="Responsable" icone={UserRound} aide={personnes.length ? "Les employés déjà ajoutés dans l'Annuaire sont proposés." : "Aucun employé dans l'Annuaire pour le moment : saisissez un nom."}>
            <ChampAutocomplete accent="sky" className="input-base" value={modal.responsable || ''} onChange={(v) => setModal((x) => ({ ...x, responsable: v }))}
              suggestions={personnes} getLabel={(e) => e.nom} getDetail={(e) => e.detail} maxSuggestions={10}
              placeholder="Choisissez un employé de l'Annuaire" emptyLabel="Aucun employé correspondant : votre saisie sera utilisée." />
          </Champ>
          <Champ label="Description" icone={AlignLeft} haut aide="Facultatif : le rôle du département en une phrase.">
            <textarea rows={2} value={modal.description || ''} onChange={(e) => setModal({ ...modal, description: e.target.value })} className="input-base" placeholder="Ce que fait ce département" />
          </Champ>
        </>)}
      </ModalRh>
    </div>
  )
}
