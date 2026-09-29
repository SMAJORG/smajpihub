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
      { title: "Une identit� Pi", text: "Utilisez une identit� Pi v�rifi�e dans tous les services." },
      { title: "Un portefeuille Pi", text: "Acc�dez aux prix, paiements et utilit�s Pi avec un seul portefeuille." },
      { title: "Plusieurs services", text: "Commerce, emploi, sant�, �ducation, transport, logement et m�dias sont r�unis dans un seul hub." },
    ],
    servicesKicker: "SERVICES SMAJ PI HUB", servicesTitle: "15 services connect�s, une direction commune",
    servicesText: "Comprenez rapidement chaque plateforme, les services actifs et leur place dans le hub Pi.",
    live: "ACTIF", inProgress: "EN COURS", soon: "BIENT�T", mvpKicker: "LE MVP COMMENCE ICI",
    mvpTitle: "SMAJ Store est la premi�re place de march�", mvpText: "Un march� fiable o� les utilisateurs trouvent des produits, les vendeurs publient leurs offres et les paiements Pi deviennent pratiques.",
    viewStore: "Voir le service Store", mvpFeatures: ["Fiches produits", "Chat acheteur/vendeur", "Paiement Pi", "Gestion des litiges", "Avis et notes", "Assistance litiges"],
    howKicker: "COMMENT �A MARCHE", howTitle: "Un parcours simple � suivre",
    steps: [
      { title: "Connexion", text: "Connectez-vous avec Pi et acc�dez � SMAJ PI HUB." }, { title: "V�rification", text: "Les contr�les d�identit� et de prestataire renforcent la confiance." },
      { title: "Choix", text: "Ouvrez le march�, l�emploi, la sant�, l��ducation, le logement ou les m�dias." }, { title: "Utilisation de Pi", text: "Achetez, vendez et acc�dez aux services avec Pi." },
    ],
    trustKicker: "COUCHE DE CONFIANCE", trustTitle: "Con�u autour d�une participation v�rifi�e", trustText: "La confiance, la s�curit� du march� et l�utilit� r�elle de Pi restent prioritaires.",
    trustFeatures: [
      { title: "Acc�s v�rifi�", text: "L�identit� Pi limite les faux participants." }, { title: "S�curit� du march�", text: "S�questre, avis, notes et assistance structurent le march�." },
      { title: "Aide par IA", text: "Un assistant aide � trouver les services et les prochaines �tapes." }, { title: "Statut clair", text: "Des �tiquettes indiquent les services actifs ou planifi�s." },
    ],
    finalTitle: "Une identit� Pi. Un portefeuille. Plusieurs services. Une utilit� r�elle.", readWhitePaper: "Lire le livre blanc",
  },
} as const;

const footerTranslations = {
  en: { description: "Built for Pi wallet access, with SMAJ Token utility expanding across the ecosystem.", platform: "Platform", trust: "Trust & Safety", company: "Company", programs: "Programs", affiliate: "Affiliate Program", collaborate: "Collaborate With Us", partners: "Partners", community: "Community", developers: "Developers", keyServices: "Key Services", viewAll: "View All Services", social: "Social", poweredBy: "Powered By SMAJ Ecosystem", privacy: "Privacy Policy", terms: "Terms & Conditions", cookies: "Cookie Policy", reportAbuse: "Report Abuse", sellerAgreement: "Seller Agreement", rights: "All rights reserved.", scrollTop: "Scroll to top" },
  fr: { description: "Con�u pour le portefeuille Pi et l�utilit� croissante du SMAJ Token.", platform: "Plateforme", trust: "Confiance et s�curit�", company: "Entreprise", programs: "Programmes", affiliate: "Programme d�affiliation", collaborate: "Collaborer avec nous", partners: "Partenaires", community: "Communaut�", developers: "D�veloppeurs", keyServices: "Services principaux", viewAll: "Voir tous les services", social: "R�seaux sociaux", poweredBy: "Propuls� par SMAJ Ecosystem", privacy: "Confidentialit�", terms: "Conditions g�n�rales", cookies: "Politique des cookies", reportAbuse: "Signaler un abus", sellerAgreement: "Accord vendeur", rights: "Tous droits r�serv�s.", scrollTop: "Retour en haut" },
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
        french: "Fran�ais",
      },
    },
  },
  fr: {
    translation: {
      nav: {
        home: "Accueil",
        about: "� propos",
        services: "Services",
        whitePaper: "Livre blanc",
        howItWorks: "Fonctionnement",
        join: "Nous rejoindre",
        contact: "Contact",
        dashboard: "Acc�der au tableau de bord",
        login: "Se connecter avec Pi",
        signingIn: "Connexion...",
      },
      home: {
        ...pageTranslations.fr,
        kicker: "UNE IDENTIT� PI. UN PORTEFEUILLE. PLUSIEURS SERVICES.",
        description:
          "SMAJ PI HUB connecte les utilisateurs v�rifi�s aux march�s, services, opportunit�s et outils num�riques gr�ce � une identit� Pi et un portefeuille Pi.",
        explore: "Explorer les services",
        promise: "UNE PROMESSE CLAIRE",
        promiseTitle: "Un point d�acc�s unique � l�utilit� r�elle de Pi",
        promiseText:
          "La page publique pr�sente la plateforme. Le tableau de bord priv� devient l�espace o� les utilisateurs explorent, g�rent et utilisent les services SMAJ.",
      },
      footer: footerTranslations.fr,
      language: {
        label: "Langue",
        english: "English",
        french: "Fran�ais",
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
    supportedLngs: ["en", "fr"],
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
