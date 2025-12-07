# Spécifications Fonctionnelles - Application BCE Exchange Rates

## 1. Vue d'ensemble

Application web Angular permettant de consulter les taux de change de la Banque Centrale Européenne (BCE) avec visualisation historique interactive.

**Utilisateur cible**: Utilisateurs nécessitant des taux de change EUR précis et officiels  
**Source de données**: API officielle ECB (https://data-api.ecb.europa.eu)

---

## 2. Architecture Technique

### 2.1 Stack
- **Frontend**: Angular 21.0.2 standalone components
- **UI Library**: Angular Material 21.0.2 (chips, autocomplete, icons)
- **Charts**: Chart.js 4.4.0
- **Backend**: Node.js 20 + Fastify
- **Déploiement**: Docker + Railway
- **Dev Environment**: Docker Compose avec hot-reload

### 2.2 Structure des données

#### ExchangeRate
```typescript
{
  currency: string;    // Code ISO devise (ex: "CHF", "USD")
  rate: number;        // Taux EUR → devise
  flag: string;        // Code pays pour drapeau (ex: "ch", "us")
}
```

#### HistoryPoint
```typescript
{
  currency: string;
  date: string;        // Format YYYY-MM-DD
  rate: number;
}
```

---

## 3. Fonctionnalités détaillées

### 3.1 Sélection des devises

**Composant**: Material Chip Grid avec Autocomplete

**Comportement**:
- Affichage des devises sélectionnées sous forme de chips Material
- Chaque chip affiche le code devise (ex: "CHF") avec un bouton supprimer (icône cancel)
- Input avec placeholder "Ajouter une devise..."
- Autocomplete filtrant la liste des devises disponibles
- Ajout possible par:
  - Sélection dans l'autocomplete
  - Saisie + touche Entrée ou Virgule
  - Validation automatique si devise valide

**Devises disponibles** (31 total):
```
USD, GBP, CHF, JPY, CAD, AUD, NZD, SEK, NOK, DKK,
PLN, CZK, HUF, RON, BGN, HRK, RUB, TRY, BRL, CNY,
HKD, IDR, ILS, INR, KRW, MXN, MYR, PHP, SGD, THB, ZAR
```

**Devises par défaut au chargement**: CHF, MXN

**Contraintes**:
- Au moins 1 devise doit être sélectionnée
- Pas de doublons
- Codes en majuscules uniquement
- Validation contre la liste des devises disponibles

### 3.2 Sélection de la date

**Composant**: Input HTML5 `type="date"`

**Comportement**:
- Date par défaut: vide (l'API retourne la date la plus récente disponible)
- Maximum: date du jour
- Format: YYYY-MM-DD
- Changement de date → appel API immédiat pour rafraîchir les taux

**Contrainte ECB**: Les données peuvent avoir 1-3 jours de retard (publication J-1 ou J-2)

### 3.3 Affichage des taux actuels

**Vue**: Tableau HTML avec drapeaux

**Colonnes**:
1. **Devise**: Drapeau (24x18px de flagcdn.com) + code ISO
2. **Taux EUR**: Valeur numérique formatée à 4 décimales

**Comportement**:
- Tri alphabétique par code devise
- Drapeaux dynamiques via `https://flagcdn.com/24x18/{code}.png`
- Mapping spécial: EUR → flag "eu", sinon 2 premières lettres en minuscules
- Affichage uniquement si `!loading && exchangeRates.length > 0`

**Header du tableau**: "Taux (YYYY-MM-DD)" avec la date effective

### 3.4 Export CSV

**Déclencheur**: Bouton "⇩ CSV" dans le header du tableau

**Format du fichier**:
```csv
Devise,Taux (EUR),Date
CHF,0.9365,2025-12-07
MXN,21.1912,2025-12-07
```

**Nom du fichier**: `exchange_rates_YYYY-MM-DD.csv`

**Comportement**:
- Génération côté client (Blob API)
- Téléchargement automatique via élément `<a>` temporaire
- Bouton désactivé si `exchangeRates.length === 0`

### 3.5 Visualisation CSV brut

**Vue**: Block `<div class="csv-output">` sous le tableau

**Contenu**: Même format que le CSV exportable, affiché en texte brut
- Permet copier-coller rapide
- Mise à jour synchronisée avec le tableau

### 3.6 Graphique historique

**Composant**: Chart.js Line Chart avec canvas HTML5

**Périodes disponibles** (boutons radio):
- **Mois**: 30 derniers jours
- **Trimestre**: 90 derniers jours  
- **Année**: 365 derniers jours (sélection par défaut)

**Calcul de la période**:
- Date fin: `selectedDate` ou date du jour si vide
- Date début: date fin - période sélectionnée

**Comportement du graphique**:
- **Multi-axes Y**: 1 axe par devise pour échelles indépendantes
  - Axes pairs (0, 2, 4...) → gauche
  - Axes impairs (1, 3, 5...) → droite
- **Padding dynamique**: 5% du range min-max pour chaque axe
- **Axes visibles**: Seulement si ≤ 3 devises (sinon masqués pour clarté)
- **Couleurs**: 5 couleurs prédéfinies cycliques:
  1. Bleu: `rgba(52, 152, 219, 0.16)` / border `rgba(52, 152, 219, 1)`
  2. Rouge: `rgba(231, 76, 60, 0.16)` / border `rgba(231, 76, 60, 1)`
  3. Vert: `rgba(46, 204, 113, 0.16)` / border `rgba(46, 204, 113, 1)`
  4. Violet: `rgba(155, 89, 182, 0.16)` / border `rgba(155, 89, 182, 1)`
  5. Jaune: `rgba(241, 196, 15, 0.16)` / border `rgba(241, 196, 15, 1)`

**Options Chart.js**:
```typescript
{
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { display: true, position: 'top', labels: { usePointStyle: true } },
    tooltip: { backgroundColor: 'rgba(0, 0, 0, 0.8)', padding: 12 }
  }
}
```

**Gestion du rendu**:
- Canvas id: `ratesChart`
- Retry logic: 3 tentatives max avec délai 1000ms si canvas non trouvé
- Destroy de l'ancien chart avant création du nouveau
- Condition d'affichage: `currentView === 'home'`

### 3.7 Navigation

**Pages disponibles**:

1. **Accueil** (par défaut):
   - Sélecteurs devises + date
   - Tableau des taux
   - Graphique historique
   - Section CSV

2. **Docs API**:
   - Documentation REST API
   - Exemples de requêtes
   - Format des réponses

**Header navigation**:
- Logo BCE + titre "Taux de Change BCE" (cliquable → home)
- Boutons: "Accueil" | "Docs API"
- Bouton actif souligné avec classe `.active`

### 3.8 États de l'interface

#### État de chargement
**Condition**: `loading === true`  
**Affichage**: Message "Chargement des données..."  
**Durée**: Pendant les appels API (rates + history)

#### État erreur
**Condition**: `error !== null`  
**Affichage**: Message d'erreur en rouge avec `class="error-message"`  
**Exemples d'erreurs**:
- "Veuillez sélectionner au moins une devise"
- "Erreur lors de la récupération des données: [message]"
- Erreur API ECB propagée depuis le backend

#### État vide
**Condition**: `selectedCurrencies.length === 0`  
**Comportement**: 
- Message d'erreur affiché
- Pas d'appel API
- Tableau et graphique masqués

#### État succès
**Condition**: `!loading && exchangeRates.length > 0`  
**Affichage**: Tout le contenu visible (tableau, CSV, graphique)

---

## 4. API Backend

### 4.1 Configuration

**Base URL**: 
- Dev: `http://localhost:8000`
- Prod: Variable via `window.__env.API_BASE` ou `window.API_BASE`

**CORS**: Autorise `http://localhost:4200` et `http://localhost:8501`

### 4.2 Endpoints

#### GET /api/health
**Usage**: Health check  
**Réponse**:
```json
{
  "status": "ok",
  "timestamp": "2025-12-07T00:21:23.508Z"
}
```

#### GET /api/bce-exchange
**Usage**: Obtenir les taux actuels

**Query params**:
- `currencies` (requis): Codes séparés par virgule (ex: "CHF,USD,GBP")
- `date` (optionnel): Format YYYY-MM-DD

**Comportement si date omise**: Retourne `lastNObservations=1` (dernière valeur disponible)

**Réponse succès**:
```json
{
  "status": "success",
  "date": "2025-12-07",
  "base": "EUR",
  "rates": [
    { "currency": "CHF", "rate": 0.9365, "flag": "ch" },
    { "currency": "MXN", "rate": 21.1912, "flag": "mx" }
  ],
  "source": "European Central Bank (ECB)",
  "referenceBase": "EUR",
  "queriedAt": "2025-12-07T00:21:23.508Z"
}
```

**Réponse erreur**:
```json
{
  "status": "error",
  "message": "ECB API error: 500",
  "ecbRequestUrl": "https://..."
}
```

#### GET /api/bce-exchange/history
**Usage**: Obtenir l'historique des taux

**Query params** (tous requis):
- `currencies`: Codes séparés par virgule
- `start`: Date début (YYYY-MM-DD)
- `end`: Date fin (YYYY-MM-DD)

**Réponse succès**:
```json
{
  "status": "success",
  "start": "2024-12-07",
  "end": "2025-12-07",
  "referenceBase": "EUR",
  "source": "European Central Bank (ECB)",
  "queriedAt": "2025-12-07T00:21:23.508Z",
  "data": [
    { "currency": "CHF", "date": "2024-12-07", "rate": 0.9365 },
    { "currency": "CHF", "date": "2024-12-08", "rate": 0.9370 },
    ...
  ]
}
```

**Tri des données**: Par date croissante, puis par devise alphabétique

### 4.3 Intégration ECB API

**URL de base**: `https://data-api.ecb.europa.eu/service/data/EXR/`

**Format de requête**:
```
D.{CURRENCY1+CURRENCY2}.EUR.SP00.A?format=jsondata&startPeriod={START}&endPeriod={END}
```

**Retry logic**:
- 3 tentatives max
- Backoff exponentiel: 300ms, 600ms, 1200ms
- Headers: `Accept: application/json`, `Accept-Encoding: gzip, deflate`

**Parsing de la réponse ECB**:
- Structure: `data.dataSets[0].series` + `data.structure.dimensions`
- Extraction: observation la plus récente par série
- Conversion: parseFloat sur les rates
- Validation: Skip si rate undefined ou null

---

## 5. Styling et UX

### 5.1 Design System

**Couleurs principales**:
- Primary: Rouge BCE (#d32f2f / Material Red 700)
- Backgrounds: Blancs et gris clairs
- Borders: #ddd, #ccc
- Hover: #e0e0e0

**Typographie**:
- Font: System fonts (Segoe UI, Roboto, Helvetica, Arial)
- Titres: font-size 1.5em, font-weight 600
- Body: font-size 14px

**Espacement**:
- Padding sections: 20px
- Margins: 10px, 15px, 20px selon contexte
- Grid gap: 20px

### 5.2 Layout

**Structure générale**:
```
┌─────────────────────────────────────────┐
│  Header (Logo + Nav)                    │
├─────────────────────────────────────────┤
│  Controls (Devises + Date)              │
├─────────────────────────────────────────┤
│  Loading / Error                        │
├────────────────┬────────────────────────┤
│  Tableau +     │  Graphique             │
│  CSV           │  (Mois/Trim/Année)     │
└────────────────┴────────────────────────┘
```

**Responsive**:
- Desktop: Grid 2 colonnes (50/50)
- Tablet/Mobile: Stack vertical (non implémenté dans la spec actuelle)

### 5.3 Composants Material

**Mat-Form-Field**:
- Appearance: `outline`
- Label: "Devises"
- Full width

**Mat-Chip-Grid**:
- Removable chips avec icône cancel Material
- Input intégré pour ajout
- Autocomplete lié

**Mat-Autocomplete**:
- Options filtrées dynamiquement
- Display: code devise uniquement

**Mat-Icon**:
- Icon: `cancel` pour suppression chips
- Font: Material Icons

### 5.4 Animations et feedback

**Loading states**:
- Message textuel "Chargement des données..."
- Pas de spinner implémenté actuellement

**Interactions**:
- Hover sur boutons: changement de background
- Disabled state: opacity réduite
- Active navigation: border-bottom

**Chart interactions**:
- Hover: tooltip avec détails
- Legend cliquable: toggle visibility série
- Responsive: redimensionnement automatique

---

## 6. Gestion des états

### 6.1 Variables d'état principales

```typescript
// Données
exchangeRates: ExchangeRate[] = []
historyData: HistoryPoint[] = []
selectedCurrencies: string[] = ['CHF', 'MXN']
selectedDate: string = ''  // Empty = API returns latest
selectedPeriod: string = 'Année'

// UI States
loading: boolean = false
error: string | null = null
currentView: 'home' | 'docs' = 'home'
currencyFilter: string = ''  // Autocomplete search

// Chart
chart: Chart | null = null
chartRetryCount: number = 0
```

### 6.2 Flux de données

**Au chargement initial**:
1. `ngOnInit()` → `fetchRates()`
2. API call → `exchangeRates` populated, `loading = false`
3. `fetchHistory()` triggered
4. API call → `historyData` populated
5. `updateChart()` avec retry si canvas pas prêt

**Lors d'un changement de devise**:
1. Add/Remove chip → update `selectedCurrencies[]`
2. `fetchRates()` automatique
3. Même flux que chargement initial

**Lors d'un changement de date**:
1. Date input change → `selectedDate` updated
2. `fetchRates()` automatique
3. History re-fetched avec nouvelle date de fin

**Lors d'un changement de période**:
1. Bouton clicked → `selectedPeriod` updated
2. `fetchHistory()` avec nouvelles dates calculées
3. `updateChart()` avec nouvelles données

### 6.3 Gestion des erreurs

**Catch API errors**:
- Try-catch dans les subscribe handlers
- Set `error` message
- Set `loading = false`
- Clear `exchangeRates` ou `historyData` si nécessaire

**Validation côté client**:
- Check `selectedCurrencies.length > 0` avant API call
- Check `data.status === 'error'` dans la réponse
- Check `data.rates` exists avant mapping

**Error messages user-friendly**:
- Pas de codes techniques exposés
- Messages en français
- Context inclus (ex: "Erreur lors de la récupération des données")

---

## 7. Spécifications techniques complémentaires

### 7.1 Configuration Angular

**Modules requis**:
- `CommonModule` (ngIf, ngFor)
- `FormsModule` (ngModel)
- `HttpClient` (inject pattern Angular 21)
- `MatChipsModule`
- `MatIconModule`
- `MatFormFieldModule`
- `MatInputModule`
- `MatAutocompleteModule`
- `MatButtonModule`

**Providers**:
```typescript
provideHttpClient()
provideAnimations()
```

**TypeScript config**:
- Target: ES2022
- Module: ES2020
- ModuleResolution: Bundler
- Strict mode: enabled

### 7.2 Build et déploiement

**Dev**:
```bash
docker-compose up -d
# Frontend: http://localhost:4200
# Backend: http://localhost:8000
```

**Build production**:
```bash
ng build --configuration production
# Output: dist/frontend/browser/
```

**Docker**:
- Frontend: Node 20 Alpine + Angular dev server (dev) ou nginx (prod)
- Backend: Node 20 Alpine + Fastify
- Volumes pour hot-reload en dev

**Railway**:
- Backend déployé comme service web
- Frontend buildé et servi par le backend (fallback SPA)
- Port: `process.env.PORT || 8000`

### 7.3 Sécurité

**CORS**: Whitelist explicite des origins
**Input validation**: 
- Codes devise uppercase et dans liste autorisée
- Dates format ISO validées
**No sensitive data**: Pas de tokens, tout public ECB API
**XSS prevention**: Angular sanitization par défaut

### 7.4 Performance

**Optimisations**:
- Standalone components (lazy loading possible)
- Chart.js avec only needed scales
- API calls debounced implicitement (user action triggered)
- No polling, only on-demand

**Limitations connues**:
- Max ~30 devises simultanées (UI devient chargée)
- Graphique lisible jusqu'à ~5 devises (axes)
- History limité à 1 an max (performance API ECB)

---

## 8. Critères d'acceptation

### User Stories

**US1**: En tant qu'utilisateur, je veux sélectionner plusieurs devises avec autocomplete pour consulter leurs taux EUR
- ✅ Chips Material visibles avec codes devises
- ✅ Bouton X fonctionnel pour supprimer
- ✅ Autocomplete filtre la liste
- ✅ Ajout par saisie ou sélection

**US2**: En tant qu'utilisateur, je veux choisir une date pour consulter les taux historiques
- ✅ Input date HTML5
- ✅ Changement trigger API call
- ✅ Date affichée dans header tableau

**US3**: En tant qu'utilisateur, je veux voir un tableau clair des taux avec drapeaux
- ✅ Colonnes Devise | Taux EUR
- ✅ Drapeaux 24x18px
- ✅ Taux à 4 décimales
- ✅ Tri alphabétique

**US4**: En tant qu'utilisateur, je veux exporter les taux en CSV
- ✅ Bouton export visible
- ✅ Fichier téléchargé avec nom daté
- ✅ Format CSV standard

**US5**: En tant qu'utilisateur, je veux visualiser l'évolution des taux sur différentes périodes
- ✅ Graphique multi-devises
- ✅ 3 périodes disponibles
- ✅ Axes indépendants par devise
- ✅ Légende et tooltip

**US6**: En tant qu'utilisateur, je veux accéder à la documentation API
- ✅ Page dédiée
- ✅ Exemples de requêtes
- ✅ Format des réponses

### Tests critiques

1. **Chargement initial**: CHF et MXN chargés par défaut
2. **Ajout devise**: USD ajouté → tableau mis à jour
3. **Suppression devise**: CHF supprimé → graphique re-rendu
4. **Changement date**: 2024-01-01 → taux historiques affichés
5. **Changement période**: Mois → graphique 30 jours
6. **Export CSV**: Fichier téléchargé valide
7. **Erreur API**: Message user-friendly affiché
8. **Pas de devise**: Message "Veuillez sélectionner..."

---

## 9. Évolutions futures possibles

**V2 potentielles**:
- [ ] Mode responsive mobile
- [ ] Comparaison de devises (ratios croisés)
- [ ] Alertes de taux personnalisées
- [ ] Favoris sauvegardés (localStorage)
- [ ] Export PDF avec graphique
- [ ] Thème sombre
- [ ] Multi-langues (EN, FR, DE)
- [ ] Intégration autres sources (IMF, World Bank)
- [ ] Calcul inverse (devise → EUR)
- [ ] Widget embed pour sites externes

---

## 10. Résumé exécutif

Application Angular 21 + Material permettant la consultation interactive des taux de change officiels de la BCE. Interface moderne avec chips Material pour sélection multi-devises, graphique historique Chart.js multi-axes, et export CSV. Backend Fastify proxy vers API ECB officielle. Architecture Docker pour développement et production Railway.

**Prêt à déployer**: ✅ (avec corrections canvas timing)  
**Production-ready**: ⚠️ (nécessite tests E2E et responsive mobile)
