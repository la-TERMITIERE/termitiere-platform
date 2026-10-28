// COMPTABILITÉ : paramètres du module.
// Design « verre » : sections en verre dépoli avec icône 3D, tuiles teintées à la couleur de chaque secteur, champs arrondis.
//  - Objectifs mensuels de recettes par secteur (comparés aux recettes réelles dans Suivi journalier, volet Recettes) ;
//  - Banques et numéros de compte ;
//  - Référentiel, journaux, durées d'amortissement.
import { useEffect, useMemo, useState } from 'react'
import { Settings, Info, Plus, Trash2, Landmark, Pencil, Check, X, Target, Save, BookOpen, Coins, ListTree, Percent, NotebookTabs, Hourglass, Sparkles, Eraser } from 'lucide-react'
import Badge from '../../shared/ui/Badge'
import { PLAN_COMPTABLE_DEFAUT, JOURNAUX, TAUX_TVA, CATEGORIES_IMMO, COL } from './data'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { icone3D } from '../../utils/color'
import { formatMoney } from '../../utils/formatters'
import BandeauCompta from './BandeauCompta'
import { POLES_QUOTA, useQuotas, fixerObjectif, iconePole, couleurPole } from './quotas'

const BANQUES_COURANTES = ['SUNU Banque', 'NSIA Banque']
const ORANGE = '#ea580c'

// Champ arrondi, en verre.
const champ = 'rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-sm font-semibold text-gray-800 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md outline-none transition-shadow placeholder:font-normal placeholder:text-gray-400 focus:ring-2 focus:ring-orange-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-100'

// Section en verre dépoli : titre avec icône 3D, sous-titre, contenu.
function Verre({ icone: Icone, couleur = ORANGE, titre, sous, droite, children, index = 0 }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/55 p-4 shadow-[0_14px_34px_-18px_rgba(26,26,26,0.35),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/5"
      style={{ animation: `pr-entree 0.45s ease-out ${index * 0.07}s both` }}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-3xl" style={{ background: couleur }} />
      <div className="relative mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={icone3D(couleur)}><Icone size={19} /></span>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold leading-tight text-gray-800 dark:text-gray-100">{titre}</h2>
            {sous && <p className="text-xs text-gray-500">{sous}</p>}
          </div>
        </div>
        {droite}
      </div>
      <div className="relative">{children}</div>
    </section>
  )
}

// Montant saisi en chiffres, affiché avec des espaces (« 1 500 000 »).
const chiffres = (v) => String(v ?? '').replace(/\D/g, '')
const espace = (v) => (chiffres(v) ? Number(chiffres(v)).toLocaleString('fr-FR') : '')

