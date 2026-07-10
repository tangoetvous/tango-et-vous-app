-- Rubrique « Vidéos des cours » — hébergement Bunny Stream + modération (session 2026-07-10)
-- Les vidéos sont stockées sur Bunny Stream ; cette table ne garde que les métadonnées
-- (titre, cours, id Bunny, statut de modération, qui a proposé).
--
-- ⚠️ À exécuter dans Supabase → SQL Editor avant le déploiement de la fonctionnalité.

CREATE TABLE IF NOT EXISTS videos_cours (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  titre TEXT NOT NULL,
  ville TEXT NOT NULL,                          -- 'paris' | 'vincennes'
  niveau TEXT NOT NULL,                         -- 'debutant' | 'intermediaire'
  saison TEXT NOT NULL,
  bunny_video_id TEXT NOT NULL,                 -- guid de la vidéo côté Bunny Stream
  duree_sec INTEGER,
  statut TEXT NOT NULL DEFAULT 'en_attente',    -- 'en_attente' | 'approuvee' | 'refusee'
  source TEXT NOT NULL DEFAULT 'eleve',         -- 'eleve' | 'admin'
  soumis_par_email TEXT,
  soumis_par_nom TEXT,
  approuvee_at TIMESTAMPTZ
);

ALTER TABLE videos_cours ENABLE ROW LEVEL SECURITY;

-- Lecture : vidéos approuvées (tout élève connecté) + sa propre proposition en attente + admin voit tout
CREATE POLICY "videos_select" ON videos_cours FOR SELECT TO authenticated
  USING (statut = 'approuvee' OR soumis_par_email = auth.email() OR is_admin());

-- Insertion : un élève ne peut proposer QU'EN attente et en son nom ; l'admin peut tout
CREATE POLICY "videos_insert" ON videos_cours FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (soumis_par_email = auth.email() AND statut = 'en_attente' AND source = 'eleve')
  );

-- Approuver / refuser : admin uniquement
CREATE POLICY "videos_update" ON videos_cours FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Supprimer : admin uniquement
CREATE POLICY "videos_delete" ON videos_cours FOR DELETE TO authenticated
  USING (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON videos_cours TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE videos_cours_id_seq TO authenticated;
