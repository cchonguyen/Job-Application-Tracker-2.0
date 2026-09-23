import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Link2,
  Sparkles,
  ChevronDown,
  Loader2,
  Briefcase,
  FileText,
  Sliders,
  CheckCircle2,
  Bookmark,
  Send,
  Calendar,
  Award,
  XCircle,
  Ban,
  Settings,
  HelpCircle,
  Cpu,
  FileSpreadsheet,
} from 'lucide-react';
import { JobStatus } from '../types';
import type { ThemeAccent, ThemeMode } from '../lib/theme';
import { ThemeSelector } from './ThemeSelector';
import { ManualJobModal } from './ManualJobModal';
import { DevSandboxModal } from './DevSandboxModal';
import { PortalDropdown } from './PortalDropdown';
import type { User } from 'firebase/auth';
import type { ConnectedSheet } from '../hooks/useGoogleSheetsSync';

interface HeaderActionPanelProps {
  totalJobs: number;
  onOpenAtsDebugger: () => void;
  onIngest: (params: { url?: string; manualText?: string; status?: JobStatus; notes?: string }) => Promise<void>;
  isIngesting: boolean;
  themeMode: ThemeMode;
  themeAccent: ThemeAccent;
  onThemeModeChange: (mode: ThemeMode) => void;
  onThemeAccentChange: (accent: ThemeAccent) => void;
  googleSheetsProps?: {
    user: User | null;
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

const STATUS_OPTIONS: { value: JobStatus; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { value: 'Applied', label: 'Applied', icon: Send, color: 'text-amber-500' },
  { value: 'Saved', label: 'Saved', icon: Bookmark, color: 'text-slate-500' },
  { value: 'Interviewing', label: 'Interviewing', icon: Calendar, color: 'text-blue-600' },
  { value: 'Offer', label: 'Offer', icon: Award, color: 'text-purple-600' },
  { value: 'Accepted', label: 'Accepted', icon: CheckCircle2, color: 'text-teal-600' },
  { value: 'Rejected', label: 'Rejected', icon: XCircle, color: 'text-rose-600' },
  { value: 'Declined', label: 'Declined', icon: Ban, color: 'text-stone-600' },
];

export const HeaderActionPanel = ({
  totalJobs,
  onOpenAtsDebugger,
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
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

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
      setErrorMsg(err.message || 'Failed to extract job posting. Check server logs.');
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
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
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

                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsMenuOpen(false);
                    setIsDevModalOpen(true);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Sample URLs & Sandbox</span>
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
                  <span>ATS Regex Diagnostic</span>
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
                  <span>How Extraction Works</span>
                </button>
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
                    <span>Track Job</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Ingestion Loading Indicator */}
          {isIngesting && (
            <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2 text-xs text-indigo-900 animate-in fade-in duration-150">
              <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin shrink-0" />
              <span className="truncate">Extracting job details via autonomous parser...</span>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-800 animate-in fade-in duration-150">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-rose-500 hover:text-rose-700 font-bold px-1"
              >
                ×
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Modals rendered cleanly at top level */}
      <ManualJobModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSubmit={handleManualSubmit}
        isIngesting={isIngesting}
      />

      <DevSandboxModal
        isOpen={isDevModalOpen}
        onClose={() => setIsDevModalOpen(false)}
        totalJobs={totalJobs}
        onSelectSampleUrl={(sampleUrl) => setUrl(sampleUrl)}
        onOpenAtsDebugger={onOpenAtsDebugger}
        isIngesting={isIngesting}
      />

      {/* How Extraction Works Modal rendered via Portal to document.body to avoid header bounds */}
      {isInfoOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="fixed inset-0" onClick={() => setIsInfoOpen(false)} />
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 z-10 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-indigo-600" />
                  How Job Extraction Works
                </h3>
                <button
                  type="button"
                  onClick={() => setIsInfoOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 leading-none"
                >
                  ×
                </button>
              </div>
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                  <strong className="text-indigo-900 text-sm block mb-1">Tier 1 — Direct ATS API Integration</strong>
                  <p>
                    For postings from Greenhouse, Lever, and Workable, the system communicates directly with their official REST APIs to retrieve 100% exact structured metadata, department hierarchies, and location details.
                  </p>
                </div>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                  <strong className="text-emerald-900 text-sm block mb-1">Tier 2 — Schema.org JSON-LD Extraction</strong>
                  <p>
                    For LinkedIn, Ashby, Workday, and custom corporate career portals, the engine parses embedded Schema.org <code>JobPosting</code> microdata for validated role definitions.
                  </p>
                </div>
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100">
                  <strong className="text-purple-900 text-sm block mb-1">Tier 3 & 4 — Gemini Model Intelligence</strong>
                  <p>
                    When postings have unstructured HTML or non-standard layouts, Gemini processes the cleaned HTML to deduce normalized compensation ranges, work arrangements (Remote/Hybrid/Onsite), and core qualifications.
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
