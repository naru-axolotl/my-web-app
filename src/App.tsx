import { useEffect, useRef, useState } from 'react'
import './App.css'

type Subject = { id: string; name: string; custom?: boolean }
type StudyRecord = {
  id: string
  subjectId: string
  subjectName: string
  startedAt: number
  endedAt: number
  durationMs: number
  memo: string
  quantity?: number
  quantityUnit?: string
}
type Mode = 'stopwatch' | 'timer'

const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'japanese', name: '国語' },
  { id: 'math', name: '数学' },
  { id: 'english', name: '英語' },
  { id: 'science', name: '理科' },
  { id: 'social', name: '社会' },
]
const DAY_MS = 24 * 60 * 60 * 1000
const RECORDS_KEY = 'studylog-records-v1'
const SUBJECTS_KEY = 'studylog-subjects-v1'
const WEEKLY_GOAL_KEY = 'studylog-weekly-goal-hours-v1'

function parseStudyData(value: unknown): { subjects: Subject[]; records: StudyRecord[] } | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (data.formatVersion !== 1 || !Array.isArray(data.subjects) || !Array.isArray(data.records)) return null

  const validSubjects = data.subjects.every((item) => {
    if (!item || typeof item !== 'object') return false
    const subject = item as Record<string, unknown>
    return typeof subject.id === 'string' && typeof subject.name === 'string' &&
      (subject.custom === undefined || typeof subject.custom === 'boolean')
  })
  const validRecords = data.records.every((item) => {
    if (!item || typeof item !== 'object') return false
    const record = item as Record<string, unknown>
    return typeof record.id === 'string' && typeof record.subjectId === 'string' &&
      typeof record.subjectName === 'string' && Number.isFinite(record.startedAt) &&
      Number.isFinite(record.endedAt) && Number.isFinite(record.durationMs) &&
      (record.memo === undefined || typeof record.memo === 'string') &&
      (record.quantity === undefined || (Number.isFinite(record.quantity) && Number(record.quantity) > 0)) &&
      (record.quantityUnit === undefined || typeof record.quantityUnit === 'string') &&
      Number(record.endedAt) > Number(record.startedAt) && Number(record.durationMs) > 0
  })

  if (!validSubjects || !validRecords) return null
  return {
    subjects: data.subjects as Subject[],
    records: data.records as StudyRecord[],
  }
}

