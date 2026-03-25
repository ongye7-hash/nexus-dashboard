import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 데이터베이스 파일 경로
const DB_PATH = path.join(process.cwd(), '.nexus-data', 'nexus.db');

// 데이터베이스 디렉토리 생성
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 데이터베이스 연결 (싱글톤)
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeTables();
  }
  return db;
}

// 테이블 초기화
function initializeTables() {
  const database = db!;

  // 프로젝트 메타데이터 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_meta (
      project_path TEXT PRIMARY KEY,
      notes TEXT,
      tags TEXT,
      status TEXT DEFAULT 'development',
      pinned INTEGER DEFAULT 0,
      last_opened TEXT,
      group_id TEXT,
      deploy_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 그룹 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 포트 매핑 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS port_mappings (
      project_path TEXT PRIMARY KEY,
      port INTEGER NOT NULL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 작업 기록 테이블 (나중에 시간 추적용)
  database.exec(`
    CREATE TABLE IF NOT EXISTS work_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_minutes INTEGER
    )
  `);

  // 일일 활동 테이블 (잔디 히트맵용)
  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_activity (
      date TEXT PRIMARY KEY,
      total_minutes INTEGER DEFAULT 0,
      project_count INTEGER DEFAULT 0,
      commit_count INTEGER DEFAULT 0,
      file_changes INTEGER DEFAULT 0
    )
  `);

  // 사용자 통계 테이블 (스트릭, 뱃지용)
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_stats (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 뱃지 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      category TEXT DEFAULT 'general'
    )
  `);

  // 설정 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // GitHub 레포 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS github_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER UNIQUE,
      full_name TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      html_url TEXT NOT NULL,
      default_branch TEXT DEFAULT 'main',
      language TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      updated_at TEXT,
      pushed_at TEXT,
      local_path TEXT,
      synced_at TEXT,
      is_private INTEGER DEFAULT 0
    )
  `);

  // VPS 서버 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS vps_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'password',
      encrypted_credential TEXT,
      host_key TEXT,
      default_cwd TEXT DEFAULT '/home',
      tags TEXT,
      last_connected_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 프로젝트 TODO 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      content TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `);
}
