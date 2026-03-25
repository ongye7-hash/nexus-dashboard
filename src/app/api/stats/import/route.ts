import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting } from '@/lib/database';
import { getDb } from '@/lib/db/index';

export async function POST() {
  try {
    // Get scan paths
    const raw = getSetting('scan_paths');
    let scanPaths: string[];
    try {
      scanPaths = raw ? JSON.parse(raw) : ['C:\\Users\\user\\Desktop'];
    } catch {
      scanPaths = ['C:\\Users\\user\\Desktop'];
    }

    // Collect commit dates across all projects
    const commitsByDate: Record<string, number> = {};
    let totalProjects = 0;
    let totalCommits = 0;

    for (const scanPath of scanPaths) {
      if (!fs.existsSync(scanPath)) continue;

      let items: string[];
      try {
        items = fs.readdirSync(scanPath);
      } catch {
        continue;
      }

      for (const item of items) {
        const fullPath = path.join(scanPath, item);
        const gitDir = path.join(fullPath, '.git');

        try {
          if (!fs.statSync(fullPath).isDirectory()) continue;
          if (!fs.existsSync(gitDir)) continue;
        } catch {
          continue;
        }

        totalProjects++;

        try {
          const output = execFileSync('git', ['log', '--format=%aI', '--all', '--since=1 year ago'], {
            cwd: fullPath,
            encoding: 'utf-8',
            timeout: 10000,
            windowsHide: true,
          }).toString();

          const dates = output.split('\n').filter(Boolean);
          for (const dateStr of dates) {
            const date = dateStr.split('T')[0]; // YYYY-MM-DD
            if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
              commitsByDate[date] = (commitsByDate[date] || 0) + 1;
              totalCommits++;
            }
          }
        } catch {
          /* git log 실패 — 이 프로젝트 건너뜀 */
        }
      }
    }

    // Upsert into daily_activity
    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO daily_activity (date, total_minutes, project_count, commit_count, file_changes)
      VALUES (?, 0, 0, ?, 0)
      ON CONFLICT(date) DO UPDATE SET
        commit_count = MAX(daily_activity.commit_count, excluded.commit_count)
    `);

    const tx = db.transaction(() => {
      for (const [date, count] of Object.entries(commitsByDate)) {
        upsert.run(date, count);
      }
    });
    tx();

    // Save last import time
    setSetting('last_heatmap_import', new Date().toISOString());

    return NextResponse.json({
      success: true,
      totalProjects,
      totalCommits,
      daysImported: Object.keys(commitsByDate).length,
      lastImport: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Heatmap import failed:', error);
    return NextResponse.json({ error: '히트맵 데이터 가져오기 실패' }, { status: 500 });
  }
}
