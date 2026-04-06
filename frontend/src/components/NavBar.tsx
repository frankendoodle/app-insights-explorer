'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOut } from '@/app/actions/sign-out';

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="px-6 py-0 flex gap-0 items-stretch shadow-md" style={{ backgroundColor: '#002f6c' }}>
      <span className="font-bold text-white mr-8 flex items-center text-sm tracking-wide">
        App Insights Explorer
      </span>
      <NavLink href="/" active={pathname === '/'}>Dashboard</NavLink>
      <NavLink href="/explorer" active={pathname === '/explorer'}>Diagnostic Explorer</NavLink>
      <form action={SignOut} className="ml-auto flex items-center">
        <button
          type="submit"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            padding: '0 0.75rem',
          }}
          onMouseOver={e => ((e.target as HTMLButtonElement).style.color = '#fff')}
          onMouseOut={e => ((e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)')}
        >
          Sign out
        </button>
      </form>
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={[
        'px-4 py-4 text-sm font-bold uppercase tracking-wide flex items-center border-b-4 transition-colors',
        active
          ? 'text-white border-[#FF7F32]'
          : 'text-white/70 border-transparent hover:text-white hover:border-[#FF7F32]',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}
