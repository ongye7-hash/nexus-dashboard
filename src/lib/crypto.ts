import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEY_PATH = path.join(process.cwd(), '.nexus-data', 'encryption-key');
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const dir = path.dirname(KEY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(KEY_PATH)) {
    return Buffer.from(fs.readFileSync(KEY_PATH, 'utf-8'), 'hex');
  }

  // Generate new key on first run
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key.toString('hex'), { encoding: 'utf-8', mode: 0o600 });
  return key;
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
