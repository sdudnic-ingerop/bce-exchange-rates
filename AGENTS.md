# Agents de développement et infrastructure

## Stack technique

### Environnement d'exécution
- **Language** : Python 3.12
- **Framework principal** : Streamlit
- **Conteneurisation** : Docker + Docker Compose

### Base de données / Cache
- Cache en mémoire Streamlit (TTL 3600s pour l'API ECB)
- Pas de base de données persistante

### Services externes
- **API ECB** : Endpoint REST pour les données de change
- **CDN drapeaux** : flagcdn.com (SVG)

## Déploiement & Containerisation

> 📘 **Guide de déploiement serveur** : Voir [DEPLOY.md](DEPLOY.md) pour les instructions spécifiques au serveur de développement (`10.99.27.11`).

### Docker
- **Image de base** : `python:3.12-slim`
- **Ports exposés** : 8501 (Streamlit), 8000 (API REST)
- **Dockerfile** : Configuration standard avec installation des dépendances

### Local Docker Development (explicit)
- **Purpose:** Run the full development stack locally in an isolated, reproducible environment using `docker-compose`.
- **Compose file:** `docker-compose.yml` launches two services: `streamlit` (port 8501) and `api` (port 8000).
- **Quick start (foreground):**

  - `docker-compose up --build`

  This builds images if needed and streams logs to your terminal. Press `Ctrl+C` to stop.

- **Run detached (background):**

  - `docker-compose up -d --build`

  This starts services in the background. Use the logs and ps commands below to inspect.

- **Stop and remove containers:**

  - `docker-compose down`

- **Run/stop a single service:**

  - Start just the API: `docker-compose up --build api`
  - Start just the UI: `docker-compose up --build streamlit`
  - Stop a single service: `docker-compose stop api` or `docker-compose stop streamlit`

- **View logs:**

  - Tail both services: `docker-compose logs -f`
  - Tail only the API: `docker-compose logs -f api`
  - Tail only the UI: `docker-compose logs -f streamlit`

- **Rebuild an updated image:**

  - `docker-compose build --no-cache <service>` (e.g., `docker-compose build --no-cache api`)

- **Ports and access (local):**

  - Streamlit UI: `http://localhost:8501`
  - FastAPI API: `http://localhost:8000/api/bce-exchange`

- **Common checks (curl examples):**

  - Health: `curl "http://localhost:8000/api/health"`
  - Example: `curl "http://localhost:8000/api/bce-exchange?currencies=USD,CHF"`

- **Notes & troubleshooting:**

  - Source is mounted into the container so code edits normally apply immediately; if not, rebuild with `--build`.
  - If a port is already bound, stop the process using it (Windows: use `Get-Process`/`Stop-Process` or `netstat -ano`) or change ports in `docker-compose.yml`.
  - Use `docker-compose down --volumes` if you want to clear named volumes.

This section provides everything required to run and test the project locally using Docker Compose.

### Docker Compose
```yaml
version: '3'
services:
  streamlit:
    build: .
    ports:
      - "8501:8501"
    volumes:
      - .:/app
    command: streamlit run app.py
    environment:
      - STREAMLIT_SERVER_PORT=8501
      - STREAMLIT_SERVER_ADDRESS=0.0.0.0

  api:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - .:/app
    command: python api.py
    environment:
      - API_HOST=0.0.0.0
      - API_PORT=8000
```

### Commandes
```bash
# Démarrer l'application (Streamlit + API)
docker-compose up

# Arrêter l'application
docker-compose down

# Démarrer uniquement Streamlit
docker-compose up streamlit

# Démarrer uniquement l'API
docker-compose up api

# Rebuild l'image
docker-compose build

# Logs
docker-compose logs -f streamlit
docker-compose logs -f api
```

## Flux de développement

### Développement Local (Docker)
**Le développement se fait principalement via Docker en local.**

1. Modifier le code Python (`app.py` ou `api.py`)
2. Lancer l'environnement : `docker-compose up`
3. Accès à Streamlit : `http://localhost:8501`
4. Accès à l'API : `http://localhost:8000`
5. Les modifications au code sont appliquées en temps réel (mount volume)

### Avant déploiement
1. Vérifier les dépendances dans `requirements.txt`
2. Valider la configuration dans `config.json`
3. Rebuild si nécessaire : `docker-compose build`

## Structure du projet

```
d:\proj\bce\
├── app.py                  # Application Streamlit principale
├── api.py                  # API REST FastAPI
├── config.json             # Configuration (devises par défaut, URL API)
├── requirements.txt        # Dépendances Python
├── Dockerfile              # Definition du conteneur
├── docker-compose.yml      # Orchestration des services
├── assets/
│   └── ecb_logo.svg       # Logo BCE (100×100px)
├── SPEC.md                 # Spécification détaillée
└── AGENTS.md              # Ce fichier
```

## Maintenance

### Logs & Debugging
```bash
# Voir les logs en temps réel
docker-compose logs -f

# Voir les erreurs
docker-compose logs | grep -i error

# Logs de l'API seulement
docker-compose logs -f api

# Logs de Streamlit seulement
docker-compose logs -f streamlit
```

### Mise à jour des dépendances
1. Modifier `requirements.txt`
2. Rebuild : `docker-compose build`
3. Redémarrer : `docker-compose up`

### Données
- Les taux sont récupérés de l'API ECB et cachés 1h en mémoire
- Pas de sauvegarde persistante (requête fraîche à chaque reboot)

## Performance & Optimisations

### Cache Streamlit
- **TTL** : 3600 secondes (1 heure)
- **Fonction** : `@st.cache_data(ttl=3600)`
- **Avantage** : Réduit les appels à l'API ECB

### Rendu HTML
- Tables rendues en HTML pur (support SVG)
- Altair pour les graphiques interactifs

### API REST
- Réponses JSON légères
- Pas de caching (données en temps réel)
- Cache HTTP possible via headers

## API REST

### Démarrage
```bash
# Mode développement (avec rechargement automatique)
uvicorn api:app --reload --host 0.0.0.0 --port 8000

# Mode production
python api.py
```

### Endpoints disponibles
- `GET /` : Documentation générale
- `GET /api/health` : Vérification du statut
- `GET /api/bce-exchange` : Récupération des taux

### Exemple d'utilisation
```bash

# Taux actuels
curl "http://localhost:8000/api/bce-exchange?currencies=USD,CHF"

# Taux à une date spécifique
curl "http://localhost:8000/api/bce-exchange?currencies=EUR,MXN,GBP&date=2025-12-04"
```

## Sécurité

### Points d'attention
- L'API ECB est publique (pas d'authentification requise)
- `unsafe_allow_html=True` utilisé pour les images/drapeaux (contrôlé)
- Pas d'input utilisateur dangereux (sélection uniquement)
- API REST sans authentification (localhost-only en développement)

## Troubleshooting

### L'app ne démarre pas
```bash
docker-compose logs streamlit
# Vérifier les messages d'erreur (imports, fichiers manquants)
```

### Port 8501 ou 8000 déjà en use
```bash
# Changer le port dans docker-compose.yml
# Ou tuer le processus existant
lsof -i :8501
lsof -i :8000
kill -9 <PID>
```

### Images/drapeaux ne s'affichent pas
- Vérifier la connexion Internet (CDN flagcdn.com)
- Vérifier `assets/ecb_logo.svg` existe

### API ECB ne répond pas
- Vérifier l'URL dans `config.json`
- Tester manuellement : `curl https://data-api.ecb.europa.eu/...`

### API REST ne répond pas
```bash
# Vérifier que l'API est en cours d'exécution
docker-compose logs -f api

# Tester le health check
curl http://localhost:8000/api/health
```

## Évolution future

- [ ] Export en Excel
- [ ] Historique multi-années
- [ ] Alertes sur taux
- [ ] Base de données pour persistance
- [ ] Authentification utilisateur
- [ ] Authentification API (API key, OAuth2)
- [ ] Cache distribué (Redis)
- [ ] Documentation Swagger/OpenAPI
