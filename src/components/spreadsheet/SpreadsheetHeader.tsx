import {
  Building2,
  Briefcase,
  MapPin,
  DollarSign,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
} from 'lucide-react';
import { SortField, SortOrder } from './useSpreadsheetFilter';

interface SpreadsheetHeaderProps {
  viewMode: 'full' | 'compact';
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}

export const SpreadsheetHeader = ({
  viewMode,
  sortField,
  sortOrder,
  onSort,
}: SpreadsheetHeaderProps) => {
  const isCompact = viewMode === 'compact';

  const renderSortIndicator = (field: SortField | 'compactCompany') => {
    const isActive =
      field === 'compactCompany'
        ? sortField === 'company' || sortField === 'jobTitle'
        : sortField === field;

    if (!isActive) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />;
    }

    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 shrink-0" />
    );
  };

  return (
    <thead className="bg-slate-50/95 text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
      <tr>
        {/* Col 0: Status Icon Column (Just icon, no text/bubble) */}
        <th className={`py-3 text-center whitespace-nowrap ${isCompact ? 'w-9 px-1' : 'w-[44px] px-2'}`}>
          <Filter className="w-3.5 h-3.5 text-indigo-600 mx-auto" />
        </th>

        {!isCompact ? (
          <>
            {/* Full mode: Company */}
            <th
              onClick={() => onSort('company')}
              className="px-3 py-3 cursor-pointer hover:bg-slate-100/70 transition-colors whitespace-nowrap min-w-[140px]"
            >
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Company</span>
                {renderSortIndicator('company')}
              </div>
            </th>

            {/* Full mode: Job Title */}
            <th
              onClick={() => onSort('jobTitle')}
              className="px-3 py-3 cursor-pointer hover:bg-slate-100/70 transition-colors whitespace-nowrap min-w-[160px]"
            >
              <div className="flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Job Title</span>
                {renderSortIndicator('jobTitle')}
              </div>
            </th>
          </>
        ) : (
          /* Compact mode: Company & Role - Flexible width with zero min-w */
          <th
            onClick={() => onSort('company')}
            className="px-2 sm:px-3 py-3 cursor-pointer hover:bg-slate-100/70 transition-colors whitespace-nowrap w-[44%]"
          >
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Company & Role</span>
              {renderSortIndicator('compactCompany')}
            </div>
          </th>
        )}

        {/* Location */}
        <th className={`py-3 whitespace-nowrap ${isCompact ? 'px-2 w-[20%]' : 'px-3 min-w-[110px]'}`}>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Location</span>
          </div>
        </th>

        {/* Salary */}
        <th
          onClick={() => onSort('salary')}
          className={`py-3 cursor-pointer hover:bg-slate-100/70 transition-colors whitespace-nowrap ${
            isCompact ? 'px-2 w-[13%]' : 'px-3 min-w-[100px]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Salary</span>
            {renderSortIndicator('salary')}
          </div>
        </th>

        {/* Timeline */}
        <th
          onClick={() => onSort('dateApplied')}
          className={`py-3 cursor-pointer hover:bg-slate-100/70 transition-colors whitespace-nowrap ${
            isCompact ? 'px-2 w-[13%]' : 'px-3 min-w-[110px]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Timeline</span>
            {renderSortIndicator('dateApplied')}
          </div>
        </th>

        {!isCompact && (
          <>
            <th className="px-3 py-3 whitespace-nowrap min-w-[120px]">
              <span>Industry</span>
            </th>
            <th className="px-3 py-3 whitespace-nowrap min-w-[220px]">
              <span>Summary</span>
            </th>
          </>
        )}

        {/* Actions */}
        <th className={`py-3 text-right whitespace-nowrap ${isCompact ? 'w-20 px-1' : 'w-[100px] px-2'}`}>
          <span className="sr-only sm:not-sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
};
