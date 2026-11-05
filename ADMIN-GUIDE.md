# Guide d'utilisation de l'administration — SIPOKTECH DIGITAL

Adresse : `https://sipokteck-portfolio.onrender.com/admin` (non liée depuis le site public, non référencée par Google).

## 1. Se connecter

1. Ouvrez `/admin`, saisissez votre email et votre mot de passe.
2. **Mot de passe oublié ?** : saisissez votre email, un lien à usage unique vous est envoyé (nécessite Supabase Auth configuré). Le lien ouvre `/admin` sur un formulaire « Nouveau mot de passe » (12 caractères minimum).
3. Trop d'essais ratés (8 en 15 minutes) bloquent temporairement la connexion.
4. Cliquez sur **Déconnexion** en fin de session, surtout sur un ordinateur partagé.

> Première mise en service : suivez la section « Configurer Supabase » du README (variables Render, création de votre compte Supabase, URL de redirection). Tant que votre compte Supabase n'existe pas, l'ancien accès continue de fonctionner.

## 2. Se repérer

- **Menu latéral** (sur mobile : bouton ☰ en haut à gauche). Les pastilles vertes indiquent les nouvelles demandes et les messages non lus.
- **Notifications** : un encadré en bas de l'écran confirme chaque action (« Modifications enregistrées », etc.) ou explique l'erreur.
- **Vue d'ensemble** : demandes en attente, nouvelles demandes, messages non lus, projets publiés, services actifs, clients, graphiques mensuels, dernières demandes.
- **Statistiques et évolution** : projets réalisés (réels), publiés, en brouillon, nouveaux clients, demandes reçues/en cours/terminées/annulées, services les plus demandés, évolution mensuelle sur 12 mois. Chaque graphique a un lien « Voir les chiffres » (tableau accessible).
  Tous les chiffres viennent des données enregistrées. Il n'y a pas de compteur de visiteurs (aucun outil de statistiques n'est installé).

## 3. Demandes de devis

- Recherche par nom, email, téléphone, service, texte ou **référence** (`DV-2026-0001`), et filtre par statut.
- Statuts : **nouveau → en discussion → devis envoyé → en cours → terminé** (ou **annulé**).
- Une **note interne** par demande (jamais visible du client).
- Boutons : répondre par email, écrire sur WhatsApp, créer la fiche client, supprimer (avec confirmation).
- Si l'email de notification n'est pas parti, la demande est tout de même enregistrée ici.

## 4. Projets

1. **+ Nouveau projet** : titre, catégorie, description, technologies (séparées par des virgules), lien du projet, lien du code source, date de réalisation.
2. **Statut** : *Publié* = visible tout de suite dans le portfolio ; *Brouillon* = invisible du public.
3. **Images** (jusqu'à 8) : bouton « Choisir des fichiers » (JPG, PNG ou WebP, 5 Mo maximum chacune) ou adresse d'une image déjà en ligne. La **première image est la couverture** ; retirez-en une avec ✕.
4. **Projet de démonstration** : décochez la case pour un projet réellement livré à un client (il s'affiche alors « Projet réel »).
5. Supprimer un projet demande confirmation et efface aussi ses images.

## 5. Services et tarifs

- Prix vide = « Sur devis » · un seul prix = « À partir de » · prix minimum + maximum = « Entre … et … ».
- **Actif** décoché : le service disparaît du site et du formulaire de devis.
- Image (facultative), icône, ordre d'affichage, contenu inclus (un point par ligne), conditions.
- Les changements sont visibles immédiatement sur les pages Services, Tarifs et Accueil.

## 6. Témoignages

N'ajoutez que de vrais avis, **avec l'autorisation écrite du client**, et vérifiez-les avant de cocher « Publier ». Un témoignage non publié n'apparaît jamais sur le site.

## 7. Clients et messages

Fiches clients (nom, email, téléphone, entreprise, notes) créées à la main ou depuis un devis (sans doublon d'email). Les messages du formulaire de contact se classent *nouveau / lu / traité*.

## 8. Informations du site

Slogan, textes d'introduction (accueil, À propos), email de contact, WhatsApp principal et secondaire (chiffres avec l'indicatif, ex. `22878003599`), localisation, réseaux sociaux. Un champ vide reprend la valeur par défaut. Les **tarifs** se changent dans « Services & tarifs ».

## 9. Historique

Liste des 200 dernières actions (qui, quoi, quand). Aucun mot de passe n'y est enregistré.

## 10. Bonnes pratiques de sécurité

- Mot de passe long et unique, jamais partagé ni envoyé par message.
- Ne collez jamais la clé `SUPABASE_SERVICE_ROLE_KEY` dans un chat, un email ou un fichier du dépôt : uniquement dans les variables d'environnement de Render.
- Une fois votre compte Supabase testé, mettez `ADMIN_LEGACY_LOGIN=false` dans Render.
- Exportez régulièrement la base (Supabase → Database → Backups, ou `pg_dump`).

## 11. Dépannage

| Problème | Cause probable |
|---|---|
| « Identifiants incorrects ou compte non autorisé » | Mauvais mot de passe, ou email absent de la liste blanche (`ADMIN_EMAIL` / `ADMIN_EMAILS`) |
| Lien « mot de passe oublié » refusé | `https://VOTRE-SITE/admin` absent des *Redirect URLs* de Supabase Auth |
| « L'envoi d'images n'est pas configuré » | `SUPABASE_SERVICE_ROLE_KEY` absente de Render (vous pouvez coller l'adresse d'une image) |
| Une image ne s'affiche pas | Format non pris en charge, ou bucket non public |
| Le site met une minute à répondre | Mise en veille du plan gratuit Render après 15 minutes d'inactivité |
