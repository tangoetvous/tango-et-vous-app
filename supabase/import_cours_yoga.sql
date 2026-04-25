-- ================================================================
-- Import élèves yoga dans cours_yoga · saison 2025-2026
-- À exécuter dans l'éditeur SQL de Supabase
-- ================================================================

-- Créer la table si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS cours_yoga (
  id          BIGSERIAL PRIMARY KEY,
  prenom      TEXT NOT NULL DEFAULT '',
  nom         TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  cours       TEXT NOT NULL DEFAULT 'hatha',
  statut      TEXT NOT NULL DEFAULT 'inscrit',
  saison      TEXT NOT NULL DEFAULT '2025-2026',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supprimer les éventuelles doublons de la saison 2025-2026 avant import
DELETE FROM cours_yoga WHERE saison = '2025-2026';

-- Insérer les élèves yoga (hatha, yin, ou forfait pour les deux)
INSERT INTO cours_yoga (prenom, nom, email, cours, statut, saison) VALUES
-- Hatha uniquement
('Antoine',    'Baudoux',        'antoinej.baudoux@gmail.com',          'hatha',  'inscrit', '2025-2026'),
('Noham',      'Bezzah',         'bezzahnoham@gmail.com',               'hatha',  'inscrit', '2025-2026'),
('Sandrine',   'Billot',         'sandrine_billot@orange.fr',           'hatha',  'inscrit', '2025-2026'),
('Pascale',    'Boisseaux',      'boisseaux.pascale@gmail.com',         'hatha',  'inscrit', '2025-2026'),
('Noelle',     'Bordin',         'nbordin@free.fr',                     'hatha',  'inscrit', '2025-2026'),
('Claude',     'Canton-Pont',    'claudecanton@yahoo.fr',               'hatha',  'inscrit', '2025-2026'),
('Marylène',   'Claude',         'marylene.claude8@orange.fr',          'hatha',  'inscrit', '2025-2026'),
('Julia',      'Dagany',         'julia.dagany@orange.fr',              'hatha',  'inscrit', '2025-2026'),
('Daniele',    'Leguay',         'daniele.leguay@yahoo.fr',             'hatha',  'inscrit', '2025-2026'),
('Chantal',    'Milbergue',      'chantemil93@gmail.com',               'hatha',  'inscrit', '2025-2026'),
('Camille',    'Salesne',        'camille.salesne@gmail.com',           'hatha',  'inscrit', '2025-2026'),
-- Yin uniquement
('Bertrand',   'Bedez',          'bertrand.bedez@yahoo.com',            'yin',    'inscrit', '2025-2026'),
('Marie-Laure','Benoistel',      'ml.benoistel@gmail.com',              'yin',    'inscrit', '2025-2026'),
('Danielle',   'Bensamoun',      'bensamoundanielle@gmail.com',         'yin',    'inscrit', '2025-2026'),
('Eva',        'Boukobza',       'evaboukobza@gmail.com',               'yin',    'inscrit', '2025-2026'),
('Marianne',   'Demouy',         'demouy.jm@orange.fr',                 'yin',    'inscrit', '2025-2026'),
('Jean-Claude','Guillot',        'jean-claude.guillot14@orange.fr',     'yin',    'inscrit', '2025-2026'),
('Christine',  'Jordan',         'christijor@yahoo.fr',                 'yin',    'inscrit', '2025-2026'),
('Alexandre',  'Lessertisseur',  'alexandre.lessertisseur@gmail.com',   'yin',    'inscrit', '2025-2026'),
('Corinne',    'Quiles',         'cquiles@hotmail.fr',                  'yin',    'inscrit', '2025-2026'),
-- Hatha + Yin (forfait)
('Myriam',     'Bloch',          'mymybloch@gmail.com',                 'forfait','inscrit', '2025-2026');

SELECT cours, COUNT(*) FROM cours_yoga WHERE saison='2025-2026' GROUP BY cours ORDER BY cours;
