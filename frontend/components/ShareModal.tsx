'use client';

import React, { useState } from 'react';
import { DocumentItem, PermissionType, ShareResponse } from '../lib/types';
import { generateShareUrl } from '../lib/api';
import { 
  X, 
  Key, 
  Clock, 
  Eye, 
  Copy, 
  Check, 
  ExternalLink, 
  Loader2, 
  AlertCircle, 
  UserCheck, 
  ShieldCheck 
} from 'lucide-react';

interface ShareModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onShareGenerated: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  document,
  isOpen,
  onClose,
  onShareGenerated,
}) => {
  const permission: PermissionType = 'VIEW';
  const [expiresIn, setExpiresIn] = useState<number>(3600); // 1 hour default
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareData, setShareData] = useState<ShareResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !document) return null;

  const handleGenerateShare = async () => {
    try {
      setIsGenerating(true);
      setErrorMsg(null);
      const res = await generateShareUrl({
        documentId: document.DocumentID,
        permission,
        expiresIn,
        targetUserId: targetUserId.trim() || undefined,
      });
      setShareData(res);
      onShareGenerated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate share link');
    } finally {
      setIsGenerating(false);
    }
  };

  const shareLink = shareData?.shareUrl || shareData?.preSignedUrl || '';

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const resetAndClose = () => {
    setShareData(null);
    setErrorMsg(null);
    setCopied(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Create Short Share Link
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generates a short link that opens a secure time-limited document view
              </p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Document Details */}
        <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <div>
            <p className="text-slate-500 dark:text-slate-400">Selected Document</p>
            <p className="font-semibold text-slate-900 dark:text-white mt-0.5 truncate max-w-xs">{document.FileName}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-500 dark:text-slate-400">Document ID</p>
            <p className="font-mono text-slate-700 dark:text-slate-300 mt-0.5">{document.DocumentID}</p>
          </div>
        </div>

        {/* Target Specific User ID */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Target User ID or Recipient Email (Optional)
          </label>
          <div className="relative">
            <UserCheck className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={targetUserId}
              onChange={(e) => {
                setTargetUserId(e.target.value);
                setShareData(null);
              }}
              placeholder="User ID or email address"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Target user will gain authorized access tracked inside DynamoDB metadata.
          </p>
        </div>

        {/* Permission Level - View only */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Access Permission
          </label>
          <div className="p-3 rounded-xl border border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 text-left">
            <div className="flex items-center space-x-1.5 mb-1">
              <Eye className="w-4 h-4 text-cyan-500" />
              <span className="font-bold text-xs text-cyan-900 dark:text-cyan-200">View</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Read-only GET access</p>
          </div>
        </div>

        {/* Expiry Selector */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Signed Link Expiration
          </label>
          <div className="relative">
            <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={expiresIn}
              onChange={(e) => {
                setExpiresIn(Number(e.target.value));
                setShareData(null);
              }}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={900}>15 Minutes (Strict Security Window)</option>
              <option value={3600}>1 Hour (Standard Internal Session)</option>
              <option value={86400}>24 Hours (Daily Working Session)</option>
              <option value={604800}>7 Days (Max Allowed AWS SigV4 Window)</option>
            </select>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Generated Short Share Link Section */}
        {shareData ? (
          <div className="mt-4 p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Active Share Link</span>
              </span>
              <span className="text-[10px] text-slate-500">
                Expires: {new Date(shareData.expiresAt).toLocaleTimeString()}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareLink}
                className="w-full py-2 px-3 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300 font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-800 select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full sm:w-auto justify-center px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1 transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {shareLink && (
              <div className="mt-2 text-right">
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  <span>Open Share Link</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateShare}
            disabled={isGenerating}
            className="w-full mt-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-600 hover:from-indigo-400 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-indigo-500/20 flex items-center justify-center space-x-2 transition-all"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing with AWS SigV4...</span>
              </>
            ) : (
              <>
                <Key className="w-4 h-4" />
                <span>Create Short Share Link</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
