# Changelog

## 3.0.0 — Refonte « agence digitale » (11 novembre 2026)

**Identité** : palette #07111F / #0B1F36 / #00D9FF / #FFFFFF / #AAB7C4, polices Poppins + Inter, mode sombre/clair (sombre par défaut, choix mémorisé), glassmorphism modéré, icônes SVG, animations au défilement (désactivées avec `prefers-reduced-motion`), logo SVG, image de partage et favicon refaits.

**Site bilingue** : français (URL inchangées : `/`, `/a-propos`, `/services`, `/tarifs`, `/portfolio`, `/contact`) et anglais (`/en`, `/en/about`, `/en/services`, `/en/pricing`, `/en/portfolio`, `/en/contact`). Nouvelles pages : Processus (`/processus`, `/en/process`, chronologie animée en 7 étapes) et Témoignages (`/temoignages`, `/en/testimonials`). `hreflang`, sitemap bilingue, JSON-LD, sélecteur de langue.

**Contenu** : 8 prestations du cahier des charges (avantages, fonctionnalités, technologies) en plus de vos prestations existantes (prix conservés) ; formules STARTER / BUSINESS / PREMIUM ; filtres du portfolio (All / Websites / Business / Landing Pages / Personal Portfolio) ; statistiques d'accueil réelles (masquées si nulles) ; témoignages jamais affichés sans publication.

**Base de données** (migration additive dans `schema.sql`, exécutée au démarrage, aucune donnée supprimée) : colonnes `*_en`, `advantages`, `technologies` (services) ; `kind`, `features`, `category_en`, `description_en` (projets) ; `rating`, `testimonial_date`, `photo_url`, `photo_consent`, `content_en` (témoignages) ; table `pricing_plans` avec RLS. Le contenu initial (`lib/content.js`) n'est ajouté qu'une fois (marqueur `seed_v4`) et ne remplace jamais vos modifications.

**Administration** : écran « Formules tarifaires », champs anglais partout, témoignages enrichis, type de projet, Telegram, écran de chargement et message de nouvelle tentative (correctif « /admin ne s'affiche pas »), fichiers versionnés, lien « Administration » discret dans le pied de page.

**Tests** : `npm run smoke` (187 vérifications).
