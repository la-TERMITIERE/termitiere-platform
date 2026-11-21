// RH : paramètres des primes. Les TYPES de primes (transport, rendement, ancienneté, 13e mois…) : un nom, une valeur, une périodicité (chaque mois ou une seule fois)
// et un plafond facultatif. La valeur se saisit en pourcentage OU en montant : l'autre champ se calcule tout seul à partir d'un salaire de référence
// (par défaut la moyenne des salaires de l'équipe). Le champ saisi en dernier est celui qui fait foi : en pourcentage, la prime suit le salaire de chaque
// employé ; en montant, c'est la même somme pour tous. Les types servent ensuite à attribuer des primes dans Paie, Primes.
import { useMemo, useState } from 'react'
import { Gift, Sparkles, Plus, Pencil, Trash2, Percent, Banknote, Repeat, CalendarDays, Gauge, AlignLeft, Wallet, ArrowLeftRight } from 'lucide-react'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { BoutonBande } from '../../shared/ui/BandeauVolet'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh, ChoixSimple } from './rhui'
import { usePeutSupprimerRh, supprimerAvecRetour } from './suppression'
import { PERIODICITES_PRIME, TYPES_PRIME_COURANTS } from './primesCircuit'

const nombre = (v) => Number(v) || 0
const arrondi2 = (n) => Math.round(n * 100) / 100
const enMontant = (pct, ref) => Math.round((nombre(ref) * nombre(pct)) / 100)
const enPourcent = (montant, ref) => (nombre(ref) > 0 ? arrondi2((nombre(montant) / nombre(ref)) * 100) : 0)

