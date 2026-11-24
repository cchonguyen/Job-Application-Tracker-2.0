import { useState, useEffect, useId } from 'react';
import { X, Save, Pencil, MapPin, Cloud, Building2 } from 'lucide-react';
import { JobRecord, JobStatus } from '../types';
import { todayIsoDate } from '../lib/jobDates';
import { STATUS_ORDER, getStatusMeta } from '../lib/statusMeta';
import { parseSalaryRange, formatSalaryDisplay } from '../lib/salary';
import {
  WorkArrangementType,
  parseLocationParts,
  formatNormalizedLocation,
  companyFactsForDisplay,
} from '../lib/formatHelpers';
import { Modal } from './Modal';

interface EditJobModalProps {
  job: JobRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<JobRecord>) => Promise<void>;
}

export const EditJobModal = ({ job, isOpen, onClose, onSave }: EditJobModalProps) => {
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [team, setTeam] = useState('');
  const [workArrangement, setWorkArrangement] = useState<WorkArrangementType>('Remote');
  const [specificLocation, setSpecificLocation] = useState('');
  const [salaryMin, setSalaryMin] = useState<string>('');
  const [salaryMax, setSalaryMax] = useState<string>('');
  const [status, setStatus] = useState<JobStatus>('Applied');
  const [dateApplied, setDateApplied] = useState<string | null>(null);
  const [dateAdded, setDateAdded] = useState<string>('');
  const [industry, setIndustry] = useState('');
  const [summary, setSummary] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [headquarters, setHeadquarters] = useState('');
  const [ownership, setOwnership] = useState('Unknown');
  const [foundingYear, setFoundingYear] = useState<string | number>('');
  const [seniority, setSeniority] = useState('Mid-level');
  const [department, setDepartment] = useState('Engineering');
  const [employmentType, setEmploymentType] = useState('Full-time');
  const [skillsStr, setSkillsStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const headingId = useId();

  useEffect(() => {
    if (job) {
      setCompany(job.company);
      setJobTitle(job.jobTitle);
      setTeam(job.team || '');
      
      const { arrangement, specificLocation: locDetail } = parseLocationParts(job.location);
      setWorkArrangement(arrangement);
      setSpecificLocation(locDetail);

      const parsed = parseSalaryRange(job.salary);
      const minVal = job.salaryMin ?? parsed.salaryMin;
      const maxVal = job.salaryMax ?? parsed.salaryMax;
      setSalaryMin(minVal !== null ? String(minVal) : '');
      setSalaryMax(maxVal !== null ? String(maxVal) : '');

      setStatus(job.status);
      setDateApplied(job.dateApplied);
      setDateAdded(job.dateAdded || job.createdAt?.split('T')[0] || todayIsoDate());
      setIndustry(job.industry);
      setSummary(job.summary);
      const facts = companyFactsForDisplay(job.companyMetadata);
      setHeadcount(facts.headcount === 'Unknown' ? '' : facts.headcount);
      setHeadquarters(facts.headquarters === 'Unknown' ? '' : facts.headquarters);
      setOwnership(facts.ownership);
      setFoundingYear(job.companyMetadata?.foundingYear || '');
      setSeniority(job.positionMetadata?.seniority || 'Mid-level');
      setDepartment(job.positionMetadata?.department || 'Engineering');
      setEmploymentType(job.positionMetadata?.employmentType || 'Full-time');
      setSkillsStr((job.positionMetadata?.requiredSkills || []).join(', '));
    }
  }, [job]);

  if (!isOpen || !job) return null;

  const minNum = salaryMin.trim() ? parseInt(salaryMin.replace(/[$,kK]/g, ''), 10) || null : null;
  const maxNum = salaryMax.trim() ? parseInt(salaryMax.replace(/[$,kK]/g, ''), 10) || null : null;
  // Account for user typing e.g. 195 meaning 195k
  const normalizedMin = minNum && minNum < 1000 && minNum > 20 ? minNum * 1000 : minNum;
  const normalizedMax = maxNum && maxNum < 1000 && maxNum > 20 ? maxNum * 1000 : maxNum;
  const previewSalary = formatSalaryDisplay(normalizedMin, normalizedMax).text;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const skillsArray = skillsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const finalLocation = formatNormalizedLocation(workArrangement, specificLocation);

    await onSave(job.id, {
      company,
      jobTitle,
      team: team.trim() || undefined,
      location: finalLocation,
      salary: previewSalary,
      salaryMin: normalizedMin,
      salaryMax: normalizedMax,
      status,
      dateApplied,
      dateAdded: dateAdded || todayIsoDate(),
      industry,
      summary,
      companyMetadata: {
        headcount,
        headquarters,
        ownership: ownership as any,
        foundingYear,
      },
      positionMetadata: {
        seniority,
        department,
        employmentType,
        requiredSkills: skillsArray,
      },
    });

    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal
      labelledBy={headingId}
      panelClassName="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90dvh] pb-[env(safe-area-inset-bottom)]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
        <div className="shrink-0 px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 id={headingId} className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Pencil className="w-4 h-4 text-indigo-600" />
            Edit application
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit job dialog"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Company Brand Name</label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Role Title</label>
              <input
                type="text"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Senior Product Manager"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Team / Division</label>
              <input
                type="text"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Pharmacy Care"
              />
            </div>
          </div>

          {/* Normalized Location Section */}
          <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Work Arrangement</label>
                <select
                  value={workArrangement}
                  onChange={(e) => setWorkArrangement(e.target.value as WorkArrangementType)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
                >
                  <option value="Onsite">Onsite</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Remote">Remote</option>
                </select>
              </div>

              {(workArrangement === 'Hybrid' || workArrangement === 'Onsite') ? (
                <div className="sm:col-span-2 animate-in fade-in duration-150">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Job Location (City, State / Office)
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="e.g. San Francisco, CA or New York, NY"
                      value={specificLocation}
                      onChange={(e) => setSpecificLocation(e.target.value)}
                      className="w-full pl-8.5 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="sm:col-span-2 flex items-center pt-5 text-slate-500 text-[11px]">
                  <Cloud className="w-3.5 h-3.5 text-indigo-500 mr-1.5 shrink-0" />
                  <span>Role is fully remote. No physical office location required.</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">
                  Salary Range (Integers / Thousands)
                </label>
                {previewSalary !== 'Not listed' && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Display: {previewSalary}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Min (e.g. 195000)"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Max (e.g. 275000)"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Current Status</label>
              <select
                aria-label="Job status selector in editing form"
                value={status}
                onChange={(e) => {
                  const newStatus = e.target.value as JobStatus;
                  const prevStatus = status;
                  setStatus(newStatus);
                  if (newStatus === 'Applied' && prevStatus === 'Saved' && !dateApplied) {
                    setDateApplied(todayIsoDate());
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {getStatusMeta(s).label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date Applied</label>
              <input
                type="date"
                value={dateApplied || ''}
                onChange={(e) => setDateApplied(e.target.value || null)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date Added</label>
              <input
                type="date"
                value={dateAdded}
                onChange={(e) => setDateAdded(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Industry Tag</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Job Description Summary</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider block text-[11px]">
              Position Details & Skills
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-slate-600 block mb-0.5">Seniority</label>
                <input
                  type="text"
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="text-slate-600 block mb-0.5">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="text-slate-600 block mb-0.5">Employment Type</label>
                <input
                  type="text"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-600 block mb-0.5">Required Skills (comma-separated)</label>
              <input
                type="text"
                value={skillsStr}
                onChange={(e) => setSkillsStr(e.target.value)}
                placeholder="React, TypeScript, AWS, Node.js"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider block text-[11px]">
              Company Metadata
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-slate-600 block mb-0.5">Headcount</label>
                <input
                  type="text"
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="text-slate-600 block mb-0.5">Headquarters</label>
                <input
                  type="text"
                  value={headquarters}
                  onChange={(e) => setHeadquarters(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="text-slate-600 block mb-0.5">Ownership</label>
                <select
                  value={ownership}
                  onChange={(e) => setOwnership(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-md font-medium"
                >
                  <option value="Private">Private</option>
                  <option value="Public">Public</option>
                  <option value="Non-profit">Non-profit</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
              <div>
                <label className="text-slate-600 block mb-0.5">Founding Year</label>
                <input
                  type="text"
                  value={foundingYear}
                  onChange={(e) => setFoundingYear(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Saving…' : 'Save changes'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
