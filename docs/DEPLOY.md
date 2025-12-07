# Guide de Déploiement - Serveur de Développement

Ce guide détaille la procédure pour déployer l'application sur le serveur de développement (`10.99.27.11`) et la rendre accessible sur le réseau local.

## 📋 Informations Serveur

- **IP Serveur** : `10.99.27.11`
- **Réseau** : Ingerop (10.99.x.x)
- **URL Application** : `http://10.99.27.11:8501`
- **URL API** : `http://10.99.27.11:8000`

## 🚀 Démarrage Rapide (Option Docker - Recommandée)

Si **Docker Desktop** est installé sur la machine :

1. Ouvrir un terminal (PowerShell ou CMD)
2. Naviguer vers le dossier du projet :
   ```powershell
   cd d:\proj\bce
   ```
3. Lancer le script de démarrage :
   ```powershell
   .\start.bat
   ```

Cela va construire les images Docker et lancer les conteneurs en arrière-plan.

## 🐍 Démarrage Natif (Option Sans Docker)

Si Docker n'est pas installé, vous pouvez utiliser Python directement :

1. Assurez-vous que **Python 3.10+** est installé.
2. Double-cliquez sur le fichier :
   ```
   run_native.bat
   ```
3. Cela ouvrira deux fenêtres (une pour l'API, une pour Streamlit). Ne les fermez pas.

## 🔧 Configuration Réseau

L'application est configurée pour écouter sur toutes les interfaces (`0.0.0.0`).
Pour que l'application soit accessible depuis d'autres postes du réseau, assurez-vous que le pare-feu Windows autorise les connexions entrantes sur les ports :
- **8501** (TCP) - Interface Streamlit
- **8000** (TCP) - API REST

### Test de connexion

Depuis un autre poste du réseau, essayez d'accéder à :
- `http://10.99.27.11:8501`

## 📦 Commandes Docker Manuelles

Si vous préférez utiliser Docker directement :

```bash
# Démarrer en mode détaché (arrière-plan)
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter les services
docker-compose down
```

## 🔄 Mise à jour

Pour mettre à jour l'application après des modifications de code :

```bash
# Redémarrer pour prendre en compte les changements (si volumes non montés ou changement de dépendances)
docker-compose down
docker-compose up -d --build
```

## 🛠 Dépannage

**L'application n'est pas accessible depuis le réseau :**
1. Vérifiez que les conteneurs tournent : `docker ps`
2. Vérifiez l'adresse IP du serveur : `ipconfig` (doit être `10.99.27.11`)
3. Vérifiez le pare-feu Windows :
   ```powershell
   New-NetFirewallRule -DisplayName "BCE Streamlit" -Direction Inbound -LocalPort 8501 -Protocol TCP -Action Allow
   New-NetFirewallRule -DisplayName "BCE API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
   ```
