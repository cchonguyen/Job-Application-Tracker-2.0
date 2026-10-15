import { useEffect, useRef, useState } from 'react';
import { X, Bookmark, RefreshCw } from 'lucide-react';
import { buildBookmarklet, getCaptureToken } from '../lib/captureBookmarklet';

interface BookmarkletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BookmarkletModal = ({ isOpen, onClose }: BookmarkletModalProps) => {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [token, setToken] = useState(() => getCaptureToken());

  // React refuses javascript: URLs in href, so the bookmarklet is set on the DOM node directly.
  useEffect(() => {
    if (isOpen && linkRef.current) {
      linkRef.current.setAttribute('href', buildBookmarklet(window.location.origin, token));
    }
  }, [isOpen, token]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">One-click capture</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-slate-600">
          Drag this button to your bookmarks bar. On any job posting, click the bookmark and the page is saved to your
          tracker in a small popup. It sends the page as your browser shows it, so it also works on sites the link
          importer cannot read, such as Darwinbox, Workday and LinkedIn.
        </p>
        <div className="flex justify-center py-2">
          <a
            ref={linkRef}
            onClick={(e) => e.preventDefault()}
            draggable
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium shadow cursor-grab"
          >
            <Bookmark className="w-4 h-4" />
            Save job
          </a>
        </div>
        <p className="text-xs text-slate-500">
          Tip: select the job description text before clicking to capture only that part of a busy page.
        </p>
        <button
          type="button"
          onClick={() => setToken(getCaptureToken(true))}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reset link (old bookmarks stop working)
        </button>
      </div>
    </div>
  );
};
