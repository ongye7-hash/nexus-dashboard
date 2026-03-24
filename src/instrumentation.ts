export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { createServer } = await import('./lib/terminal-server');
      createServer();
      console.log('Terminal WebSocket server initialized on port 8508');
    } catch (error) {
      console.error('Failed to start terminal server:', error);
    }
  }
}
