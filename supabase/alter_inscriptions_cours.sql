-- ================================================================
-- Migration : colonnes manquantes sur inscriptions_cours
-- À exécuter dans l'éditeur SQL de supabase.com
-- ================================================================

ALTER TABLE inscriptions_cours
  ADD COLUMN IF NOT EXISTS tel      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS role     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cours    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS paiement TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS montant  NUMERIC       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS donnees  JSONB;
