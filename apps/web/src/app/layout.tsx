import "~/styles/globals.css";

import { enUS, ptBR } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { getTranslation } from "@repo/intl/get-translation";
import { IntlProvider } from "@repo/intl/intl-provider";
import { Toaster } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";
import { TRPCReactProvider } from "~/tools/trpc/client";

// ADR 0012: IBM Plex Sans for the interface and the documents, Plex Mono
// for the profile's marks and credit figures.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// The brand's display face: the lockup and the landing page's headings.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromNextCookies();
  const t = await getTranslation(locale);

  return {
    title: t.formatMessage({ defaultMessage: "StoryToRole" }),
    description: t.formatMessage({
      defaultMessage:
        "Tailored resumes and cover letters from a career story you approved. Nothing is invented.",
    }),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocaleFromNextCookies();
  const t = await getTranslation(locale);

  const clerkLocalization = locale === "pt-BR" ? ptBR : enUS;

  return (
    <ClerkProvider
      localization={clerkLocalization}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      <html lang={locale} suppressHydrationWarning>
        <body
          className={cn(
            plexSans.variable,
            plexMono.variable,
            spaceGrotesk.variable,
            "bg-background font-sans antialiased"
          )}
        >
          <IntlProvider locale={t.locale} messages={t.messages}>
            <TRPCReactProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                {children}
                <Toaster dir={t.direction} />
              </ThemeProvider>
            </TRPCReactProvider>
          </IntlProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
