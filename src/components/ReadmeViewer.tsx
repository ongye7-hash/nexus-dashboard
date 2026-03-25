'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface ReadmeViewerProps {
  projectPath: string;
}

export function ReadmeViewer({ projectPath }: ReadmeViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchReadme = async () => {
      setLoading(true);

      try {
        const res = await fetch(`/api/readme?path=${encodeURIComponent(projectPath)}`);
        const data = await res.json();

        if (res.ok) {
          setExists(data.exists);
          setContent(data.content);
          setFilename(data.filename);
        }
      } catch { /* README 로드 실패 — 없는 것으로 처리 */
        setExists(false);
      } finally {
        setLoading(false);
      }
    };

    fetchReadme();
  }, [projectPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!exists || !content) {
    return (
      <div className="text-sm text-zinc-500 text-center py-4">
        README 파일이 없습니다
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2 hover:bg-zinc-800/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-300">{filename}</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 p-4 bg-[#0f0f10] rounded-lg max-h-80 overflow-y-auto custom-scrollbar">
          <article className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-200 prose-p:text-zinc-400 prose-a:text-indigo-400 prose-strong:text-zinc-300 prose-code:text-amber-400 prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-li:text-zinc-400 prose-blockquote:border-zinc-700 prose-blockquote:text-zinc-500 prose-hr:border-zinc-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}
