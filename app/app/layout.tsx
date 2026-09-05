import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MonadMate",
  description:
    "Find someone to hang out with in the mall you're already in. Post what you want to do in the next hour and match with someone at the same venue.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MonadMate",
  },
};

export const viewport: Viewport = {
  themeColor: "#131318",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface text-on-surface font-sans min-h-screen selection:bg-primary selection:text-on-primary">
        {/* Centre the mobile canvas on desktop rather than stretching it —
            DESIGN.md specifies a fixed ~420px phone frame above 1024px. */}
        <div className="mx-auto w-full max-w-[480px] min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
