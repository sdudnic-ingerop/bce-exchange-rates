# Copilot Instructions

## Règles de Base pour le Projet BCE

### Architecture
- **Backend**: Node.js/TypeScript
- **Frontend**: Angular (TypeScript)
- **Déploiement**: Docker & Railway

### Standards de Code
- TypeScript strict (pas de `any`)
- Types explicites sur fonctions et variables
- camelCase pour variables/fonctions, PascalCase pour classes
- Imports ES6, pas de wildcard imports (`import *`)

### Structure du Projet
- **Backend** (`backend/src/`): Organisation par domaine, `server.ts` comme point d'entrée
- **Frontend** (`frontend/src/`): Structure Angular standard avec `app/components/` et `app/services/`

### Docker et Développement
- **Développement UNIQUEMENT avec Docker et docker-compose** - Aucune installation locale
- ❌ **JAMAIS** installer Node.js, npm, Python, ou toute autre dépendance sur la machine hôte
- ✅ **Docker Desktop obligatoire** pour tous les développeurs
- ✅ Toutes les commandes proposées par les agents doivent être via `docker-compose` ou `docker`
- ✅ Les volumes Docker sont configurés pour hot-reload automatique :
  - Backend: `tsx watch` (équivalent nodemon pour TypeScript) - rebuild automatique au changement de fichier
  - Frontend: Dev server Angular avec `--poll=2000` (polling activé) - rechargement automatique du navigateur
- ✅ Les changements de code dans `src/` se reflètent **immédiatement** dans le conteneur sans rebuild d'image
- ✅ **Aucun redémarrage du conteneur nécessaire** - les changements sont détectés automatiquement
- ✅ Communication inter-services: utiliser les noms de services Docker (`http://api:8000`, `http://frontend:4200`)

**Commandes essentielles (UNIQUEMENT Docker):**
```bash
# Lancer l'environnement complet
docker-compose up --build

# Stopper l'environnement
docker-compose down

# Logs en temps réel
docker-compose logs -f

# Exécuter une commande dans un conteneur
docker-compose exec api npm run dev
docker-compose exec frontend ng serve
```

**Plateforme / OS**: Le développement est réalisé principalement sous Windows avec PowerShell. 
- ❌ **NE JAMAIS** utiliser de commandes Linux/Bash comme `tail`, `head`, `grep`, `ls`, `cat`, etc. dans les commandes PowerShell
- ✅ **TOUJOURS** utiliser des équivalents PowerShell : `Get-Content`, `Select-Object -First/-Last`, `Where-Object`, `Get-ChildItem`, etc.
- ✅ Les chemins Windows utilisent `\` ou `/` (les deux marchent dans PowerShell)
- ✅ Toutes les commandes doivent être compatibles PowerShell natif

**IMPORTANT POUR LES AGENTS:**
- ❌ Ne JAMAIS suggérer d'installer Node.js, npm, Python ou d'autres dépendances sur la machine hôte
- ❌ Ne JAMAIS proposer des commandes locales comme `npm install`, `python setup.py`, `npm run build` en dehors de Docker
- ✅ Toutes les commandes doivent être dans des conteneurs Docker
- ✅ Si une action nécessite un outil non disponible dans un conteneur, proposer une solution basée sur un conteneur temporaire ou modifier le `Dockerfile`
- ✅ Toujours préciser si la commande modifie l'image (requiert `--build`) ou démarre un conteneur en mode développement (volumes montés)

### Git et Commits

#### Workflow Git
- **Branche principale**: `develop` (jamais toucher `main` directement)
- **Branches de travail**: Créer des branches depuis `develop`
  - Format: `feature/nom-feature`, `bugfix/nom-bug`, `refactor/nom`, `docs/nom`
- **Commits**: Toujours commiter sur `develop` ou une branche de feature
- **Push**: `git push origin develop` (jamais `origin main`)
- **Main**: Protégée, mise à jour uniquement via Pull Request depuis `develop`

#### Format des Commits
- Format: `[type]: description` (ex: `[feat]: add login endpoint`)
- Types: 
  - `feat`: Nouvelle fonctionnalité
  - `fix`: Correction de bug
  - `docs`: Documentation
  - `style`: Formatage, style (pas de changement de code)
  - `refactor`: Refactoring de code
  - `test`: Ajout/modification de tests
  - `chore`: Tâches de maintenance (build, config, etc.)
  - `merge`: Merge de branches

#### Règles Importantes
- ❌ **JAMAIS** commiter ou pusher directement sur `main`
- ❌ **JAMAIS** modifier `origin/main` localement
- ✅ **TOUJOURS** travailler sur `develop` ou une feature branch
- ✅ **TOUJOURS** pusher sur `origin/develop`
- ✅ Utiliser des Pull Requests pour merger `develop` → `main`

### Bonnes Pratiques
- Noms significatifs pour variables et fonctions
- Fonctions courtes et focalisées
- Éviter la duplication (utiliser des utilitaires réutilisables)
- Gérer les erreurs explicitement
- Logs appropriés pour le debugging

### Sécurité
- Ne pas exposer informations sensibles (mots de passe, clés API)
- Valider et nettoyer les entrées utilisateur
- Utiliser HTTPS en production

### Documentation
- JSDoc pour les APIs
- `.env.example` pour les variables d'environnement
- Mettre à jour README si changements majeurs
