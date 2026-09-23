import { useEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export const PortalDropdown = ({
  isOpen,
  onClose,
  triggerRef,
  children,
  align = 'right',
  className = '',
}: PortalDropdownProps) => {
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    maxHeight: number;
  }>({
    maxHeight: 300,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const spaceBelow = viewportHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;

      // Estimate or measure dropdown height
      const estimatedHeight = dropdownRef.current?.scrollHeight || 240;
      const shouldFlipUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

      let top: number | undefined;
      let bottom: number | undefined;
      let maxHeight: number;

      if (shouldFlipUp) {
        // Anchor above trigger button: bottom of dropdown sits 4px above top of trigger
        bottom = viewportHeight - rect.top + 4;
        maxHeight = Math.max(120, Math.min(spaceAbove, 360));
      } else {
        // Anchor below trigger button: top of dropdown sits 4px below bottom of trigger
        top = rect.bottom + 4;
        maxHeight = Math.max(120, Math.min(spaceBelow, 360));
      }

      let left: number | undefined;
      let right: number | undefined;

      if (align === 'right') {
        right = Math.max(8, viewportWidth - rect.right);
      } else {
        left = Math.max(8, rect.left);
      }

      setCoords({ top, bottom, left, right, maxHeight });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, triggerRef, align]);

  // Handle click outside & Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: coords.top !== undefined ? `${coords.top}px` : undefined,
        bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
        left: coords.left !== undefined ? `${coords.left}px` : undefined,
        right: coords.right !== undefined ? `${coords.right}px` : undefined,
        maxHeight: `${coords.maxHeight}px`,
        overflowY: 'auto',
        zIndex: 9999,
      }}
      className={`bg-white border border-slate-200 rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-100 ${className}`}
    >
      {children}
    </div>,
    document.body
  );
};
