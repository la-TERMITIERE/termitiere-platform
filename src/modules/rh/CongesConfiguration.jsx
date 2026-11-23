// RH : Paramètres des congés. Les types de congé et leur nombre de jours par an (par employé) se règlent ici :
// nom, jours, couleur, actif ou non, et de nouveaux types peuvent être ajoutés. La page Congés, les soldes et le tableau de bord s'en servent.
// Enregistré dans rh_config (document « conges »).
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Save, Plus, Trash2, Plane, Hash, Palette, Power } from 'lucide-react'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { ParamsGrille, ParamsCarte, CHAMP_VERRE } from '../../shared/ui/ParamsVerre'
import { setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { PageHeader } from './rhui'
import { useTypesConge, TONS_CONGE } from './droitConges'

const BLEU = '#0284c7'
const nouvelId = () => `perso_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export default function CongesConfiguration() {
  const enregistres = useTypesConge()
  const [lignes, setLignes] = useState(null) // [{ id, label, droit, tone, actif, perso }] : copie de travail
  const [sale, setSale] = useState(false)    // modifications non enregistrées
  const [enCours, setEnCours] = useState(false)

  // Reprend les types enregistrés tant qu'on n'a rien modifié (et une première fois au chargement).
  useEffect(() => {
    if (lignes && sale) return
    setLignes(Object.entries(enregistres).map(([id, v]) => ({ id, ...v, droit: String(v.droit) })))
  }, [enregistres]) // eslint-disable-line react-hooks/exhaustive-deps

  const maj = (id, patch) => { setSale(true); setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))) }
  const ajouter = () => { setSale(true); setLignes((ls) => [...ls, { id: nouvelId(), label: '', droit: '0', tone: 'neutral', actif: true, perso: true }]) }
  const retirer = (id) => { setSale(true); setLignes((ls) => ls.filter((l) => l.id !== id)) }

  const erreurs = useMemo(() => {
    const e = {}
    ;(lignes || []).forEach((l) => {
      const n = Number(l.droit)
      if (!String(l.label || '').trim()) e[l.id] = 'Donnez un nom à ce type.'
      else if (!Number.isFinite(n) || n < 0 || n > 366) e[l.id] = 'Jours entre 0 et 366.'
    })
    return e
  }, [lignes])

  async function enregistrer() {
    if (Object.keys(erreurs).length) return toast.error(Object.values(erreurs)[0])
    setEnCours(true)
    try {
      const types = {}
      lignes.forEach((l) => {
        types[l.id] = { label: String(l.label).trim(), droit: Math.round(Number(l.droit)), tone: l.tone, ...(l.perso ? { perso: true } : {}), actif: l.id === 'annuel' ? true : l.actif }
      })
      // `droitAnnuel` reste écrit pour la compatibilité (soldes, ancien réglage).
      await setItem('rh_config', 'conges', { droitAnnuel: Math.max(1, Math.round(Number(lignes.find((l) => l.id === 'annuel')?.droit) || 25)), types })
      setSale(false)
      toast.success('Types de congé enregistrés ✓')
    } catch (err) { toast.error(err?.message || 'Enregistrement impossible : réessayez') }
    finally { setEnCours(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarDays} sousModule="Paramètres" titre="Congés" sousTitre="Types de congé et nombre de jours par an pour chaque employé." />
      <ParamsGrille>
        <ParamsCarte icone={Plane} couleur={BLEU} titre="Types de congé" sous="Nom, jours par an et par employé, couleur. 0 jour = sans limite (ex. congé sans solde)." large className="backdrop-saturate-150"
          droite={<Button onClick={enregistrer} loading={enCours} disabled={!sale} style={{ backgroundColor: BLEU }}><Save size={16} /> Enregistrer</Button>}>
          <div className="space-y-2.5">
            {(lignes || []).map((l) => (
              <div key={l.id}
                className={`relative overflow-hidden rounded-2xl border border-white/90 bg-gradient-to-br from-white/75 via-white/45 to-white/25 p-3 backdrop-blur-xl backdrop-saturate-150 shadow-[0_12px_26px_-18px_rgba(2,132,199,0.55),inset_0_1px_0_rgba(255,255,255,1),inset_0_-10px_16px_-12px_rgba(2,132,199,0.2)] ${l.actif ? '' : 'opacity-60'}`}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent" />
                <div className="relative grid items-end gap-3 sm:grid-cols-[1fr_7rem_9rem_auto]">
                  <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <span className="mb-1 flex items-center gap-1.5"><Plane size={13} className="text-sky-500" aria-hidden="true" />Nom du type</span>
                    <input value={l.label} onChange={(e) => maj(l.id, { label: e.target.value })} className={`${CHAMP_VERRE} w-full`} placeholder="Ex. Congé de formation" />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <span className="mb-1 flex items-center gap-1.5"><Hash size={13} className="text-sky-500" aria-hidden="true" />Jours par an</span>
                    <input type="number" min="0" max="366" value={l.droit} onChange={(e) => maj(l.id, { droit: e.target.value })} className={`${CHAMP_VERRE} w-full`} />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <span className="mb-1 flex items-center gap-1.5"><Palette size={13} className="text-sky-500" aria-hidden="true" />Couleur</span>
                    <select value={l.tone} onChange={(e) => maj(l.id, { tone: e.target.value })} className={`${CHAMP_VERRE} w-full`}>
                      {TONS_CONGE.map(([k, nom]) => <option key={k} value={k}>{nom}</option>)}
                    </select>
                  </label>
                  <div className="flex items-center gap-1.5 pb-1">
                    <Badge tone={l.tone}>{String(l.label || '').trim() || 'Aperçu'}</Badge>
                    {l.id !== 'annuel' && (
                      <button type="button" onClick={() => maj(l.id, { actif: !l.actif })} aria-pressed={l.actif} title={l.actif ? 'Désactiver : ce type n\'est plus proposé' : 'Réactiver ce type'}
                        className={`rounded-xl p-2 ${l.actif ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}><Power size={16} /></button>
                    )}
                    {l.perso && (
                      <button type="button" onClick={() => retirer(l.id)} title="Supprimer ce type" aria-label="Supprimer ce type" className="rounded-xl p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                    )}
                  </div>
                </div>
                {erreurs[l.id] && <p className="relative mt-1.5 text-xs font-medium text-red-600" role="alert">{erreurs[l.id]}</p>}
                {l.id === 'annuel' && <p className="relative mt-1.5 text-xs text-gray-400">Ce type sert aux soldes de congé de la page Congés et du tableau de bord : il reste toujours actif.</p>}
                {!l.actif && <p className="relative mt-1.5 text-xs text-gray-400">Désactivé : n'est plus proposé pour les nouvelles demandes. Les demandes déjà faites sont conservées.</p>}
              </div>
            ))}
            <Button variant="outline" onClick={ajouter}><Plus size={15} /> Ajouter un type de congé</Button>
            {sale && <p className="text-xs font-semibold text-amber-700">Modifications non enregistrées : cliquez sur Enregistrer.</p>}
          </div>
        </ParamsCarte>
      </ParamsGrille>
    </div>
  )
}
