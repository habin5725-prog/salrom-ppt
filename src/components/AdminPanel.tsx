import { useEffect, useRef, useState } from 'react'
import type { AppData, Song, Week } from '../types'
import { createBackup, createEmptyData, exportDataJson, listResetRecoveries, normalizeTitle, parseImportedData, saveResetRecovery, type ResetRecovery } from '../lib/storage'
import { getGitHubSyncStatus, githubPathsForWeek } from '../lib/githubSync'

interface Props {
  data: AppData
  onChange: (updater: (current: AppData) => AppData) => void
  onOpenWeek: (id: string) => void
  onOpenSong: (id: string) => void
  onNotice: (notice: string) => void
  onError: (error: string) => void
}

type Tab = 'status' | 'songs' | 'weeks' | 'settings' | 'data'

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AdminPanel({ data, onChange, onOpenWeek, onOpenSong, onNotice, onError }: Props) {
  const [tab, setTab] = useState<Tab>('status')
  const [search, setSearch] = useState('')
  const [resetPhrase, setResetPhrase] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetRecoveries, setResetRecoveries] = useState<ResetRecovery[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let active = true
    void listResetRecoveries().then(recoveries => { if (active) setResetRecoveries(recoveries) })
    return () => { active = false }
  }, [])
  const sync = getGitHubSyncStatus()
  const songs = data.songs.filter(song => normalizeTitle(song.title).includes(normalizeTitle(search)))
  const duplicates = Object.values(data.songs.reduce<Record<string, Song[]>>((groups, song) => {
    const key = normalizeTitle(song.title)
    groups[key] = [...(groups[key] ?? []), song]
    return groups
  }, {})).filter(group => group.length > 1)
  const setSetting = <K extends keyof AppData['settings']>(key: K, value: AppData['settings'][K]) => {
    onChange(current => ({ ...current, settings: { ...current.settings, [key]: value } }))
  }
  const backup = () => {
    const created = createBackup(data)
    onChange(current => ({ ...current, backups: [...current.backups, created].slice(-10), lastBackupAt: created.createdAt }))
    download(exportDataJson({ ...data, backups: [...data.backups, created], lastBackupAt: created.createdAt }), `salrom-ppt-backup-${created.createdAt.slice(0, 10)}.json`)
    onNotice('JSON 백업 다운로드를 요청했습니다. 파일이 저장됐는지 확인해 주세요.')
  }
  const restore = async (file?: File) => {
    if (!file) return
    try {
      const imported = parseImportedData(await file.text())
      if (!window.confirm(`현재 데이터 ${data.songs.length}곡, 주간 자료 ${data.weeks.length}개를 백업한 뒤 복원 파일로 바꿀까요?`)) return
      const safetyBackup = createBackup(data)
      onChange(() => ({ ...imported, backups: [...imported.backups, safetyBackup].slice(-10), lastBackupAt: safetyBackup.createdAt }))
      onNotice('복원했습니다. 복원 전 데이터는 앱 내부 백업에 남겼습니다.')
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'JSON 파일 복원에 실패했습니다.') }
    finally { if (inputRef.current) inputRef.current.value = '' }
  }
  const deleteSong = (song: Song) => {
    if (!window.confirm(`찬양 ‘${song.title}’을(를) 보관함에서 삭제할까요? 과거 주간 자료의 슬라이드는 유지됩니다.`)) return
    onChange(current => {
      const safetyBackup = createBackup(current)
      return { ...current, songs: current.songs.filter(entry => entry.id !== song.id), backups: [...current.backups, safetyBackup].slice(-10), lastBackupAt: safetyBackup.createdAt }
    })
    onNotice('찬양을 삭제했습니다. 삭제 전 자료는 최근 앱 내부 백업에서 복원할 수 있습니다.')
  }
  const deleteWeek = (week: Week) => {
    if (!window.confirm(`주간 자료 ‘${week.date} ${week.name}’을(를) 삭제할까요?`)) return
    onChange(current => {
      const safetyBackup = createBackup(current)
      return { ...current, weeks: current.weeks.filter(entry => entry.id !== week.id), backups: [...current.backups, safetyBackup].slice(-10), lastBackupAt: safetyBackup.createdAt }
    })
    onNotice('주간 자료를 삭제했습니다. 삭제 전 자료는 최근 앱 내부 백업에서 복원할 수 있습니다.')
  }
  const cloneWeek = (week: Week) => {
    const now = new Date().toISOString()
    const created: Week = { ...structuredClone(week), id: crypto.randomUUID(), name: `${week.name} 복사본`, createdAt: now, updatedAt: now, exportedAt: undefined,
      items: week.items.map(item => ({ ...item, id: crypto.randomUUID(), slides: item.slides.map(slide => ({ ...slide, id: crypto.randomUUID() })), sourceMode: 'copy' })) }
    onChange(current => ({ ...current, weeks: [...current.weeks, created] }))
    onNotice('지난 PPT를 복제했습니다.')
  }
  const reset = async () => {
    if (resetBusy || resetPhrase !== '전체 삭제') return
    if (!window.confirm(`찬양 ${data.songs.length}곡과 주간 자료 ${data.weeks.length}개를 초기화할까요? 초기화 전 복구본을 이 브라우저에 저장합니다.`)) return
    setResetBusy(true)
    try {
      // This durable snapshot must commit before the app state is cleared.
      const recovery = await saveResetRecovery(data)
      setResetRecoveries(current => [recovery, ...current])
      onChange(() => createEmptyData())
      setResetOpen(false)
      setResetPhrase('')
      try {
        download(exportDataJson(data), `salrom-ppt-before-reset-${recovery.createdAt.slice(0, 10)}.json`)
        onNotice('데이터를 초기화했습니다. 복구본은 이 브라우저에 남아 있으며 JSON 다운로드도 요청했습니다.')
      } catch {
        onNotice('데이터를 초기화했습니다. 초기화 전 자료는 아래 복구 백업에 남아 있습니다.')
      }
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '복구 백업에 실패해 데이터를 초기화하지 않았습니다.')
    } finally {
      setResetBusy(false)
    }
  }
  const restoreResetRecovery = (recovery: ResetRecovery) => {
    if (!window.confirm(`${new Date(recovery.createdAt).toLocaleString('ko-KR')}의 초기화 전 자료로 복원할까요? 현재 자료도 앱 내부 백업에 보관합니다.`)) return
    const safetyBackup = createBackup(data)
    onChange(() => ({ ...structuredClone(recovery.data), backups: [...recovery.data.backups, safetyBackup].slice(-10), lastBackupAt: safetyBackup.createdAt }))
    onNotice('초기화 전 자료를 복원했습니다.')
  }

  return <section className="admin-view">
    <div className="page-heading"><div><span className="eyebrow">ADMIN</span><h1>관리자 모드</h1><p>찬양, 주간 자료, 기본 설정과 백업을 관리합니다.</p></div><span className="admin-version">SALROM PPT v1.0.0</span></div>
    <div className="admin-tabs" role="tablist" aria-label="관리자 메뉴">
      {([['status','상태'],['songs','찬양'],['weeks','주간 PPT'],['settings','기본 설정'],['data','백업과 복원']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {tab === 'status' && <div className="admin-content"><div className="admin-stat-grid"><div><small>보관된 찬양</small><strong>{data.songs.length}</strong><span>곡</span></div><div><small>주간 PPT</small><strong>{data.weeks.length}</strong><span>개</span></div><div><small>로컬 저장</small><strong>IndexedDB</strong><span>이 브라우저</span></div></div><div className="admin-panel"><h2>저장소 및 배포</h2><dl><div><dt>마지막 백업</dt><dd>{data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString('ko-KR') : '없음'}</dd></div><div><dt>GitHub 동기화</dt><dd>{sync.available ? '연결됨' : '연결되지 않음'}</dd></div><div><dt>마지막 동기화</dt><dd>{sync.lastSyncedAt ?? '없음'}</dd></div><div><dt>동기화 오류</dt><dd>{sync.lastError ?? '없음'}</dd></div><div><dt>배포 방식</dt><dd>GitHub Pages 정적 사이트</dd></div></dl><p className="helper-text">{sync.message}</p></div><div className="admin-panel"><h2>기본 슬라이드 스타일</h2><p>16:9 · 검정 배경 · 흰 글씨 · Paperlogy · 중앙 정렬</p><p className="helper-text">PPTX를 송출할 예배용 PC에는 Paperlogy 설치가 필요합니다.</p></div></div>}
    {tab === 'songs' && <div className="admin-content"><div className="search-row"><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="찬양 검색" aria-label="관리자 찬양 검색" /><span>{songs.length}곡</span></div>{duplicates.length > 0 && <div className="admin-panel"><h2>중복 제목 후보</h2>{duplicates.map(group => <p key={group[0].normalizedTitle}>{group.map(song => song.title).join(' · ')} <span className="muted">({group.length}곡)</span></p>)}<p className="helper-text">각 곡의 내용을 확인한 뒤 아래 목록에서 불필요한 곡을 삭제하세요.</p></div>}<div className="admin-list">{songs.map(song => <div className="admin-list-row" key={song.id}><div><strong>{song.title}</strong><small>버전 {song.version} · {song.slides.length}장 · 수정 {new Date(song.updatedAt).toLocaleDateString('ko-KR')}</small></div><div className="button-row"><button className="button button--small button--outline" onClick={() => onOpenSong(song.id)}>가사 수정</button><button className="button button--small button--quiet" onClick={() => { const title = window.prompt('곡 제목', song.title); if (title?.trim()) onChange(current => ({ ...current, songs: current.songs.map(entry => entry.id === song.id ? { ...entry, title: title.trim(), normalizedTitle: normalizeTitle(title), updatedAt: new Date().toISOString(), version: entry.version + 1 } : entry) })) }}>이름 변경</button><button className="button button--small button--danger" onClick={() => deleteSong(song)}>삭제</button></div></div>)}{songs.length === 0 && <p className="empty-list">찬양이 없습니다.</p>}</div></div>}
    {tab === 'weeks' && <div className="admin-content"><div className="admin-list">{[...data.weeks].sort((a,b) => b.date.localeCompare(a.date)).map(week => <div className="admin-list-row" key={week.id}><div><strong>{week.date} · {week.name}</strong><small>{week.items.length}곡 · {week.items.reduce((count,item) => count + item.slides.length, 0)}장 · {githubPathsForWeek(week).json}</small></div><div className="button-row"><button className="button button--small button--outline" onClick={() => onOpenWeek(week.id)}>수정</button><button className="button button--small button--quiet" onClick={() => cloneWeek(week)}>복제</button><button className="button button--small button--danger" onClick={() => deleteWeek(week)}>삭제</button></div></div>)}{data.weeks.length === 0 && <p className="empty-list">주간 PPT가 없습니다.</p>}</div></div>}
    {tab === 'settings' && <div className="admin-content"><div className="admin-panel settings-panel"><h2>PPT 기본 설정</h2><div className="setting-row"><label htmlFor="font-size">기본 글자 크기</label><input id="font-size" type="number" min="18" max="80" value={data.settings.fontSize} onChange={event => setSetting('fontSize', Math.max(data.settings.minFontSize, Number(event.target.value)))} /><span>pt</span></div><div className="setting-row"><label htmlFor="min-size">최소 글자 크기</label><input id="min-size" type="number" min="12" max={data.settings.fontSize} value={data.settings.minFontSize} onChange={event => setSetting('minFontSize', Number(event.target.value))} /><span>pt</span></div><div className="setting-row"><label htmlFor="max-lines">슬라이드 기본 최대 줄 수</label><input id="max-lines" type="number" min="1" max="6" value={data.settings.maxLines} onChange={event => setSetting('maxLines', Number(event.target.value))} /><span>줄</span></div><div className="setting-row"><label htmlFor="safe-margin">안전 여백</label><input id="safe-margin" type="number" min="2" max="30" value={Math.round(data.settings.safeMargin * 100)} onChange={event => setSetting('safeMargin', Number(event.target.value) / 100)} /><span>%</span></div><label className="checkbox-row"><input type="checkbox" checked={data.settings.titleSlides} onChange={event => setSetting('titleSlides', event.target.checked)} /> 곡 제목 슬라이드 기본 사용</label><h2>예배 화면</h2><label className="checkbox-row"><input type="checkbox" checked={data.settings.showCounter} onChange={event => setSetting('showCounter', event.target.checked)} /> 페이지 번호 표시</label><label className="checkbox-row"><input type="checkbox" checked={data.settings.clickToAdvance} onChange={event => setSetting('clickToAdvance', event.target.checked)} /> 화면 클릭 시 다음 장으로 이동</label><p className="helper-text">기본 색상과 글꼴은 검정 · 흰색 · Paperlogy입니다. 예배용 PC에도 글꼴을 설치해 주세요.</p></div></div>}
    {tab === 'data' && <div className="admin-content"><div className="admin-panel"><h2>전체 데이터 백업</h2><p>찬양, 주간 자료, 설정을 JSON 한 파일로 내려받습니다.</p><button className="button" onClick={backup}>JSON 백업 다운로드</button></div><div className="admin-panel"><h2>JSON 복원</h2><p>복원 전 현재 데이터를 앱 내부 백업에 보관합니다. 별도 JSON 백업도 내려받아 두는 것을 권장합니다.</p><input ref={inputRef} type="file" accept=".json,application/json" aria-label="JSON 백업 파일" onChange={event => void restore(event.target.files?.[0])} /></div><div className="admin-panel"><h2>최근 앱 내부 백업</h2>{data.backups.length ? [...data.backups].reverse().map(backup => <div className="admin-list-row" key={backup.id}><span>{new Date(backup.createdAt).toLocaleString('ko-KR')} · {backup.data.songs.length}곡 · {backup.data.weeks.length}개 주간 자료</span><button className="button button--small button--outline" onClick={() => { if (!window.confirm('현재 데이터를 백업한 뒤 이 시점으로 복원할까요?')) return; const safetyBackup = createBackup(data); onChange(() => ({ ...structuredClone(backup.data), backups: [...data.backups, safetyBackup].slice(-10), lastBackupAt: safetyBackup.createdAt })); onNotice('앱 내부 백업에서 복원했습니다.') }}>이 시점으로 복원</button></div>) : <p className="muted">앱 내부 백업이 없습니다.</p>}</div><div className="admin-panel"><h2>초기화 전 복구 백업</h2><p className="helper-text">초기화 시점의 전체 자료를 이 브라우저에 별도로 보관합니다. 브라우저 저장소를 지우면 복구할 수 없으니 중요한 자료는 JSON 파일로도 보관하세요.</p>{resetRecoveries.length ? resetRecoveries.map(recovery => <div className="admin-list-row" key={recovery.id}><span>{new Date(recovery.createdAt).toLocaleString('ko-KR')} · {recovery.data.songs.length}곡 · {recovery.data.weeks.length}개 주간 자료</span><button className="button button--small button--outline" onClick={() => restoreResetRecovery(recovery)}>이 시점으로 복원</button></div>) : <p className="muted">초기화 복구 백업이 없습니다.</p>}</div><div className="admin-panel admin-panel--danger"><h2>앱 데이터 초기화</h2><p>찬양과 주간 자료를 비우기 전에 이 브라우저에 복구 백업을 저장합니다. JSON 파일 다운로드도 요청합니다.</p>{resetOpen ? <div className="reset-confirm"><label>확인 문구 <strong>전체 삭제</strong> 입력<input autoFocus value={resetPhrase} onChange={event => setResetPhrase(event.target.value)} disabled={resetBusy} /></label><div className="button-row"><button className="button button--outline" disabled={resetBusy} onClick={() => { setResetOpen(false); setResetPhrase('') }}>취소</button><button className="button button--danger" disabled={resetBusy || resetPhrase !== '전체 삭제'} onClick={() => void reset()}>{resetBusy ? '복구본 저장 중…' : '데이터 초기화'}</button></div></div> : <button className="button button--danger" onClick={() => setResetOpen(true)}>초기화 시작</button>}</div></div>}
  </section>
}
