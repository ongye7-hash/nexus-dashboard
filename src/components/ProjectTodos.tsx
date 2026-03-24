'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  ListTodo,
} from 'lucide-react';

interface Todo {
  id: number;
  project_path: string;
  content: string;
  completed: number;
  priority: string;
  created_at: string;
  completed_at: string | null;
}

interface ProjectTodosProps {
  projectPath: string;
  projectName: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-green-500',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

export default function ProjectTodos({ projectPath, projectName }: ProjectTodosProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [newPriority, setNewPriority] = useState<string>('medium');
  const [isAdding, setIsAdding] = useState(false);

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch(`/api/todos?path=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      if (data.todos) {
        setTodos(data.todos);
      }
    } catch (error) {
      console.error('TODO 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const handleAdd = async () => {
    const content = newContent.trim();
    if (!content) return;

    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          projectPath,
          content,
          priority: newPriority,
        }),
      });
      const data = await res.json();
      if (data.success && data.todo) {
        setTodos((prev) => [data.todo, ...prev]);
        setNewContent('');
        setNewPriority('medium');
        setIsAdding(false);
      }
    } catch (error) {
      console.error('TODO 추가 실패:', error);
    }
  };

  const handleToggle = async (todoId: number) => {
    try {
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', todoId }),
      });
      setTodos((prev) =>
        prev.map((t) =>
          t.id === todoId
            ? { ...t, completed: t.completed ? 0 : 1, completed_at: t.completed ? null : new Date().toISOString() }
            : t
        ).sort((a, b) => a.completed - b.completed)
      );
    } catch (error) {
      console.error('TODO 토글 실패:', error);
    }
  };

  const handleDelete = async (todoId: number) => {
    try {
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', todoId }),
      });
      setTodos((prev) => prev.filter((t) => t.id !== todoId));
    } catch (error) {
      console.error('TODO 삭제 실패:', error);
    }
  };

  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;

  // Sort: incomplete first, then completed
  const sortedTodos = [...todos].sort((a, b) => a.completed - b.completed);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-white">TODO</span>
          {totalCount > 0 && (
            <span className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 rounded-full">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          추가
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 border-b border-zinc-800 space-y-2">
              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') { setIsAdding(false); setNewContent(''); }
                }}
                placeholder="할 일을 입력하세요..."
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(['high', 'medium', 'low'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setNewPriority(p)}
                      className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border transition-colors ${
                        newPriority === p
                          ? 'border-zinc-600 bg-zinc-800 text-white'
                          : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p]}`} />
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setIsAdding(false); setNewContent(''); }}
                    className="px-3 py-1 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={!newContent.trim()}
                    className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Todo list */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent mx-auto" />
          </div>
        ) : sortedTodos.length === 0 ? (
          <div className="p-6 text-center">
            <ListTodo className="w-8 h-8 mx-auto mb-2 text-zinc-700" />
            <p className="text-sm text-zinc-500">아직 할 일이 없어요. 추가해보세요!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sortedTodos.map((todo) => (
              <motion.div
                key={todo.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="group flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
              >
                <button
                  onClick={() => handleToggle(todo.id)}
                  className="flex-shrink-0 transition-colors"
                >
                  {todo.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-zinc-600 hover:text-zinc-400" />
                  )}
                </button>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS.medium}`} />
                <span
                  className={`flex-1 text-sm ${
                    todo.completed
                      ? 'text-zinc-600 line-through'
                      : 'text-zinc-300'
                  }`}
                >
                  {todo.content}
                </span>
                <button
                  onClick={() => handleDelete(todo.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
