import { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { siteConfig } from "@/config/site";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/auth-options";
import { ToastContextProvider } from "@/components/ui/toast";
import { AIMessageInitializer } from "@/components/ai-message-initializer";
import { PageTransitionWrapper } from "../components/page-transition-wrapper";
import Script from "next/script";
import { NavigationProvider } from "@/providers/NavigationProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: siteConfig.title,
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Messages",
    description: "A beautiful messaging experience",
    url: "/api/og",
    siteName: "Messages",
    locale: "en_US",
    type: "website",
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    images: ["/messages/api/og"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const faviconVersion = Date.now();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content"
        />
        <link rel="shortcut icon" href={`/favicon.ico?v=${faviconVersion}`} />
        <link rel="apple-touch-icon" href={`/apple-touch-icon.png?v=${faviconVersion}`} />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#0A7CFF" />
        <style dangerouslySetInnerHTML={{ __html: `
          #nprogress { display: none !important; }
          .nprogress-container { display: none !important; }
          #nprogress .bar { display: none !important; }
          #nprogress .spinner { display: none !important; }
        `}} />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider session={session}>
            <ToastContextProvider>
              <NavigationProvider>
                <PageTransitionWrapper>
                  {children}
                </PageTransitionWrapper>
              </NavigationProvider>
              <AIMessageInitializer />
            </ToastContextProvider>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
        <Script id="disable-nprogress" strategy="beforeInteractive">
          {`
            (function() {
              window.addEventListener('load', function() {
                var style = document.createElement('style');
                style.textContent = '#nprogress { display: none !important; }';
                document.head.appendChild(style);
              });
              
              // Also disable it immediately
              if (typeof window !== 'undefined') {
                var style = document.createElement('style');
                style.textContent = '#nprogress { display: none !important; }';
                document.head.appendChild(style);
              }
            })();
          `}
        </Script>
      </body>
    </html>
  );
}
