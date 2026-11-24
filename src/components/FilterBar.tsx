import { useId, type ReactNode } from 'react';
import { Check, Minus, Search, SlidersHorizontal, X } from 'lucide-react';

export type TriStateFilter = 'any' | 'yes' | 'no';

/**
 * Cycles a tri-state filter chip: any -> yes -> no -> any.
 */
export function cycleTriState(state: TriStateFilter): TriStateFilter {
  if (state === 'any') return 'yes';
  if (state === 'yes') return 'no';
  return 'any';
}

export interface FilterSelectConfig {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export interface FilterToggleConfig {
  id: string;
  label: string;
  yesLabel: string;
  noLabel: string;
  state: TriStateFilter;
  onChange: (next: TriStateFilter) => void;
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

export interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  activeCount: number;
  selects?: FilterSelectConfig[];
  toggles?: FilterToggleConfig[];
  activeChips?: ActiveFilterChip[];
  onClearAll?: () => void;
  trailingActions?: ReactNode;
  children?: ReactNode;
}

/**
 * Harness UI Filters toolbar with collapsible facet selects, status/custom groups,
 * tri-state toggle chips, removable active filter pills, and a Clear action.
 */
export const FilterBar = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchAriaLabel = 'Search',
  isOpen,
  onToggleOpen,
  activeCount,
  selects = [],
  toggles = [],
  activeChips = [],
  onClearAll,
  trailingActions,
  children,
}: FilterBarProps) => {
  const panelId = useId();
  const showClear = Boolean(onClearAll) && (activeCount > 0 || searchQuery.trim().length > 0);
  const triggerLabel = activeCount > 0 ? `Filters (${activeCount})` : 'Filters';

  return (
    <div className="flex flex-col gap-2">
      <div className="ui-filter-bar">
        <div className="ui-input relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel}
            className="w-full pl-9 pr-7 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50/60 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400 text-slate-900"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-slate-200 rounded-full w-4 h-4 inline-flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className={`ui-filter-trigger ${isOpen || activeCount > 0 ? 'ui-filter-trigger--active' : ''}`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{triggerLabel}</span>
        </button>

        {activeChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove ${chip.label} filter`}
            className="ui-pill ui-pill--active"
          >
            <Check className="w-3 h-3" />
            <span>{chip.label}</span>
            <X className="w-3 h-3 text-slate-500" />
          </button>
        ))}

        {showClear && (
          <button
            type="button"
            onClick={onClearAll}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}

        {trailingActions && (
          <div className="flex items-center gap-2 sm:ml-auto flex-wrap sm:flex-nowrap">
            {trailingActions}
          </div>
        )}
      </div>

      {isOpen && (
        <div id={panelId} className="ui-filter-panel">
          {selects.length > 0 && (
            <div className="ui-filter-group">
              {selects.map((select) => (
                <select
                  key={select.id}
                  aria-label={select.label}
                  value={select.value}
                  onChange={(e) => select.onChange(e.target.value)}
                  data-active={select.value ? 'true' : undefined}
                  className={`ui-filter-select ${select.value ? 'ui-filter-select--active' : ''}`}
                >
                  <option value="">{select.label}</option>
                  {select.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          )}

          {children}

          {toggles.length > 0 && (
            <div className="ui-filter-group">
              {toggles.map((toggle) => {
                const text =
                  toggle.state === 'yes'
                    ? toggle.yesLabel
                    : toggle.state === 'no'
                    ? toggle.noLabel
                    : toggle.label;
                const stateClass =
                  toggle.state === 'yes'
                    ? 'ui-filter-toggle--yes'
                    : toggle.state === 'no'
                    ? 'ui-filter-toggle--no'
                    : '';
                const ariaPressed: boolean | 'mixed' =
                  toggle.state === 'yes' ? true : toggle.state === 'no' ? 'mixed' : false;

                return (
                  <button
                    key={toggle.id}
                    type="button"
                    data-state={toggle.state}
                    aria-pressed={ariaPressed}
                    onClick={() => toggle.onChange(cycleTriState(toggle.state))}
                    className={`ui-filter-toggle ${stateClass}`}
                  >
                    {toggle.state === 'yes' && <Check />}
                    {toggle.state === 'no' && <Minus />}
                    <span>{text}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
