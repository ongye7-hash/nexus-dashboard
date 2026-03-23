import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ProjectGroup } from '@/lib/types';

const DESKTOP_PATH = 'C:\\Users\\user\\Desktop';
const GROUPS_FILE = path.join(DESKTOP_PATH, 'nexus-dashboard', '.nexus-groups.json');

function loadGroups(): ProjectGroup[] {
  try {
    if (fs.existsSync(GROUPS_FILE)) {
      return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveGroups(groups: ProjectGroup[]) {
  try {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
  } catch (e) {
    console.error('Failed to save groups:', e);
  }
}

export async function GET() {
  try {
    const groups = loadGroups();
    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Failed to load groups:', error);
    return NextResponse.json(
      { error: 'Failed to load groups' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, group, groupId } = body;

    const groups = loadGroups();

    switch (action) {
      case 'create': {
        const newGroup: ProjectGroup = {
          id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: group.name,
          color: group.color,
          icon: group.icon,
          order: groups.length,
        };
        groups.push(newGroup);
        saveGroups(groups);
        return NextResponse.json({ success: true, group: newGroup });
      }

      case 'update': {
        const index = groups.findIndex((g) => g.id === groupId);
        if (index !== -1) {
          groups[index] = { ...groups[index], ...group };
          saveGroups(groups);
          return NextResponse.json({ success: true, group: groups[index] });
        }
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }

      case 'delete': {
        const filtered = groups.filter((g) => g.id !== groupId);
        saveGroups(filtered);
        return NextResponse.json({ success: true });
      }

      case 'reorder': {
        const { orderedIds } = body;
        const reordered = orderedIds.map((id: string, index: number) => {
          const g = groups.find((gr) => gr.id === id);
          if (g) return { ...g, order: index };
          return null;
        }).filter(Boolean);
        saveGroups(reordered);
        return NextResponse.json({ success: true, groups: reordered });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to manage groups' },
      { status: 500 }
    );
  }
}
