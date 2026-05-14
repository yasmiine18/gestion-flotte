CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS positions_gps (
  vehicule_id BIGINT             NOT NULL,
  latitude    DOUBLE PRECISION   NOT NULL,
  longitude   DOUBLE PRECISION   NOT NULL,
  vitesse     DOUBLE PRECISION,
  timestamp   TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Hypertable TimescaleDB (partitionnement automatique par temps)
SELECT create_hypertable('positions_gps', 'timestamp', if_not_exists => TRUE);

-- Index composite pour les requêtes par véhicule + temps
CREATE INDEX IF NOT EXISTS idx_positions_vehicule_time
  ON positions_gps (vehicule_id, timestamp DESC);

-- Politique de rétention 12 mois (ADR-002)
SELECT add_retention_policy('positions_gps', INTERVAL '12 months', if_not_exists => TRUE);

-- Zones de géofencing
CREATE TABLE IF NOT EXISTS zones (
  id      BIGSERIAL PRIMARY KEY,
  nom     TEXT             NOT NULL UNIQUE,
  min_lat DOUBLE PRECISION NOT NULL,
  max_lat DOUBLE PRECISION NOT NULL,
  min_lon DOUBLE PRECISION NOT NULL,
  max_lon DOUBLE PRECISION NOT NULL,
  active  BOOLEAN          NOT NULL DEFAULT TRUE
);

INSERT INTO zones (nom, min_lat, max_lat, min_lon, max_lon)
VALUES ('Zone Rouen centre', 49.40, 49.55, 0.05, 0.25)
ON CONFLICT (nom) DO NOTHING;
