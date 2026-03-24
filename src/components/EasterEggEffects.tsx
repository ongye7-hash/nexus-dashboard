'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EasterEggEffectsProps {
  konamiActivated: boolean;
  sudoSandwich: boolean;
  coffeeMode: boolean;
  matrixMode: boolean;
  partyMode: boolean;
}

// Matrix 효과를 위한 떨어지는 글자
function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars = 'NEXUSコード01アイウエオカキクケコサシスセソタチツテト'.split('');
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops: number[] = [];

    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100;
    }

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#0f0';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 33);
    return () => clearInterval(interval);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[100]"
      style={{ opacity: 0.7 }}
    />
  );
}

// 파티 모드를 위한 컨페티
function Confetti() {
  const [particles, setParticles] = useState<Array<{
    id: number;
    x: number;
    color: string;
    delay: number;
  }>>([]);

  useEffect(() => {
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'][
        Math.floor(Math.random() * 8)
      ],
      delay: Math.random() * 2,
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: `${p.x}vw`, rotate: 0 }}
          animate={{
            y: '100vh',
            rotate: 360 * 3,
            x: `${p.x + (Math.random() - 0.5) * 20}vw`,
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            delay: p.delay,
            ease: 'linear',
          }}
          className="absolute w-3 h-3"
          style={{ backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}

export default function EasterEggEffects({
  konamiActivated,
  sudoSandwich,
  coffeeMode,
  matrixMode,
  partyMode,
}: EasterEggEffectsProps) {
  return (
    <>
      {/* Konami Code 알림 */}
      <AnimatePresence>
        {konamiActivated && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
          >
            <div className="px-8 py-6 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl shadow-2xl">
              <div className="text-6xl mb-2">🎮</div>
              <div className="text-white font-bold text-xl">KONAMI CODE!</div>
              <div className="text-white/70 text-sm">+30 Lives</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* sudo sandwich */}
      <AnimatePresence>
        {sudoSandwich && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className="px-6 py-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl">
              <div className="flex items-center gap-4">
                <span className="text-5xl">🥪</span>
                <div>
                  <div className="text-white font-mono text-sm">
                    <span className="text-green-400">$</span> sudo make me a sandwich
                  </div>
                  <div className="text-zinc-400 font-mono text-sm mt-1">
                    Okay.
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coffee Mode */}
      <AnimatePresence>
        {coffeeMode && (
          <motion.div
            initial={{ scale: 0, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0, y: 50 }}
            className="fixed bottom-20 right-8 z-[100]"
          >
            <motion.div
              animate={{
                rotate: [0, -5, 5, -5, 0],
              }}
              transition={{
                duration: 0.5,
                repeat: Infinity,
                repeatDelay: 1,
              }}
              className="px-6 py-4 bg-amber-900/90 border border-amber-700 rounded-xl shadow-2xl"
            >
              <div className="text-5xl mb-2">☕</div>
              <div className="text-amber-100 font-bold">커피 타임!</div>
              <div className="text-amber-200/70 text-xs">
                418 I&apos;m a teapot
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Matrix Mode */}
      <AnimatePresence>
        {matrixMode && <MatrixRain />}
      </AnimatePresence>

      {/* Party Mode */}
      <AnimatePresence>
        {partyMode && (
          <>
            <Confetti />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 pointer-events-none z-[99]"
              style={{
                background: 'linear-gradient(45deg, rgba(255,0,0,0.1), rgba(0,255,0,0.1), rgba(0,0,255,0.1))',
                animation: 'partyBg 2s linear infinite',
              }}
            />
            <style jsx global>{`
              @keyframes partyBg {
                0% { filter: hue-rotate(0deg); }
                100% { filter: hue-rotate(360deg); }
              }
            `}</style>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
