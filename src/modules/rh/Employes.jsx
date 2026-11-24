// Employés — CRUD complet.
import { useState, useMemo } from 'react'
import { Plus, Trash2, Pencil, UserRound, Briefcase, Building2, CalendarDays, Banknote, Phone, MapPin, FileText, Link2, BookOpen, TrendingUp, Cake, Package } from 'lucide-react'
import { ecartCompetence } from './competencesFormations'
import DetailFiche from './DetailFiche'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem, repairCustomIds } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useDepartements } from './useDepartements'
import { useChoixDepartement } from './departementsChoix'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { roleLabel } from '../../core/roles'
import { postesProposes } from './postesSuggeres'
import { visuelDepartement } from './departementsVisuel'
import { COL, TYPES_CONTRAT } from './store/rhStore'
import { PageHeader, Champ, ModalRh, ChoixBoutons } from './rhui'
import { usePeutSupprimerRh } from './suppression'
import { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'
import { UserCircle as IconeEmployes } from 'lucide-react'

// Le contrat et le salaire (et donc la date d'arrivée) ne se saisissent plus ici : ils viennent du volet Contrats.
const empty = () => ({ nom: '', poste: '', departement: '', localite: '', dateNaissance: '', contact: '' })
// Les sites en deux localités (MAXI-GYM, MAXI LOGISTIQUE) : un même poste existe à Lomé et à Kara (ex. DS Lomé, DS Kara). « Autre » pour une autre localité.
const LOCALITES_BASE = ['Lomé', 'Kara']
// Couleur par localité (Lomé bleu, Kara violet, autre ardoise) : distincte des couleurs de secteur (vert agro, rouge logistique…).
const COULEUR_LOCALITE = { lome: '#0284c7', kara: '#7c3aed' }
const COULEUR_AUTRE_LOCALITE = '#64748b'
const cleLoc = (l) => String(l || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const couleurLocalite = (l) => COULEUR_LOCALITE[cleLoc(l)] || COULEUR_AUTRE_LOCALITE
// Pastille teintée : icône + texte à la couleur donnée, fond et bord en verre de la même teinte.
function Pastille({ couleur, icone: Icone, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold"
      style={{ color: couleur, background: `color-mix(in srgb, ${couleur} 12%, transparent)`, borderColor: `color-mix(in srgb, ${couleur} 30%, transparent)` }}>
      <Icone size={13} aria-hidden="true" />{children}
    </span>
  )
}
// En-tête de colonne avec son icône.
const Tete = ({ icone: Icone, children }) => <span className="inline-flex items-center gap-1.5"><Icone size={13} aria-hidden="true" />{children}</span>

export default function Employes() {
  const departements = useDepartements()
  const choixDep = useChoixDepartement()
  const { data: postes } = useCollection(COL.postes)
  const { data: departementsDocs } = useCollection(COL.departements)
  const { data: employes } = useCollection('rh_employes')
  const { data: comptes } = useCollection('users')
  const { data: contrats } = useCollection(COL.contrats)
  const { data: formations } = useCollection(COL.formations)
  const { data: competencesEmp } = useCollection(COL.competences)
  const { data: dotations } = useCollection(COL.dotations)
  const [detailId, setDetailId] = useState(null)
  // Personnes déjà sur la plateforme (comptes utilisateurs) qui n'ont pas encore de fiche employé ni de rattachement.
  const personnesPlateforme = useMemo(() => {
    const noms = new Set(employes.map((e) => String(e.nom || '').trim().toLowerCase()))
    const lies = new Set(employes.map((e) => e.userId).filter(Boolean))
    return comptes.filter((u) => (u.nom || u.login) && !lies.has(u.id) && !noms.has(String(u.nom || u.login).trim().toLowerCase()))
      .sort((a, b) => String(a.nom || a.login).localeCompare(String(b.nom || b.login), 'fr'))
  }, [comptes, employes])
  // Choisir une personne de la plateforme remplit le nom, rattache son compte et reprend son contact s'il est vide.
  const choisirPersonne = (u) => setModal((m) => ({
    ...m, data: { ...m.data, nom: u.nom || u.login, userId: u.id, userLogin: u.login, contact: m.data.contact || u.email || u.telephone || '' }
  }))
  const [modal, setModal] = useState(null)
  const [enregistrement, setEnregistrement] = useState(false)
  const peutSupprimer = usePeutSupprimerRh() // le bouton Supprimer est réservé à l'administration
  const [filtreLoc, setFiltreLoc] = useState('') // '' (toutes), 'Lomé', 'Kara' ou 'autre'
  const [texteLoc, setTexteLoc] = useState('') // saisie du filtre « Autre » : une localité autre que Lomé et Kara
  // Détail d'un employé (au clic sur sa ligne) : fiche, localité, ancienneté, contrat en cours et compte rattaché.
  const employeDetail = employes.find((e) => e.id === detailId)
  const ficheEmploye = (e) => {
    const contrat = contrats.filter((c) => c.employeId === e.id && c.statut !== 'resilie').sort((a, b) => ((a.dateDebut || '') < (b.dateDebut || '') ? 1 : -1))[0]
    const mois = e.dateEmbauche ? Math.max(0, Math.floor((Date.now() - new Date(e.dateEmbauche).getTime()) / (30.44 * 864e5))) : null
    const anciennete = mois === null ? '' : mois >= 12 ? `${Math.floor(mois / 12)} an(s)${mois % 12 ? ` et ${mois % 12} mois` : ''}` : `${mois} mois`
    return {
      titre: e.nom, sous: [e.poste, e.departement].filter(Boolean).join(' · ') || 'Employé',
      tuiles: [
        { icone: Briefcase, label: 'Poste', valeur: e.poste },
        { icone: Building2, label: 'Département', valeur: e.departement },
        { icone: MapPin, label: 'Localité', valeur: e.localite },
        { icone: Cake, label: 'Naissance', valeur: e.dateNaissance ? `${formatDateShort(e.dateNaissance)} (${Math.floor((Date.now() - new Date(e.dateNaissance).getTime()) / (365.25 * 864e5))} ans)` : '' },
        { icone: CalendarDays, label: "Arrivée", valeur: e.dateEmbauche ? `${formatDateShort(e.dateEmbauche)}${anciennete ? ` (${anciennete})` : ''}` : '' },
        { icone: Banknote, label: 'Salaire', valeur: Number(e.salaire) > 0 ? formatMoney(e.salaire) : '' },
        { icone: Phone, label: 'Contact', valeur: e.contact },
        { icone: FileText, label: 'Contrat en cours', valeur: contrat ? `${TYPES_CONTRAT[contrat.type]?.label || contrat.type}${contrat.dateFin ? ` jusqu'au ${formatDateShort(contrat.dateFin)}` : ' (sans date de fin)'}` : 'Aucun contrat enregistré' },
        { icone: Link2, label: 'Compte plateforme', valeur: e.userLogin || '' },
        { icone: TrendingUp, label: 'Compétences à développer', large: true, valeur: competencesEmp.filter((c) => c.employeId === e.id && (ecartCompetence(c) ?? 0) > 0).map((c) => `${c.competence} (${c.niveau} → ${c.cible})`).join(' · ') },
        { icone: Package, label: 'Matériel remis', large: true, valeur: dotations.filter((d) => d.employeId === e.id && (d.statut === 'en_possession' || !d.statut)).map((d) => `${d.article}${Number(d.quantite) > 1 ? ` x${d.quantite}` : ''}${d.detail ? ` (${d.detail})` : ''}`).join(' · ') },
        { icone: BookOpen, label: 'Formations', large: true, valeur: formations.filter((f) => (f.participants || []).includes(e.id) || (f.participants || []).includes('*')).map((f) => f.titre).join(' · ') }
      ]
    }
  }

  // Localités proposées : Lomé et Kara, plus celles déjà saisies sur d'autres fiches.
  const localitesOptions = useMemo(() => [...LOCALITES_BASE, ...new Set(employes.map((e) => String(e.localite || '').trim()).filter((l) => l && !LOCALITES_BASE.includes(l)))], [employes])
  const localitesUtilisees = useMemo(() => [...new Set(employes.map((e) => String(e.localite || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [employes])
  // Filtre par localité : Lomé et Kara en boutons fixes ; « Autre » pour les localités qui ne sont pas dans les boutons (saisie libre ou choix).
  // Couleur et icône du secteur de l'employé : celles de son département (vert pour Agro, rouge pour Logistique…).
  const visuelEmploye = (e) => {
    const nom = String(e.departement || '').trim().toLowerCase()
    const doc = departementsDocs.find((d) => String(d.nom || '').trim().toLowerCase() === nom)
    return visuelDepartement(doc || { nom: e.departement })
  }
  const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const estBase = (e) => LOCALITES_BASE.some((l) => sansAccent(l) === sansAccent(e.localite))
  const autresLocalites = localitesUtilisees.filter((l) => !LOCALITES_BASE.some((b) => sansAccent(b) === sansAccent(l)))
  const nbParLoc = (l) => employes.filter((e) => sansAccent(e.localite) === sansAccent(l)).length
  const employesAffiches = !filtreLoc ? employes
    : filtreLoc === 'autre' ? employes.filter((e) => !estBase(e) && (!texteLoc.trim() || sansAccent(e.localite).includes(sansAccent(texteLoc))))
    : employes.filter((e) => sansAccent(e.localite) === sansAccent(filtreLoc))

  // Postes proposés : ceux du catalogue (le département choisi d'abord), puis des postes types selon la catégorie de ce département.
  const categorieDep = useMemo(() => {
    const dep = modal?.data?.departement
    if (!dep) return ''
    const doc = departementsDocs.find((d) => String(d.nom || '').trim().toLowerCase() === String(dep).trim().toLowerCase())
    return visuelDepartement(doc || { nom: dep }).categorie.id
  }, [modal?.data?.departement, departementsDocs])
  const postesPropose = useMemo(() => postesProposes(postes, modal?.data?.departement, categorieDep), [postes, modal?.data?.departement, categorieDep])

  // Choisir un poste du catalogue reprend son département, sans écraser ce qui est déjà renseigné.
  const choisirPoste = (v) => setModal((m) => {
    const p = postes.find((x) => x.intitule === v)
    const data = { ...m.data, poste: v }
    if (p && !data.departement && p.departement) data.departement = p.departement
    return { ...m, data }
  })
  const maj = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))
  async function save() {
    const e = modal.data
    if (!e.nom.trim()) return toast.error('Nom requis')
    // La date de naissance alimente les alertes d'anniversaire de la RH : elle est obligatoire. La date d'arrivée vient du contrat.
    if (!e.dateNaissance) return toast.error('Date de naissance requise')
    if (e.dateNaissance >= todayStr()) return toast.error('La date de naissance doit être dans le passé')
    const nom = (t) => String(t || '').trim().toLowerCase()
    const dep = String(e.departement || '').trim()
    const poste = String(e.poste || '').trim()
    const fiche = { ...e, departement: dep, poste, localite: String(e.localite || '').trim() }
    // Un département ou un poste saisi à la main (« + Autre ») rejoint tout seul le catalogue : plus besoin de passer par les autres volets.
    // Le poste créé ainsi reprend le département et le salaire de l'employé ; la classification reste à compléter si besoin.
    if (dep && !departements.some((d) => nom(d) === nom(dep))) await addItem(COL.departements, { nom: dep, responsable: '', description: '' })
    if (poste && !postes.some((p) => nom(p.intitule) === nom(poste))) {
      await addItem(COL.postes, { intitule: poste, departement: dep, classification: '', salaireBase: Number(e.salaire) || 0, missions: '' })
    }
    // Une erreur (droit refusé, réseau…) est affichée au lieu d'échouer sans rien dire ; la fenêtre reste ouverte pour réessayer.
    if (enregistrement) return
    setEnregistrement(true)
    try {
      const { id: _id, ...donnees } = fiche // l'identifiant est la clé du document : on ne le réécrit pas dans ses données
      if (modal.id) await updateItem('rh_employes', modal.id, donnees)
      else await addItem('rh_employes', donnees)
      toast.success(modal.id ? 'Fiche corrigée ✓' : 'Employé ajouté ✓'); setModal(null)
    } catch (err) {
      console.error('Enregistrement de la fiche employé impossible', err)
      toast.error(err?.message || "Enregistrement impossible : réessayez")
    } finally { setEnregistrement(false) }
  }
  // La fenêtre « Motif de la suppression » sert de confirmation. Une erreur est affichée ; annuler la fenêtre n'est pas une erreur.
  async function supprimer(e) {
    if (!e?.id) return toast.error('Cet employé est introuvable : rechargez la page.')
    try {
      // Une fiche dont l'identifiant ne correspond pas à sa clé en base ne se supprimait pas (rien ne se passait) : on la remet d'abord en ordre.
      await repairCustomIds('rh_employes').catch(() => {})
      await removeItem('rh_employes', e.id)
      toast.success(`${e.nom} supprimé(e)`)
    } catch (err) {
      if (err?.name === 'SuppressionAnnulee' || err?.code === 'SUPPRESSION_ANNULEE') return
      console.error('Suppression de la fiche employé impossible', err)
      toast.error(err?.message || 'Suppression impossible')
    }
  }

  return (
    <div className="space-y-4">
      <DetailFiche fiche={employeDetail ? ficheEmploye(employeDetail) : null} onClose={() => setDetailId(null)}
        actions={employeDetail ? [
          { label: 'Modifier', icone: Pencil, tone: 'primaire', onClick: () => { setModal({ data: { ...empty(), ...employeDetail }, id: employeDetail.id }); setDetailId(null) } },
          ...(peutSupprimer ? [{ label: 'Supprimer', icone: Trash2, tone: 'danger', onClick: () => { const e = employeDetail; setDetailId(null); supprimer(e) } }] : [])
        ] : []} />
      <PageHeader icon={IconeEmployes} sousModule="Collaborateurs & Contrats" titre="Employés & Annuaire" sousTitre="Fiches des employés, postes, départements et contacts."
        action={<BoutonBande anime icone={Plus} onClick={() => setModal({ data: empty(), id: null })}>Ajouter un employé</BoutonBande>} />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par localité">
          <button type="button" onClick={() => { setFiltreLoc(''); setTexteLoc('') }} data-actif={!filtreLoc} aria-pressed={!filtreLoc} className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ '--puce': '#0284c7' }}><UserRound size={13} aria-hidden="true" />Toutes ({employes.length})</button>
          {LOCALITES_BASE.map((l) => (
            <button key={l} type="button" onClick={() => { setFiltreLoc(filtreLoc === l ? '' : l); setTexteLoc('') }} data-actif={filtreLoc === l} aria-pressed={filtreLoc === l}
              className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ '--puce': couleurLocalite(l) }}><MapPin size={13} aria-hidden="true" />{l} ({nbParLoc(l)})</button>
          ))}
          <button type="button" onClick={() => { setFiltreLoc(filtreLoc === 'autre' ? '' : 'autre'); setTexteLoc('') }} data-actif={filtreLoc === 'autre'} aria-pressed={filtreLoc === 'autre'}
            className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ '--puce': COULEUR_AUTRE_LOCALITE }}><Plus size={13} aria-hidden="true" />Autre ({employes.filter((e) => !estBase(e) && String(e.localite || '').trim()).length})</button>
        </div>
        {filtreLoc === 'autre' && (
          <div className="ed-entree flex flex-wrap items-center gap-2">
            <input value={texteLoc} onChange={(e) => setTexteLoc(e.target.value)} autoFocus placeholder="Nom de la localité (laissez vide pour toutes les autres)" aria-label="Autre localité"
              className="input-base !w-auto min-w-[16rem] flex-1 rounded-full sm:max-w-sm" />
            {autresLocalites.map((l) => (
              <button key={l} type="button" onClick={() => setTexteLoc(texteLoc === l ? '' : l)} data-actif={sansAccent(texteLoc) === sansAccent(l)} aria-pressed={sansAccent(texteLoc) === sansAccent(l)}
                className="puce-verre rounded-full px-3 py-1 text-xs font-bold" style={{ '--puce': '#0284c7' }}>{l}</button>
            ))}
            {autresLocalites.length === 0 && <span className="text-xs text-gray-400">Aucune autre localité renseignée pour le moment.</span>}
          </div>
        )}
      </div>
      <Card className="p-0">
        <Table searchBy={['nom', 'prenom', 'matricule']} onRowClick={(r) => setDetailId(r.id)}
          columns={[
            { key: 'nom', label: <Tete icone={UserRound}>Nom</Tete>, render: (r) => {
              const v = visuelEmploye(r)
              return (
                <span className="inline-flex items-center gap-2.5 font-semibold">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${v.couleur}, color-mix(in srgb, ${v.couleur} 70%, #000))` }} aria-hidden="true">
                    {String(r.nom || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  {r.nom}
                </span>
              )
            } },
            { key: 'poste', label: <Tete icone={Briefcase}>Poste</Tete>, render: (r) => r.poste ? <span className="inline-flex items-center gap-1.5"><Briefcase size={14} className="shrink-0" style={{ color: visuelEmploye(r).couleur }} aria-hidden="true" />{r.poste}</span> : '—' },
            { key: 'departement', label: <Tete icone={Building2}>Département</Tete>, render: (r) => {
              const v = visuelEmploye(r)
              return r.departement ? <Pastille couleur={v.couleur} icone={v.Icone}>{r.departement}</Pastille> : '—'
            } },
            { key: 'localite', label: <Tete icone={MapPin}>Localité</Tete>, render: (r) => r.localite ? <Pastille couleur={couleurLocalite(r.localite)} icone={MapPin}>{r.localite}</Pastille> : '—' },
            { key: 'dateEmbauche', label: <Tete icone={CalendarDays}>Arrivée</Tete>, render: (r) => <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="shrink-0 text-gray-400" aria-hidden="true" />{formatDateShort(r.dateEmbauche)}</span> },
            { key: 'salaire', label: <Tete icone={Banknote}>Salaire</Tete>, align: 'right', render: (r) => <span className="inline-flex items-center gap-1.5 font-semibold"><Banknote size={14} className="shrink-0 text-emerald-600" aria-hidden="true" />{formatMoney(r.salaire)}</span> },
            { key: 'contact', label: <Tete icone={Phone}>Contact</Tete>, render: (r) => r.contact ? <span className="inline-flex items-center gap-1.5"><Phone size={14} className="shrink-0 text-gray-400" aria-hidden="true" />{r.contact}</span> : '—' },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} title="Corriger la fiche" aria-label="Corriger la fiche" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                {peutSupprimer && <button onClick={() => supprimer(r)} title="Supprimer la fiche" aria-label="Supprimer la fiche" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>}
              </div>
            ) }
          ]}
          rows={employesAffiches}
          empty="Aucun employé."
        />
      </Card>

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier un employé' : 'Nouvel employé'} titreHero={modal?.data?.nom?.trim() || undefined}
        icone={UserRound} intro="La fiche d'un collaborateur : poste, département, localité et contact. Le contrat, le salaire et la date d'arrivée se saisissent dans Contrats." onSave={save}>
        {modal && (<>
          <Champ label="Nom" icone={UserRound} required aide={modal.data.userId ? `Rattaché au compte « ${modal.data.userLogin || 'utilisateur'} ».` : (!modal.id && personnesPlateforme.length ? 'Commencez à écrire : les personnes déjà présentes sur la plateforme sont proposées.' : undefined)}>
            {modal.id
              ? <input value={modal.data.nom} onChange={(e) => maj('nom', e.target.value)} className="input-base" placeholder="Nom et prénom" autoFocus />
              : <ChampAutocomplete accent="sky" className="input-base" autoFocus value={modal.data.nom} onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, nom: v, ...(m.data.userId && v !== m.data.nom ? { userId: '', userLogin: '' } : {}) } }))}
                  suggestions={personnesPlateforme} getLabel={(u) => u.nom || u.login} getDetail={(u) => roleLabel(u.role)} onSelect={choisirPersonne} maxSuggestions={10}
                  placeholder="Nom et prénom" emptyLabel="Aucune personne correspondante : votre saisie sera utilisée." />}
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Champ label="Département" icone={Building2} iconeLabel>
                <ChoixBoutons options={choixDep.options} iconeOption={choixDep.iconeOption} value={modal.data.departement} onChange={(v) => maj('departement', v)}
                  placeholderAutre="Nom du département" vide="Aucun département créé : saisissez-en un ci-dessous ou créez-les dans l'onglet Départements." />
              </Champ>
            </div>
            <div className="sm:col-span-2">
              <Champ label="Localité d'intervention" icone={MapPin} iconeLabel aide="Où cette personne travaille : Lomé ou Kara, ou « Autre » pour écrire une autre localité. Touchez de nouveau la localité choisie pour la retirer.">
                <ChoixBoutons options={localitesOptions} value={modal.data.localite || ''} onChange={(v) => maj('localite', v)} placeholderAutre="Nom de la localité" />
              </Champ>
            </div>
            <div className="sm:col-span-2">
              <Champ label="Poste" icone={Briefcase} aide="Touchez le champ : des postes sont proposés. Un poste nouveau est ajouté à l'onglet Postes à l'enregistrement.">
                <ChampAutocomplete accent="sky" className="input-base" value={modal.data.poste} onChange={(v) => maj('poste', v)}
                  suggestions={postesPropose} getLabel={(x) => x.intitule} getDetail={(x) => (x.source === 'catalogue' ? (x.departement || 'Catalogue') : 'Suggestion')}
                  onSelect={(x) => choisirPoste(x.intitule)} maxSuggestions={12}
                  placeholder="Choisissez ou écrivez un poste" emptyLabel="Aucune proposition : votre saisie sera utilisée." />
              </Champ>
            </div>
            <Champ label="Date de naissance" icone={Cake} required>
              <input type="date" value={modal.data.dateNaissance || ''} max={todayStr()} onChange={(e) => maj('dateNaissance', e.target.value)} className="input-base" />
            </Champ>
          </div>
          <Champ label="Contact" icone={Phone}>
            <input value={modal.data.contact} onChange={(e) => maj('contact', e.target.value)} className="input-base" placeholder="Téléphone ou e-mail" />
          </Champ>
        </>)}
      </ModalRh>
    </div>
  )
}
