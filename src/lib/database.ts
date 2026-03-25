// src/lib/database.ts — Re-export barrel file
// 기존 import 경로 호환성 유지를 위한 re-export

export { getDb } from './db/index';

export {
  type ProjectMeta, getProjectMeta, getAllProjectMeta, saveProjectMeta,
  type Group, getAllGroups, saveGroup, deleteGroup,
  type PortMapping, getPortMappings, savePortMapping, clearPortMapping,
} from './db/projects';

export {
  type DailyActivity, getDailyActivity, updateDailyActivity, recordActivity,
  getUserStat, setUserStat, getStreak, updateStreak,
  type Badge, getAllBadges, hasBadge, awardBadge, checkAndAwardBadges,
  getWeeklyReport,
} from './db/stats';

export {
  startWorkSession, endWorkSession, getWorkStats,
  getActiveSession, getAllActiveSessions, getRecentSessions,
} from './db/sessions';

export {
  type ProjectTodo, getProjectTodos, addProjectTodo, toggleTodo, deleteTodo, getAllTodosCount,
} from './db/todos';

export {
  type GitHubRepoRecord, getAllGitHubRepos, getGitHubRepoByFullName, upsertGitHubRepo,
  linkGitHubRepoToLocal, unlinkGitHubRepo, getUnlinkedGitHubRepos,
  getSetting, setSetting, deleteSetting,
} from './db/github';

export {
  type VPSServer, getAllVPSServers, getVPSServer, saveVPSServer,
  deleteVPSServer, updateVPSLastConnected, saveVPSHostKey,
} from './db/vps';

export { cleanupOrphanedRecords } from './db/cleanup';
