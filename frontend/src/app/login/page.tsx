import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import SignInComponent from './sign-in';

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await auth();

  if (session) {
    redirect(params.callbackUrl ?? '/');
  }

  return (
    <SessionProvider basePath="/api/auth">
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '2.5rem',
            border: '1px solid #D3D5D9',
            backgroundColor: '#fff',
            minWidth: '320px',
          }}
        >
          <div
            style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              color: '#002855',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            App Insights Explorer
          </div>
          <div style={{ fontSize: '0.875rem', color: '#757575', marginBottom: '2rem' }}>
            Redirecting to Microsoft sign-in...
          </div>
          <SignInComponent />
        </div>
      </div>
    </SessionProvider>
  );
}
