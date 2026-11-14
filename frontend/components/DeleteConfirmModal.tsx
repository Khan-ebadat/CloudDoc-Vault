'use client';

import React from 'react';
import { DocumentItem } from '../lib/types';
import { AlertTriangle, AlertCircle, Loader2, Trash2, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  isDeleting: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  document,
  isOpen,
  isDeleting,
  errorMsg,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 p-6 shadow-2xl transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Delete Document</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Document */}
        <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Selected Document</p>
          <p className="font-semibold text-slate-900 dark:text-white mt-0.5 truncate">{document.FileName}</p>
          <p className="font-mono text-[10px] text-slate-400 mt-0.5">{document.DocumentID}</p>
        </div>

        {/* What gets removed */}
        <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
          <p className="font-semibold">This permanently removes:</p>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li>
              the S3 object <span className="font-mono break-all">{document.S3Key}</span>
            </li>
            <li>
              the <span className="font-mono">DocumentsMetadata</span> record
            </li>
          </ul>
        </div>

        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-rose-500/20 transition-all"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deleting from S3 & DynamoDB...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Delete Permanently</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
