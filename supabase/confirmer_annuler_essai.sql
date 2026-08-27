-- ================================================================
-- confirmer_annuler_essai — boutons 👍 Confirmer / ✕ Annuler / ↩ Reporter
-- des emails essai tango (via worker /api/essai/confirmer|annuler|reporter)
--
-- CORRECTIF 2026-08-27 : la version déployée en mai écrivait statut='supprime'
-- SANS accent, alors que toute l'app (onglet 🗑 Supprimés, grisé, Rétablir)
-- filtre sur 'supprimé' AVEC accent → les fiches annulées par les élèves
-- restaient affichées comme des inscriptions normales. Seule différence avec
-- la version déployée : les accents (écriture ET détection « déjà supprimé »,
-- tolérante aux deux orthographes pour les fiches historiques).
-- La vérification HMAC du lien est STRICTEMENT inchangée — les boutons des
-- emails déjà envoyés continuent de fonctionner.
--
-- ⚠️ Après le CREATE, exécuter aussi la réparation des fiches déjà annulées :
--   UPDATE inscriptions_essai SET statut = 'supprimé' WHERE statut = 'supprime';
-- ================================================================

CREATE OR REPLACE FUNCTION public.confirmer_annuler_essai(
  p_id BIGINT, p_token TEXT, p_action TEXT, p_secret TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_row inscriptions_essai;
  v_expected TEXT;
  v_partner_found BOOLEAN := false;
  v_partner_id BIGINT;
  v_partner_statut TEXT;
  v_partner_prenom TEXT;
  v_partner_nom TEXT;
  v_partner_email TEXT;
  v_partner_tel TEXT;
BEGIN
  SELECT * INTO v_row FROM inscriptions_essai WHERE id = p_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'introuvable'); END IF;
  v_expected := substring(
    encode(extensions.hmac(p_id::text || ':' || lower(v_row.email), p_secret, 'sha256'::text), 'hex'), 1, 32
  );
  IF p_token != v_expected THEN RETURN json_build_object('ok', false, 'error', 'token'); END IF;
  IF p_action = 'confirmer' THEN
    IF v_row.statut IN ('supprimé', 'supprime') THEN
      RETURN json_build_object('ok', true, 'supprime', true, 'prenom', v_row.prenom, 'nom', v_row.nom,
        'email', v_row.email, 'date_essai', v_row.date_essai, 'ville', v_row.ville, 'niveau', v_row.niveau);
    END IF;
    UPDATE inscriptions_essai SET presence_confirmee = true WHERE id = p_id;
  ELSIF p_action IN ('annuler', 'reporter') THEN
    IF v_row.statut IN ('supprimé', 'supprime') THEN
      RETURN json_build_object('ok', true, 'already', true, 'prenom', v_row.prenom, 'nom', v_row.nom,
        'email', v_row.email, 'date_essai', v_row.date_essai, 'ville', v_row.ville, 'niveau', v_row.niveau,
        'partner_found', false);
    END IF;
    UPDATE inscriptions_essai SET statut = 'supprimé', statut_avant_suppression = v_row.statut WHERE id = p_id;
    SELECT id, statut, prenom, nom, email, tel
      INTO v_partner_id, v_partner_statut, v_partner_prenom, v_partner_nom, v_partner_email, v_partner_tel
    FROM inscriptions_essai
    WHERE date_essai = v_row.date_essai AND ville = v_row.ville AND niveau = v_row.niveau
      AND type = v_row.type AND id != p_id AND statut NOT IN ('supprimé', 'supprime')
      AND (
        (lower(trim(prenom)) = lower(trim(v_row.part_prenom)) AND lower(trim(nom)) = lower(trim(v_row.part_nom)))
        OR (lower(trim(v_row.email)) = lower(trim(part_email)) AND part_email != '')
      )
    LIMIT 1;
    IF FOUND THEN
      v_partner_found := true;
      UPDATE inscriptions_essai SET statut = 'supprimé', statut_avant_suppression = v_partner_statut WHERE id = v_partner_id;
    END IF;
    RETURN json_build_object('ok', true, 'already', false,
      'prenom', v_row.prenom, 'nom', v_row.nom, 'email', v_row.email, 'tel', v_row.tel,
      'date_essai', v_row.date_essai, 'ville', v_row.ville, 'niveau', v_row.niveau,
      'partner_found', v_partner_found,
      'partner_prenom', v_partner_prenom,
      'partner_nom', v_partner_nom,
      'partner_email', v_partner_email,
      'partner_tel', v_partner_tel
    );
  ELSE
    RETURN json_build_object('ok', false, 'error', 'action_invalide');
  END IF;
  RETURN json_build_object('ok', true, 'already', false, 'prenom', v_row.prenom, 'nom', v_row.nom,
    'email', v_row.email, 'tel', v_row.tel, 'date_essai', v_row.date_essai,
    'ville', v_row.ville, 'niveau', v_row.niveau, 'partner_found', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmer_annuler_essai(BIGINT, TEXT, TEXT, TEXT) TO anon, authenticated;
