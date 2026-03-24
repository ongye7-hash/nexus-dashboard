'use client';

import { useState, useEffect, useCallback } from 'react';

// Konami Code: ↑↑↓↓←→←→BA
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

// sudo sandwich
const SUDO_SANDWICH = ['s', 'u', 'd', 'o', ' ', 'm', 'a', 'k', 'e', ' ', 'm', 'e', ' ', 'a', ' ', 's', 'a', 'n', 'd', 'w', 'i', 'c', 'h'];

// /coffee 명령어
const COFFEE_COMMAND = ['/', 'c', 'o', 'f', 'f', 'e', 'e'];

// Matrix mode
const MATRIX_CODE = ['m', 'a', 't', 'r', 'i', 'x'];

// Party mode
const PARTY_CODE = ['p', 'a', 'r', 't', 'y'];

interface EasterEggState {
  konamiActivated: boolean;
  sudoSandwich: boolean;
  coffeeMode: boolean;
  matrixMode: boolean;
  partyMode: boolean;
}

export function useEasterEggs() {
  const [state, setState] = useState<EasterEggState>({
    konamiActivated: false,
    sudoSandwich: false,
    coffeeMode: false,
    matrixMode: false,
    partyMode: false,
  });

  const [keySequence, setKeySequence] = useState<string[]>([]);

  const resetAll = useCallback(() => {
    setState({
      konamiActivated: false,
      sudoSandwich: false,
      coffeeMode: false,
      matrixMode: false,
      partyMode: false,
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에서는 무시
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key;
      const newSequence = [...keySequence, key].slice(-30); // 최근 30개 키 기억
      setKeySequence(newSequence);

      // Konami Code 체크
      const konamiMatch = newSequence.slice(-KONAMI_CODE.length).join(',') === KONAMI_CODE.join(',');
      if (konamiMatch && !state.konamiActivated) {
        setState(prev => ({ ...prev, konamiActivated: true }));
        console.log('🎮 Konami Code Activated! +30 lives');
        setTimeout(() => setState(prev => ({ ...prev, konamiActivated: false })), 5000);
      }

      // Matrix mode
      const matrixMatch = newSequence.slice(-MATRIX_CODE.length).join('') === MATRIX_CODE.join('');
      if (matrixMatch && !state.matrixMode) {
        setState(prev => ({ ...prev, matrixMode: true }));
        console.log('🟢 Matrix Mode Activated!');
        setTimeout(() => setState(prev => ({ ...prev, matrixMode: false })), 10000);
      }

      // Party mode
      const partyMatch = newSequence.slice(-PARTY_CODE.length).join('') === PARTY_CODE.join('');
      if (partyMatch && !state.partyMode) {
        setState(prev => ({ ...prev, partyMode: true }));
        console.log('🎉 Party Mode Activated!');
        setTimeout(() => setState(prev => ({ ...prev, partyMode: false })), 10000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keySequence, state]);

  // 커맨드 팔레트에서 호출할 수 있는 함수들
  const activateSudoSandwich = useCallback(() => {
    setState(prev => ({ ...prev, sudoSandwich: true }));
    setTimeout(() => setState(prev => ({ ...prev, sudoSandwich: false })), 5000);
  }, []);

  const activateCoffee = useCallback(() => {
    setState(prev => ({ ...prev, coffeeMode: true }));
    setTimeout(() => setState(prev => ({ ...prev, coffeeMode: false })), 5000);
  }, []);

  return {
    ...state,
    activateSudoSandwich,
    activateCoffee,
    resetAll,
  };
}
