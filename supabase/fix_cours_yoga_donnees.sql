-- Ajouter la colonne donnees JSONB à cours_yoga
-- (pour stocker datePremierPaiement, echeancesStatus, etc.)
ALTER TABLE cours_yoga
  ADD COLUMN IF NOT EXISTS donnees JSONB NOT NULL DEFAULT '{}';
