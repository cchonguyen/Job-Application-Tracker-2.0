import type { ReactNode } from 'react';

interface ModalProps {
  /** id of the dialog's heading, for aria-labelledby */
  labelledBy: string;
  /** Called on a backdrop click. Omit to keep the dialog open on backdrop clicks. */
  onBackdropClick?: () => void;
  /** z-40 for primary dialogs, z-50 for stacked confirmations (docs/DESIGN_SYSTEM.md section 6). */
  layer?: 'base' | 'stacked';
  /** Classes for the dialog panel itself (size, padding, layout). */
  panelClassName: string;
  /** `alertdialog` for confirmations that need an answer before continuing. */
  role?: 'dialog' | 'alertdialog';
  children: ReactNode;
}

/** Shared scrim and dialog wrapper for every modal dialog. */
export function Modal({ labelledBy, onBackdropClick, layer = 'base', panelClassName, role = 'dialog', children }: ModalProps) {
  return (
    <div
      className={`fixed inset-0 ${layer === 'stacked' ? 'z-50' : 'z-40'} overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4 jat-scrim backdrop-blur-xs animate-in fade-in duration-150`}
      onClick={onBackdropClick}
    >
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={panelClassName}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
