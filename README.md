# SGFV — Système de Gestion de Flotte de Véhicules

Projet Master 1 GIL — Université de Rouen Normandie 2025-2026  
Architecture microservices Node.js + Kafka + TimescaleDB + Keycloak

## Lancer le projet

```bash
docker compose up -d --build
```

Attendre 2-3 minutes. Vérifier avec :

```bash
docker compose ps
```

## Accès

| Service | URL | Identifiants |
|---|---|---|
| Frontend | http://localhost:80 | login via Keycloak |
| Keycloak | http://localhost:8085 | admin / admin123 |
| Grafana | http://localhost:3000 | admin / admin123 |
| Prometheus | http://localhost:9090 | — |
| Jaeger | http://localhost:16686 | — |
| API GraphQL | http://localhost:4000/graphql | — |

## Comptes de test

| Compte | Mot de passe | Rôle | Accès |
|---|---|---|---|
| admin | admin123 | Admin | Tout |
| gestionnaire | gest123 | Gestionnaire | Véhicules, conducteurs, maintenance |
| technicien | tech123 | Technicien | Maintenance, localisation |
| conducteur | cond123 | Utilisateur | Véhicules, localisation |

## Tests unitaires

```bash
cd service-vehicules && npm test
cd ../service-conducteurs && npm test
cd ../service-maintenance && npm test
```

## Tests E2E (Playwright)

```bash
cd frontend
npm install
npx playwright install
npm run test:e2e
```

## Tests de charge (K6)

```bash
# Installer K6 : https://k6.io/docs/get-started/installation/
k6 run tests/load/sgfv-load.js
```

## Simulateur GPS

```bash
cd service-localisation

# Hors zone → déclenche alertes Kafka
node simulateur-gps.js

# Dans la zone de Rouen
node simulateur-gps-normal.js
```

## Services

| Service | Port | Rôle |
|---|---|---|
| service-vehicules | 8081 | Parc automobile |
| service-conducteurs | 8082 | Profils conducteurs |
| service-localisation | 8083 | GPS temps réel + gRPC |
| service-maintenance | 8084 | Interventions |
| service-evenements | 8086 | Alertes Kafka |
| api-gateway | 4000 | GraphQL |
