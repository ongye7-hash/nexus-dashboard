'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  size?: number;
  extension?: string;
}

interface FileTreeProps {
  projectPath: string;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
  '.ts': <FileCode className="w-4 h-4 text-blue-400" />,
  '.tsx': <FileCode className="w-4 h-4 text-blue-400" />,
  '.js': <FileCode className="w-4 h-4 text-yellow-400" />,
  '.jsx': <FileCode className="w-4 h-4 text-yellow-400" />,
  '.json': <FileJson className="w-4 h-4 text-amber-400" />,
  '.md': <FileText className="w-4 h-4 text-zinc-400" />,
  '.txt': <FileText className="w-4 h-4 text-zinc-400" />,
  '.css': <FileCode className="w-4 h-4 text-pink-400" />,
  '.scss': <FileCode className="w-4 h-4 text-pink-400" />,
  '.html': <FileCode className="w-4 h-4 text-orange-400" />,
  '.py': <FileCode className="w-4 h-4 text-green-400" />,
  '.png': <Image className="w-4 h-4 text-purple-400" />,
  '.jpg': <Image className="w-4 h-4 text-purple-400" />,
  '.jpeg': <Image className="w-4 h-4 text-purple-400" />,
  '.svg': <Image className="w-4 h-4 text-purple-400" />,
  '.ico': <Image className="w-4 h-4 text-purple-400" />,
};

function FileTreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [isOpen, setIsOpen] = useState(depth < 1);

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 w-full py-0.5 px-1 rounded hover:bg-zinc-800/50 text-left transition-colors"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <ChevronRight
            className={`w-3 h-3 text-zinc-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          {isOpen ? (
            <FolderOpen className="w-4 h-4 text-amber-400" />
          ) : (
            <Folder className="w-4 h-4 text-amber-400" />
          )}
          <span className="text-sm text-zinc-300 truncate">{node.name}</span>
        </button>
        <AnimatePresence>
          {isOpen && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {node.children.map((child) => (
                <FileTreeNode key={child.path} node={child} depth={depth + 1} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const icon = FILE_ICONS[node.extension || ''] || <File className="w-4 h-4 text-zinc-500" />;

  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-zinc-800/50 transition-colors"
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      {icon}
      <span className="text-sm text-zinc-400 truncate">{node.name}</span>
    </div>
  );
}

export function FileTree({ projectPath }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTree = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(projectPath)}`);
        const data = await res.json();

        if (res.ok) {
          setTree(data.tree);
        } else {
          setError(data.error || '파일 트리를 불러올 수 없습니다');
        }
      } catch (error) {
        console.warn('파일 트리 로드 실패:', error);
        setError('파일 트리를 불러올 수 없습니다');
      } finally {
        setLoading(false);
      }
    };

    fetchTree();
  }, [projectPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-zinc-500 text-center py-4">
        {error}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="text-sm text-zinc-500 text-center py-4">
        파일이 없습니다
      </div>
    );
  }

  return (
    <div className="max-h-60 overflow-y-auto custom-scrollbar">
      {tree.map((node) => (
        <FileTreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}
