'use client';

import { useEffect } from 'react';
import { SignIn as SignInServer } from './action';

export default function SignInComponent() {
  useEffect(() => {
    SignInServer();
  }, []);

  return <></>;
}
