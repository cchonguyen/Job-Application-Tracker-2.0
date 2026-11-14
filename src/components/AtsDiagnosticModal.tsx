import { useId, useState } from 'react';
import { X, Cpu, Play, CheckCircle2, XCircle, AlertCircle, Clock, ExternalLink, Loader2, ArrowRight } from 'lucide-react';
import { DiagnosticReport } from '../types';
import { apiFetch } from '../lib/apiClient';

interface AtsDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_TEST_CASES = [
  {
    name: 'Greenhouse ATS API Test',
    url: 'https://boards.greenhouse.io/figma/jobs/5912401',
    description: 'Tests Tier 1 direct REST API fetch via Greenhouse boards-api.greenhouse.io v1',
  },
  {
    name: 'Lever Postings API Test',
    url: 'https://jobs.lever.co/datadog/883b1092-c419-4cb5-bf9e-e38029d20c54',
    description: 'Tests Tier 1 direct Lever v0 Postings REST API fetch',
  },
  {
    name: 'Workday Enterprise CXS API Test',
    url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Software-Engineer_R142385',
    description: 'Tests Tier 1 Workday CXS client endpoint (/wday/cxs) with automatic fallback to Tier 2 SSR JSON-LD',
  },
  {
    name: 'SmartRecruiters Public REST API Test',
    url: 'https://jobs.smartrecruiters.com/Visa/743999962312345-staff-software-engineer',
    description: 'Tests Tier 1 SmartRecruiters public posting REST API v1',
  },
  {
    name: 'Pinpoint ATS Structured JSON Test',
    url: 'https://demo.pinpointhq.com/postings/12345678-abcd-1234-abcd-1234567890ab',
    description: 'Tests Tier 1 Pinpoint ATS endpoint appending .json for structured compensation and job metadata',
  },
  {
    name: 'BambooHR Careers API Test',
    url: 'https://demo.bamboohr.com/careers/123',
    description: 'Tests Tier 1 BambooHR /careers/{id}/detail public JSON endpoint',
  },
  {
    name: 'Direct HTML / Career Page Test',
    url: 'https://stripe.com/jobs/listing/staff-full-stack-engineer/6091234',
    description: 'Tests Tier 2 Cheerio DOM + JSON-LD scraping followed by Tier 3 Gemini extraction',
  },
  {
    name: 'Darwinbox SPA Portal (Acme)',
    url: 'https://acme.darwinbox.com/ms/candidatev2/main/careers/jobDetails/a6a7106352a0d2',
    description: 'Tests detection of Angular SPA (<app-root>) and Cloudflare 403 bot guard diagnostics',
  },
  {
    name: 'LinkedIn WAF Bot-Wall Short-Circuit',
    url: 'https://www.linkedin.com/jobs/view/3829104821',
    description: 'Tests Phase 0 canonicalization, HTTP 999 WAF detection, and immediate short-circuiting to Tier 5 Deterministic Stub',
  },
  {
    name: 'Anti-Bot / JS Shell URL Test',
    url: 'https://careers.google.com/jobs/results/123456789',
    description: 'Tests Tier 4 Gemini URL Context fallback (Gemini reads the page itself, never guesses)',
  },
];

export const AtsDiagnosticModal = ({ isOpen, onClose }: AtsDiagnosticModalProps) => {
  const [testUrl, setTestUrl] = useState(PRESET_TEST_CASES[0].url);
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const headingId = useId();

  if (!isOpen) return null;

  const runDiagnostic = async (urlToRun: string) => {
    setIsRunning(true);
    setReport(null);
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/test-ats-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToRun }),
      });

      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setErrorMsg(data.error || 'Diagnostic testing encountered an error.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Diagnostic execution network failure.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto jat-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="bg-white rounded-t-2xl sm:rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90dvh] pb-[env(safe-area-inset-bottom)]"
      >
        {/* Modal Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 id={headingId} className="text-base font-bold text-slate-900">ATS Debugger & Multi-Tier Test Suite</h3>
              <p className="text-xs text-slate-500">
                Inspect raw parser signatures, HTTP latency, and pipeline escalation tiers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ATS diagnostic dialog"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Preset Test Case Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Select Preset Diagnostic Signature:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESET_TEST_CASES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTestUrl(preset.url);
                    runDiagnostic(preset.url);
                  }}
                  disabled={isRunning}
                  className={`p-3 text-left rounded-xl border transition-all cursor-pointer ${
                    testUrl === preset.url
                      ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs text-slate-900">
                    <span>{preset.name}</span>
                    <Play className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom URL Input */}
          <div className="space-y-2">
            <label htmlFor="diagnostic-custom-url-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Or Test Custom Target URL:
            </label>
            <div className="flex gap-2">
              <input
                id="diagnostic-custom-url-input"
                type="url"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                disabled={isRunning}
                placeholder="https://..."
                className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <button
                type="button"
                onClick={() => runDiagnostic(testUrl)}
                disabled={isRunning || !testUrl.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Run diagnostic</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Report Results */}
          {report && (
            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Diagnostic Trace Log</h4>
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Resolved via: {report.finalTier}
                </span>
              </div>

              {report.detectedAts && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Matched ATS Hook:</span>
                  <code className="text-indigo-700 font-mono bg-indigo-50 px-1.5 py-0.5 rounded">
                    {report.detectedAts}
                  </code>
                </div>
              )}

              {/* Step list */}
              <div className="space-y-2">
                {report.steps?.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-200 bg-white flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {step.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                        {step.status === 'failed' && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                        {step.status === 'skipped' && <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span className="font-bold text-slate-800">{step.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
                          {step.tier}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] pl-6">{step.details}</p>
                    </div>

                    {step.durationMs !== undefined && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono shrink-0">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{step.durationMs}ms</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Extracted Structured JSON Preview */}
              {report.extractedData && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">Normalized Attributes Captured:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Company:</span>
                      <span className="font-semibold text-slate-900">{report.extractedData.company}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Job Title:</span>
                      <span className="font-semibold text-slate-900">{report.extractedData.jobTitle}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Location:</span>
                      <span className="font-medium text-slate-800">{report.extractedData.location}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Compensation:</span>
                      <span className="font-medium text-slate-800">{report.extractedData.salary}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
