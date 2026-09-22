import { useState, useEffect } from 'react';
import {
  Link2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  AlertCircle,
  Database,
  Cpu,
  CheckCircle2,
  Sliders,
  Play,
  Bookmark,
  Send,
  Calendar,
  Award,
  XCircle,
  Ban,
  Info
} from 'lucide-react';
import { JobStatus } from '../types';
import type { ThemeAccent, ThemeMode } from '../lib/theme';
import { ThemeSelector } from './ThemeSelector';

interface HeaderActionPanelProps {
  totalJobs: number;
  onOpenAtsDebugger: () => void;
  onIngest: (params: { url?: string; manualText?: string; status?: JobStatus; notes?: string }) => Promise<void>;
  isIngesting: boolean;
  themeMode: ThemeMode;
  themeAccent: ThemeAccent;
  onThemeModeChange: (mode: ThemeMode) => void;
  onThemeAccentChange: (accent: ThemeAccent) => void;
}

const STATUS_OPTIONS: { value: JobStatus; label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }[] = [
  { value: 'Accepted', label: 'Accepted', icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200' },
  { value: 'Offer', label: 'Offer', icon: Award, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { value: 'Interviewing', label: 'Interviewing', icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  { value: 'Applied', label: 'Applied', icon: Send, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { value: 'Saved', label: 'Saved', icon: Bookmark, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
  { value: 'Rejected', label: 'Rejected', icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
  { value: 'Declined', label: 'Declined', icon: Ban, color: 'text-stone-600', bg: 'bg-stone-50', border: 'border-stone-200' },
];

const SAMPLE_URLS = [
  {
    label: 'Greenhouse: Figma Frontend',
    url: 'https://boards.greenhouse.io/figma/jobs/5912401',
  },
  {
    label: 'Lever: Datadog Cloud',
    url: 'https://jobs.lever.co/datadog/883b1092-c419-4cb5-bf9e-e38029d20c54',
  },
  {
    label: 'Greenhouse: Anthropic AI',
    url: 'https://job-boards.greenhouse.io/anthropic/jobs/4329182',
  },
  {
    label: 'Direct Career: Stripe Staff Engineer',
    url: 'https://stripe.com/jobs/listing/staff-full-stack-engineer/6091234',
  },
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
}: HeaderActionPanelProps) => {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [showManualDrawer, setShowManualDrawer] = useState(false);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);
  const [manualText, setManualText] = useState('');
  const [targetStatus, setTargetStatus] = useState<JobStatus>('Applied');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!url.trim() && !manualText.trim()) {
      setErrorMsg('Please paste a valid job URL or enter job description text in the fallback drawer.');
      return;
    }

    try {
      await onIngest({
        url: url.trim() || undefined,
        manualText: manualText.trim() || undefined,
        status: targetStatus,
        notes: notes.trim() || undefined,
      });

      // Clear on success
      setUrl('');
      setManualText('');
      setNotes('');
      setShowManualDrawer(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to extract job posting. Check server logs.');
    }
  };

  const handleSampleClick = (sampleUrl: string) => {
    setUrl(sampleUrl);
    setErrorMsg(null);
  };

  return (
    <div className={`sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200/50 shadow-xs transition-all duration-300 ${isScrolled ? 'py-2.5' : 'py-5'}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-3.5">
        {/* Title, Badge and Info Hover Block */}
        <div className="flex items-center justify-between gap-4 select-none">
          <div className="flex items-center gap-2 min-w-0 relative">
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 truncate">
              Job Application Easy Tracker
            </h1>
            <div className="shrink-0">
              <button 
                type="button" 
                onClick={() => setIsInfoOpen(!isInfoOpen)}
                aria-label="More information about Job Application Easy Tracker"
                className="text-slate-400 hover:text-indigo-600 transition-colors p-1 cursor-pointer flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
            {isInfoOpen && (
              <>
                <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsInfoOpen(false)} />
                <div className="absolute left-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-72 max-w-xs p-3 bg-zinc-900 text-zinc-100 text-[11px] rounded-lg shadow-xl z-50 leading-relaxed font-normal border border-zinc-800 animate-in fade-in duration-150">
                  Drop a raw URL pointing to any job description below. I will fetch, parse, and extract
                  structured metadata (Company, Role, Location, Compensation, Industry, Summary) and append it to
                  your persistent spreadsheet.
                </div>
              </>
            )}
          </div>
          <ThemeSelector
            mode={themeMode}
            accent={themeAccent}
            onModeChange={onThemeModeChange}
            onAccentChange={onThemeAccentChange}
          />
        </div>

        {/* URL Posting Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Link2 className="w-5 h-5" />
                </div>
                <input
                  id="job-url-input"
                  type="url"
                  placeholder="Paste any job posting URL (e.g. Greenhouse, Lever, Workday, Ashby, career pages)..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isIngesting}
                  className="w-full pl-11 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div className="flex flex-row items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <button
                    type="button"
                    disabled={isIngesting}
                    onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                    className={`w-full inline-flex items-center justify-between sm:justify-start gap-2 px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer select-none transition-all ${isIngesting ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    {(() => {
                      const activeOpt = STATUS_OPTIONS.find(opt => opt.value === targetStatus) || STATUS_OPTIONS[1];
                      const ActiveIcon = activeOpt.icon;
                      return (
                        <span className="flex items-center gap-1.5">
                          <ActiveIcon className={`w-4 h-4 ${activeOpt.color}`} />
                          <span className="text-xs">Status: {activeOpt.label}</span>
                        </span>
                      );
                    })()}
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>

                  {isStatusDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsStatusDropdownOpen(false)} 
                      />
                      <div className="absolute right-0 sm:left-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                        <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase select-none">
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
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors cursor-pointer ${
                                isSelected 
                                  ? 'bg-slate-50 text-indigo-700 font-semibold' 
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className={`p-1 rounded-md ${opt.bg} ${opt.border}`}>
                                <Icon className={`w-3.5 h-3.5 ${opt.color}`} />
                              </div>
                              <span>{opt.label}</span>
                              {isSelected && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isIngesting}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {isIngesting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Extracting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-indigo-200" />
                      <span>Track This</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {url.includes('darwinbox.com') && (
              <div className="mt-2.5 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Darwinbox Angular SPA Detected:</span> Transcarent and Darwinbox render job content purely inside the browser via client-side JavaScript (<code className="bg-amber-100 px-1 rounded">&lt;app-root&gt;</code>) protected by Cloudflare bot defenses. For 100% exact title, salary, and requirements, paste the job text into the fallback drawer below.
                </div>
              </div>
            )}
          </div>

          {/* Hidden-by-default Sandbox, Test URLs, ATS Debugger, and Status Panel */}
          {!isScrolled && showDeveloperTools && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3.5 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/60 pb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <span>Sandbox Testing & System Diagnostics</span>
                </div>

                {/* System Status Indicators with Multi-Tier Active Tag */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Multi-Tier Active</span>
                  </div>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-slate-500" />
                    <span className="font-medium text-slate-700">{totalJobs}</span>
                    <span>Tracked</span>
                  </div>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>JSON Persistence</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* Quick Sample Links */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-600 mr-0.5">Quick Test URLs:</span>
                  {SAMPLE_URLS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSampleClick(sample.url)}
                      disabled={isIngesting}
                      className="px-2 py-0.5 rounded text-[11px] bg-white hover:bg-slate-100 text-slate-700 font-medium transition-colors cursor-pointer border border-slate-200 shadow-xs"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>

                {/* ATS Debugger Button */}
                <button
                  type="button"
                  onClick={onOpenAtsDebugger}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 rounded border border-indigo-200 transition-colors cursor-pointer shadow-xs"
                >
                  <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Launch ATS Debugger & Test Suite</span>
                </button>
              </div>
            </div>
          )}

          {/* Manual Text Fallback Drawer */}
          {!isScrolled && showManualDrawer && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Description Text (Fallback for login-walled listings)
                </label>
                <textarea
                  rows={4}
                  placeholder="Paste the full job posting text, qualifications, and role details here..."
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  disabled={isIngesting}
                  className="w-full p-3 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Optional Initial Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Referred by Sarah, reached out via LinkedIn message"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isIngesting}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Live Extraction Progress Indicator */}
          {isIngesting && (
            <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-lg flex items-center gap-3 text-xs text-indigo-900 animate-pulse">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold">Autonomous Ingestion Pipeline Running</p>
                <p className="text-indigo-700">
                  Evaluating Tier 1 ATS REST API &rarr; Tier 2 Cheerio JSON-LD &rarr; Tier 3 Gemini Model Extraction &rarr; Tier 4 Search Grounding fallback...
                </p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Fallbacks & Utilities Sticky Bottom Toggler strip */}
          {!isScrolled && (
            <div className="border-t border-slate-100/60 pt-3 flex flex-wrap items-center justify-between gap-3 select-none">
              {/* Left Aligned Fallback Drawer Button */}
              <button
                type="button"
                onClick={() => setShowManualDrawer(!showManualDrawer)}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  showManualDrawer ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Need manual fallback? Paste job text or notes</span>
                <span className="inline sm:hidden">Manual text fallback</span>
                {showManualDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {/* Right Aligned Developer Utilities Button */}
              <button
                type="button"
                onClick={() => setShowDeveloperTools(!showDeveloperTools)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  showDeveloperTools
                    ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    : 'text-slate-600 bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden sm:inline">Dev & Test Utilities</span>
                <span className="inline sm:hidden">Dev Tools</span>
                {showDeveloperTools ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
