import { useState } from 'react';
import { resolveCompanyLogo } from '../lib/companyLogo';

const SIZE_CLASS = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
} as const;

interface CompanyLogoProps {
  company: string;
  url?: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

export function CompanyLogo({ company, url, size = 'sm', className = '' }: CompanyLogoProps) {
  const resolved = resolveCompanyLogo(url, company, size === 'lg' ? 128 : 64);
  const [failed, setFailed] = useState(false);
  const initial = (company || '?').charAt(0).toUpperCase();
  const box = SIZE_CLASS[size];

  if (!resolved || failed) {
    return (
      <div
        className={`${box} rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0 border border-indigo-100 ${className}`}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    <div
      className={`${box} rounded-lg bg-white flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden ${className}`}
    >
      <img
        src={resolved.src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain p-0.5"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
