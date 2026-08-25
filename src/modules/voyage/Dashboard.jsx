// Dashboard VOYAGES & ACHATS — vue d'ensemble : voyages en cours, achats, économies.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plane, ShoppingCart, PiggyBank, Globe, ArrowRight } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useVoyageStore } from './store/voyageStore'
import { economieArticle } from './logic'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { STATUTS_VOYAGE } from './data'

export default function Dashboard() {
  const { data: voyages } = useCollection('voyage_voyages')
  const { data: articles } = useCollection('voyage_articles')
  const devises = useVoyageStore((s) => s.devises)
  const tauxDe = (code) => { const d = devises.find((x) => x.code === code); return d ? (parseFloat(d.tauxFCFA) || 0) : 0 }

  const stats = useMemo(() => {
    const enCours = voyages.filter((v) => (v.statut || 'en_cours') === 'en_cours').length
    let achatTotal = 0, nbAchats = 0, economie = 0
    articles.forEach((a) => {
      if (a.achat) { achatTotal += a.achat.total || 0; nbAchats++ }
      economie += economieArticle(a, tauxDe)
    })
    const parGamme = {}
    articles.filter((a) => a.achat).forEach((a) => { const g = a.gamme || 'Divers'; parGamme[g] = (parGamme[g] || 0) + (a.achat.total || 0) })
    const gammes = Object.entries(parGamme).map(([nom, total]) => ({ nom, total })).sort((a, b) => b.total - a.total)
    return { enCours, achatTotal, nbAchats, economie, gammes }
  }, [voyages, articles, devises])

  const recents = useMemo(() => [...voyages].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6), [voyages])
  const nbArticles = (vId) => articles.filter((a) => a.voyageId === vId).length

  const kpis = [
    { title: 'Voyages en cours', value: formatNumber(stats.enCours), icon: Plane, color: '#4f46e5' },
    { title: 'Achats réalisés', value: formatNumber(stats.nbAchats), icon: ShoppingCart, color: '#16a34a' },
    { title: 'Total acheté', value: formatMoney(stats.achatTotal), icon: Globe, color: '#0891b2' },
    { title: 'Économie (meilleur choix)', value: formatMoney(stats.economie), icon: PiggyBank, color: '#d97706' }
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-800 p-4 text-white shadow-lg">
        <Plane size={24} />
        <div>
          <h2 className="text-lg font-extrabold">Voyages &amp; Achats</h2>
          <p className="text-sm text-white/80">Missions d'achat à l'étranger · fournisseurs · conversion FCFA en temps réel</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link to="/voyage/devises"><Button variant="outline" size="sm" className="border-white/40 bg-white/10 text-white hover:bg-white/20">Devises &amp; taux</Button></Link>
          <Link to="/voyage/voyages"><Button size="sm" style={{ backgroundColor: '#ffffff', color: '#4f46e5' }}>Voir les voyages <ArrowRight size={15} /></Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.title} className="card p-4">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: k.color + '18', color: k.color }}><k.icon size={18} /></div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{k.title}</p>
            <p className="truncate text-xl font-extrabold text-gray-900" title={String(k.value)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Voyages récents" className="lg:col-span-2 p-0">
          <div className="divide-y divide-gray-100">
            {recents.map((v) => {
              const st = STATUTS_VOYAGE[v.statut] || STATUTS_VOYAGE.en_cours
              return (
                <Link key={v.id} to={`/voyage/voyages/${v.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-indigo-50/40">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-800">{v.voyageurNom} · {v.pays}</p>
                    <p className="text-xs text-gray-400">{v.dateDepart ? formatDateShort(v.dateDepart) : '—'} · {nbArticles(v.id)} article(s)</p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </Link>
              )
            })}
            {!recents.length && <p className="py-10 text-center text-sm text-gray-400">Aucun voyage pour l'instant.</p>}
          </div>
        </Card>

        <Card title="Achats par gamme">
          <div className="space-y-2">
            {stats.gammes.map((g) => {
              const max = Math.max(1, ...stats.gammes.map((x) => x.total))
              return (
                <div key={g.nom} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs font-medium text-gray-600">{g.nom}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(g.total / max) * 100}%` }} /></div>
                  <span className="w-24 shrink-0 text-right text-xs font-bold text-gray-600">{formatMoney(g.total)}</span>
                </div>
              )
            })}
            {!stats.gammes.length && <p className="py-8 text-center text-sm text-gray-400">Aucun achat encore.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
