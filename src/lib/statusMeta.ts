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
 * Applied uses indigo-* so Theme accent remapping visibly affects the pipeline.
 * Other statuses keep semantic colors (amber/emerald/rose).
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
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    iconClass: 'text-indigo-600',
    chipBg: 'bg-indigo-50 border-indigo-200',
  },
  Interviewing: {
    value: 'Interviewing',
    label: 'Interviewing',
    icon: Calendar,
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    iconClass: 'text-amber-600',
    chipBg: 'bg-amber-50 border-amber-200',
  },
  Offer: {
    value: 'Offer',
    label: 'Offer',
    icon: Award,
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconClass: 'text-emerald-600',
    chipBg: 'bg-emerald-50 border-emerald-200',
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
 * Default visible statuses in multi-select filter:
 * Rejected and Declined are hidden (unchecked) by default.
 */
export const DEFAULT_VISIBLE_STATUSES: JobStatus[] = [
  'Accepted',
  'Offer',
  'Interviewing',
  'Applied',
  'Saved',
];

export const STATUS_TIER_RANK: Record<JobStatus, number> = {
  Accepted: 1,
  Offer: 2,
  Interviewing: 3,
  Applied: 4,
  Saved: 5,
  Rejected: 6,
  Declined: 7,
};

export function getStatusMeta(status: JobStatus): StatusMeta {
  return STATUS_META[status] || STATUS_META.Saved;
}
