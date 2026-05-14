require("dotenv").config();


const sdk = require("./otel");
try {
  sdk.start();
  console.log("[vehicules] OpenTelemetry démarré");
} catch (err) {
  console.error("[vehicules] Erreur OpenTelemetry:", err);
}

const { Kafka }   = require("kafkajs");
const express     = require("express");
const cors        = require("cors");
const { Pool }    = require("pg");
const jwt         = require("jsonwebtoken");
const fs          = require("fs");
const path        = require("path");
const { metrics } = require("@opentelemetry/api");
const { verifierToken, verifierRole } = require("./auth-keycloak");

const SECRET = process.env.JWT_SECRET || "secret123";
const PORT   = process.env.PORT || 8081;

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host:     process.env.DB_HOST     || "postgres",
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USER     || "flotte",
  password: process.env.DB_PASSWORD || "flotte",
  database: process.env.DB_NAME     || "vehicules_db",
});

// ── Métriques OpenTelemetry ──────────────────────────────────────────────────
const meter = metrics.getMeter("service-vehicules");
const vehiculesCreesCounter  = meter.createCounter("vehicules_crees_total",  { description: "Nombre total de véhicules créés" });
const affectationsCounter    = meter.createCounter("vehicules_affectations_total", { description: "Nombre total d'affectations" });

// ── Kafka (déclaré UNE SEULE FOIS) ──────────────────────────────────────────
const kafkaEnabled  = (process.env.KAFKA_ENABLED || "false") === "true";
let   kafkaProducer = null;

async function initKafka() {
  if (!kafkaEnabled) {
    console.log("[vehicules] Kafka désactivé");
    return;
  }
  const kafka  = new Kafka({ clientId: "service-vehicules", brokers: [process.env.KAFKA_BROKER] });
  kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  console.log("[vehicules] Kafka producer connecté");
}

async function publierEvenement(payload) {
  if (!kafkaEnabled || !kafkaProducer) {
    console.log("[KAFKA_DISABLED]", JSON.stringify(payload));
    return;
  }
  await kafkaProducer.send({
    topic:    process.env.KAFKA_TOPIC || "vehicules.events",
    messages: [{ value: JSON.stringify(payload) }],
  });
}



// ── DB ───────────────────────────────────────────────────────────────────────
async function waitForDb(retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("[vehicules] DB connectée");
      return;
    } catch {
      console.log(`[vehicules] DB non prête (${i}/${retries})`);
      if (i === retries) throw new Error("DB inaccessible après " + retries + " tentatives");
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, "db-init.sql"), "utf8");
  await pool.query(sql);
  console.log("[vehicules] schéma prêt");
}

// ── Helpers inter-services ───────────────────────────────────────────────────
async function conducteurExiste(id) {
  const base = process.env.SERVICE_CONDUCTEURS_URL || "http://service-conducteurs:8082";
  try {
    const res = await fetch(`${base}/conducteurs/${id}`);
    return res.ok;
  } catch { return false; }
}

async function enrichirAvecConducteur(vehicule) {
  if (!vehicule.conducteur_id) return vehicule;
  const base = process.env.SERVICE_CONDUCTEURS_URL || "http://service-conducteurs:8082";
  try {
    const res = await fetch(`${base}/conducteurs/${vehicule.conducteur_id}`);
    if (!res.ok) return vehicule;
    return { ...vehicule, conducteur: await res.json() };
  } catch { return vehicule; }
}

function genererSagaId(prefix = "saga") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function logJson(obj) {
  console.log(JSON.stringify({ ...obj, timestamp: new Date().toISOString() }));
}

// ── Routes ───────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "vehicules", db: "ok" });
  } catch {
    res.status(500).json({ status: "ko", service: "vehicules", db: "ko" });
  }
});

app.post("/login", (_req, res) => {
  const token = jwt.sign({ user: "admin", role: "admin" }, SECRET, { expiresIn: "1h" });
  res.json({ token });
});

