# BCE Exchange Rates - Docker Setup

Tous les services tournent dans Docker de manière isolée et coordonnée.

## Démarrage

```bash
docker-compose -f docker-compose-new.yml up --build
```

## Services

### Frontend (Angular)
- **Port** : 4200
- **URL** : http://localhost:4200
- **Volume** : src/ pour hot reload en développement

### Backend (Python API)
- **Port** : 8000
- **Endpoints** :
  - `GET /api/bce-exchange?currencies=USD,CHF`
  - `GET /api/bce-exchange/history?currencies=USD&start=2025-01-01&end=2025-12-31`
  - `GET /api/health`

## Arrêt

```bash
docker-compose -f docker-compose-new.yml down
```

## Logs

```bash
# Tous les services
docker-compose -f docker-compose-new.yml logs -f

# Frontend seulement
docker-compose -f docker-compose-new.yml logs -f frontend

# API seulement
docker-compose -f docker-compose-new.yml logs -f api
```

## Architecture

```
bce/
├── frontend/          # Angular app (Docker)
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── backend/           # Python API (Docker)
│   ├── api.py
│   ├── Dockerfile
│   └── requirements.txt
└── docker-compose-new.yml
```

## CORS

L'API est configurée avec CORS activé pour accepter les requêtes du frontend.

## Hot Reload

Les modifications aux fichiers `src/` du frontend sont reflétées instantanément via le volume.
