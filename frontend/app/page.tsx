'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { LandingHero } from '../components/LandingHero';
import { StorageOverview } from '../components/StorageOverview';
import { DocumentTable } from '../components/DocumentTable';
import { UploadModal } from '../components/UploadModal';
import { ShareModal } from '../components/ShareModal';
import { AuthModal } from '../components/AuthModal';
import { DocumentItem, StorageMetrics, UserSession } from '../lib/types';
import { fetchDocuments, getStoredUser, clearSession } from '../lib/api';
import { RefreshCw, Loader2 } from 'lucide-react';

export default function AppRootPage() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [metrics, setMetrics] = useState<StorageMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [shareModalDoc, setShareModalDoc] = useState<DocumentItem | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const loadVaultData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchDocuments();
      setDocuments(data.documents);
      setMetrics(data.metrics);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching vault data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 1. Initial Authentication Check on Mount
  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) {
      setCurrentUser(storedUser);
      loadVaultData();
    } else {
      // First visit or logged out: user remains null
      setCurrentUser(null);
    }
    setIsAuthLoading(false);
  }, [loadVaultData]);

  // Handle Logout: Clears storage & session, returns to Home/Landing page immediately
  const handleLogout = () => {
    clearSession();
    setCurrentUser(null);
    setDocuments([]);
    setMetrics(null);
  };

  // Handle Auth Success from Hero card or Auth Modal
  const handleAuthSuccess = (user: UserSession) => {
    setCurrentUser(user);
    loadVaultData();
  };

  // Initial loading splash to avoid UI flicker
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070A11] text-cyan-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070A11] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Application Navbar with Dark/Light Toggle */}
      <Navbar
        user={currentUser}
        onOpenUpload={() => {
          if (!currentUser) {
            setAuthModalOpen(true);
          } else {
            setUploadModalOpen(true);
          }
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
        {!currentUser ? (
          /* ======================================================== */
          /* 1. FIRST VISIT / LOGGED OUT: HOME & AUTH LANDING PAGE    */
          /* ======================================================== */
          <LandingHero onAuthSuccess={handleAuthSuccess} />
        ) : (
          /* ======================================================== */
          /* 2. AUTHENTICATED: SECURITY VAULT DASHBOARD               */
          /* ======================================================== */
          <div className="py-8">
            {/* User Identity Welcome & Sync Status */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    Security Vault Dashboard
                  </h1>
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center space-x-2">
                  <span>
                    Authenticated as: <strong className="text-slate-700 dark:text-slate-200">{currentUser.fullName}</strong> ({currentUser.email})
                  </span>
                  <span>•</span>
                  <span className="font-mono text-cyan-600 dark:text-cyan-400">{currentUser.userId}</span>
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  Synced: {lastRefreshed || 'Connecting...'}
                </span>
                <button
                  onClick={loadVaultData}
                  disabled={loading}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700/80 text-xs font-semibold transition-all shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-500' : ''}`} />
                  <span>Refresh Vault</span>
                </button>
              </div>
            </div>

            {/* Storage Quota & Breakdown Widget */}
            <StorageOverview metrics={metrics} loading={loading} />

            {/* Document Registry Table */}
            <DocumentTable
              documents={documents}
              currentUser={currentUser}
              loading={loading}
              onOpenShare={(doc) => setShareModalDoc(doc)}
              onRefresh={loadVaultData}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/60 py-6 px-6 glass-panel mt-12 text-center text-xs text-slate-500 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 CloudDoc Vault Inc. Zero-Trust Storage Architecture.</p>
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span>DynamoDB 'ClouddocUsers'</span>
            <span>•</span>
            <span>'DocumentsMetadata'</span>
            <span>•</span>
            <span>Private S3 User Prefixes</span>
          </div>
        </div>
      </footer>

      {/* Interactive Modals */}
      {currentUser && (
        <>
          <UploadModal
            isOpen={uploadModalOpen}
            currentUser={currentUser}
            onClose={() => setUploadModalOpen(false)}
            onSuccess={loadVaultData}
          />

          <ShareModal
            document={shareModalDoc}
            isOpen={Boolean(shareModalDoc)}
            onClose={() => setShareModalDoc(null)}
            onShareGenerated={loadVaultData}
          />
        </>
      )}

      {/* Auth Modal (Accessible from Navbar button) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