app.get("/vehicules", async (_req, res) => {
  try {
    const result   = await pool.query("SELECT * FROM vehicules ORDER BY id DESC");
    const vehicules = await Promise.all(result.rows.map(v => enrichirAvecConducteur(v)));
    res.json(vehicules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lecture vehicules" });
  }
});

app.get("/vehicules/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const result = await pool.query("SELECT * FROM vehicules WHERE id = $1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Véhicule introuvable" });
    res.json(await enrichirAvecConducteur(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lecture véhicule" });
  }
});

app.post("/vehicules", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const { immatriculation, marque, dispo } = req.body ?? {};
  if (!immatriculation || !marque)
    return res.status(400).json({ error: "immatriculation et marque sont obligatoires" });

  try {
    const result = await pool.query(
      "INSERT INTO vehicules (immatriculation, marque, dispo) VALUES ($1, $2, $3) RETURNING *",
      [immatriculation, marque, dispo ?? true]
    );
    const v = result.rows[0];
    await publierEvenement({ type: "VEHICULE_CREATED", vehicule_id: v.id, immatriculation: v.immatriculation, marque: v.marque });
    vehiculesCreesCounter.add(1);
    logJson({ level: "info", service: "service-vehicules", action: "vehicule_created", vehicule_id: v.id });
    res.status(201).json(v);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur insertion vehicule" });
  }
});

app.put("/vehicules/:id", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const id = Number(req.params.id);
  const { immatriculation, marque, dispo } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const result = await pool.query(
      `UPDATE vehicules
       SET immatriculation = COALESCE($1, immatriculation),
           marque          = COALESCE($2, marque),
           dispo           = COALESCE($3, dispo)
       WHERE id = $4 RETURNING *`,
      [immatriculation || null, marque || null, dispo ?? null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Véhicule introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur modification vehicule" });
  }
});

app.delete("/vehicules/:id", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
  try {
    const result = await pool.query("DELETE FROM vehicules WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Véhicule introuvable" });
    await publierEvenement({ type: "VEHICULE_DELETED", vehicule_id: id });
    res.json({ message: "Véhicule supprimé", id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur suppression vehicule" });
  }
});

app.post("/vehicules/:vehiculeId/assigner/:conducteurId", verifierToken, verifierRole("admin", "gestionnaire"), async (req, res) => {
  const vehiculeId   = Number(req.params.vehiculeId);
  const conducteurId = Number(req.params.conducteurId);
  const sagaId       = genererSagaId("vehicule-assignment");

  if (!Number.isFinite(vehiculeId) || !Number.isFinite(conducteurId))
    return res.status(400).json({ error: "ids invalides" });

  await publierEvenement({ type: "VEHICULE_ASSIGNMENT_STARTED", saga_id: sagaId, vehicule_id: vehiculeId, conducteur_id: conducteurId });

  const existe = await conducteurExiste(conducteurId);
  if (!existe) {
    await publierEvenement({ type: "VEHICULE_ASSIGNMENT_FAILED", saga_id: sagaId, vehicule_id: vehiculeId, conducteur_id: conducteurId, reason: "Conducteur introuvable" });
    return res.status(404).json({ error: "Conducteur introuvable" });
  }

  try {
    const result = await pool.query(
      "UPDATE vehicules SET conducteur_id = $1 WHERE id = $2 RETURNING *",
      [conducteurId, vehiculeId]
    );
    if (result.rowCount === 0) {
      await publierEvenement({ type: "VEHICULE_ASSIGNMENT_FAILED", saga_id: sagaId, vehicule_id: vehiculeId, conducteur_id: conducteurId, reason: "Véhicule introuvable" });
      return res.status(404).json({ error: "Véhicule introuvable" });
    }
    await publierEvenement({ type: "VEHICULE_ASSIGNED", saga_id: sagaId, vehicule_id: vehiculeId, conducteur_id: conducteurId });
    affectationsCounter.add(1);
    logJson({ level: "info", service: "service-vehicules", action: "vehicule_assigned", saga_id: sagaId, vehicule_id: vehiculeId, conducteur_id: conducteurId });
    res.json({ message: "Assignation ok", saga_id: sagaId, vehicule: result.rows[0] });
  } catch (err) {
    await publierEvenement({ type: "VEHICULE_ASSIGNMENT_FAILED", saga_id: sagaId, vehicule_id: vehiculeId, conducteur_id: conducteurId, reason: "Erreur SQL" });
    console.error(err);
    res.status(500).json({ error: "Erreur assignation" });
  }
});

// ── Démarrage ────────────────────────────────────────────────────────────────
async function main() {
  await waitForDb();
  await initDb();
  await initKafka();
  app.listen(PORT, () => console.log(`[vehicules] http://localhost:${PORT}`));
}

main().catch(err => { console.error("Erreur démarrage:", err); process.exit(1); });
