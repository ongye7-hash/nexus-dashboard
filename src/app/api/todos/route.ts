import { NextResponse } from 'next/server';
import { getProjectTodos, addProjectTodo, toggleTodo, deleteTodo, getAllTodosCount } from '@/lib/database';
import { validateProjectPath } from '@/lib/path-validator';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (projectPath) {
    const validation = validateProjectPath(projectPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const todos = getProjectTodos(validation.sanitizedPath!);
    return NextResponse.json({ todos });
  }

  // No path = get summary counts
  const counts = getAllTodosCount();
  return NextResponse.json(counts);
}

export async function POST(request: Request) {
  try {
    const { action, projectPath, content, priority, todoId } = await request.json();

    switch (action) {
      case 'add': {
        if (!projectPath || !content) {
          return NextResponse.json({ error: 'projectPath and content required' }, { status: 400 });
        }
        const todo = addProjectTodo(projectPath, content, priority || 'medium');
        return NextResponse.json({ success: true, todo });
      }
      case 'toggle': {
        if (!todoId) return NextResponse.json({ error: 'todoId required' }, { status: 400 });
        toggleTodo(todoId);
        return NextResponse.json({ success: true });
      }
      case 'delete': {
        if (!todoId) return NextResponse.json({ error: 'todoId required' }, { status: 400 });
        deleteTodo(todoId);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process todo' }, { status: 500 });
  }
}
