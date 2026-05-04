-- Fix discussions : les discussions créées par l'admin (eleve_email vide/null)
-- doivent être visibles par tous les élèves connectés.

-- 1. Mettre à jour la policy SELECT sur discussions
DROP POLICY IF EXISTS "disc_select" ON discussions;
CREATE POLICY "disc_select" ON discussions FOR SELECT
  USING (
    is_admin()
    OR eleve_email = auth.email()
    OR eleve_email IS NULL
    OR eleve_email = ''
  );

-- 2. Mettre à jour la policy SELECT sur discussion_messages
DROP POLICY IF EXISTS "disc_msg_select" ON discussion_messages;
CREATE POLICY "disc_msg_select" ON discussion_messages FOR SELECT
  USING (
    is_admin()
    OR discussion_id IN (
      SELECT id FROM discussions
      WHERE eleve_email = auth.email()
         OR eleve_email IS NULL
         OR eleve_email = ''
    )
  );

-- 3. Corriger les discussions existantes créées par l'admin
--    (eleve_email = email admin, pas un email élève → vider le champ)
UPDATE discussions
SET eleve_email = ''
WHERE eleve_email IS NOT NULL
  AND eleve_email != ''
  AND eleve_email NOT IN (
    SELECT email FROM eleves
    WHERE email IS NOT NULL AND email != ''
  );
