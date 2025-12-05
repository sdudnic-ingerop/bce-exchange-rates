# Spécification - Application Taux de Change BCE

## Vue d'ensemble
Application Streamlit permettant de consulter les taux de change de la Banque Centrale Européenne (BCE) en temps quasi-réel, avec visualisation historique et export en CSV.

## Fonctionnalités principales

### 1. Sélection des devises
- **Composant** : Multiselect
- **Devises supportées** : 34 devises (USD, JPY, GBP, CHF, EUR, etc.)
- **Affichage** : Drapeau emoji + code devise + description en français
- **Défaut** : USD, GBP, CHF (configurable dans `config.json`)

### 2. Sélection de la date
- **Composant** : Date input
- **Position** : Même ligne que le sélecteur de devises
- **Comportement** : 
  - Affichage dans l'entête en haut à droite
  - Clampée à la plage des données disponibles
  - Si la date n'existe pas (week-end/jour férié), affichage du dernier jour ouvrable antérieur

### 3. Tableau des taux (Taux au [date])
- **Colonnes** : 
  - Devise (drapeau SVG 16×16 + code devise)
  - Taux (format monétaire, 4 décimales)
- **Rendu** : HTML pur pour support des images SVG
- **Tri** : Par code devise
- **Police** : Arial 10pt

### 4. Graphique historique
- **Données** : Historique 2025 (année en cours)
- **Filtrage temporel** : Mois / Trimestre / Année
- **Type** : Ligne Altair avec plusieurs séries
- **Axes Y** : Échelles indépendantes (min-max auto)
- **Axes X** : Dates sans titre
- **Couleurs** : Bleu (#003da5), Rouge (#FF6B6B), Orange (#FFA500), Cyan (#4ECDC4), Bleu ciel (#45B7D1)

### 5. Export CSV
- **Format** : Semicolon-separated (`;`)
- **Colonnes** : `devise` ; `taux_bce` ; `date`
- **Bouton** : Placement sur la même ligne que le titre "CSV"
- **Nom fichier** : `taux_bce_YYYY-MM-DD.csv`

## Source de données
- **API** : ECB Data API (Banque Centrale Européenne)
- **Endpoint** : `https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A`
- **Format** : CSV
- **Mise en cache** : 3600 secondes (1 heure)

## Design & Typographie
- **Police par défaut** : Arial 10pt
- **Titres** : Arial 12pt
- **Tableaux/Code** : Arial 10pt (uniformisé)
- **Sélecteur de devises** : Fond transparent, bordure 1px gris, texte noir

## API REST

### Endpoint
`GET /api/bce-exchange?currencies=EUR,USD,CHF&date=2025-12-04`

### Paramètres
- **currencies** (requis) : Codes de devises séparés par des virgules (ex: `EUR,USD,CHF`)
- **date** (optionnel) : Date au format `YYYY-MM-DD` (par défaut: aujourd'hui)

### Réponse (Succès)
```json
{
  "status": "success",
  "date": "2025-12-04",
  "date_requested": "2025-12-04",
  "rates": [
    {"devise": "CHF", "taux": 0.9345},
    {"devise": "EUR", "taux": 1.0},
    {"devise": "USD", "taux": 1.1234}
  ]
}
```

### Réponse (Erreur)
```json
{
  "status": "error",
  "code": -1,
  "message": "No data available for the specified date"
}
```

### Codes d'erreur
- `-1` : Pas de données disponibles pour la date/devise
- `-2` : Paramètres invalides (format devise, date, etc.)

### Exemples cURL
```bash
# Taux actuels pour USD et CHF
curl "http://localhost:8000/api/bce-exchange?currencies=USD,CHF"

# Taux à une date spécifique
curl "http://localhost:8000/api/bce-exchange?currencies=EUR,MXN,GBP&date=2025-12-04"
```

### Framework & Port
- **Framework** : FastAPI + Uvicorn
- **Port** : 8000 (configurable)
- **Dépendances** : `fastapi`, `uvicorn`

## Infrastructure
- **Framework principal** : Streamlit
- **API REST** : FastAPI + Uvicorn
- **Conteneurisation** : Docker + Docker Compose
- **Image de base** : `python:3.12-slim`
- **Ports** : 
  - 8501 (Streamlit UI)
  - 8000 (API REST)

## Assets
- **Logo ECB** : `assets/ecb_logo.svg` (100×100px)
- **Drapeaux** : CDN `flagcdn.com` (SVG)

## Dépendances
### Streamlit App
- `streamlit` : Framework web
- `pandas` : Traitement de données
- `requests` : Requêtes HTTP vers l'API ECB
- `altair` : Visualisation de graphiques

### API REST
- `fastapi` : Framework API
- `uvicorn` : Serveur ASGI
  {
    "api_url": "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A",
    "default_currencies": ["USD", "GBP", "CHF"]
  }
  ```

## Limitations connues
1. **Émojis de drapeaux** : Windows n'affiche pas les drapeaux comme des images dans le sélecteur multiselect (limitation OS)
2. **Plage de données** : Historique limité à l'année en cours (données actualisées quotidiennement par la BCE)
3. **Taux de change** : Taux de fin de journée (16h CET)
