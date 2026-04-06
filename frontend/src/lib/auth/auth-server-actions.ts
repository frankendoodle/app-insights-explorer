'use server';

import { auth } from '@/auth';

export async function authenticate() {
  const session = await auth();
  if (!session) throw new Error('User is not authenticated');
  return session;
}
