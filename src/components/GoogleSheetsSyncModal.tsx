import { useState, useEffect, useId } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  X,
  Loader2,
  FolderOpen,
  Link,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import type { GoogleAuthUser } from '../lib/googleAuth';
import type { JobRecord } from '../types';
import type { ConnectedSheet } from '../hooks/useGoogleSheetsSync';
import type { GoogleSheetSummary } from '../lib/googleSheets';
import { Modal } from './Modal';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: GoogleAuthUser | null;
  hasToken: boolean;
  isLoggingIn: boolean;
  connectedSheet: ConnectedSheet | null;
  autoSync: boolean;
  onAutoSyncChange: (enabled: boolean) => void;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: Date | null;
  lastError: string | null;
  availableSheets: GoogleSheetSummary[];
  isLoadingSheets: boolean;
  onLogin: () => Promise<boolean>;
  onLogout: () => Promise<void>;
  onFetchSheets: () => Promise<void>;
  onCreateAndConnect: (title?: string) => Promise<ConnectedSheet>;
  onConnectExisting: (sheetId: string, sheetName?: string) => Promise<ConnectedSheet>;
  onSyncNow: () => Promise<boolean>;
  onDisconnectSheet: () => void;
  jobsCount: number;
}

export const GoogleSheetsSyncModal = ({
  isOpen,
  onClose,
  user,
  hasToken,
  isLoggingIn,
  connectedSheet,
  autoSync,
  onAutoSyncChange,
  syncStatus,
  lastSyncedAt,
  lastError,
  availableSheets,
  isLoadingSheets,
  onLogin,
  onLogout,
  onFetchSheets,
  onCreateAndConnect,
  onConnectExisting,
  onSyncNow,
  onDisconnectSheet,
  jobsCount,
}: GoogleSheetsSyncModalProps) => {
  const [tab, setTab] = useState<'status' | 'create' | 'existing' | 'url'>('status');
  const [newSheetTitle, setNewSheetTitle] = useState('Job Applications Tracker');
  const [manualSheetUrl, setManualSheetUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const mainHeadingId = useId();
  const confirmHeadingId = useId();

  // Mandatory confirmation state for destructive overwrite
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (isOpen && hasToken) {
      onFetchSheets();
    }
    if (isOpen) {
      setTab(connectedSheet ? 'status' : 'create');
      setActionError(null);
    }
  }, [isOpen, hasToken]);

  if (!isOpen) return null;

  const handleCreateSheet = async () => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      await onCreateAndConnect(newSheetTitle);
      setTab('status');
    } catch (err: any) {
      setActionError(err.message || 'Failed to create Google Sheet');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectExisting = (sheet: GoogleSheetSummary) => {
    setActionError(null);
    setPendingConfirmAction({
      title: `Connect and Sync to "${sheet.name}"?`,
      description: `This will update the active tab in "${sheet.name}" with your ${jobsCount} job application records. Any prior data in these rows will be replaced with your current tracker state.`,
      action: async () => {
        setIsSubmitting(true);
        try {
          await onConnectExisting(sheet.id, sheet.name);
          setTab('status');
        } catch (err: any) {
          setActionError(err.message || 'Failed to connect Google Sheet');
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const handleManualUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const match = manualSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = match ? match[1] : manualSheetUrl.trim();

    if (!sheetId) {
      setActionError('Please enter a valid Google Spreadsheet URL or ID.');
      return;
    }

    setPendingConfirmAction({
      title: 'Connect Custom Spreadsheet?',
      description: `This will synchronize ${jobsCount} application records into this Google Spreadsheet. Existing cell data in the primary sheet will be overwritten.`,
      action: async () => {
        setIsSubmitting(true);
        try {
          await onConnectExisting(sheetId);
          setTab('status');
        } catch (err: any) {
          setActionError(err.message || 'Failed to connect spreadsheet. Verify URL and edit access.');
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const handleManualSyncNow = () => {
    if (!connectedSheet) return;
    setPendingConfirmAction({
      title: `Sync ${jobsCount} Applications to Google Sheets?`,
      description: `This will overwrite the first tab of "${connectedSheet.name}" with your current jobs: details, status, time in status, and notes.`,
      action: async () => {
        await onSyncNow();
      },
    });
  };

  return (
    <>
    <Modal
      labelledBy={mainHeadingId}
      panelClassName="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90dvh] pb-[env(safe-area-inset-bottom)]"
    >
      {/* Header */}
      <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shadow-2xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 id={mainHeadingId} className="text-base font-bold text-slate-900 flex items-center gap-2">
              Google Sheets Synchronization
            </h2>
            <p className="text-xs text-slate-500">
              Copy your applications into a Google Sheet, on demand or automatically
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Google Sheets sync dialog"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body Content */}
      <div className="p-6 overflow-y-auto space-y-5 flex-1">
        {/* Auth State Banner */}
        {!hasToken ? (
          <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-indigo-900">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>Google Account Required</span>
              </div>
              <p className="text-xs text-indigo-700">
                Sign in with Google to copy your applications into a Google Sheet.
              </p>
            </div>

            {/* Official Google Sign In Button Style */}
            <button
              type="button"
              onClick={onLogin}
              disabled={isLoggingIn}
              className="inline-flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-xs font-semibold text-xs transition-colors cursor-pointer disabled:opacity-60 shrink-0"
            >
              {isLoggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              )}
              <span>{isLoggingIn ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2.5">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Google User'}
                  className="w-8 h-8 rounded-full border border-slate-300"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                  {user?.email?.charAt(0).toUpperCase() || 'G'}
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-slate-800">
                  {user?.displayName || 'Google Connected'}
                </div>
                <div className="text-[11px] text-slate-500 truncate max-w-xs">
                  {user?.email}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        )}

        {/* Navigation Tabs if Logged In */}
        {hasToken && (
          <div className="flex border-b border-slate-200 gap-4 text-xs font-semibold text-slate-500">
            <button
              type="button"
              onClick={() => setTab('status')}
              className={`pb-2 transition-colors cursor-pointer ${
                tab === 'status'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'hover:text-slate-800'
              }`}
            >
              Sync Status
            </button>
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`pb-2 transition-colors cursor-pointer ${
                tab === 'create'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'hover:text-slate-800'
              }`}
            >
              Create New Sheet
            </button>
            <button
              type="button"
              onClick={() => setTab('existing')}
              className={`pb-2 transition-colors cursor-pointer ${
                tab === 'existing'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'hover:text-slate-800'
              }`}
            >
              Pick from Drive
            </button>
            <button
              type="button"
              onClick={() => setTab('url')}
              className={`pb-2 transition-colors cursor-pointer ${
                tab === 'url'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'hover:text-slate-800'
              }`}
            >
              Paste URL / ID
            </button>
          </div>
        )}

        {/* Error Banner */}
        {(actionError || lastError) && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span className="font-medium flex-1">{actionError || lastError}</span>
            </div>

            {/* Shown when Google refuses sign-in because this site's domain is not authorized */}
            {(lastError?.includes('unauthorized-domain') ||
              lastError?.includes('Domain authorization') ||
              lastError?.includes('authorized domain')) && (
              <div className="pt-2 border-t border-rose-200/70 text-[11px] text-rose-900 space-y-2 bg-white/60 p-2.5 rounded-lg">
                <div className="font-semibold text-rose-950 flex items-center justify-between">
                  <span>This site is not authorized for Google sign-in</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Add this domain to the OAuth client's Authorized JavaScript origins in Google Cloud, then reload this page.
                </p>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Current Host Domain:
                  </span>
                  <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-md border border-slate-300 font-mono text-[11px] text-slate-800">
                    <span className="truncate flex-1 select-all font-semibold">
                      {typeof window !== 'undefined' ? window.location.hostname : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          navigator.clipboard.writeText(window.location.hostname);
                          setCopiedDomain(true);
                          setTimeout(() => setCopiedDomain(false), 2500);
                        }
                      }}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-sans text-[10px] font-bold cursor-pointer shrink-0 transition-colors"
                    >
                      {copiedDomain ? 'Copied ✓' : 'Copy Domain'}
                    </button>
                  </div>
                </div>

                <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 underline"
                  >
                    <span>1. Open Google Cloud Credentials</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-slate-500">→</span>
                  <span className="text-slate-700">2. Under &quot;Authorized domains&quot;, click <strong>Add domain</strong> & paste</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-slate-700">3. Retry <strong>Sign in with Google</strong></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: STATUS */}
        {tab === 'status' && (
          <div className="space-y-4">
            {connectedSheet ? (
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {connectedSheet.name}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>
                          {syncStatus === 'syncing'
                            ? 'Syncing changes...'
                            : lastSyncedAt
                            ? `Last synced ${lastSyncedAt.toLocaleTimeString()}`
                            : 'Ready to sync'}
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-emerald-700">
                          {jobsCount} records mapped
                        </span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={connectedSheet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100/50 shadow-2xs transition-colors"
                  >
                    <span>Open in Sheets</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Auto-Sync Toggle */}
                <div className="pt-3 border-t border-emerald-200/70 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      Automatic Real-time Sync
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Automatically update the Google Sheet shortly after jobs are added, edited, or deleted
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoSync}
                      onChange={(e) => onAutoSyncChange(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleManualSyncNow}
                    disabled={syncStatus === 'syncing' || !hasToken}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                    <span>{syncStatus === 'syncing' ? 'Syncing…' : 'Sync now'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDisconnectSheet}
                    className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    Disconnect sheet
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 space-y-3 bg-slate-50/50">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    No Google Sheet Connected Yet
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Create a new spreadsheet in your Google Drive or link an existing one to keep your tracker synced.
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('create')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create new sheet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('existing')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4 text-slate-500" />
                    <span>Pick existing</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: CREATE NEW */}
        {tab === 'create' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Spreadsheet Title
              </label>
              <input
                type="text"
                value={newSheetTitle}
                onChange={(e) => setNewSheetTitle(e.target.value)}
                placeholder="e.g. Job Applications Tracker"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
              <p className="text-[11px] text-slate-400">
                This will create a new Google Sheet in your Drive with frozen headers and auto-formatted columns.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-slate-700">Initial Data Preview</div>
              <div className="text-slate-500">
                {jobsCount} tracked job applications will be immediately written to the new sheet.
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateSheet}
              disabled={isSubmitting || !hasToken}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating & Syncing...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create & Connect Google Sheet</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* TAB: PICK EXISTING FROM DRIVE */}
        {tab === 'existing' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Recent Spreadsheets in Your Drive
              </span>
              <button
                type="button"
                onClick={onFetchSheets}
                disabled={isLoadingSheets}
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingSheets ? 'animate-spin' : ''}`} />
                <span>Refresh list</span>
              </button>
            </div>

            {isLoadingSheets ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span>Loading your Google Drive spreadsheets...</span>
              </div>
            ) : availableSheets.length > 0 ? (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl max-h-56 overflow-y-auto">
                {availableSheets.map((sheet) => (
                  <div
                    key={sheet.id}
                    className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {sheet.name}
                      </div>
                      {sheet.modifiedTime && (
                        <div className="text-[10px] text-slate-400">
                          Modified {new Date(sheet.modifiedTime).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectExisting(sheet)}
                      disabled={isSubmitting}
                      className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors cursor-pointer shrink-0"
                    >
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No Google Sheets found in your drive, or permissions were not yet granted.
              </div>
            )}
          </div>
        )}

        {/* TAB: PASTE URL OR ID */}
        {tab === 'url' && (
          <form onSubmit={handleManualUrlSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Google Sheet URL or Spreadsheet ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Link className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={manualSheetUrl}
                  onChange={(e) => setManualSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Copy the full link from your browser's address bar when viewing your Google Sheet.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !manualSheetUrl.trim() || !hasToken}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <span>Connect & Sync to Spreadsheet</span>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Google Sheets API v4 and Drive API v3</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-slate-600 hover:text-slate-800 font-medium cursor-pointer"
        >
          Close
        </button>
      </div>
    </Modal>

      {/* MANDATORY User Confirmation Dialog for Mutating/Overwriting Sheet Data */}
      {pendingConfirmAction && (
        <Modal
          labelledBy={confirmHeadingId}
          layer="stacked"
          role="alertdialog"
          panelClassName="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id={confirmHeadingId} className="text-sm font-bold text-slate-900">
                  {pendingConfirmAction.title}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {pendingConfirmAction.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingConfirmAction(null)}
              aria-label="Close confirmation dialog"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPendingConfirmAction(null)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                const action = pendingConfirmAction.action;
                setPendingConfirmAction(null);
                await action();
              }}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              Confirm & sync
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};
