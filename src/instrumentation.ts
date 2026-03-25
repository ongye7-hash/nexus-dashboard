export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Auth: JWT secret을 process.env에 로드 (middleware Edge Runtime용)
    try {
      const { loadJwtSecret } = await import('./lib/auth');
      loadJwtSecret();
      console.log('[Auth] JWT secret loaded');
    } catch (error) {
      console.error('Failed to load JWT secret:', error);
    }

    // File logging
    try {
      const { setupFileLogging } = await import('./lib/logger');
      setupFileLogging();
    } catch (error) {
      console.error('Failed to setup file logging:', error);
    }

    // DB backup
    try {
      const { startBackupSchedule } = await import('./lib/backup');
      startBackupSchedule();
    } catch (error) {
      console.error('Failed to start backup schedule:', error);
    }

    // Terminal server (existing)
    try {
      const { createServer } = await import('./lib/terminal-server');
      createServer();
      console.log('Terminal WebSocket server initialized on port 8508');
    } catch (error) {
      console.error('Failed to start terminal server:', error);
    }
  }
}
