// Cartes du Dashboard Logistique : matériel actuellement dehors, dernières prestations, meilleurs
// clients (podium à médailles) et chiffre d'affaires mois par mois.
import { Link } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import { Truck, ClipboardList, Trophy, TrendingUp, ChevronRight, PackageCheck, CalendarRange } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import AvatarNom from '../../shared/ui/AvatarNom'
import NumDoc from '../../shared/ui/NumDoc'
import EtatVide from '../../shared/ui/EtatVide'
import Compteur from '../../shared/ui/Compteur'
import { normaliserStatut } from '../../shared/workflow'
import { COULEUR_MODULE, icone3D } from '../../utils/color'
import { formatMoney, formatNumber, formatDateShort, todayStr } from '../../utils/formatters'

const ACCENT = COULEUR_MODULE.logistique

const RANG_PODIUM = [
  { medaille: '🥇', bg: 'bg-gradient-to-r from-amber-50 to-yellow-50', ring: 'ring-1 ring-amber-200' },
  { medaille: '🥈', bg: 'bg-gradient-to-r from-slate-100 to-gray-50', ring: 'ring-1 ring-slate-200' },
  { medaille: '🥉', bg: 'bg-gradient-to-r from-orange-50 to-amber-50', ring: 'ring-1 ring-orange-200' }
]

const STATUTS = {
  brouillon: ['Brouillon', 'neutral'], facturee: ['Facturée', 'info'], en_cours: ['En location', 'warning'],
  terminee: ['Terminée', 'success'], annulee: ['Annulée', 'danger']
}

const LIGNE = 'flex flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/65 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]'

const montantDe = (p) => p.totalTTC ?? p.total ?? 0

function Titre({ icone: Icone, titre, sous, couleur = ACCENT, action }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={17} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold leading-tight text-gray-800 dark:text-gray-100">{titre}</h3>
        {sous && <p className="text-[11px] text-gray-400">{sous}</p>}
      </div>
      {action}
    </div>
  )
}

const LienVoir = ({ to, children }) => (
  <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold hover:underline" style={{ color: ACCENT }}>{children} <ChevronRight size={13} /></Link>
)

// Matériel parti (autorisation certifiée) et pas encore entièrement rendu, retards en tête.
export function materielDehors(prestations, retours, demandes, aujourdhui = todayStr()) {
  const sorties = new Set(demandes.filter((d) => d.prestationId && normaliserStatut(d.statut) === 'certifie').map((d) => d.prestationId))
  const rendus = {}
  retours.forEach((r) => { if (r.prestationId) rendus[r.prestationId] = (rendus[r.prestationId] || 0) + (parseInt(r.qte) || 0) })
  return prestations
    .filter((p) => sorties.has(p.id) && p.statut !== 'annulee' && p.statut !== 'terminee')
    .map((p) => {
      const pris = (p.lignes || []).filter((l) => l.materielId).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
      const restant = pris - (rendus[p.id] || 0)
      const retard = p.dateFin && p.dateFin < aujourdhui ? Math.max(1, Math.round((new Date(aujourdhui) - new Date(p.dateFin)) / 86400000)) : 0
      return { p, pris, restant, retard }
    })
    .filter((x) => x.pris > 0 && x.restant > 0)
    .sort((a, b) => (b.retard - a.retard) || ((a.p.dateFin || '') < (b.p.dateFin || '') ? -1 : 1))
}

