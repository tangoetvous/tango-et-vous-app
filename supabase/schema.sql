-- ================================================================
--  TANGO & VOUS — Schéma Supabase
--  À exécuter dans l'éditeur SQL de supabase.com
-- ================================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Fonction admin ─────────────────────────────────────────────
-- Mettre à jour cette liste si de nouveaux admins sont ajoutés
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(auth.email(), '') = ANY(ARRAY[
    'tangoetvous@gmail.com',
    'florencia@tangoetvous.com',
    'jeremy@tangoetvous.com'
  ]);
$$;

-- ================================================================
-- TABLE : eleves
-- Une ligne par élève. La carte de 10 cours active est intégrée.
-- ================================================================
CREATE TABLE IF NOT EXISTS eleves (
  id              TEXT PRIMARY KEY DEFAULT 'E' || to_char(nextval('eleve_id_seq'), 'FM000000'),
  nom             TEXT NOT NULL,
  prenom          TEXT NOT NULL DEFAULT '',
  email           TEXT UNIQUE NOT NULL,
  tel             TEXT NOT NULL DEFAULT '',
  niveau          TEXT NOT NULL DEFAULT 'debutant',   -- debutant | intermediaire | avance
  ville           TEXT NOT NULL DEFAULT 'paris',      -- paris | vincennes
  statut_eleve    TEXT NOT NULL DEFAULT 'En attente', -- Actif | En attente | Inactif | Suspendu
  source          TEXT NOT NULL DEFAULT 'manuel',     -- inscription | essai | stage | cours_particulier | manuel
  partenaire      TEXT NOT NULL DEFAULT '',
  email_partenaire TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  saison          TEXT NOT NULL DEFAULT '2025-2026',
  -- Carte de 10 cours active
  carte_date_achat   DATE,
  carte_expiration   DATE,
  carte_utilises     INTEGER NOT NULL DEFAULT 0,
  carte_restants     INTEGER NOT NULL DEFAULT 10,
  carte_statut       TEXT NOT NULL DEFAULT 'Nouvelle carte',
  carte_paye         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS eleve_id_seq START 1000;

-- ── Index ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS eleves_email_idx ON eleves (email);
CREATE INDEX IF NOT EXISTS eleves_statut_idx ON eleves (statut_eleve);
CREATE INDEX IF NOT EXISTS eleves_saison_idx ON eleves (saison);

-- ── Trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER eleves_updated_at
  BEFORE UPDATE ON eleves
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE eleves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eleves_select" ON eleves FOR SELECT
  USING (email = auth.email() OR is_admin());

CREATE POLICY "eleves_insert" ON eleves FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "eleves_update" ON eleves FOR UPDATE
  USING (email = auth.email() OR is_admin());

CREATE POLICY "eleves_delete" ON eleves FOR DELETE
  USING (is_admin());

-- ================================================================
-- TABLE : presences
-- Un enregistrement par cours pointé.
-- ================================================================
CREATE TABLE IF NOT EXISTS presences (
  id          BIGSERIAL PRIMARY KEY,
  eleve_id    TEXT NOT NULL,
  eleve_nom   TEXT NOT NULL DEFAULT '',
  date        DATE NOT NULL,
  niveau      TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS presences_eleve_idx ON presences (eleve_id);
CREATE INDEX IF NOT EXISTS presences_date_idx  ON presences (date);

ALTER TABLE presences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presences_select" ON presences FOR SELECT
  USING (
    is_admin()
    OR eleve_id = (SELECT id FROM eleves WHERE email = auth.email() LIMIT 1)
  );

CREATE POLICY "presences_insert" ON presences FOR INSERT
  WITH CHECK (
    is_admin()
    OR eleve_id = (SELECT id FROM eleves WHERE email = auth.email() LIMIT 1)
  );

CREATE POLICY "presences_update" ON presences FOR UPDATE
  USING (is_admin());

CREATE POLICY "presences_delete" ON presences FOR DELETE
  USING (is_admin());

-- ================================================================
-- TABLE : cours_particuliers
-- ================================================================
CREATE TABLE IF NOT EXISTS cours_particuliers (
  id          BIGSERIAL PRIMARY KEY,
  eleve_id    TEXT NOT NULL DEFAULT '',
  prenom      TEXT NOT NULL DEFAULT '',
  nom         TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  tel         TEXT NOT NULL DEFAULT '',
  niveau      TEXT NOT NULL DEFAULT '',
  professeur  TEXT NOT NULL DEFAULT '',
  duree       TEXT NOT NULL DEFAULT '',
  lieu        TEXT NOT NULL DEFAULT '',
  lieu_detail TEXT NOT NULL DEFAULT '',
  objectifs   TEXT NOT NULL DEFAULT '',
  remarque    TEXT NOT NULL DEFAULT '',
  dispos      TEXT NOT NULL DEFAULT '',
  urgence     TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'app',
  statut      TEXT NOT NULL DEFAULT 'Nouvelle',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cours_particuliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_select"  ON cours_particuliers FOR SELECT  USING (is_admin() OR email = auth.email());
CREATE POLICY "cp_insert"  ON cours_particuliers FOR INSERT  WITH CHECK (TRUE);
CREATE POLICY "cp_update"  ON cours_particuliers FOR UPDATE  USING (is_admin());
CREATE POLICY "cp_delete"  ON cours_particuliers FOR DELETE  USING (is_admin());

-- ================================================================
-- TABLE : inscriptions_cours  (cours tango réguliers)
-- ================================================================
CREATE TABLE IF NOT EXISTS inscriptions_cours (
  id                TEXT PRIMARY KEY DEFAULT 'INS' || floor(random()*900000+100000)::TEXT,
  eleve_id          TEXT NOT NULL DEFAULT '',
  nom               TEXT NOT NULL DEFAULT '',
  prenom            TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  tel               TEXT NOT NULL DEFAULT '',
  role              TEXT NOT NULL DEFAULT '',  -- guideur | guidee | double
  niveau            TEXT NOT NULL DEFAULT '',
  ville             TEXT NOT NULL DEFAULT '',
  cours             TEXT NOT NULL DEFAULT '',  -- paris—debutant | paris—intermediaire | …
  type              TEXT NOT NULL DEFAULT 'carte', -- carte10 | forfait | essai
  paiement          TEXT NOT NULL DEFAULT '',  -- cb1x | cb3x | especes | cheque | virement1x | virement3x
  montant           NUMERIC       DEFAULT 0,
  saison            TEXT NOT NULL DEFAULT '2025-2026',
  statut            TEXT NOT NULL DEFAULT 'inscrit', -- inscrit | supprimé | valide | attente | demande
  partenaire        TEXT NOT NULL DEFAULT '',
  email_partenaire  TEXT NOT NULL DEFAULT '',
  donnees           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inscriptions_cours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ins_cours_select" ON inscriptions_cours FOR SELECT USING (is_admin() OR email = auth.email());
CREATE POLICY "ins_cours_insert" ON inscriptions_cours FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "ins_cours_update" ON inscriptions_cours FOR UPDATE USING (is_admin());
CREATE POLICY "ins_cours_delete" ON inscriptions_cours FOR DELETE USING (is_admin());

-- ================================================================
-- TABLE : inscriptions_stages
-- ================================================================
CREATE TABLE IF NOT EXISTS inscriptions_stages (
  id                BIGSERIAL PRIMARY KEY,
  eleve_id          TEXT NOT NULL DEFAULT '',
  nom               TEXT NOT NULL DEFAULT '',
  prenom            TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  telephone         TEXT NOT NULL DEFAULT '',
  role              TEXT NOT NULL DEFAULT '',
  niveau            TEXT NOT NULL DEFAULT '',
  situation         TEXT NOT NULL DEFAULT '',
  partenaire        TEXT NOT NULL DEFAULT '',
  partenaire_email  TEXT NOT NULL DEFAULT '',
  stage_date        DATE,
  stage_nom         TEXT NOT NULL DEFAULT '',
  total_inscrit     NUMERIC DEFAULT 0,
  type_confirmation TEXT NOT NULL DEFAULT 'confirme',
  type              TEXT NOT NULL DEFAULT '',
  saison            TEXT NOT NULL DEFAULT '2025-2026',
  statut            TEXT NOT NULL DEFAULT 'inscrit',
  remarques         TEXT NOT NULL DEFAULT '',
  donnees           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inscriptions_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ins_stages_select" ON inscriptions_stages FOR SELECT USING (is_admin() OR email = auth.email());
CREATE POLICY "ins_stages_insert" ON inscriptions_stages FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "ins_stages_update" ON inscriptions_stages FOR UPDATE USING (is_admin());
CREATE POLICY "ins_stages_delete" ON inscriptions_stages FOR DELETE USING (is_admin());

-- ================================================================
-- TABLE : inscriptions_essai  (cours d'essai)
-- ================================================================
CREATE TABLE IF NOT EXISTS inscriptions_essai (
  id              BIGSERIAL PRIMARY KEY,
  prenom          TEXT NOT NULL DEFAULT '',
  nom             TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  tel             TEXT NOT NULL DEFAULT '',
  niveau          TEXT NOT NULL DEFAULT '',
  ville           TEXT NOT NULL DEFAULT '',
  date_essai      DATE,
  horaire         TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT '',   -- guideur | guidee_avec | guidee_sans
  niveau_eleve    TEXT NOT NULL DEFAULT '',
  avec_partenaire TEXT NOT NULL DEFAULT '',
  genre           TEXT NOT NULL DEFAULT '',
  part_prenom     TEXT NOT NULL DEFAULT '',
  part_nom        TEXT NOT NULL DEFAULT '',
  part_email      TEXT NOT NULL DEFAULT '',
  part_tel        TEXT NOT NULL DEFAULT '',
  part_role       TEXT NOT NULL DEFAULT '',
  partenaire      TEXT NOT NULL DEFAULT '',   -- legacy (partenaire nom complet)
  email_partenaire TEXT NOT NULL DEFAULT '',  -- legacy
  remarque        TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT 'tango', -- tango | yoga
  cours           TEXT NOT NULL DEFAULT '',   -- pour yoga : hatha | yin | forfait
  gratuit         BOOLEAN NOT NULL DEFAULT FALSE,
  statut          TEXT NOT NULL DEFAULT 'demande', -- demande | confirme | annule | converti
  presence_confirmee BOOLEAN NOT NULL DEFAULT FALSE,
  source          TEXT NOT NULL DEFAULT 'formulaire',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inscriptions_essai ENABLE ROW LEVEL SECURITY;

CREATE POLICY "essai_select" ON inscriptions_essai FOR SELECT USING (is_admin() OR email = auth.email());
CREATE POLICY "essai_insert" ON inscriptions_essai FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "essai_update" ON inscriptions_essai FOR UPDATE USING (is_admin());
CREATE POLICY "essai_delete" ON inscriptions_essai FOR DELETE USING (is_admin());

-- ================================================================
-- TABLE : publications
-- ================================================================
CREATE TABLE IF NOT EXISTS publications (
  id          TEXT PRIMARY KEY DEFAULT 'PUB' || floor(random()*900000+100000)::TEXT,
  titre       TEXT NOT NULL DEFAULT '',
  contenu     TEXT NOT NULL,
  publiee     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_select" ON publications FOR SELECT USING (publiee = TRUE OR is_admin());
CREATE POLICY "pub_insert" ON publications FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "pub_update" ON publications FOR UPDATE USING (is_admin());
CREATE POLICY "pub_delete" ON publications FOR DELETE USING (is_admin());

-- ================================================================
-- TABLE : discussions
-- ================================================================
CREATE TABLE IF NOT EXISTS discussions (
  id              TEXT PRIMARY KEY DEFAULT 'DISC' || floor(random()*900000+100000)::TEXT,
  titre           TEXT NOT NULL,
  eleve_email     TEXT NOT NULL,
  eleve_nom       TEXT NOT NULL DEFAULT '',
  fermee          BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disc_select" ON discussions FOR SELECT USING (is_admin() OR eleve_email = auth.email());
CREATE POLICY "disc_insert" ON discussions FOR INSERT WITH CHECK (eleve_email = auth.email() OR is_admin());
CREATE POLICY "disc_update" ON discussions FOR UPDATE USING (is_admin() OR eleve_email = auth.email());
CREATE POLICY "disc_delete" ON discussions FOR DELETE USING (is_admin());

-- ================================================================
-- TABLE : discussion_messages
-- ================================================================
CREATE TABLE IF NOT EXISTS discussion_messages (
  id              BIGSERIAL PRIMARY KEY,
  discussion_id   TEXT NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  auteur          TEXT NOT NULL,   -- 'eleve' | 'admin'
  auteur_email    TEXT NOT NULL DEFAULT '',
  contenu         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS disc_msg_disc_idx ON discussion_messages (discussion_id);

ALTER TABLE discussion_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disc_msg_select" ON discussion_messages FOR SELECT
  USING (
    is_admin()
    OR discussion_id IN (SELECT id FROM discussions WHERE eleve_email = auth.email())
  );

CREATE POLICY "disc_msg_insert" ON discussion_messages FOR INSERT
  WITH CHECK (
    is_admin()
    OR discussion_id IN (SELECT id FROM discussions WHERE eleve_email = auth.email())
  );

CREATE POLICY "disc_msg_delete" ON discussion_messages FOR DELETE USING (is_admin());

-- ================================================================
-- TABLE : agenda_modifs
-- Annulations / reports de cours ponctuels
-- ================================================================
CREATE TABLE IF NOT EXISTS agenda_modifs (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,   -- cours | milonga | stage
  date        DATE NOT NULL,
  action      TEXT NOT NULL,   -- annule | reporte | modif
  note        TEXT NOT NULL DEFAULT '',
  new_date    DATE,
  new_heure   TEXT NOT NULL DEFAULT '',
  new_lieu    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agenda_modifs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda_modifs_select" ON agenda_modifs FOR SELECT USING (TRUE);
CREATE POLICY "agenda_modifs_insert" ON agenda_modifs FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "agenda_modifs_update" ON agenda_modifs FOR UPDATE USING (is_admin());
CREATE POLICY "agenda_modifs_delete" ON agenda_modifs FOR DELETE USING (is_admin());

-- ================================================================
-- TABLE : parametres
-- Stockage clé/valeur pour la config admin (cours dates, milongas,
-- tarifs, liens AssoConnect, config saison, etc.)
-- ================================================================
CREATE TABLE IF NOT EXISTS parametres (
  cle         TEXT PRIMARY KEY,
  valeur      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE parametres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "params_select" ON parametres FOR SELECT USING (TRUE);
CREATE POLICY "params_insert" ON parametres FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "params_update" ON parametres FOR UPDATE USING (is_admin());
CREATE POLICY "params_delete" ON parametres FOR DELETE USING (is_admin());

-- ================================================================
-- Activer le real-time Supabase sur les tables clés
-- (permet de remplacer BroadcastChannel + localStorage)
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE eleves;
ALTER PUBLICATION supabase_realtime ADD TABLE presences;
ALTER PUBLICATION supabase_realtime ADD TABLE publications;
ALTER PUBLICATION supabase_realtime ADD TABLE discussions;
ALTER PUBLICATION supabase_realtime ADD TABLE discussion_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE agenda_modifs;
-- Formulaires publics (inserts déclenchent chargerDonnees() dans admin.html)
ALTER PUBLICATION supabase_realtime ADD TABLE inscriptions_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE inscriptions_essai;
ALTER PUBLICATION supabase_realtime ADD TABLE inscriptions_essai_yoga;
ALTER PUBLICATION supabase_realtime ADD TABLE cours_particuliers;
ALTER PUBLICATION supabase_realtime ADD TABLE inscriptions_cours;
ALTER PUBLICATION supabase_realtime ADD TABLE cours_yoga;
-- RSVP milongas (élèves → admin temps réel)
CREATE TABLE IF NOT EXISTS milonga_presences (
  id bigserial PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  date date NOT NULL,
  milonga_id text NOT NULL DEFAULT '',
  milonga_nom text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  prenom text NOT NULL DEFAULT '',
  nom text NOT NULL DEFAULT '',
  UNIQUE(date, email)
);
ALTER TABLE milonga_presences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_select" ON milonga_presences FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON milonga_presences FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_delete" ON milonga_presences FOR DELETE USING (true);
GRANT SELECT, INSERT, DELETE ON milonga_presences TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE milonga_presences_id_seq TO anon, authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE milonga_presences;
