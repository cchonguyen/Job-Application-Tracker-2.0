import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  BarChart3,
  DollarSign,
  Award,
  Activity,
  Inbox,
  Building2,
} from 'lucide-react';
import { JobRecord } from '../types';

interface AnalyticsBarProps {
  jobs: JobRecord[];
}

export const AnalyticsBar = ({ jobs }: AnalyticsBarProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const total = jobs.length;
  const applied = jobs.filter((j) => j.status === 'Applied').length;
  const interviewing = jobs.filter((j) => j.status === 'Interviewing').length;
  const offers = jobs.filter((j) => j.status === 'Offer').length;
  const accepted = jobs.filter((j) => j.status === 'Accepted').length;
  const activePipeline = applied + interviewing + offers + accepted;
  const offerRate = activePipeline > 0 ? Math.round(((offers + accepted) / activePipeline) * 100) : 0;
  const disclosedSalaryCount = jobs.filter(
    (j) => j.salary && !j.salary.toLowerCase().includes('not listed')
  ).length;

  const industryCounts: Record<string, number> = {};
  jobs.forEach((j) => {
    if (j.industry) {
      industryCounts[j.industry] = (industryCounts[j.industry] || 0) + 1;
    }
  });

  return (
    <div className="analytics-panel bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs transition-all">
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-indigo-600 shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 truncate">
            Pipeline Analytics & Conversion Metrics
          </h2>
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wide shrink-0">
            {total} Positions
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-700 transition-colors cursor-pointer select-none shrink-0"
        >
          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="p-5 space-y-4">
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <Inbox className="w-8 h-8 text-indigo-400" />
              <p className="text-sm font-semibold text-slate-700">No pipeline data yet</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Ingest a job URL above to start tracking applications and conversion metrics.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Hero card — solid surfaces for dark-mode contrast */}
                <div className="analytics-card analytics-card-accent col-span-1 sm:col-span-2 p-4.5 rounded-xl border border-indigo-200 bg-white flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5 select-none">
                      <Activity className="w-3.5 h-3.5" />
                      <span>Current Active Pipeline</span>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 mt-2 tracking-tight flex items-baseline gap-2">
                      {activePipeline}
                      <span className="text-xs font-medium text-indigo-700">
                        active roles out of {total} total
                      </span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between select-none">
                      <span>Pipeline Mix Ratio</span>
                      <span className="text-indigo-700 font-bold">{offerRate}% active conversion</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex select-none border border-slate-300/60">
                      <div
                        style={{ width: `${(applied / (activePipeline || 1)) * 100}%` }}
                        className="bg-indigo-500 h-full"
                        title={`Applied: ${applied}`}
                      />
                      <div
                        style={{ width: `${(interviewing / (activePipeline || 1)) * 100}%` }}
                        className="bg-amber-500 h-full"
                        title={`Interviewing: ${interviewing}`}
                      />
                      <div
                        style={{ width: `${((offers + accepted) / (activePipeline || 1)) * 100}%` }}
                        className="bg-emerald-500 h-full"
                        title={`Offers & Accepted: ${offers + accepted}`}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2.5 text-[10px] text-slate-600 font-semibold select-none">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> {applied} Applied
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {interviewing} Interviews
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {offers + accepted} Offers
                      </span>
                    </div>
                  </div>
                </div>

                <div className="analytics-card p-4.5 bg-white rounded-xl border border-emerald-300 flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5 select-none">
                      <Award className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Offer Conversion</span>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 mt-2 tracking-tight">
                      {offers}{' '}
                      <span className="text-sm font-semibold text-emerald-700">({accepted} accepted)</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-2.5 font-semibold">
                    {offerRate}% conversion from active pool
                  </div>
                </div>

                <div className="analytics-card p-4.5 bg-white rounded-xl border border-indigo-200 flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5 select-none">
                      <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Salary Disclosed</span>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 mt-2 tracking-tight">
                      {disclosedSalaryCount}
                    </div>
                  </div>
                  <div className="text-[11px] text-indigo-700 mt-2.5 font-semibold">
                    Transparent salary ranges listed
                  </div>
                </div>
              </div>

              {Object.keys(industryCounts).length > 0 && (
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600 select-none inline-flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                    Industry Footprint:
                  </span>
                  {Object.entries(industryCounts).map(([industry, count]) => (
                    <span
                      key={industry}
                      className="px-2.5 py-0.5 bg-indigo-50 text-indigo-800 rounded-md font-medium border border-indigo-200"
                    >
                      {industry} <span className="text-indigo-500">({count})</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
