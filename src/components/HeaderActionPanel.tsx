import { useId, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Link2,
  Sparkles,
  ChevronDown,
  Loader2,
  Briefcase,
  FileText,
  Sliders,
  Bookmark,
  Settings,
  HelpCircle,
  FileSpreadsheet,
  LogOut,
  Mail,
  X,
} from 'lucide-react';
import { JobStatus } from '../types';
import { STATUS_META, STATUS_ORDER } from '../lib/statusMeta';
import type { ThemeAccent, ThemeMode } from '../lib/theme';
import { ThemeSelector } from './ThemeSelector';
import { ManualJobModal } from './ManualJobModal';
import { BookmarkletModal } from './BookmarkletModal';
import { PortalDropdown } from './PortalDropdown';
import { useAccount } from './AuthGate';
import { APP_VERSION, APP_COMMIT, formatBuildTime } from '../lib/appVersion';
import type { User } from 'firebase/auth';
import type { GoogleAuthUser } from '../lib/googleAuth';
import type { ConnectedSheet } from '../hooks/useGoogleSheetsSync';

interface HeaderActionPanelProps {
  totalJobs: number;
  onOpenAtsDebugger: () => void;
  onOpenGmailSuggestions?: () => void;
  onIngest: (params: { url?: string; manualText?: string; status?: JobStatus; notes?: string }) => Promise<void>;
  isIngesting: boolean;
  themeMode: ThemeMode;
  themeAccent: ThemeAccent;
  onThemeModeChange: (mode: ThemeMode) => void;
  onThemeAccentChange: (accent: ThemeAccent) => void;
  googleSheetsProps?: {
    user: User | GoogleAuthUser | null;
    hasToken: boolean;
    connectedSheet: ConnectedSheet | null;
    autoSync: boolean;
    onAutoSyncChange: (enabled: boolean) => void;
    syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
    lastSyncedAt: Date | null;
    onSyncNow: () => Promise<boolean>;
    onOpenModal: () => void;
  };
}

const STATUS_OPTIONS = STATUS_ORDER.map((status) => {
  const meta = STATUS_META[status];
  return { value: meta.value, label: meta.label, icon: meta.icon, color: meta.iconClass };
});

