'use client';

import React from 'react';
import { AlertTriangle, LogOut, X } from 'lucide-react';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  userEmail?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  userEmail,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Sign Out?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Are you sure you want to sign out?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel sign out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {userEmail && (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Signed in as</p>
            <p className="font-semibold text-slate-900 dark:text-white mt-0.5 break-all">{userEmail}</p>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          You will be signed out and returned to the landing page.
        </p>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-500/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Yes, Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
