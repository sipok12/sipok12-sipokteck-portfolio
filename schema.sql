-- Schéma SIPOKTECH DIGITAL — PostgreSQL (Supabase, Neon ou autre).
-- Idempotent : exécuté à chaque démarrage, sans risque pour les données existantes.

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  url TEXT,
  icon VARCHAR(20) NOT NULL DEFAULT '💻',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  demo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  subject VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'nouveau'
    CHECK (status IN ('nouveau', 'lu', 'traité')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prestations et prix de départ (modifiables depuis l'administration).
CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(60) NOT NULL UNIQUE,
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(300) NOT NULL,
  details TEXT NOT NULL DEFAULT '',          -- un point par ligne
  icon VARCHAR(20) NOT NULL DEFAULT '◆',
  starting_price INTEGER CHECK (starting_price IS NULL OR starting_price >= 0), -- en FCFA, NULL = « sur devis »
  price_unit VARCHAR(40) NOT NULL DEFAULT '',  -- ex. « / mois »
  conditions TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Demandes de devis envoyées depuis le site.
CREATE TABLE IF NOT EXISTS quotes (
  id BIGSERIAL PRIMARY KEY,
  service_title VARCHAR(120) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  company VARCHAR(120) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  budget VARCHAR(60) NOT NULL,
  deadline VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'nouveau'
    CHECK (status IN ('nouveau', 'en cours', 'devis envoyé', 'accepté', 'refusé')),
  notes TEXT NOT NULL DEFAULT '',
  email_notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  company VARCHAR(120) NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Témoignages : rien n'est affiché publiquement tant qu'il n'est pas publié.
CREATE TABLE IF NOT EXISTS testimonials (
  id BIGSERIAL PRIMARY KEY,
  author VARCHAR(100) NOT NULL,
  role VARCHAR(120) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrations pour les tables créées par une version précédente du projet.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'General';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon VARCHAR(20) NOT NULL DEFAULT 'web';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS demo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- Nouveautés SIPOKTECH DIGITAL : technologies, image, code source (le lien « url » reste le lien de démonstration).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technologies VARCHAR(300) NOT NULL DEFAULT '';
-- Anciennes bases : « technologies » y était un tableau (text[]). On le convertit en texte « A, B, C » sans perdre de données.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'projects'
      AND column_name = 'technologies' AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE projects ALTER COLUMN technologies DROP DEFAULT;
    ALTER TABLE projects ALTER COLUMN technologies TYPE VARCHAR(300)
      USING COALESCE(array_to_string(technologies, ', '), '');
    ALTER TABLE projects ALTER COLUMN technologies SET DEFAULT '';
    ALTER TABLE projects ALTER COLUMN technologies SET NOT NULL;
  END IF;
END $$;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS subject VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'nouveau';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS projects_created_at_idx ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS messages_status_idx ON messages (status);
CREATE INDEX IF NOT EXISTS services_position_idx ON services (position, id);
CREATE INDEX IF NOT EXISTS quotes_created_at_idx ON quotes (created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_status_idx ON quotes (status);
CREATE INDEX IF NOT EXISTS testimonials_published_idx ON testimonials (published, created_at DESC);
