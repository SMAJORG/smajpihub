import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

const pageTranslations = {
  en: {
    kicker: "SMAJ PI HUB",
    title: "The Economic Utility Layer for the Pi Ecosystem",
    description: "Buy, sell, work, and access real-world services through one verified Pi identity and one Pi wallet.",
    explore: "Explore Services",
    foundationKicker: "THE ECONOMIC FOUNDATION",
    foundationTitle: "Commerce and Work Come First",
    foundationText: "Buy, sell, and find work with Pi.",
    foundationCards: [
      {
        title: "SMAJ Store",
        text: "Buy and sell products with Pi.",
        action: "Explore Store",
      },
      {
        title: "SMAJ PI Jobs",
        text: "Find work or hire talent.",
        action: "Explore Jobs",
      },
    ],
    howKicker: "HOW SMAJ WORKS",
    howTitle: "An Economic Loop Built Around Pi",
    howText:
      "Start with identity, exchange value, and return to a growing economy. Trust features are being developed alongside the marketplace.",
    steps: [
      {
        title: "Pi Identity",
        text: "Sign in with Pi.",
      },
      {
        title: "Discover",
        text: "Find products or work.",
      },
      {
        title: "Transact",
        text: "Use the available Pi payment flow.",
      },
      {
        title: "Complete Exchange",
        text: "Deliver goods or agreed work.",
      },
      {
        title: "Build Trust",
        text: "Reputation tools are planned.",
      },
      {
        title: "Repeat",
        text: "Return for your next opportunity.",
      },
    ],
    trustKicker: "THE TRUST LAYER",
    trustTitle: "Built for Trusted Pi Commerce",
    trustText: "Pi sign-in is live. Additional protections are planned.",
    planned: "PLANNED",
    trustFeatures: [
      {
        title: "Pi Identity Access",
        text: "Pi sign-in; seller reliability is not guaranteed.",
      },
      {
        title: "Seller Verification",
        text: "Business and provider checks.",
      },
      {
        title: "Ratings & Reputation",
        text: "Reviews and reputation tools.",
      },
      {
        title: "Marketplace Safety",
        text: "Fraud prevention and monitoring.",
      },
      {
        title: "Dispute Support",
        text: "Dispute tools; contact us for current support.",
      },
    ],
    servicesKicker: "EXPANDING SERVICE ECOSYSTEM",
    servicesTitle: "A Broader Pi Economy, Built Over Time",
    servicesText:
      "Store and Jobs form the initial foundation. Explore the wider service architecture below, including live services and modules still in development. Status labels show current availability, not a simultaneous launch promise.",
    partnerKicker: "MERCHANTS AND PARTNERS",
    partnerTitle: "Help Build Practical Pi Utility",
    partnerText:
      "Bring products, skills, or a useful service to the ecosystem. Talk with the team about merchant participation and partnerships.",
    merchantAction: "Collaborate With Us",
    partnerAction: "Explore Partnerships",
    resourcesLabel: "White paper and frequently asked questions",
    readWhitePaper: "Read White Paper",
    whitePaperText: "Explore the strategy, phased roadmap, and long-term architecture.",
    faqTitle: "Questions About SMAJ?",
    faqText: "Learn about access, services, and using the hub.",
    finalTitle: "Take Part in the Pi Utility Economy",
  },
  fr: {
    kicker: "SMAJ PI HUB",
    title: "La couche d’utilité économique de l’écosystème Pi",
    description:
      "Achetez, vendez, travaillez et accédez à des services concrets avec une identité Pi vérifiée et un portefeuille Pi.",
    explore: "Explorer les services",
    foundationKicker: "LA BASE ÉCONOMIQUE",
    foundationTitle: "Le commerce et le travail en premier",
    foundationText:
      "SMAJ commence avec Store et Jobs pour relier acheteurs, vendeurs, talents et employeurs. Une identité et un portefeuille Pi partagés accompagnent cette économie.",
    foundationCards: [
      {
        title: "SMAJ Store",
        text: "Découvrez des produits, échangez avec les vendeurs et achetez ou vendez avec Pi.",
        action: "Explorer Store",
      },
      {
        title: "SMAJ PI Jobs",
        text: "Trouvez du travail, proposez vos compétences ou recrutez des talents.",
        action: "Explorer Jobs",
      },
    ],
    howKicker: "COMMENT SMAJ FONCTIONNE",
    howTitle: "Un cycle économique autour de Pi",
    howText:
      "Connectez-vous, échangez de la valeur et revenez dans une économie en expansion. Les outils de confiance se développent avec le marché.",
    steps: [
      {
        title: "Identité Pi",
        text: "Connectez-vous avec Pi.",
      },
      {
        title: "Découvrir",
        text: "Trouvez des produits ou du travail.",
      },
      {
        title: "Payer",
        text: "Utilisez le parcours de paiement Pi disponible.",
      },
      {
        title: "Finaliser l’échange",
        text: "Livrez les biens ou le travail convenu.",
      },
      {
        title: "Renforcer la confiance",
        text: "Des outils de réputation sont prévus.",
      },
      {
        title: "Recommencer",
        text: "Revenez pour une nouvelle opportunité.",
      },
    ],
    trustKicker: "LA CONFIANCE",
    trustTitle: "Conçu pour un commerce Pi de confiance",
    trustText:
      "La connexion Pi est disponible. Les protections supplémentaires du marché sont en développement et indiquées ci-dessous.",
    planned: "PRÉVU",
    trustFeatures: [
      {
        title: "Accès avec une identité Pi",
        text: "Connectez-vous avec Pi. Un compte ne garantit pas la fiabilité d’un vendeur.",
      },
      {
        title: "Vérification des prestataires",
        text: "Des contrôles professionnels et commerciaux renforcés sont prévus.",
      },
      {
        title: "Avis et réputation",
        text: "Des outils supplémentaires d’avis et de réputation sont prévus pour évaluer les échanges passés.",
      },
      {
        title: "Sécurité du marché",
        text: "Des outils supplémentaires de prévention de la fraude et de suivi sont prévus.",
      },
      {
        title: "Assistance litiges",
        text: "La gestion des litiges dans la plateforme est prévue. Contactez l’équipe pour obtenir de l’aide.",
      },
    ],
    servicesKicker: "UN ÉCOSYSTÈME EN EXPANSION",
    servicesTitle: "Une économie Pi qui se construit progressivement",
    servicesText:
      "Store et Jobs constituent la base initiale. Découvrez les services actifs et les modules en développement. Les statuts indiquent la disponibilité actuelle, sans promettre un lancement simultané.",
    partnerKicker: "COMMERÇANTS ET PARTENAIRES",
    partnerTitle: "Construisons une utilité concrète pour Pi",
    partnerText:
      "Proposez des produits, des compétences ou un service utile. Échangez avec l’équipe sur la participation des commerçants et les partenariats.",
    merchantAction: "Collaborer avec nous",
    partnerAction: "Découvrir les partenariats",
    resourcesLabel: "Livre blanc et questions fréquentes",
    readWhitePaper: "Lire le livre blanc",
    whitePaperText: "Découvrez la stratégie, les étapes et l’architecture à long terme.",
    faqTitle: "Des questions sur SMAJ ?",
    faqText: "Découvrez l’accès, les services et le fonctionnement du hub.",
    finalTitle: "Participez à l’économie Pi",
  },
} as const;

