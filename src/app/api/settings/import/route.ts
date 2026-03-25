import { NextResponse } from 'next/server';
import { setSetting, saveVPSServer, saveGroup } from '@/lib/database';

export async function POST(request: Request) {
  try {
    const data = await request.json();

    if (!data || data.version !== 1) {
      return NextResponse.json({ error: '유효하지 않은 설정 파일입니다' }, { status: 400 });
    }

    let restored = 0;

    // Settings (허용된 키만 복원)
    const ALLOWED_KEYS = new Set(['scan_paths', 'notifications_enabled', 'last_heatmap_import']);
    if (data.settings) {
      for (const [key, value] of Object.entries(data.settings)) {
        if (ALLOWED_KEYS.has(key) && value !== null && typeof value === 'string') {
          setSetting(key, value);
          restored++;
        }
      }
    }
    // 토큰/키는 import에서 복원하지 않음 — 보안상 재입력 필요

    // VPS servers
    if (data.vps_servers && Array.isArray(data.vps_servers)) {
      for (const server of data.vps_servers) {
        if (server.id && server.name && server.host && server.username) {
          saveVPSServer({
            id: server.id,
            name: server.name,
            host: server.host,
            port: server.port || 22,
            username: server.username,
            auth_type: server.auth_type || 'password',
            encrypted_credential: server.encrypted_credential || null,
            host_key: server.host_key || null,
            default_cwd: server.default_cwd || '/home',
            tags: server.tags || null,
            last_connected_at: null,
          });
          restored++;
        }
      }
    }

    // Groups
    if (data.groups && Array.isArray(data.groups)) {
      for (const group of data.groups) {
        if (group.id && group.name && group.color) {
          saveGroup(group);
          restored++;
        }
      }
    }

    return NextResponse.json({ success: true, restored });
  } catch (error) {
    console.warn('Settings import failed:', error);
    return NextResponse.json({ error: '설정 가져오기 실패' }, { status: 500 });
  }
}
