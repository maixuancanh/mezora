import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Mezora — Business treasury', description: 'Bills, cash commitments, and MUSD payments in one workspace.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
