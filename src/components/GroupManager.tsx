'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  GripVertical,
  FolderPlus,
} from 'lucide-react';
import { ProjectGroup, GROUP_COLORS } from '@/lib/types';

interface GroupManagerProps {
  open: boolean;
  onClose: () => void;
  groups: ProjectGroup[];
  onCreateGroup: (group: Omit<ProjectGroup, 'id' | 'order'>) => void;
  onUpdateGroup: (groupId: string, updates: Partial<ProjectGroup>) => void;
  onDeleteGroup: (groupId: string) => void;
}

export function GroupManager({
  open,
  onClose,
  groups,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
}: GroupManagerProps) {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0].color);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = () => {
    if (!newGroupName.trim()) return;
    onCreateGroup({
      name: newGroupName.trim(),
      color: newGroupColor,
    });
    setNewGroupName('');
    setNewGroupColor(GROUP_COLORS[0].color);
  };

  const handleStartEdit = (group: ProjectGroup) => {
    setEditingId(group.id);
    setEditingName(group.name);
  };

  const handleSaveEdit = () => {
    if (editingId && editingName.trim()) {
      onUpdateGroup(editingId, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName('');
  };

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
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <FolderPlus className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">그룹 관리</h2>
                    <p className="text-xs text-zinc-500">프로젝트를 카테고리별로 정리하세요</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 새 그룹 생성 */}
              <div className="p-4 border-b border-[#27272a]">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    placeholder="새 그룹 이름..."
                    className="flex-1 h-10 px-3 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-white placeholder:text-zinc-500 outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center gap-1 p-1 bg-[#09090b] border border-[#27272a] rounded-lg">
                    {GROUP_COLORS.slice(0, 6).map((color) => (
                      <button
                        key={color.id}
                        onClick={() => setNewGroupColor(color.color)}
                        className={`w-6 h-6 rounded-md transition-all ${
                          newGroupColor === color.color
                            ? 'ring-2 ring-white ring-offset-1 ring-offset-[#09090b]'
                            : ''
                        }`}
                        style={{ backgroundColor: color.color }}
                        title={color.label}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={!newGroupName.trim()}
                    className="h-10 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-medium text-white transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 그룹 목록 */}
              <div className="max-h-80 overflow-y-auto">
                {groups.length === 0 ? (
                  <div className="p-8 text-center">
                    <FolderPlus className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">아직 그룹이 없습니다</p>
                    <p className="text-xs text-zinc-600 mt-1">위에서 새 그룹을 만들어보세요</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {groups.sort((a, b) => a.order - b.order).map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 group"
                      >
                        <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab" />
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        {editingId === group.id ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                            onBlur={handleSaveEdit}
                            autoFocus
                            className="flex-1 h-8 px-2 bg-[#09090b] border border-indigo-500 rounded text-sm text-white outline-none"
                          />
                        ) : (
                          <span className="flex-1 text-sm text-zinc-200">{group.name}</span>
                        )}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* 색상 변경 */}
                          <div className="relative group/colors">
                            <div
                              className="w-6 h-6 rounded-md cursor-pointer border border-zinc-700"
                              style={{ backgroundColor: group.color }}
                            />
                            <div className="absolute right-0 top-full mt-1 p-1 bg-[#09090b] border border-[#27272a] rounded-lg hidden group-hover/colors:flex gap-1 z-10">
                              {GROUP_COLORS.map((color) => (
                                <button
                                  key={color.id}
                                  onClick={() => onUpdateGroup(group.id, { color: color.color })}
                                  className="w-5 h-5 rounded"
                                  style={{ backgroundColor: color.color }}
                                />
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => handleStartEdit(group)}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteGroup(group.id)}
                            className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 하단 안내 */}
              <div className="p-3 border-t border-[#27272a] text-xs text-zinc-500">
                그룹을 만든 후 프로젝트 상세에서 그룹을 지정할 수 있습니다
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
