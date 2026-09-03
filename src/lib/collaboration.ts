import { cacheGet, cacheSet } from "@/lib/cache";

const COLLAB_PREFIX = "collab:";

export type OnlineAdmin = {
  id: string;
  name: string;
  email: string;
  lastActive: number;
  currentPage: string;
  isTyping: boolean;
};

export type CollabNote = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  streamId?: string;
  createdAt: number;
  resolved: boolean;
};

export type CollabTask = {
  id: string;
  title: string;
  assignedTo: string;
  createdBy: string;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  createdAt: number;
};

export async function trackAdminPresence(
  adminId: string,
  name: string,
  email: string,
  currentPage: string
): Promise<void> {
  const key = `${COLLAB_PREFIX}presence`;
  const admins = await cacheGet<OnlineAdmin[]>(key) ?? [];
  const idx = admins.findIndex(a => a.id === adminId);
  
  const admin: OnlineAdmin = {
    id: adminId,
    name,
    email,
    lastActive: Date.now(),
    currentPage,
    isTyping: false,
  };

  if (idx >= 0) admins[idx] = admin;
  else admins.push(admin);

  // Remove stale admins (5 minutes)
  const active = admins.filter(a => Date.now() - a.lastActive < 300000);
  await cacheSet(key, active, 60);
}

export async function getOnlineAdmins(): Promise<OnlineAdmin[]> {
  return (await cacheGet<OnlineAdmin[]>(`${COLLAB_PREFIX}presence`)) ?? [];
}

export async function addCollabNote(
  authorId: string,
  authorName: string,
  content: string,
  streamId?: string
): Promise<CollabNote> {
  const note: CollabNote = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    authorId,
    authorName,
    content,
    streamId,
    createdAt: Date.now(),
    resolved: false,
  };

  const notes = await cacheGet<CollabNote[]>(`${COLLAB_PREFIX}notes`) ?? [];
  notes.push(note);
  await cacheSet(`${COLLAB_PREFIX}notes`, notes, 86400);
  return note;
}

export async function resolveCollabNote(noteId: string): Promise<boolean> {
  const notes = await cacheGet<CollabNote[]>(`${COLLAB_PREFIX}notes`) ?? [];
  const idx = notes.findIndex(n => n.id === noteId);
  if (idx < 0) return false;
  notes[idx].resolved = true;
  await cacheSet(`${COLLAB_PREFIX}notes`, notes, 86400);
  return true;
}

export async function getCollabNotes(streamId?: string): Promise<CollabNote[]> {
  const notes = await cacheGet<CollabNote[]>(`${COLLAB_PREFIX}notes`) ?? [];
  if (streamId) return notes.filter(n => n.streamId === streamId && !n.resolved);
  return notes.filter(n => !n.resolved);
}

export async function addCollabTask(
  title: string,
  assignedTo: string,
  createdBy: string,
  priority: CollabTask["priority"] = "medium"
): Promise<CollabTask> {
  const task: CollabTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    assignedTo,
    createdBy,
    status: "pending",
    priority,
    createdAt: Date.now(),
  };

  const tasks = await cacheGet<CollabTask[]>(`${COLLAB_PREFIX}tasks`) ?? [];
  tasks.push(task);
  await cacheSet(`${COLLAB_PREFIX}tasks`, tasks, 86400);
  return task;
}

export async function updateCollabTask(
  taskId: string,
  updates: Partial<CollabTask>
): Promise<boolean> {
  const tasks = await cacheGet<CollabTask[]>(`${COLLAB_PREFIX}tasks`) ?? [];
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx < 0) return false;
  tasks[idx] = { ...tasks[idx], ...updates };
  await cacheSet(`${COLLAB_PREFIX}tasks`, tasks, 86400);
  return true;
}

export async function getCollabTasks(assignedTo?: string): Promise<CollabTask[]> {
  const tasks = await cacheGet<CollabTask[]>(`${COLLAB_PREFIX}tasks`) ?? [];
  if (assignedTo) return tasks.filter(t => t.assignedTo === assignedTo);
  return tasks;
}
