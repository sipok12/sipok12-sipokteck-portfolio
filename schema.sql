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
ALTER TABLE services ADD COLUMN IF NOT EXISTS price_max INTEGER CHECK (price_max IS NULL OR price_max >= 0); -- fourchette : prix maximum (facultatif)

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

-- =====================================================================
-- Version 3 : administration complète (Supabase Auth, Storage, historique)
-- =====================================================================

-- Projets : brouillon / publié, date de réalisation, galerie d'images (liste d'URL).
-- image_url reste l'image de couverture ; les projets existants restent publiés.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS realized_on DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status, created_at DESC);

-- Services : image facultative (en plus de l'icône).
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Demandes : nouveaux statuts (nouveau, en discussion, devis envoyé, en cours, terminé, annulé).
-- Conversion des anciennes valeurs : accepté -> en cours, refusé -> annulé.
DO $$
DECLARE c RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'quotes'::regclass AND conname = 'quotes_status_check'
      AND pg_get_constraintdef(oid) LIKE '%en discussion%'
  ) THEN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'quotes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'
    LOOP
      EXECUTE format('ALTER TABLE quotes DROP CONSTRAINT %I', c.conname);
    END LOOP;
    UPDATE quotes SET status = 'en cours' WHERE status = 'accepté';
    UPDATE quotes SET status = 'annulé' WHERE status = 'refusé';
    ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
      CHECK (status IN ('nouveau', 'en discussion', 'devis envoyé', 'en cours', 'terminé', 'annulé'));
  END IF;
END $$;

-- Administrateurs autorisés. La connexion se fait avec Supabase Auth ; ce tableau est la liste blanche :
-- un compte Supabase qui n'y figure pas n'a AUCUN accès à /admin (le projet Supabase peut servir à d'autres applications).
CREATE TABLE IF NOT EXISTS admin_profiles (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL DEFAULT 'Administrateur',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Informations générales du site (slogan, contacts, réseaux sociaux, textes). Une ligne par réglage.
CREATE TABLE IF NOT EXISTS site_settings (
  key VARCHAR(60) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historique des actions de l'administration (jamais de mot de passe ni de secret).
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  admin_email VARCHAR(254) NOT NULL DEFAULT '',
  action VARCHAR(30) NOT NULL,
  entity VARCHAR(30) NOT NULL DEFAULT '',
  entity_id BIGINT,
  summary VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at DESC);

-- ---------------------------------------------------------------------
-- Row Level Security. Le serveur Node se connecte avec le rôle propriétaire (il n'est pas soumis à RLS).
-- RLS protège donc l'API REST de Supabase : sans politique, une table est inaccessible avec la clé publique.
-- ---------------------------------------------------------------------
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Lecture publique limitée au contenu déjà visible sur le site (rôles propres à Supabase).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS "Public can read portfolio projects" ON projects;
    DROP POLICY IF EXISTS "Public reads published projects" ON projects;
    CREATE POLICY "Public reads published projects" ON projects FOR SELECT TO anon, authenticated USING (status = 'published');
    DROP POLICY IF EXISTS "Public can read active services" ON services;
    DROP POLICY IF EXISTS "Public reads active services" ON services;
    CREATE POLICY "Public reads active services" ON services FOR SELECT TO anon, authenticated USING (active = true);
    DROP POLICY IF EXISTS "Public can read published testimonials" ON testimonials;
    DROP POLICY IF EXISTS "Public reads published testimonials" ON testimonials;
    CREATE POLICY "Public reads published testimonials" ON testimonials FOR SELECT TO anon, authenticated USING (published = true);
  END IF;
END $$;
-- quotes, clients, messages, admins, admin_profiles, site_settings, activity_log : aucune politique = inaccessibles via l'API REST.

-- =====================================================================
-- Version 4 : site bilingue FR/EN, formules tarifaires, témoignages enrichis
-- Migration NON destructive : uniquement des colonnes / tables ajoutées, aucune donnée existante modifiée.
-- Les colonnes *_en sont facultatives : si elles sont vides, le texte français est affiché.
-- =====================================================================

-- Services : traductions anglaises, avantages, technologies.
ALTER TABLE services ADD COLUMN IF NOT EXISTS title_en VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS summary_en VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS details_en TEXT NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS advantages TEXT NOT NULL DEFAULT '';      -- un point par ligne
ALTER TABLE services ADD COLUMN IF NOT EXISTS advantages_en TEXT NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS technologies VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS conditions_en TEXT NOT NULL DEFAULT '';

-- Projets : type (filtres du portfolio), fonctionnalités, traductions.
-- « kind » : website | business | landing | portfolio | other. Les projets existants sont classés selon leur catégorie.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = 'kind') THEN
    ALTER TABLE projects ADD COLUMN kind VARCHAR(12) NOT NULL DEFAULT 'website'
      CHECK (kind IN ('website', 'business', 'landing', 'portfolio', 'other'));
    UPDATE projects SET kind = 'portfolio' WHERE category ILIKE '%portfolio%';
    UPDATE projects SET kind = 'business' WHERE kind = 'website' AND (category ILIKE '%commerce%' OR category ILIKE '%boutique%' OR category ILIKE '%business%' OR category ILIKE '%entreprise%');
    UPDATE projects SET kind = 'landing' WHERE kind = 'website' AND (category ILIKE '%landing%');
  END IF;
END $$;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS category_en VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description_en TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS features TEXT NOT NULL DEFAULT '';         -- fonctionnalités principales, une par ligne
ALTER TABLE projects ADD COLUMN IF NOT EXISTS features_en TEXT NOT NULL DEFAULT '';

-- Témoignages : note facultative, date, photo (affichée seulement avec autorisation), version anglaise.
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS content_en TEXT NOT NULL DEFAULT '';
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS testimonial_date DATE;
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS photo_consent BOOLEAN NOT NULL DEFAULT FALSE;

-- Formules tarifaires indicatives (STARTER / BUSINESS / PREMIUM), modifiables depuis l'administration.
CREATE TABLE IF NOT EXISTS pricing_plans (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(60) NOT NULL,
  name_en VARCHAR(60) NOT NULL DEFAULT '',
  tagline VARCHAR(200) NOT NULL DEFAULT '',
  tagline_en VARCHAR(200) NOT NULL DEFAULT '',
  price_min INTEGER CHECK (price_min IS NULL OR price_min >= 0),   -- FCFA ; NULL = « sur devis »
  price_max INTEGER CHECK (price_max IS NULL OR price_max >= 0),
  price_unit VARCHAR(40) NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '',                               -- une fonctionnalité par ligne
  features_en TEXT NOT NULL DEFAULT '',
  service_slug VARCHAR(60) NOT NULL DEFAULT '',                    -- prestation présélectionnée dans le formulaire de devis
  highlighted BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS "Public reads active pricing plans" ON pricing_plans;
    CREATE POLICY "Public reads active pricing plans" ON pricing_plans FOR SELECT TO anon, authenticated USING (active = true);
    -- Les témoignages publiés restent lisibles ; la photo n'est servie par l'API du site qu'avec autorisation.
  END IF;
END $$;
