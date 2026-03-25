import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), '.nexus-data', 'nexus.db');
const BACKUP_DIR = path.join(process.cwd(), '.nexus-data', 'backups');
const MAX_BACKUPS = 7;

export function runBackup(): string | null {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const backupPath = path.join(BACKUP_DIR, `nexus-${date}.db`);

    // Skip if today's backup already exists
    if (fs.existsSync(backupPath)) return backupPath;

    // Copy the DB file (SQLite WAL mode safe with file copy when no writes)
    fs.copyFileSync(DB_PATH, backupPath);

    // Clean old backups (keep last MAX_BACKUPS)
    cleanOldBackups();

    console.log(`[Backup] DB 백업 완료: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.warn('[Backup] DB 백업 실패:', error);
    return null;
  }
}

function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('nexus-') && f.endsWith('.db'))
      .sort()
      .reverse();

    // Delete files beyond MAX_BACKUPS
    for (let i = MAX_BACKUPS; i < files.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
      console.log(`[Backup] 오래된 백업 삭제: ${files[i]}`);
    }
  } catch (error) {
    console.warn('[Backup] 백업 정리 실패:', error);
  }
}

// Start daily backup timer
export function startBackupSchedule() {
  // Run backup now
  runBackup();

  // Schedule daily (every 24 hours)
  setInterval(() => {
    runBackup();
  }, 24 * 60 * 60 * 1000);
}
