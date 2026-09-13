import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function AdminDialog({
  title,
  busy = false,
  onClose,
  children,
}: {
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="admin-dialog__content">
        <div className="admin-dialog__head">
          <h3 id={titleId}>{title}</h3>
          <button className="admin-dialog__close" type="button" aria-label="Close"
            disabled={busy} onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}