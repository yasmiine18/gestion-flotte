require("dotenv").config();

const { verifierToken, verifierRole } = require("./auth-keycloak");

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const { Kafka } = require("kafkajs");

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "secret123";
const PORT = process.env.PORT || 8083;
const GRPC_PORT = process.env.GRPC_PORT || 50051;

const pool = new Pool({
  host: process.env.DB_HOST || "timescaledb",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "flotte",
  password: process.env.DB_PASSWORD || "flotte",
  database: process.env.DB_NAME || "localisation_db",
});


// ---------- Kafka ----------
const kafkaEnabled = (process.env.KAFKA_ENABLED || "false") === "true";
let kafkaProducer = null;

async function initKafka() {
  if (!kafkaEnabled) {
    console.log("[localisation] Kafka désactivé");
    return;
  }

  const kafka = new Kafka({
    clientId: "service-localisation",
    brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
  });

  kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  console.log("[localisation] Kafka connecté");
}

async function publierAlerteGeofence(payload) {
  if (!kafkaEnabled || !kafkaProducer) {
    console.log("[GEOFENCE]", payload);
    return;
  }

  await kafkaProducer.send({
    topic: process.env.KAFKA_TOPIC || "geofence.alerts",
    messages: [{ value: JSON.stringify(payload) }],
  });
}

// ---------- DB helpers ----------
async function waitForDb(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("[localisation] DB connectée");
      return;
    } catch (err) {
      console.log(`[localisation] DB non prête (${i}/${retries})`);
      if (i === retries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function insererPosition(position) {
  const { vehicule_id, latitude, longitude, vitesse, timestamp } = position;

  await pool.query(
    `INSERT INTO positions_gps (vehicule_id, latitude, longitude, vitesse, timestamp)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))`,
    [
      vehicule_id,
      latitude,
      longitude,
      Number.isFinite(vitesse) ? vitesse : null,
      timestamp || null,
    ]
  );
}

// Géofence simple : on vérifie si la position tombe dans au moins une zone autorisée
async function verifierGeofence(position) {
  const { latitude, longitude, vehicule_id } = position;

  const zones = await pool.query("SELECT * FROM zones");

  const dansUneZone = zones.rows.some((z) => {
    return (
      latitude >= z.min_lat &&
      latitude <= z.max_lat &&
      longitude >= z.min_lon &&
      longitude <= z.max_lon
    );
  });

  if (!dansUneZone) {
    await publierAlerteGeofence({
      type: "GEOFENCE_OUT",
      vehicule_id,
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    });
  }

  return dansUneZone;
}

// ---------- REST ----------
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "localisation", db: "ok" });
  } catch {
    res.status(500).json({ status: "ko", service: "localisation", db: "ko" });
  }
});

app.post("/login", (req, res) => {
  const token = jwt.sign({ user: "admin" }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ token });
});

