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
| `SOCIAL_*` | Liens réseaux sociaux (seuls ceux renseignés s'affichent ; GitHub par défaut) |

## Base de données

Tables : `admins`, `projects` (+ `technologies`, `source_url`, `image_url`), `messages`, `services`, `quotes`, `clients`, `testimonials`, `user_sessions`. Le schéma complet est dans `schema.sql` et les migrations ne détruisent aucune donnée existante.

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

Vue d'ensemble (chiffres réels uniquement) · Devis · Messages · Projets · Services & tarifs · Témoignages · Clients · Mon compte (changement de mot de passe).

- Tous les prix du site se modifient dans **Services & tarifs** (prix vide = « sur devis » ; un prix maximum facultatif affiche une fourchette).
- Un projet décoché « démonstration » s'affiche comme **Projet réel** ; sinon comme **Démonstration**.
- Un témoignage n'apparaît sur le site que s'il est **publié**. Aucun n'est fourni : n'ajoutez que de vrais avis, avec l'accord du client. La section reste masquée tant qu'il n'y en a aucun.
- Aucune statistique de visites n'est collectée (pas de traceur) ; le tableau de bord ne compte que les devis et messages enregistrés.

## Déploiement sur Render

1. Remplacez les fichiers du dépôt GitHub par ceux de ce projet et poussez (`git add -A && git commit -m "SIPOKTECH DIGITAL v2" && git push`). Render redéploie automatiquement si l'auto-déploiement est actif.
2. Dans Render → service → **Environment**, vérifiez : `NODE_ENV=production`, `DATABASE_URL` (Supabase *Session pooler*), `SESSION_SECRET`, `ADMIN_*`, `CONTACT_EMAIL`, `SITE_URL`.
3. **Mettez à jour `WHATSAPP_PRIMARY=22878003599` et `WHATSAPP_SECONDARY=22871344338`** : si d'anciennes valeurs y sont enregistrées, elles priment sur les valeurs par défaut du code.
4. Ajoutez `RESEND_API_KEY` (et `SOCIAL_*` si souhaité).
5. Vérifiez `/health`, les 6 pages, un devis de test, puis supprimez-le dans l'administration. Consultez les logs Render en cas d'erreur (`Impossible de démarrer le serveur` = `DATABASE_URL` ou schéma).
6. Search Console : envoyez `https://VOTRE-SITE/sitemap.xml`.

Limites du lancement gratuit (à vérifier dans vos comptes) : le service gratuit Render se met en veille après environ 15 minutes d'inactivité, donc le premier chargement peut prendre une minute ; les projets Supabase gratuits peuvent être mis en pause après une période d'inactivité ; la limitation de débit est en mémoire (une seule instance). Un plan payant ou un domaine personnalisé améliore la fiabilité et le référencement.

## Sécurité

Contrôle d'accès et validation côté serveur · sessions PostgreSQL, cookie `httpOnly`/`secure`/`sameSite` · mots de passe en bcrypt (coût 12 pour les changements) · CSRF : vérification de l'origine + jeton lié à la session · CSP stricte (aucun script inline) · requêtes SQL paramétrées · affichage via `textContent` (pas de XSS) · limitation de débit sur connexion, contact et devis · champ piège anti-spam · en-têtes Helmet · aucune clé dans le JavaScript du navigateur. Pour un volume réel de spam, ajoutez un CAPTCHA.

## Tests effectués

`npm run check` (syntaxe) puis `npm run smoke` (75 vérifications HTTP) et un parcours navigateur Chromium (44 vérifications), sur PostgreSQL 16 local :

- **Pages** : 6 pages en 200, titre/description/canonical, aucun marqueur de gabarit résiduel, CSP présente, aucun script inline, sitemap (6 URL), robots.txt, 404 HTML et JSON.
- **Devis** : 8 cas invalides refusés (nom, email, description, budget, délai, prestation, téléphone, consentement), champ piège, origine étrangère (403), devis valide avec référence, JSON malformé.
- **Administration** : 401 sans session, mauvais mot de passe, 403 sans jeton CSRF, statuts, doublons (409), URL `javascript:` refusée, identifiants invalides, création/modification/masquage/suppression de services, projets, témoignages (publié/non publié), clients, déconnexion.
- **Anti-spam** : limitation de débit (429).
- **Navigateur** : filtres et recherche du portfolio, prestation préremplie depuis un tarif, devis de bout en bout avec référence et lien WhatsApp, menu mobile, absence de défilement horizontal sur 7 pages à 390 px, connexion admin, tous les onglets, création d'un service via l'interface visible ensuite sur le site, zéro erreur JavaScript ni violation CSP.

Non testé : l'envoi réel d'email (pas de clé Resend), le déploiement Render et l'accès à votre base Supabase.

## À valider avant le lancement public

- **Tarifs** (fournis par Jean-Paul) : sites vitrines 25 000 – 40 000 FCFA ; boutiques en ligne 50 000 – 100 000 ; applications web dès 150 000 ; design graphique dès 5 000 ; identité numérique dès 50 000 ; assistance & maintenance 15 000 FCFA par mois (« par mois » à confirmer). Modifiables dans l'administration.
- **Page À propos** (parcours) et **conditions générales** de la page Tarifs : textes sobres et génériques, à relire.
- **Projets** : les trois projets sont des démonstrations ; ajoutez vos vrais projets (liens, code source) et décochez « démonstration » pour eux.
- **Réseaux sociaux** : seul GitHub est connu ; ajoutez les autres via `SOCIAL_*`.
- Une image de partage (`og:image`) n'est pas incluse.
