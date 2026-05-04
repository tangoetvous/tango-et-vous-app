-- Fix discussion_messages :
-- 1. Permettre aux élèves d'écrire dans les discussions publiques (eleve_email vide/null)
-- 2. Ajouter la colonne auteur_nom (affichage du vrai nom dans le chat)

-- 1. Policy INSERT : élèves peuvent écrire dans les discussions qui leur sont accessibles
DROP POLICY IF EXISTS "disc_msg_insert" ON discussion_messages;
CREATE POLICY "disc_msg_insert" ON discussion_messages FOR INSERT
  WITH CHECK (
    is_admin()
    OR discussion_id IN (
      SELECT id FROM discussions
      WHERE eleve_email = auth.email()
         OR eleve_email IS NULL
         OR eleve_email = ''
    )
  );

-- 2. Colonne auteur_nom pour afficher le vrai nom dans le chat
ALTER TABLE discussion_messages
  ADD COLUMN IF NOT EXISTS auteur_nom TEXT NOT NULL DEFAULT '';