const footerTranslations = {
  en: {
    description: "Building a trusted economic utility layer for Pi commerce, work, and real-world services.",
    platform: "Platform",
    trust: "Trust & Safety",
    company: "Company",
    programs: "Programs",
    affiliate: "Affiliate Program",
    collaborate: "Collaborate With Us",
    partners: "Partners",
    community: "Community",
    developers: "Developers",
    keyServices: "Key Services",
    viewAll: "View All Services",
    social: "Social",
    poweredBy: "Powered By SMAJ Ecosystem",
    privacy: "Privacy Policy",
    terms: "Terms & Conditions",
    cookies: "Cookie Policy",
    reportAbuse: "Report Abuse",
    sellerAgreement: "Seller Agreement",
    rights: "All rights reserved.",
    scrollTop: "Scroll to top",
  },
  fr: {
    description:
      "Une couche d’utilité économique de confiance pour le commerce, le travail et les services concrets avec Pi.",
    platform: "Plateforme",
    trust: "Confiance et sécurité",
    company: "Entreprise",
    programs: "Programmes",
    affiliate: "Programme d’affiliation",
    collaborate: "Collaborer avec nous",
    partners: "Partenaires",
    community: "Communauté",
    developers: "Développeurs",
    keyServices: "Services principaux",
    viewAll: "Voir tous les services",
    social: "Réseaux sociaux",
    poweredBy: "Propulsé par SMAJ Ecosystem",
    privacy: "Confidentialité",
    terms: "Conditions générales",
    cookies: "Politique des cookies",
    reportAbuse: "Signaler un abus",
    sellerAgreement: "Accord vendeur",
    rights: "Tous droits réservés.",
    scrollTop: "Retour en haut",
  },
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
      home: { ...pageTranslations.en },
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
      home: { ...pageTranslations.fr },
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
    supportedLngs: [
      "en",
      "af",
      "ar",
      "bn",
      "zh",
      "cs",
      "nl",
      "fr",
      "de",
      "ha",
      "hi",
      "id",
      "it",
      "ja",
      "ko",
      "ms",
      "pt",
      "ru",
      "es",
      "sw",
      "tr",
      "ur",
      "vi",
      "yo",
    ],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "smaj_language",
    },
  });

i18n.on("languageChanged", language => {
  const code = language.split("-")[0].toLowerCase();
  document.documentElement.lang = language;
  document.documentElement.dir = ["ar", "fa", "he", "ur"].includes(code) ? "rtl" : "ltr";
});

export default i18n;