export default function PrimesConfiguration() {
  const { data: types } = useCollection(COL.typesPrimes)
  const { data: employes } = useCollection(COL.employes)
  const [envoi, setEnvoi] = useState(false)
  const [modal, setModal] = useState(null)
  const [tente, setTente] = useState(false)

  // Salaire de référence proposé : la moyenne des salaires de base des employés actifs.
  const moyenne = useMemo(() => {
    const s = employes.filter((e) => (e.statut || 'actif') === 'actif' && nombre(e.salaire) > 0).map((e) => nombre(e.salaire))
    return s.length ? Math.round(s.reduce((t, v) => t + v, 0) / s.length) : 100000
  }, [employes])

  function ouvrir(t) {
    const ref = nombre(t?.salaireRef) || moyenne
    const source = t?.mode === 'fixe' ? 'fixe' : 'pourcent'
    const valeur = nombre(t?.valeur)
    setTente(false)
    setModal({
      id: t?.id || null, nom: t?.nom || '', periodicite: t?.periodicite || 'mensuelle', description: t?.description || '', plafondPct: nombre(t?.plafondPct) || '',
      ref, source, pct: source === 'pourcent' ? (valeur || '') : (valeur ? enPourcent(valeur, ref) : ''), montant: source === 'fixe' ? (valeur || '') : (valeur ? enMontant(valeur, ref) : '')
    })
  }
  // Les deux champs se suivent : on saisit l'un, l'autre se calcule (et celui qu'on a saisi devient la référence).
  const saisirPct = (v) => setModal((m) => ({ ...m, source: 'pourcent', pct: v, montant: v === '' ? '' : enMontant(v, m.ref) }))
  const saisirMontant = (v) => setModal((m) => ({ ...m, source: 'fixe', montant: v, pct: v === '' ? '' : enPourcent(v, m.ref) }))
  const changerRef = (v) => setModal((m) => ({ ...m, ref: v, ...(m.source === 'pourcent' ? { montant: m.pct === '' ? '' : enMontant(m.pct, v) } : { pct: m.montant === '' ? '' : enPourcent(m.montant, v) }) }))

  async function enregistrer() {
    setTente(true)
    const valeur = modal.source === 'pourcent' ? nombre(modal.pct) : nombre(modal.montant)
    if (!modal.nom.trim()) return toast.error('Donnez un nom à la prime')
    if (!(valeur > 0)) return toast.error('Indiquez un pourcentage ou un montant')
    const data = { nom: modal.nom.trim(), mode: modal.source, valeur, periodicite: modal.periodicite, plafondPct: nombre(modal.plafondPct), salaireRef: nombre(modal.ref), description: modal.description.trim() }
    try {
      if (modal.id) await updateItem(COL.typesPrimes, modal.id, data); else await addItem(COL.typesPrimes, data)
      toast.success(modal.id ? 'Type de prime corrigé ✓' : 'Type de prime enregistré ✓'); setModal(null)
    } catch (err) { toast.error(err?.message || 'Enregistrement impossible : réessayez') }
  }
  // Suppression réservée à l'administration ; la fenêtre « Motif » sert de confirmation. Les primes déjà attribuées ne changent pas.
  const peutSupprimer = usePeutSupprimerRh()
  const supprimer = (t) => supprimerAvecRetour(() => removeItem(COL.typesPrimes, t.id))
  async function ajouterCourants() {
    setEnvoi(true)
    try { for (const t of TYPES_PRIME_COURANTS) await addItem(COL.typesPrimes, { ...t, salaireRef: moyenne }); toast.success('Types de primes courants ajoutés ✓') } finally { setEnvoi(false) }
  }

  const ref = nombre(modal?.ref)
  const plafondMontant = enMontant(modal?.plafondPct, ref)

  return (
    <div className="space-y-5">
      <PageHeader icon={Gift} sousModule="Paramètres" titre="Types de primes" sousTitre="Les primes que l'entreprise peut attribuer : en pourcentage ou en montant, chaque mois ou une seule fois."
        action={<BoutonBande anime icone={Plus} onClick={() => ouvrir(null)}>Nouveau type</BoutonBande>} />

      {types.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/80 bg-white/65 px-4 py-3 backdrop-blur-xl">
          <p className="text-sm text-gray-600">Aucun type pour le moment. Ajoutez les types courants (transport, rendement, ancienneté, 13e mois, exceptionnelle), puis modifiez-les.</p>
          <Button onClick={ajouterCourants} loading={envoi} style={{ backgroundColor: '#be185d' }}><Sparkles size={15} /> Ajouter les types courants</Button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {types.map((t, i) => {
          const r = nombre(t.salaireRef) || moyenne
          const pourcent = t.mode === 'pourcent'
          return (
            <div key={t.id} className="ed-entree group relative overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br from-white/85 via-white/70 to-pink-50/60 p-4 shadow-[0_14px_30px_-20px_rgba(190,24,93,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent" />
              <div className="relative flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold text-gray-800">{t.nom}</p>
                  <Badge tone={t.periodicite === 'ponctuelle' ? 'info' : 'primary'}>{t.periodicite === 'ponctuelle' ? 'Une seule fois' : 'Chaque mois'}</Badge>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => ouvrir(t)} aria-label={`Modifier ${t.nom}`} className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"><Pencil size={15} /></button>
                  {peutSupprimer && <button type="button" onClick={() => supprimer(t)} aria-label={`Supprimer ${t.nom}`} className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="relative mt-3 grid grid-cols-2 gap-2 text-center">
                <div className={`rounded-2xl border px-2 py-2 ${pourcent ? 'border-pink-300 bg-pink-50/80' : 'border-white/80 bg-white/60'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Pourcentage</p>
                  <p className="text-base font-black tabular-nums text-gray-800">{pourcent ? nombre(t.valeur) : enPourcent(t.valeur, r)} %</p>
                </div>
                <div className={`rounded-2xl border px-2 py-2 ${!pourcent ? 'border-pink-300 bg-pink-50/80' : 'border-white/80 bg-white/60'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Montant</p>
                  <p className="text-base font-black tabular-nums text-gray-800">{pourcent ? enMontant(t.valeur, r) : nombre(t.valeur)} F</p>
                </div>
              </div>
              <p className="relative mt-2 text-[11px] text-gray-500">{pourcent ? `Calculé sur le salaire de chaque employé (ex. ${formatMoney(enMontant(t.valeur, r))} pour un salaire de ${formatMoney(r)}).` : `Même montant pour tous (soit ${enPourcent(t.valeur, r)} % d'un salaire de ${formatMoney(r)}).`}
                {nombre(t.plafondPct) > 0 ? ` Plafond : ${t.plafondPct} % du salaire.` : ''}</p>
              {t.description && <p className="relative mt-1 truncate text-xs italic text-gray-500">{t.description}</p>}
            </div>
          )
        })}
      </div>

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le type de prime' : 'Nouveau type de prime'} icone={Gift}
        titreHero={modal?.nom?.trim() || 'Type de prime'} intro="Saisissez le pourcentage ou le montant : l'autre se calcule tout seul." onSave={enregistrer}>
        {modal && (<>
          <Champ label="Nom de la prime" icone={Gift} required erreur={tente && !modal.nom.trim() ? 'Le nom est obligatoire.' : undefined}>
            <input value={modal.nom} onChange={(e) => setModal({ ...modal, nom: e.target.value })} className="input-base" placeholder="Ex. Prime de transport" autoFocus />
          </Champ>
          <Champ label="Périodicité" iconeLabel icone={Repeat}>
            <ChoixSimple value={modal.periodicite} onChange={(v) => setModal({ ...modal, periodicite: v })} options={PERIODICITES_PRIME} />
          </Champ>
          <Champ label="Salaire de référence (FCFA)" icone={Wallet} aide={`Sert au calcul automatique. Moyenne actuelle de l'équipe : ${formatMoney(moyenne)}.`}>
            <input type="number" min="0" value={modal.ref} onChange={(e) => changerRef(e.target.value)} className="input-base" placeholder="Ex. 100000" />
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Pourcentage du salaire (%)" icone={Percent} required erreur={tente && !(nombre(modal.pct) > 0) && !(nombre(modal.montant) > 0) ? 'Indiquez un pourcentage ou un montant.' : undefined}>
              <input type="number" min="0" step="0.5" value={modal.pct} onChange={(e) => saisirPct(e.target.value)} className="input-base" placeholder="Ex. 10" />
            </Champ>
            <Champ label="Montant (FCFA)" icone={Banknote}>
              <input type="number" min="0" value={modal.montant} onChange={(e) => saisirMontant(e.target.value)} className="input-base" placeholder="Ex. 15000" />
            </Champ>
          </div>
          <p className="flex items-start gap-2 rounded-2xl border border-pink-200/80 bg-pink-50/70 px-3.5 py-2.5 text-xs text-pink-900 backdrop-blur-md">
            <ArrowLeftRight size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{modal.source === 'pourcent'
              ? <>Prime en <strong>pourcentage</strong> : le montant suit le salaire de chaque employé ({formatMoney(enMontant(modal.pct, ref))} pour un salaire de {formatMoney(ref)}).</>
              : <>Prime en <strong>montant fixe</strong> : la même somme pour tous ({modal.pct || 0} % d'un salaire de {formatMoney(ref)}, à titre indicatif).</>}</span>
          </p>
          <Champ label="Plafond (% du salaire, vide = aucun)" icone={Gauge} aide={nombre(modal.plafondPct) > 0 ? `Soit ${formatMoney(plafondMontant)} pour un salaire de ${formatMoney(ref)}.` : undefined}>
            <input type="number" min="0" max="100" value={modal.plafondPct} onChange={(e) => setModal({ ...modal, plafondPct: e.target.value })} className="input-base sm:max-w-xs" placeholder="Ex. 30" />
          </Champ>
          <Champ label="Description" icone={AlignLeft} haut>
            <textarea rows={2} value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} className="input-base" placeholder="À quoi sert cette prime" />
          </Champ>
        </>)}
      </ModalRh>
    </div>
  )
}
