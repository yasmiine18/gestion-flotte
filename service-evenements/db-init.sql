CREATE TABLE IF NOT EXISTS evenements (
  id           BIGSERIAL PRIMARY KEY,
  type         VARCHAR(100)       NOT NULL,
  saga_id      VARCHAR(100),
  vehicule_id  BIGINT,
  conducteur_id BIGINT,
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  reason       TEXT,
  timestamp    TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evenements_type      ON evenements (type);
CREATE INDEX IF NOT EXISTS idx_evenements_vehicule  ON evenements (vehicule_id);
CREATE INDEX IF NOT EXISTS idx_evenements_saga      ON evenements (saga_id);
CREATE INDEX IF NOT EXISTS idx_evenements_timestamp ON evenements (timestamp DESC);
