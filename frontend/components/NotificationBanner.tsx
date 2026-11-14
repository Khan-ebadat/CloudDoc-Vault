'use client';

import React from 'react';
import { MailCheck, RefreshCw, X, AlertCircle, Loader2 } from 'lucide-react';
import { EmailNotificationState } from '../lib/types';

interface NotificationBannerProps {
  state: EmailNotificationState;
  isRefreshing: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  state,
  isRefreshing,
  onRefresh,
  onDismiss,
}) => {
  if (state.status !== 'PENDING' && state.status !== 'ERROR') {
    return null;
  }

  const isError = state.status === 'ERROR';

  return (
    <div
      className={`mb-6 rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${
        isError
          ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800'
          : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
      }`}
    >
      <div
        className={`p-2 rounded-xl flex-shrink-0 ${
          isError
            ? 'bg-rose-500/10 text-rose-500'
            : 'bg-amber-500/10 text-amber-500'
        }`}
      >
        {isError ? <AlertCircle className="w-5 h-5" /> : <MailCheck className="w-5 h-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={`text-xs font-bold ${
            isError
              ? 'text-rose-800 dark:text-rose-200'
              : 'text-amber-800 dark:text-amber-200'
          }`}
        >
          {isError
            ? 'Email notifications could not be set up'
            : 'Confirm your email notifications'}
        </p>
        <p
          className={`text-[11px] mt-0.5 ${
            isError
              ? 'text-rose-700 dark:text-rose-300'
              : 'text-amber-700 dark:text-amber-300'
          }`}
        >
          {isError ? (
            <>We could not subscribe <span className="font-mono">{state.email}</span> to alerts. Try again in a moment.</>
          ) : (
            <>
              AWS sent a subscription confirmation to{' '}
              <span className="font-mono font-semibold">{state.email}</span>. Click the link in
              that email once, then press Check again. Upload receipts and share alerts go only to
              you.
            </>
          )}
        </p>
      </div>

      <div className="flex items-center space-x-2 flex-shrink-0">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[11px] font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950 disabled:opacity-60 transition-colors"
        >
          {isRefreshing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span>Check again</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification banner"
          className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
