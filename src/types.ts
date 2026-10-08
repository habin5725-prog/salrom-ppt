export type Section = 'Verse' | 'Chorus' | 'Pre-Chorus' | 'Bridge' | 'Ending' | string

export interface Slide {
  id: string
  text: string
  section?: Section
}

export interface Song {
  id: string
  title: string
  normalizedTitle: string
  rawLyrics: string
  slides: Slide[]
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  version: number
}

export interface WeekItem {
  id: string
  type: 'song' | 'general'
  title: string
  songId?: string
  slides: Slide[]
  sourceMode?: 'copy' | 'original'
}

export interface Week {
  id: string
  date: string
  name: string
  items: WeekItem[]
  createdAt: string
  updatedAt: string
  exportedAt?: string
}

export interface Settings {
  fontSize: number
  minFontSize: number
  maxLines: number
  safeMargin: number
  titleSlides: boolean
  showCounter: boolean
  clickToAdvance: boolean
}

export interface Backup {
  id: string
  createdAt: string
  data: {
    songs: Song[]
    weeks: Week[]
    settings: Settings
  }
}

export interface AppData {
  songs: Song[]
  weeks: Week[]
  settings: Settings
  backups: Backup[]
  lastBackupAt?: string
}
