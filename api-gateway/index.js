require("dotenv").config();

const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const express = require("express");
const cors    = require("cors");
const jwt     = require("jsonwebtoken");

const PORT       = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

const SERVICES = {
  vehicules:    process.env.SERVICE_VEHICULES_URL    || "http://service-vehicules:8081",
  conducteurs:  process.env.SERVICE_CONDUCTEURS_URL  || "http://service-conducteurs:8082",
  maintenance:  process.env.SERVICE_MAINTENANCE_URL  || "http://service-maintenance:8084",
  localisation: process.env.SERVICE_LOCALISATION_URL || "http://service-localisation:8083",
  evenements:   process.env.SERVICE_EVENEMENTS_URL   || "http://service-evenements:8086",
};

// ── Helpers fetch ─────────────────────────────────────────────────────────────
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} — ${url} — ${text}`);
  }
  return res.json();
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Schéma GraphQL ────────────────────────────────────────────────────────────
const typeDefs = `
  type Vehicule {
    id:              ID!
    immatriculation: String!
    marque:          String!
    dispo:           Boolean!
    conducteur_id:   ID
    conducteur:      Conducteur
    dernierePosition: Position
    maintenances:    [Maintenance!]!
  }

  type Conducteur {
    id:      ID!
    nom:     String!
    prenom:  String!
    permis:  String!
    vehicules: [Vehicule!]!
  }

  type Maintenance {
    id:          ID!
    vehicule_id: ID!
    type:        String!
    date:        String!
    cout:        Float
    commentaire: String
  }

  type Position {
    vehicule_id: ID!
    latitude:    Float!
    longitude:   Float!
    vitesse:     Float
    timestamp:   String!
  }

  type Evenement {
    id:          ID!
    type:        String!
    saga_id:     String
    vehicule_id: ID
    conducteur_id: ID
    latitude:    Float
    longitude:   Float
    reason:      String
    timestamp:   String!
  }

  type AuthPayload {
    token: String!
  }

  type Query {
    # Véhicules
    vehicules:       [Vehicule!]!
    vehicule(id: ID!): Vehicule

    # Conducteurs
    conducteurs:     [Conducteur!]!
    conducteur(id: ID!): Conducteur

    # Maintenance
    maintenances:    [Maintenance!]!
    maintenance(id: ID!): Maintenance
    maintenancesVehicule(vehiculeId: ID!): [Maintenance!]!

    # Localisation
    dernierePosition(vehiculeId: ID!): Position
    historiquePositions(vehiculeId: ID!, from: String, to: String, limit: Int): [Position!]!

    # Événements
    evenements: [Evenement!]!
    evenementsVehicule(vehiculeId: ID!): [Evenement!]!
  }

  type Mutation {
    login(username: String!, password: String!): AuthPayload!

    # Véhicules
    creerVehicule(immatriculation: String!, marque: String!, dispo: Boolean): Vehicule!
    modifierVehicule(id: ID!, immatriculation: String, marque: String, dispo: Boolean): Vehicule!
    supprimerVehicule(id: ID!): Boolean!
    assignerConducteur(vehiculeId: ID!, conducteurId: ID!): Vehicule!

    # Conducteurs
    creerConducteur(nom: String!, prenom: String!, permis: String!): Conducteur!
    modifierConducteur(id: ID!, nom: String, prenom: String, permis: String): Conducteur!
    supprimerConducteur(id: ID!): Boolean!

    # Maintenance
    creerMaintenance(vehicule_id: ID!, type: String!, date: String!, cout: Float, commentaire: String): Maintenance!
    modifierMaintenance(id: ID!, type: String, date: String, cout: Float, commentaire: String): Maintenance!
    supprimerMaintenance(id: ID!): Boolean!
  }