export function MaterielDehorsCard({ liste, site }) {
  const enRetard = liste.filter((x) => x.retard > 0).length
  const total = liste.reduce((s, x) => s + x.restant, 0)
  return (
    <Card>
      <Titre icone={Truck} titre="Matériel dehors" couleur={enRetard ? '#DC2626' : ACCENT}
        sous={liste.length ? `${formatNumber(total)} pièce(s) chez ${liste.length} client(s)${enRetard ? ` : ${enRetard} en retard` : ''}` : 'Ce qui est sorti et pas encore rendu'}
        action={<LienVoir to={`/logistique/${site}/retours`}>Retours</LienVoir>} />
      {liste.length === 0 ? (
        <EtatVide icone={PackageCheck} texte="Tout le matériel est rentré" accent="#16A34A" className="!py-6" />
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {liste.map(({ p, restant, retard }) => (
            <Link key={p.id} to={`/logistique/${site}/retours`} className={`${LIGNE} transition-all hover:-translate-y-0.5 hover:bg-white/90 ${retard ? '!border-red-200 !bg-red-50/70' : ''}`}>
              <AvatarNom nom={p.clientNom} size={30} accent={retard ? '#DC2626' : ACCENT} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-800">{p.clientNom}</span>
                <span className="flex items-center gap-1 text-[11px] text-gray-500"><CalendarRange size={11} /> retour prévu le {formatDateShort(p.dateFin)}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <strong className="whitespace-nowrap text-sm">{formatNumber(restant)} pièce(s)</strong>
                {retard ? <Badge tone="danger">{retard} j de retard</Badge> : <Badge tone="warning">En location</Badge>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}

export function DernieresPrestationsCard({ prestations, site, voitMontants }) {
  const liste = [...prestations].filter((p) => p.statut !== 'annulee')
    .sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : (a.date || '') > (b.date || '') ? -1 : (a.num < b.num ? 1 : -1))).slice(0, 5)
  return (
    <Card>
      <Titre icone={ClipboardList} titre="Dernières prestations" sous="Les 5 plus récentes" action={<LienVoir to={`/logistique/${site}/prestations`}>Toutes</LienVoir>} />
      {liste.length === 0 ? (
        <EtatVide icone={ClipboardList} texte="Aucune prestation pour le moment" accent={ACCENT} className="!py-6" />
      ) : (
        <div className="space-y-1.5">
          {liste.map((p) => {
            const [label, tone] = STATUTS[p.statut] || [p.statut, 'neutral']
            return (
              <Link key={p.id} to={`/logistique/${site}/prestations`} className={`${LIGNE} transition-all hover:-translate-y-0.5 hover:bg-white/90`}>
                <AvatarNom nom={p.clientNom} size={30} accent={ACCENT} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-800">{p.clientNom}</span>
                  <span className="block text-[11px] text-gray-400"><NumDoc num={p.num} className="!text-[11px]" /> · {formatDateShort(p.date)}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  {voitMontants && <strong className="whitespace-nowrap text-sm">{formatMoney(montantDe(p))}</strong>}
                  <Badge tone={tone}>{label}</Badge>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// Clients classés par montant loué (ou par nombre de prestations quand les montants sont masqués).
export function meilleursClients(prestations, voitMontants, max = 5) {
  const par = {}
  prestations.filter((p) => p.statut !== 'annulee' && p.clientNom).forEach((p) => {
    const c = par[p.clientNom] || (par[p.clientNom] = { nom: p.clientNom, prestations: 0, montant: 0 })
    c.prestations += 1
    c.montant += montantDe(p)
  })
  return Object.values(par).sort((a, b) => (voitMontants ? b.montant - a.montant : 0) || b.prestations - a.prestations).slice(0, max)
}

export function MeilleursClientsCard({ clients, voitMontants }) {
  return (
    <Card>
      <Titre icone={Trophy} couleur="#CA8A04" titre="Meilleurs clients" sous={voitMontants ? 'Classés par montant loué sur la période' : 'Classés par nombre de prestations sur la période'} />
      {clients.length === 0 ? (
        <EtatVide icone={Trophy} texte="Aucune prestation sur cette période" accent="#CA8A04" className="!py-6" />
      ) : (
        <div className="space-y-1.5">
          {clients.map((c, i) => {
            const podium = RANG_PODIUM[i]
            return (
              <div key={c.nom} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${podium ? `${podium.bg} ${podium.ring}` : 'border border-white/80 bg-white/65'}`}>
                <span className="w-8 shrink-0 text-center text-2xl leading-none">{podium ? podium.medaille : <span className="text-sm font-extrabold text-gray-400">{i + 1}</span>}</span>
                <AvatarNom nom={c.nom} size={28} accent={ACCENT} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-800">{c.nom}</span>
                  <span className="block text-[11px] text-gray-500">{c.prestations} prestation{c.prestations > 1 ? 's' : ''}</span>
                </span>
                {voitMontants && <strong className="whitespace-nowrap text-sm text-gray-900">{formatMoney(c.montant)}</strong>}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',')} M` : v >= 1e3 ? `${Math.round(v / 1e3)} k` : String(Math.round(v)))

// CA des 12 derniers mois (factures approuvées), du plus ancien au mois courant.
export function caParMois(factures, aujourdhui = todayStr()) {
  const an = Number(aujourdhui.slice(0, 4))
  const mois = Number(aujourdhui.slice(5, 7))
  const cases = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(an, mois - 1 - i, 1)
    cases.push({ cle: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MOIS_COURTS[d.getMonth()], montant: 0 })
  }
  factures.filter((f) => f.statut === 'approuvee').forEach((f) => {
    const c = cases.find((x) => x.cle === (f.date || '').slice(0, 7))
    if (c) c.montant += f.totalTTC || 0
  })
  return cases
}

export function CaMensuelCard({ mois }) {
  const total = mois.reduce((s, m) => s + m.montant, 0)
  const meilleur = mois.reduce((b, m) => (m.montant > b.montant ? m : b), mois[0])
  const courant = mois[mois.length - 1]
  const precedent = mois[mois.length - 2]
  const variation = precedent && precedent.montant > 0 ? Math.round(((courant.montant - precedent.montant) / precedent.montant) * 100) : null
  const data = {
    labels: mois.map((m) => m.label),
    datasets: [{
      data: mois.map((m) => m.montant),
      backgroundColor: (ctx) => {
        const { chartArea, ctx: c } = ctx.chart
        if (!chartArea) return '#BC3C31'
        const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
        const dernier = ctx.dataIndex === mois.length - 1
        g.addColorStop(0, dernier ? '#7f1d1d' : '#9a2f26')
        g.addColorStop(1, dernier ? '#f87171' : '#e8928a')
        return g
      },
      borderRadius: 8, borderSkipped: false, maxBarThickness: 26
    }]
  }
  const options = {
    maintainAspectRatio: false,
    layout: { padding: { top: 18 } },
    animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 10, displayColors: false, callbacks: { label: (c) => formatMoney(c.parsed.y) } }
    },
    scales: {
      y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(100,116,139,0.16)', borderDash: [4, 4] }, ticks: { maxTicksLimit: 5, callback: (v) => compact(v) } },
      x: { border: { display: false }, grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } }
    }
  }
  return (
    <Card>
      <Titre icone={TrendingUp} titre="Chiffre d'affaires par mois" sous="12 derniers mois : factures approuvées" />
      {total === 0 ? (
        <EtatVide icone={TrendingUp} texte="Aucune facture approuvée sur 12 mois" accent={ACCENT} className="!py-8" />
      ) : (
        <div className="h-48"><Bar data={data} options={options} /></div>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Puce label="Total 12 mois" valeur={<Compteur valeur={total} format={formatMoney} />} />
        <Puce label="Meilleur mois" valeur={meilleur.montant > 0 ? `${meilleur.label} : ${formatMoney(meilleur.montant)}` : ':'} />
        <Puce label="Ce mois-ci" valeur={formatMoney(courant.montant)}
          pied={variation === null ? null : <span className={variation >= 0 ? 'text-green-600' : 'text-red-600'}>{variation >= 0 ? '+' : ''}{variation} % vs mois précédent</span>} />
      </div>
    </Card>
  )
}

const Puce = ({ label, valeur, pied }) => (
  <div className="rounded-2xl border border-white/80 bg-white/65 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
    <span className="block text-[10px] font-bold uppercase text-gray-400">{label}</span>
    <span className="block truncate text-sm font-extrabold text-gray-800">{valeur}</span>
    {pied && <span className="block text-[10px] font-bold">{pied}</span>}
  </div>
)
