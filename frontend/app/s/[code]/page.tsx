'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { resolveShareLink } from '../../../lib/api';
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react';

export default function SharedDocumentPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await resolveShareLink(code);
        if (!cancelled) window.location.replace(data.url);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to open share link');
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#070A11] text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-md p-6 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 shadow-2xl text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 mb-3">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-xl font-black tracking-tight">Opening Shared Document</h1>
        {!error ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Resolving secure link...</span>
          </div>
        ) : (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
