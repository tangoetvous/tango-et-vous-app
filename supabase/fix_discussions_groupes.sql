-- Ajouter la colonne groupes sur la table discussions
-- (filtrage par cours : paris-debutants, paris-intermediaires, vincennes-debutants, vincennes-intermediaires)
-- Un tableau vide = discussion visible par tous les élèves connectés.

ALTER TABLE discussions
  ADD COLUMN IF NOT EXISTS groupes TEXT[] NOT NULL DEFAULT '{}';
