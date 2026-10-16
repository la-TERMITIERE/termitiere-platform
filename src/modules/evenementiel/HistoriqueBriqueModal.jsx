// Historique complet d'une catégorie de brique : état du stock, chiffres clés, puis la chronologie
// de TOUT ce qui la concerne (productions, ventes, mouvements appatam / séchage / prêtes, casses).
import { inventairesCompletes } from './logic'
import { useMemo, useState } from 'react'
import { Factory, ShoppingCart, ArrowRightLeft, Hammer, Layers, Boxes, Sun, CheckCircle2, Package, Inbox } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Compteur from '../../shared/ui/Compteur'
import EtatVide from '../../shared/ui/EtatVide'
import { useCollection } from '../../hooks/useFirestore'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import { formatNumber, formatMoney, formatDateShort } from '../../utils/formatters'

const COULEUR = COULEUR_MODULE.evenementiel
const ETAT = { appatam: 'Appatam', sechage: 'Séchage', pret: 'Prêtes', caillasses: 'Caillasses' }
const TYPES = {
  production: { label: 'Production', icone: Factory, couleur: '#475569' },
  vente: { label: 'Vente', icone: ShoppingCart, couleur: '#16A34A' },
  mouvement: { label: 'Mouvement', icone: ArrowRightLeft, couleur: '#E8850F' },
  casse: { label: 'Casse', icone: Hammer, couleur: '#DC2626' }
}
const STATUTS_VENTE = { brouillon: 'Brouillon', en_attente: 'Autorisation requise', autorisee: 'Autorisée', chargee: 'Chargée / Partie', annulee: 'Annulée' }

