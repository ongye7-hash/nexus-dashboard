import { describe, it, expect } from 'vitest';

// Helper to create a mock Request
function mockRequest(body: any, method = 'POST'): Request {
  return new Request('http://localhost:8507/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('API Error Handling', () => {

  // /api/actions
  describe('POST /api/actions', () => {
    it('should return 400 when path is missing', async () => {
      const { POST } = await import('../src/app/api/actions/route');
      const res = await POST(mockRequest({ action: 'openFolder' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 when action is missing but path is invalid', async () => {
      const { POST } = await import('../src/app/api/actions/route');
      const res = await POST(mockRequest({ path: 'C:\\nonexistent\\fakepath' }));
      // validateProjectPath will reject non-existent or outside-Desktop paths
      expect(res.status).toBe(400);
    });
  });

  // /api/git
  describe('POST /api/git', () => {
    it('should return 400 for empty path', async () => {
      const { POST } = await import('../src/app/api/git/route');
      const res = await POST(mockRequest({ action: 'commit', path: '', message: 'test' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing path', async () => {
      const { POST } = await import('../src/app/api/git/route');
      const res = await POST(mockRequest({ action: 'commit', message: 'test' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid action', async () => {
      const { POST } = await import('../src/app/api/git/route');
      // Even with a bad path, validateProjectPath fails first with 400
      const res = await POST(mockRequest({ action: 'invalid', path: '' }));
      expect(res.status).toBe(400);
    });
  });

  // /api/todos
  describe('POST /api/todos', () => {
    it('should return 400 for add without content', async () => {
      const { POST } = await import('../src/app/api/todos/route');
      const res = await POST(mockRequest({ action: 'add', projectPath: '/test' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for add without projectPath', async () => {
      const { POST } = await import('../src/app/api/todos/route');
      const res = await POST(mockRequest({ action: 'add', content: 'test todo' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for toggle without todoId', async () => {
      const { POST } = await import('../src/app/api/todos/route');
      const res = await POST(mockRequest({ action: 'toggle' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for delete without todoId', async () => {
      const { POST } = await import('../src/app/api/todos/route');
      const res = await POST(mockRequest({ action: 'delete' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid action', async () => {
      const { POST } = await import('../src/app/api/todos/route');
      const res = await POST(mockRequest({ action: 'invalid' }));
      expect(res.status).toBe(400);
    });
  });

  // /api/vps
  describe('POST /api/vps', () => {
    it('should return 400 for add without name', async () => {
      const { POST } = await import('../src/app/api/vps/route');
      const res = await POST(mockRequest({ action: 'add', host: 'test', username: 'root' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for add without host', async () => {
      const { POST } = await import('../src/app/api/vps/route');
      const res = await POST(mockRequest({ action: 'add', name: 'test', username: 'root' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for add without username', async () => {
      const { POST } = await import('../src/app/api/vps/route');
      const res = await POST(mockRequest({ action: 'add', name: 'test', host: 'test' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for delete without id', async () => {
      const { POST } = await import('../src/app/api/vps/route');
      const res = await POST(mockRequest({ action: 'delete' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for unknown action', async () => {
      const { POST } = await import('../src/app/api/vps/route');
      const res = await POST(mockRequest({ action: 'nonexistent' }));
      expect(res.status).toBe(400);
    });
  });

  // /api/vps/deploy
  describe('POST /api/vps/deploy', () => {
    it('should return 400 for missing serverId', async () => {
      const { POST } = await import('../src/app/api/vps/deploy/route');
      const res = await POST(mockRequest({ remotePath: '/home', commands: ['git pull'] }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing remotePath', async () => {
      const { POST } = await import('../src/app/api/vps/deploy/route');
      const res = await POST(mockRequest({ serverId: 'test', commands: ['git pull'] }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing commands', async () => {
      const { POST } = await import('../src/app/api/vps/deploy/route');
      const res = await POST(mockRequest({ serverId: 'test', remotePath: '/home' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for empty commands array', async () => {
      const { POST } = await import('../src/app/api/vps/deploy/route');
      const res = await POST(mockRequest({ serverId: 'test', remotePath: '/home', commands: [] }));
      expect(res.status).toBe(400);
    });

    it('should return 403 for disallowed command', async () => {
      const { POST } = await import('../src/app/api/vps/deploy/route');
      const res = await POST(mockRequest({ serverId: 'test', remotePath: '/home', commands: ['rm -rf /'] }));
      expect(res.status).toBe(403);
    });

    it('should return 403 for command with shell metacharacters', async () => {
      const { POST } = await import('../src/app/api/vps/deploy/route');
      const res = await POST(mockRequest({ serverId: 'test', remotePath: '/home', commands: ['git pull && rm -rf /'] }));
      expect(res.status).toBe(403);
    });

    it('should return 400 for path traversal in remotePath', async () => {
      const { POST } = await import('../src/app/api/vps/deploy/route');
      const res = await POST(mockRequest({ serverId: 'test', remotePath: '../etc', commands: ['git pull'] }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for remotePath not starting with /', async () => {
      const { POST } = await import('../src/app/api/vps/deploy/route');
      const res = await POST(mockRequest({ serverId: 'test', remotePath: 'home/user', commands: ['git pull'] }));
      expect(res.status).toBe(400);
    });
  });

  // /api/github/auth
  describe('POST /api/github/auth', () => {
    it('should return 400 for save without token', async () => {
      const { POST } = await import('../src/app/api/github/auth/route');
      const res = await POST(mockRequest({ action: 'save' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid action', async () => {
      const { POST } = await import('../src/app/api/github/auth/route');
      const res = await POST(mockRequest({ action: 'nonexistent' }));
      expect(res.status).toBe(400);
    });
  });

  // /api/ai
  describe('POST /api/ai', () => {
    it('should return 400 for saveApiKey without key', async () => {
      const { POST } = await import('../src/app/api/ai/route');
      const res = await POST(mockRequest({ action: 'saveApiKey' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for saveReview without content', async () => {
      const { POST } = await import('../src/app/api/ai/route');
      const res = await POST(mockRequest({ action: 'saveReview' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 or 401 for unknown action (no API key)', async () => {
      const { POST } = await import('../src/app/api/ai/route');
      const res = await POST(mockRequest({ action: 'nonexistent' }));
      // Without API key configured, returns 401; with key, returns 400
      expect([400, 401]).toContain(res.status);
    });
  });

  // /api/stats
  describe('POST /api/stats', () => {
    it('should return 400 for invalid type', async () => {
      const { POST } = await import('../src/app/api/stats/route');
      const res = await POST(mockRequest({ action: 'record', type: 'invalid_type' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing type', async () => {
      const { POST } = await import('../src/app/api/stats/route');
      const res = await POST(mockRequest({ action: 'record' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid action', async () => {
      const { POST } = await import('../src/app/api/stats/route');
      const res = await POST(mockRequest({ action: 'nonexistent' }));
      expect(res.status).toBe(400);
    });

    it('should return 200 for valid record action', async () => {
      const { POST } = await import('../src/app/api/stats/route');
      const res = await POST(mockRequest({ action: 'record', type: 'project_open' }));
      expect(res.status).toBe(200);
    });
  });

  // /api/scan-paths
  describe('POST /api/scan-paths', () => {
    it('should return 400 for add without path', async () => {
      const { POST } = await import('../src/app/api/scan-paths/route');
      const res = await POST(mockRequest({ action: 'add' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for non-existent path', async () => {
      const { POST } = await import('../src/app/api/scan-paths/route');
      const res = await POST(mockRequest({ action: 'add', path: 'Z:\\nonexistent\\path' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for path with traversal', async () => {
      const { POST } = await import('../src/app/api/scan-paths/route');
      const res = await POST(mockRequest({ action: 'add', path: 'C:\\Users\\..\\..\\Windows' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for unknown action', async () => {
      const { POST } = await import('../src/app/api/scan-paths/route');
      const res = await POST(mockRequest({ action: 'nonexistent' }));
      expect(res.status).toBe(400);
    });
  });

  // /api/github/status
  describe('POST /api/github/status', () => {
    it('should return 400 for missing issues array', async () => {
      const { POST } = await import('../src/app/api/github/status/route');
      const res = await POST(mockRequest({ projectPath: 'C:\\test' }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing projectPath', async () => {
      const { POST } = await import('../src/app/api/github/status/route');
      const res = await POST(mockRequest({ issues: [{ number: 1, title: 'test' }] }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for issues not being an array', async () => {
      const { POST } = await import('../src/app/api/github/status/route');
      const res = await POST(mockRequest({ projectPath: 'C:\\test', issues: 'not-array' }));
      expect(res.status).toBe(400);
    });
  });
});
