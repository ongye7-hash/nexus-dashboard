import { NextResponse } from 'next/server';
import { ProjectGroup } from '@/lib/types';
import { getAllGroups, saveGroup, deleteGroup as dbDeleteGroup } from '@/lib/database';

function loadGroups(): ProjectGroup[] {
  try {
    const groups = getAllGroups();
    return groups.map(g => ({
      id: g.id,
      name: g.name,
      color: g.color,
      icon: g.icon,
      order: g.sort_order,
    }));
  } catch (e) {
    console.error('Failed to load groups:', e);
    return [];
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

    switch (action) {
      case 'create': {
        const newGroup: ProjectGroup = {
          id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: group.name,
          color: group.color,
          icon: group.icon,
          order: loadGroups().length,
        };
        saveGroup({
          id: newGroup.id,
          name: newGroup.name,
          color: newGroup.color,
          icon: newGroup.icon,
          sort_order: newGroup.order,
        });
        return NextResponse.json({ success: true, group: newGroup });
      }

      case 'update': {
        saveGroup({
          id: groupId,
          name: group.name,
          color: group.color,
          icon: group.icon,
          sort_order: group.order,
        });
        return NextResponse.json({ success: true, group: { ...group, id: groupId } });
      }

      case 'delete': {
        dbDeleteGroup(groupId);
        return NextResponse.json({ success: true });
      }

      case 'reorder': {
        const { orderedIds } = body;
        const groups = loadGroups();
        orderedIds.forEach((id: string, index: number) => {
          const g = groups.find((gr) => gr.id === id);
          if (g) {
            saveGroup({
              id: g.id,
              name: g.name,
              color: g.color,
              icon: g.icon,
              sort_order: index,
            });
          }
        });
        return NextResponse.json({ success: true, groups: loadGroups() });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Failed to manage groups:', error);
    return NextResponse.json(
      { error: 'Failed to manage groups' },
      { status: 500 }
    );
  }
}
