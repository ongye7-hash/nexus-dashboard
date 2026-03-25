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
      // Encrypted credentials are exported as-is (only restorable on same machine with same encryption key)
      github_token: getSetting('github_token') || null,
      claude_api_key: getSetting('claude_api_key') || null,
      vps_servers: getAllVPSServers(),
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
