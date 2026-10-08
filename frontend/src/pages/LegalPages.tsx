import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { axiosClient } from "../lib/axiosClient";
import { formatPiRate } from "../lib/piPricing";

const legalEmail = "info@smajpihub.com";

const LegalShell = ({
  kicker,
  title,
  description,
  backTo,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  backTo?: string;
  children: ReactNode;
}) => (
  <AppLayout>
    <main className="home-page legal-company-page">
      {backTo ? (
        <Link className="legal-back-link" to={backTo}>
          <ArrowBackIcon />
          Back
        </Link>
      ) : null}
      <section className="home-hero legal-company-hero">
        <div>
          <span className="home-kicker">{kicker}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>
      {children}
    </main>
  </AppLayout>
);

const LegalPanel = ({ title, items }: { title: string; items: string[] }) => (
  <article className="legal-policy-panel">
    <h2>{title}</h2>
    <ul>
      {items.map(item => (
        <li key={item}>
          <ShieldOutlinedIcon />
          {item}
        </li>
      ))}
    </ul>
  </article>
);

const LegalTextDocument = ({
  title,
  sections,
}: {
  title: string;
  sections: { heading: string; paragraphs?: string[]; items?: string[] }[];
}) => (
  <section className="home-section legal-text-document">
    <div className="legal-text-intro">
      <span className="home-kicker">TEXT DOCUMENT</span>
      <h2>{title}</h2>
      <p>
        Effective Date: July 1, 2026. Read the policy directly on this page for clear user understanding across mobile
        and desktop.
      </p>
    </div>
    {sections.map((section, index) => (
      <article className="legal-text-section" key={section.heading}>
        <h3>
          {index + 1}. {section.heading}
        </h3>
        {section.paragraphs?.map(paragraph => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {section.items?.length ? (
          <ul>
            {section.items.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </article>
    ))}
  </section>
);

export const PrivacyPage = () => (
  <LegalShell
    kicker="PRIVACY POLICY"
    title="How SMAJ PI HUB handles user and marketplace data."
    description="This page explains how SMAJ PI HUB collects, uses, processes, and protects information across account access, Pi wallet flows, marketplace activity, and support."
  >
    <section className="home-section legal-company-section">
      <LegalPanel
        title="Information We May Use"
        items={[
          "Pi identity information required for login, account access, and platform participation where supported.",
          "Marketplace activity such as listings, seller profiles, buyer/seller communication, reviews, and support records.",
          "Technical information used for security, fraud prevention, performance, analytics, and service reliability.",
          "Contact information submitted through forms, provider onboarding, reports, or partnership requests.",
        ]}
      />
      <LegalPanel
        title="How We Protect Users"
        items={[
          "SMAJ PI HUB uses access controls, verification signals, and safety workflows to reduce abuse.",
          "Sensitive service flows are designed around user awareness, transaction confirmation, and support review.",
          "We do not sell personal data as a business model.",
          "Questions about privacy can be sent to info@smajpihub.com.",
        ]}
      />
    </section>
    <LegalTextDocument
      title="SMAJ PI HUB Privacy Policy"
      sections={[
        {
          heading: "Introduction",
          paragraphs: [
            'This Privacy Policy describes how SMAJ PI HUB ("we," "us," or "our"), operating the digital marketplace and service platform accessible at smajpihub.com, collects, uses, processes, and shares your information. We are committed to protecting your privacy and ensuring the security of your personal data. By accessing or using SMAJ PI HUB, you agree to the terms of this Privacy Policy.',
            "SMAJ PI HUB is building a trusted economic utility layer for the Pi ecosystem. Store and Jobs form the initial commerce and work foundation. Additional services are part of a long-term modular architecture, with availability determined by rollout readiness. A potential SMAJ token is deferred and is not part of the current launch plan.",
            "Our platform is designed to provide a seamless and secure experience, utilizing Pi cryptocurrency for payments and a single verified identity across all services. This policy outlines our practices regarding data collection, usage, and protection, in compliance with global data protection regulations such as the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).",
          ],
        },
        {
          heading: "Data Collection",
          paragraphs: ["We collect various types of information to provide and improve our services. This includes:"],
        },
        {
          heading: "Personal Information",
          items: [
            "This refers to data that can be used to identify you directly or indirectly. We collect personal information when you register for an account, complete your profile, or undergo identity verification (KYC).",
            "Register for an account: This may include your name, email address, phone number, and other contact details.",
            "Complete your profile: Additional information such as your date of birth, gender, and location may be collected to enhance your user experience and service personalization.",
            "Undergo identity verification (KYC): As part of our commitment to security and regulatory compliance, we may collect government-issued identification details to verify your identity. This data is crucial for maintaining a trusted ecosystem within the Pi Network.",
          ],
        },
        {
          heading: "Pi Wallet Data",
          items: [
            "Given our integration with the Pi Network, we collect specific data related to your Pi wallet.",
            "Pi Wallet Address: Your unique identifier on the Pi blockchain, necessary for transactions and identity verification within the SMAJ PI HUB ecosystem.",
            "Transaction History: Details of transactions conducted using Pi cryptocurrency on our platform, including amounts, dates, and parties involved. This data supports payment confirmation, marketplace records, and support; planned protections may require additional transaction records when introduced.",
            "Pi Network Authentication Data: Information related to your login and authentication via your Pi wallet, which serves as your verified identity across all SMAJ PI HUB services.",
          ],
        },
        {
          heading: "Transaction Data",
          items: [
            "When you engage in transactions across available platform services, we collect data related to these activities.",
            "Service-Specific Transaction Details: For example, marketplace purchases, food delivery orders, job applications, health consultations, educational course enrollments, transport bookings, agricultural product transactions, energy service usage, charity donations, housing rentals, event ticket purchases, swap agreements, streaming subscriptions, and sports-related transactions.",
            "Payment Information: While payments are primarily made with Pi cryptocurrency, we may collect information related to payment processing and confirmations.",
            "Support and Planned Dispute Features: Communications and evidence provided for support. Additional records may be collected if escrow-related or dispute workflows become available.",
          ],
        },
        {
          heading: "Usage Data",
          items: [
            "We automatically collect information about your interaction with our platform.",
            "Device Information: IP address, device type, operating system, browser type, and unique device identifiers.",
            "Log Data: Details of how you use our services, such as pages viewed, features accessed, search queries, and timestamps of your activities.",
            "Location Data: Depending on your device settings and service requirements, such as food delivery or transport, we may collect precise or approximate location data.",
            "Planned AI Assistance: If introduced, records of assistant interactions may be processed to improve platform navigation and support, subject to applicable privacy practices.",
          ],
        },
        {
          heading: "How Data is Used",
          items: [
            "Service Provision: To operate and deliver available platform services, process transactions, and fulfill your requests.",
            "Account Management: To create, maintain, and secure your account, and to authenticate your identity via your Pi wallet.",
            "Personalization: To customize your experience, recommend relevant services, and provide tailored content based on your usage and preferences.",
            "Communication: To send you service-related notifications, updates, security alerts, and promotional messages where permitted.",
            "Security and Fraud Prevention: To detect and prevent fraudulent activities, unauthorized access, and other illegal activities, including leveraging Pi Network's security features.",
            "Support and Planned Transaction Protections: To provide transaction support and, if introduced, operate escrow-related and dispute workflows under their applicable terms.",
            "Platform Improvement: To analyze usage patterns, conduct research, and develop new features and services.",
            "Compliance and Legal Obligations: To comply with applicable laws, regulations, legal processes, and governmental requests, including KYC requirements.",
            "AI Assistant Enhancement: To train and improve the performance and accuracy of our AI assistant.",
          ],
        },
        {
          heading: "Third-Party Sharing",
          items: [
            "We may share your information with third parties under specific circumstances and with appropriate safeguards.",
            "Service Providers: We engage third-party vendors and service providers to assist us in operating our platform, such as hosting, analytics, payment processing for fiat gateways if introduced, and customer support. These providers are contractually obligated to protect your data and use it only for the purposes for which it was disclosed.",
            "Pi Network Ecosystem: As an integral part of the Pi Network, certain data, particularly Pi wallet authentication and transaction data, may be shared within the broader Pi ecosystem to ensure interoperability and security. This is fundamental to the operation of SMAJ PI HUB.",
            "Business Transfers: In the event of a merger, acquisition, or asset sale, your information may be transferred to the acquiring entity.",
            "Legal Requirements: We may disclose your information if required by law, court order, or governmental regulation, or if we believe such disclosure is necessary to protect our rights, property, or safety, or the rights, property, or safety of others.",
            "With Your Consent: We may share your information with third parties when we have your explicit consent to do so.",
            "Aggregated or Anonymized Data: We may share aggregated or anonymized data that cannot reasonably be used to identify you with third parties for research, marketing, analytics, or other purposes.",
          ],
        },
        {
          heading: "Pi Network Integration and Wallet Data",
          items: [
            "SMAJ PI HUB's core functionality relies on its deep integration with the Pi Network. Your Pi wallet serves as your primary authentication method and payment instrument.",
            "Unified Identity: Your Pi account supports shared access across available SMAJ PI HUB services. Sign-in alone does not guarantee seller or provider reliability.",
            "Secure Transactions: All cryptocurrency payments are processed via the Pi blockchain, leveraging its inherent security features.",
            "Data Interoperability: Certain wallet-related data is necessary for the seamless operation of services and may be shared with the Pi Network infrastructure as required for authentication, transaction validation, and ecosystem integrity. We adhere to the Pi Network's privacy standards in handling such data.",
          ],
        },
        {
          heading: "Cookies and Tracking Technologies",
          paragraphs: [
            "We use cookies and similar tracking technologies, like web beacons and pixels, to collect and use personal information about you, including to serve interest-based advertising.",
            "For more information about the types of cookies we use, why, and how you can control them, please refer to our separate Cookie Policy.",
          ],
        },
        {
          heading: "User Rights (GDPR and CCPA Compliance)",
          items: [
            "We respect your data protection rights and provide you with mechanisms to exercise them.",
            "Depending on your location, particularly for users in the European Economic Area (EEA) and California, these rights may include right to access, right to rectification, right to erasure, right to restrict processing, right to object to processing, right to data portability, and right to opt-out of sale or sharing under CCPA.",
            "To exercise any of these rights, please contact us using the details provided in the Contact Information section. We will respond to your request in accordance with applicable data protection laws.",
          ],
        },
        {
          heading: "Data Security",
          items: [
            "We implement robust technical and organizational measures to protect your personal data from unauthorized access, alteration, disclosure, or destruction.",
            "Encryption: Data is encrypted both in transit and at rest where appropriate.",
            "Access Controls: Strict access controls are in place to limit who can access your personal data.",
            "Regular Security Audits: We conduct regular security assessments and penetration testing to identify and address vulnerabilities.",
            "Employee Training: Our staff receives regular training on data protection and security best practices.",
            "Pi Network Security: We leverage the inherent security features of the Pi Network for wallet authentication and transaction security.",
            "However, no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your personal data, we cannot guarantee its absolute security.",
          ],
        },
        {
          heading: "Children's Privacy",
          paragraphs: [
            "SMAJ PI HUB is not intended for use by individuals under the age of 16. We do not knowingly collect personal data from children under 16.",
            "If we become aware that we have collected personal data from a child under 16 without parental consent, we will take steps to delete that information promptly. If you believe that we might have any information from or about a child under 16, please contact us.",
          ],
        },
        {
          heading: "International Data Transfers",
          paragraphs: [
            "As a global platform, your information may be stored and processed in any country where we have facilities or where we engage service providers. By using SMAJ PI HUB, you understand that your information may be transferred to countries outside of your country of residence, which may have different data protection laws than those in your country.",
            "We ensure that such transfers comply with applicable data protection laws, for example, by implementing standard contractual clauses approved by the European Commission or other appropriate safeguards.",
          ],
        },
        {
          heading: "Data Retention",
          paragraphs: [
            "We retain your personal data only for as long as necessary to fulfill the purposes for which it was collected, including for the purposes of satisfying any legal, accounting, or reporting requirements.",
            "The retention period is determined by the type of data, the purpose of processing, and legal or regulatory obligations. When your personal data is no longer required, we will securely delete or anonymize it.",
          ],
        },
        {
          heading: "Changes to This Privacy Policy",
          paragraphs: [
            "We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons.",
            "We will notify you of any material changes by posting the new Privacy Policy on smajpihub.com and updating the Effective Date at the top of this policy. We encourage you to review this Privacy Policy periodically for any changes.",
          ],
        },
        {
          heading: "Contact Information",
          paragraphs: [
            "If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at:",
            "SMAJ PI HUB",
            "Website: smajpihub.com",
            `Email: ${legalEmail}`,
            "Address: Online-only operation",
          ],
        },
      ]}
    />
  </LegalShell>
);

export const TermsPage = () => (
  <LegalShell
    kicker="TERMS & CONDITIONS"
    title="Rules for using SMAJ PI HUB services."
    description="These terms summarize the platform expectations for users, sellers, providers, partners, and visitors."
  >
    <section className="home-section legal-company-section">
      <LegalPanel
        title="Platform Use"
        items={[
          "Users must provide accurate information and must not impersonate others, abuse listings, or attempt fraud.",
          "Sellers and providers are responsible for truthful listings, service delivery, legal compliance, and customer support.",
          "SMAJ PI HUB may restrict access when users abuse the platform, bypass safety systems, or harm other participants.",
          "Service availability, roadmap timing, and payment flows may change as the platform develops. A potential SMAJ token is deferred and is outside the current launch plan.",
        ]}
      />
      <LegalPanel
        title="Important Disclaimer"
        items={[
          "SMAJ PI HUB is a digital marketplace and service platform, not a bank or financial institution.",
          "The platform does not provide investment advice, guarantee profits, guarantee token value, or provide custody services.",
          "Users are responsible for complying with laws and regulations in their own jurisdictions.",
          "Pi wallet actions should be reviewed carefully by each user before confirmation.",
        ]}
      />
    </section>
    <LegalTextDocument
      title="SMAJ PI HUB Terms and Conditions"
      sections={[
        {
          heading: "Acceptance of Terms",
          paragraphs: [
            'These Terms & Conditions ("Terms") govern your access to and use of the SMAJ PI HUB digital marketplace and service platform ("Platform"), located at smajpihub.com, operated by SMAJ PI HUB ("we," "us," or "our"). By accessing, browsing, or using the Platform, you signify your agreement to be bound by these Terms, our Privacy Policy, Cookie Policy, and Report Abuse Policy.',
            "If you do not agree to these Terms, you may not access or use the Platform.",
            "By creating an account, authenticating with your Pi wallet, or otherwise using any part of the SMAJ PI HUB Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms, as well as any additional terms and conditions that are referenced herein or that may apply to specific services or features.",
            "These Terms constitute a legally binding agreement between you and SMAJ PI HUB.",
          ],
        },
        {
          heading: "User Eligibility and Account Registration",
          items: [
            "Eligibility: To use SMAJ PI HUB, you must be at least 18 years old and have the legal capacity to enter into a binding contract. By using the Platform, you represent and warrant that you meet these eligibility requirements.",
            "Account Registration: Access to most services on SMAJ PI HUB requires account registration. You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete.",
            "You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.",
          ],
        },
        {
          heading: "Pi Wallet Authentication",
          items: [
            "SMAJ PI HUB leverages the Pi Network for user authentication. Your Pi wallet serves as your primary login credential and verified identity across available platform services.",
            "By authenticating with your Pi wallet, you authorize SMAJ PI HUB to access necessary information from your Pi Network profile for identity verification and service provision.",
            "You agree that your Pi wallet will be used for all cryptocurrency transactions within the Platform.",
            "You acknowledge that the security of your Pi wallet is your sole responsibility, and SMAJ PI HUB is not liable for any loss or damage arising from unauthorized access to your Pi wallet.",
          ],
        },
        {
          heading: "Platform Services Description",
          items: [
            "SMAJ PI HUB is a digital marketplace and service platform connecting commerce, work, and real-world services through Pi. Its wider service portfolio is a long-term architecture, not a commitment to simultaneous availability.",
            "Marketplace: For buying and selling goods and services.",
            "Food Delivery: For ordering and delivering meals.",
            "Jobs: For job seekers and employers.",
            "Health: For health-related services and information.",
            "Education: For learning resources and educational programs.",
            "Transport: For ride-sharing, logistics, and transportation services.",
            "Agriculture: For agricultural products and services.",
            "Energy: For energy-related services and solutions.",
            "Charity: For charitable donations and initiatives.",
            "Housing: For real estate listings and rental services.",
            "Events: For event discovery, ticketing, and management.",
            "Swap: For exchanging goods and services.",
            "Streaming: For digital content streaming.",
            "Sports: For sports-related activities, news, and services.",
            "Deferred Token Concept: A potential SMAJ token is outside the current core strategy and launch plan. Any future token requires a separate decision and specific terms.",
            "Each service may have specific guidelines or supplementary terms, which you agree to abide by when using that particular service.",
          ],
        },
        {
          heading: "User Responsibilities and Conduct",
          items: [
            "Comply with all applicable laws, regulations, and these Terms.",
            "Use the Platform and its services only for lawful purposes.",
            "Provide accurate and truthful information in all interactions.",
            "Respect the intellectual property rights of others.",
            "Maintain a respectful and professional demeanor in all communications.",
            "Report any suspicious activity or abuse as outlined in our Report Abuse Policy.",
          ],
        },
        {
          heading: "Seller/Provider Obligations",
          items: [
            "If you offer goods or services on SMAJ PI HUB, such as as a seller in the marketplace, a food vendor, a job poster, or a service provider, you agree to provide accurate descriptions of your offerings.",
            "Deliver goods and services as advertised.",
            "Comply with all relevant laws and regulations pertaining to your offerings.",
            "Honor all commitments made to buyers/users.",
            "Adhere to the Platform's policies regarding quality, safety, and customer service.",
          ],
        },
        {
          heading: "Pi Cryptocurrency Payments",
          items: [
            "All payments within SMAJ PI HUB are primarily conducted using Pi cryptocurrency.",
            "All transactions are subject to the terms and conditions of the Pi Network blockchain.",
            "SMAJ PI HUB facilitates these transactions but is not a financial institution and does not hold or control your Pi cryptocurrency directly.",
            "The value of Pi cryptocurrency can be volatile, and SMAJ PI HUB is not responsible for any fluctuations in its value.",
            "You are solely responsible for the accuracy of your Pi wallet address for transactions.",
          ],
        },
        {
          heading: "Escrow and Dispute Resolution",
          paragraphs: [
            "Escrow-related protections and enhanced in-platform dispute workflows are planned capabilities. They are not represented as currently available guarantees. Any escrow implementation must be consistent with the intended non-custodial marketplace model.",
            "Planned Escrow Protections: Any future escrow-related feature will require a defined implementation and service-specific terms before availability. SMAJ PI HUB does not currently promise custodial holding of user funds.",
            "Planned Dispute Resolution: Enhanced in-platform workflows are under development. Current support is available through the contact channels. Any future resolution mechanism will have service-specific terms describing participation and outcomes.",
          ],
        },
        {
          heading: "Intellectual Property",
          paragraphs: [
            "All content, trademarks, service marks, logos, and intellectual property displayed on the SMAJ PI HUB Platform are the property of SMAJ PI HUB or its licensors. You may not use, reproduce, distribute, or create derivative works from any content on the Platform without explicit written permission from SMAJ PI HUB.",
            "Users retain ownership of the content they create and upload to the Platform, but grant SMAJ PI HUB a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, adapt, publish, translate, distribute, and display such content in connection with the operation and promotion of the Platform.",
          ],
        },
        {
          heading: "AI Assistant Usage",
          items: [
            "Platform-focused AI assistance is a planned capability intended to improve navigation and user support within SMAJ PI HUB.",
            "The AI assistant provides information and assistance based on available data and algorithms. Its responses are for informational purposes only and should not be considered professional advice, including medical, legal, or financial advice.",
            "SMAJ PI HUB is not responsible for any decisions made or actions taken based on the AI assistant's output.",
            "You will not use the AI assistant to generate or disseminate harmful, unlawful, or inappropriate content.",
            "Interactions with the AI assistant may be logged and analyzed to improve its performance and our services, in accordance with our Privacy Policy.",
          ],
        },
        {
          heading: "Deferred SMAJ Token Concept",
          paragraphs: [
            "A potential SMAJ token is deferred and is not part of the current core strategy or launch plan. Any future token requires a clear user need, credible purpose, safeguards, feasibility, and a separate decision. If introduced, specific terms will be provided separately.",
            "These terms will govern the acquisition, holding, transfer, and utility of the SMAJ Token within the ecosystem. Users are advised to review these terms carefully before engaging with the SMAJ Token.",
          ],
        },
        {
          heading: "Prohibited Activities",
          items: [
            "Violating any laws or regulations.",
            "Infringing on the rights of others, including intellectual property rights.",
            "Posting or transmitting any unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable content.",
            "Engaging in fraudulent activities, scams, or misrepresentation.",
            "Creating fake accounts or impersonating others.",
            "Distributing viruses, malware, or other harmful computer code.",
            "Interfering with the proper functioning of the Platform.",
            "Collecting or harvesting personal data of other users without their consent.",
            "Circumventing any security measures or access restrictions of the Platform.",
          ],
        },
        {
          heading: "Limitation of Liability",
          paragraphs: [
            "To the maximum extent permitted by applicable law, SMAJ PI HUB, its affiliates, officers, directors, employees, agents, and licensors shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.",
            "This applies to losses resulting from your access to or use of or inability to access or use the Platform; any conduct or content of any third party on the Platform; any content obtained from the Platform; and unauthorized access, use, or alteration of your transmissions or content, whether based on warranty, contract, tort, negligence, or any other legal theory.",
          ],
        },
        {
          heading: "Termination",
          paragraphs: [
            "We may terminate or suspend your account and access to the Platform immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach these Terms.",
            "Upon termination, your right to use the Platform will immediately cease. If you wish to terminate your account, you may simply discontinue using the Platform or contact us to request account deletion.",
          ],
        },
        {
          heading: "Governing Law",
          paragraphs: [
            "These Terms shall be governed and construed in accordance with the laws of the jurisdiction of SMAJ PI HUB's incorporation or operation, without regard to its conflict of law provisions.",
            "You agree to submit to the personal jurisdiction of the courts located within the applicable jurisdiction for the purpose of litigating all such claims or disputes.",
          ],
        },
        {
          heading: "Changes to Terms",
          paragraphs: [
            "We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect.",
            "What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Platform after those revisions become effective, you agree to be bound by the revised terms. If you do not agree to the new terms, please stop using the Platform.",
          ],
        },
        {
          heading: "Contact Information",
          paragraphs: [
            "If you have any questions about these Terms, please contact us at:",
            "SMAJ PI HUB",
            "Website: smajpihub.com",
            `Email: ${legalEmail}`,
            "Address: Online-only operation",
          ],
        },
      ]}
    />
  </LegalShell>
);

export const CookiesPage = () => (
  <LegalShell
    kicker="COOKIE POLICY"
    title="How cookies and local storage support the website."
    description="SMAJ PI HUB uses browser storage carefully to support sessions, theme preference, performance, and user experience."
  >
    <section className="home-section legal-company-section">
      <LegalPanel
        title="Storage We May Use"
        items={[
          "Theme preference such as light or dark mode.",
          "Session and account continuity where login and authentication flows require it.",
          "Recent search or navigation preferences that improve user experience.",
          "Analytics or performance signals used to improve service reliability and launch readiness.",
        ]}
      />
      <LegalPanel
        title="User Control"
        items={[
          "Users can manage cookies and browser storage through their browser settings.",
          "Disabling some storage may affect login, theme preference, account sessions, and service behavior.",
          "SMAJ PI HUB does not use cookies to make investment promises or financial guarantees.",
        ]}
      />
    </section>
    <LegalTextDocument
      title="SMAJ PI HUB Cookie Policy"
      sections={[
        {
          heading: "What Cookies Are",
          paragraphs: [
            'This Cookie Policy explains how SMAJ PI HUB ("we," "us," or "our"), operating the digital marketplace and service platform accessible at smajpihub.com, uses cookies and similar technologies to recognize you when you visit our website.',
            "It explains what these technologies are and why we use them, as well as your rights to control our use of them.",
            "Cookies are small data files that are placed on your computer or mobile device when you visit a website. Cookies are widely used by website owners to make their websites work, or to work more efficiently, as well as to provide reporting information.",
            "They allow the website to remember your actions and preferences, such as login, language, font size, and other display preferences, over a period of time, so you do not have to keep re-entering them whenever you come back to the site or browse from one page to another.",
            "Cookies set by the website owner, in this case SMAJ PI HUB, are called first-party cookies. Cookies set by parties other than the website owner are called third-party cookies.",
            "Third-party cookies enable third-party features or functionality to be provided on or through the website, such as advertising, interactive content, and analytics. The parties that set these third-party cookies can recognize your computer both when it visits this website and when it visits certain other websites.",
          ],
        },
        {
          heading: "Types of Cookies Used",
          items: [
            "We use both first-party and third-party cookies for several reasons.",
            "Essential Cookies: These cookies are strictly necessary to provide you with services available through our website and to use some of its features, such as access to secure areas. Without these cookies, services like secure login, shopping carts, and e-billing cannot be provided.",
            "Analytics and Customization Cookies: These cookies collect information that is used either in aggregate form to help us understand how our website is being used or how effective our marketing campaigns are, or to help us customize our website for you.",
            "Functional Cookies: These cookies allow our website to remember choices you make when you use our website, such as remembering your login details or language preferences. The purpose of these cookies is to provide you with a more personal experience and avoid requiring you to re-enter preferences every time you visit.",
            "Marketing Cookies: These cookies are used to make advertising messages more relevant to you and your interests. They may help prevent the same advertisement from continuously reappearing, ensure ads are properly displayed for advertisers, and in some cases select advertisements based on your interests.",
          ],
        },
        {
          heading: "Third-Party Cookies",
          paragraphs: [
            "In addition to our own cookies, we may also use various third-party cookies to report usage statistics of the Service, deliver advertisements on and through the Service, and so on.",
            "These third-party cookies are set by entities other than SMAJ PI HUB. For example, we may use Google Analytics to help us understand how our customers arrive at our site, browse or use our site, and highlight areas where we can improve.",
            "We may also use social media plugins that set cookies to track your interaction with their platforms.",
          ],
        },
        {
          heading: "Pi Browser Compatibility",
          paragraphs: [
            "SMAJ PI HUB is designed to be fully compatible with the Pi Browser, which is the primary gateway for many Pi Network users.",
            "Our cookie implementation is optimized to function seamlessly within the Pi Browser environment, ensuring that your user experience, authentication, and transaction processes are consistent and secure.",
            "We adhere to the Pi Browser's technical specifications and privacy considerations regarding cookie handling.",
          ],
        },
        {
          heading: "How to Manage Cookies",
          paragraphs: [
            "You have the right to decide whether to accept or reject cookies. You can exercise your cookie preferences by clicking on the appropriate opt-out links provided in the cookie consent banner or by setting your preferences within your browser controls.",
            "Most web browsers allow some control of most cookies through browser settings. To find out more about cookies, including how to see what cookies have been set and how to manage and delete them, visit www.allaboutcookies.org or www.youronlinechoices.eu.",
            "Please note that if you choose to reject cookies, you may still use our website, though your access to some functionality and areas of our website may be restricted.",
          ],
        },
        {
          heading: "Cookie Consent",
          paragraphs: [
            "Upon your first visit to smajpihub.com, you will be presented with a cookie consent banner that informs you about our use of cookies and requests your consent.",
            "By continuing to browse our website or by clicking Accept on the banner, you consent to our use of cookies as described in this policy. You can change your cookie preferences at any time through your browser settings or by revisiting our cookie consent tool.",
          ],
        },
        {
          heading: "Changes to This Cookie Policy",
          paragraphs: [
            "We may update this Cookie Policy from time to time to reflect changes to the cookies we use or for other operational, legal, or regulatory reasons.",
            "We encourage you to review this Cookie Policy periodically to stay informed about our use of cookies.",
          ],
        },
        {
          heading: "Contact Information",
          paragraphs: [
            "If you have any questions about our use of cookies or other technologies, please email us at:",
            "SMAJ PI HUB",
            "Website: smajpihub.com",
            `Email: ${legalEmail}`,
          ],
        },
      ]}
    />
  </LegalShell>
);

export const SellerAgreementPage = () => (
  <LegalShell
    kicker="SELLER AGREEMENT"
    title="Seller rules for listing products on SMAJ PI HUB."
    description="Read the official seller agreement before listing products, accepting orders, or using seller tools."
    backTo="/add-product"
  >
    <section className="home-section legal-company-section">
      <LegalPanel
        title="Before You List"
        items={[
          "Products must be real, accurately described, and supported by clear product images.",
          "Seller contact, delivery details, location, quantity, price, and condition must be truthful.",
          "SMAJ PI HUB may review, reject, hide, or remove listings that are unsafe, fake, misleading, or incomplete.",
          "Sellers are responsible for customer communication, delivery promises, refunds, and legal compliance.",
        ]}
      />
      <LegalPanel
        title="Marketplace Trust"
        items={[
          "Do not request users to bypass SMAJ PI HUB safety, order, or payment flows.",
          "Do not impersonate another seller, brand, company, buyer, or Pi Network representative.",
          "Fraud, unsafe items, abuse, spam, counterfeit goods, and prohibited content may lead to account restriction.",
          "By accepting the seller agreement, you confirm your listing is review-ready and connected to your verified account.",
        ]}
      />
    </section>
    <LegalTextDocument
      title="SMAJ PI HUB Seller Agreement"
      sections={[
        {
          heading: "Introduction",
          paragraphs: [
            "This Agreement sets forth the rights and obligations of Sellers utilizing the SMAJ PI HUB platform. It is a legally binding document that Sellers must read, understand, and accept prior to engaging in any selling activities on the Platform.",
            "The purpose of this Agreement is to ensure a consistent and high-quality experience for both Sellers and Buyers within the SMAJ PI HUB ecosystem.",
          ],
        },
        {
          heading: "Seller Eligibility",
          paragraphs: [
            "To be eligible to sell on SMAJ PI HUB, prospective Sellers must meet specific criteria as determined by the Platform. This includes, but is not limited to, compliance with all applicable laws and regulations, and adherence to the Platform's community guidelines and standards.",
            "SMAJ PI HUB reserves the right to approve or reject any Seller application at its sole discretion.",
          ],
        },
        {
          heading: "Seller Responsibilities",
          items: [
            "Listing Authenticity: Sellers must list only genuine products or services. Sellers are responsible for the authenticity of their listings.",
            "Accurate Descriptions: Sellers must provide accurate descriptions and images that truthfully represent the products or services offered.",
            "Compliance: Sellers must adhere to all Platform policies, guidelines, and applicable laws.",
            "Customer Service: Sellers must provide timely and professional customer support to Buyers.",
            "Order Fulfillment: Sellers must ensure efficient and accurate processing, shipping, and delivery of orders.",
          ],
        },
        {
          heading: "Product and Service Listing Rules",
          items: [
            "Listings must be for genuine products or services.",
            "Descriptions and images must be accurate, clear, and not misleading.",
            "All necessary information, including specifications, condition, and availability, must be provided.",
            "Fraudulent, misleading, counterfeit, or illegal listings are strictly prohibited.",
          ],
        },
        {
          heading: "Pricing Policy",
          paragraphs: [
            "Sellers are required to use honest market pricing for all products and services listed on SMAJ PI HUB. The Platform aims to promote fair competition and value for Buyers.",
            "Price manipulation or deceptive pricing practices are strictly forbidden.",
          ],
        },
        {
          heading: "Pi Utility and Price Conversion Policy",
          items: [
            `SMAJ PI HUB uses an internal platform reference value of ${formatPiRate()} for product and service price calculations.`,
            "Sellers voluntarily agree to this pricing model when publishing listings.",
            "Buyers voluntarily choose whether to purchase under this pricing model.",
            "SMAJ PI HUB does not guarantee external exchange values for Pi.",
          ],
        },
        {
          heading: "Prohibited Products and Services",
          items: [
            "Illegal items or services.",
            "Counterfeit goods or unauthorized replicas.",
            "Items that promote hate, violence, discrimination, or illegal activities.",
            "Adult content or sexually explicit materials.",
            "Hazardous materials or dangerous goods.",
            "Any other items deemed inappropriate or harmful by SMAJ PI HUB.",
          ],
          paragraphs: [
            "Violations may result in listing removal, account suspension, or permanent account termination.",
          ],
        },
        {
          heading: "Intellectual Property",
          paragraphs: [
            "Sellers must respect intellectual property rights. Listing products or services that infringe upon copyrights, trademarks, patents, or other proprietary rights of third parties is strictly prohibited.",
            "Sellers are solely responsible for ensuring that their listings do not violate any intellectual property laws.",
          ],
        },
        {
          heading: "Orders, Shipping, and Delivery",
          items: [
            "Processing orders promptly.",
            "Packaging items securely.",
            "Arranging for shipping and delivery to the Buyer.",
            "Providing accurate tracking information where applicable.",
            "Adhering to stated shipping times.",
          ],
        },
        {
          heading: "Returns, Refunds, and Disputes",
          paragraphs: [
            "Sellers must establish clear and fair return and refund policies that comply with Platform guidelines and applicable consumer protection laws.",
            "In the event of a dispute between a Seller and a Buyer, SMAJ PI HUB may mediate to facilitate a resolution, but the ultimate responsibility for resolving disputes lies with the Seller.",
          ],
        },
        {
          heading: "Buyer Protection",
          paragraphs: [
            "SMAJ PI HUB is committed to providing a safe and secure environment for Buyers. The Platform implements various measures to protect Buyers, including dispute resolution mechanisms and policies against fraudulent activities.",
            "Buyers are encouraged to report any issues or concerns to SMAJ PI HUB.",
          ],
        },
        {
          heading: "Marketplace Trust and Safety",
          items: [
            "Operating with honesty and integrity.",
            "Communicating respectfully with Buyers and the Platform.",
            "Reporting any suspicious activities or violations of this Agreement.",
          ],
        },
        {
          heading: "Fraud, Abuse, and Misconduct",
          paragraphs: [
            "Any form of fraudulent activity, abuse, or misconduct on the Platform is strictly prohibited. This includes, but is not limited to, misrepresentation, phishing, spamming, or any actions intended to harm other users or the Platform.",
            "Violations may result in listing removal, account suspension, or permanent account termination.",
          ],
        },
        {
          heading: "Account Suspension and Termination",
          paragraphs: [
            "SMAJ PI HUB reserves the right to suspend or terminate a Seller's account, or remove listings, at its sole discretion, for violations of this Agreement, Platform policies, or any applicable laws.",
            "Reasons for suspension or termination may include, but are not limited to, fraudulent activities, repeated policy violations, or engaging in prohibited conduct.",
          ],
        },
        {
          heading: "Privacy and Data Protection",
          paragraphs: [
            "Sellers must comply with all applicable privacy and data protection laws regarding the collection, use, storage, and processing of Buyer information.",
            "Sellers are prohibited from using Buyer data for any purpose other than fulfilling orders and providing customer service, unless explicit consent is obtained from the Buyer.",
          ],
        },
        {
          heading: "Limitation of Liability",
          paragraphs: [
            "SMAJ PI HUB shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.",
            "This limitation applies to losses resulting from access to or use of, or inability to access or use, the Platform; any conduct or content of any third party on the Platform; or unauthorized access, use, or alteration of transmissions or content.",
          ],
        },
        {
          heading: "Changes to this Agreement",
          paragraphs: [
            "SMAJ PI HUB reserves the right to modify or update this Agreement at any time. Sellers will be notified of any significant changes, and continued use of the Platform after such modifications constitutes acceptance of the revised Agreement.",
            "It is the Seller's responsibility to regularly review this Agreement for updates.",
          ],
        },
        {
          heading: "Governing Law",
          paragraphs: [
            "This Agreement shall be governed by and construed in accordance with the laws of the jurisdiction to be specified by SMAJ PI HUB.",
            "Any disputes arising under or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts located in the jurisdiction to be specified by SMAJ PI HUB.",
          ],
        },
        {
          heading: "Contact Information",
          paragraphs: [
            `For any questions or concerns regarding this Agreement, Sellers may contact SMAJ PI HUB at ${legalEmail}.`,
          ],
        },
        {
          heading: "Seller Declaration",
          paragraphs: [
            "I confirm that I have carefully read, understood, and agree to comply with the SMAJ PI HUB Seller Agreement. I understand that my seller account and listings are subject to these rules and that failure to comply may result in suspension or permanent removal from the SMAJ PI HUB marketplace.",
          ],
        },
        {
          heading: "Acceptance",
          paragraphs: [
            "Seller Name:",
            "Seller ID:",
            "Date:",
            "Signature:",
            "I have read and agree to the SMAJ PI HUB Seller Agreement.",
          ],
        },
      ]}
    />
  </LegalShell>
);

export const ReportAbusePage = () => {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitted(false);
    setError("");
    try {
      await axiosClient.post("/support", {
        source: "report-abuse",
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        topic: String(form.get("type") || ""),
        message: String(form.get("details") || ""),
      });
      event.currentTarget.reset();
      setSubmitted(true);
    } catch {
      setError("Could not submit this report. Please email info@smajpihub.com.");
    }
  };

  return (
    <LegalShell
      kicker="REPORT ABUSE"
      title="Report suspicious activity, unsafe listings, or platform abuse."
      description="Use this page to report scams, impersonation, harmful content, fake sellers, unsafe service behavior, or policy violations."
    >
      <section className="home-section legal-company-section legal-report-grid">
        <form onSubmit={handleSubmit} className="contact-form">
          <div className="contact-form-head">
            <span className="home-kicker">ABUSE REPORT</span>
            <h2>Submit a Report</h2>
            <p>Include enough detail for the SMAJ PI HUB team to review the issue.</p>
          </div>
          <label htmlFor="report-name">
            <span>Name</span>
            <input id="report-name" name="name" type="text" placeholder="Your full name" required />
          </label>
          <label htmlFor="report-email">
            <span>Email</span>
            <input id="report-email" name="email" type="email" placeholder="you@example.com" required />
          </label>
          <label htmlFor="report-type">
            <span>Report Type</span>
            <select id="report-type" name="type" required defaultValue="">
              <option value="" disabled>
                Select report type
              </option>
              <option>Fake seller or provider</option>
              <option>Scam or suspicious payment request</option>
              <option>Impersonation</option>
              <option>Unsafe listing or content</option>
              <option>Other platform abuse</option>
            </select>
          </label>
          <label htmlFor="report-details">
            <span>Report Details</span>
            <textarea id="report-details" name="details" rows={6} placeholder="Describe what happened..." required />
          </label>
          <button type="submit">Submit Report</button>
          {submitted ? (
            <p className="contact-form-success">Thank you. Your report has been recorded for review.</p>
          ) : null}
          {error ? <p className="contact-form-success error">{error}</p> : null}
        </form>
      </section>
      <LegalTextDocument
        title="SMAJ PI HUB Report Abuse Policy"
        sections={[
          {
            heading: "How to Report Abuse",
            items: [
              "Use a report button or link within the user interface when it appears on profiles, listings, messages, or content.",
              `Send a detailed report by email to ${legalEmail}.`,
              "Use the dedicated report-abuse page form to provide guided report details.",
            ],
          },
          {
            heading: "Information to Include",
            items: [
              "Your username and the username, seller name, listing title, order reference, or page link for the reported party or content.",
              "The specific service where the abuse occurred, such as Marketplace, Food Delivery, Chat, or another SMAJ PI HUB service.",
              "Date and time of the incident.",
              "Screenshots, links, messages, payment context, or other evidence supporting the report.",
              "A clear, accurate, and factual description of the abusive behavior or content.",
            ],
          },
          {
            heading: "What Happens After Submission",
            paragraphs: [
              "After a report is submitted, users may receive an automated confirmation of receipt. The moderation team reviews submitted reports, and while individual updates may not always be available, reports are taken seriously.",
              "Please provide accurate and factual information. Intentionally false or malicious reports can result in platform consequences.",
            ],
          },
          {
            heading: "Investigation Process",
            items: [
              "Review of Report: The team assesses the submitted report, including all provided evidence.",
              "Gathering Additional Information: We may access relevant platform data, such as user activity logs, transaction records, and communications, to corroborate the report.",
              "Content/Behavior Assessment: The reported content or behavior is evaluated against our Terms & Conditions, Privacy Policy, and community guidelines.",
              "User Communication: In some cases, we may contact the reporting party for more details or the reported party to gather their perspective.",
              "Decision: Based on the evidence and policy review, a decision is made regarding the validity of the report and the appropriate action to take.",
            ],
          },
          {
            heading: "Actions Taken",
            items: [
              "Warning: For minor infractions, a formal warning may be issued to the offending user.",
              "Content Removal: Abusive or inappropriate content may be removed from the platform.",
              "Temporary Suspension: The user's account may be temporarily suspended, restricting access to some or all services for a specified period.",
              "Permanent Ban: For severe or repeated violations, the user's account may be permanently banned from SMAJ PI HUB, resulting in loss of access to all services.",
              "Escalation to Law Enforcement: In cases involving illegal activities, we may report the incident to relevant law enforcement authorities.",
            ],
          },
          {
            heading: "Appeal Process",
            paragraphs: [
              "If your account or content has been subject to an enforcement action that you believe was made in error, you may have the right to appeal the decision.",
              "Details on how to appeal will be provided in the notification of the enforcement action. Appeals typically require you to submit a clear explanation of why you believe the decision should be reversed, along with any supporting evidence.",
            ],
          },
          {
            heading: "False Reporting Consequences",
            paragraphs: [
              "Submitting intentionally false or malicious reports of abuse can harm other users and disrupt the integrity of our reporting system.",
              "Users found to be engaging in false reporting may face consequences, including warnings, temporary suspension, or permanent banning from the platform.",
            ],
          },
          {
            heading: "Contact Information",
            paragraphs: [
              "For general inquiries or to report abuse, please use the following contact information:",
              "SMAJ PI HUB",
              "Website: smaj.org",
              `Email for Abuse Reports: ${legalEmail}`,
              `General Inquiries Email: ${legalEmail}`,
            ],
          },
        ]}
      />
    </LegalShell>
  );
};
