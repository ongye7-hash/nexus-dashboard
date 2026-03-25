'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Info, AlertTriangle, AlertCircle, X } from 'lucide-react';

export interface AlertItem {
  id: string;
  type: 'uncommitted' | 'unpushed' | 'streak' | 'todos';
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  projectId?: string;
}

interface AlertsPanelProps {
  alerts: AlertItem[];
  dismissedAlerts: Set<string>;
  onDismiss: (alertId: string) => void;
}

const severityStyles = {
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    icon: Info,
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    icon: AlertTriangle,
  },
  danger: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    icon: AlertCircle,
  },
};

export default function AlertsPanel({ alerts, dismissedAlerts, onDismiss }: AlertsPanelProps) {
  const visibleAlerts = alerts.filter(a => !dismissedAlerts.has(a.id));

  if (visibleAlerts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-2"
    >
      <AnimatePresence mode="popLayout">
        {visibleAlerts.map((alert) => {
          const style = severityStyles[alert.severity];
          const AlertIcon = style.icon;

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10, height: 0 }}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${style.bg} ${style.border}`}
            >
              <AlertIcon className={`w-4 h-4 shrink-0 ${style.text}`} />
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-semibold ${style.text}`}>{alert.title}</span>
                <span className="text-xs text-zinc-400 ml-2">{alert.message}</span>
              </div>
              <button
                onClick={() => onDismiss(alert.id)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
