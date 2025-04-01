import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const lemonMilk = localFont({
  src: "./fonts/LEMONMILK-Regular.otf",
  variable: "--font-lemon-milk",
});

export const metadata: Metadata = {
  title: "Project Nikolaj",
  description: "Police Patrol Route Optimization System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${lemonMilk.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
