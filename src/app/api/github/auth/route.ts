import { NextResponse } from 'next/server';
import { getSetting, setSetting, deleteSetting } from '@/lib/database';
import { encrypt, decrypt } from '@/lib/crypto';

export async function GET() {
  try {
    const encryptedToken = getSetting('github_token');
    if (!encryptedToken) {
      return NextResponse.json({ authenticated: false });
    }
    let token: string;
    try {
      token = decrypt(encryptedToken);
    } catch {
      return NextResponse.json({ authenticated: false, error: 'Token decrypt failed' });
    }

    // Verify token by fetching user info
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Nexus-Dashboard',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ authenticated: false, error: 'Token invalid' });
    }

    const user = await res.json();
    return NextResponse.json({
      authenticated: true,
      user: {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        public_repos: user.public_repos,
        total_private_repos: user.total_private_repos,
      },
    });
  } catch (error) {
    return NextResponse.json({ authenticated: false, error: 'Failed to verify' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, token } = await request.json();

    switch (action) {
      case 'save': {
        if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

        // Verify token first
        const res = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Nexus-Dashboard',
          },
        });

        if (!res.ok) {
          return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
        }

        const user = await res.json();
        setSetting('github_token', encrypt(token));
        setSetting('github_username', user.login);

        return NextResponse.json({
          success: true,
          user: {
            login: user.login,
            name: user.name,
            avatar_url: user.avatar_url,
            public_repos: user.public_repos,
            total_private_repos: user.total_private_repos,
          },
        });
      }
      case 'delete': {
        deleteSetting('github_token');
        deleteSetting('github_username');
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
  }
}
