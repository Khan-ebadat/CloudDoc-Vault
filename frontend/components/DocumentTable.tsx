'use client';

import React, { useState } from 'react';
import { DocumentItem, UserSession } from '../lib/types';
import { 
  FileText, 
  Image as ImageIcon, 
  Archive, 
  FileSpreadsheet, 
  File, 
  Share2, 
  Search, 
  CheckCircle2, 
  Lock, 
  Copy, 
  Users, 
  UserCheck 
} from 'lucide-react';

interface DocumentTableProps {
  documents: DocumentItem[];
  currentUser: UserSession | null;
  loading: boolean;
  onOpenShare: (doc: DocumentItem) => void;
  onRefresh: () => void;
}

export const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  currentUser,
  loading,
  onOpenShare,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'MINE' | 'SHARED'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getFileIcon = (mime: string, name: string) => {
    const lowerMime = (mime || '').toLowerCase();
    const lowerName = (name || '').toLowerCase();

    if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-rose-500" />;
    }
    if (lowerMime.includes('image') || /\.(png|jpe?g|gif|webp|svg)$/.test(lowerName)) {
      return <ImageIcon className="w-5 h-5 text-cyan-500" />;
    }
    if (lowerMime.includes('zip') || /\.(zip|rar|tar|gz)$/.test(lowerName)) {
      return <Archive className="w-5 h-5 text-amber-500" />;
    }
    if (lowerMime.includes('sheet') || lowerMime.includes('excel') || /\.(xlsx?|csv)$/.test(lowerName)) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    }
    return <File className="w-5 h-5 text-indigo-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.FileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.OwnerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.DocumentID.toLowerCase().includes(searchTerm.toLowerCase());

    const isMine = currentUser ? doc.OwnerID === currentUser.userId : true;
    const isShared = doc.SharedStatus === 'SHARED' || (Array.isArray(doc.SharedWith) && doc.SharedWith.length > 0);

    if (filterType === 'MINE') return matchesSearch && isMine;
    if (filterType === 'SHARED') return matchesSearch && isShared;
    return matchesSearch;
  });

  return (
    <div className="rounded-2xl glass-panel border border-slate-200 dark:border-slate-800/80 overflow-hidden shadow-xl transition-colors">
      {/* Search and Filters Header */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="search-documents-input"
            type="text"
            placeholder="Search by file name, owner, or Document ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 text-slate-900 dark:text-slate-200 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'ALL'
                ? 'bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border border-cyan-500/40'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            All Files ({documents.length})
          </button>
          <button
            onClick={() => setFilterType('MINE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'MINE'
                ? 'bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/40'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            My Vault
          </button>
          <button
            onClick={() => setFilterType('SHARED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'SHARED'
                ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Shared Files
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
          <thead className="bg-slate-100 dark:bg-slate-900/80 text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 tracking-wider">
            <tr>
              <th scope="col" className="px-6 py-3.5 font-semibold">Document Name</th>
              <th scope="col" className="px-6 py-3.5 font-semibold">Size</th>
              <th scope="col" className="px-6 py-3.5 font-semibold">Vault Owner</th>
              <th scope="col" className="px-6 py-3.5 font-semibold">Upload Date</th>
              <th scope="col" className="px-6 py-3.5 font-semibold">Sharing Policy</th>
              <th scope="col" className="px-6 py-3.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs">Querying 'DocumentsMetadata' DynamoDB table...</p>
                  </div>
                </td>
              </tr>
            ) : filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <File className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No documents found</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Upload a new document or adjust filters.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredDocs.map((doc) => {
                const isShared = doc.SharedStatus === 'SHARED' || (Array.isArray(doc.SharedWith) && doc.SharedWith.length > 0);
                const isOwner = currentUser ? doc.OwnerID === currentUser.userId : false;

                return (
                  <tr key={doc.DocumentID} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex-shrink-0">
                          {getFileIcon(doc.ContentType, doc.FileName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md group-hover:text-cyan-500 transition-colors">
                            {doc.FileName}
                          </p>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                            <span>{doc.DocumentID}</span>
                            <button
                              onClick={() => handleCopyId(doc.DocumentID)}
                              className="hover:text-cyan-500 transition-colors"
                              title="Copy ID"
                            >
                              {copiedId === doc.DocumentID ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {formatFileSize(doc.FileSize)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {isOwner ? 'You' : (doc.OwnerName || 'System Admin')}
                        </span>
                        {isOwner && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 font-bold">
                            Owner
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                      {new Date(doc.UploadDate).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      {isShared ? (
                        <div className="flex items-center space-x-1.5">
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60">
                            <Share2 className="w-3 h-3 text-indigo-500" />
                            <span>Pre-Signed Active</span>
                          </span>
                          {Array.isArray(doc.SharedWith) && doc.SharedWith.length > 0 && (
                            <span className="text-[10px] text-slate-400 flex items-center space-x-0.5" title={`Shared with ${doc.SharedWith.length} users`}>
                              <Users className="w-3 h-3 text-slate-400" />
                              <span>{doc.SharedWith.length}</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                          <Lock className="w-3 h-3" />
                          <span>Private Vault</span>
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => onOpenShare(doc)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share Link</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
