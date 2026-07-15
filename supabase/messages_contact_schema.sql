-- ============================================================
-- Table messages_contact — formulaire public "Contact" (contact.html)
-- Un visiteur envoie un message → arrive dans l'onglet admin 📨 Contact.
-- Modèle : cours_particuliers (schema.sql). INSERT public (anon), lecture admin only.
-- ============================================================
CREATE TABLE IF NOT EXISTS messages_contact (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prenom      TEXT NOT NULL DEFAULT '',
  nom         TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  tel         TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'wix',
  statut      TEXT NOT NULL DEFAULT 'nouveau',   -- nouveau | traite
  lu          BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE messages_contact ENABLE ROW LEVEL SECURITY;

-- Lecture / modification / suppression : admin uniquement (messages privés)
CREATE POLICY "mc_select" ON messages_contact FOR SELECT USING (is_admin());
-- Insertion : publique (formulaire anonyme sur Wix). ⚠️ Le client insère SANS .select()
-- (sinon le RETURNING déclenche la policy SELECT → 42501 en iframe Wix).
CREATE POLICY "mc_insert" ON messages_contact FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "mc_update" ON messages_contact FOR UPDATE USING (is_admin());
CREATE POLICY "mc_delete" ON messages_contact FOR DELETE USING (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON messages_contact TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE messages_contact_id_seq TO anon, authenticated;

-- Realtime (rafraîchissement auto de l'onglet admin, comme cours_particuliers)
ALTER PUBLICATION supabase_realtime ADD TABLE messages_contact;
