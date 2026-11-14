'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Cloud, Database, Bell, Plus, Sun, Moon, LogOut, User, Lock } from 'lucide-react';
import { DocumentItem, UserSession } from '../lib/types';
import { clearSession } from '../lib/api';
import { NotificationBell } from './NotificationBell';

interface NavbarProps {
  user: UserSession | null;
  documents: DocumentItem[];
  onOpenUpload: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenDocument: (doc: DocumentItem) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  documents,
  onOpenUpload,
  onOpenAuth,
  onLogout,
  onOpenDocument,
}) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('clouddoc_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme ? savedTheme === 'dark' : prefersDark;

    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextState = !isDarkMode;
    setIsDarkMode(nextState);
    if (nextState) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('clouddoc_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('clouddoc_theme', 'light');
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-200 dark:border-slate-800/80 px-4 sm:px-6 py-3.5 transition-colors duration-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white">
                CloudDoc<span className="text-cyan-500">Vault</span>
              </span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 hidden sm:inline-block">
                AWS Zero-Trust
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              Isolated S3 User Prefixes & Ephemeral Pre-Signed URLs
            </p>
          </div>
        </div>

        {/* AWS Live Health Badges */}
        <div className="hidden lg:flex items-center space-x-2.5 text-xs">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <Cloud className="w-3.5 h-3.5 text-cyan-500" />
            <span>S3 Private</span>
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <Database className="w-3.5 h-3.5 text-indigo-500" />
            <span>2x DynamoDB Tables</span>
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            <span>SNS Alerts</span>
          </div>
        </div>

        {/* User Controls & Theme Toggle */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Share Notification Bell */}
          {user && (
            <NotificationBell
              documents={documents}
              currentUser={user}
              onOpenDocument={onOpenDocument}
            />
          )}

          {/* Dark / Light Mode Toggle Button */}
          <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label="Toggle Dark and Light theme"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 transition-all active:scale-95 shadow-sm"
            title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} Mode`}
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-500" />
            )}
          </button>

          {/* User Profile or Login CTA */}
          {user ? (
            <div className="flex items-center space-x-2">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[130px]">
                  {user.fullName}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[130px]">
                  {user.userId}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 dark:bg-slate-900 dark:hover:bg-rose-950/50 dark:text-slate-400 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-800 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-all"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In / Register</span>
            </button>
          )}

          {/* Upload Button */}
          <button
            id="open-upload-modal-btn"
            onClick={onOpenUpload}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-medium text-xs sm:text-sm shadow-md shadow-cyan-500/25 transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Upload</span>
          </button>
        </div>
      </div>
    </header>
  );
};
