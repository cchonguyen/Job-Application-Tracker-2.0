import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  BarChart3,
  TrendingUp,
  Clock,
  Compass,
  AlertCircle,
  Building2,
  DollarSign,
  Briefcase,
  Layers,
  Sparkles,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Filter,
  Check,
} from 'lucide-react';
import { JobRecord } from '../types';
import {
  calculatePipelineFunnel,
  calculateCallbackMetrics,
  calculateAgingBuckets,
  calculateWeeklyMomentum,
  calculateSkillsIntelligence,
  calculateWorkModeDistribution,
  calculateSalaryAnalytics,
} from '../lib/analyticsHelpers';

interface AnalyticsBarProps {
  jobs: JobRecord[];
  onSelectJob?: (job: JobRecord) => void;
}

type AnalyticsTab = 'momentum' | 'market';

export const AnalyticsBar = ({ jobs, onSelectJob }: AnalyticsBarProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('momentum');

  // Compute all analytics metrics
  const funnel = useMemo(() => calculatePipelineFunnel(jobs), [jobs]);
  const callback = useMemo(() => calculateCallbackMetrics(jobs), [jobs]);
  const aging = useMemo(() => calculateAgingBuckets(jobs), [jobs]);
  const momentum = useMemo(() => calculateWeeklyMomentum(jobs, 6), [jobs]);
  const skills = useMemo(() => calculateSkillsIntelligence(jobs, 8), [jobs]);
  const workModes = useMemo(() => calculateWorkModeDistribution(jobs), [jobs]);
  const salary = useMemo(() => calculateSalaryAnalytics(jobs), [jobs]);

  const total = jobs.length;

  return (
    <div className="analytics-panel bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs transition-all">
      {/* Header bar */}
      <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Job Search Momentum & Pipeline Intelligence
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wide">
                {total} {total === 1 ? 'Role' : 'Roles'} Tracked
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 hidden sm:block">
              Actionable insights on response velocity, follow-up aging, weekly pace, and market requirements.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {total > 0 && isExpanded && (
            <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80 border border-slate-300/70 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('momentum')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'momentum'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Search Momentum
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('market')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'market'
                    ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Market & Skills
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-700 transition-colors cursor-pointer select-none px-2 py-1 rounded-md hover:bg-slate-100"
            title={isExpanded ? 'Collapse analytics' : 'Expand analytics'}
          >
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-5 space-y-5">
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-500">
                <Compass className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">Your job search dashboard is ready</p>
              <p className="text-xs text-slate-500 max-w-md">
                Ingest a job posting URL or save prospective roles above. Real-time feedback on your interview callback rate, weekly application momentum, and follow-up timing will display here.
              </p>
            </div>
          ) : (
            <>
              {/* Top 4 Essential KPIs for Active Job Seekers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Interview Callback Rate */}
                <div className="analytics-card p-4 rounded-xl border border-indigo-200 bg-white flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        Interview Callback Rate
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          callback.benchmarkEvaluation === 'high'
                            ? 'bg-emerald-100 text-emerald-800'
                            : callback.benchmarkEvaluation === 'solid'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {callback.benchmarkEvaluation === 'high'
                          ? 'Above avg'
                          : callback.benchmarkEvaluation === 'solid'
                          ? 'Healthy rate'
                          : 'Target: 8–15%'}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {callback.callbackRate}%
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        ({callback.positiveResponses} of {callback.totalSubmitted} submitted)
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
                    <span>{callback.benchmarkLabel}</span>
                    <span className="text-indigo-600 font-semibold">
                      {callback.inScreeningOrInterview} in flight
                    </span>
                  </div>
                </div>

                {/* 2. Response Velocity / Heard Back */}
                <div className="analytics-card p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                        Employer Response Rate
                      </span>
                      <span className="text-[10px] font-medium text-slate-500">
                        {callback.totalSubmitted - callback.awaitingResponse} / {callback.totalSubmitted} decided
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {callback.responseRate}%
                      </span>
                      <span className="text-xs font-medium text-slate-500">heard back</span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                      <div
                        style={{
                          width: `${
                            callback.totalSubmitted > 0
                              ? (callback.positiveResponses / callback.totalSubmitted) * 100
                              : 0
                          }%`,
                        }}
                        className="bg-indigo-500 h-full"
                        title="Interviews"
                      />
                      <div
                        style={{
                          width: `${
                            callback.totalSubmitted > 0
                              ? (callback.rejectedCount / callback.totalSubmitted) * 100
                              : 0
                          }%`,
                        }}
                        className="bg-rose-400 h-full"
                        title="Rejections"
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-600 mt-1.5">
                      <span>{callback.awaitingResponse} still awaiting reply</span>
                      <span className="text-slate-500">{callback.rejectedCount} rejections</span>
                    </div>
                  </div>
                </div>

                {/* 3. Follow-up & Response Aging */}
                <div className="analytics-card p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        Response Aging
                      </span>
                      {aging.staleCount > 0 ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                          {aging.staleCount} to follow up
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          Current
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {aging.averageDaysWaiting}
                      </span>
                      <span className="text-xs font-medium text-slate-500">days avg wait</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">
                      {aging.reviewCount} in review (7-14d)
                    </span>
                    <span className="text-amber-700 font-semibold">
                      {aging.staleCount} stale (&gt;14d)
                    </span>
                  </div>
                </div>

                {/* 4. Weekly Application Momentum */}
                <div className="analytics-card p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        Weekly Momentum
                      </span>
                      <span className="text-[10px] font-medium text-slate-500">
                        {momentum.weeklyAverage} avg / wk
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {momentum.thisWeekCount}
                      </span>
                      <span className="text-xs font-medium text-slate-500">submitted this week</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                    <span>
                      {funnel.saved} saved leads waiting
                    </span>
                    <span className="text-indigo-600 font-semibold">
                      {funnel.totalSubmitted} total applied
                    </span>
                  </div>
                </div>
              </div>

              {/* Tab Content 1: Search Momentum & Funnel */}
              {activeTab === 'momentum' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Pipeline Funnel Progression (7 columns) */}
                  <div className="analytics-card lg:col-span-7 p-4.5 bg-white rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-indigo-600" />
                          Active Funnel & Pipeline Flow
                        </h3>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {funnel.savedToAppliedRate}% of leads applied
                        </span>
                      </div>

                      {/* Funnel visual steps */}
                      <div className="space-y-3">
                        {/* Step 1: Saved Leads */}
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-slate-700 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-slate-400" />
                              1. Saved Leads (Unapplied)
                            </span>
                            <span className="text-slate-900 font-bold">{funnel.saved} roles</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                              style={{ width: `${(funnel.saved / (total || 1)) * 100}%` }}
                              className="bg-slate-400 h-full rounded-full transition-all duration-300"
                            />
                          </div>
                        </div>

                        {/* Step 2: Applied / Awaiting Review */}
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-indigo-700 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-indigo-500" />
                              2. Applied (Awaiting Response)
                            </span>
                            <span className="text-slate-900 font-bold">{funnel.applied} in review</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                              style={{ width: `${(funnel.applied / (total || 1)) * 100}%` }}
                              className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                            />
                          </div>
                        </div>

                        {/* Step 3: Interviewing / Screenings */}
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-amber-700 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              3. Screenings & Interviews
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                {funnel.appliedToInterviewRate}% conversion
                              </span>
                              <span className="text-slate-900 font-bold">{funnel.interviewing} active</span>
                            </div>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                              style={{ width: `${(funnel.interviewing / (total || 1)) * 100}%` }}
                              className="bg-amber-500 h-full rounded-full transition-all duration-300"
                            />
                          </div>
                        </div>

                        {/* Step 4: Decisions / Next Stage */}
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-emerald-700 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              4. Offers & Advanced Rounds
                            </span>
                            <span className="text-slate-900 font-bold">{funnel.offer + funnel.accepted} roles</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                              style={{ width: `${((funnel.offer + funnel.accepted) / (total || 1)) * 100}%` }}
                              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Funnel Takeaway Insight */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Drop-off: {funnel.rejected} passed / archived
                      </span>
                      <span className="text-indigo-600 font-semibold">
                        {callback.inScreeningOrInterview > 0
                          ? `${callback.inScreeningOrInterview} active conversations in flight`
                          : 'Focus on submitting high-resonance applications'}
                      </span>
                    </div>
                  </div>

                  {/* Weekly Momentum Chart (5 columns) */}
                  <div className="analytics-card lg:col-span-5 p-4.5 bg-white rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4 text-indigo-600" />
                          Weekly Application Cadence
                        </h3>
                        <span className="text-[11px] font-semibold text-slate-500">
                          Last 6 weeks
                        </span>
                      </div>

                      {/* Bar chart */}
                      <div className="pt-2 pb-1 flex items-end justify-between gap-2 h-32 border-b border-slate-200 px-1">
                        {momentum.weeks.map((week, idx) => {
                          const heightPct = Math.round(
                            (week.count / (momentum.maxWeeklyCount || 1)) * 88
                          );
                          return (
                            <div
                              key={week.weekStart}
                              className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 group relative"
                            >
                              {/* Hover tooltip */}
                              <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                                {week.label}: {week.count} applications
                              </div>

                              <span className="text-[10px] font-bold text-slate-600 group-hover:text-indigo-600">
                                {week.count}
                              </span>
                              <div
                                style={{ height: `${Math.max(6, heightPct)}%` }}
                                className={`w-full max-w-[28px] rounded-t-md transition-all ${
                                  week.isCurrentWeek
                                    ? 'bg-indigo-600 ring-2 ring-indigo-200'
                                    : week.count > 0
                                    ? 'bg-indigo-300 group-hover:bg-indigo-400'
                                    : 'bg-slate-200'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* X-axis labels */}
                      <div className="flex justify-between gap-2 px-1 pt-1.5 text-[9px] font-medium text-slate-500">
                        {momentum.weeks.map((week, idx) => (
                          <div key={week.weekStart} className="flex-1 text-center truncate">
                            {week.isCurrentWeek ? (
                              <span className="font-bold text-indigo-700">Now</span>
                            ) : (
                              week.label.split('–')[0].trim()
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 pt-2 text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Goal: 3–5 tailored apps / week</span>
                      <span className="font-semibold text-slate-700">
                        {momentum.thisWeekCount >= 3 ? 'Target reached' : 'Pacing steady'}
                      </span>
                    </div>
                  </div>

                  {/* Follow-up & Stale Application Radar (Full 12 columns) */}
                  <div className="analytics-card lg:col-span-12 p-4.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-amber-500" />
                          Follow-up & Response Radar ({aging.totalAwaiting} Roles Awaiting Reply)
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Track which applications are within standard recruiter review windows vs. ready for a LinkedIn check-in.
                        </p>
                      </div>

                      {/* Aging status breakdown pills */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                          Fresh (&lt;7d): {aging.freshCount}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold">
                          Review (7–14d): {aging.reviewCount}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                          Stale (&gt;14d): {aging.staleCount}
                        </span>
                      </div>
                    </div>

                    {aging.staleJobs.length === 0 ? (
                      <div className="py-4 px-3 rounded-lg bg-emerald-50/70 border border-emerald-200/80 text-center flex items-center justify-center gap-2 text-xs font-medium text-emerald-800">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>All active applications have been submitted within normal review windows (under 14 days). No immediate follow-ups overdue.</span>
                      </div>
                    ) : (
                      <div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                          <span>Roles awaiting response for over 14 days ({aging.staleJobs.length})</span>
                          <span className="text-slate-400 font-normal">Click any row to open & log notes</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {aging.staleJobs.slice(0, 6).map((job) => {
                            const originalJob = jobs.find((j) => j.id === job.id);
                            return (
                              <button
                                key={job.id}
                                type="button"
                                onClick={() => originalJob && onSelectJob?.(originalJob)}
                                className="text-left p-3 rounded-lg border border-amber-200/90 bg-amber-50/50 hover:bg-amber-100/60 hover:border-amber-300 transition-colors cursor-pointer group flex flex-col justify-between"
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 truncate">
                                      {job.company}
                                    </div>
                                    <div className="text-[11px] text-slate-600 truncate mt-0.5">
                                      {job.jobTitle}
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 border border-amber-300">
                                    {job.daysWaiting}d ago
                                  </span>
                                </div>
                                <div className="mt-2.5 pt-1.5 border-t border-amber-200/60 flex items-center justify-between text-[10px] text-amber-800">
                                  <span className="truncate">{job.location || 'Location unlisted'}</span>
                                  <span className="font-semibold text-indigo-700 flex items-center gap-0.5 shrink-0 group-hover:translate-x-0.5 transition-transform">
                                    Follow up <ArrowRight className="w-2.5 h-2.5" />
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {aging.staleJobs.length > 6 && (
                          <p className="text-[11px] text-slate-500 mt-2 text-right">
                            +{aging.staleJobs.length - 6} more roles awaiting review over 14 days
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab Content 2: Market & Skills Intelligence */}
              {activeTab === 'market' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Card A: In-Demand Skills */}
                  <div className="analytics-card p-4.5 bg-white rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          Top In-Demand Skills
                        </h3>
                        <span className="text-[10px] font-semibold text-slate-500">
                          From tracked specs
                        </span>
                      </div>

                      {skills.length === 0 ? (
                        <p className="text-xs text-slate-500 py-6 text-center">
                          No required skills parsed yet from your job postings.
                        </p>
                      ) : (
                        <div className="space-y-2 pt-1">
                          {skills.map((item) => (
                            <div key={item.skill} className="space-y-0.5">
                              <div className="flex justify-between text-xs">
                                <span className="font-semibold text-slate-800 truncate">
                                  {item.skill}
                                </span>
                                <span className="text-slate-500 text-[11px] font-medium shrink-0 ml-2">
                                  {item.count} {item.count === 1 ? 'role' : 'roles'} ({item.percentage}%)
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                <div
                                  style={{ width: `${item.percentage}%` }}
                                  className="bg-indigo-500 h-full rounded-full"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500">
                      Highlight these core skills in your resume summaries and portfolio.
                    </div>
                  </div>

                  {/* Card B: Work Mode & Location Profile */}
                  <div className="analytics-card p-4.5 bg-white rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Briefcase className="w-4 h-4 text-indigo-600" />
                          Work Arrangement Mix
                        </h3>
                        <span className="text-[10px] font-semibold text-slate-500">
                          Target locations
                        </span>
                      </div>

                      <div className="space-y-3 pt-1">
                        {workModes.map((item) => (
                          <div key={item.mode} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold text-slate-800">{item.mode}</span>
                              <span className="text-slate-600 font-bold">
                                {item.count} ({item.percentage}%)
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                              <div
                                style={{ width: `${item.percentage}%` }}
                                className={`h-full rounded-full ${
                                  item.mode === 'Remote'
                                    ? 'bg-emerald-500'
                                    : item.mode === 'Hybrid'
                                    ? 'bg-indigo-500'
                                    : 'bg-amber-500'
                                }`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500">
                      Remote vs Hybrid flexibility helps optimize commute and relocation parameters.
                    </div>
                  </div>

                  {/* Card C: Salary Transparency & Compensation */}
                  <div className="analytics-card p-4.5 bg-white rounded-xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4 text-indigo-600" />
                          Compensation & Pay Transparency
                        </h3>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {salary.disclosureRate}% disclosed
                        </span>
                      </div>

                      <div className="p-3.5 rounded-lg bg-indigo-50/60 border border-indigo-100 space-y-2 mt-1">
                        <div className="text-[10px] font-bold text-indigo-800 uppercase tracking-wide">
                          Median Target Salary Range
                        </div>
                        <div className="text-2xl font-black text-slate-900 tracking-tight">
                          {salary.displayRange}
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Based on {salary.disclosedCount} out of {total} postings with transparent compensation disclosed.
                        </p>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>Pay Transparency Compliance</span>
                          <span className="font-semibold text-slate-800">
                            {salary.disclosedCount} disclosed / {total - salary.disclosedCount} unlisted
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div
                            style={{ width: `${salary.disclosureRate}%` }}
                            className="bg-indigo-600 h-full rounded-full"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500">
                      Useful for benchmark negotiation once screening conversations commence.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
