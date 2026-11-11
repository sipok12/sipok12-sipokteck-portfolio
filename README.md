# SIPOKTECH DIGITAL — site vitrine, devis et administration

Plateforme de présentation et de vente de services numériques de Jean-Paul AHITE (Lomé, Togo).
*Votre vision, notre créativité, le numérique comme solution.*

Ce projet **améliore le site existant** (Express + PostgreSQL + HTML/CSS/JS natif) sans changer de technologie.

## Ce qui a été conservé, corrigé, ajouté

| | |
|---|---|
| **Conservé** | Express, PostgreSQL, sessions en base, bcrypt, Helmet/CSP, double protection CSRF, validation serveur, limitation de débit, champ anti-spam, projets de démonstration, `render.yaml`, fichier Google Search Console, HTML/CSS/JS natif (pas de React). |
| **Corrigé** | Deux numéros WhatsApp contradictoires (HTML ≠ serveur) ; lien « Admin » visible publiquement ; barres de compétences en pourcentage (estimations non vérifiables) ; page 404 en JSON ; sitemap à une seule URL ; README/`.env.example` qui parlaient de Neon/Railway. |
| **Ajouté** | 6 pages (Accueil, À propos, Services, Tarifs, Portfolio, Contact), système de devis, notifications email, administration étendue, nouveau design, SEO par page, page 404, tests automatiques. |

## Arborescence

```text
server.js              Application Express (sécurité, sessions, routes, 404)
db.js                  Connexion PostgreSQL
schema.sql             Schéma (idempotent, exécuté à chaque démarrage)
lib/                   validate.js · site.js · mailer.js · init.js (données initiales) · pages.js (gabarits)
routes/public.js       API publique : config, services, projets, témoignages, contact, devis
routes/admin.js        API d'administration (session + CSRF obligatoires)
views/                 layout.html · partials/ (en-tête, pied de page) · une vue par page
public/                style.css · app.js + un script par page · admin.html/js/css · favicon.svg
tests/smoke.js         Tests de bout en bout (npm run smoke)
scripts/gen-secrets.js Génère SESSION_SECRET et le hash du mot de passe admin
render.yaml            Déploiement Render
```

## Installation locale

Prérequis : Node.js 20+ et une base PostgreSQL (Supabase, Neon ou locale).

```bash
cp .env.example .env          # Windows PowerShell : Copy-Item .env.example .env
npm install
npm run secrets -- "UnMotDePasseFortDe12CaracteresOuPlus"   # copiez SESSION_SECRET et ADMIN_PASSWORD_HASH dans .env
# renseignez aussi DATABASE_URL et ADMIN_EMAIL dans .env
npm run dev
```

Site : http://localhost:3000 · Administration : http://localhost:3000/admin (adresse non liée depuis le site public) · Santé : http://localhost:3000/health

Au premier démarrage, le serveur crée les tables, le compte administrateur, les 3 projets de démonstration et les 6 services (uniquement si les tables sont vides).

## Variables d'environnement

