import type { Metadata, Viewport } from "next";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import Nav from "@/components/Nav";
import SWRegister from "@/components/SWRegister";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/lib/toast";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "ChargeMesh — Stop waiting in line", template: "%s · ChargeMesh" },
  description: "AI-matched EV charging: predictive reservations, grid-aware load balancing, energy sharing and priority membership.",
  applicationName: "ChargeMesh",
  appleWebApp: { capable: true, title: "ChargeMesh", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  openGraph: { title: "ChargeMesh", description: "Waiting in line, burning the grid — solved with AI matching.", images: ["/icons/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#070b10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <AuthProvider>
          <I18nProvider>
            <ToastProvider>
              <Nav />
              <main className="pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
            </ToastProvider>
          </I18nProvider>
        </AuthProvider>
        <SWRegister />
      </body>
    </html>
  );
}
