// RH — Départements (Structure RH). CRUD sur rh_departements + effectifs.
import { useMemo, useState } from 'react'
import { Factory, Plus, Pencil, Trash2, Building2, UserRound, AlignLeft, Sprout, PawPrint, Truck, CalendarHeart, Briefcase, Crown, ChevronRight, Users } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { icone3D } from '../../utils/color'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem, repairCustomIds } from '../../core/db'
import { toast } from '../../core/notifications'
import { COL, STATUTS_EMPLOYE } from './store/rhStore'
import DetailKpiModal from './DetailKpiModal'
import { PageHeader, Champ, ModalRh } from './rhui'
import { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'

// Icône et couleur d'un département, d'après son nom (le bleu du module quand le nom n'est pas reconnu).
const STYLES = [
  { re: /agro|culture|ferme/i, icone: Sprout, couleur: '#16a34a' },
  { re: /[ée]levage|animal/i, icone: PawPrint, couleur: '#ea580c' },
  { re: /logisti|transport/i, icone: Truck, couleur: '#BC3C31' },
  { re: /[ée]v[ée]nement|brique/i, icone: CalendarHeart, couleur: '#475569' },
  { re: /admin|compta|financ/i, icone: Briefcase, couleur: '#0284c7' },
  { re: /direction/i, icone: Crown, couleur: '#7c3aed' }
]
const styleDe = (nom) => STYLES.find((x) => x.re.test(nom || '')) || { icone: Building2, couleur: '#0284c7' }

export default function Departements() {
  const { data: departements } = useCollection(COL.departements)
  const { data: employes } = useCollection(COL.employes)
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null) // département dont on consulte la fiche
  const [tente, setTente] = useState(false) // une validation a déjà échoué : le champ obligatoire est signalé
  const ouvrir = (d) => { setTente(false); setModal(d) }

  // Les départements sont tous créés par l'utilisateur.
  const liste = useMemo(() => departements.filter((d) => !d.masque).map((d) => ({ ...d })).sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')), [departements])

  const effectif = (nom) => employes.filter((e) => e.departement === nom).length

  async function save() {
    const nom = (modal.nom || '').trim()
    if (!nom) { setTente(true); return toast.error('Nom requis') }
    const data = { nom, responsable: modal.responsable || '', description: modal.description || '' }
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
      toast.success(n ? `Supprimé : ${n} agent(s) gardent leur fiche` : 'Supprimé')
      setDetail(null)
    } catch (e) {
      if (e?.name === 'SuppressionAnnulee' || e?.code === 'SUPPRESSION_ANNULEE') return
      console.error('Suppression du département impossible', e)
      toast.error(e?.message || 'Suppression impossible')
    }
  }


  return (
    <div className="space-y-5">
      <PageHeader icon={Factory} sousModule="Structure RH" titre="Départements" sousTitre="Organisez votre structure : départements, responsables et effectifs."
        action={<BoutonBande anime icone={Plus} onClick={() => ouvrir({ nom: '', responsable: '', description: '' })}>Nouveau département</BoutonBande>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {liste.map((d, i) => {
          const { icone: Icone, couleur } = styleDe(d.nom)
          const nb = effectif(d.nom)
          return (
            <div key={d.id || d.nom} role="button" tabIndex={0} aria-label={`Voir le département ${d.nom}`}
              onClick={() => setDetail(d)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(d) } }}
              className="ed-entree group relative cursor-pointer overflow-hidden rounded-3xl border border-white/80 p-4 shadow-[0_14px_30px_-18px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] outline-none backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_40px_-18px_rgba(26,26,26,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] focus-visible:ring-2 focus-visible:ring-sky-400"
              style={{ background: `linear-gradient(135deg, ${couleur}22 0%, rgba(255,255,255,0.78) 62%)`, animationDelay: `${Math.min(i, 8) * 60}ms` }}>
              <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-25 blur-3xl" style={{ background: couleur }} />
              <div className="relative flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105" style={icone3D(couleur)}><Icone size={22} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-extrabold text-gray-800 dark:text-gray-100">{d.nom}</h3>
                  <p className="flex items-center gap-1.5 truncate text-xs text-gray-500">
                    <UserRound size={12} className="shrink-0" aria-hidden="true" /> {d.responsable || 'Aucun responsable'}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-extrabold tabular-nums ring-1 ring-black/5" style={{ color: couleur }}>
                  <Users size={12} aria-hidden="true" /> {nb}
                </span>
              </div>
              {d.description && <p className="relative mt-3 line-clamp-2 text-sm text-gray-600">{d.description}</p>}
              <div className="relative mt-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 transition-colors group-hover:text-gray-600">
                  Voir le détail <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => ouvrir({ ...d })} aria-label={`Modifier ${d.nom}`} title="Modifier"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/80 bg-white/70 text-gray-500 shadow-sm backdrop-blur-md transition-colors hover:bg-white hover:text-sky-700"><Pencil size={14} /></button>
                  <button type="button" onClick={() => supprimer(d)} aria-label={`Supprimer ${d.nom}`} title="Supprimer"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-white/70 text-red-500 shadow-sm backdrop-blur-md transition-colors hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {liste.length === 0 && (
        <div className="ed-entree flex flex-col items-center gap-3 rounded-3xl border border-white/80 bg-white/60 px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={icone3D('#0284c7')}><Building2 size={26} /></span>
          <p className="text-base font-bold text-gray-800">Aucun département pour le moment</p>
          <p className="max-w-sm text-sm text-gray-500">Créez vos départements : ils seront proposés dans les fiches des employés, les postes et les offres de recrutement.</p>
          <Button onClick={() => ouvrir({ nom: '', responsable: '', description: '' })} style={{ backgroundColor: '#0284c7' }}><Plus size={16} /> Nouveau département</Button>
        </div>
      )}

      {/* Fiche d'un département : ses agents, avec les actions Modifier et Supprimer. */}
      {detail && (() => {
        const { icone, couleur } = styleDe(detail.nom)
        const agents = employes.filter((e) => e.departement === detail.nom)
        return (
          <DetailKpiModal onClose={() => setDetail(null)}
            fiche={{
              titre: detail.nom, icone, couleur, sous: detail.description || 'Aucune description.',
              tuiles: [{ icone: Users, titre: 'Agents', valeur: agents.length }, { icone: UserRound, titre: 'Responsable', valeur: detail.responsable || 'Non défini' }],
              lignes: agents.map((e) => ({ id: e.id, libelle: e.nom || 'Sans nom', sous: e.poste || '', detail: STATUTS_EMPLOYE[e.statut || 'actif']?.label || 'Actif', ton: (e.statut || 'actif') === 'actif' ? 'vert' : 'orange' })),
              vide: 'Aucun agent dans ce département.', lien: { to: '/rh/employes', label: 'Ouvrir les employés' }
            }}
            pied={<>
              <Button variant="ghost" onClick={() => { const d = detail; setDetail(null); ouvrir({ ...d }) }}><Pencil size={15} /> Modifier</Button>
              <Button variant="ghost" onClick={() => supprimer(detail)} style={{ color: '#dc2626' }}><Trash2 size={15} /> Supprimer</Button>
            </>} />
        )
      })()}

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le département' : 'Nouveau département'} titreHero={modal?.nom?.trim() || undefined}
        icone={modal ? styleDe(modal.nom).icone : Building2} intro="Un département regroupe des employés sous un même responsable." onSave={save}>
        {modal && (<>
          <Champ label="Nom du département" icone={Building2} required erreur={tente && !(modal.nom || '').trim() ? 'Le nom est obligatoire.' : undefined}>
            <input value={modal.nom} onChange={(e) => setModal({ ...modal, nom: e.target.value })} className="input-base" placeholder="Ex. Élevage, Logistique…" autoFocus />
          </Champ>
          <Champ label="Responsable" icone={UserRound}>
            <input value={modal.responsable || ''} onChange={(e) => setModal({ ...modal, responsable: e.target.value })} className="input-base" placeholder="Nom du responsable" />
          </Champ>
          <Champ label="Description" icone={AlignLeft} haut aide="Facultatif : le rôle du département en une phrase.">
            <textarea rows={2} value={modal.description || ''} onChange={(e) => setModal({ ...modal, description: e.target.value })} className="input-base" placeholder="Ce que fait ce département" />
          </Champ>
        </>)}
      </ModalRh>
    </div>
  )
}

