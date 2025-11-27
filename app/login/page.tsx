"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('yourname@bitsom.edu.in');
  const [password, setPassword] = useState('password123');
  const [showModal, setShowModal] = useState(true);
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simple validation - in production, this would authenticate with a backend
    if (email && password) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('isAuthenticated', 'true');
        localStorage.removeItem('isAuthenticated');
      }
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 relative">
      {showModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur z-20">
          <div className="max-w-lg w-full bg-slate-900/90 border border-slate-700 rounded-2xl p-6 space-y-4 text-white shadow-2xl">
            <h2 className="text-xl font-semibold text-center text-orange-300">Important Notice</h2>
            <p className="text-sm text-slate-200">
              This portal is only for BITSoM Students, Alums and Admins.
            </p>
            <p className="text-sm text-slate-200">
              For demo/test purposes Microsoft login has been disabled. To login use:
            </p>
            <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 text-sm space-y-2">
              <p><span className="font-semibold text-orange-200">This Portal and PlaceBot is created and managed by BITSoM Students.</span></p>
            </div>
            <Button
              onClick={() => setShowModal(false)}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700"
            >
              Okay
            </Button>
          </div>
        </div>
      )}
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700 backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <Image 
              src="/bitsom-logo.png" 
              alt="BITSoM Logo" 
              width={128} 
              height={128}
              className="h-32 w-auto"
            />
          </div>
          <CardTitle className="text-3xl text-white">BITS School Of Management</CardTitle>
          <CardDescription className="text-xl text-orange-400">
            Placement and Career Services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-200">Email ID</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-orange-500 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-200">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-orange-500 focus:ring-orange-500"
              />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white">
              Login
            </Button>
          </form>
          <div className="mt-6 pt-6 border-t border-slate-700 text-center text-sm text-slate-400">
            <p>Only for BITSoM Students, Alums, and Admins</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

