import { getDb } from './index';

// ============ VPS 서버 ============

export interface VPSServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: string;
  encrypted_credential: string | null;
  host_key: string | null;
  default_cwd: string;
  tags: string | null;
  last_connected_at: string | null;
  created_at: string;
}

export function getAllVPSServers(): VPSServer[] {
  const db = getDb();
  return db.prepare('SELECT * FROM vps_servers ORDER BY last_connected_at DESC NULLS LAST, created_at DESC').all() as VPSServer[];
}

export function getVPSServer(id: string): VPSServer | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM vps_servers WHERE id = ?').get(id) as VPSServer | undefined;
}

export function saveVPSServer(server: Omit<VPSServer, 'created_at'>): void {
  const db = getDb();
  const existing = getVPSServer(server.id);
  if (existing) {
    db.prepare(`
      UPDATE vps_servers SET name=?, host=?, port=?, username=?, auth_type=?, encrypted_credential=?, host_key=?, default_cwd=?, tags=?
      WHERE id=?
    `).run(server.name, server.host, server.port, server.username, server.auth_type, server.encrypted_credential, server.host_key, server.default_cwd, server.tags, server.id);
  } else {
    db.prepare(`
      INSERT INTO vps_servers (id, name, host, port, username, auth_type, encrypted_credential, host_key, default_cwd, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(server.id, server.name, server.host, server.port, server.username, server.auth_type, server.encrypted_credential, server.host_key, server.default_cwd, server.tags);
  }
}

export function deleteVPSServer(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM vps_servers WHERE id = ?').run(id);
}

export function updateVPSLastConnected(id: string): void {
  const db = getDb();
  db.prepare('UPDATE vps_servers SET last_connected_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function saveVPSHostKey(id: string, hostKey: string): void {
  const db = getDb();
  db.prepare('UPDATE vps_servers SET host_key = ? WHERE id = ?').run(hostKey, id);
}
