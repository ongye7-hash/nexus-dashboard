import { NextResponse } from 'next/server';
import { getSetting, getAllVPSServers, getAllGroups } from '@/lib/database';

export async function GET() {
  try {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        scan_paths: getSetting('scan_paths') || null,
        notifications_enabled: getSetting('notifications_enabled') || null,
        last_heatmap_import: getSetting('last_heatmap_import') || null,
      },
      // 토큰/키는 보안상 내보내기에서 제외 — 가져오기 후 재입력 필요
      vps_servers: getAllVPSServers().map(s => ({
        ...s,
        encrypted_credential: null, // 자격증명은 내보내지 않음
        host_key: null,
      })),
      groups: getAllGroups(),
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="nexus-settings.json"',
      },
    });
  } catch (error) {
    console.warn('Settings export failed:', error);
    return NextResponse.json({ error: '설정 내보내기 실패' }, { status: 500 });
  }
}
