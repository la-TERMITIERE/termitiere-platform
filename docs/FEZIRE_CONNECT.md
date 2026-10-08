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

## Fiche de configuration pour l'éditeur FEZIRE (demandée le 8 octobre 2026)

**Adresse de base** — recette et production (même adresse pour l'instant) :
`https://latermitiere-app.netlify.app/`

**Sens** : toutes les données ci-dessous sont **entrantes** (La Termitière → FEZIRE), lecture par REST.
Périmètre actuel : **Maxi Agro**.

**Authentification** : en-tête `X-API-Key: <clé>` (la clé enregistrée à l'étape « Qui se connecte à qui ? »),
sans préfixe. `Authorization: Bearer <clé>` est aussi accepté.

**Adresses** (méthode + chemin relatif à l'adresse de base) :

| Donnée | Code | Méthode et chemin |
|---|---|---|
| Catégories de produits | CATEGORY | `GET api/fezire/v1/categories` |
| Produits | PRODUCT | `GET api/fezire/v1/products` |
| Entrepôts | WAREHOUSE | `GET api/fezire/v1/warehouses` |
| Niveaux de stock | STOCK | `GET api/fezire/v1/stocks` |
| Mouvements de stock | STOCK_MOVEMENT | `GET api/fezire/v1/stock-movements` |
| Clients | CUSTOMER | `GET api/fezire/v1/customers` |
| Commandes | ORDER | `GET api/fezire/v1/orders` |
| Factures | INVOICE | `GET api/fezire/v1/invoices` |
| Paiements | PAYMENT | `GET api/fezire/v1/payments` (vide pour l'instant) |

**Format de réponse** : la liste est dans **`data`** ; les métadonnées dans `meta`.
```json
{ "data": [ … ], "meta": { "ressource": "PRODUCT", "total": 68, "page": 1, "per_page": 100, "pages": 1 } }
```

**Pagination** : par page — `?page=<n>&per_page=<taille>` (défaut 100, maximum 500, première page = 1).
Fin de liste : `meta.page == meta.pages` (ou `data` vide).
**Filtre incrémental** (optionnel) : `?since=<date ISO 8601>` ne renvoie que les éléments datés après.

**Identifiant stable** : `external_id` sur chaque élément (préfixé, ex. `agro-art-brebis`) ; les champs de
liaison (`product_id`, `category_id`, `customer_id`, `order_id`, `warehouse_id`) portent ces mêmes `external_id`.

**Noms de champs** : déjà au format canonique FEZIRE (correspondances déjà créées dans Connect en copie 1:1).

**Limites de débit** : pas de limite stricte de notre côté ; merci de rester sous **5 requêtes/seconde**
(fonctions serverless Netlify, délai max ~10 s par appel).

**Réponses types (une page, données d'exemple)** :

`GET api/fezire/v1/categories`
```json
{"data":[{"external_id":"agro-cat-ovins","name":"Maxi Agro · OVINS","parent_id":null}],"meta":{"ressource":"CATEGORY","total":1,"page":1,"per_page":100,"pages":1}}
```
`GET api/fezire/v1/products`
```json
{"data":[{"external_id":"agro-art-brebis","sku":"AGRO-BREBIS","name":"Brebis","description":"Animal · OVINS","price":75000,"currency":"XOF","category_id":"agro-cat-ovins","active":true}],"meta":{"ressource":"PRODUCT","total":1,"page":1,"per_page":100,"pages":1}}
```
`GET api/fezire/v1/warehouses`
```json
{"data":[{"external_id":"agro-ferme","name":"Ferme Maxi Agro","location":"Maxi Agro","active":true}],"meta":{"ressource":"WAREHOUSE","total":1,"page":1,"per_page":100,"pages":1}}
```
`GET api/fezire/v1/stocks`
```json
{"data":[{"external_id":"agro-stock-brebis","product_id":"agro-art-brebis","sku":"AGRO-BREBIS","warehouse_id":"agro-ferme","quantity":38,"reserved":0,"updated_at":"2026-10-02T00:00:00.000Z"}],"meta":{"ressource":"STOCK","total":1,"page":1,"per_page":100,"pages":1}}
```
`GET api/fezire/v1/stock-movements`
```json
{"data":[{"external_id":"agro-mv-2026-10-01-brebis-s0","product_id":"agro-art-brebis","warehouse_id":"agro-ferme","quantity":-1,"reason":"Décès : maladie","moved_at":"2026-10-01T00:00:00.000Z"}],"meta":{"ressource":"STOCK_MOVEMENT","total":1,"page":1,"per_page":100,"pages":1}}
```
`GET api/fezire/v1/customers`
```json
{"data":[{"external_id":"agro-cli-client-exemple","firstname":null,"lastname":"Client Exemple","company":null,"email":null,"phone":"+22890000000","country":"TG","city":null,"address":null}],"meta":{"ressource":"CUSTOMER","total":1,"page":1,"per_page":100,"pages":1}}
```
`GET api/fezire/v1/orders`
```json
{"data":[{"external_id":"agro-cmd-f1","customer_id":"agro-cli-client-exemple","reference":"FAC-001","currency":"XOF","total":150000,"tax_total":0,"status":"completed","ordered_at":"2026-10-02T00:00:00.000Z","lines":[{"external_id":"agro-cmd-f1-l1","product_id":"agro-art-brebis","sku":"AGRO-BREBIS","label":"Brebis","quantity":2,"unit_price":75000,"total":150000}]}],"meta":{"ressource":"ORDER","total":1,"page":1,"per_page":100,"pages":1}}
```
`GET api/fezire/v1/invoices`
```json
{"data":[{"external_id":"agro-fac-f1","order_id":"agro-cmd-f1","customer_id":"agro-cli-client-exemple","number":"FAC-001","total":150000,"currency":"XOF","status":"issued","issued_at":"2026-10-02T00:00:00.000Z","due_at":null}],"meta":{"ressource":"INVOICE","total":1,"page":1,"per_page":100,"pages":1}}
```
`GET api/fezire/v1/payments`
```json
{"data":[],"meta":{"ressource":"PAYMENT","total":0,"page":1,"per_page":100,"pages":1}}
```

**Statuts utilisés** — commandes : `draft`, `pending`, `confirmed`, `completed`, `cancelled` ;
factures : `issued`. À ajuster si Connect impose d'autres valeurs canoniques.

**Déjà fait dans Connect** : connexion « La Termitière Platform » (`676126b0-8cc0-49a3-92ab-19394e62a659`,
fournisseur API REST, sens entrant), 9 correspondances validées, test d'accès réussi ; définition
`la-termitiere` v1 publiée (`pagination.chemin = "data"`, en-tête `X-API-Key`), pas encore rattachée à la connexion.
