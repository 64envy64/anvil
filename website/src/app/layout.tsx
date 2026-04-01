import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import './globals.css';

const SITE_URL = 'https://anvil-sooty.vercel.app';
const SITE_NAME = 'Anvil';
const SITE_DESC = 'The universal tool compiler for AI agents. Define once, compile to MCP servers, SDKs, docs, eval harnesses, and agent-optimized schemas.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Anvil — Forge once. Run everywhere.', template: '%s | Anvil' },
  description: SITE_DESC,
  keywords: ['MCP', 'AI tools', 'tool compiler', 'Model Context Protocol', 'AI agents', 'OpenAPI', 'SDK generator', 'eval harness', 'developer tools'],
  authors: [{ name: 'Anvil Tools Contributors' }],
  creator: 'Anvil Tools',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'Anvil — Forge once. Run everywhere.',
    description: SITE_DESC,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anvil — Forge once. Run everywhere.',
    description: SITE_DESC,
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  alternates: { canonical: SITE_URL },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  description: SITE_DESC,
  url: SITE_URL,
  license: 'https://www.apache.org/licenses/LICENSE-2.0',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Organization', name: 'Anvil Tools Contributors' },
};

const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;450;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>⚒</text></svg>" />
        <meta name="theme-color" content="#D97706" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