`;

// ── Resolvers ─────────────────────────────────────────────────────────────────
const resolvers = {
  Query: {
    vehicules: (_p, _a, { token }) =>
      fetchJson(`${SERVICES.vehicules}/vehicules`, { headers: authHeaders(token) }),

    vehicule: (_p, { id }, { token }) =>
      fetchJson(`${SERVICES.vehicules}/vehicules/${id}`, { headers: authHeaders(token) }),

    conducteurs: (_p, _a, { token }) =>
      fetchJson(`${SERVICES.conducteurs}/conducteurs`, { headers: authHeaders(token) }),

    conducteur: (_p, { id }, { token }) =>
      fetchJson(`${SERVICES.conducteurs}/conducteurs/${id}`, { headers: authHeaders(token) }),

    maintenances: (_p, _a, { token }) =>
      fetchJson(`${SERVICES.maintenance}/maintenances`, { headers: authHeaders(token) }),

    maintenance: (_p, { id }, { token }) =>
      fetchJson(`${SERVICES.maintenance}/maintenances/${id}`, { headers: authHeaders(token) }),

    maintenancesVehicule: (_p, { vehiculeId }, { token }) =>
      fetchJson(`${SERVICES.maintenance}/maintenances/vehicule/${vehiculeId}`, { headers: authHeaders(token) }),

    dernierePosition: async (_p, { vehiculeId }) => {
      try { return await fetchJson(`${SERVICES.localisation}/localisations/vehicule/${vehiculeId}/derniere`); }
      catch { return null; }
    },

    historiquePositions: async (_p, { vehiculeId, from, to, limit }) => {
      const params = new URLSearchParams();
      if (from)  params.set("from",  from);
      if (to)    params.set("to",    to);
      if (limit) params.set("limit", limit);
      return fetchJson(`${SERVICES.localisation}/localisations/vehicule/${vehiculeId}?${params}`);
    },

    evenements: () => fetchJson(`${SERVICES.evenements}/evenements`),
    evenementsVehicule: (_p, { vehiculeId }) =>
      fetchJson(`${SERVICES.evenements}/evenements/vehicule/${vehiculeId}`),
  },

  // Résolveurs de champs — enrichissement cross-services
  Vehicule: {
    conducteur: async (vehicule) => {
      if (!vehicule.conducteur_id) return null;
      try { return await fetchJson(`${SERVICES.conducteurs}/conducteurs/${vehicule.conducteur_id}`); }
      catch { return null; }
    },
    dernierePosition: async (vehicule) => {
      try { return await fetchJson(`${SERVICES.localisation}/localisations/vehicule/${vehicule.id}/derniere`); }
      catch { return null; }
    },
    maintenances: (vehicule) =>
      fetchJson(`${SERVICES.maintenance}/maintenances/vehicule/${vehicule.id}`),
  },

  Conducteur: {
    vehicules: async (conducteur) => {
      try { return await fetchJson(`${SERVICES.conducteurs}/conducteurs/${conducteur.id}/vehicules`); }
      catch { return []; }
    },
  },

  Mutation: {
    login: async () => {
    throw new Error("Le login se fait désormais via Keycloak côté frontend.");
  },

    creerVehicule: (_p, args, { token }) =>
      fetchJson(`${SERVICES.vehicules}/vehicules`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body:    JSON.stringify(args),
      }),

    modifierVehicule: (_p, { id, ...args }, { token }) =>
      fetchJson(`${SERVICES.vehicules}/vehicules/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body:    JSON.stringify(args),
      }),

    supprimerVehicule: async (_p, { id }, { token }) => {
      await fetchJson(`${SERVICES.vehicules}/vehicules/${id}`, {
        method:  "DELETE",
        headers: authHeaders(token),
      });
      return true;
    },

    assignerConducteur: (_p, { vehiculeId, conducteurId }, { token }) =>
      fetchJson(`${SERVICES.vehicules}/vehicules/${vehiculeId}/assigner/${conducteurId}`, {
        method:  "POST",
        headers: authHeaders(token),
      }).then(r => r.vehicule),

    creerConducteur: (_p, args, { token }) =>
      fetchJson(`${SERVICES.conducteurs}/conducteurs`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body:    JSON.stringify(args),
      }),

    modifierConducteur: (_p, { id, ...args }, { token }) =>
      fetchJson(`${SERVICES.conducteurs}/conducteurs/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body:    JSON.stringify(args),
      }),

    supprimerConducteur: async (_p, { id }, { token }) => {
      await fetchJson(`${SERVICES.conducteurs}/conducteurs/${id}`, {
        method:  "DELETE",
        headers: authHeaders(token),
      });
      return true;
    },

    creerMaintenance: (_p, args, { token }) =>
      fetchJson(`${SERVICES.maintenance}/maintenances`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body:    JSON.stringify(args),
      }),

    modifierMaintenance: (_p, { id, ...args }, { token }) =>
      fetchJson(`${SERVICES.maintenance}/maintenances/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body:    JSON.stringify(args),
      }),

    supprimerMaintenance: async (_p, { id }, { token }) => {
      await fetchJson(`${SERVICES.maintenance}/maintenances/${id}`, {
        method:  "DELETE",
        headers: authHeaders(token),
      });
      return true;
    },
  },
};

// ── Démarrage ─────────────────────────────────────────────────────────────────
async function main() {
  const app    = express();
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();

  app.use(cors());
  app.use(express.json());

  // Middleware JWT — extrait le token pour le passer dans le contexte
  app.use("/graphql", expressMiddleware(server, {
    context: async ({ req }) => {
      const auth  = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      return { token };
    },
  }));

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "api-gateway" }));

  app.listen(PORT, () => {
    console.log(`[gateway] GraphQL sur http://localhost:${PORT}/graphql`);
    console.log(`[gateway] Apollo Sandbox disponible en dev`);
  });
}

main().catch(err => { console.error("Erreur gateway:", err); process.exit(1); });
