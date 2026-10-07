import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  size?: keyof typeof SIZE_CLASSES;
  /** Impede fechar enquanto uma operação está em curso. */
  isBusy?: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  description,
  size = 'md',
  isBusy = false,
  onClose,
  footer,
  children,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;

  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const firstField = dialog?.querySelector<HTMLElement>('input, select, textarea') ?? dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstField?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusyRef.current) {
        onCloseRef.current();
        return;
      }
      // Mantém o foco dentro do diálogo.
      if (event.key === 'Tab' && dialog) {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0" aria-hidden="true" onClick={() => !isBusy && onClose()} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-lg border border-border bg-surface shadow-lg sm:rounded-lg ${SIZE_CLASSES[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-text">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-sm text-text-secondary">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Fechar"
            className="rounded-md p-1 text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border bg-background px-5 py-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
