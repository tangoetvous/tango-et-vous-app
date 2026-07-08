-- Cartes 10 — date d'expiration forcée manuellement (session 2026-07-08)
-- Permet à l'admin de forcer une date d'expiration dans la modale « ✏️ Modifier les cours »
-- (Cartes 10 → Détails). Vide = calcul automatique ; date saisie = forcée (collante).
-- Le flag est remis à false lors de tout renouvellement (retour au calcul auto).
--
-- ⚠️ À exécuter AVANT le déploiement du code — sinon la sauvegarde de la modale échoue
--    avec « column carte_exp_manuelle does not exist ».

ALTER TABLE eleves ADD COLUMN IF NOT EXISTS carte_exp_manuelle BOOLEAN DEFAULT false;
