'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FolderGit2 as GithubIcon,
  Server,
  Bot,
} from 'lucide-react';
import GitHubTab from './settings/GitHubTab';
import VPSTab from './settings/VPSTab';
import AITab from './settings/AITab';

type TabId = 'github' | 'vps' | 'ai';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabId;
}

const TABS = [
  { id: 'github' as const, label: 'GitHub', icon: GithubIcon },
  { id: 'vps' as const, label: 'VPS', icon: Server },
  { id: 'ai' as const, label: 'AI', icon: Bot },
];

export function SettingsModal({ open, onClose, initialTab = 'github' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 max-h-[85vh] flex flex-col"
          >
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* 헤더 + 탭 */}
              <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
                <h3 className="text-base font-semibold text-white">설정</h3>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 탭 바 */}
              <div className="flex border-b border-[#27272a]">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                        isActive
                          ? 'text-purple-400'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                      {isActive && (
                        <motion.div
                          layoutId="settings-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 탭 콘텐츠 */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'github' && <GitHubTab />}
                {activeTab === 'vps' && <VPSTab />}
                {activeTab === 'ai' && <AITab />}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
