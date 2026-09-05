import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenNutriTracker — Web prototype",
  description: "A frontend-only web translation of OpenNutriTracker.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