// Objectifs mensuels de recettes : un par secteur. Vide ou zéro = pas d'objectif pour ce secteur.
function Quotas() {
  const user = useAuth((s) => s.user)
  const { quotas, charge, doc } = useQuotas()
  const [brouillon, setBrouillon] = useState({})
  const [enregistrement, setEnregistrement] = useState(false)
  // Le brouillon repart des objectifs enregistrés à chaque nouvelle version (arrivée des données, enregistrement).
  useEffect(() => { setBrouillon(Object.fromEntries(Object.entries(quotas).map(([id, v]) => [id, String(v)]))) }, [doc?.updatedAt, charge]) // eslint-disable-line react-hooks/exhaustive-deps
  const propose = useMemo(() => Object.fromEntries(POLES_QUOTA.map((p) => [p.id, Number(chiffres(brouillon[p.id])) || 0]).filter(([, v]) => v > 0)), [brouillon])
  const modifie = JSON.stringify(Object.entries(propose).sort()) !== JSON.stringify(Object.entries(quotas).sort())
  const total = Object.values(propose).reduce((s, v) => s + v, 0)
  const nb = Object.keys(propose).length

  async function enregistrer() {
    setEnregistrement(true)
    try {
      // Un seul document par secteur : on n'écrit que ceux qui ont changé.
      for (const p of POLES_QUOTA) {
        if ((propose[p.id] || 0) !== (quotas[p.id] || 0)) await fixerObjectif(p.id, propose[p.id] || 0, user)
      }
      await audit('comptabilite', 'QUOTAS', `Objectifs mensuels de recettes : ${nb} secteur(s), total ${total.toLocaleString('fr-FR')} FCFA`)
      toast.success('Objectifs enregistrés ✓')
    } catch (e) { toast.error(e.message) } finally { setEnregistrement(false) }
  }

  return (
    <Verre index={0} icone={Target} couleur={ORANGE} titre="Objectifs de recettes par secteur"
      sous="Le montant de recettes que chaque secteur doit atteindre chaque mois. Chaque secteur peut aussi le fixer dans ses propres Paramètres : c'est le même objectif. Le Suivi journalier et le tableau de bord de chaque module affichent le pourcentage d'avancement."
      droite={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-extrabold text-gray-700 shadow-sm">
          <Sparkles size={13} className="text-orange-500" /> {nb} objectif{nb > 1 ? 's' : ''} · {formatMoney(total)} / mois
        </span>
      }>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {POLES_QUOTA.map((p) => {
          const couleur = couleurPole(p.id)
          const Ic = iconePole(p.id)
          const valeur = brouillon[p.id] ?? ''
          const actif = (Number(chiffres(valeur)) || 0) > 0
          return (
            <div key={p.id} className="rounded-2xl border border-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ background: `linear-gradient(135deg, ${couleur}${actif ? '2e' : '14'} 0%, rgba(255,255,255,0.65) 65%)` }}>
              <div className="mb-2 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Ic size={17} /></span>
                <span className="min-w-0 flex-1 text-xs font-extrabold uppercase leading-tight" style={{ color: couleur }}>{p.label}</span>
                {actif && (
                  <button type="button" onClick={() => setBrouillon((b) => ({ ...b, [p.id]: '' }))} title="Retirer l'objectif de ce secteur" aria-label={`Retirer l'objectif de ${p.label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-red-500"><Eraser size={14} /></button>
                )}
              </div>
              <div className="relative">
                <input inputMode="numeric" value={espace(valeur)} onChange={(e) => setBrouillon((b) => ({ ...b, [p.id]: chiffres(e.target.value) }))}
                  placeholder="Aucun objectif" aria-label={`Objectif mensuel de ${p.label}`} className={`w-full pr-24 text-right ${champ}`} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">FCFA / mois</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">Pour une année entière, l'objectif compte douze mois. Laissez vide un secteur sans objectif.</p>
        <button type="button" onClick={enregistrer} disabled={!modifie || enregistrement}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_20px_-10px_rgba(234,88,12,0.8)] transition-all enabled:hover:-translate-y-0.5 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#ea580c)' }}>
          <Save size={16} /> {enregistrement ? 'Enregistrement…' : 'Enregistrer les objectifs'}
        </button>
      </div>
    </Verre>
  )
}

// Banques de l'entreprise : proposées à chaque dépôt ou retrait (Comptabilité, Mouvements bancaires).
// Chaque banque est un COMPTE BANCAIRE : elle porte son numéro de compte (obligatoire à l'ajout). Les banques créées
// avant cette règle n'en ont pas encore : elles sont signalées et se complètent avec le crayon.
function Banques() {
  const { data: banques } = useCollection(COL.banques)
  const [nom, setNom] = useState('')
  const [numero, setNumero] = useState('')
  const [edition, setEdition] = useState(null) // { id, nom, numero }
  const norm = (v) => String(v || '').trim().toLowerCase()
  const existe = (n, num, sauf) => banques.some((b) => b.id !== sauf && norm(b.nom) === norm(n) && norm(b.numero) === norm(num))

  async function ajouter() {
    const v = nom.trim()
    const num = numero.trim()
    if (!v) return toast.error('Nom de la banque requis')
    if (!num) return toast.error('Numéro de compte requis')
    if (existe(v, num)) return toast.error('Ce compte existe déjà')
    await addItem(COL.banques, { nom: v, numero: num })
    toast.success(`${v} : compte ${num} ajouté ✓`)
    setNom(''); setNumero('')
  }
  async function enregistrerEdition() {
    const v = edition.nom.trim()
    const num = edition.numero.trim()
    if (!v || !num) return toast.error('Nom et numéro de compte requis')
    if (existe(v, num, edition.id)) return toast.error('Ce compte existe déjà')
    await updateItem(COL.banques, edition.id, { nom: v, numero: num })
    toast.success('Compte mis à jour ✓')
    setEdition(null)
  }
  async function supprimer(b) {
    if (!confirm(`Supprimer le compte « ${b.nom}${b.numero ? ` : ${b.numero}` : ''} » ? Les mouvements déjà enregistrés gardent son nom.`)) return
    await removeItem(COL.banques, b.id)
  }
  const proposees = BANQUES_COURANTES.filter((n) => !banques.some((b) => norm(b.nom) === norm(n)))
  const sansNumero = banques.filter((b) => !(b.numero || '').trim()).length

  return (
    <Verre index={1} icone={Landmark} couleur="#2563eb" titre="Banques et numéros de compte"
      sous="Les comptes bancaires de l'entreprise. Chaque dépôt ou retrait enregistré dans « Mouvements bancaires » précise dans lequel il a été fait.">
      {sansNumero > 0 && (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800">
          {sansNumero} compte{sansNumero > 1 ? 's' : ''} sans numéro : cliquez sur le crayon pour le renseigner.
        </p>
      )}
      <div className="mb-3 space-y-2">
        {banques.length === 0 && <p className="rounded-2xl border border-dashed border-gray-300 py-4 text-center text-sm text-gray-400">Aucune banque enregistrée.</p>}
        {[...banques].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map((b) => (
          edition?.id === b.id ? (
            <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50/70 p-2 backdrop-blur-md">
              <input value={edition.nom} onChange={(e) => setEdition((x) => ({ ...x, nom: e.target.value }))} aria-label="Nom de la banque" className={`min-w-[160px] flex-1 ${champ}`} />
              <input value={edition.numero} onChange={(e) => setEdition((x) => ({ ...x, numero: e.target.value }))} aria-label="Numéro de compte" placeholder="Numéro de compte" autoFocus className={`min-w-[180px] flex-1 font-mono ${champ}`} />
              <button type="button" onClick={enregistrerEdition} title="Enregistrer" className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-transform hover:-translate-y-0.5" style={icone3D('#0d9488')}><Check size={16} /></button>
              <button type="button" onClick={() => setEdition(null)} title="Annuler" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white/80 text-gray-500 transition-transform hover:-translate-y-0.5"><X size={16} /></button>
            </div>
          ) : (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/80 bg-white/65 px-3 py-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/85">
              <span className="flex min-w-0 items-center gap-2.5 font-bold text-gray-700 dark:text-gray-200">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#2563eb')}><Landmark size={15} /></span>
                {b.nom}
                {(b.numero || '').trim()
                  ? <span className="rounded-full bg-teal-50 px-2.5 py-0.5 font-mono text-xs font-bold text-teal-700 ring-1 ring-inset ring-teal-200">N° {b.numero}</span>
                  : <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">N° à renseigner</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setEdition({ id: b.id, nom: b.nom || '', numero: b.numero || '' })} title="Modifier / renseigner le numéro" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-orange-50 hover:text-orange-600"><Pencil size={15} /></button>
                <button type="button" onClick={() => supprimer(b)} title="Supprimer" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </span>
            </div>
          )
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ajouter() }} className="flex flex-wrap items-center gap-2">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la banque, ex : SUNU Banque" aria-label="Nom de la banque" className={`min-w-[200px] flex-1 ${champ}`} />
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Numéro de compte *" aria-label="Numéro de compte" className={`min-w-[200px] flex-1 font-mono ${champ}`} />
        <button type="submit" disabled={!nom.trim() || !numero.trim()} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(234,88,12,0.8)] transition-all enabled:hover:-translate-y-0.5 disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#f59e0b,#ea580c)' }}><Plus size={15} /> Ajouter le compte</button>
      </form>
      {proposees.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          Nom rapide :
          {proposees.map((n) => (
            <button key={n} type="button" onClick={() => setNom(n)} className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-bold text-orange-700 transition-colors hover:bg-orange-100">{n}</button>
          ))}
        </div>
      )}
    </Verre>
  )
}

export default function Params() {
  return (
    <div className="space-y-5">
      <style>{`@keyframes pr-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>
      <BandeauCompta icone={Settings} titre="Paramètres comptables" sous="Objectifs, banques et conventions du module" />

      <Quotas />
      <Banques />

      <Verre index={2} icone={BookOpen} couleur="#7c3aed" titre="Référentiel" sous="Les conventions comptables appliquées par le module.">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Tuile icone={BookOpen} couleur="#7c3aed" label="Norme comptable" value="SYSCOHADA révisé (OHADA)" />
          <Tuile icone={Coins} couleur="#16a34a" label="Devise" value="Franc CFA : XOF (BCEAO)" />
          <Tuile icone={ListTree} couleur="#0284c7" label="Comptes au plan par défaut" value={`${PLAN_COMPTABLE_DEFAUT.length} comptes`} />
          <Tuile icone={Percent} couleur="#ea580c" label="Taux de TVA" value={TAUX_TVA.map((t) => t.label).join(' · ')} />
        </div>
      </Verre>

      <Verre index={3} icone={NotebookTabs} couleur="#0d9488" titre="Journaux disponibles" sous="Les journaux dans lesquels les écritures sont classées.">
        <div className="flex flex-wrap gap-2">
          {JOURNAUX.map((j) => <Badge key={j.code} tone={j.tone}>{j.code} : {j.label}</Badge>)}
        </div>
      </Verre>

      <Verre index={4} icone={Hourglass} couleur="#db2777" titre="Durées d'amortissement par défaut" sous="Appliquées à la création d'une immobilisation, selon sa catégorie.">
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES_IMMO.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-2xl border border-white/80 bg-white/65 px-3 py-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
              <span className="min-w-0 font-semibold text-gray-700">{c.label} <span className="font-mono text-xs text-gray-400">({c.compte})</span></span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${c.amortissable ? 'bg-pink-50 text-pink-700 ring-1 ring-inset ring-pink-200' : 'bg-gray-100 text-gray-500'}`}>{c.amortissable ? `${c.dureeAmort} ans` : 'non amortissable'}</span>
            </div>
          ))}
        </div>
      </Verre>

      <div className="flex gap-3 rounded-3xl border border-sky-200/70 bg-sky-50/60 p-4 text-sm text-gray-600 backdrop-blur-xl">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D('#0ea5e9')}><Info size={17} /></span>
        <div className="space-y-1">
          <p className="font-extrabold text-gray-800">Prochaine étape : passerelles automatiques</p>
          <p>Les achats/dépenses saisis dans les autres modules (MAXI-AGRO, LOGISTIQUE, BRIQUETERIE, E-DÉPENSES, E-VOYAGE…) seront convertis automatiquement en écritures comptables (journal Achats/Caisse/Banque) selon le plan comptable ci-dessus : sur le modèle des passerelles déjà en place dans E-DÉPENSES.</p>
        </div>
      </div>
    </div>
  )
}

// Tuile d'information du référentiel : icône 3D, libellé, valeur.
function Tuile({ icone: Icone, couleur, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: `linear-gradient(135deg, ${couleur}1f 0%, rgba(255,255,255,0.65) 65%)` }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={18} /></span>
      <div className="min-w-0">
        <div className="text-[10px] font-extrabold uppercase tracking-wide text-gray-400">{label}</div>
        <div className="font-bold text-gray-800 dark:text-gray-100">{value}</div>
      </div>
    </div>
  )
}
