import { useId } from 'react';
import { X, Cpu, Database, CheckCircle2, ArrowRight, ExternalLink } from 'lucide-react';

interface DevSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalJobs: number;
  onSelectSampleUrl: (url: string) => void;
  onOpenAtsDebugger: () => void;
  isIngesting: boolean;
}

const SAMPLE_URLS = [
  {
    label: 'Greenhouse: Figma Frontend',
    company: 'Figma',
    ats: 'Greenhouse API',
    url: 'https://boards.greenhouse.io/figma/jobs/5912401',
  },
  {
    label: 'Lever: Datadog Cloud',
    company: 'Datadog',
    ats: 'Lever API',
    url: 'https://jobs.lever.co/datadog/883b1092-c419-4cb5-bf9e-e38029d20c54',
  },
  {
    label: 'Greenhouse: Anthropic AI',
    company: 'Anthropic',
    ats: 'Greenhouse Board',
    url: 'https://job-boards.greenhouse.io/anthropic/jobs/4329182',
  },
  {
    label: 'Direct Career: Stripe Staff Engineer',
    company: 'Stripe',
    ats: 'Heuristic + Gemini Fallback',
    url: 'https://stripe.com/jobs/listing/staff-full-stack-engineer/6091234',
  },
];

export const DevSandboxModal = ({
  isOpen,
  onClose,
  totalJobs,
  onSelectSampleUrl,
  onOpenAtsDebugger,
  isIngesting,
}: DevSandboxModalProps) => {
  const headingId = useId();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4 jat-scrim backdrop-blur-xs animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-full max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90dvh] pb-[env(safe-area-inset-bottom)]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 id={headingId} className="text-sm font-bold text-slate-900">Sandbox & ATS Diagnostics</h3>
              <p className="text-xs text-slate-500">Pipeline verification, test URLs, and extraction engine inspect</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sandbox dialog"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Status Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Pipeline Active
              </div>
              <span className="text-[11px] text-emerald-900/80">4-Tier Fallback Online</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-slate-700 text-xs font-semibold">
                <Database className="w-3.5 h-3.5 text-slate-500" />
                <span>{totalJobs} Jobs</span>
              </div>
              <span className="text-[11px] text-slate-500">Local & Cloud Persistence</span>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-indigo-700 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                Gemini Client
              </div>
              <span className="text-[11px] text-indigo-900/80">Structured Parser Ready</span>
            </div>
          </div>

          {/* Sample URLs */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
              Quick Test URLs (Click to Load)
            </h4>
            <div className="space-y-2">
              {SAMPLE_URLS.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{item.company}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        {item.ats}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.url}</p>
                  </div>
                  <button
                    type="button"
                    disabled={isIngesting}
                    onClick={() => {
                      onSelectSampleUrl(item.url);
                      onClose();
                    }}
                    className="shrink-0 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span>Use</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Launch ATS Debugger */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Need full regex and response schema diagnostics?</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAtsDebugger();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open ATS diagnostic tool</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
