require("dotenv").config();

const { verifierToken, verifierRole } = require("./auth-keycloak");

const { Kafka } = require("kafkajs");
const express   = require("express");
const cors      = require("cors");
const jwt       = require("jsonwebtoken");
const { Pool }  = require("pg");
const fs        = require("fs");
const path      = require("path");

const PORT       = process.env.PORT || 8084;
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host:     process.env.DB_HOST     || "postgres",
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USER     || "flotte",
  password: process.env.DB_PASSWORD || "flotte",
  database: process.env.DB_NAME     || "maintenance_db",
});

// ── Kafka ─────────────────────────────────────────────────────────────────────
const kafkaEnabled  = (process.env.KAFKA_ENABLED || "false") === "true";
let   kafkaProducer = null;

async function initKafka() {
  if (!kafkaEnabled) { console.log("[maintenance] Kafka désactivé"); return; }
  const kafka  = new Kafka({ clientId: "service-maintenance", brokers: [process.env.KAFKA_BROKER || "kafka:9092"] });
  kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  console.log("[maintenance] Kafka producer connecté");
}

async function publierEvenement(payload) {
  if (!kafkaEnabled || !kafkaProducer) { console.log("[KAFKA_DISABLED]", JSON.stringify(payload)); return; }
  await kafkaProducer.send({
    topic:    process.env.KAFKA_TOPIC || "maintenance.events",
    messages: [{ value: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }) }],
  });
}


// ── DB ────────────────────────────────────────────────────────────────────────
async function waitForDb(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try { await pool.query("SELECT 1"); console.log("[maintenance] DB connectée"); return; }
    catch {
      console.log(`[maintenance] DB non prête (${i}/${retries})`);
      if (i === retries) throw new Error("DB inaccessible");
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, "db-init.sql"), "utf8");
  await pool.query(sql);
  console.log("[maintenance] schéma prêt");
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", service: "maintenance", db: "ok" }); }
  catch { res.status(500).json({ status: "ko", service: "maintenance", db: "ko" }); }
});

app.post("/login", (_req, res) => {
  res.json({ token: jwt.sign({ user: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "1h" }) });
});

app.get("/maintenances", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM maintenances ORDER BY id DESC");
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur lecture maintenances" }); }
});

app.get("/maintenances/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const r = await pool.query("SELECT * FROM maintenances WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Maintenance introuvable" });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur lecture maintenance" }); }
});

app.get("/maintenances/vehicule/:vehiculeId", async (req, res) => {
  const vehiculeId = Number(req.params.vehiculeId);
  if (!Number.isFinite(vehiculeId)) return res.status(400).json({ error: "vehiculeId invalide" });
  try {
    const r = await pool.query("SELECT * FROM maintenances WHERE vehicule_id = $1 ORDER BY id DESC", [vehiculeId]);
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur lecture maintenances véhicule" }); }
});

app.post("/maintenances", verifierToken, verifierRole("admin", "gestionnaire", "technicien"), async (req, res) => {
  const { vehicule_id, type, date, cout, commentaire } = req.body;
  if (!vehicule_id || !type || !date)
    return res.status(400).json({ error: "vehicule_id, type et date sont obligatoires" });
  if (cout !== undefined && cout !== null && Number(cout) < 0)
    return res.status(400).json({ error: "Le coût ne peut pas être négatif" });
  try {
    const r = await pool.query(
      "INSERT INTO maintenances (vehicule_id, type, date, cout, commentaire) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [vehicule_id, type, date, cout ?? null, commentaire ?? null]
    );
    await publierEvenement({ type: "MAINTENANCE_CREATED", maintenance_id: r.rows[0].id, vehicule_id, type_maintenance: type });
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur création maintenance" }); }
});

app.put("/maintenances/:id", verifierToken, verifierRole("admin", "gestionnaire", "technicien"), async (req, res) => {
  const id = Number(req.params.id);
  const { type, date, cout, commentaire } = req.body;
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  if (cout !== undefined && cout !== null && Number(cout) < 0)
    return res.status(400).json({ error: "Le coût ne peut pas être négatif" });
  try {
    const r = await pool.query(
      `UPDATE maintenances
       SET type        = COALESCE($1, type),
           date        = COALESCE($2, date),
           cout        = COALESCE($3, cout),
           commentaire = COALESCE($4, commentaire)
       WHERE id = $5 RETURNING *`,
      [type || null, date || null, cout ?? null, commentaire ?? null, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Maintenance introuvable" });
    await publierEvenement({ type: "MAINTENANCE_UPDATED", maintenance_id: id });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur mise à jour maintenance" }); }
});

app.delete("/maintenances/:id", verifierToken, verifierRole("admin", "gestionnaire", "technicien"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const r = await pool.query("DELETE FROM maintenances WHERE id=$1 RETURNING id", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Maintenance introuvable" });
    await publierEvenement({ type: "MAINTENANCE_DELETED", maintenance_id: id });
    res.json({ message: "Maintenance supprimée", id });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur suppression maintenance" }); }
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
async function main() {
  await waitForDb();
  await initDb();
  await initKafka();
  app.listen(PORT, () => console.log(`[maintenance] http://localhost:${PORT}`));
}
main().catch(err => { console.error("Erreur démarrage:", err); process.exit(1); });