// Historique des positions d'un véhicule
app.get("/localisations/vehicule/:vehiculeId", async (req, res) => {
  const vehiculeId = Number(req.params.vehiculeId);
  const { from, to, limit } = req.query;

  if (!Number.isFinite(vehiculeId)) {
    return res.status(400).json({ error: "vehiculeId invalide" });
  }

  const lim = Math.min(Number(limit || 200), 1000);

  try {
    const result = await pool.query(
      `SELECT vehicule_id, latitude, longitude, vitesse, timestamp
       FROM positions_gps
       WHERE vehicule_id = $1
         AND ($2::timestamptz IS NULL OR timestamp >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR timestamp <= $3::timestamptz)
       ORDER BY timestamp DESC
       LIMIT $4`,
      [vehiculeId, from || null, to || null, lim]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lecture historique" });
  }
});

// Dernière position connue d'un véhicule
app.get("/localisations/vehicule/:vehiculeId/derniere", async (req, res) => {
  const vehiculeId = Number(req.params.vehiculeId);

  if (!Number.isFinite(vehiculeId)) {
    return res.status(400).json({ error: "vehiculeId invalide" });
  }

  try {
    const result = await pool.query(
      `SELECT vehicule_id, latitude, longitude, vitesse, timestamp
       FROM positions_gps
       WHERE vehicule_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [vehiculeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Aucune position" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lecture dernière position" });
  }
});

// Endpoint REST optionnel pour insérer une position sans gRPC
app.post("/localisations", verifierToken, verifierRole("admin", "gestionnaire", "technicien"), async (req, res) => {
  try {
    const vehicule_id = Number(req.body.vehicule_id);
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const vitesse = Number(req.body.vitesse);
    const timestamp = req.body.timestamp || null;

    if (!Number.isFinite(vehicule_id) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "vehicule_id, latitude et longitude sont obligatoires" });
    }

    const position = {
      vehicule_id,
      latitude,
      longitude,
      vitesse: Number.isFinite(vitesse) ? vitesse : null,
      timestamp,
    };

    await insererPosition(position);
    const dansZone = await verifierGeofence(position);

    res.status(201).json({
      message: "Position stockée",
      geofence_ok: dansZone,
      position,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur insertion position" });
  }
});

// ---------- gRPC ----------
const protoPath = path.join(__dirname, "gps.proto");
const packageDef = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  defaults: true,
});
const proto = grpc.loadPackageDefinition(packageDef).gps;

function streamPositions(call) {
  call.on("data", async (pos) => {
    try {
      const vehicule_id = Number(pos.vehicule_id);
      const latitude = Number(pos.latitude);
      const longitude = Number(pos.longitude);
      const vitesse = Number(pos.vitesse);

      if (!Number.isFinite(vehicule_id) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        call.write({ ok: false, message: "Position invalide" });
        return;
      }

      const position = {
        vehicule_id,
        latitude,
        longitude,
        vitesse: Number.isFinite(vitesse) ? vitesse : null,
        timestamp: pos.timestamp || null,
      };

      await insererPosition(position);
      await verifierGeofence(position);

      call.write({ ok: true, message: "Position stockee" });
    } catch (err) {
      console.error("Erreur stockage position :", err);
      call.write({ ok: false, message: "Erreur stockage" });
    }
  });

  call.on("end", () => {
    call.end();
  });
}

async function main() {
  await waitForDb();
  await initKafka();

  // REST
  app.listen(PORT, () => {
    console.log(`Service localisation REST sur http://localhost:${PORT}`);
  });

  // gRPC
  const server = new grpc.Server();
  server.addService(proto.LocalisationService.service, {
    StreamPositions: streamPositions,
  });

  server.bindAsync(
    `0.0.0.0:${GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    () => {
      server.start();
      console.log(`Service localisation gRPC sur 0.0.0.0:${GRPC_PORT}`);
    }
  );
}

main().catch((err) => {
  console.error("Erreur au démarrage localisation :", err);
  process.exit(1);
});
// ── Zones géofencing — CRUD (ajouté) ──────────────────────────────────────────
app.get("/zones", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM zones ORDER BY id");
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur lecture zones" }); }
});

app.get("/zones/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const r = await pool.query("SELECT * FROM zones WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Zone introuvable" });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur lecture zone" }); }
});

app.post("/zones", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const { nom, min_lat, max_lat, min_lon, max_lon, active } = req.body ?? {};
  if (!nom || min_lat == null || max_lat == null || min_lon == null || max_lon == null)
    return res.status(400).json({ error: "nom, min_lat, max_lat, min_lon, max_lon sont obligatoires" });
  if (min_lat >= max_lat) return res.status(400).json({ error: "min_lat doit être < max_lat" });
  if (min_lon >= max_lon) return res.status(400).json({ error: "min_lon doit être < max_lon" });
  try {
    const r = await pool.query(
      "INSERT INTO zones (nom, min_lat, max_lat, min_lon, max_lon, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [nom, min_lat, max_lat, min_lon, max_lon, active ?? true]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Une zone avec ce nom existe déjà" });
    console.error(err); res.status(500).json({ error: "Erreur création zone" });
  }
});

app.put("/zones/:id", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const id = Number(req.params.id);
  const { nom, min_lat, max_lat, min_lon, max_lon, active } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const r = await pool.query(
      `UPDATE zones SET
         nom     = COALESCE($1, nom),
         min_lat = COALESCE($2, min_lat),
         max_lat = COALESCE($3, max_lat),
         min_lon = COALESCE($4, min_lon),
         max_lon = COALESCE($5, max_lon),
         active  = COALESCE($6, active)
       WHERE id = $7 RETURNING *`,
      [nom || null, min_lat ?? null, max_lat ?? null, min_lon ?? null, max_lon ?? null, active ?? null, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Zone introuvable" });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur modification zone" }); }
});

app.delete("/zones/:id", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const r = await pool.query("DELETE FROM zones WHERE id=$1 RETURNING id", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Zone introuvable" });
    res.json({ message: "Zone supprimée", id });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur suppression zone" }); }
});
