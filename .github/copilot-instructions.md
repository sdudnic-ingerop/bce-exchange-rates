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
- **Développement local**: Tout avec Docker et docker-compose
- Ne rien installer localement (Node.js, npm, Python, etc.)
- Docker Desktop obligatoire pour tous les développeurs
 - **Développement local**: Tout avec Docker et docker-compose. Les contributeurs ne doivent PAS installer de dépendances ou d'outils localement.
 - Ne rien installer localement (Node.js, npm, Python, etc.). Les agents et la documentation doivent **toujours** proposer des commandes Docker/docker-compose ou des instructions compatibles Docker.
 - Docker Desktop obligatoire pour tous les développeurs
- **Plateforme / OS**: Le développement est réalisé principalement sous Windows. Certains comportements (affichage d'émojis, chemins, permissions, commandes shell) peuvent différer sous Linux/macOS. Indiquer explicitement les commandes alternatives si nécessaire.
- **Agents / appels automatiques**: Les agents automatisés (par ex. bots/agents VS Code) ne doivent pas proposer des scripts batch/PowerShell qu'ils ne peuvent pas exécuter automatiquement. Lorsqu'un agent propose une commande, indiquer si elle requiert une interaction humaine, des permissions supplémentaires ou l'utilisation d'un terminal spécifique.
- **Hot Reload**: Configurer les volumes Docker pour éviter les rebuilds
  - Backend: `nodemon` pour reload automatique
  - Frontend: Dev server Angular avec live reload
  
IMPORTANT POUR LES AGENTS:
- Ne jamais suggérer ou recommander d'installer Node.js, npm, Python ou d'autres dépendances sur la machine hôte du développeur. Toutes les commandes proposées par des agents doivent être réalisables via Docker / docker-compose. Si une action nécessite un outil non disponible dans un conteneur, l'agent doit proposer une solution basée sur un conteneur temporaire ou demander l'autorisation explicite de modifier le `Dockerfile`.
- Lorsque vous fournissez des commandes, fournissez exclusivement des commandes `docker-compose` ou `docker` et précisez si la commande modifie l'image (requiert `--build`) ou démarre un conteneur en mode développement (volumes montés).

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
