import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

const pageTranslations = {
  en: {
    pillars: [
      { title: "One Pi Identity", text: "Use one verified Pi-first identity across services." },
      { title: "One Pi Wallet", text: "Access Pi pricing, payments, and utility through one wallet." },
      { title: "Multiple Services", text: "Commerce, jobs, health, education, transport, housing, media, and more connect through one hub." },
    ],
    servicesKicker: "SMAJ PI HUB SERVICES", servicesTitle: "15 Connected Services, One Familiar Direction",
    servicesText: "Quickly understand what each platform does, what is live, and how everything fits into the Pi-powered hub.",
    live: "LIVE", inProgress: "IN PROGRESS", soon: "SOON", mvpKicker: "MVP STARTS HERE",
    mvpTitle: "SMAJ Store Is the First Marketplace Layer", mvpText: "A trusted marketplace where users discover products, sellers list items, and Pi payments become practical.",
    viewStore: "View Store Service", mvpFeatures: ["Product Listings", "Buyer/Seller Chat", "Pi Payment Flow", "Dispute Support", "Reviews & Ratings", "Dispute Support"],
    howKicker: "HOW IT WORKS", howTitle: "A Simple Flow Users Can Follow",
    steps: [
      { title: "Connect", text: "Login with Pi and enter SMAJ PI HUB." }, { title: "Verify", text: "Use identity and provider checks to build trust." },
      { title: "Choose", text: "Open marketplace, jobs, health, education, housing, media, or other services." }, { title: "Use Pi", text: "Buy, sell, and access services through trusted flows." },
    ],
    trustKicker: "TRUST LAYER", trustTitle: "Built Around Verified Participation", trustText: "Trust, clear access, marketplace safety, and real Pi utility remain practical priorities.",
    trustFeatures: [
      { title: "Verified Access", text: "Pi-first identity signals reduce fake participation." }, { title: "Marketplace Safety", text: "Escrow, reviews, ratings, and dispute support shape the marketplace." },
      { title: "AI Guidance", text: "An assistant helps users find services and next steps." }, { title: "Clear Status", text: "Labels show which services are live or planned." },
    ],
    finalTitle: "One Pi Identity. One Wallet. Multiple Services. Real Utility.", readWhitePaper: "Read White Paper",
  },
  fr: {
    pillars: [
      { title: "Une identité Pi", text: "Utilisez une identité Pi vérifiée dans tous les services." },
      { title: "Un portefeuille Pi", text: "Accédez aux prix, paiements et utilités Pi avec un seul portefeuille." },
      { title: "Plusieurs services", text: "Commerce, emploi, santé, éducation, transport, logement et médias sont réunis dans un seul hub." },
    ],
    servicesKicker: "SERVICES SMAJ PI HUB", servicesTitle: "15 services connectés, une direction commune",
    servicesText: "Comprenez rapidement chaque plateforme, les services actifs et leur place dans le hub Pi.",
    live: "ACTIF", inProgress: "EN COURS", soon: "BIENTÔT", mvpKicker: "LE MVP COMMENCE ICI",
    mvpTitle: "SMAJ Store est la première place de marché", mvpText: "Un marché fiable où les utilisateurs trouvent des produits, les vendeurs publient leurs offres et les paiements Pi deviennent pratiques.",
    viewStore: "Voir le service Store", mvpFeatures: ["Fiches produits", "Chat acheteur/vendeur", "Paiement Pi", "Gestion des litiges", "Avis et notes", "Assistance litiges"],
    howKicker: "COMMENT ÇA MARCHE", howTitle: "Un parcours simple à suivre",
    steps: [
      { title: "Connexion", text: "Connectez-vous avec Pi et accédez à SMAJ PI HUB." }, { title: "Vérification", text: "Les contrôles d’identité et de prestataire renforcent la confiance." },
      { title: "Choix", text: "Ouvrez le marché, l’emploi, la santé, l’éducation, le logement ou les médias." }, { title: "Utilisation de Pi", text: "Achetez, vendez et accédez aux services avec Pi." },
    ],
    trustKicker: "COUCHE DE CONFIANCE", trustTitle: "Conçu autour d’une participation vérifiée", trustText: "La confiance, la sécurité du marché et l’utilité réelle de Pi restent prioritaires.",
    trustFeatures: [
      { title: "Accès vérifié", text: "L’identité Pi limite les faux participants." }, { title: "Sécurité du marché", text: "Séquestre, avis, notes et assistance structurent le marché." },
      { title: "Aide par IA", text: "Un assistant aide à trouver les services et les prochaines étapes." }, { title: "Statut clair", text: "Des étiquettes indiquent les services actifs ou planifiés." },
    ],
    finalTitle: "Une identité Pi. Un portefeuille. Plusieurs services. Une utilité réelle.", readWhitePaper: "Lire le livre blanc",
  },
} as const;

