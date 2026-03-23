'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Monitor,
  Smartphone,
  Tablet,
  ExternalLink,
  RefreshCw,
  X,
  Maximize2,
  Minimize2,
  AlertCircle,
} from 'lucide-react';

interface LivePreviewProps {
  url: string;
  projectName: string;
  onClose?: () => void;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICE_SIZES: Record<DeviceMode, { width: number; height: number; label: string }> = {
  desktop: { width: 1280, height: 800, label: '데스크톱' },
  tablet: { width: 768, height: 1024, label: '태블릿' },
  mobile: { width: 375, height: 667, label: '모바일' },
};

export function LivePreview({ url, projectName, onClose }: LivePreviewProps) {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentDevice = DEVICE_SIZES[deviceMode];

  const handleRefresh = () => {
    setIsLoading(true);
    setHasError(false);
    setRefreshKey((k) => k + 1);
  };

  // 동일 출처 정책으로 인해 일부 사이트는 iframe에서 로드되지 않을 수 있음
  // 대안: screenshot API 또는 프록시 서버

  return (
    <div className={`${isExpanded ? 'fixed inset-4 z-50' : 'relative'}`}>
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
          onClick={() => setIsExpanded(false)}
        />
      )}

      <motion.div
        layout
        className={`bg-[#0f0f10] border border-[#27272a] rounded-xl overflow-hidden ${
          isExpanded ? 'relative z-50 h-full flex flex-col' : ''
        }`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-3 border-b border-[#27272a] bg-[#18181b]">
          <div className="flex items-center gap-3">
            {/* URL 바 */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0f0f10] rounded-lg border border-[#27272a]">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-zinc-400 font-mono truncate max-w-[200px]">
                {url.replace(/^https?:\/\//, '')}
              </span>
            </div>

            {/* 디바이스 선택 */}
            <div className="flex items-center gap-1 p-1 bg-[#0f0f10] rounded-lg">
              <button
                onClick={() => setDeviceMode('desktop')}
                className={`p-1.5 rounded transition-colors ${
                  deviceMode === 'desktop'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="데스크톱"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeviceMode('tablet')}
                className={`p-1.5 rounded transition-colors ${
                  deviceMode === 'tablet'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="태블릿"
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeviceMode('mobile')}
                className={`p-1.5 rounded transition-colors ${
                  deviceMode === 'mobile'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="모바일"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="새 탭에서 열기"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
              title={isExpanded ? '축소' : '확대'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 프리뷰 영역 */}
        <div
          className={`relative bg-[#27272a] flex items-center justify-center ${
            isExpanded ? 'flex-1' : 'h-[400px]'
          }`}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#18181b] z-10">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <span className="text-sm text-zinc-400">프리뷰 로딩 중...</span>
              </div>
            </div>
          )}

          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#18181b] z-10">
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <AlertCircle className="w-10 h-10 text-amber-400" />
                <div>
                  <p className="text-sm text-zinc-300 mb-1">프리뷰를 로드할 수 없습니다</p>
                  <p className="text-xs text-zinc-500">
                    일부 사이트는 iframe 임베딩을 차단합니다
                  </p>
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition-colors"
                >
                  새 탭에서 열기
                </a>
              </div>
            </div>
          )}

          <div
            className="relative bg-white overflow-hidden transition-all duration-300 shadow-2xl"
            style={{
              width: isExpanded ? '100%' : `${Math.min(currentDevice.width * 0.4, 512)}px`,
              height: isExpanded ? '100%' : `${Math.min(currentDevice.height * 0.4, 380)}px`,
              borderRadius: isExpanded ? 0 : '8px',
            }}
          >
            <iframe
              key={refreshKey}
              src={url}
              title={`${projectName} 프리뷰`}
              className="w-full h-full border-0"
              style={{
                transform: isExpanded ? 'none' : `scale(${Math.min(512 / currentDevice.width, 380 / currentDevice.height)})`,
                transformOrigin: 'top left',
                width: isExpanded ? '100%' : `${currentDevice.width}px`,
                height: isExpanded ? '100%' : `${currentDevice.height}px`,
              }}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>

          {/* 디바이스 크기 표시 */}
          {!isExpanded && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 rounded text-[10px] text-zinc-400">
              {currentDevice.label} ({currentDevice.width} x {currentDevice.height})
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
