import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://monad-mate-landing-production.up.railway.app";

export const metadata: Metadata = {
  title: "MonadMate — Instant Offline Companions on Monad",
  description:
    "Post what you want to do in the next hour and match with someone in the same mall or supermarket. AI matching, GPS check-in, and a small MON deposit that keeps you both honest.",
  keywords: [
    "Monad social app",
    "offline meetup app",
    "mall companion app",
    "instant meetup matching",
    "MON deposit",
    "AI matchmaking",
    "soulbound credential",
    "Monad dApp",
    "Monad testnet",
    "Hedera HCS",
  ],
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "MonadMate — Instant Offline Companions on Monad",
    description:
      "Find someone to hang out with in the mall you're already in. AI matches you by venue, time window, and intent; a small MON deposit keeps you both honest.",
    siteName: "MonadMate",
    type: "website",
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MonadMate — Instant Offline Companions on Monad",
    description:
      "Post what you want to do in the next hour. Match with someone at the same venue. Check in, get your deposit back, earn a soulbound credential.",
    creator: "@HankGrimm",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#7C3AED",
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "MonadMate",
    "url": "https://monad-mate-landing-production.up.railway.app",
    "description": "Match with someone in the same mall right now. A small MON deposit keeps you both honest.",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "MonadMate",
    "applicationCategory": "SocialNetworkingApplication",
    "operatingSystem": "Web, iOS, Android",
    "description": "Instant offline companion matching on Monad. Post what you want to do in the next hour, match with someone at the same venue, and a small MON deposit keeps you both honest.",
    "url": "https://monad-mate-landing-production.up.railway.app",
    "softwareVersion": "0.1.0",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "description": "Free to use on Monad testnet"
    },
    "featureList": [
      "Same-venue, same-hour meetup matching",
      "Explainable AI candidate ranking",
      "Hard safety filters (same-gender, verified-only, minimum reputation)",
      "Seed-phrase-free managed accounts",
      "MON commitment deposit with automatic refund",
      "GPS-verified meetup check-in",
      "Soulbound fulfilment credentials",
      "Follow-through credit scoring"
    ],
    "creator": {
      "@type": "Person",
      "name": "HankGrimm",
      "url": "https://github.com/HankGrimm"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "HankGrimm",
    "url": "https://github.com/HankGrimm",
    "description": "Builder of MonadMate — instant offline companion matching on Monad",
    "contactPoint": {
      "@type": "ContactPoint",
      "email": "HankGrimm91@gmail.com"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is MonadMate?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "MonadMate matches people who are in the same mall or supermarket right now and want to do the same thing in the next hour — a meal, an arcade round, or a shopping run. Matching is limited to the same venue and an overlapping time window."
        }
      },
      {
        "@type": "Question",
        "name": "What is the deposit for?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Both sides put up a small MON deposit as a commitment to their own attendance. It is returned automatically once both people check in. It is not a bet on whether the other person shows up."
        }
      },
      {
        "@type": "Question",
        "name": "Do I need a crypto wallet?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. You can sign in with an email or phone code and MonadMate provisions a managed account for you — no seed phrase and no gas prompts. That account is custodial, and you can link your own wallet at any time to take full self-custody. Wallet users can connect MetaMask or Rabby directly."
        }
      },
      {
        "@type": "Question",
        "name": "How does the AI matching work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Candidates must first pass hard constraints: the same venue, the same intent, an overlapping time window, no block in either direction, and both people's safety preferences. Those who qualify are ranked by shared interests, past follow-through, habit overlap, window fit, and safety signals — and every suggestion shows why it surfaced."
        }
      },
      {
        "@type": "Question",
        "name": "What is a fulfilment credential?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "After a confirmed meetup, MonadMate mints a soulbound (non-transferable) credential on Monad recording the venue category, scene, time, and whether you kept your commitment. It never records who you met."
        }
      },
      {
        "@type": "Question",
        "name": "Does a good credit score mean someone is safe?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Credit only describes whether someone showed up in the past. It is not a personal-safety guarantee. MonadMate pairs it with identity verification, safety preference filters, reporting, and blocking — and states this limit on every credit response."
        }
      }
    ]
  }
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta name="ai-content-declaration" content="human-authored with AI assistance" />
        <meta name="ai-training" content="allowed" />
        <link rel="agent-guide" href="/agent.md" />
        <link rel="agents-guide" href="/agents.md" />
        {jsonLd.map((schema, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
