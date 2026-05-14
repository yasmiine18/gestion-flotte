require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const { Pool }   = require("pg");
const { Kafka }  = require("kafkajs");
const fs         = require("fs");
const path       = require("path");

const app  = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8086;

const pool = new Pool({
  host:     process.env.DB_HOST     || "postgres",
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USER     || "flotte",
  password: process.env.DB_PASSWORD || "flotte",
  database: process.env.DB_NAME     || "evenements_db",
});

// ── Attendre que la DB soit prête ─────────────────────────────────────────────
async function waitForDb(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("[evenements] DB connectée");
      return;
    } catch {
      console.log(`[evenements] DB non prête (${i}/${retries})`);
      if (i === retries) throw new Error("DB inaccessible");
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ── Initialiser le schéma ─────────────────────────────────────────────────────
async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, "db-init.sql"), "utf8");
  await pool.query(sql);
  console.log("[evenements] schéma prêt");
}

// ── Insérer un événement ──────────────────────────────────────────────────────
async function insertEvenement(evt) {
  await pool.query(
    `INSERT INTO evenements (type, saga_id, vehicule_id, conducteur_id, latitude, longitude, reason, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      evt.type         || "UNKNOWN",
      evt.saga_id      || null,
      evt.vehicule_id  || evt.vehiculeId  || null,
      evt.conducteur_id|| evt.conducteurId|| null,
      evt.latitude     ?? null,
      evt.longitude    ?? null,
      evt.reason       || null,
      evt.timestamp    || new Date().toISOString(),
    ]
  );
}

// ── Kafka consumer ────────────────────────────────────────────────────────────
async function startKafkaConsumer() {
  const kafka    = new Kafka({ clientId: "service-evenements", brokers: [process.env.KAFKA_BROKER || "kafka:9092"] });
  const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || "service-evenements-group" });

  await consumer.connect();
  await consumer.subscribe({ topic: "geofence.alerts",  fromBeginning: true });
  await consumer.subscribe({ topic: "vehicules.events", fromBeginning: true });
  await consumer.subscribe({ topic: "conducteurs.events", fromBeginning: true });
  await consumer.subscribe({ topic: "maintenance.events", fromBeginning: true });

  console.log("[evenements] Kafka consumer connecté");

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        await insertEvenement(payload);
        console.log("[evenements] stocké", { topic, type: payload.type });
      } catch (err) {
        console.error("[evenements] erreur insertion:", err.message);
      }
    },
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "evenements", db: "ok" });
  } catch {
    res.status(500).json({ status: "ko", service: "evenements", db: "ko" });
  }
});

app.get("/evenements", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, type, saga_id, vehicule_id, conducteur_id, latitude, longitude, reason, timestamp
       FROM evenements ORDER BY id DESC LIMIT 200`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lecture événements" });
  }
});

app.get("/evenements/vehicule/:vehiculeId", async (req, res) => {
  const vehiculeId = Number(req.params.vehiculeId);
  if (!Number.isFinite(vehiculeId)) return res.status(400).json({ error: "vehiculeId invalide" });
  try {
    const r = await pool.query(
      `SELECT * FROM evenements WHERE vehicule_id = $1 ORDER BY id DESC`, [vehiculeId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lecture événements véhicule" });
  }
});

app.get("/evenements/saga/:sagaId", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM evenements WHERE saga_id = $1 ORDER BY id ASC`, [req.params.sagaId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lecture événements saga" });
  }
});

// ── Démarrage propre ──────────────────────────────────────────────────────────
async function main() {
  await waitForDb();   // 1. attendre la DB
  await initDb();      // 2. créer la table si elle n'existe pas
  app.listen(PORT, () => console.log(`[evenements] http://localhost:${PORT}`));
  try {
    await startKafkaConsumer(); // 3. démarrer Kafka
  } catch (err) {
    console.error("[evenements] Kafka non démarré (mode dégradé):", err.message);
  }
}

main().catch(err => { console.error("Erreur démarrage:", err); process.exit(1); });
