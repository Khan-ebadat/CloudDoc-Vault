'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { clearSession, resolveShareLink, ShareLinkError } from '../../../lib/api';
import { AuthModal } from '../../../components/AuthModal';
import { Loader2, AlertCircle, ShieldCheck, LogIn, UserX } from 'lucide-react';

export default function SharedDocumentPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code;
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setError(null);
    setNeedsSignIn(false);

    (async () => {
      try {
        const data = await resolveShareLink(code);
        // The URL is issued only after the backend verified our login JWT
        // against the recipient stored with this share code.
        if (!cancelled && data.url) window.location.replace(data.url);
      } catch (err: any) {
        if (cancelled) return;
        const message = err?.message || 'Failed to open share link';
        if (err instanceof ShareLinkError && err.status === 401) {
          setNeedsSignIn(true);
          setAuthModalOpen(true);
          setError('Sign in with the recipient account to open this document.');
        } else if (err instanceof ShareLinkError && err.status === 403) {
          // A signed-in user who is not the intended recipient can switch
          // accounts and retry the very same link.
          setNeedsSignIn(true);
          setError(message);
        } else {
          setNeedsSignIn(false);
          setError(message);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [code, attempt]);

  const handleAuthSuccess = useCallback(() => {
    setAuthModalOpen(false);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  const handleSwitchAccount = useCallback(() => {
    clearSession();
    setError(null);
    setAuthModalOpen(true);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#070A11] text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-md p-6 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 shadow-2xl text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 mb-3">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-xl font-black tracking-tight">
          {needsSignIn ? 'Sign In Required' : 'Opening Shared Document'}
        </h1>
        {!error ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verifying secure link...</span>
          </div>
        ) : (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {needsSignIn && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <LogIn className="w-4 h-4" />
              Sign In &amp; Open
            </button>
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <UserX className="w-4 h-4" />
              Use another account
            </button>
          </div>
        )}
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        allowSignup={false}
      />
    </div>
  );
}