export default function HistoriqueBriqueModal({ brique, onClose }) {
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: transferts } = useCollection('evenementiel_transferts')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const [filtre, setFiltre] = useState('tout')

  const evenements = useMemo(() => {
    if (!brique) return []
    const ev = []
    productions.forEach((p) => {
      const q = (p.lignes || []).filter((l) => l.briqueId === brique.id).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
      if (q > 0) ev.push({ type: 'production', date: p.date, titre: `Production ${p.num || ''}`.trim(), detail: [p.machine, p.duree ? `${p.duree} h` : null, p.agentNom].filter(Boolean).join(' · '), qte: q, signe: '+' })
    })
    ventes.forEach((v) => {
      const q = (v.lignes || []).filter((l) => l.briqueId === brique.id).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
      if (q > 0) ev.push({ type: 'vente', date: v.date, titre: `Vente ${v.num || ''} : ${v.clientNom || ''}`.trim(), detail: STATUTS_VENTE[v.statut] || v.statut, qte: q, signe: '-', montant: (v.lignes || []).filter((l) => l.briqueId === brique.id).reduce((s, l) => s + (l.montant || 0), 0), annulee: v.statut === 'annulee' })
    })
    transferts.filter((t) => t.briqueId === brique.id).forEach((t) => {
      const casse = t.to === 'caillasses'
      ev.push({ type: casse ? 'casse' : 'mouvement', date: t.date, titre: `${ETAT[t.from] || t.from} → ${ETAT[t.to] || t.to}`, detail: [t.motif, t.agentNom].filter(Boolean).join(' · '), qte: parseInt(t.qte) || 0, signe: casse ? '-' : '' })
    })
    return ev.sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1))
  }, [brique, productions, ventes, transferts])

  const dernier = useMemo(() => [...inventairesCompletes(inventaires)].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])
  const etat = (brique && dernier?.briques?.[brique.id]) || {}
  const total = (type) => evenements.filter((e) => e.type === type && !e.annulee).reduce((s, e) => s + e.qte, 0)
  const visibles = filtre === 'tout' ? evenements : evenements.filter((e) => (filtre === 'mouvement' ? ['mouvement', 'casse'].includes(e.type) : e.type === filtre))

  const kpis = [
    { icone: Factory, titre: 'Produites', couleur: '#475569', valeur: total('production') },
    { icone: ShoppingCart, titre: 'Vendues', couleur: '#16A34A', valeur: total('vente') },
    { icone: Hammer, titre: 'Cassées', couleur: '#DC2626', valeur: total('casse') },
    { icone: CheckCircle2, titre: 'Prêtes en stock', couleur: '#0EA5E9', valeur: etat.pret || 0 }
  ]
  const etats = [
    { id: 'appatam', icone: Package, couleur: '#0284C7' },
    { id: 'sechage', icone: Sun, couleur: '#B45309' },
    { id: 'pret', icone: CheckCircle2, couleur: '#15803D' },
    { id: 'caillasses', icone: Hammer, couleur: '#4B5563' }
  ]

  return (
    <Modal open={!!brique} onClose={onClose} size="xl" {...glassModalProps(COULEUR)}
      title={brique ? `Historique : ${brique.nom}` : ''}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      {brique && (
        <div className="space-y-4">
          <style>{`@keyframes hb-pose { 0% { opacity: 0; transform: translateY(-26px) rotate(-6deg); } 18%, 82% { opacity: 1; transform: none; } 100% { opacity: 0; } }`}</style>
          <div className="relative overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
            style={{ background: 'linear-gradient(135deg, #8a9bb3 0%, #475569 50%, #0f172a 130%)' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            <div className="relative flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 flex-col-reverse items-center justify-center gap-[3px]">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="block h-[13px] w-[44px] rounded-md"
                    style={{ background: 'linear-gradient(90deg, transparent 49%, rgba(0,0,0,0.2) 50%, transparent 52%), linear-gradient(180deg, #fb923c, #c2410c)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 8px -3px rgba(0,0,0,0.5)', marginLeft: i === 1 ? 10 : 0, animation: `hb-pose 4.2s ease-in-out ${i * 0.35}s infinite` }} />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Catégorie de brique</p>
                <p className="text-xl font-extrabold leading-tight">{brique.nom}</p>
                <p className="text-xs text-white/80">{evenements.length} événement(s) : productions, ventes, mouvements et casses</p>
              </div>
            </div>
            <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {etats.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white/15 px-2.5 py-1.5 backdrop-blur-md">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={icone3D(e.couleur)}><e.icone size={14} /></span>
                  <span className="leading-tight">
                    <span className="block text-[10px] font-bold uppercase text-white/70">{ETAT[e.id]}</span>
                    <span className="block text-sm font-extrabold">{formatNumber(etat[e.id] || 0)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.titre} className="tuile-verre flex items-center gap-3 !p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D(k.couleur)}><k.icone size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k.titre}</p>
                  <p className="text-lg font-extrabold leading-tight text-gray-800"><Compteur valeur={k.valeur} format={formatNumber} /></p>
                </div>
              </div>
            ))}
          </div>

          <div className="tuile-verre">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D(COULEUR)}><Layers size={14} /></span>
                Chronologie ({visibles.length})
              </p>
              <div className="flex flex-wrap gap-1 rounded-2xl border border-white/80 bg-white/60 p-1">
                {[['tout', 'Tout'], ['production', 'Productions'], ['vente', 'Ventes'], ['mouvement', 'Mouvements']].map(([id, l]) => (
                  <button key={id} type="button" onClick={() => setFiltre(id)}
                    className={`rounded-xl px-2.5 py-1 text-[11px] font-bold transition-colors ${filtre === id ? 'bg-slate-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white'}`}>{l}</button>
                ))}
              </div>
            </div>
            {visibles.length === 0 ? (
              <EtatVide icone={Inbox} texte="Aucun événement pour cette catégorie" accent={COULEUR} className="!py-6" />
            ) : (
              <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
                {visibles.map((e, i) => {
                  const t = TYPES[e.type]
                  return (
                    <div key={i} className={`flex items-center gap-3 rounded-2xl border border-white/80 bg-white/60 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ${e.annulee ? 'opacity-50' : ''}`}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(t.couleur)}><t.icone size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-800">{e.titre}</span>
                        <span className="block truncate text-[11px] text-gray-500">{formatDateShort(e.date)}{e.detail ? ` · ${e.detail}` : ''}</span>
                      </span>
                      <span className="flex flex-col items-end gap-0.5">
                        <strong className="whitespace-nowrap text-sm" style={{ color: t.couleur }}>{e.signe}{formatNumber(e.qte)}</strong>
                        {e.montant > 0 && <span className="whitespace-nowrap text-[11px] text-gray-500">{formatMoney(e.montant)}</span>}
                      </span>
                      <Badge tone="neutral" className="hidden sm:inline-flex">{t.label}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
