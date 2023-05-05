'use client';
import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>my portfolio</h1>
      <Link href="accounts">Accounts</Link>
      <br />
      <Link href="stocks">Stocks</Link>
    </main>
  )
}
