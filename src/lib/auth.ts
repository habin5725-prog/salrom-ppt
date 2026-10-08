/** Convenience gates only. These client-visible values do not provide real security. */
const EDITOR_PASSWORD = '153'
const ADMIN_PASSWORD = '1221'
const EDITOR_KEY = 'salrom-editor-unlocked'
const ADMIN_KEY = 'salrom-admin-unlocked'

let memoryEditor = false
let memoryAdmin = false

function read(key: string): boolean {
  try { return sessionStorage.getItem(key) === '1' }
  catch { return key === EDITOR_KEY ? memoryEditor : memoryAdmin }
}

function write(key: string, value: boolean): void {
  if (key === EDITOR_KEY) memoryEditor = value
  else memoryAdmin = value
  try {
    if (value) sessionStorage.setItem(key, '1')
    else sessionStorage.removeItem(key)
  } catch { /* memory fallback for restricted browsing modes */ }
}

export function verifyEditorPassword(password: string): boolean {
  return password.trim() === EDITOR_PASSWORD
}

export function verifyAdminPassword(password: string): boolean {
  return password.trim() === ADMIN_PASSWORD
}

export function isEditorAuthenticated(): boolean {
  return read(EDITOR_KEY)
}

export function isAdminAuthenticated(): boolean {
  return isEditorAuthenticated() && read(ADMIN_KEY)
}

export function unlockEditor(password: string): boolean {
  if (!verifyEditorPassword(password)) return false
  write(EDITOR_KEY, true)
  return true
}

export function unlockAdmin(password: string): boolean {
  if (!isEditorAuthenticated() || !verifyAdminPassword(password)) return false
  write(ADMIN_KEY, true)
  return true
}

export function lockAdmin(): void {
  write(ADMIN_KEY, false)
}

export function lockEditor(): void {
  lockAdmin()
  write(EDITOR_KEY, false)
}
