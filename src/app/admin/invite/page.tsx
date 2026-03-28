'use client';

import { teams } from '@/lib/appwrite';
import { useState } from 'react';

export default function InviteAdminPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccess('');
    setError('');

    const teamId = process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID;
    if (!teamId) {
      setError('Admin Team ID is not configured in .env.local');
      setIsLoading(false);
      return;
    }

    try {
      await teams.createMembership(
        teamId, // teamId
        ['owner'], // roles (adding them as owner makes them equal admins)
        email, // email
        undefined, // phone
        undefined, // phone
        `${window.location.origin}/auth/join`, // url to redirect to when they click the email
        // name can be omitted
      );
      setSuccess(`An invitation has been sent to ${email}`);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-base-content">
          Invite Administrators
        </h2>
        <p className="mt-2 text-base-content/60">
          Send an email invitation to add a new user to the Admin team. They will receive a secure link to create their account and join automatically.
        </p>
      </div>

      <div className="bg-base-100 p-6 sm:p-8 rounded-3xl shadow-xl border border-base-200">
        {error && (
          <div className="alert alert-error shadow-lg rounded-xl mb-6 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="alert alert-success shadow-lg rounded-xl mb-6 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleInvite} className="space-y-6">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium text-base-content/80">User Email Address</span>
            </label>
            <input
              type="email"
              required
              className="input input-bordered w-full"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email}
            className="btn btn-primary w-full sm:w-auto px-8"
          >
            {isLoading ? <span className="loading loading-spinner"></span> : 'Send Invitation'}
          </button>
        </form>
      </div>
    </div>
  );
}
