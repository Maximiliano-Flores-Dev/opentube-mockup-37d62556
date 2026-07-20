// Netflix-style local roster of Supabase accounts remembered on this device.
// Stores refresh + access tokens so we can hot-swap sessions via
// supabase.auth.setSession(). Never sent to the server — pure localStorage.

export type SavedAccount = {
  userId: string;
  email: string | null;
  displayName: string;
  channelName: string;
  channelInitials: string;
  channelColor: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  lastUsed: number;
};

const KEY = "opentube:accounts";
const MAX_ACCOUNTS = 6;

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadAccounts(): SavedAccount[] {
  const s = safeStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedAccount[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a.userId === "string" && typeof a.refreshToken === "string")
      .sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));
  } catch {
    return [];
  }
}

function writeAccounts(list: SavedAccount[]) {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  } catch {}
}

export function upsertAccount(account: SavedAccount) {
  const list = loadAccounts().filter((a) => a.userId !== account.userId);
  list.unshift(account);
  writeAccounts(list);
}

export function removeAccount(userId: string) {
  writeAccounts(loadAccounts().filter((a) => a.userId !== userId));
}

export function touchAccount(userId: string) {
  const list = loadAccounts();
  const next = list.map((a) =>
    a.userId === userId ? { ...a, lastUsed: Date.now() } : a,
  );
  writeAccounts(next);
}

/* ---- entered-this-tab gate ---- */
const ENTERED_KEY = "opentube:entered";

export function hasEntered(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(ENTERED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markEntered() {
  try {
    window.sessionStorage.setItem(ENTERED_KEY, "1");
  } catch {}
}

export function clearEntered() {
  try {
    window.sessionStorage.removeItem(ENTERED_KEY);
  } catch {}
}
