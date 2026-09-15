import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Essência do Campo • Gestão ERP',
  description: 'Sistema de gestão comercial e operacional da Essência do Campo',
  robots: { index: false, follow: false },
  icons: { icon: '/logo.jpg' }
};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="pt-BR"><body>{children}</body></html>; }
