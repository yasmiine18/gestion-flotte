CREATE TABLE IF NOT EXISTS maintenances (
  id BIGSERIAL PRIMARY KEY,
  vehicule_id BIGINT NOT NULL,
  type VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  cout NUMERIC(10,2),
  commentaire TEXT
);