"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setChecking(false);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.authenticated) router.replace("/admin/login");
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/admin/login");
          setChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (pathname === "/admin/login") return <>{children}</>;
  if (checking)
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex items-center justify-center">
        <p className="text-slate-600">Checking authentication...</p>
      </div>
    );
  return <>{children}</>;
}
