# Déploiement Kubernetes avec Helm

## Prérequis
- Minikube, Kind, ou K3s installé
- kubectl configuré
- Helm 3 installé

## Démarrer Minikube
```bash
minikube start --memory=4096 --cpus=4
eval $(minikube docker-env)   # Utiliser le registry Docker de Minikube
```

## Builder les images dans Minikube
```bash
docker compose build
```

## Déployer avec Helm
```bash
# Créer le namespace
kubectl create namespace sgfv

# Installer le chart
helm install sgfv ./helm/sgfv --namespace sgfv

# Vérifier les pods
kubectl get pods -n sgfv

# Voir les logs d'un service
kubectl logs -n sgfv -l app=flotte-vehicules -f
```

## Mettre à jour après modification
```bash
helm upgrade sgfv ./helm/sgfv --namespace sgfv
```

## Désinstaller
```bash
helm uninstall sgfv --namespace sgfv
```

## Accéder aux services (Minikube)
```bash
minikube service flotte-frontend --namespace sgfv
minikube tunnel   # Pour l'Ingress
```
