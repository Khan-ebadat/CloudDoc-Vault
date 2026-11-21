'use client';

import React, { useState, useRef } from 'react';
import { uploadDocument } from '../lib/api';
import { UserSession } from '../lib/types';
import { X, UploadCloud, File, AlertCircle, CheckCircle2, Loader2, ArrowUpRight } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  currentUser: UserSession | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onSuccess,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setErrorMsg(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select a file to upload.');
      return;
    }

    try {
      setIsUploading(true);
      setErrorMsg(null);
      await uploadDocument(selectedFile);
      setSuccessMsg(`"${selectedFile.name}" vaulted under user prefix in S3 & indexed!`);
      setTimeout(() => {
        setIsUploading(false);
        setSelectedFile(null);
        setSuccessMsg(null);
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMsg(err.message || 'Upload failed. Check API Gateway status.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 p-6 shadow-2xl transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Upload Document to Vault</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stored under prefix <span className="font-mono text-cyan-500">vault/{currentUser?.userId}/</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleUploadSubmit} className="mt-5 space-y-4">
          {/* Drag & Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20'
                : selectedFile
                ? 'border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/10'
                : 'border-slate-300 dark:border-slate-700/70 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50 dark:bg-slate-900/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />

            {selectedFile ? (
              <div className="flex items-center justify-center space-x-3 text-emerald-600 dark:text-emerald-400">
                <File className="w-8 h-8" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'Binary Document'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="p-3 rounded-full bg-slate-200 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Click to select or drag and drop document
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  PDF, DOCX, ZIP, PNG, CSV up to 100MB
                </p>
              </div>
            )}
          </div>

          {/* User ID / Ownership Display */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Target Vault Owner:</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {currentUser?.fullName} ({currentUser?.userId})
            </span>
          </div>

          {/* Error / Success Feedback */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-xs shadow-lg shadow-cyan-500/20 transition-all duration-200"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Encrypting & Storing...</span>
                </>
              ) : (
                <>
                  <span>Upload to Private S3</span>
                  <ArrowUpRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
