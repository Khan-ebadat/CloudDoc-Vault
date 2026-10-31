'use client';

import React from 'react';
import { StorageMetrics } from '../lib/types';
import { HardDrive, FileText, Image, Archive, FileSpreadsheet, Lock, Sparkles, Share2 } from 'lucide-react';

interface StorageOverviewProps {
  metrics: StorageMetrics | null;
  loading: boolean;
}

export const StorageOverview: React.FC<StorageOverviewProps> = ({ metrics, loading }) => {
  const usedMB = metrics ? (metrics.totalSizeBytes / (1024 * 1024)).toFixed(1) : '0';
  const quotaGB = 50;
  const usedPercentage = metrics?.usedPercentage || '0.00';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 transition-colors">
      {/* 1. Main Storage Usage Meter Card */}
      <div className="lg:col-span-2 rounded-2xl glass-panel p-6 relative overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Vault Storage Quota</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">AWS S3 Private Storage with SSE-AES256 & User Prefixes</p>
            </div>
          </div>
          <div className="mt-2 sm:mt-0 text-right">
            <span className="text-2xl font-black text-cyan-500 dark:text-cyan-400">{usedMB} MB</span>
            <span className="text-xs text-slate-500 dark:text-slate-400"> / {quotaGB} GB Allocated</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Capacity Utilized</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{usedPercentage}%</span>
          </div>
          <div className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 transition-all duration-700 ease-out"
              style={{ width: `${Math.max(Number(usedPercentage), 2)}%` }}
            ></div>
          </div>
        </div>

        {/* Breakdown by Type */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">PDF Files</p>
              <p className="font-bold text-sm text-slate-900 dark:text-white">{metrics?.categories.pdf || 0}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Docs & Data</p>
              <p className="font-bold text-sm text-slate-900 dark:text-white">{metrics?.categories.documents || 0}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
              <Image className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Media</p>
              <p className="font-bold text-sm text-slate-900 dark:text-white">{metrics?.categories.images || 0}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Archives</p>
              <p className="font-bold text-sm text-slate-900 dark:text-white">{metrics?.categories.archives || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Security & Policy Status Card */}
      <div className="rounded-2xl glass-panel p-6 flex flex-col justify-between border border-slate-200 dark:border-slate-800 relative overflow-hidden">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <Lock className="w-4 h-4 text-emerald-500" />
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Security Controls</h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
              Zero-Trust
            </span>
          </div>

          <ul className="mt-4 space-y-3 text-xs">
            <li className="flex items-start space-x-2.5">
              <Sparkles className="w-4 h-4 text-cyan-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-slate-800 dark:text-slate-200 font-medium">S3 Block Public Access</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">All direct public web traffic blocked</p>
              </div>
            </li>
            <li className="flex items-start space-x-2.5">
              <Share2 className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-slate-800 dark:text-slate-200 font-medium">Ephemeral Pre-Signed URLs</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">AWS SigV4 time-limited cryptographic tokens</p>
              </div>
            </li>
            <li className="flex items-start space-x-2.5">
              <Lock className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-slate-800 dark:text-slate-200 font-medium">Dual DynamoDB Architecture</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">'ClouddocUsers' + 'DocumentsMetadata'</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Active Vault Documents:</span>
          <span className="font-bold text-slate-900 dark:text-white text-sm">{metrics?.totalFiles || 0}</span>
        </div>
      </div>
    </div>
  );
};
