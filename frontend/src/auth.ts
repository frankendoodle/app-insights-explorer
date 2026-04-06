import NextAuth, { NextAuthConfig } from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false;
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AppRegistrationClientId,
      clientSecret: process.env.AppRegistrationClientSecret,
      issuer: `https://login.microsoftonline.com/${process.env.AppRegistrationTenantId}/v2.0`,
      authorization: {
        params: { scope: 'openid profile email' },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: useSecureCookies,
      },
    },
  },
  trustHost: true,
  callbacks: {
    redirect: async ({ url, baseUrl }) => {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      return url.startsWith(baseUrl) ? url : baseUrl;
    },
  },
  secret: process.env.NextAuthSecret,
} satisfies NextAuthConfig;

export const {
  auth,
  handlers: { GET, POST },
  signIn,
  signOut,
} = NextAuth({ ...authConfig });
