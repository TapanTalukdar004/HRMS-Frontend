import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HR Bot · Rapid Innovation",
  description:
    "Performance, lifecycle and document operations for the Rapid Innovation people team.",
};

// Fontshare-hosted Satoshi — the brand sans used on ruh.ai. We pull the
// stylesheet via <link> rather than @import in globals.css because Tailwind
// v4's own @import expands inline at the top of the compiled CSS, which
// would force any subsequent @import to violate the CSS-spec ordering rule.
const FONTSHARE_SATOSHI =
  "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900,401,501,701,901&display=swap";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTSHARE_SATOSHI} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
