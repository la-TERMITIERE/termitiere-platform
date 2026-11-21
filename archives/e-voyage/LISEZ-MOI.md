# Module E-VOYAGE (archivé le 20/11/2026)

Retiré de l'application à la demande du responsable. Tout ce qu'il faut pour le recréer est conservé ici.
Ce dossier est hors de `src`, il n'est donc ni compilé ni chargé par l'application.

## Identité du module (ancienne entrée de `src/shared/modules.js`, tableau `MODULES`)

```js
{
  id: 'voyage',
  nom: 'E-VOYAGE',
  description: 'Voyages d\'achat à l\'étranger, fournisseurs & conversion FCFA',
  icon: Plane,          // lucide-react
  emoji: '✈️',
  color: '#4f46e5',
  path: '/voyage',
  statut: 'actif'
}
```

## Menu latéral (ancienne entrée de `MODULE_NAV`)

```js
voyage: [
  { label: 'Dashboard', to: '/voyage', icon: LayoutDashboard, end: true },
  { label: 'Voyages', to: '/voyage/voyages', icon: Plane },
  { label: 'Devises & taux', to: '/voyage/devises', icon: Coins }
]
```

Barre de navigation mobile (`MobileBottomNav.jsx`, `RACCOURCIS`) : `voyage: ['/voyage/voyages']`.

## Route (ancien bloc dans `src/App.jsx`)

```jsx
const VoyageModule = lazy(() => import('./modules/voyage/index.jsx'))
...
<Route path="voyage/*" element={
  <ModuleGuard moduleId="voyage">
    <Suspense fallback={<ModuleLoadingSpinner moduleId="voyage" />}>
      <VoyageModule />
    </Suspense>
  </ModuleGuard>
} />
```

## Rôles (`src/core/roles.js`)

- `MODULE_ROLES = { voyage: FULL_ACCESS_ROLES }` : réservé à l'accès total (super-admin, Info, Assistant PAU, PAU, GE, DF, Directeur, RH, Admin).
- `PREFIXE_MODULE` : `voyage: 'voyage'` (pour les droits par module, lecture/écriture, appliqués aux collections `voyage_*`).

## Données

Les collections de la base **n'ont pas été touchées** : `voyage_articles`, `voyage_depenses`, `voyage_voyages` (Firebase Realtime Database). Rien n'est supprimé côté base.
Elles figuraient aussi dans la liste de remise à zéro (`src/core/resetApplication.js`), retirée avec le module.

## Pour le recréer

1. Remettre `archives/e-voyage/code` dans `src/modules/voyage`.
2. Ajouter à nouveau l'entrée `MODULES`, le menu `MODULE_NAV`, le raccourci mobile, la route dans `App.jsx`, les deux lignes de `roles.js` et la liste de remise à zéro, selon les extraits ci-dessus.
3. Les comptes qui avaient `voyage` dans leurs modules le retrouveront (la liste des modules de chaque compte n'a pas été modifiée).

Contenu du code archivé : `index.jsx` (routes internes), `Dashboard.jsx`, `Voyages.jsx`, `VoyageDetail.jsx`, `Devises.jsx`, `data.js`, `logic.js`, `store/voyageStore.js`.