Voir `.env.example`. Aucune clé secrète n'est jamais envoyée au navigateur.

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (secret) |
| `SESSION_SECRET` | Secret de session, 32 caractères minimum (obligatoire en production) |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD_HASH` | Compte administrateur (hash bcrypt, jamais le mot de passe) |
| `SITE_URL` | Adresse publique sans slash final (canonical, sitemap) |
| `CONTACT_EMAIL` | Email affiché **et** destinataire des notifications |
| `WHATSAPP_PRIMARY`, `WHATSAPP_SECONDARY` | Numéros au format international sans « + » : `22878003599`, `22871344338` |
| `RESEND_API_KEY`, `MAIL_FROM` | Notifications email (optionnel) |
| `SOCIAL_*` | Liens réseaux sociaux (seuls ceux renseignés s'affichent ; GitHub par défaut). Modifiables aussi dans l'administration |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Connexion des administrateurs via Supabase Auth (clé **publique**) |
| `SUPABASE_SERVICE_ROLE_KEY` | Envoi d'images vers Supabase Storage (clé **secrète**, variables Render uniquement) |
| `SUPABASE_STORAGE_BUCKET` | Nom du bucket d'images (défaut `portfolio`, créé automatiquement) |
| `ADMIN_EMAILS` | Administrateurs supplémentaires autorisés (en plus de `ADMIN_EMAIL`) |
| `ADMIN_LEGACY_LOGIN` | `false` pour désactiver l'ancien compte une fois Supabase Auth en service |

## Base de données

Tables : `projects` (statut brouillon/publié, date de réalisation, galerie d'images), `services`, `quotes`, `clients`, `testimonials`, `messages`, `site_settings` (informations modifiables du site), `activity_log` (historique des actions), `admin_profiles` (liste blanche des administrateurs), `admins` (ancien compte), `user_sessions`. Le schéma complet est dans **`schema.sql`**, exécuté à chaque démarrage : il est idempotent et ne détruit aucune donnée. Vous pouvez aussi le coller tel quel dans Supabase → SQL Editor.

**RLS (Row Level Security)** est activé sur toutes les tables du site. Le serveur Node se connecte avec le rôle propriétaire, qui n'y est pas soumis ; RLS protège donc l'API REST de Supabase : seuls les projets *publiés*, les services *actifs* et les témoignages *publiés* sont lisibles publiquement. Devis, clients, messages, paramètres, historique et administrateurs n'ont aucune politique : inaccessibles avec la clé publique.

Conversion automatique des devis : `accepté` → `en cours`, `refusé` → `annulé` (nouveaux statuts : nouveau, en discussion, devis envoyé, en cours, terminé, annulé).

Sauvegardes : le plan gratuit ne remplace pas une vraie stratégie de sauvegarde. Exportez régulièrement la base (`pg_dump "$DATABASE_URL" > sauvegarde.sql`, ou l'export du tableau de bord Supabase) et conservez le fichier hors du dépôt.

## Système de devis

1. Le visiteur choisit une prestation, décrit son besoin, indique budget, délai et coordonnées, et accepte d'être recontacté.
2. Le serveur **valide tout** (le navigateur n'est pas cru), enregistre en base, puis seulement alors répond avec la référence `DV-AAAA-NNNN`. Si l'enregistrement échoue, aucune confirmation n'est affichée.
3. La demande apparaît dans **Administration → Devis** (statut, notes, réponse par email ou WhatsApp, création de fiche client).
4. Un email de notification est envoyé à `CONTACT_EMAIL` si `RESEND_API_KEY` est défini. L'administration indique si l'email est parti. Le bouton WhatsApp de la confirmation est un canal complémentaire.

### Activer les emails (Resend)
1. Créez un compte sur https://resend.com avec **la même adresse** que `CONTACT_EMAIL` et créez une clé API.
2. Ajoutez `RESEND_API_KEY` dans Render. Avec l'expéditeur de test par défaut (`onboarding@resend.dev`), Resend n'envoie qu'à l'adresse du compte, ce qui suffit pour recevoir vos notifications.
3. Pour écrire à d'autres adresses, il faut vérifier un domaine dans Resend puis définir `MAIL_FROM`.

## Administration (`/admin`)

Menu latéral : Vue d'ensemble · Statistiques et évolution · Demandes de devis · Messages · Projets · Services & tarifs · Témoignages · Clients · Informations du site · Historique · Mon compte. Mode d'emploi détaillé : **[ADMIN-GUIDE.md](ADMIN-GUIDE.md)**.

- **Connexion** : Supabase Auth (email + mot de passe), puis vérification côté serveur que l'email figure dans `admin_profiles`. Un compte Supabase d'une autre application du même projet n'a **aucun** accès. Mot de passe oublié : lien à usage unique envoyé par Supabase.
- **Images** : envoyées au serveur qui vérifie le contenu réel (JPG, PNG, WebP, 5 Mo maximum, pas de SVG), renomme le fichier puis le stocke dans le bucket public Supabase Storage (persistant, contrairement au disque de Render). Les images d'un projet supprimé ou retirées sont effacées du bucket.
- Tous les prix du site se modifient dans **Services & tarifs** (prix vide = « sur devis » ; un prix maximum facultatif affiche une fourchette).
- Un projet **publié** apparaît automatiquement dans le portfolio ; un **brouillon** reste invisible. Un projet décoché « démonstration » s'affiche comme **Projet réel**.
- Un témoignage n'apparaît sur le site que s'il est **publié**. Aucun n'est fourni : n'ajoutez que de vrais avis, avec l'accord du client.
- **Informations du site** : slogan, textes d'introduction, email, WhatsApp, localisation, réseaux sociaux (un champ vide reprend la valeur par défaut).
- **Historique** : chaque création, modification, suppression, connexion et envoi d'image est enregistré avec l'administrateur et la date (jamais de mot de passe).
- Aucune statistique de visites n'est collectée (pas de traceur) ; le tableau de bord ne compte que les données réellement enregistrées (devis, projets, clients).

## Configurer Supabase (Auth + Storage)

1. **Variables Render** : `SUPABASE_URL` et `SUPABASE_ANON_KEY` (Supabase → Project Settings → API Keys, clé *publishable*). Pour les images, ajoutez aussi `SUPABASE_SERVICE_ROLE_KEY` (clé *secret*) **uniquement dans Render**.
2. **Créer votre compte** : Supabase → Authentication → Users → *Add user* → *Create new user*, avec l'email de `ADMIN_EMAIL`, un mot de passe long, et « Auto Confirm User » coché.
3. **Authentication → URL Configuration** : *Site URL* = `https://VOTRE-SITE`, et ajoutez `https://VOTRE-SITE/admin` aux *Redirect URLs* (sinon le lien « mot de passe oublié » est refusé).
4. **Authentication → Sign In / Providers** : désactivez *Allow new users to sign up* (le projet Supabase est partagé avec d'autres applications).
5. Connectez-vous sur `/admin` avec ce compte, vérifiez dans *Mon compte* que la connexion indique « Supabase Auth », puis mettez `ADMIN_LEGACY_LOGIN=false` pour retirer l'ancien accès.

## Déploiement sur Render

1. Remplacez les fichiers du dépôt GitHub par ceux de ce projet et poussez (`git add -A && git commit -m "SIPOKTECH DIGITAL v2" && git push`). Render redéploie automatiquement si l'auto-déploiement est actif.
2. Dans Render → service → **Environment**, vérifiez : `NODE_ENV=production`, `DATABASE_URL` (Supabase *Session pooler*), `SESSION_SECRET`, `ADMIN_*`, `CONTACT_EMAIL`, `SITE_URL`.
3. **Mettez à jour `WHATSAPP_PRIMARY=22878003599` et `WHATSAPP_SECONDARY=22871344338`** : si d'anciennes valeurs y sont enregistrées, elles priment sur les valeurs par défaut du code.
4. Ajoutez `RESEND_API_KEY` (et `SOCIAL_*` si souhaité).
5. Vérifiez `/health`, les 6 pages, un devis de test, puis supprimez-le dans l'administration. Consultez les logs Render en cas d'erreur (`Impossible de démarrer le serveur` = `DATABASE_URL` ou schéma).
6. Search Console : envoyez `https://VOTRE-SITE/sitemap.xml`.

Limites du lancement gratuit (à vérifier dans vos comptes) : le service gratuit Render se met en veille après environ 15 minutes d'inactivité, donc le premier chargement peut prendre une minute ; les projets Supabase gratuits peuvent être mis en pause après une période d'inactivité ; la limitation de débit est en mémoire (une seule instance). Un plan payant ou un domaine personnalisé améliore la fiabilité et le référencement.

## Sécurité

Authentification Supabase Auth + liste blanche serveur · clé `service_role` jamais exposée au navigateur · contrôle du contenu réel des images (signature du fichier) · RLS sur toutes les tables · historique des actions · récupération de compte par lien à usage unique · contrôle d'accès et validation côté serveur · sessions PostgreSQL, cookie `httpOnly`/`secure`/`sameSite` · mots de passe en bcrypt (coût 12 pour les changements) · CSRF : vérification de l'origine + jeton lié à la session · CSP stricte (aucun script inline) · requêtes SQL paramétrées · affichage via `textContent` (pas de XSS) · limitation de débit sur connexion, contact et devis · champ piège anti-spam · en-têtes Helmet · aucune clé dans le JavaScript du navigateur. Pour un volume réel de spam, ajoutez un CAPTCHA.

## Tests effectués

`npm run check` (syntaxe), `npm run smoke` (API, 137 vérifications) et un parcours navigateur Chromium (32 vérifications, ordinateur et mobile 390 px), sur PostgreSQL 16 local. Supabase Auth et Storage sont simulés par `tests/fake-supabase.js` (aucun appel au vrai projet) :

```bash
FAKE_PORT=54399 node tests/fake-supabase.js &
SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_ANON_KEY=test SUPABASE_SERVICE_ROLE_KEY=test npm start &
BASE_URL=http://localhost:3000 TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... FAKE_URL=http://127.0.0.1:54399 TEST_SUPA_PASSWORD=SupaPass-2026-test npm run smoke
```

- **Pages et SEO** : 6 pages en 200, titre/description/canonical, CSP, aucun script inline, sitemap, robots.txt, 404.
- **Devis** : cas invalides refusés, champ piège, origine étrangère (403), référence, JSON malformé.
- **Administration** : 401 sans session, 403 sans jeton CSRF, mauvais mot de passe, CRUD complet (services, projets, témoignages, clients), doublons (409), URL `javascript:` refusée.
- **Devis (admin)** : les 6 statuts, ancien statut refusé, notes, recherche (email, référence, injection SQL sans effet), filtre.
- **Projets** : brouillon invisible du public, publication, galerie (8 maximum), date invalide refusée, projet publié visible avec images et date.
- **Réglages** : liste blanche de clés, validation (WhatsApp, URL), reprise sur le site public, retour aux valeurs par défaut.
- **Images** : PNG accepté ; HTML, faux PNG, SVG, > 5 Mo, absence de jeton CSRF refusés ; suppression d'un projet → suppression des images ; message 503 clair si Storage n'est pas configuré.
- **Supabase Auth** : connexion, compte valide mais hors liste blanche refusé, récupération (réponse identique que le compte existe ou non), jeton d'un compte non autorisé refusé, nouveau mot de passe, changement de mot de passe.
- **Historique** : créations, modifications, suppressions, réglages, connexions ; aucun mot de passe enregistré.
- **Navigateur** : connexion, graphiques SVG, recherche/filtre des devis, création d'un brouillon avec image envoyée puis publication visible sur le portfolio public, suppression avec confirmation, modification du slogan visible sur le site, historique, menu mobile, absence de défilement horizontal, zéro erreur JavaScript ni violation CSP.

**Non testé** : la connexion au vrai Supabase Auth/Storage (clés absentes de mon environnement : à vérifier lors de votre première connexion, voir ADMIN-GUIDE.md), l'envoi réel d'email (pas de clé Resend), le lien de récupération reçu par email.

## À valider avant le lancement public

- **Tarifs** (fournis par Jean-Paul) : sites vitrines 25 000 – 40 000 FCFA ; boutiques en ligne 50 000 – 100 000 ; applications web dès 150 000 ; design graphique dès 5 000 ; identité numérique dès 50 000 ; assistance & maintenance 15 000 FCFA par mois (« par mois » à confirmer). Modifiables dans l'administration.
- **Page À propos** (parcours) et **conditions générales** de la page Tarifs : textes sobres et génériques, à relire.
- **Projets** : les trois projets sont des démonstrations ; ajoutez vos vrais projets (liens, code source) et décochez « démonstration » pour eux.
- **Réseaux sociaux** : seul GitHub est connu ; ajoutez les autres via `SOCIAL_*`.
- Image de partage : `public/og-image.png` (1200×630), à remplacer par votre logo si vous en avez un.


## Version 3.0 (refonte bilingue)

Voir `CHANGELOG.md`. Textes FR/EN : `lib/i18n.js` ; contenu initial des services et formules : `lib/content.js` ; pages : `views/` (jetons `{{t.cle}}`, `{{p:page}}`) ; pages assemblées par `lib/pages.js`. Ajouter une langue ou une page = ajouter ses textes dans `lib/i18n.js` (une clé manquante empêche le démarrage, ce qui évite tout texte vide en production).
