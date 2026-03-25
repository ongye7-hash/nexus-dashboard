'use client';

import { useState, useEffect, useCallback } from 'react';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
    // 저장된 설정 불러오기
    const stored = localStorage.getItem('nexus_notifications_enabled');
    setEnabled(stored === 'true');
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
      setPermission('granted');
      return true;
    }
    if (Notification.permission === 'denied') {
      setPermission('denied');
      return false;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  const toggle = useCallback((value: boolean) => {
    setEnabled(value);
    localStorage.setItem('nexus_notifications_enabled', String(value));
  }, []);

  const sendNotification = useCallback((title: string, body?: string, options?: NotificationOptions) => {
    if (!enabled) return null;
    if (typeof window === 'undefined' || !('Notification' in window)) return null;
    if (Notification.permission !== 'granted') return null;

    try {
      return new Notification(title, {
        body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        ...options,
      });
    } catch (err) {
      console.warn('알림 생성 실패:', err);
      return null;
    }
  }, [enabled]);

  return { permission, enabled, requestPermission, toggle, sendNotification };
}
