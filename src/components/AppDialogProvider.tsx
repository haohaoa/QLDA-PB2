import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CircleHelp, Info, X } from 'lucide-react';

type DialogRequest =
  | { kind: 'alert'; title?: string; message: string; resolve: () => void }
  | { kind: 'confirm'; title?: string; message: string; confirmLabel?: string; resolve: (confirmed: boolean) => void };

interface AppDialogContextValue {
  showAlert: (message: string, title?: string) => Promise<void>;
  showConfirm: (message: string, title?: string, confirmLabel?: string) => Promise<boolean>;
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function useAppDialog(): AppDialogContextValue {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error('useAppDialog phải được dùng bên trong AppDialogProvider.');
  return context;
}

export const AppDialogProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogElementRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const showAlert = useCallback((message: string, title = 'Thông báo') => new Promise<void>((resolve) => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog({ kind: 'alert', title, message, resolve: () => {
      setDialog(null);
      resolve();
    } });
  }), []);

  const showConfirm = useCallback((
    message: string,
    title = 'Xác nhận thao tác',
    confirmLabel = 'Đồng ý'
  ) => new Promise<boolean>((resolve) => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog({ kind: 'confirm', title, message, confirmLabel, resolve: (confirmed) => {
      setDialog(null);
      resolve(confirmed);
    } });
  }), []);

  useEffect(() => {
    if (!dialog) return;
    confirmButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dialog.kind === 'confirm') dialog.resolve(false);
        else dialog.resolve();
        return;
      }
      if (event.key === 'Tab') {
        const buttons = dialogElementRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [dialog]);

  const isConfirm = dialog?.kind === 'confirm';
  const dismissDialog = () => {
    if (dialog?.kind === 'confirm') dialog.resolve(false);
    if (dialog?.kind === 'alert') dialog.resolve();
  };
  const acceptDialog = () => {
    if (dialog?.kind === 'confirm') dialog.resolve(true);
    if (dialog?.kind === 'alert') dialog.resolve();
  };

  return (
    <AppDialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div
            ref={dialogElementRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            aria-describedby="app-dialog-message"
            className="w-full max-w-md rounded-t-3xl border border-white/80 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                isConfirm ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {isConfirm ? <CircleHelp className="h-5 w-5" /> : <Info className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="app-dialog-title" className="text-base font-bold text-slate-900">
                  {dialog.title}
                </h2>
                <p id="app-dialog-message" className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
                  {dialog.message}
                </p>
              </div>
              <button
                type="button"
                onClick={dismissDialog}
                aria-label="Đóng thông báo"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {isConfirm && (
                <button
                  type="button"
                  onClick={dismissDialog}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:min-h-11"
                >
                  <X className="h-4 w-4" />
                  Hủy
                </button>
              )}
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={acceptDialog}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white shadow-sm focus:outline-none focus:ring-4 sm:min-h-11 ${
                  isConfirm
                    ? 'bg-blue-700 hover:bg-blue-800 focus:ring-blue-200'
                    : 'bg-slate-900 hover:bg-slate-800 focus:ring-slate-200'
                }`}
              >
                {isConfirm ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {isConfirm ? dialog.confirmLabel : 'Đã hiểu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppDialogContext.Provider>
  );
};
