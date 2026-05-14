require("dotenv").config();

const { verifierToken, verifierRole } = require("./auth-keycloak");

const { Kafka } = require("kafkajs");
const express   = require("express");
const cors      = require("cors");
const { Pool }  = require("pg");
const jwt       = require("jsonwebtoken");
const fs        = require("fs");
const path      = require("path");


const SECRET = process.env.JWT_SECRET || "secret123";
const PORT   = process.env.PORT || 8082;

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host:     process.env.DB_HOST     || "postgres",
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USER     || "flotte",
  password: process.env.DB_PASSWORD || "flotte",
  database: process.env.DB_NAME     || "conducteurs_db",
});

const PERMIS_VALIDES = ["A", "B", "C", "D", "BE", "CE", "DE"];

// ── Kafka ─────────────────────────────────────────────────────────────────────
const kafkaEnabled  = (process.env.KAFKA_ENABLED || "false") === "true";
let   kafkaProducer = null;

async function initKafka() {
  if (!kafkaEnabled) { console.log("[conducteurs] Kafka désactivé"); return; }
  const kafka  = new Kafka({ clientId: "service-conducteurs", brokers: [process.env.KAFKA_BROKER || "kafka:9092"] });
  kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  console.log("[conducteurs] Kafka producer connecté");
}

async function publierEvenement(payload) {
  if (!kafkaEnabled || !kafkaProducer) { console.log("[KAFKA_DISABLED]", JSON.stringify(payload)); return; }
  await kafkaProducer.send({
    topic:    process.env.KAFKA_TOPIC || "conducteurs.events",
    messages: [{ value: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }) }],
  });
}



// ── DB ────────────────────────────────────────────────────────────────────────
async function waitForDb(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try { await pool.query("SELECT 1"); console.log("[conducteurs] DB connectée"); return; }
    catch {
      console.log(`[conducteurs] DB non prête (${i}/${retries})`);
      if (i === retries) throw new Error("DB inaccessible");
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, "db-init.sql"), "utf8");
  await pool.query(sql);
  console.log("[conducteurs] schéma prêt");
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", service: "conducteurs", db: "ok" }); }
  catch { res.status(500).json({ status: "ko", service: "conducteurs", db: "ko" }); }
});

app.post("/login", (_req, res) => {
  res.json({ token: jwt.sign({ user: "admin", role: "admin" }, SECRET, { expiresIn: "1h" }) });
});

app.get("/conducteurs", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM conducteurs ORDER BY id DESC");
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur lecture conducteurs" }); }
});

app.get("/conducteurs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const r = await pool.query("SELECT * FROM conducteurs WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Conducteur introuvable" });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur lecture conducteur" }); }
});

app.get("/conducteurs/:id/vehicules", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const base     = process.env.SERVICE_VEHICULES_URL || "http://service-vehicules:8081";
    const response = await fetch(`${base}/vehicules`);
    if (!response.ok) return res.status(500).json({ error: "Erreur service vehicules" });
    const vehicules = await response.json();
    res.json(vehicules.filter(v => Number(v.conducteur_id) === id));
  } catch { res.status(500).json({ error: "Erreur assignations conducteur" }); }
});

app.post("/conducteurs", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const { nom, prenom, permis } = req.body ?? {};
  if (!nom || !prenom || !permis)
    return res.status(400).json({ error: "nom, prenom, permis sont obligatoires" });
  if (!PERMIS_VALIDES.includes(String(permis).toUpperCase()))
    return res.status(400).json({ error: `Permis invalide. Valeurs autorisées : ${PERMIS_VALIDES.join(", ")}` });
  try {
    const r = await pool.query(
      "INSERT INTO conducteurs (nom, prenom, permis) VALUES ($1, $2, $3) RETURNING *",
      [nom, prenom, String(permis).toUpperCase()]
    );
    await publierEvenement({ type: "CONDUCTEUR_CREATED", conducteur_id: r.rows[0].id, nom, prenom });
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur insertion conducteur" }); }
});

app.put("/conducteurs/:id", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const id = Number(req.params.id);
  const { nom, prenom, permis } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  if (!nom || !prenom || !permis) return res.status(400).json({ error: "nom, prenom, permis obligatoires" });
  if (!PERMIS_VALIDES.includes(String(permis).toUpperCase()))
    return res.status(400).json({ error: `Permis invalide. Valeurs autorisées : ${PERMIS_VALIDES.join(", ")}` });
  try {
    const r = await pool.query(
      "UPDATE conducteurs SET nom=$1, prenom=$2, permis=$3 WHERE id=$4 RETURNING *",
      [nom, prenom, String(permis).toUpperCase(), id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Conducteur introuvable" });
    await publierEvenement({ type: "CONDUCTEUR_UPDATED", conducteur_id: id });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur modification conducteur" }); }
});

app.delete("/conducteurs/:id", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const r = await pool.query("DELETE FROM conducteurs WHERE id=$1 RETURNING id", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Conducteur introuvable" });
    await publierEvenement({ type: "CONDUCTEUR_DELETED", conducteur_id: id });
    res.json({ message: "Conducteur supprimé", id });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur suppression conducteur" }); }
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
async function main() {
  await waitForDb();
  await initDb();
  await initKafka();
  app.listen(PORT, () => console.log(`[conducteurs] http://localhost:${PORT}`));
}
main().catch(err => { console.error("Erreur démarrage:", err); process.exit(1); });
