import type { ReactNode } from "react";

export const metadata = {
  title: "Resume Generator · Complete Pipeline",
  description: "JD-isolated resume generation and immutable final assembly",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Arial, sans-serif",
          margin: 0,
          background: "#f1f5f9",
          color: "#0f172a",
        }}
      >
        {children}
      </body>
    </html>
  );
}
