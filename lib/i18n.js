// Textes du site en français et en anglais.
//  - `t`      : textes insérés dans les gabarits HTML ({{t.cle.sous_cle}}), HTML de confiance (écrit ici, jamais saisi par un visiteur).
//  - `client` : textes utilisés par le JavaScript des pages (injectés en JSON non exécutable).
//  - `routes` : URL de chaque page. Les URL françaises existantes (déjà soumises à Google) restent inchangées.
const routes = {
  fr: { home: "/", about: "/a-propos", services: "/services", process: "/processus", portfolio: "/portfolio", pricing: "/tarifs", testimonials: "/temoignages", contact: "/contact" },
  en: { home: "/en", about: "/en/about", services: "/en/services", process: "/en/process", portfolio: "/en/portfolio", pricing: "/en/pricing", testimonials: "/en/testimonials", contact: "/en/contact" }
};

const grad = (text) => `<span class="grad">${text}</span>`;

const fr = {
  lang: "fr", locale: "fr_FR", htmlLang: "fr",
  slogan: "Transformer vos idées en expériences numériques.",
  brandLine: "Agence digitale | Développement web | Solutions numériques",
  nav: { label: "Navigation principale", home: "Accueil", about: "À propos", services: "Services", process: "Processus", portfolio: "Portfolio", pricing: "Tarifs", testimonials: "Témoignages", contact: "Contact",
    quote: "Démarrer un projet", skip: "Aller au contenu", theme: "Changer de thème clair/sombre", lang: "English version", langShort: "EN", menu: "Ouvrir le menu" },
  meta: {
    home: { title: "SIPOKTECH DIGITAL — Agence digitale et développement web à Lomé, Togo", description: "SIPOKTECH DIGITAL crée des sites web, boutiques en ligne et applications modernes, rapides et accessibles pour entrepreneurs, startups et entreprises. Devis sur demande." },
    about: { title: "À propos — Jean-Paul AHITE | SIPOKTECH DIGITAL", description: "L'histoire, la vision, la mission, les valeurs et la méthode de travail de SIPOKTECH DIGITAL, fondée par Jean-Paul AHITE à Lomé." },
    services: { title: "Services — Création de sites web, optimisation, maintenance | SIPOKTECH DIGITAL", description: "Développement de sites web, sites vitrines, portfolios, landing pages, design responsive, maintenance, optimisation et développement front-end." },
    process: { title: "Processus de travail — De l'idée à la livraison | SIPOKTECH DIGITAL", description: "Notre méthode en 7 étapes : découverte, planification, design, développement, tests, livraison et accompagnement." },
    portfolio: { title: "Portfolio — Projets et démonstrations | SIPOKTECH DIGITAL", description: "Projets réalisés et démonstrations clairement identifiés, avec technologies utilisées, fonctionnalités et liens." },
    pricing: { title: "Tarifs — Formules indicatives en FCFA | SIPOKTECH DIGITAL", description: "Formules STARTER, BUSINESS et PREMIUM et prix indicatifs par prestation en FCFA. Devis personnalisé sur demande." },
    testimonials: { title: "Témoignages clients vérifiés | SIPOKTECH DIGITAL", description: "Avis de clients publiés avec leur autorisation." },
    contact: { title: "Contact et demande de devis | SIPOKTECH DIGITAL", description: "Démarrez un projet : formulaire de devis, WhatsApp, e-mail. SIPOKTECH DIGITAL vous répond rapidement." },
    notfound: { title: "Page introuvable | SIPOKTECH DIGITAL", description: "Cette page n'existe pas ou a été déplacée." }
  },
  home: {
    eyebrow: "Agence digitale · Lomé, Togo · International",
    title: `Nous créons des expériences numériques qui ${grad("font grandir votre activité.")}`,
    lead: "SIPOKTECH DIGITAL conçoit des sites web, boutiques en ligne et solutions numériques modernes, rapides et accessibles pour les entrepreneurs, startups, entreprises et organisations.",
    cta1: "Découvrir nos services", cta2: "Démarrer un projet",
    skills: "Compétences principales",
    aboutEyebrow: "L'agence", aboutTitle: `Une agence digitale ${grad("à taille humaine")}`,
    aboutText: "Notre mission : accompagner les particuliers, entrepreneurs, startups et entreprises dans leur transformation numérique grâce à des solutions web modernes, performantes et accessibles.",
    pillar1: "Moderne", pillar1t: "Des interfaces actuelles, soignées et cohérentes avec votre marque.",
    pillar2: "Performant", pillar2t: "Des pages légères, rapides à charger, pensées pour le mobile.",
    pillar3: "Accessible", pillar3t: "Un code propre, lisible par tous, et des prix annoncés clairement.",
    servicesEyebrow: "Nos services", servicesTitle: `Des solutions numériques ${grad("sur mesure")}`,
    servicesLead: "Du site vitrine à l'application web, chaque projet est adapté à votre activité et à votre budget.",
    allServices: "Voir tous les services", seePricing: "Voir les tarifs",
    projectsEyebrow: "Portfolio", projectsTitle: `Projets ${grad("récents")}`, projectsLead: "Les projets de démonstration sont clairement identifiés comme tels.", allProjects: "Voir tout le portfolio",
    statsEyebrow: "En chiffres", statsTitle: `Des chiffres ${grad("réels")}`,
    testiEyebrow: "Témoignages", testiTitle: `Ils nous ont ${grad("fait confiance")}`,
    processEyebrow: "Méthode", processTitle: `Un projet en ${grad("7 étapes")}`, processLead: "Une collaboration claire, de la première discussion à l'accompagnement après la livraison.", processLink: "Découvrir notre processus",
    ctaTitle: "Prêt à lancer votre projet ?", ctaText: "Décrivez votre besoin : vous recevez un devis personnalisé, sans engagement."
  },
  about: {
    eyebrow: "À propos", title: `Le numérique, ${grad("pensé pour vous")}`,
    lead: "Je suis Jean-Paul AHITE, fondateur de SIPOKTECH DIGITAL à Lomé, au Togo. J'aide les entrepreneurs, commerces et organisations à construire une présence en ligne claire, utile et agréable à utiliser.",
    storyTitle: "Notre histoire",
    story1: "SIPOKTECH DIGITAL est née à Lomé de l'envie de rendre les outils numériques accessibles aux entrepreneurs et aux commerces de proximité, au Togo comme à l'international.",
    story2: "Je développe mes compétences en construisant des projets concrets : un portfolio, une boutique en ligne, une radio web, un planificateur d'études. Chaque projet m'apprend à mieux répondre aux besoins réels des clients.",
    story3: "Ce que je ne sais pas encore faire, je le dis. Ce que je promets, je le tiens : chaque devis précise ce qui est inclus avant de commencer.",
    founderTitle: "Le fondateur", founderName: "Jean-Paul AHITE", founderRole: "Fondateur et développeur web — Lomé, Togo",
    founderText: "Développeur web autodidacte, je conçois des sites et des applications avec HTML, CSS, JavaScript, Node.js et PostgreSQL. Je continue d'apprendre chaque jour.", cvButton: "Télécharger mon CV (PDF)", cvWord: "Version Word",
    skillsTitle: "Compétences techniques", skillsNow: "Technologies utilisées", skillsLearning: "En apprentissage",
    visionTitle: "Notre vision", visionText: "Un numérique accessible à tous : des solutions adaptées aux moyens de chaque client, avec la même exigence de qualité.",
    missionTitle: "Notre mission", missionText: "Accompagner les particuliers, entrepreneurs, startups et entreprises dans leur transformation numérique grâce à des solutions web modernes, performantes et accessibles.",
    valuesEyebrow: "Valeurs", valuesTitle: `Ce qui guide ${grad("notre travail")}`,
    v1: "Clarté", v1t: "Des explications simples, un devis lisible, aucun jargon inutile.",
    v2: "Qualité", v2t: "Des sites rapides, adaptés au mobile, soignés dans les détails.",
    v3: "Écoute", v3t: "Votre activité d'abord : la technologie est au service de vos objectifs.",
    v4: "Honnêteté", v4t: "Des démonstrations présentées comme telles, des prix annoncés à l'avance.",
    methodTitle: "Méthode de travail", methodText: "Chaque projet suit le même parcours en 7 étapes : découverte, planification, design, développement, tests, livraison et accompagnement.", methodLink: "Voir le processus détaillé",
    ctaTitle: "Travaillons ensemble", ctaText: "Décrivez votre projet, je reviens vers vous avec une proposition.", ctaButton: "Démarrer un projet", ctaPortfolio: "Voir le portfolio"
  },
  services: {
    eyebrow: "Services", title: `Ce que nous pouvons ${grad("créer pour vous")}`,
    lead: "Sites web, landing pages, design responsive, maintenance, optimisation et développement front-end : des prestations claires, avec avantages, fonctionnalités et technologies.",
    noscript: "Activez JavaScript pour afficher la liste des services, ou contactez-nous directement par WhatsApp.",
    ctaTitle: "Un besoin particulier ?", ctaText: "Votre projet ne correspond à aucune case ? Décrivez-le, nous construirons une offre adaptée.", ctaButton: "Décrire mon projet", ctaPricing: "Voir les tarifs"
  },
  process: {
    eyebrow: "Processus", title: `De l'idée à la ${grad("livraison")}`,
    lead: "Une méthode simple en 7 étapes pour que vous sachiez toujours où en est votre projet.",
    s1: "Découverte", s1t: "Nous comprenons vos besoins, votre activité, vos clients et vos objectifs.",
    s2: "Planification", s2t: "Nous organisons le projet : périmètre, étapes, délais et devis écrit.",
    s3: "Conception", s3t: "Nous concevons l'interface : structure des pages, couleurs, typographies et maquettes validées avec vous.",
    s4: "Développement", s4t: "Nous développons le site avec un code propre, rapide et adapté à tous les écrans.",
    s5: "Tests", s5t: "Nous testons les pages, les formulaires et l'affichage sur mobile, puis corrigeons.",
    s6: "Livraison", s6t: "Nous mettons le projet en ligne et vous expliquons comment l'utiliser.",
    s7: "Accompagnement", s7t: "Nous restons disponibles après la livraison : corrections, conseils et évolutions.",
    ctaTitle: "Prêt à commencer par l'étape 1 ?", ctaText: "Décrivez votre projet : nous reprenons contact pour la phase de découverte.", ctaButton: "Démarrer un projet"
  },
  portfolio: {
    eyebrow: "Portfolio", title: `Projets et ${grad("démonstrations")}`,
    lead: "Nous distinguons clairement les projets réalisés pour de vrais clients des démonstrations qui illustrent ce que nous savons faire.",
    filters: "Filtrer les projets", all: "Tous les projets", website: "Sites web", business: "Entreprises", landing: "Landing pages", portfolio: "Portfolios personnels", other: "Autres",
    noscript: "Activez JavaScript pour afficher les projets."
  },
  pricing: {
    eyebrow: "Tarifs", title: `Des formules ${grad("claires, en FCFA")}`,
    lead: "Ces formules et montants sont indicatifs. Le tarif définitif est fixé dans un devis écrit, après validation de votre besoin et du périmètre.",
    plansTitle: "Nos formules", perServiceTitle: "Prix indicatifs par prestation",
    noscript: "Activez JavaScript pour afficher les tarifs, ou demandez un devis par WhatsApp.",
    conditionsTitle: "Conditions générales",
    c1: "Les prix affichés sont indicatifs : le montant final est fixé dans un devis écrit.",
    c2: "Le devis précise le contenu, les délais et les modalités de paiement avant tout démarrage.",
    c3: "Les délais dépendent de la complexité du projet et de la rapidité de vos retours.",
    c4: "Le nom de domaine, l'hébergement et les services tiers éventuels ne sont pas inclus, sauf mention contraire dans le devis.",
    c5: "Toute demande supplémentaire en cours de projet fait l'objet d'un accord préalable.",
    boxTitle: "Devis personnalisé", boxText: "Indiquez la prestation, votre besoin, votre budget et votre délai : nous vous répondons avec une proposition adaptée.", boxButton: "Démarrer un projet"
  },
  testimonials: {
    eyebrow: "Témoignages", title: `Avis de clients ${grad("vérifiés")}`,
    lead: "Chaque témoignage est publié avec l'autorisation du client. Nous ne publions aucun faux avis.",
    empty: "Les premiers avis de clients seront publiés ici, avec leur accord. En attendant, découvrez nos projets et nos démonstrations.",
    ctaButton: "Voir le portfolio"
  },
  contact: {
    eyebrow: "Contact", title: `Parlons de ${grad("votre projet")}`,
    lead: "Demandez un devis, posez une question ou écrivez-nous directement sur WhatsApp.",
    infoTitle: "Nous joindre", whatsapp1: "WhatsApp principal", whatsapp2: "WhatsApp secondaire", email: "E-mail", location: "Localisation", portfolioLabel: "Portfolio", portfolioValue: "Voir nos projets",
    tabQuote: "Démarrer un projet", tabMessage: "Poser une question",
    service: "Type de projet *", servicePlaceholder: "Choisir un type de projet…", name: "Nom complet *", email2: "Adresse e-mail *", phone: "Téléphone / WhatsApp", company: "Entreprise (facultatif)",
    description: "Décrivez votre besoin *", descriptionHint: "(20 caractères minimum)", descriptionPh: "Votre activité, ce que vous attendez du projet, exemples de sites que vous aimez…",
    budget: "Budget indicatif *", deadline: "Délai souhaité *", choose: "Choisir…", consent: "J'accepte d'être recontacté au sujet de ma demande. *", send: "Envoyer ma demande",
    successTitle: "Demande enregistrée", successHelp: "Vous pouvez aussi nous écrire directement pour accélérer le traitement :", successWa: "Envoyer sur WhatsApp", again: "Nouvelle demande",
    msgSubject: "Sujet *", msgMessage: "Message *", msgSend: "Envoyer le message", honey: "Ne pas remplir"
  },
  footer: { pages: "Le site", contact: "Contact", rights: "SIPOKTECH DIGITAL — Jean-Paul AHITE", admin: "Administration", text: "Agence digitale · Développement web · Solutions numériques" },
  notfound: { eyebrow: "Erreur 404", title: `Page ${grad("introuvable")}`, lead: "Cette page n'existe pas ou a été déplacée. Retournez à l'accueil ou choisissez une rubrique.", home: "Retour à l'accueil", services: "Voir les services", contact: "Nous contacter" },
  client: {
    loading: "Chargement…", loadError: "Impossible de charger ce contenu pour le moment. Écrivez-nous sur WhatsApp.",
    noServices: "Les services seront bientôt publiés.", noProjects: "Les projets seront bientôt ajoutés.", noMatch: "Aucun projet ne correspond à ce filtre.", noPlans: "Les formules seront bientôt publiées. Demandez un devis personnalisé.",
    requestQuote: "Demander un devis", quoteOnRequest: "Sur devis", from: "À partir de", between: "Entre", advantages: "Avantages", features: "Fonctionnalités", technologies: "Technologies", included: "Inclus",
    demo: "Démonstration", real: "Projet réel", featured: "À la une", viewProject: "Voir le projet", viewDemo: "Voir la démonstration", source: "Code source", doneIn: "Réalisé en {d}",
    projectShown: "{n} projet(s) affiché(s)", mainFeatures: "Fonctionnalités principales", enlarge: "Agrandir une image de {t}", preview: "Aperçu du projet {t}",
    popular: "Recommandée", choosePlan: "Choisir cette formule", stars: "{n} sur 5",
    statProjects: "Projets publiés", statReal: "Projets réels livrés", statServices: "Prestations proposées", statTestimonials: "Avis clients vérifiés",
    sending: "Envoi en cours…", sendQuote: "Envoyer ma demande", sendMessage: "Envoyer le message", formError: "Vérifiez les champs du formulaire puis réessayez.",
    whatsappText: "Bonjour, je vous contacte depuis le site SIPOKTECH DIGITAL.", quoteSent: "Bonjour, je viens d'envoyer {r} pour « {s} » sur le site SIPOKTECH DIGITAL.", quoteSentNoService: "Bonjour, je viens d'envoyer {r} sur le site SIPOKTECH DIGITAL.",
    quoteRef: "la demande de devis {r}", quoteGeneric: "ma demande de devis", other: "Autre besoin / projet sur mesure",
    menuOpen: "Ouvrir le menu", menuClose: "Fermer le menu", themeLight: "Passer en mode clair", themeDark: "Passer en mode sombre",
    social: { github: "GitHub", linkedin: "LinkedIn", telegram: "Telegram", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", x: "X" },
    budgets: { "Moins de 25 000 FCFA": "Moins de 25 000 FCFA", "25 000 – 50 000 FCFA": "25 000 – 50 000 FCFA", "50 000 – 100 000 FCFA": "50 000 – 100 000 FCFA", "100 000 – 200 000 FCFA": "100 000 – 200 000 FCFA", "Plus de 200 000 FCFA": "Plus de 200 000 FCFA", "À discuter": "À discuter" },
    deadlines: { "Urgent (moins de 2 semaines)": "Urgent (moins de 2 semaines)", "Environ 1 mois": "Environ 1 mois", "2 à 3 mois": "2 à 3 mois", "Pas de contrainte": "Pas de contrainte" },
    unit: { "/ mois": "/ mois" }
  }
};

const en = {
  lang: "en", locale: "en_US", htmlLang: "en",
  slogan: "Turning Ideas Into Digital Experiences.",
  brandLine: "Digital Agency | Web Development | Digital Solutions",
  nav: { label: "Main navigation", home: "Home", about: "About", services: "Services", process: "Process", portfolio: "Portfolio", pricing: "Pricing", testimonials: "Testimonials", contact: "Contact",
    quote: "Start a Project", skip: "Skip to content", theme: "Toggle light/dark theme", lang: "Version française", langShort: "FR", menu: "Open menu" },
  meta: {
    home: { title: "SIPOKTECH DIGITAL — Digital Agency & Web Development, Lomé, Togo", description: "SIPOKTECH DIGITAL builds modern, fast and accessible websites, online stores and digital solutions for entrepreneurs, startups and businesses. Quotes on request." },
    about: { title: "About — Jean-Paul AHITE | SIPOKTECH DIGITAL", description: "The story, vision, mission, values and working method of SIPOKTECH DIGITAL, founded by Jean-Paul AHITE in Lomé." },
    services: { title: "Services — Web Development, Optimization, Maintenance | SIPOKTECH DIGITAL", description: "Website development, business websites, portfolios, landing pages, responsive design, maintenance, optimization and frontend development." },
    process: { title: "Work Process — From Idea to Delivery | SIPOKTECH DIGITAL", description: "Our 7-step method: discovery, planning, design, development, testing, delivery and support." },
    portfolio: { title: "Portfolio — Projects and Demos | SIPOKTECH DIGITAL", description: "Delivered projects and clearly labelled demos, with technologies, features and links." },
    pricing: { title: "Pricing — Indicative Plans in FCFA | SIPOKTECH DIGITAL", description: "STARTER, BUSINESS and PREMIUM plans and indicative prices per service in FCFA. Custom quote on request." },
    testimonials: { title: "Verified Client Testimonials | SIPOKTECH DIGITAL", description: "Client reviews published with their permission." },
    contact: { title: "Contact & Quote Request | SIPOKTECH DIGITAL", description: "Start a project: quote form, WhatsApp, e-mail. SIPOKTECH DIGITAL replies quickly." },
    notfound: { title: "Page not found | SIPOKTECH DIGITAL", description: "This page does not exist or has been moved." }
  },
  home: {
    eyebrow: "Digital agency · Lomé, Togo · Worldwide",
    title: `We Build Digital Experiences That ${grad("Grow Businesses.")}`,
    lead: "SIPOKTECH DIGITAL designs modern, fast and accessible websites, online stores and digital solutions for entrepreneurs, startups, companies and organisations.",
    cta1: "Discover Our Services", cta2: "Start a Project",
    skills: "Core skills",
    aboutEyebrow: "The agency", aboutTitle: `A ${grad("human-sized")} digital agency`,
    aboutText: "Our mission: to support individuals, entrepreneurs, startups and companies in their digital transformation with modern, high-performing and accessible web solutions.",
    pillar1: "Modern", pillar1t: "Current, polished interfaces consistent with your brand.",
    pillar2: "High-performing", pillar2t: "Lightweight pages that load fast and are designed for mobile.",
    pillar3: "Accessible", pillar3t: "Clean code that works for everyone, and prices stated up front.",
    servicesEyebrow: "Our services", servicesTitle: `${grad("Tailor-made")} digital solutions`,
    servicesLead: "From a business website to a web application, every project is adapted to your activity and budget.",
    allServices: "See all services", seePricing: "See pricing",
    projectsEyebrow: "Portfolio", projectsTitle: `${grad("Recent")} projects`, projectsLead: "Demo projects are always clearly labelled as such.", allProjects: "See the full portfolio",
    statsEyebrow: "By the numbers", statsTitle: `${grad("Real")} figures`,
    testiEyebrow: "Testimonials", testiTitle: `They ${grad("trusted us")}`,
    processEyebrow: "Method", processTitle: `A project in ${grad("7 steps")}`, processLead: "Clear collaboration, from the first conversation to support after delivery.", processLink: "Discover our process",
    ctaTitle: "Ready to launch your project?", ctaText: "Describe your needs and receive a personalised quote, with no commitment."
  },
  about: {
    eyebrow: "About", title: `Digital, ${grad("designed for you")}`,
    lead: "I'm Jean-Paul AHITE, founder of SIPOKTECH DIGITAL in Lomé, Togo. I help entrepreneurs, shops and organisations build an online presence that is clear, useful and pleasant to use.",
    storyTitle: "Our story",
    story1: "SIPOKTECH DIGITAL was born in Lomé from a wish to make digital tools accessible to entrepreneurs and local businesses, in Togo and abroad.",
    story2: "I grow my skills by building real projects: a portfolio, an online shop, a web radio, a study planner. Each project teaches me to respond better to clients' real needs.",
    story3: "What I can't do yet, I say so. What I promise, I deliver: every quote states what is included before work begins.",
    founderTitle: "The founder", founderName: "Jean-Paul AHITE", founderRole: "Founder & web developer — Lomé, Togo",
    founderText: "A self-taught web developer, I build websites and applications with HTML, CSS, JavaScript, Node.js and PostgreSQL. I keep learning every day.", cvButton: "Download my CV (PDF, in French)", cvWord: "Word version",
    skillsTitle: "Technical skills", skillsNow: "Technologies in use", skillsLearning: "Currently learning",
    visionTitle: "Our vision", visionText: "Digital that is accessible to everyone: solutions adapted to each client's means, with the same quality standards.",
    missionTitle: "Our mission", missionText: "To support individuals, entrepreneurs, startups and companies in their digital transformation through modern, high-performing and accessible web solutions.",
    valuesEyebrow: "Values", valuesTitle: `What guides ${grad("our work")}`,
    v1: "Clarity", v1t: "Simple explanations, a readable quote, no needless jargon.",
    v2: "Quality", v2t: "Fast, mobile-friendly websites, polished down to the details.",
    v3: "Listening", v3t: "Your business comes first: technology serves your goals.",
    v4: "Honesty", v4t: "Demos presented as demos, prices announced in advance.",
    methodTitle: "Working method", methodText: "Every project follows the same 7-step path: discovery, planning, design, development, testing, delivery and support.", methodLink: "See the detailed process",
    ctaTitle: "Let's work together", ctaText: "Describe your project and I'll come back to you with a proposal.", ctaButton: "Start a Project", ctaPortfolio: "View the portfolio"
  },
  services: {
    eyebrow: "Services", title: `What we can ${grad("build for you")}`,
    lead: "Websites, landing pages, responsive design, maintenance, optimization and frontend development: clear services with benefits, features and technologies.",
    noscript: "Enable JavaScript to display the list of services, or contact us directly on WhatsApp.",
    ctaTitle: "A specific need?", ctaText: "Your project doesn't fit any box? Describe it and we'll build a tailored offer.", ctaButton: "Describe my project", ctaPricing: "See pricing"
  },
  process: {
    eyebrow: "Process", title: `From idea to ${grad("delivery")}`,
    lead: "A simple 7-step method so you always know where your project stands.",
    s1: "Discovery", s1t: "We understand your needs, your business, your customers and your goals.",
    s2: "Planning", s2t: "We organise the project: scope, milestones, timeline and a written quote.",
    s3: "Design", s3t: "We design the interface: page structure, colours, typography and mock-ups approved with you.",
    s4: "Development", s4t: "We build the site with clean, fast code that fits every screen.",
    s5: "Testing", s5t: "We test pages, forms and mobile display, then fix what needs fixing.",
    s6: "Delivery", s6t: "We put the project online and show you how to use it.",
    s7: "Support", s7t: "We stay available after delivery: fixes, advice and improvements.",
    ctaTitle: "Ready to start with step 1?", ctaText: "Describe your project and we'll get back to you for the discovery phase.", ctaButton: "Start a Project"
  },
  portfolio: {
    eyebrow: "Portfolio", title: `Projects and ${grad("demos")}`,
    lead: "We clearly separate projects delivered for real clients from demos that illustrate what we can do.",
    filters: "Filter projects", all: "All Projects", website: "Websites", business: "Business", landing: "Landing Pages", portfolio: "Personal Portfolio", other: "Other",
    noscript: "Enable JavaScript to display the projects."
  },
  pricing: {
    eyebrow: "Pricing", title: `${grad("Clear plans")}, in FCFA`,
    lead: "These plans and amounts are indicative. The final price is set in a written quote, once your needs and the scope are confirmed.",
    plansTitle: "Our plans", perServiceTitle: "Indicative prices per service",
    noscript: "Enable JavaScript to display pricing, or request a quote on WhatsApp.",
    conditionsTitle: "General terms",
    c1: "Displayed prices are indicative: the final amount is set in a written quote.",
    c2: "The quote states the content, deadlines and payment terms before any work starts.",
    c3: "Deadlines depend on project complexity and how quickly you give feedback.",
    c4: "Domain name, hosting and any third-party services are not included unless the quote says otherwise.",
    c5: "Any additional request during the project requires prior agreement.",
    boxTitle: "Custom quote", boxText: "Tell us the service, your needs, budget and deadline and we'll reply with a tailored proposal.", boxButton: "Start a Project"
  },
  testimonials: {
    eyebrow: "Testimonials", title: `${grad("Verified")} client reviews`,
    lead: "Every testimonial is published with the client's permission. We never publish fake reviews.",
    empty: "The first client reviews will be published here, with their consent. Meanwhile, explore our projects and demos.",
    ctaButton: "View the portfolio"
  },
  contact: {
    eyebrow: "Contact", title: `Let's talk about ${grad("your project")}`,
    lead: "Request a quote, ask a question or write to us directly on WhatsApp.",
    infoTitle: "Get in touch", whatsapp1: "Main WhatsApp", whatsapp2: "Second WhatsApp", email: "E-mail", location: "Location", portfolioLabel: "Portfolio", portfolioValue: "See our projects",
    tabQuote: "Start a Project", tabMessage: "Ask a question",
    service: "Project type *", servicePlaceholder: "Choose a project type…", name: "Full name *", email2: "E-mail address *", phone: "Phone / WhatsApp", company: "Company (optional)",
    description: "Describe your needs *", descriptionHint: "(20 characters minimum)", descriptionPh: "Your business, what you expect from the project, examples of sites you like…",
    budget: "Indicative budget *", deadline: "Desired timeline *", choose: "Choose…", consent: "I agree to be contacted about my request. *", send: "Send my request",
    successTitle: "Request received", successHelp: "You can also message us directly to speed things up:", successWa: "Send on WhatsApp", again: "New request",
    msgSubject: "Subject *", msgMessage: "Message *", msgSend: "Send message", honey: "Do not fill in"
  },
  footer: { pages: "Site", contact: "Contact", rights: "SIPOKTECH DIGITAL — Jean-Paul AHITE", admin: "Admin", text: "Digital Agency · Web Development · Digital Solutions" },
  notfound: { eyebrow: "Error 404", title: `Page ${grad("not found")}`, lead: "This page doesn't exist or has been moved. Go back home or pick a section.", home: "Back to home", services: "View services", contact: "Contact us" },
  client: {
    loading: "Loading…", loadError: "This content can't be loaded right now. Write to us on WhatsApp.",
    noServices: "Services will be published soon.", noProjects: "Projects will be added soon.", noMatch: "No project matches this filter.", noPlans: "Plans will be published soon. Request a custom quote.",
    requestQuote: "Request a Quote", quoteOnRequest: "On quote", from: "From", between: "Between", advantages: "Benefits", features: "Features", technologies: "Technologies", included: "Included",
    demo: "Demo", real: "Client project", featured: "Featured", viewProject: "View Project", viewDemo: "View demo", source: "Source code", doneIn: "Completed {d}",
    projectShown: "{n} project(s) shown", mainFeatures: "Main features", enlarge: "Enlarge an image of {t}", preview: "Preview of the {t} project",
    popular: "Recommended", choosePlan: "Choose this plan", stars: "{n} out of 5",
    statProjects: "Published projects", statReal: "Client projects delivered", statServices: "Services offered", statTestimonials: "Verified client reviews",
    sending: "Sending…", sendQuote: "Send my request", sendMessage: "Send message", formError: "Please check the form fields and try again.",
    whatsappText: "Hello, I'm contacting you from the SIPOKTECH DIGITAL website.", quoteSent: "Hello, I just sent {r} for “{s}” on the SIPOKTECH DIGITAL website.", quoteSentNoService: "Hello, I just sent {r} on the SIPOKTECH DIGITAL website.",
    quoteRef: "quote request {r}", quoteGeneric: "my quote request", other: "Other need / custom project",
    menuOpen: "Open menu", menuClose: "Close menu", themeLight: "Switch to light mode", themeDark: "Switch to dark mode",
    social: { github: "GitHub", linkedin: "LinkedIn", telegram: "Telegram", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", x: "X" },
    budgets: { "Moins de 25 000 FCFA": "Under 25,000 FCFA", "25 000 – 50 000 FCFA": "25,000 – 50,000 FCFA", "50 000 – 100 000 FCFA": "50,000 – 100,000 FCFA", "100 000 – 200 000 FCFA": "100,000 – 200,000 FCFA", "Plus de 200 000 FCFA": "Over 200,000 FCFA", "À discuter": "To be discussed" },
    deadlines: { "Urgent (moins de 2 semaines)": "Urgent (under 2 weeks)", "Environ 1 mois": "About 1 month", "2 à 3 mois": "2 to 3 months", "Pas de contrainte": "No constraint" },
    unit: { "/ mois": "/ month" }
  }
};

const dictionaries = { fr, en };

// Lecture d'une clé « a.b.c » ; une clé absente lève une erreur au démarrage (jamais de texte manquant en production).
function lookup(dict, key) {
  let node = dict;
  for (const part of key.split(".")) {
    if (node === undefined || node === null || typeof node !== "object" || !(part in node)) throw new Error(`Clé de traduction manquante : ${dict.lang}.${key}`);
    node = node[part];
  }
  return node;
}

module.exports = { dictionaries, routes, lookup };
