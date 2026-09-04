# Appli Chant — maquette (nom provisoire : « Studio de Chant »)

Application pour une professeure de chant, **indépendante de Tango & Vous**.
Ce dossier contient une **maquette cliquable** (données de démo, aucun serveur) pour valider
l'ergonomie avant de construire la vraie application.

## Tester la maquette

Ouvrir les deux fichiers dans un navigateur (idéalement deux onglets côte à côte) :

- `admin.html` — espace **professeure** : élèves, cartes, pointage, exercices, notifications
- `index.html` — espace **élève** : sa carte, ses exercices, ses notifications
  (un sélecteur en haut permet de basculer entre les élèves de démo — dans la vraie app,
  chaque élève ne voit évidemment que son propre espace)

Les données sont partagées entre les deux pages via `localStorage` : **pointer un cours côté
professeure fait apparaître la notification et le suivi côté élève en direct** (si les deux
onglets sont ouverts). Bouton « ↺ Réinitialiser les données de démo » en bas de l'espace prof.

## Fonctionnalités maquettées

| Fonction | Où |
|---|---|
| Interface personnalisée par élève (exercices, carte, notifications) | index.html |
| Exercice = consigne + enregistrement piano (audio) | les deux |
| Toggle par exercice « M'avertir quand l'élève a fait l'exercice » | admin (création exercice) |
| Élève marque « J'ai fait cet exercice aujourd'hui » → notif prof si toggle actif | index → onglet 🔔 admin |
| Carte de cours avec nombre de cours paramétrable | admin (fiche élève, renouvellement) |
| Toggle « date d'expiration » activable/désactivable par carte | admin (fiche élève, renouvellement) |
| Audio : import de fichier OU enregistrement micro direct (MediaRecorder) | admin (création exercice) |
| Pointage d'un cours par la prof → notification (push simulé) à l'élève | admin → index |
| Suivi visuel : jauge + points avec dates + cours restants | les deux |
| Cours à l'unité (dates + payé / à régler) | les deux |
| Renouvellement de carte (nombre de cours au choix) | admin |

## Architecture cible (vraie app — à valider)

Reprise des patterns éprouvés de Tango & Vous, sur une **infra 100 % séparée** :

- **Base de données + auth** : nouveau projet Supabase (gratuit).
  Connexion élève par **magic link** (email, sans mot de passe). RLS : chaque élève ne lit
  que ses propres lignes ; la professeure (email admin) voit tout.
- **Tables prévues** : `eleves` (fiche + formule + carte_total), `pointages` (une ligne par
  cours pointé, date), `exercices` (titre, consigne, audio_path, notify_prof, actif),
  `exercices_faits` (une ligne par validation élève), `fcm_tokens`, `notifications`.
- **Audio** : Supabase Storage (1 Go inclus — largement suffisant pour des enregistrements
  piano de quelques Mo). Alternative si volumes importants : Bunny.
- **Hébergement** : Cloudflare Workers Static Assets (comme Tango & Vous), nouveau Worker +
  nouveau domaine, déploiement GitHub Actions.
- **Push** : PWA + Firebase Cloud Messaging (nouveau projet Firebase), même mécanique VAPID
  que Tango & Vous.
- **Emails** (magic links, éventuels récaps) : Brevo.

## Questions ouvertes (à trancher avant de coder le socle)

1. **Nom de l'app / de la professeure**, couleurs, logo ? (la maquette utilise un thème
   crème/bordeaux provisoire)
2. ~~Date d'expiration ?~~ → **tranché 2026-07-14** : toggle activable/désactivable par carte.
3. Les cours à l'unité : faut-il suivre le **paiement** (payé / à régler, comme maquetté)
   ou juste la liste des dates ?
4. Les exercices sont-ils **archivés** quand ils sont terminés (historique) ou simplement
   supprimés ?
5. L'élève doit-il pouvoir marquer un exercice fait **plusieurs fois** (une fois par jour,
   comme maquetté) ou une seule fois ?
6. ~~Enregistrement ou import ?~~ → **tranché 2026-07-14** : les deux (micro direct + import
   de fichier), maquetté dans la modale exercice.
7. Faut-il un paiement en ligne (type AssoConnect / lien de paiement) ou tout se règle en
   direct avec la prof ?
8. Combien d'élèves environ ? (dimensionnement — les plans gratuits suffisent jusqu'à
   plusieurs centaines)

## Statut

- 2026-07-14 : maquette initiale (2 interfaces + données de démo). **Aucun code de
  production, aucune infra créée.** À faire valider par l'utilisateur, puis : specs
  définitives → nouveau repo + Supabase + Worker → développement du socle.
