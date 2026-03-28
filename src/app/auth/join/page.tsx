'use client';

import { teams } from '@/lib/appwrite';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

function JoinForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const teamId = searchParams.get('teamId');
  const membershipId = searchParams.get('membershipId');
  const userId = searchParams.get('userId');
  const secret = searchParams.get('secret');

  const handleAccept = async () => {
    if (!teamId || !membershipId || !userId || !secret) {
      setError('Invalid or missing invitation link parameters.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await teams.updateMembershipStatus(teamId, membershipId, userId, secret);
      // Wait a moment for Appwrite to establish the session cookies
      setTimeout(() => {
         window.location.href = '/';
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation.');
      setIsLoading(false);
    }
  };

  if (!teamId || !secret) {
    return (
      <div className="alert alert-error">
        Invalid invitation link.
      </div>
    );
  }

  return (
    <div className="text-center space-y-6">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30 mb-6">
        <span className="text-3xl font-bold text-primary-content">W</span>
      </div>
      <h2 className="text-3xl font-extrabold tracking-tight text-base-content">
        Accept Admin Invitation
      </h2>
      <p className="text-base-content/60">
        You have been invited to join the Waitwhile Generator as an Administrator.
      </p>

      {error && (
        <div className="alert alert-error shadow-lg rounded-xl text-sm">
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleAccept}
        disabled={isLoading}
        className="btn btn-primary w-full h-12 rounded-xl text-base shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all font-semibold mt-8"
      >
        {isLoading ? <span className="loading loading-spinner"></span> : 'Accept & Join'}
      </button>
      
      <p className="text-xs text-base-content/40 mt-4">
        By accepting, you will be automatically logged in. For subsequent logins, please use Google OAuth with your invited email address.
      </p>
    </div>
  );
}

export default function JoinPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-base-300 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full bg-base-100 p-8 sm:p-10 rounded-3xl shadow-2xl border border-white/5 relative z-10 backdrop-blur-xl">
        <Suspense fallback={<div className="text-center"><span className="loading loading-spinner loading-lg text-primary"></span></div>}>
          <JoinForm />
        </Suspense>
      </div>
    </div>
  );
}