const footerTranslations = {
  en: { description: "Built for Pi wallet access, with SMAJ Token utility expanding across the ecosystem.", platform: "Platform", trust: "Trust & Safety", company: "Company", programs: "Programs", affiliate: "Affiliate Program", collaborate: "Collaborate With Us", partners: "Partners", community: "Community", developers: "Developers", keyServices: "Key Services", viewAll: "View All Services", social: "Social", poweredBy: "Powered By SMAJ Ecosystem", privacy: "Privacy Policy", terms: "Terms & Conditions", cookies: "Cookie Policy", reportAbuse: "Report Abuse", sellerAgreement: "Seller Agreement", rights: "All rights reserved.", scrollTop: "Scroll to top" },
  fr: { description: "Conçu pour le portefeuille Pi et l’utilité croissante du SMAJ Token.", platform: "Plateforme", trust: "Confiance et sécurité", company: "Entreprise", programs: "Programmes", affiliate: "Programme d’affiliation", collaborate: "Collaborer avec nous", partners: "Partenaires", community: "Communauté", developers: "Développeurs", keyServices: "Services principaux", viewAll: "Voir tous les services", social: "Réseaux sociaux", poweredBy: "Propulsé par SMAJ Ecosystem", privacy: "Confidentialité", terms: "Conditions générales", cookies: "Politique des cookies", reportAbuse: "Signaler un abus", sellerAgreement: "Accord vendeur", rights: "Tous droits réservés.", scrollTop: "Retour en haut" },
} as const;

const resources = {
  en: {
    translation: {
      nav: {
        home: "Home",
        about: "About",
        services: "Services",
        whitePaper: "White Paper",
        howItWorks: "How It Works",
        join: "Apply to Join",
        contact: "Contact",
        dashboard: "Go to Dashboard",
        login: "Login with Pi",
        signingIn: "Signing in...",
      },
      home: {
        ...pageTranslations.en,
        kicker: "ONE PI IDENTITY. ONE WALLET. MULTIPLE SERVICES.",
        description:
          "SMAJ PI HUB connects verified users to marketplace, services, opportunities, and daily digital tools through one Pi identity and one Pi wallet.",
        explore: "Explore Services",
        promise: "CLEAR PRODUCT PROMISE",
        promiseTitle: "One Access Point for Real Pi Utility",
        promiseText:
          "The public page explains the platform. The private dashboard becomes the workspace where users actually explore, manage, and use SMAJ services.",
      },
      footer: footerTranslations.en,
      language: {
        label: "Language",
        english: "English",
        french: "Français",
      },
    },
  },
  fr: {
    translation: {
      nav: {
        home: "Accueil",
        about: "À propos",
        services: "Services",
        whitePaper: "Livre blanc",
        howItWorks: "Fonctionnement",
        join: "Nous rejoindre",
        contact: "Contact",
        dashboard: "Accéder au tableau de bord",
        login: "Se connecter avec Pi",
        signingIn: "Connexion...",
      },
      home: {
        ...pageTranslations.fr,
        kicker: "UNE IDENTITÉ PI. UN PORTEFEUILLE. PLUSIEURS SERVICES.",
        description:
          "SMAJ PI HUB connecte les utilisateurs vérifiés aux marchés, services, opportunités et outils numériques grâce à une identité Pi et un portefeuille Pi.",
        explore: "Explorer les services",
        promise: "UNE PROMESSE CLAIRE",
        promiseTitle: "Un point d’accès unique à l’utilité réelle de Pi",
        promiseText:
          "La page publique présente la plateforme. Le tableau de bord privé devient l’espace où les utilisateurs explorent, gèrent et utilisent les services SMAJ.",
      },
      footer: footerTranslations.fr,
      language: {
        label: "Langue",
        english: "English",
        french: "Français",
      },
    },
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "fr", "sw", "ar", "zh"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "smaj_language",
    },
  });

i18n.on("languageChanged", (language) => {
  const code = language.split("-")[0].toLowerCase();
  document.documentElement.lang = language;
  document.documentElement.dir = ["ar", "fa", "he", "ur"].includes(code) ? "rtl" : "ltr";
});

export default i18n;
