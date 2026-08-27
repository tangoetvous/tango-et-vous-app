-- ================================================================
-- compter_inscrits_cours — quotas du formulaire public inscription-cours.html
-- (2026-08-19)
--
-- POURQUOI : la RLS de inscriptions_cours (ins_cours_select : is_admin() OR
-- email = auth.email()) renvoie SILENCIEUSEMENT 0 ligne à un client anonyme.
-- Le contrôle de quota du formulaire public, qui lisait la table directement,
-- comptait donc toujours 0 guideur / 0 guidée → tout le monde était validé,
-- même sur un cours complet. Cette fonction SECURITY DEFINER (même modèle que
-- compter_inscrits_essai, en prod depuis des mois) n'expose que des TOTAUX.
--
-- SÉMANTIQUE : strictement identique à ce que le formulaire croyait compter —
-- statuts inscrit + attente_paiement (les 'demande' non validées ne bloquent
-- pas le quota, les 'supprimé' non plus), renouvellements de carte exclus
-- (donnees->>'isRenewal').
--
-- À EXÉCUTER DANS SUPABASE (SQL Editor). Le formulaire est en « fail-open » :
-- tant que cette fonction n'existe pas, il se comporte comme avant (validé).
-- ================================================================

CREATE OR REPLACE FUNCTION public.compter_inscrits_cours(
  p_ville text,
  p_niveau text,
  p_saison text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_gui integer := 0;
  v_gde integer := 0;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE role = 'guideur'),
    COUNT(*) FILTER (WHERE role = 'guidee')
  INTO v_gui, v_gde
  FROM inscriptions_cours
  WHERE ville = p_ville
    AND niveau = p_niveau
    AND saison = p_saison
    AND statut IN ('inscrit', 'attente_paiement')
    AND (donnees IS NULL OR donnees->>'isRenewal' IS DISTINCT FROM 'true');

  RETURN json_build_object('gui', v_gui, 'gde', v_gde);
END;
$$;

GRANT EXECUTE ON FUNCTION public.compter_inscrits_cours(text, text, text) TO anon, authenticated;
