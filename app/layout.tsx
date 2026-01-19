import type { Metadata, Viewport } from 'next';
import { Poppins, Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import CartDrawer from '@/components/cart/cart-drawer';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://modestummah.com'),
  title: {
    default: 'Modest Ummah | Modest Muslim Clothing & Accessories',
    template: '%s | Modest Ummah',
  },
  description: 'Premium modest clothing and accessories for the modern Muslim. Shop our collection of thobes, abayas, hijabs, and essential accessories like miswak, attar, and prayer items.',
  keywords: ['modest clothing', 'islamic fashion', 'muslim clothing', 'thobe', 'abaya', 'hijab', 'kufi', 'miswak', 'attar', 'modest fashion'],
  authors: [{ name: 'Modest Ummah' }],
  creator: 'Modest Ummah',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'Modest Ummah',
    title: 'Modest Ummah | Modest Muslim Clothing & Accessories',
    description: 'Premium modest clothing and accessories for the modern Muslim.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Modest Ummah',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Modest Ummah',
    description: 'Premium modest clothing and accessories for the modern Muslim.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#b5c1a0' },
    { media: '(prefers-color-scheme: dark)', color: '#345995' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${poppins.variable} ${inter.variable} min-h-screen flex flex-col`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <CartDrawer />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
