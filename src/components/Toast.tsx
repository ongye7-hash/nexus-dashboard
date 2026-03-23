'use client';

import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertCircle, Info, Loader2 } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'loading';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => string;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <Check className="w-4 h-4" />,
  error: <X className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
  loading: <Loader2 className="w-4 h-4 animate-spin" />,
};

const COLORS: Record<ToastType, { bg: string; icon: string; border: string }> = {
  success: {
    bg: 'bg-green-500/10',
    icon: 'bg-green-500 text-white',
    border: 'border-green-500/20',
  },
  error: {
    bg: 'bg-red-500/10',
    icon: 'bg-red-500 text-white',
    border: 'border-red-500/20',
  },
  info: {
    bg: 'bg-blue-500/10',
    icon: 'bg-blue-500 text-white',
    border: 'border-blue-500/20',
  },
  loading: {
    bg: 'bg-zinc-500/10',
    icon: 'bg-zinc-600 text-white',
    border: 'border-zinc-500/20',
  },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const colors = COLORS[toast.type];

  useEffect(() => {
    if (toast.type !== 'loading' && toast.duration !== 0) {
      const timer = setTimeout(() => {
        onClose();
      }, toast.duration || 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors.bg} ${colors.border} backdrop-blur-xl shadow-lg`}
    >
      <div className={`flex items-center justify-center w-6 h-6 rounded-full ${colors.icon}`}>
        {ICONS[toast.type]}
      </div>
      <span className="text-sm font-medium text-white">{toast.message}</span>
      {toast.type !== 'loading' && (
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}

      {/* 토스트 컨테이너 */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onClose={() => hideToast(toast.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