export const HeaderActionPanel = ({
  totalJobs,
  onOpenAtsDebugger,
  onOpenGmailSuggestions,
  onIngest,
  isIngesting,
  themeMode,
  themeAccent,
  onThemeModeChange,
  onThemeAccentChange,
  googleSheetsProps,
}: HeaderActionPanelProps) => {
  const [url, setUrl] = useState('');
  const [targetStatus, setTargetStatus] = useState<JobStatus>('Applied');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const account = useAccount();
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isBookmarkletOpen, setIsBookmarkletOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const infoHeadingId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!url.trim()) {
      setErrorMsg('Please paste a job URL or click the text icon to paste description text.');
      return;
    }

    try {
      await onIngest({
        url: url.trim(),
        status: targetStatus,
      });
      setUrl('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not add this job. Try again, or paste the job description instead.');
    }
  };

  const handleManualSubmit = async (params: { manualText: string; status: JobStatus; notes?: string }) => {
    await onIngest(params);
  };

  const activeStatusOption = STATUS_OPTIONS.find((s) => s.value === targetStatus) || STATUS_OPTIONS[0];
  const ActiveStatusIcon = activeStatusOption.icon;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs will-change-transform transform-gpu pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 space-y-2.5">
        {/* Top App Bar: Hero Branding + Unified Utility Menu */}
        <div className="flex items-center justify-between gap-3">
          {/* Brand Mark & Prominent Hero Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-2.5 min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight truncate">
                Job Application Tracker
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/80 shrink-0">
                {totalJobs} {totalJobs === 1 ? 'Job' : 'Jobs'}
              </span>
            </div>
          </div>

          {/* Unified Utility Cluster */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Theme Switcher */}
            <ThemeSelector
              mode={themeMode}
              accent={themeAccent}
              onModeChange={onThemeModeChange}
              onAccentChange={onThemeAccentChange}
            />

            {/* Consolidated Settings & Options Menu */}
            <div>
              <button
                ref={settingsBtnRef}
                type="button"
                onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
                aria-label="Settings and options"
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Portal-rendered Settings Dropdown */}
              <PortalDropdown
                isOpen={isSettingsMenuOpen}
                onClose={() => setIsSettingsMenuOpen(false)}
                triggerRef={settingsBtnRef}
                align="right"
                className="w-56 py-1.5"
              >
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                  Integrations & Tools
                </div>

                {googleSheetsProps && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      googleSheetsProps.onOpenModal();
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Google Sheets Sync</span>
                  </button>
                )}

                {onOpenGmailSuggestions && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onOpenGmailSuggestions();
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-rose-500" />
                    <span>Gmail suggestions</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsMenuOpen(false);
                    setIsBookmarkletOpen(true);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5 text-indigo-600" />
                  <span>One-click capture</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsMenuOpen(false);
                    onOpenAtsDebugger();
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  <span>ATS diagnostic</span>
                </button>

                <div className="border-t border-slate-100 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsMenuOpen(false);
                    setIsInfoOpen(true);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>How extraction works</span>
                </button>

                {account && (
                  <>
                    <div className="border-t border-slate-100 my-1" />
                    <div className="px-3 py-1 text-[11px] text-slate-500 truncate select-text" title={account.email || undefined}>
                      {account.email || 'Signed in'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsMenuOpen(false);
                        account.signOut();
                      }}
                      className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-slate-500" />
                      <span>Sign out</span>
                    </button>
                  </>
                )}

                <div className="border-t border-slate-100 mt-1 mb-0.5" />
                <div
                  className="px-3 py-1 text-[10px] font-mono text-slate-400 select-text flex items-center justify-between gap-2"
                  title={`Built ${formatBuildTime()} from commit ${APP_COMMIT}`}
                >
                  <span>v{APP_VERSION}</span>
                  <span>{APP_COMMIT}</span>
                </div>
              </PortalDropdown>
            </div>
          </div>
        </div>

        {/* Simplified, Unified Ingestion Command Bar */}
        <form onSubmit={handleSubmit} className="space-y-1.5">
          <div className="flex flex-col sm:flex-row items-stretch gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-2xs focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            {/* Input with embedded "Paste Text" button */}
            <div className="relative flex-1 flex items-center">
              <Link2 className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="job-url-input"
                type="url"
                required
                placeholder="Paste job posting URL (Greenhouse, Lever, LinkedIn, Ashby...)..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                disabled={isIngesting}
                className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm bg-transparent border-0 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setIsManualModalOpen(true)}
                title="Paste job description text directly"
                className="absolute right-2 p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4" />
              </button>
            </div>

            {/* Status Selector with Restored Icons + Track Button */}
            <div className="flex items-center gap-2 shrink-0">
              <div>
                <button
                  ref={statusBtnRef}
                  type="button"
                  disabled={isIngesting}
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer select-none"
                >
                  <ActiveStatusIcon className={`w-3.5 h-3.5 ${activeStatusOption.color}`} />
                  <span>{activeStatusOption.label}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Portal-rendered Status Dropdown */}
                <PortalDropdown
                  isOpen={isStatusDropdownOpen}
                  onClose={() => setIsStatusDropdownOpen(false)}
                  triggerRef={statusBtnRef}
                  align="right"
                  className="w-44 py-1"
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                    Initial Status
                  </div>
                  {STATUS_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = targetStatus === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setTargetStatus(opt.value);
                          setIsStatusDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${opt.color}`} />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </PortalDropdown>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isIngesting}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-xs transition-all disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {isIngesting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                    <span>Track job</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Ingestion Loading Indicator */}
          {isIngesting && (
            <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2 text-xs text-indigo-900 animate-in fade-in duration-150">
              <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin shrink-0" />
              <span className="truncate">Reading the posting. Slow career sites can take a minute or more.</span>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-800 animate-in fade-in duration-150">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                aria-label="Dismiss error"
                className="text-rose-500 hover:text-rose-700 p-0.5 rounded hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Modals portaled to document.body to avoid header transform bounds */}
      {createPortal(
        <>
          <ManualJobModal
            isOpen={isManualModalOpen}
            onClose={() => setIsManualModalOpen(false)}
            onSubmit={handleManualSubmit}
            isIngesting={isIngesting}
          />

          <BookmarkletModal isOpen={isBookmarkletOpen} onClose={() => setIsBookmarkletOpen(false)} />
        </>,
        document.body
      )}

      {/* How Extraction Works Modal rendered via Portal to document.body to avoid header bounds */}
      {isInfoOpen &&
        createPortal(
          <div className="fixed inset-0 z-40 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4 jat-scrim backdrop-blur-xs animate-in fade-in duration-150">
            <div className="fixed inset-0" onClick={() => setIsInfoOpen(false)} aria-hidden="true" />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={infoHeadingId}
              className="relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 z-10 space-y-4 max-h-[90dvh] sm:max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 id={infoHeadingId} className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-indigo-600" />
                  How job extraction works
                </h3>
                <button
                  type="button"
                  onClick={() => setIsInfoOpen(false)}
                  aria-label="Close extraction guide"
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                  <strong className="text-indigo-900 text-sm block mb-1">1. ATS APIs</strong>
                  <p>
                    Links from Greenhouse, Lever, Workable, Ashby, Workday, SmartRecruiters, Recruitee, Pinpoint and BambooHR are read from the platform's own job API. Tracking parameters and redirect wrappers are removed from the link first.
                  </p>
                </div>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                  <strong className="text-emerald-900 text-sm block mb-1">2. The posting page</strong>
                  <p>
                    Other career pages are fetched and read for a Schema.org <code>JobPosting</code>, embedded page data, or the visible text. When the API or page already gives a clean title, company, location and description, the job is saved without using Gemini.
                  </p>
                </div>
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100">
                  <strong className="text-purple-900 text-sm block mb-1">3. Gemini</strong>
                  <p>
                    Otherwise Gemini reads the page text, or opens the page itself, and fills in the fields. These steps count toward your daily AI limit.
                  </p>
                </div>
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100">
                  <strong className="text-amber-900 text-sm block mb-1">4. Needs review</strong>
                  <p>
                    If nothing could read the posting (LinkedIn, Glassdoor and other sites that block automated reading), the job is saved with what the link shows and marked <strong>Needs review</strong>. Fields it could not read say Unknown. Open the posting and click the one-click capture bookmark to fill it in.
                  </p>
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsInfoOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};
