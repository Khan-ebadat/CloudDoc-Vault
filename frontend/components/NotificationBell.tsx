'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DocumentItem, ShareNotification, UserSession } from '../lib/types';
import {
  Archive,
  Bell,
  CheckCheck,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Inbox,
  Share2,
} from 'lucide-react';

interface NotificationBellProps {
  documents: DocumentItem[];
  currentUser: UserSession;
  onOpenDocument: (doc: DocumentItem) => void;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function getFileIcon(mime: string, name: string) {
  const lowerMime = (mime || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();

  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) {
    return <FileText className="w-4 h-4 text-rose-500" />;
  }
  if (lowerMime.includes('image') || /\.(png|jpe?g|gif|webp|svg)$/.test(lowerName)) {
    return <ImageIcon className="w-4 h-4 text-cyan-500" />;
  }
  if (lowerMime.includes('zip') || /\.(zip|rar|tar|gz)$/.test(lowerName)) {
    return <Archive className="w-4 h-4 text-amber-500" />;
  }
  if (lowerMime.includes('sheet') || lowerMime.includes('excel') || /\.(xlsx?|csv)$/.test(lowerName)) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
  }
  return <File className="w-4 h-4 text-indigo-500" />;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  documents,
  currentUser,
  onOpenDocument,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const storageKey = `clouddoc_notifications_read_${currentUser.userId}`;

  // Load read-state for this user from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      setReadKeys(stored ? JSON.parse(stored) : []);
    } catch {
      setReadKeys([]);
    }
  }, [storageKey]);

  // Close the dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  // Derive notifications from documents shared with the current user
  const notifications = useMemo<ShareNotification[]>(() => {
    const list: ShareNotification[] = [];
    const email = (currentUser.email || '').toLowerCase();

    for (const doc of documents) {
      const share = (doc.SharedWith || []).find(
        (entry) =>
          entry.userId === currentUser.userId ||
          (entry.email || '').toLowerCase() === email
      );
      if (!share) continue;

      list.push({
        key: `${doc.DocumentID}|${share.sharedAt}`,
        document: doc,
        permission: share.permission,
        sharedBy: share.sharedBy,
        sharedByName: share.sharedByName,
        sharedAt: share.sharedAt,
      });
    }

    return list.sort(
      (a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()
    );
  }, [documents, currentUser]);

  const unread = notifications.filter((notification) => !readKeys.includes(notification.key));

  const persistReadKeys = (keys: string[]) => {
    setReadKeys(keys);
    try {
      localStorage.setItem(storageKey, JSON.stringify(keys));
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  };

  const markRead = (key: string) => {
    if (!readKeys.includes(key)) {
      persistReadKeys([...readKeys, key]);
    }
  };

  const markAllRead = () => {
    persistReadKeys(Array.from(new Set([...readKeys, ...notifications.map((n) => n.key)])));
  };

  const handleNotificationClick = (notification: ShareNotification) => {
    markRead(notification.key);
    setIsOpen(false);
    onOpenDocument(notification.document);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((value) => !value)}
        aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ''}`}
        title="Share notifications"
        className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 transition-all active:scale-95 shadow-sm"
      >
        <Bell className="w-4 h-4" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border border-white dark:border-slate-900">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-slate-900 dark:text-white">Notifications</span>
              {unread.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  {unread.length} new
                </span>
              )}
            </div>
            {notifications.length > 0 && unread.length > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center space-x-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <Inbox className="w-9 h-9 text-slate-400 dark:text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No notifications yet</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  When someone shares a document with you, it will appear here.
                </p>
              </div>
            ) : (
              notifications.map((notification) => {
                const isUnread = !readKeys.includes(notification.key);
                return (
                  <button
                    key={notification.key}
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 transition-colors ${
                      isUnread
                        ? 'bg-cyan-50/60 dark:bg-cyan-950/20 hover:bg-cyan-100/60 dark:hover:bg-cyan-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex-shrink-0">
                        {getFileIcon(notification.document.ContentType, notification.document.FileName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {notification.document.FileName}
                          </p>
                          {isUnread && (
                            <span className="mt-1 w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {notification.sharedByName || 'A vault owner'}
                          </span>{' '}
                          shared this with you
                        </p>
                        <div className="flex items-center space-x-2 mt-1.5">
                          <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60">
                            <Share2 className="w-2.5 h-2.5" />
                            {notification.permission}
                          </span>
                          <span className="text-[10px] text-slate-400">{timeAgo(notification.sharedAt)}</span>
                          <span className="text-[10px] text-cyan-600 dark:text-cyan-400 inline-flex items-center space-x-0.5 ml-auto">
                            <span>Open</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
