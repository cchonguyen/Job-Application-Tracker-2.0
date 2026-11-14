import { useState } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Settings,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ConnectedSheet } from '../hooks/useGoogleSheetsSync';

interface GoogleSheetsBadgeProps {
  user: User | null;
  hasToken: boolean;
  connectedSheet: ConnectedSheet | null;
  autoSync: boolean;
  onAutoSyncChange: (enabled: boolean) => void;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: Date | null;
  onSyncNow: () => Promise<boolean>;
  onOpenModal: () => void;
}

export const GoogleSheetsBadge = ({
  user,
  hasToken,
  connectedSheet,
  autoSync,
  onAutoSyncChange,
  syncStatus,
  lastSyncedAt,
  onSyncNow,
  onOpenModal,
}: GoogleSheetsBadgeProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  if (!connectedSheet) {
    return (
      <button
        type="button"
        onClick={onOpenModal}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-emerald-700 border border-slate-300 hover:border-emerald-300 rounded-lg shadow-2xs text-xs font-semibold transition-all cursor-pointer select-none"
        title="Connect Google Sheets to automatically sync your applications"
      >
        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="hidden sm:inline">Sync Google Sheet</span>
        <span className="sm:hidden">Sheets</span>
      </button>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold shadow-2xs transition-all cursor-pointer select-none ${
          syncStatus === 'error'
            ? 'bg-rose-50 border-rose-300 text-rose-800'
            : syncStatus === 'syncing'
            ? 'bg-amber-50 border-amber-300 text-amber-800'
            : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100/60'
        }`}
      >
        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="hidden sm:inline">
          {syncStatus === 'syncing'
            ? 'Syncing...'
            : syncStatus === 'error'
            ? 'Sync Error'
            : 'Sheets Synced'}
        </span>
        <span className="sm:hidden">
          {syncStatus === 'syncing' ? 'Syncing' : 'Sheets'}
        </span>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            syncStatus === 'syncing'
              ? 'bg-amber-500 animate-pulse'
              : syncStatus === 'error'
              ? 'bg-rose-500'
              : 'bg-emerald-500'
          }`}
        />
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {isDropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setIsDropdownOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 animate-in fade-in slide-in-from-top-1 duration-150 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Google Sheets Sync
              </div>
              {lastSyncedAt && (
                <div className="text-[10px] text-slate-400">
                  {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold text-slate-800 truncate" title={connectedSheet.name}>
                  {connectedSheet.name}
                </div>
                <div className="text-[10px] text-slate-500">
                  {user?.email || 'Connected'}
                </div>
              </div>

              <a
                href={connectedSheet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                title="Open spreadsheet in Google Sheets"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Auto Sync Toggle */}
            <div className="flex items-center justify-between py-1.5 px-2 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs font-medium text-slate-700">Auto-sync updates</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => onAutoSyncChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  onSyncNow();
                  setIsDropdownOpen(false);
                }}
                disabled={syncStatus === 'syncing' || !hasToken}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                <span>Sync Now</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenModal();
                  setIsDropdownOpen(false);
                }}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Manage Google Sheets Connection"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
