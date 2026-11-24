'use client';

import React, { useState } from 'react';
import { loginUser, signupUser } from '../lib/api';
import { UserSession } from '../lib/types';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  User, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  HardDrive, 
  Share2, 
  Database, 
  Bell, 
  Key, 
  Sparkles,
  Eye,
  EyeOff
} from 'lucide-react';

interface LandingHeroProps {
  onAuthSuccess: (user: UserSession, email: string, password: string) => void;
  initialEmail?: string;
  initialPassword?: string;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onAuthSuccess,
  initialEmail = '',
  initialPassword = '',
}) => {
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (authMode === 'SIGNUP') {
        const res = await signupUser(email, password, fullName);
        onAuthSuccess(res.user, email, password);
      } else {
        const res = await loginUser(email, password);
        onAuthSuccess(res.user, email, password);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="py-10 sm:py-16">
      {/* Hero Header & Value Proposition */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Value Proposition & Architecture */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-cyan-100 dark:bg-cyan-950/80 border border-cyan-300 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-cyan-500 animate-pulse" />
            <span>AWS Serverless Zero-Trust Architecture</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.15]">
            Secure Cloud Vault & <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-indigo-600">Ephemeral Sharing</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
            Private document repository leveraging <strong>Amazon S3 User Prefixes</strong>, <strong>Dual DynamoDB Ledgers</strong>, and time-bounded <strong>AWS SigV4 Pre-Signed URLs</strong>. Public bucket access is permanently disabled.
          </p>

          {/* Quick Metrics Pills */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2">
            <div className="p-2.5 sm:p-3.5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
              <p className="text-base sm:text-2xl font-black text-cyan-600 dark:text-cyan-400">100%</p>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">Private S3 Buckets</p>
            </div>
            <div className="p-2.5 sm:p-3.5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
              <p className="text-base sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">AES-256</p>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">SSE Encrypted At Rest</p>
            </div>
            <div className="p-2.5 sm:p-3.5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
              <p className="text-base sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">SigV4</p>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">Time-Bounded Links</p>
            </div>
          </div>
        </div>

        {/* Right Column: In-Page Sign In / Registration Card */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl glass-panel border border-slate-200 dark:border-slate-800/80 p-6 sm:p-8 shadow-2xl transition-all">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  {authMode === 'LOGIN' ? 'Sign In to Your Vault' : 'Create Vault Account'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  DynamoDB 'ClouddocUsers' Verified Session
                </p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-5">
              <button
                type="button"
                onClick={() => { setAuthMode('LOGIN'); setErrorMessage(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  authMode === 'LOGIN'
                    ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('SIGNUP'); setErrorMessage(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  authMode === 'SIGNUP'
                    ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {authMode === 'SIGNUP' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-10 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {authMode === 'LOGIN' && (
                  <div className="mt-1.5 text-right">
                    <a href="/forgot-password" className="text-xs text-cyan-500 font-semibold hover:underline">
                      Forgot password?
                    </a>
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 flex items-center justify-center space-x-2 transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Session...</span>
                  </>
                ) : (
                  <>
                    <span>{authMode === 'LOGIN' ? 'Sign In to Dashboard' : 'Complete Registration'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Feature Deep Dive Grid */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-500 w-fit mb-3">
            <HardDrive className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1.5">User-Isolated S3 Prefixes</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Every document is quarantined under <span className="font-mono text-cyan-500">vault/&#123;userId&#125;/</span> with strict IAM bucket policies and zero public read permissions.
          </p>
        </div>

        <div className="p-6 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 w-fit mb-3">
            <Key className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1.5">Ephemeral SigV4 Signed URLs</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Recipient-only, view-only short links valid from 15 minutes to 7 days; each open issues a fresh signed GET URL capped at 60 seconds.
          </p>
        </div>

        <div className="p-6 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 w-fit mb-3">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1.5">Dual DynamoDB Architecture</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Separated data layers: <span className="font-mono text-emerald-500">ClouddocUsers</span> for credentials & <span className="font-mono text-emerald-500">DocumentsMetadata</span> for fine-grained sharing rules.
          </p>
        </div>

        <div className="p-6 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 w-fit mb-3">
            <Bell className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1.5">Real-Time SNS Event Alerts</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Automated email dispatches trigger on every file upload and permission update, keeping audit logs synchronized with CloudWatch.
          </p>
        </div>
      </div>
    </div>
  );
};
