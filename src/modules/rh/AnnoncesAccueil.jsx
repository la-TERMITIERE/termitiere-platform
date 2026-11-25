// Accueil : les annonces qui s'adressent à la personne connectée et qu'elle n'a pas encore lues. Les ouvrir les marque « lues » et les retire d'ici ;
// elles restent consultables dans RH, Vie de l'entreprise, Annonces pour qui a ce module. Visible par tous les comptes, sans accès au module RH.
import { useMemo, useState } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { updateItem } from '../../core/db'
import { toast } from '../../core/notifications'
import AlertesAccueil from '../../portal/AlertesAccueil'
import LectureAnnonce from './LectureAnnonce'
import { COL_ANNONCES, COL_LECTURES, categorieAnnonce, concerne, estActive, rappelee, peutPublierAnnonce, cleLecture } from './annoncesData'

// Lignes « annonce » pour le bandeau unique de l'accueil, et la fenêtre de lecture à poser dans la page.
export function useAnnoncesAccueil() {
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  const peutMarquer = peutPublierAnnonce(role)
  const { data: annonces } = useCollection(COL_ANNONCES)
  const { data: lectures } = useCollection(COL_LECTURES)
  const [ouverte, setOuverte] = useState(null)

  const aLire = useMemo(() => {
    if (!user?.uid) return []
    const lues = new Set(lectures.filter((l) => l.uid === user.uid).map((l) => cleLecture(l.annonceId, l.uid)))
    return annonces
      .filter((a) => estActive(a) && concerne(a, user) && a.parUid !== user.uid && (rappelee(a) || !lues.has(cleLecture(a.id, user.uid))))
      .sort((a, b) => (Number(!!b.epinglee) - Number(!!a.epinglee)) || ((b.createdAt || 0) - (a.createdAt || 0)))
  }, [annonces, lectures, user])

  const items = aLire.map((a) => {
        const cat = categorieAnnonce(a)
        return {
          id: `annonce_${a.id}`, categorie: 'annonce', icone: cat.icone, couleur: cat.couleur,
          titre: `${cat.label} : ${a.titre}`,
          sous: `${a.texte.length > 90 ? `${a.texte.slice(0, 90)}…` : a.texte} · par ${a.parNom || 'la RH'}`,
          action: { label: 'Lire', onClick: () => setOuverte(a) },
          // La RH marque l'annonce « effectuée » : elle n'est plus rappelée à personne.
          fait: peutMarquer && rappelee(a) ? { label: 'Effectué', onClick: () => updateItem(COL_ANNONCES, a.id, { effectueLe: Date.now(), effectuePar: user?.nom || 'La RH' }).then(() => toast.success('Annonce marquée effectuée : plus de rappel')).catch((e) => toast.error(e?.message || 'Action impossible')) } : undefined
        }
      })
  const modal = ouverte ? <LectureAnnonce annonce={ouverte} onClose={() => setOuverte(null)} /> : null
  return { items, modal }
}

// Bloc autonome (bandeau « Annonces ») pour les écrans qui n'ont pas le bandeau unique de l'accueil.
export default function AnnoncesAccueil() {
  const { items, modal } = useAnnoncesAccueil()
  if (!items.length && !modal) return null
  return (<><AlertesAccueil titre="Annonces" items={items} />{modal}</>)
}
