import {
  Bookmark,
  Send,
  Calendar,
  Award,
  CheckCircle2,
  XCircle,
  Ban,
  type LucideIcon,
} from 'lucide-react';
import type { JobStatus } from '../types';

export interface StatusMeta {
  value: JobStatus;
  label: string;
  icon: LucideIcon;
  /** Badge / select surface classes */
  badge: string;
  /** Icon tint */
  iconClass: string;
  /** Soft chip bg for menus */
  chipBg: string;
}

/**
 * Status color mappings:
 * - Applied: Gold (amber-500)
 * - Interviewing: Blue (blue-600)
 * - Offer: Purple (purple-600)
 * - Accepted: Teal (teal-600)
 * - Saved: Slate (slate-500)
 * - Rejected: Rose (rose-600)
 * - Declined: Stone (stone-600)
 */
export const STATUS_META: Record<JobStatus, StatusMeta> = {
  Saved: {
    value: 'Saved',
    label: 'Saved',
    icon: Bookmark,
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    iconClass: 'text-slate-500',
    chipBg: 'bg-slate-50 border-slate-200',
  },
  Applied: {
    value: 'Applied',
    label: 'Applied',
    icon: Send,
    badge: 'bg-amber-50 text-amber-800 border-amber-300',
    iconClass: 'text-amber-500',
    chipBg: 'bg-amber-50 border-amber-200',
  },
  Interviewing: {
    value: 'Interviewing',
    label: 'Interviewing',
    icon: Calendar,
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    iconClass: 'text-blue-600',
    chipBg: 'bg-blue-50 border-blue-200',
  },
  Offer: {
    value: 'Offer',
    label: 'Offer',
    icon: Award,
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    iconClass: 'text-purple-600',
    chipBg: 'bg-purple-50 border-purple-200',
  },
  Accepted: {
    value: 'Accepted',
    label: 'Accepted',
    icon: CheckCircle2,
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    iconClass: 'text-teal-600',
    chipBg: 'bg-teal-50 border-teal-200',
  },
  Rejected: {
    value: 'Rejected',
    label: 'Rejected',
    icon: XCircle,
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    iconClass: 'text-rose-600',
    chipBg: 'bg-rose-50 border-rose-200',
  },
  Declined: {
    value: 'Declined',
    label: 'Declined',
    icon: Ban,
    badge: 'bg-stone-100 text-stone-700 border-stone-200',
    iconClass: 'text-stone-600',
    chipBg: 'bg-stone-50 border-stone-200',
  },
};

/**
 * Ordered priority:
 * Accepted > Offer > Interviewing at the top,
 * followed by standard active statuses (Applied, Saved),
 * with Rejected and Declined at the bottom.
 */
export const STATUS_ORDER: JobStatus[] = [
  'Accepted',
  'Offer',
  'Interviewing',
  'Applied',
  'Saved',
  'Rejected',
  'Declined',
];

/**
 * Default visible statuses in the spreadsheet.
 * Includes all active pipeline stages; excludes closed stages by default.
 */
export const DEFAULT_VISIBLE_STATUSES: JobStatus[] = [
  'Applied',
  'Interviewing',
  'Offer',
  'Saved',
];

/**
 * Convenience helper to get StatusMeta with a safe fallback to Saved.
 */
export function getStatusMeta(status: JobStatus): StatusMeta {
  return STATUS_META[status] || STATUS_META.Saved;
}