function loadStored<T,>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatClock(timestamp: number) {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function localDateTimeValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function App() {
  const [subjects, setSubjects] = useState<Subject[]>(() => loadStored(SUBJECTS_KEY, DEFAULT_SUBJECTS))
  const [records, setRecords] = useState<StudyRecord[]>(() => loadStored(RECORDS_KEY, []))
  const [selectedSubjectId, setSelectedSubjectId] = useState(DEFAULT_SUBJECTS[0].id)
  const [mode, setMode] = useState<Mode>('stopwatch')
  const [durationMinutes, setDurationMinutes] = useState(25)
  const [memo, setMemo] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [activeStartedAt, setActiveStartedAt] = useState<number | null>(null)
  const [activeMode, setActiveMode] = useState<Mode>('stopwatch')
  const [now, setNow] = useState(0)
  const [weeklyGoalHours, setWeeklyGoalHours] = useState(() => {
    const savedGoal = loadStored(WEEKLY_GOAL_KEY, 10)
    return Number.isFinite(savedGoal) && savedGoal >= 1 && savedGoal <= 168 ? savedGoal : 10
  })
  const [importMessage, setImportMessage] = useState('')
  const [pastSubjectId, setPastSubjectId] = useState(DEFAULT_SUBJECTS[0].id)
  const [pastStartedAt, setPastStartedAt] = useState(() => localDateTimeValue(new Date()))
  const [pastDurationMinutes, setPastDurationMinutes] = useState('60')
  const [pastQuantity, setPastQuantity] = useState('1')
  const [pastQuantityUnit, setPastQuantityUnit] = useState('ページ')
  const [pastMemo, setPastMemo] = useState('')
  const [pastRecordMessage, setPastRecordMessage] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
  }, [records])

  useEffect(() => {
    localStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects))
  }, [subjects])

  useEffect(() => {
    localStorage.setItem(WEEKLY_GOAL_KEY, JSON.stringify(weeklyGoalHours))
  }, [weeklyGoalHours])

  useEffect(() => {
    if (activeStartedAt === null) return
    const interval = window.setInterval(() => {
      const timestamp = Date.now()
      setNow(timestamp)
      if (activeMode === 'timer' && timestamp - activeStartedAt >= durationMinutes * 60_000) {
        const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId)
        if (selectedSubject) {
          const endedAt = activeStartedAt + durationMinutes * 60_000
          setRecords((current) => [...current, {
            id: crypto.randomUUID(),
            subjectId: selectedSubject.id,
            subjectName: selectedSubject.name,
            startedAt: activeStartedAt,
            endedAt,
            durationMs: endedAt - activeStartedAt,
            memo: memo.trim(),
          }])
        }
        setActiveStartedAt(null)
        setMemo('')
      }
      if (timestamp - activeStartedAt >= DAY_MS) {
        setActiveStartedAt(null)
      }
    }, 250)
    return () => window.clearInterval(interval)
  }, [activeStartedAt, activeMode, durationMinutes, memo, selectedSubjectId, subjects])

  const isRunning = activeStartedAt !== null
  const elapsedMs = isRunning ? Math.min(now - activeStartedAt, DAY_MS) : 0
  const timerMs = durationMinutes * 60_000
  const displayedMs = isRunning && activeMode === 'timer' ? Math.max(0, timerMs - elapsedMs) : elapsedMs
  const todayKey = dateKey(new Date())
  const todayRecords = records.filter((record) => dateKey(new Date(record.startedAt)) === todayKey)
  const rawTodayTotal = todayRecords.reduce((total, record) => total + record.durationMs, 0)
  const todayTotal = rawTodayTotal >= DAY_MS ? rawTodayTotal % DAY_MS : rawTodayTotal
  const currentWeekStart = new Date()
  currentWeekStart.setHours(0, 0, 0, 0)
  currentWeekStart.setDate(currentWeekStart.getDate() - ((currentWeekStart.getDay() + 6) % 7))
  const nextWeekStart = new Date(currentWeekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  const weeklyTotal = records
    .filter((record) => record.startedAt >= currentWeekStart.getTime() && record.startedAt < nextWeekStart.getTime())
    .reduce((total, record) => total + record.durationMs, 0)
  const weeklyGoalMs = weeklyGoalHours * 60 * 60 * 1000
  const weeklyProgress = Math.min(100, (weeklyTotal / weeklyGoalMs) * 100)
  const weeklyGoalReached = weeklyTotal >= weeklyGoalMs
  const lastThreeWeeks = Array.from({ length: 21 }, (_, index) => {
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - (20 - index))
    const key = dateKey(day)
    const total = records
      .filter((record) => dateKey(new Date(record.startedAt)) === key)
      .reduce((sum, record) => sum + record.durationMs, 0)
    return {
      key,
      label: new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(day),
      dateLabel: new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(day),
      total,
    }
  })
  const recordedDays = lastThreeWeeks.filter((day) => day.total > 0)
  const maxRecordedHours = Math.max(...recordedDays.map((day) => day.total / 3_600_000), 0)
  const chartScaleHours = maxRecordedHours <= 2 ? 2
    : maxRecordedHours <= 4 ? 4
      : maxRecordedHours <= 8 ? 8
        : maxRecordedHours <= 12 ? 12
          : Math.ceil(maxRecordedHours / 4) * 4
  const chartScaleMs = chartScaleHours * 60 * 60 * 1000
  const sortedRecords = [...records].sort((left, right) => right.endedAt - left.endedAt)

  function startSession() {
    setActiveMode(mode)
    setNow(Date.now())
    setActiveStartedAt(Date.now())
  }

  function stopAndRecord() {
    if (activeStartedAt === null) return
    const endedAt = Date.now()
    const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId)
    if (selectedSubject && endedAt > activeStartedAt) {
      setRecords((current) => [...current, {
        id: crypto.randomUUID(),
        subjectId: selectedSubject.id,
        subjectName: selectedSubject.name,
        startedAt: activeStartedAt,
        endedAt,
        durationMs: endedAt - activeStartedAt,
        memo: memo.trim(),
      }])
    }
    setActiveStartedAt(null)
    setMemo('')
  }

  function deleteRecord(recordId: string) {
    const record = records.find((item) => item.id === recordId)
    if (!record || !window.confirm(`${record.subjectName}の学習記録を削除しますか？`)) return
    setRecords((current) => current.filter((item) => item.id !== recordId))
  }

  function addPastRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const subject = subjects.find((item) => item.id === pastSubjectId)
    const durationMinutesValue = Number(pastDurationMinutes)
    const quantityValue = Number(pastQuantity)
    const startedAt = new Date(pastStartedAt).getTime()
    const quantityUnit = pastQuantityUnit.trim()
    if (!subject || !Number.isFinite(startedAt) || durationMinutesValue <= 0 || durationMinutesValue > 1440 || quantityValue <= 0 || !quantityUnit) return

    const durationMs = durationMinutesValue * 60_000
    setRecords((current) => [...current, {
      id: crypto.randomUUID(),
      subjectId: subject.id,
      subjectName: subject.name,
      startedAt,
      endedAt: startedAt + durationMs,
      durationMs,
      memo: pastMemo.trim(),
      quantity: quantityValue,
      quantityUnit,
    }])
    setPastRecordMessage('学習記録を追加しました。')
    setPastMemo('')
  }

  function addSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newSubject.trim()
    if (!name || subjects.some((subject) => subject.name === name)) return
    const subject = { id: crypto.randomUUID(), name, custom: true }
    setSubjects((current) => [...current, subject])
    setSelectedSubjectId(subject.id)
    setNewSubject('')
  }

  function exportData() {
    const exportFile = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      subjects,
      records,
    }
    const blob = new Blob([JSON.stringify(exportFile, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `studylog-${dateKey(new Date())}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const parsed = parseStudyData(JSON.parse(await file.text()))
      if (!parsed) throw new Error('invalid format')

      const newRecordCount = parsed.records.filter((record) => !records.some((current) => current.id === record.id)).length
      setSubjects((current) => {
        const merged = [...current]
        for (const subject of parsed.subjects) {
          if (!merged.some((existing) => existing.id === subject.id || existing.name === subject.name)) merged.push(subject)
        }
        return merged
      })
      setRecords((current) => {
        const ids = new Set(current.map((record) => record.id))
        return [...current, ...parsed.records.filter((record) => !ids.has(record.id))]
      })
      setImportMessage(`JSONを読み込みました。新しい記録 ${newRecordCount} 件を追加しました。`)
    } catch {
      setImportMessage('JSONを読み込めませんでした。StudyLogから書き出したファイルを選択してください。')
    }
    event.target.value = ''
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="StudyLog ホーム">
          <span className="brand-mark"><span /></span>
          <span>study<span className="brand-light">log</span></span>
        </a>
        <div className="topbar-date">
          <span className="live-dot" />
          {new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}
        </div>
        <div className="topbar-actions">
          <input ref={importInputRef} className="file-input" type="file" accept=".json,application/json" onChange={importData} aria-label="読み込むJSONファイル" />
          <button className="import-button" type="button" onClick={() => importInputRef.current?.click()} aria-label="JSONファイルを読み込む">
            <span aria-hidden="true">↑</span> JSONを読み込む
          </button>
          <button className="export-button" type="button" onClick={exportData} aria-label="学習記録をJSONファイルに保存">
            <span className="export-icon" aria-hidden="true">↓</span> JSONを書き出す
          </button>
        </div>
      </header>

      <main id="top" className="dashboard">
        {importMessage && <p className={`import-message ${importMessage.startsWith('JSONを読み込めませんでした') ? 'is-error' : ''}`} role="status">{importMessage}</p>}
        <section className="welcome-row">
          <div>
            <p className="eyebrow">YOUR STUDY, YOUR PACE</p>
            <h1>積み重ねを、<span>見えるかたちに。</span></h1>
          </div>
          <div className="today-summary">
            <span className="summary-label">今日の学習時間</span>
            <strong>{formatDuration(todayTotal)}</strong>
            <span className="summary-sub">{todayRecords.length} セッション</span>
          </div>
        </section>

        <div className="main-grid">
          <section className="timer-panel" aria-label="学習計測">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">FOCUS SESSION</p>
                <h2>学習を記録する</h2>
              </div>
              <span className={`session-status ${isRunning ? 'is-live' : ''}`}>
                <span />{isRunning ? '計測中' : '待機中'}
              </span>
            </div>

            <div className="mode-switch" role="tablist" aria-label="計測方法">
              <button type="button" role="tab" aria-selected={mode === 'stopwatch'} className={mode === 'stopwatch' ? 'selected' : ''} disabled={isRunning} onClick={() => setMode('stopwatch')}>
                <span className="mode-icon stopwatch-icon" />ストップウォッチ
              </button>
              <button type="button" role="tab" aria-selected={mode === 'timer'} className={mode === 'timer' ? 'selected' : ''} disabled={isRunning} onClick={() => setMode('timer')}>
                <span className="mode-icon timer-icon" />タイマー
              </button>
            </div>

            {mode === 'timer' && (
              <label className="duration-control">
                <span>時間を設定</span>
                <span className="duration-input-wrap">
                  <input type="number" min="1" max="1440" value={durationMinutes} disabled={isRunning} onChange={(event) => setDurationMinutes(Math.min(1440, Math.max(1, Number(event.target.value) || 1)))} />
                  <span>分</span>
                </span>
              </label>
            )}

            <div className={`clock-face ${isRunning ? 'clock-running' : ''}`} aria-live="off">
              <span className="clock-caption">{activeMode === 'timer' && isRunning ? 'REMAINING' : 'ELAPSED TIME'}</span>
              <strong>{formatDuration(displayedMs)}</strong>
              <span className="clock-decoration" />
            </div>

            <div className="session-fields">
              <label className="field-label" htmlFor="subject-select">教科</label>
              <select id="subject-select" value={selectedSubjectId} disabled={isRunning} onChange={(event) => setSelectedSubjectId(event.target.value)}>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
              <label className="field-label" htmlFor="study-note">学習メモ <span>任意</span></label>
              <input id="study-note" className="memo-input" type="text" placeholder="例：二次関数の問題演習" value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={100} />
            </div>

            <div className="timer-actions">
              {!isRunning ? (
                <button type="button" className="start-button" onClick={startSession}><span className="play-icon" />計測を開始</button>
              ) : (
                <button type="button" className="stop-button" onClick={stopAndRecord}><span className="stop-icon" />記録して停止</button>
              )}
              <p>{isRunning ? '停止するとここまでの時間を記録します' : '途中で停止した場合も、その時点で記録されます'}</p>
            </div>

            <div className="weekly-goal">
              <div className="weekly-goal-heading">
                <div><p className="eyebrow">THIS WEEK</p><h3>今週の目標勉強時間</h3></div>
                <label className="weekly-goal-input">
                  <input type="number" min="1" max="168" step="0.5" value={weeklyGoalHours} onChange={(event) => setWeeklyGoalHours(Math.min(168, Math.max(1, Number(event.target.value) || 1)))} aria-label="今週の目標勉強時間" />
                  <span>時間</span>
                </label>
              </div>
              <div className="weekly-goal-summary">
                <strong>{formatDuration(weeklyTotal)}</strong>
                <span>{weeklyGoalReached ? '今週の目標を達成しました' : `あと ${formatDuration(weeklyGoalMs - weeklyTotal)} で達成`}</span>
              </div>
              <div className="weekly-progress-track" role="progressbar" aria-label="今週の目標達成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(weeklyProgress)}>
                <span className={weeklyGoalReached ? 'is-complete' : ''} style={{ width: `${weeklyProgress}%` }} />
              </div>
            </div>
          </section>

          <aside className="side-column">
            <section className="manual-panel">
              <div className="section-heading">
                <div><p className="eyebrow">PAST SESSION</p><h2>過去の学習を記録</h2></div>
              </div>
              <form className="manual-form" onSubmit={addPastRecord}>
                <label>教科
                  <select value={pastSubjectId} onChange={(event) => setPastSubjectId(event.target.value)}>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
                <label>開始日時
                  <input type="datetime-local" value={pastStartedAt} onChange={(event) => setPastStartedAt(event.target.value)} required />
                </label>
                <label>学習時間（分）
                  <input type="number" min="1" max="1440" step="1" value={pastDurationMinutes} onChange={(event) => setPastDurationMinutes(event.target.value)} required />
                </label>
                <label>学習した量
                  <span className="quantity-inputs">
                    <input type="number" min="0.01" step="any" value={pastQuantity} onChange={(event) => setPastQuantity(event.target.value)} required aria-label="学習した量" />
                    <input type="text" value={pastQuantityUnit} onChange={(event) => setPastQuantityUnit(event.target.value)} maxLength={12} required aria-label="量の単位" placeholder="ページ、問など" />
                  </span>
                </label>
                <label className="manual-memo-field">学習メモ <span>任意</span>
                  <input type="text" value={pastMemo} onChange={(event) => setPastMemo(event.target.value)} maxLength={100} placeholder="例：二次関数の問題演習" />
                </label>
                <button className="manual-submit" type="submit">過去の学習を追加</button>
              </form>
              {pastRecordMessage && <p className="manual-status" role="status">{pastRecordMessage}</p>}
            </section>

            <section className="subjects-panel">
              <div className="section-heading">
                <div><p className="eyebrow">YOUR SUBJECTS</p><h2>教科</h2></div>
                <span className="subject-count">{subjects.length} 教科</span>
              </div>
              <div className="subject-list">
                {subjects.map((subject, index) => (
                  <div className="subject-row" key={subject.id}>
                    <span className={`subject-swatch swatch-${index % 5}`} />
                    <span>{subject.name}</span>
                    {subject.custom && <span className="custom-label">追加</span>}
                    {subject.custom && <button className="remove-subject" type="button" aria-label={`${subject.name}を削除`} disabled={isRunning} onClick={() => {
                      setSubjects((current) => current.filter((item) => item.id !== subject.id))
                      if (selectedSubjectId === subject.id) setSelectedSubjectId(DEFAULT_SUBJECTS[0].id)
                    }}>×</button>}
                  </div>
                ))}
              </div>
              <form className="add-subject-form" onSubmit={addSubject}>
                <input aria-label="追加する教科名" placeholder="教科を追加" value={newSubject} onChange={(event) => setNewSubject(event.target.value)} maxLength={20} />
                <button type="submit" aria-label="教科を追加" disabled={isRunning || !newSubject.trim()}><span>+</span></button>
              </form>
            </section>

            <section className="recent-panel">
              <div className="section-heading">
                <div><p className="eyebrow">STUDY RECORDS</p><h2>学習記録</h2></div>
                <span className="record-count">{records.length} 件</span>
              </div>
              {sortedRecords.length ? (
                <ul className="record-list" tabIndex={0} aria-label="学習記録一覧">
                  {sortedRecords.map((record) => (
                    <li className="record-row" key={record.id}>
                      <span className="record-dot" />
                      <div className="record-info">
                        <strong>{record.subjectName}</strong>
                        <span>{formatClock(record.startedAt)} – {formatClock(record.endedAt)}{record.quantity !== undefined ? ` ・ ${record.quantity} ${record.quantityUnit ?? ''}` : ''}{record.memo ? ` ・ ${record.memo}` : ''}</span>
                      </div>
                      <b>{formatDuration(record.durationMs).slice(0, 5)}</b>
                      <button className="delete-record" type="button" aria-label={`${record.subjectName}の学習記録を削除`} onClick={() => deleteRecord(record.id)}>×</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="empty-records">学習記録はありません。</p>}
            </section>
          </aside>
        </div>

        <section className="chart-panel">
          <div className="chart-heading">
            <div><p className="eyebrow">LAST 7 DAYS</p><h2>学習の記録</h2></div>
            <div className="chart-legend"><span />学習時間</div>
          </div>
          <div className="chart-area">
            {recordedDays.length > 0 && <div className="chart-guides" aria-hidden="true"><span>{chartScaleHours}h</span><span>{chartScaleHours / 2}h</span><span>0h</span></div>}
            <div className="chart-scroll" role="region" aria-label="直近3週間の学習記録。横にスクロールできます" tabIndex={0}>
              {recordedDays.length > 0 ? (
                <div className="chart-bars">
                  {recordedDays.map((day) => {
                    const height = Math.min(100, (day.total / chartScaleMs) * 100)
                    return <div className="chart-day" key={day.key} title={`${day.key}: ${formatDuration(day.total)}`}>
                      <span className="bar-label"><span>{day.label}</span><span>{day.dateLabel}</span></span>
                      <div className="bar-track"><span className={`bar-fill ${day.key === todayKey ? 'bar-today' : ''}`} style={{ height: `${height}%` }} /></div>
                      <span className="bar-value">{(day.total / 3_600_000).toFixed(day.total >= 3_600_000 ? 0 : 1)}h</span>
                    </div>
                  })}
                </div>
              ) : <p className="chart-empty">直近3週間の学習記録はありません。</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App