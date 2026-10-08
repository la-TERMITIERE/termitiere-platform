# Liaison Termitière → FEZIRE (Fezire Connect)

Relevé du 8 octobre 2026 sur `https://demo.fezire.com` (organisation **LA TERMITIERE**).

## Principe

FEZIRE Connect **vient chercher** les données chez nous : il appelle l'adresse de la
plateforme (`https://latermitiere-app.netlify.app`) avec la clé que nous lui avons
fournie, puis traduit chaque champ grâce aux **correspondances** (mappings) définies
dans Connect. Nos réponses utilisent directement les noms de champs canoniques FEZIRE
ci-dessous : chaque règle de correspondance est donc une copie à l'identique.

| Élément | Où | Valeur |
|---|---|---|
| Connexion Connect | Connect › Connexions | « La Termitière Platform » (`676126b0-8cc0-49a3-92ab-19394e62a659`) |
| Accès technique | Connect › Accès à Fezire | « La Termitière Platform » (`7e4e5072-4df0-4f7b-987e-281207f3e506`) |
| Sens | — | Recevoir dans Fezire (la plateforme envoie, Fezire enregistre) |
| Clé que FEZIRE nous présente | Netlify | `FEZIRE_INBOUND_KEY` |
| Clé API d'organisation FEZIRE | Netlify | `FEZIRE_API_KEY` |

Quota de la formule : 2 accès techniques, 10 connexions.

## Format canonique FEZIRE (champs reçus)

`id` est l'identifiant **FEZIRE** : on ne l'envoie jamais. Notre identifiant va dans
`external_id`. Dates en ISO 8601, devise ISO 4217 (`XOF`), pays ISO 3166-1 alpha-2 (`TG`).

| Donnée | Code | Champs (* = obligatoire) |
|---|---|---|
| Catégories de produits | `CATEGORY` | external_id, name*, parent_id |
| Clients | `CUSTOMER` | external_id, firstname, lastname, company, email, phone (international), country (`TG`), city, address |
| Produits | `PRODUCT` | external_id, sku*, name*, description, price, currency (`XOF`), category_id, active |
| Entrepôts / emplacements | `WAREHOUSE` | external_id, name*, location, active |
| Niveaux de stock | `STOCK` | external_id, product_id, sku, warehouse_id, quantity*, reserved |
| Mouvements de stock | `STOCK_MOVEMENT` | external_id, product_id, warehouse_id, quantity* (négative = sortie), reason, moved_at |
| Commandes | `ORDER` | external_id, store_id, customer_id, reference, currency*, total*, tax_total, status*, ordered_at, lines |
| Lignes de commande | `ORDER_LINE` | external_id, order_id, product_id, sku, label, quantity*, unit_price*, total |
| Paiements | `PAYMENT` | external_id, order_id, amount*, currency*, method, status*, paid_at |
| Factures et écritures | `INVOICE` | external_id, order_id, customer_id, number, total*, currency*, status, issued_at, due_at |

Autres ressources disponibles mais non retenues pour l'instant : `REFUND`, `SHIPMENT`,
`EMPLOYEE`, `SUBSCRIPTION`, `EVENT` (événement générique : type*, occurred_at, payload).
