// E-TACHES : archives. Les tâches terminées depuis plus d'un mois (ou archivées à la main) y sont rangées ; on peut toujours les consulter.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Search } from 'lucide-react'
import BandeauVolet from '../../shared/ui/BandeauVolet'
import EtatVide from '../../shared/ui/EtatVide'
import { todayStr } from '../../utils/formatters'
import { COULEUR, estArchivee, formatJour } from './data'
import { useTaches } from './hooks'
import { Pers, PastillePriorite } from './ui'
import { normaliser } from './outils'
import TacheDetail from './TacheDetail'

export default function Archives() {
  const { taches } = useTaches()
  const [params, setParams] = useSearchParams()
  const [recherche, setRecherche] = useState('')
  const jour = todayStr()
  const ouverte = params.get('t')

  const liste = useMemo(() => {
    const q = normaliser(recherche)
    return taches.filter((t) => estArchivee(t, jour))
      .filter((t) => !q || normaliser(`${t.titre} ${t.numero} ${t.destNom} ${t.parNom} ${t.categorie}`).includes(q))
      .sort((a, b) => (b.dateCloture || '') < (a.dateCloture || '') ? -1 : 1)
  }, [taches, recherche, jour])
  const tache = ouverte ? taches.find((t) => t.id === ouverte) : null

  return (
    <div className="space-y-4">
      <BandeauVolet couleur={COULEUR} icone={Archive} surtitre="E-TACHES" titre="Archives" sous="Les tâches terminées depuis plus d'un mois, ou archivées à la main."
        pied={
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-white sm:max-w-xs">
            <Search size={14} aria-hidden="true" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher" aria-label="Rechercher dans les archives" className="w-full bg-transparent text-xs font-semibold text-white outline-none placeholder:text-white/70" />
          </label>
        } />

      {liste.length ? (
        <ul className="divide-y divide-black/5 overflow-hidden rounded-3xl border border-white/60 bg-white/60 backdrop-blur-xl">
          {liste.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setParams({ t: t.id })} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/70">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-gray-800">{t.titre}</span>
                  <span className="block truncate text-xs text-gray-500">{t.numero}{t.categorie ? ` · ${t.categorie}` : ''} · clôturée le {formatJour(t.dateCloture) || '-'}</span>
                </span>
                <span className="hidden sm:block"><Pers nom={t.destNom} /></span>
                <PastillePriorite priorite={t.priorite} />
              </button>
            </li>
          ))}
        </ul>
      ) : <EtatVide icone={Archive} accent={COULEUR} texte={recherche ? 'Aucune archive ne correspond' : 'Aucune tâche archivée'} />}

      {tache && <TacheDetail tache={tache} onClose={() => setParams({})} onModifier={() => {}} />}
    </div>
  )
}
