import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CloudDoc Vault | Secure Cloud Document Vault & Ephemeral Sharing',
  description: 'Enterprise-grade secure document vault built on Next.js 14, AWS S3, DynamoDB, and Lambda.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-vault-950 text-slate-100 selection:bg-cyan-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
