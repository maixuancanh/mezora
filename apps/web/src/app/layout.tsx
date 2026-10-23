import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';
export const metadata: Metadata = { title: 'Mezora — Business treasury', description: 'Bills, cash commitments, and MUSD payments in one workspace.' };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { await connection(); return <html lang="en"><body>{children}</body></html>; }
