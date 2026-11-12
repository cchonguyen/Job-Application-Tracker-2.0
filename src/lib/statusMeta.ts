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
  /** Solid dot fill for compact status pickers */
  dot: string;
  /** 4px left border accent for cards */
  borderAccent: string;
}

/**
 * Single source of truth for status colors. Every status surface (badge,
 * icon, menu chip, dot, card border) reads from here.
 *
 * Status hues never use the accent palette (indigo-* is remapped by the
 * accent picker), so a status keeps its meaning under every accent.
 *
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
    dot: 'bg-slate-400',
    borderAccent: 'border-l-slate-400',
  },
  Applied: {
    value: 'Applied',
    label: 'Applied',
    icon: Send,
    badge: 'bg-amber-50 text-amber-800 border-amber-300',
    iconClass: 'text-amber-500',
    chipBg: 'bg-amber-50 border-amber-200',
    dot: 'bg-amber-500',
    borderAccent: 'border-l-amber-500',
  },
  Interviewing: {
    value: 'Interviewing',
    label: 'Interviewing',
    icon: Calendar,
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    iconClass: 'text-blue-600',
    chipBg: 'bg-blue-50 border-blue-200',
    dot: 'bg-blue-600',
    borderAccent: 'border-l-blue-600',
  },
  Offer: {
    value: 'Offer',
    label: 'Offer',
    icon: Award,
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    iconClass: 'text-purple-600',
    chipBg: 'bg-purple-50 border-purple-200',
    dot: 'bg-purple-600',
    borderAccent: 'border-l-purple-600',
  },
  Accepted: {
    value: 'Accepted',
    label: 'Accepted',
    icon: CheckCircle2,
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    iconClass: 'text-teal-600',
    chipBg: 'bg-teal-50 border-teal-200',
    dot: 'bg-teal-500',
    borderAccent: 'border-l-teal-500',
  },
  Rejected: {
    value: 'Rejected',
    label: 'Rejected',
    icon: XCircle,
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    iconClass: 'text-rose-600',
    chipBg: 'bg-rose-50 border-rose-200',
    dot: 'bg-rose-500',
    borderAccent: 'border-l-rose-500',
  },
  Declined: {
    value: 'Declined',
    label: 'Declined',
    icon: Ban,
    badge: 'bg-stone-100 text-stone-700 border-stone-200',
    iconClass: 'text-stone-600',
    chipBg: 'bg-stone-50 border-stone-200',
    dot: 'bg-stone-500',
    borderAccent: 'border-l-stone-500',
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
  'Accepted',
  'Offer',
  'Interviewing',
  'Applied',
  'Saved',
];

/**
 * Convenience helper to get StatusMeta with a safe fallback to Saved.
 */
export function getStatusMeta(status: JobStatus): StatusMeta {
  return STATUS_META[status] || STATUS_META.Saved;
}
