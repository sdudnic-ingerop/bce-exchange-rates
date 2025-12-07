# BCE Exchange Rates - Node.js Stack

## Stack Technique

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify 4.x
- **Language**: TypeScript 5.x
- **API**: REST

### Frontend
- **Framework**: Angular 17 (Standalone Components)
- **Charts**: Chart.js 4.x
- **HTTP**: Angular HttpClient

### Infrastructure
- **Containerisation**: Docker + Docker Compose
- **Proxy**: Nginx (pour le frontend en production)

## Structure du projet

```
d:\proj\bce\
├── backend-node/           # API Node.js + Fastify + TypeScript
│   ├── src/
│   │   └── server.ts      # Serveur Fastify
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .dockerignore
│
├── frontend-ng/            # Application Angular
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.component.ts
│   │   │   ├── app.component.html
│   │   │   └── app.component.css
│   │   ├── main.ts
│   │   ├── index.html
│   │   └── styles.css
│   ├── angular.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── nginx.conf
│   └── .dockerignore
│
└── docker-compose.node.yml # Orchestration Docker
```

## Démarrage rapide

### Prérequis
- Docker Desktop installé et lancé
- Ports 4200 et 8000 disponibles

### Lancement avec Docker Compose

```powershell
# Démarrer tous les services
docker-compose -f docker-compose.node.yml up --build

# Démarrer en arrière-plan
docker-compose -f docker-compose.node.yml up -d --build

# Arrêter les services
docker-compose -f docker-compose.node.yml down

# Voir les logs
docker-compose -f docker-compose.node.yml logs -f

# Logs d'un service spécifique
docker-compose -f docker-compose.node.yml logs -f api
docker-compose -f docker-compose.node.yml logs -f frontend
```

### Accès aux services

- **Frontend Angular**: http://localhost:4200
- **API Fastify**: http://localhost:8000
- **Health check**: http://localhost:8000/api/health

## Développement local (sans Docker)

### Backend

```powershell
cd backend-node
npm install
npm run dev          # Mode développement avec hot reload
npm run build        # Compilation TypeScript
npm start            # Mode production
```

### Frontend

```powershell
cd frontend-ng
npm install
npm start            # Démarre sur http://localhost:4200
npm run build        # Build de production
```

## API REST

### Endpoints

#### Health Check
```bash
GET http://localhost:8000/api/health
```

#### Taux de change
```bash
GET http://localhost:8000/api/bce-exchange?currencies=USD,CHF&date=2025-12-06
```

**Paramètres:**
- `currencies` (requis): Liste de devises séparées par des virgules
- `date` (optionnel): Date au format YYYY-MM-DD

**Exemple de réponse:**
```json
{
  "status": "success",
  "date": "2025-12-06",
  "base": "EUR",
  "rates": [
    {
      "currency": "CHF",
      "rate": 0.9456,
      "flag": "ch"
    },
    {
      "currency": "USD",
      "rate": 1.0543,
      "flag": "us"
    }
  ]
}
```

## Configuration

### Backend (backend-node/src/server.ts)
- Port par défaut: 8000
- CORS activé pour localhost:4200 et localhost:8501
- API ECB: https://data-api.ecb.europa.eu

### Frontend (frontend-ng/src/app/app.component.ts)
- API URL: http://localhost:8000/api/bce-exchange
- Devises par défaut: USD, CHF, GBP

## Fonctionnalités

### Interface utilisateur
- ✅ Sélection multiple de devises (Ctrl/Cmd + clic)
- ✅ Sélection de date (HTML5 date picker)
- ✅ Tableau des taux avec drapeaux
- ✅ Graphique Chart.js (barres)
- ✅ Export CSV
- ✅ Documentation API intégrée

### API
- ✅ Récupération des taux ECB
- ✅ Support de dates historiques
- ✅ CORS configuré
- ✅ Health check
- ✅ Gestion d'erreurs

## Dépannage

### Port 8000 déjà utilisé
```powershell
# Trouver le processus
Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess

# Arrêter le processus
Stop-Process -Id <PID> -Force
```

### Port 4200 déjà utilisé
```powershell
# Trouver le processus
Get-Process -Id (Get-NetTCPConnection -LocalPort 4200).OwningProcess

# Arrêter le processus
Stop-Process -Id <PID> -Force
```

### Rebuild complet
```powershell
# Supprimer tous les conteneurs et volumes
docker-compose -f docker-compose.node.yml down -v

# Rebuild sans cache
docker-compose -f docker-compose.node.yml build --no-cache

# Redémarrer
docker-compose -f docker-compose.node.yml up
```

### Erreurs npm
```powershell
# Nettoyer le cache npm
cd backend-node
rm -rf node_modules package-lock.json
npm install

cd ../frontend-ng
rm -rf node_modules package-lock.json
npm install
```

## Performance

### Backend Fastify
- Très rapide (3x plus rapide qu'Express)
- Validation JSON Schema intégrée
- Logging structuré avec Pino

### Frontend Angular
- Standalone Components (plus léger)
- Change Detection OnPush (optimisé)
- Lazy loading possible pour de futures extensions

## Évolutions futures

- [ ] Authentification JWT
- [ ] Cache Redis pour l'API
- [ ] WebSocket pour temps réel
- [ ] Tests unitaires (Jest + Angular Testing)
- [ ] CI/CD (GitHub Actions)
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Graphiques historiques multi-périodes
- [ ] Support i18n (EN/FR/DE)

## Différences avec Python + Streamlit

| Aspect | Python + Streamlit | Node.js + Angular |
|--------|-------------------|-------------------|
| Backend | Python + FastAPI | Node.js + Fastify |
| Frontend | Streamlit (Python) | Angular (TypeScript) |
| Performance | Bon | Excellent |
| Scalabilité | Limitée | Haute |
| Maintenance | Simple | Professionnelle |
| Déploiement | Monolithique | Microservices |
| Typage | Python (optionnel) | TypeScript (strict) |

## Support

Pour toute question ou problème:
1. Vérifier les logs: `docker-compose -f docker-compose.node.yml logs`
2. Vérifier que Docker Desktop est lancé
3. Vérifier que les ports 4200 et 8000 sont libres
4. Rebuild complet si nécessaire
