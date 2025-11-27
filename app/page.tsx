"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Migrate legacy auth flag from localStorage to sessionStorage
    const legacyAuth = localStorage.getItem('isAuthenticated');
    if (legacyAuth) {
      sessionStorage.setItem('isAuthenticated', legacyAuth);
      localStorage.removeItem('isAuthenticated');
    }

    const isAuthenticated = sessionStorage.getItem('isAuthenticated');
    if (isAuthenticated) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

  // Return null to show nothing while redirecting
  return null;
}
