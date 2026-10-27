-- Finture Radar · fase 2 · Postgres gerenciado com PostGIS (Neon ou Supabase).
-- Rodar DEPOIS das migrações do Drizzle (npm run db:migrate). Não roda no PGlite.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography END
  ) STORED;

CREATE INDEX IF NOT EXISTS companies_geom_gist ON companies USING GIST (geom);

-- Consulta por viewport (bbox do mapa), para trocar o envio de todos os pontos pelo recorte visível:
-- SELECT id, score FROM companies
--  WHERE geom && ST_MakeEnvelope(:w, :s, :e, :n, 4326)::geography;

-- Perímetro desenhado pelo usuário (fase 2):
-- SELECT id FROM companies WHERE ST_Intersects(geom, ST_GeomFromGeoJSON(:polygon)::geography);

-- Scores persistidos por organização e versão de pesos (substitui o cache em memória):
CREATE TABLE IF NOT EXISTS company_scores (
  org_id text NOT NULL REFERENCES organizations(id),
  company_id integer NOT NULL REFERENCES companies(id),
  config_version integer NOT NULL,
  geral smallint NOT NULL,
  saude smallint NOT NULL,
  seguro smallint NOT NULL,
  credito smallint NOT NULL,
  parceria smallint NOT NULL,
  confidence text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, company_id, config_version)
);
CREATE INDEX IF NOT EXISTS company_scores_rank ON company_scores (org_id, config_version, geral DESC);

-- Isolamento por organização no próprio banco (defesa em profundidade além do filtro na aplicação):
-- ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY org_isolation ON opportunities USING (org_id = current_setting('app.org_id'));
-- (repetir para lists, list_items via lists, saved_searches, activities, tasks, company_status,
--  suppressions, score_configs, audit_events; a app faz SET LOCAL app.org_id em cada transação)
