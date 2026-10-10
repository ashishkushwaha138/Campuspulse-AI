import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpenCheck, Bot,
  BriefcaseBusiness, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  ClipboardList, Download, FileUp, Filter, FlaskConical, GraduationCap, LayoutDashboard, Menu,
  MessageCircle, MoreHorizontal, Search, Send, Settings, ShieldAlert, Sparkles, Target,
  TrendingUp, Users, X, Zap,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  askAssistant, loadWorkspace, loadTrends, saveIntervention, updateIntervention,
  importCsvFiles, simulate,
} from './api.js'

const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { id: 'students', label: 'Student Directory', icon: Users, badge: true },
  { id: 'risk', label: 'Risk Intelligence', icon: ShieldAlert },
  { id: 'trends', label: 'Academic Trends', icon: TrendingUp },
  { id: 'placement', label: 'Placement Readiness', icon: BriefcaseBusiness },
  { id: 'segments', label: 'Student Segments', icon: Target },
  { id: 'interventions', label: 'Interventions', icon: ClipboardList, group: 'ACTIONS' },
  { id: 'simulator', label: 'What-if Simulator', icon: FlaskConical },
  { id: 'insights', label: 'AI Insights', icon: Sparkles, group: 'INTELLIGENCE' },
  { id: 'reports', label: 'Reports & Settings', icon: Settings },
]

const fmt = (v) => Number(v || 0).toLocaleString('en-IN')
const fmtPct = (v, total) => total ? `${Math.round((v / total) * 100)}%` : '—'
const avatarColors = ['#222d49', '#27244b', '#173c43', '#44312c', '#263b30', '#2d2040', '#1c3040']
const palette = { High: '#ff667b', Medium: '#f5bd57', Low: '#40d5aa', violet: '#9a85ff', blue: '#59a8ff', amber: '#f5bd57', mint: '#40d5aa', red: '#ff667b' }
const SCORE_COLORS = ['#9a85ff', '#59a8ff', '#40d5aa', '#f5bd57', '#ff8c6b']
const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())
const hour = new Date().getHours()
const greeting = hour < 12 ? 'Good morning, team' : hour < 17 ? 'Good afternoon, team' : 'Good evening, team'

function initials(name = 'Student') { return name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() }
function displayTime(value) {
  if (!value) return 'Just now'
  const d = new Date(value)
  return Number.isNaN(+d) ? value : new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', day: '2-digit', month: 'short' }).format(d)
}
function isOverdue(due_date) {
  if (!due_date) return false
  return new Date(due_date) < new Date() && due_date !== ''
}

function App() {
  const [workspace, setWorkspace] = useState(null)
  const [trendsData, setTrendsData] = useState(null)
  const [page, setPage] = useState('overview')
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('All departments')
  const [riskFilter, setRiskFilter] = useState('All risk levels')
  const [showGap, setShowGap] = useState(false)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState({ msg: '', type: 'success' })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const uploadRef = useRef(null)

  const showToast = useCallback((msg, type = 'success') => setToast({ msg, type }), [])

  const refresh = useCallback(async () => {
    const next = await loadWorkspace()
    setWorkspace(next)
    return next
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (page === 'trends' && !trendsData) {
      loadTrends().then(d => setTrendsData(d)).catch(() => { })
    }
  }, [page, trendsData])
  useEffect(() => { if (!toast.msg) return; const id = setTimeout(() => setToast({ msg: '', type: 'success' }), 4000); return () => clearTimeout(id) }, [toast.msg])

  const students = workspace?.students || []
  const filtered = useMemo(() => students.filter(s => {
    const match = (s.name || '').toLowerCase().includes(query.toLowerCase()) || (s.student_id || s.id || '').toLowerCase().includes(query.toLowerCase())
    return match && (department === 'All departments' || s.department === department) && (riskFilter === 'All risk levels' || s.risk === riskFilter) && (!showGap || s.placement_gap)
  }), [students, query, department, riskFilter, showGap])

  const openStudent = useCallback((student) => { if (student) setSelected(student) }, [])

  async function onUpload(event) {
    const files = [...(event.target.files || [])]; if (!files.length) return
    setBusy(true)
    try {
      const result = await importCsvFiles(files)
      const next = await refresh()
      showToast(next.mode === 'live'
        ? `Imported ${fmt(result.students)} students from ${result.sources?.length ?? 0} tables · ${fmt(result.data_coverage)}% coverage.`
        : 'Import succeeded but dashboard could not reconnect to the API. Showing demo data.')
    } catch (error) { showToast(error.message || 'CSV import failed. Check file format and try again.', 'error') }
    finally { setBusy(false); event.target.value = '' }
  }

  async function assign(student, payload) {
    try {
      const saved = await saveIntervention({ student_id: student.student_id || student.id, student, admin_name: 'Academic Success Admin', ...payload })
      setWorkspace(current => ({ ...current, actions: [saved, ...(current?.actions || [])], overview: { ...current?.overview, last_actions: [saved, ...(current?.overview?.last_actions || [])] } }))
      showToast(saved.local ? 'Saved locally · API offline' : 'Intervention created and saved')
      setSelected(null)
    } catch (error) { showToast(error.message || 'Intervention could not be saved. Please try again.', 'error') }
  }

  async function onUpdateIntervention(id, update) {
    try {
      await updateIntervention(id, update)
      setWorkspace(current => {
        const actions = (current?.actions || []).map(a => a.id === id ? { ...a, ...update, updated_at: new Date().toISOString() } : a)
        return { ...current, actions }
      })
      showToast('Intervention updated')
    } catch (error) { showToast(error.message || 'Update failed.', 'error') }
  }

  if (!workspace) return (
    <div className="loading-screen">
      <div className="brand-mark">cp</div>
      <div className="loading-copy">Preparing your campus pulse<span /></div>
    </div>
  )

  const overview = workspace.overview
  const pageTitles = {
    overview: [greeting, 'Here\'s your campus pulse. Let\'s make every student count.'],
    students: ['Student Directory', 'Search the cohort, understand individual needs, and assign support.'],
    risk: ['Risk Intelligence', 'Find the signals behind student risk and decide where to act first.'],
    trends: ['Academic Trends', 'Track cohort progress and detect meaningful deterioration over time.'],
    placement: ['Placement Readiness', 'Turn skill signals into focused preparation pathways.'],
    segments: ['Student Segments', 'Four actionable student profiles, each with a focused playbook.'],
    interventions: ['Interventions', 'Track, update, and follow up on all student support actions.'],
    simulator: ['What-if Simulator', 'Explore how indicator changes affect the Success Score — hypothetically.'],
    insights: ['AI Insights', 'Cohort patterns translated into practical next steps.'],
    reports: ['Reports & Settings', 'Export data, configure display preferences, and review score methodology.'],
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">cp</div>
          <div><div className="brand-name">campuspulse<span>AI</span></div><div className="brand-caption">STUDENT INTELLIGENCE</div></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={17} /></button>
        </div>
        <div className="campus-switch">
          <div className="campus-avatar">N</div>
          <div className="campus-name"><b>Northstar Campus</b><span>Academic workspace</span></div>
          <ChevronDown size={15} />
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map((item, i) => (
            <div key={item.id}>
              {item.group && <div className={`nav-group ${i ? 'nav-group-spaced' : ''}`}>{item.group}</div>}
              <button
                className={`nav-link ${page === item.id ? 'nav-active' : ''}`}
                onClick={() => { setPage(item.id); setMobileOpen(false) }}
                aria-current={page === item.id ? 'page' : undefined}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {item.badge && <b className="nav-count">{fmt(overview.kpis.need_attention)}</b>}
                {item.id === 'interventions' && workspace.actions?.filter(a => a.status === 'Planned' || a.status === 'In Progress').length > 0 && (
                  <b className="nav-count nav-count-amber">{workspace.actions.filter(a => a.status === 'Planned' || a.status === 'In Progress').length}</b>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="term-card">
            <div className="term-label"><CalendarDays size={14} /> ACTIVE TERM</div>
            <b>Semester {overview.semester || 6}</b>
            <div className="term-progress"><i /></div>
          </div>
          <div className="user-card">
            <div className="user-avatar">AS</div>
            <div><b>Academic Success</b><span>Administrator</span></div>
            <MoreHorizontal size={17} />
          </div>
          <div className="sidebar-foot">CampusPulse AI <span>v2.0</span></div>
        </div>
      </aside>

      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <span>Workspace</span><ChevronRight size={14} />
            <b>{nav.find(item => item.id === page)?.label || 'Overview'}</b>
          </div>
          <div className="topbar-right">
            <div className={`sync-status ${workspace.mode === 'live' ? 'is-live' : ''}`}>
              <span />{workspace.mode === 'live' ? 'API online' : 'Demo data · offline'}
            </div>
            <button className="icon-button notification-button" aria-label="View recent interventions"
              onClick={() => { setPage('interventions') }}>
              <Bell size={18} />
              {workspace.actions?.filter(a => isOverdue(a.due_date) && a.status !== 'Completed').length > 0 && <i />}
            </button>
            <div className="top-user">
              <div className="top-avatar">AS</div>
              <div><b>Academic Success</b><span>Administrator</span></div>
              <ChevronDown size={14} />
            </div>
            <button className="help-button" onClick={() => window.dispatchEvent(new Event('campuspulse:open-chat'))}>
              <CircleHelp size={15} /> Help
            </button>
          </div>
        </header>

        <div className="page-wrap">
          <div className={`page-heading ${page === 'overview' ? 'overview-heading' : ''}`}>
            <div>
              <div className="date-kicker">{dateLabel}<span>•</span> SEMESTER {overview.semester || 6}</div>
              <h1>{pageTitles[page]?.[0] || 'Overview'}</h1>
              <p>{pageTitles[page]?.[1] || ''}</p>
            </div>
            <div className="heading-actions">
              <input ref={uploadRef} type="file" accept=".csv" multiple hidden onChange={onUpload} />
              {page === 'overview' && (
                <button className="button copilot-shortcut" onClick={() => window.dispatchEvent(new Event('campuspulse:open-chat'))}>
                  <Sparkles size={15} /> Ask AI Copilot
                </button>
              )}
              <button className="button button-quiet" onClick={() => uploadRef.current?.click()} disabled={busy}>
                <FileUp size={16} />{busy ? 'Importing…' : 'Import CSV'}
              </button>
              <button className="button button-primary" onClick={() => downloadStudents(students)}>
                <Download size={16} /> Export
              </button>
            </div>
          </div>

          {overview.data_quality?.missing_indicators?.length > 0 && (
            <div className="data-quality-banner" role="status">
              <AlertTriangle size={16} />
              <span>
                <b>Partial data · {fmt(overview.data_quality.coverage)}% average coverage.</b>{' '}
                Missing: {overview.data_quality.missing_indicators.join(', ')}. Missing measures use neutral placeholders and do not trigger their own risk rules.
              </span>
            </div>
          )}

          {page === 'overview' && (
            <section className="campus-snapshot">
              <div className="snapshot-copy">
                <div className="snapshot-label"><span /> CAMPUS PULSE <i>·</i> SEMESTER {overview.semester || 6}</div>
                <h2>One campus. <em>Every student.</em></h2>
                <p>Signals from academics, attendance and career readiness, brought into one clear view.</p>
              </div>
              <div className="snapshot-score">
                <ScoreRing score={overview.kpis.avg_score} size={63} />
                <div>
                  <span>COHORT SUCCESS</span>
                  <b>{overview.kpis.avg_score}<small> / 100</small></b>
                  <i>
                    {overview.trends?.length > 1 && overview.trends.at(-1).score > overview.trends.at(-2).score
                      ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {overview.trends?.length > 1
                      ? `${Math.abs(overview.trends.at(-1).score - overview.trends.at(-2).score)} pts vs previous term`
                      : 'Current cohort average'}
                  </i>
                </div>
              </div>
              <div className="snapshot-stat">
                <span>NEEDS A CHECK-IN</span>
                <b>{fmt(overview.kpis.need_attention)}<small> students</small></b>
                <i>High + Medium risk bands</i>
              </div>
              <div className="snapshot-art">
                <div className="snapshot-orbit orbit-one" /><div className="snapshot-orbit orbit-two" />
                <div className="snapshot-orbit orbit-three" /><div className="snapshot-core"><Activity size={25} /></div>
              </div>
            </section>
          )}

          {page === 'overview' && <OverviewPage data={overview} segments={workspace.segments} students={students} actions={workspace.actions} onPage={setPage} onStudent={openStudent} />}
          {page === 'students' && <StudentsPage students={filtered} allStudents={students} departments={workspace.departments} query={query} setQuery={setQuery} department={department} setDepartment={setDepartment} riskFilter={riskFilter} setRiskFilter={setRiskFilter} showGap={showGap} setShowGap={setShowGap} onStudent={openStudent} />}
          {page === 'risk' && <RiskPage students={students} onStudent={openStudent} />}
          {page === 'trends' && <TrendsPage data={trendsData} students={students} />}
          {page === 'placement' && <PlacementPage data={workspace.placement} students={students} onStudent={openStudent} />}
          {page === 'segments' && <SegmentsPage segments={workspace.segments} onStudent={openStudent} cohortMode={workspace.cohortMode} />}
          {page === 'interventions' && <InterventionsPage actions={workspace.actions || []} students={students} onAssign={assign} onUpdate={onUpdateIntervention} onStudent={openStudent} />}
          {page === 'simulator' && <SimulatorPage students={students} />}
          {page === 'insights' && <InsightsPage insights={workspace.insights} students={students} onStudents={() => setPage('students')} cohortMode={workspace.cohortMode} />}
          {page === 'reports' && <ReportsPage students={students} overview={overview} />}

          <footer className="page-footer">
            <span>CampusPulse AI <b>·</b> v2.0 · decision support for student success</span>
            <span>{workspace.cohortMode === 'uploaded cohort' ? 'Imported campus data · advisory use only' : 'Synthetic demo data · not real student records'}</span>
          </footer>
        </div>
      </main>

      {selected && <StudentDrawer student={selected} onClose={() => setSelected(null)} onAssign={assign} />}
      <ChatWidget workspace={workspace} onStudent={openStudent} />
      {toast.msg && (
        <div className={`toast ${toast.type === 'error' ? 'toast-error' : ''}`}>
          <div className="toast-icon">{toast.type === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}</div>
          <span>{toast.msg}</span>
          <button onClick={() => setToast({ msg: '', type: 'success' })} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}
    </div>
  )
}

function downloadStudents(students) {
  const rows = [
    ['student_id', 'name', 'department', 'success_score', 'risk', 'attendance_pct', 'cgpa', 'academic_component', 'lms_component', 'placement_component', 'skills_component', 'placement_gap', 'placement_ready', 'segment'],
    ...students.map(s => [
      s.student_id || s.id, s.name, s.department, s.success_score ?? s.score, s.risk,
      s.attendance_pct ?? s.attendance, s.cgpa, s.academic_component ?? s.academic,
      s.lms_component ?? s.lms, s.placement_component ?? s.placement,
      s.skills_component ?? s.skills, s.placement_gap, s.placement_ready, s.segment || '',
    ]),
  ]
  const csv = rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a'); a.href = url; a.download = 'campuspulse-student-report.csv'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function KpiCard({ label, value, unit, delta, icon: Icon, tone = 'violet', note }) {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <div className="kpi-top"><span>{label}</span><div className="kpi-icon"><Icon size={17} /></div></div>
      <div className="kpi-value">{value}<small>{unit}</small></div>
      <div className="kpi-foot">
        {delta && <b className={(delta.startsWith('↓') || delta.startsWith('-')) ? 'negative' : 'positive'}>{delta}</b>}
        <span>{note}</span>
      </div>
    </div>
  )
}
function Panel({ children, className = '' }) { return <section className={`panel ${className}`}>{children}</section> }
function PanelHeading({ title, subtitle, action }) {
  return <div className="panel-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
}
function RiskBadge({ risk }) { return <span className={`risk-badge risk-${(risk || 'Low').toLowerCase()}`}><i />{risk || 'Low'}</span> }
function StatusBadge({ status }) {
  const cls = status === 'Completed' ? 'status-completed' : status === 'In Progress' ? 'status-inprogress' : status === 'Planned' ? 'status-planned' : 'status-planned'
  return <span className={`status-badge ${cls}`}>{status || 'Planned'}</span>
}
function ScoreRing({ score, size = 44 }) {
  const color = score < 55 ? palette.High : score < 70 ? palette.Medium : palette.Low
  return <div className="score-ring" style={{ '--score': `${score}%`, '--ring-color': color, width: size, height: size }}><span>{score}</span></div>
}
function ChartTip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <span>{label || payload[0].name}</span>
      {payload.map(item => <b key={item.dataKey} style={{ color: item.color || item.fill }}>{item.name || item.dataKey}: {typeof item.value === 'number' ? item.value.toLocaleString('en-IN') : item.value}{suffix}</b>)}
    </div>
  )
}
function EmptyState({ icon: Icon = Search, title, body, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Icon size={22} /></div>
      <b>{title}</b>
      {body && <span>{body}</span>}
      {action}
    </div>
  )
}

function OverviewPage({ data, segments, students, actions, onPage, onStudent }) {
  const k = data.kpis
  const recent = data.last_actions?.length ? data.last_actions : (actions || [])
  const trend = data.trends || []
  const scoreChange = trend.length > 1 ? trend[trend.length - 1].score - trend[trend.length - 2].score : null
  const scoreDelta = scoreChange != null ? (scoreChange >= 0 ? `↑ ${scoreChange} pts vs prev term` : `↓ ${Math.abs(scoreChange)} pts vs prev term`) : null
  return (
    <>
      <section className="kpi-grid">
        <KpiCard label="STUDENTS TRACKED" value={fmt(k.students)} icon={Users} tone="blue" note="Active cohort" />
        <KpiCard label="AVG. SUCCESS SCORE" value={k.avg_score} unit={<em>/ 100</em>} icon={Activity} tone="violet" delta={scoreDelta} note="Current semester" />
        <KpiCard label="NEED ATTENTION" value={fmt(k.need_attention)} icon={ShieldAlert} tone="red" delta={fmtPct(k.need_attention, k.students)} note="of students tracked" />
        <KpiCard label="PLACEMENT READY" value={fmt(k.placement_ready)} icon={BriefcaseBusiness} tone="green" note="Meets readiness thresholds" />
        <KpiCard label="PLACEMENT GAP" value={fmt(k.placement_gap)} icon={Target} tone="amber" note="CGPA > 7.5, skills below median" />
      </section>

      <section className="insight-banner">
        <div className="insight-orb"><Sparkles size={19} /></div>
        <div className="insight-text"><b>A pattern worth acting on</b><p>{data.priority_insight}</p></div>
        <button onClick={() => onPage('segments')}>View segments <ArrowRight size={15} /></button>
        <div className="banner-watermark">pulse</div>
      </section>

      <section className="overview-grid">
        <Panel className="trend-panel">
          <PanelHeading title="Semester score trend" subtitle="Average success score across semesters" action={<span className="mini-chip"><i /> COHORT AVERAGE</span>} />
          <div className="chart-wrap trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trends} margin={{ top: 14, right: 10, left: -18, bottom: 0 }}>
                <defs><linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8975ff" stopOpacity={.28} /><stop offset="96%" stopColor="#8975ff" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#263247" vertical={false} />
                <XAxis dataKey="semester" axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 11 }} dy={12} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 11 }} />
                <Tooltip content={<ChartTip suffix=" / 100" />} />
                <Area type="monotone" dataKey="score" stroke="#9682ff" strokeWidth={3} fill="url(#scoreFill)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend"><span><i className="legend-violet" /> Success score / 100</span><span>From available semester records</span></div>
        </Panel>
        <Panel className="distribution-panel">
          <PanelHeading title="Student distribution" subtitle="By current risk band" action={<span className="round-more" aria-hidden="true"><MoreHorizontal size={18} /></span>} />
          <div className="donut-holder">
            <ResponsiveContainer width="55%" height={205}>
              <PieChart>
                <Pie data={data.risk_distribution} dataKey="value" nameKey="name" innerRadius={66} outerRadius={88} paddingAngle={3} stroke="none">
                  {data.risk_distribution.map(entry => <Cell key={entry.name} fill={palette[entry.name]} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><b>{fmt(k.students)}</b><span>students</span></div>
            <div className="risk-legend">
              {data.risk_distribution.map(item => (
                <div key={item.name}><i style={{ background: palette[item.name] }} /><span>{item.name === 'Low' ? 'On track' : item.name === 'Medium' ? 'Watch' : 'At risk'}</span><b>{fmt(item.value)}</b></div>
              ))}
            </div>
          </div>
          <div className="panel-footnote">
            <Sparkles size={15} />
            <span><b>{Math.round((k.students - k.need_attention) / Math.max(k.students, 1) * 100)}%</b> on track. Start with watch and at-risk bands.</span>
          </div>
        </Panel>
      </section>

      <section className="overview-grid lower-overview">
        <Panel>
          <PanelHeading title="Department pulse" subtitle="Avg. success score by department" action={<button className="text-action" onClick={() => onPage('students')}>Explore <ArrowRight size={14} /></button>} />
          <div className="chart-wrap dept-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.departments} layout="vertical" margin={{ top: 5, right: 25, left: 5, bottom: 4 }}>
                <CartesianGrid stroke="#263247" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 10 }} />
                <YAxis type="category" dataKey="department" width={130} axisLine={false} tickLine={false} tick={{ fill: '#9aa7bb', fontSize: 11 }} />
                <Tooltip content={<ChartTip suffix=" / 100" />} />
                <Line type="monotone" dataKey="avg_score" stroke="#47c9a2" strokeWidth={3} dot={{ r: 3, fill: '#47c9a2' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <PanelHeading title="Students to watch" subtitle="Priority outreach · sorted by score" action={<button className="text-action" onClick={() => onPage('risk')}>View all <ArrowRight size={14} /></button>} />
          <div className="watch-list">
            {students.filter(s => s.risk !== 'Low').sort((a, b) => (a.success_score ?? a.score) - (b.success_score ?? b.score)).slice(0, 4).map((s, i) => (
              <button className="watch-row" key={s.student_id || s.id} onClick={() => onStudent(s)}>
                <div className="student-avatar" style={{ background: avatarColors[i % avatarColors.length] }}>{initials(s.name)}</div>
                <div className="watch-person"><b>{s.name}</b><span>{s.department} · {s.student_id || s.id}</span></div>
                <div className="watch-reason">{s.risk_reasons?.[0] || `Attendance: ${s.attendance_pct ?? s.attendance}%`}</div>
                <ScoreRing score={s.success_score ?? s.score} size={40} />
              </button>
            ))}
            {students.filter(s => s.risk !== 'Low').length === 0 && <EmptyState icon={Check} title="All students on track" body="No High or Medium risk flags in the current cohort." />}
          </div>
        </Panel>
      </section>

      <Panel className="actions-panel" id="last-actions">
        <PanelHeading title="Recent interventions" subtitle="Latest actions assigned by your team" action={<span className="mini-chip"><i className="mint-dot" /> ACTIVITY</span>} />
        {recent?.length ? (
          <div className="action-list">
            {recent.slice(0, 6).map(action => (
              <div className="action-row" key={action.id}>
                <div className={`action-check action-check-${(action.status || 'Assigned').toLowerCase().replace(' ', '-')}`}><Check size={14} /></div>
                <div className="action-copy"><b>{action.action}</b><span>{action.student_name} <i>·</i> {action.assigned_to || action.admin_name}</span></div>
                <div className="action-meta"><StatusBadge status={action.status || 'Planned'} /><time>{displayTime(action.timestamp)}</time></div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Zap} title="No interventions yet" body="Open a student profile to assign an advisor action." action={<button className="button button-quiet" onClick={() => onPage('students')}>Explore students <ArrowRight size={14} /></button>} />
        )}
      </Panel>
    </>
  )
}

function StudentsPage({ students, allStudents, departments, query, setQuery, department, setDepartment, riskFilter, setRiskFilter, showGap, setShowGap, onStudent }) {
  const [pageIndex, setPageIndex] = useState(0)
  const [sortKey, setSortKey] = useState('risk')
  const [sortDir, setSortDir] = useState('asc')
  const perPage = 15
  useEffect(() => setPageIndex(0), [query, department, riskFilter, showGap, sortKey, sortDir])
  const sorted = useMemo(() => {
    const arr = [...students]
    const riskOrder = { High: 0, Medium: 1, Low: 2 }
    arr.sort((a, b) => {
      let av, bv
      if (sortKey === 'risk') { av = riskOrder[a.risk] ?? 3; bv = riskOrder[b.risk] ?? 3 }
      else if (sortKey === 'score') { av = a.success_score ?? a.score ?? 0; bv = b.success_score ?? b.score ?? 0 }
      else if (sortKey === 'attendance') { av = a.attendance_pct ?? a.attendance ?? 0; bv = b.attendance_pct ?? b.attendance ?? 0 }
      else if (sortKey === 'name') { av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase() }
      else { av = 0; bv = 0 }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [students, sortKey, sortDir])
  const maxPage = Math.max(1, Math.ceil(sorted.length / perPage))
  const visible = sorted.slice(pageIndex * perPage, (pageIndex + 1) * perPage)
  const toggleSort = (key) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc') } }
  const SortIcon = ({ k }) => sortKey === k ? (sortDir === 'asc' ? <ChevronDown size={12} /> : <ChevronRight size={12} style={{ transform: 'rotate(-90deg)' }} />) : null
  return (
    <>
      <div className="student-summary-row">
        <div className="summary-chip"><Users size={16} /><b>{fmt(students.length)}</b><span>students match</span></div>
        <button className={`gap-filter ${showGap ? 'gap-filter-on' : ''}`} onClick={() => setShowGap(!showGap)}>
          <Target size={15} /> Placement Gap <b>{allStudents.filter(s => s.placement_gap).length}</b><span>×</span>
        </button>
      </div>
      <Panel className="directory-panel">
        <div className="directory-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input placeholder="Search by name or student ID…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search students" />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
          </div>
          <div className="filter-select"><Filter size={15} /><select value={department} onChange={e => setDepartment(e.target.value)} aria-label="Filter by department"><option>All departments</option>{departments.map(d => <option key={d}>{d}</option>)}</select><ChevronDown size={14} /></div>
          <div className="filter-select"><select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} aria-label="Filter by risk level"><option>All risk levels</option><option>High</option><option>Medium</option><option>Low</option></select><ChevronDown size={14} /></div>
          <button className="button button-quiet compact" onClick={() => downloadStudents(students)}><Download size={15} /> Export</button>
        </div>
        <div className="table-scroll">
          <table className="student-table">
            <thead>
              <tr>
                <th><button className="sort-btn" onClick={() => toggleSort('name')}>STUDENT <SortIcon k="name" /></button></th>
                <th>DEPARTMENT</th>
                <th><button className="sort-btn" onClick={() => toggleSort('score')}>SUCCESS SCORE <SortIcon k="score" /></button></th>
                <th><button className="sort-btn" onClick={() => toggleSort('attendance')}>ATTENDANCE <SortIcon k="attendance" /></button></th>
                <th>PLACEMENT</th>
                <th><button className="sort-btn" onClick={() => toggleSort('risk')}>RISK <SortIcon k="risk" /></button></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => (
                <tr key={s.student_id || s.id} onClick={() => onStudent(s)} style={{ cursor: 'pointer' }}>
                  <td><div className="table-student"><div className="student-avatar" style={{ background: avatarColors[i % avatarColors.length] }}>{initials(s.name)}</div><div><b>{s.name}</b><span>{s.student_id || s.id}</span></div></div></td>
                  <td>{s.department}</td>
                  <td><div className="table-score"><ScoreRing score={s.success_score ?? s.score} size={36} /><b>{s.success_score ?? s.score}<small>/100</small></b></div></td>
                  <td><span className={(!s.attendance_missing && (s.attendance_pct ?? s.attendance) < 65) ? 'text-red' : ''}>{s.attendance_missing ? <span className="table-muted">—</span> : `${s.attendance_pct ?? s.attendance}%`}</span></td>
                  <td>{s.placement_missing ? <span className="table-muted">Not assessed</span> : s.placement_gap ? <span className="gap-badge"><Target size={12} /> Gap</span> : s.placement_ready ? <span className="ready-badge"><Check size={12} /> Ready</span> : <span className="table-muted">Building</span>}</td>
                  <td><RiskBadge risk={s.risk} /></td>
                  <td><button className="row-open" aria-label={`Open profile for ${s.name}`}><ChevronRight size={17} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <EmptyState title="No students match" body="Try a different name, department, or risk band." />}
        </div>
        <div className="table-footer">
          <span>Showing <b>{sorted.length ? fmt(pageIndex * perPage + 1) : 0}–{fmt(Math.min((pageIndex + 1) * perPage, sorted.length))}</b> of <b>{fmt(sorted.length)}</b></span>
          <div className="pagination">
            <button disabled={pageIndex === 0} onClick={() => setPageIndex(p => p - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            <span>{pageIndex + 1} <i>/</i> {maxPage}</span>
            <button disabled={pageIndex >= maxPage - 1} onClick={() => setPageIndex(p => p + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </div>
        </div>
      </Panel>
    </>
  )
}

function RiskPage({ students, onStudent }) {
  const watch = students.filter(s => s.risk !== 'Low').sort((a, b) => (a.success_score ?? a.score) - (b.success_score ?? b.score))
  const drivers = [
    { label: 'Attendance below 65%', count: students.filter(s => !s.attendance_missing && (s.attendance_pct ?? s.attendance) < 65).length, color: palette.High, threshold: '< 65%', rule: 'High risk trigger' },
    { label: 'Academic component below 55', count: students.filter(s => !s.academic_missing && (s.academic_component ?? s.academic) < 55).length, color: palette.Medium, threshold: '< 55 / 100', rule: 'High risk trigger' },
    { label: 'Two or more active backlogs', count: students.filter(s => !s.backlogs_missing && (s.backlogs || 0) >= 2).length, color: palette.amber, threshold: '≥ 2 backlogs', rule: 'High risk trigger' },
    { label: 'Low LMS engagement', count: students.filter(s => !s.lms_missing && (s.lms_component ?? s.lms) < 45).length, color: palette.violet, threshold: '< 45 / 100', rule: 'Medium risk trigger' },
    { label: 'Skills below 50', count: students.filter(s => !s.skills_missing && (s.skills_component ?? s.skills) < 50).length, color: palette.blue, threshold: '< 50 / 100', rule: 'Recommendation trigger' },
  ]
  return (
    <>
      <div className="risk-metric-grid">
        {['High', 'Medium', 'Low'].map(band => (
          <div className={`risk-summary risk-summary-${band.toLowerCase()}`} key={band}>
            <span>{band === 'High' ? 'HIGH RISK' : band === 'Medium' ? 'WATCHLIST' : 'ON TRACK'}</span>
            <b>{fmt(students.filter(s => s.risk === band).length)}</b>
            <small>{fmtPct(students.filter(s => s.risk === band).length, students.length)} of cohort</small>
          </div>
        ))}
      </div>
      <div className="risk-methodology-note">
        <ShieldAlert size={14} />
        <span><b>Rule-based classification · not a predictive model.</b> High: score &lt; 55 or attendance &lt; 65% or ≥ 2 backlogs. Medium: score &lt; 70 or attendance &lt; 75% or LMS &lt; 45. Risk flags are prompts for advisor review, not judgments about ability.</span>
      </div>
      <div className="two-column">
        <Panel>
          <PanelHeading title="Risk driver breakdown" subtitle="Signals across the current cohort · with thresholds" />
          <div className="driver-list">
            {drivers.map((d, i) => (
              <div className="driver-row" key={d.label}>
                <div className="driver-rank">0{i + 1}</div>
                <div className="driver-main">
                  <div>
                    <div><b>{d.label}</b><span className="driver-threshold">{d.threshold} · {d.rule}</span></div>
                    <span>{d.count} students affected</span>
                  </div>
                  <div className="driver-bar"><i style={{ width: `${Math.min(100, d.count / Math.max(students.length, 1) * 100 * 2.4)}%`, background: d.color }} /></div>
                </div>
                <b className="driver-count">{fmtPct(d.count, students.length)}</b>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeading title="Supportive response steps" subtitle="Risk rules create a review queue, not a judgment" />
          <div className="response-steps">
            {[['01', 'Prioritize', 'Begin with High risk and rapid attendance declines.'], ['02', 'Understand', 'Review each student\'s reason flags and recent context.'], ['03', 'Support', 'Assign a mentor, remedial session, or placement bridge.'], ['04', 'Follow up', 'Check progress after two to four weeks.']].map(([n, title, detail]) => (
              <div className="response-step" key={n}><b>{n}</b><div><strong>{title}</strong><span>{detail}</span></div></div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel className="risk-table-panel">
        <PanelHeading title="Priority outreach list" subtitle={`${fmt(watch.length)} students could benefit from a timely check-in`} action={<span className="mini-chip"><i className="red-dot" /> SUPPORT REVIEW</span>} />
        <div className="risk-student-list">
          {watch.slice(0, 15).map((s, i) => (
            <button className="risk-student-row" key={s.student_id || s.id} onClick={() => onStudent(s)}>
              <div className="student-avatar" style={{ background: avatarColors[i % avatarColors.length] }}>{initials(s.name)}</div>
              <div className="risk-student-name"><b>{s.name}</b><span>{s.department} · {s.student_id || s.id}</span></div>
              <div className="risk-reasons">{(s.risk_reasons || []).slice(0, 2).map((reason, j) => <span key={j}><i /> {reason}</span>)}</div>
              <ScoreRing score={s.success_score ?? s.score} size={39} />
              <RiskBadge risk={s.risk} />
              <ChevronRight size={17} />
            </button>
          ))}
          {watch.length === 0 && <EmptyState icon={Check} title="No students on the watchlist" body="All students are currently in the Low risk band." />}
        </div>
      </Panel>
    </>
  )
}

function TrendsPage({ data, students }) {
  const [view, setView] = useState('score')
  if (!data) return (
    <Panel>
      <EmptyState icon={TrendingUp} title="Loading trend data…" body="Connecting to the API. In demo mode, historical trend data from the synthetic cohort is available." />
    </Panel>
  )
  const cohort = data.cohort || []
  const deptTrends = data.departments || []
  const chartData = cohort.map(r => ({
    semester: r.semester, score: r.avg_score, attendance: r.avg_attendance,
    academic: r.avg_academic, lms: r.avg_lms, placement: r.avg_placement,
    high_risk: r.high_risk_count,
  }))
  const keys = { score: { label: 'Success Score', color: '#9a85ff' }, attendance: { label: 'Attendance %', color: '#40d5aa' }, academic: { label: 'Academic Component', color: '#59a8ff' }, lms: { label: 'LMS Score', color: '#f5bd57' }, placement: { label: 'Placement Component', color: '#ff8c6b' } }
  return (
    <>
      <div className="trends-controls">
        {Object.entries(keys).map(([k, meta]) => (
          <button key={k} className={`trend-tab ${view === k ? 'trend-tab-active' : ''}`} onClick={() => setView(k)} style={{ '--tab-color': meta.color }}>
            {meta.label}
          </button>
        ))}
      </div>
      <section className="overview-grid">
        <Panel>
          <PanelHeading title={`Cohort trend · ${keys[view].label}`} subtitle="Average across all semesters" action={data.synthetic && <span className="mini-chip"><i /> SYNTHETIC DEMO</span>} />
          <div className="chart-wrap trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 14, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={keys[view].color} stopOpacity={.28} />
                    <stop offset="96%" stopColor={keys[view].color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#263247" vertical={false} />
                <XAxis dataKey="semester" axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 11 }} dy={12} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 11 }} />
                <Tooltip content={<ChartTip suffix=" / 100" />} />
                <Area type="monotone" dataKey={view} stroke={keys[view].color} strokeWidth={3} fill="url(#trendFill)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} name={keys[view].label} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <PanelHeading title="High-risk count per semester" subtitle="Students flagged High across terms" />
          <div className="chart-wrap trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 14, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#263247" vertical={false} />
                <XAxis dataKey="semester" axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 11 }} dy={12} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 11 }} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="high_risk" fill={palette.High} radius={[4, 4, 0, 0]} name="High risk students" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>
      <Panel>
        <PanelHeading title="Department success score trends" subtitle="All departments across semesters" />
        <div className="chart-wrap dept-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 14, right: 20, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#263247" vertical={false} />
              <XAxis dataKey="semester" type="category" allowDuplicatedCategory={false} axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 11 }} dy={12} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 11 }} />
              <Tooltip content={<ChartTip suffix=" / 100" />} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#8794aa', paddingTop: 12 }} />
              {deptTrends.map((dept, i) => (
                <Line key={dept.department} data={dept.trend} type="monotone" dataKey="score" stroke={SCORE_COLORS[i % SCORE_COLORS.length]} strokeWidth={2} dot={false} name={dept.department} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      {data.synthetic && (
        <div className="trend-disclaimer"><TrendingUp size={14} /><span>This trend data is generated from the synthetic demo cohort. It illustrates historical semester patterns but does not represent real student outcomes. Import your own CSV data to see actual trends.</span></div>
      )}
    </>
  )
}

function PlacementPage({ data, students, onStudent }) {
  const scatter = students.filter(s => !s.placement_missing).map(s => ({ name: s.name, student_id: s.student_id || s.id, coding: s.coding_score ?? s.coding ?? 0, aptitude: s.aptitude_score ?? s.aptitude ?? 0, cgpa: s.cgpa, placement_gap: s.placement_gap, student: s }))
  const gap = students.filter(s => s.placement_gap).sort((a, b) => (a.placement_component ?? a.placement) - (b.placement_component ?? b.placement))
  return (
    <>
      <section className="placement-kpis">
        <KpiCard label="PLACEMENT READY" value={fmt(data.ready)} icon={BriefcaseBusiness} tone="green" note="Meets readiness thresholds" />
        <KpiCard label="PLACEMENT GAP" value={fmt(data.gap)} icon={Target} tone="amber" note="CGPA > 7.5, skills below median" />
        <KpiCard label="CODING MEDIAN" value={data.medians?.coding ?? '—'} unit={data.medians?.coding != null && <em>/ 100</em>} icon={Zap} tone="violet" note="cohort coding assessment" />
        <KpiCard label="APTITUDE MEDIAN" value={data.medians?.aptitude ?? '—'} unit={data.medians?.aptitude != null && <em>/ 100</em>} icon={BookOpenCheck} tone="blue" note="cohort aptitude assessment" />
      </section>
      <div className="two-column placement-layout">
        <Panel>
          <PanelHeading title="Coding vs. aptitude" subtitle="Each dot is a student · upper-right = stronger readiness" action={<span className="mini-chip"><i className="blue-dot" /> SKILL MAP</span>} />
          <div className="chart-wrap scatter-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 14, right: 18, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#263247" />
                <XAxis type="number" dataKey="coding" domain={[20, 100]} name="Coding" tick={{ fill: '#77859d', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'CODING', position: 'insideBottom', offset: -4, fill: '#77859d', fontSize: 10 }} />
                <YAxis type="number" dataKey="aptitude" domain={[20, 100]} name="Aptitude" tick={{ fill: '#77859d', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'APTITUDE', angle: -90, position: 'insideLeft', fill: '#77859d', fontSize: 10 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? <div className="chart-tooltip"><b>{payload[0].payload.name}</b><span>Coding: {payload[0].payload.coding} · Aptitude: {payload[0].payload.aptitude}</span></div> : null} />
                <Scatter data={scatter} onClick={item => item?.student && onStudent(item.student)} cursor="pointer">
                  {scatter.map((item, i) => <Cell key={i} fill={item.placement_gap ? palette.Medium : item.cgpa >= 7.5 ? palette.violet : palette.blue} fillOpacity={.78} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="scatter-legend"><span><i className="legend-amber" /> Placement gap</span><span><i className="legend-violet" /> CGPA ≥ 7.5</span><span><i className="legend-blue" /> Developing</span></div>
          </div>
        </Panel>
        <Panel>
          <PanelHeading title="Readiness distribution" subtitle={`Assessed: ${fmt(data.assessed ?? students.length)} students`} />
          <div className="placement-donut">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={data.bands} dataKey="value" nameKey="name" innerRadius={65} outerRadius={90} paddingAngle={4} stroke="none">
                  {data.bands.map((item, i) => <Cell key={item.name} fill={[palette.Low, palette.violet, palette.Medium][i]} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><b>{fmt(data.assessed ?? students.length)}</b><span>assessed</span></div>
          </div>
          <div className="band-legend">{data.bands.map((b, i) => <div key={b.name}><i style={{ background: [palette.Low, palette.violet, palette.Medium][i] }} /><span>{b.name}</span><b>{fmt(b.value)}</b></div>)}</div>
        </Panel>
      </div>
      <Panel className="gap-panel">
        <PanelHeading title="Placement gap students" subtitle="High CGPA with coding or aptitude below cohort median" action={<span className="gap-badge"><Target size={12} /> {fmt(gap.length)} flagged</span>} />
        <div className="compact-student-list">
          {gap.slice(0, 8).map(s => (
            <button className="compact-student" key={s.student_id || s.id} onClick={() => onStudent(s)}>
              <div className="student-avatar" style={{ background: avatarColors[s.name.length % avatarColors.length] }}>{initials(s.name)}</div>
              <div className="compact-student-main"><b>{s.name}</b><span>{s.department} · CGPA {s.cgpa}</span></div>
              <span className="skill-pill">Coding <b>{s.coding_score || s.coding}</b></span>
              <span className="skill-pill">Aptitude <b>{s.aptitude_score || s.aptitude}</b></span>
              <span className="gap-badge"><Target size={12} /> Bridge</span>
              <ChevronRight size={16} />
            </button>
          ))}
          {gap.length === 0 && <EmptyState icon={Check} title="No placement gap students" body="All students with strong CGPA also meet the coding and aptitude thresholds." />}
        </div>
      </Panel>
    </>
  )
}

function SegmentsPage({ segments, onStudent, cohortMode }) {
  const meta = {
    'High Performers': { tone: 'mint', icon: GraduationCap, caption: 'Consistent momentum' },
    'Silent Strugglers': { tone: 'amber', icon: BookOpenCheck, caption: 'Strong attendance · marks need support' },
    'Placement Gap': { tone: 'violet', icon: Target, caption: 'Academic strength · readiness gap' },
    'Disengaged': { tone: 'red', icon: Activity, caption: 'Low attendance · low LMS activity' },
  }
  return (
    <>
      <div className="segment-intro">
        <div>
          <div className="eyebrow"><Sparkles size={13} /> COHORT PROFILING</div>
          <h2>Different students need different support.</h2>
          <p>Profiles are grouped from academic, attendance, LMS, placement, skills, and engagement signals. Use segments to tailor outreach.</p>
        </div>
        <div className="cluster-note"><span>METHOD</span><b>K-means · k = 4</b><small>standardized component indicators</small></div>
      </div>
      <section className="segment-grid">
        {segments.map((segment, index) => {
          const m = meta[segment.name] || meta['High Performers']
          const Icon = m.icon
          return (
            <article className={`segment-card segment-${m.tone}`} key={segment.name}>
              <div className="segment-card-head"><div className="segment-icon"><Icon size={19} /></div><span className="segment-index">0{index + 1}</span></div>
              <div className="segment-caption">{m.caption}</div>
              <h3>{segment.name}</h3>
              <div className="segment-count"><b>{fmt(segment.size)}</b><span>students</span><small>{fmtPct(segment.size, segments.reduce((a, s) => a + s.size, 0))} of cohort</small></div>
              <div className="segment-metrics">
                <div><span>Avg. score</span><b>{segment.avg_score}<small>/100</small></b></div>
                <div><span>Attendance</span><b>{segment.avg_attendance}%</b></div>
                <div><span>Avg. CGPA</span><b>{segment.avg_cgpa}</b></div>
              </div>
              <div className="playbook">
                <div className="playbook-title"><Zap size={14} /> INTERVENTION PLAYBOOK</div>
                {segment.playbook.map((step, i) => <div className="playbook-step" key={step}><span>{i + 1}</span>{step}</div>)}
              </div>
              <div className="segment-students">
                <div className="segment-student-title">SAMPLE STUDENTS <button onClick={() => onStudent(segment.students?.[0])}>View profile <ArrowRight size={13} /></button></div>
                {segment.students?.slice(0, 3).map((s, i) => (
                  <button key={s.student_id || s.id} onClick={() => onStudent(s)}>
                    <div className="student-avatar tiny" style={{ background: avatarColors[i % avatarColors.length] }}>{initials(s.name)}</div>
                    <span>{s.name}</span><b>{s.success_score ?? s.score}</b>
                  </button>
                ))}
              </div>
            </article>
          )
        })}
      </section>
      <div className="method-note">
        <div><ShieldAlert size={16} /></div>
        <p><b>Use profiles as a starting point for support.</b> K-means clusters summarize patterns in the {cohortMode === 'uploaded cohort' ? 'uploaded' : 'synthetic demo'} cohort. A faculty conversation and student context should guide each intervention. Cluster labels do not establish actual risk.</p>
      </div>
    </>
  )
}

function InterventionsPage({ actions, students, onAssign, onUpdate, onStudent }) {
  const [statusFilter, setStatusFilter] = useState('All')
  const [creating, setCreating] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState('')
  const [form, setForm] = useState({ action: '', intervention_type: 'General Support', reason: '', assigned_to: 'Academic Success Admin', due_date: '', status: 'Planned', notes: '' })
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const statuses = ['All', 'Planned', 'In Progress', 'Completed']
  const types = ['General Support', 'Academic Remediation', 'Attendance Follow-up', 'Placement Bridge', 'Counseling', 'Peer Mentoring']

  const filtered = useMemo(() => {
    let list = [...actions]
    if (statusFilter !== 'All') list = list.filter(a => a.status === statusFilter)
    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [actions, statusFilter])

  const overdue = actions.filter(a => isOverdue(a.due_date) && a.status !== 'Completed')
  const pending = actions.filter(a => a.status === 'Planned' || a.status === 'In Progress')

  async function handleCreate(e) {
    e.preventDefault()
    if (!selectedStudent || !form.action.trim()) return
    setBusy(true)
    const student = students.find(s => (s.student_id || s.id) === selectedStudent)
    try {
      await onAssign(student || { student_id: selectedStudent, name: selectedStudent }, { ...form, status: form.status || 'Planned' })
      setCreating(false); setForm({ action: '', intervention_type: 'General Support', reason: '', assigned_to: 'Academic Success Admin', due_date: '', status: 'Planned', notes: '' }); setSelectedStudent('')
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="interventions-summary">
        <div className="int-stat"><b>{fmt(actions.length)}</b><span>Total</span></div>
        <div className="int-stat int-stat-amber"><b>{fmt(pending.length)}</b><span>Pending</span></div>
        <div className="int-stat int-stat-red"><b>{fmt(overdue.length)}</b><span>Overdue</span></div>
        <div className="int-stat int-stat-mint"><b>{fmt(actions.filter(a => a.status === 'Completed').length)}</b><span>Completed</span></div>
        <button className="button button-primary ml-auto" onClick={() => setCreating(true)}><Zap size={15} /> New Intervention</button>
      </div>

      {creating && (
        <Panel className="create-intervention-panel">
          <PanelHeading title="Create intervention" subtitle="Assign a support action to a student" action={<button className="icon-button" onClick={() => setCreating(false)}><X size={18} /></button>} />
          <form className="intervention-form" onSubmit={handleCreate}>
            <div className="form-row">
              <label>Student<select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} required><option value="">Select student…</option>{students.map(s => <option key={s.student_id || s.id} value={s.student_id || s.id}>{s.name} ({s.student_id || s.id})</option>)}</select></label>
              <label>Type<select value={form.intervention_type} onChange={e => setForm(f => ({ ...f, intervention_type: e.target.value }))}>{types.map(t => <option key={t}>{t}</option>)}</select></label>
            </div>
            <label>Action / Description<input type="text" value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))} placeholder="e.g. Advisor check-in — attendance review" required minLength={3} maxLength={240} /></label>
            <label>Reason / Linked risk indicator<input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Attendance below 65% for two semesters" /></label>
            <div className="form-row">
              <label>Assigned to<input type="text" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} /></label>
              <label>Due date<input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></label>
              <label>Status<select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option>Planned</option><option>In Progress</option><option>Completed</option></select></label>
            </div>
            <label>Notes<textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional additional context…" /></label>
            <div className="form-actions">
              <button type="button" className="button button-quiet" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={busy || !selectedStudent || !form.action.trim()}>{busy ? 'Saving…' : 'Create intervention'}</button>
            </div>
          </form>
        </Panel>
      )}

      <Panel className="interventions-table-panel">
        <PanelHeading title="All interventions" subtitle={`${fmt(filtered.length)} interventions`} action={
          <div className="status-filter-row">
            {statuses.map(s => <button key={s} className={`status-tab ${statusFilter === s ? 'status-tab-active' : ''}`} onClick={() => setStatusFilter(s)}>{s}</button>)}
          </div>
        } />
        <div className="table-scroll">
          <table className="interventions-table">
            <thead><tr><th>STUDENT</th><th>ACTION</th><th>TYPE</th><th>ASSIGNED TO</th><th>DUE DATE</th><th>STATUS</th><th>CREATED</th><th /></tr></thead>
            <tbody>
              {filtered.map(action => (
                <tr key={action.id} className={isOverdue(action.due_date) && action.status !== 'Completed' ? 'row-overdue' : ''}>
                  <td><button className="table-link" onClick={() => { const s = students.find(st => (st.student_id || st.id) === action.student_id); if (s) onStudent(s) }}>{action.student_name}<span>{action.department}</span></button></td>
                  <td><div className="int-action-cell"><b>{action.action}</b>{action.reason && <span>{action.reason}</span>}</div></td>
                  <td><span className="type-chip">{action.intervention_type || 'General Support'}</span></td>
                  <td>{action.assigned_to || action.admin_name}</td>
                  <td>{action.due_date ? <span className={isOverdue(action.due_date) && action.status !== 'Completed' ? 'text-red' : ''}>{action.due_date}</span> : <span className="table-muted">—</span>}</td>
                  <td>
                    {editingId === action.id ? (
                      <select defaultValue={action.status} onChange={e => { onUpdate(action.id, { status: e.target.value }); setEditingId(null) }} autoFocus onBlur={() => setEditingId(null)}>
                        <option>Planned</option><option>In Progress</option><option>Completed</option>
                      </select>
                    ) : (
                      <button className="status-edit-btn" onClick={() => setEditingId(action.id)}><StatusBadge status={action.status || 'Planned'} /></button>
                    )}
                  </td>
                  <td><time className="table-muted">{displayTime(action.timestamp)}</time></td>
                  <td>{action.notes && <span className="notes-indicator" title={action.notes}><MoreHorizontal size={14} /></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <EmptyState icon={ClipboardList} title="No interventions yet" body={statusFilter === 'All' ? 'Create the first intervention above.' : `No ${statusFilter.toLowerCase()} interventions.`} />}
        </div>
      </Panel>
      <div className="persistence-note"><ShieldAlert size={14} /><span>Interventions are saved to the backend JSON store. On Render free tier, this file resets on each deploy. For persistent storage, export the data or connect a database.</span></div>
    </>
  )
}

function SimulatorPage({ students }) {
  const [studentId, setStudentId] = useState('')
  const [student, setStudent] = useState(null)
  const [sliders, setSliders] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const simFields = [
    { key: 'attendance_pct', label: 'Attendance %', min: 0, max: 100, step: 1, weight: '20%', component: 'Attendance' },
    { key: 'assignment_completion', label: 'Assignment Completion %', min: 0, max: 100, step: 1, weight: 'Part of LMS (15%)', component: 'LMS activity' },
    { key: 'cgpa', label: 'CGPA', min: 0, max: 10, step: 0.1, weight: 'Part of Academic (35%)', component: 'Academic' },
    { key: 'coding_score', label: 'Coding Score', min: 0, max: 100, step: 1, weight: 'Part of Placement (15%)', component: 'Placement' },
    { key: 'aptitude_score', label: 'Aptitude Score', min: 0, max: 100, step: 1, weight: 'Part of Placement (15%)', component: 'Placement' },
    { key: 'technical_score', label: 'Technical Score', min: 0, max: 100, step: 1, weight: 'Part of Skills (15%)', component: 'Skills' },
  ]

  function pickStudent(id) {
    setStudentId(id); setResult(null); setError('')
    const s = students.find(st => (st.student_id || st.id) === id)
    if (s) {
      setStudent(s)
      setSliders({
        attendance_pct: s.attendance_pct ?? s.attendance ?? 75,
        assignment_completion: s.assignment_completion ?? 70,
        cgpa: s.cgpa ?? 7.0,
        coding_score: s.coding_score ?? s.coding ?? 60,
        aptitude_score: s.aptitude_score ?? s.aptitude ?? 60,
        technical_score: s.technical_score ?? 60,
      })
    }
  }

  async function runSimulation() {
    if (!studentId) return
    setBusy(true); setError('')
    try {
      const payload = { student_id: studentId }
      Object.entries(sliders).forEach(([k, v]) => {
        const orig = student?.[k] ?? student?.[k.replace('_pct', '').replace('_score', '')]
        if (orig !== undefined && Math.abs(v - orig) > 0.001) payload[k] = Number(v)
      })
      const r = await simulate(payload)
      setResult(r)
    } catch (e) {
      setError(e.message || 'Simulation failed.')
      // Fallback: local calculation
      if (student) {
        const a_comp = Math.min(100, (sliders.cgpa / 10) * 100 * 0.65 + ((student.internal_marks ?? 50) + (student.exam_marks ?? 50)) / 2 * 0.35)
        const lms_comp = Math.min(100, (student.login_frequency ?? 12) / 24 * 100 * 0.35) + sliders.assignment_completion * 0.65
        const place_comp = sliders.aptitude_score * 0.45 + sliders.coding_score * 0.45 + Math.min(100, (student.mock_interviews ?? 1) / 5 * 100) * 0.10
        const skills_comp = sliders.technical_score * 0.6 + (student.soft_skill_score ?? 60) * 0.4
        const sim_score = Math.round(Math.max(0, Math.min(100, a_comp * 0.35 + sliders.attendance_pct * 0.20 + lms_comp * 0.15 + skills_comp * 0.15 + place_comp * 0.15)))
        setResult({ student_id: studentId, student_name: student.name, baseline_score: student.success_score ?? student.score, simulated_score: sim_score, delta: sim_score - (student.success_score ?? student.score), baseline_components: student.score_components || {}, simulated_components: { Academic: Math.round(a_comp), Attendance: Math.round(sliders.attendance_pct), 'LMS activity': Math.round(lms_comp), Placement: Math.round(place_comp), Skills: Math.round(skills_comp) }, adjusted_inputs: sliders, note: 'Hypothetical calculation only. Computed locally — API unavailable.' })
        setError('')
      }
    } finally { setBusy(false) }
  }

  const radarData = result ? Object.entries(result.simulated_components).map(([subject, value]) => ({ subject, baseline: result.baseline_components?.[subject] ?? 0, simulated: value })) : []

  return (
    <div className="simulator-layout">
      <Panel className="simulator-controls">
        <PanelHeading title="Configure simulation" subtitle="Adjust indicators to see their effect on the Success Score" />
        <div className="sim-student-select">
          <label>Select student</label>
          <select value={studentId} onChange={e => pickStudent(e.target.value)}>
            <option value="">Choose a student…</option>
            {students.map(s => <option key={s.student_id || s.id} value={s.student_id || s.id}>{s.name} — Score: {s.success_score ?? s.score}, Risk: {s.risk}</option>)}
          </select>
        </div>
        {student && (
          <div className="sim-sliders">
            {simFields.map(field => (
              <div className="sim-field" key={field.key}>
                <div className="sim-field-head">
                  <label>{field.label}</label>
                  <span className="sim-weight">{field.weight}</span>
                  <b className="sim-value">{Number(sliders[field.key] ?? 0).toFixed(field.step < 1 ? 1 : 0)}</b>
                </div>
                <div className="sim-slider-row">
                  <span className="sim-orig" title="Baseline value">{Number(student[field.key] ?? student[field.key.replace('_pct', '').replace('_score', '')] ?? 0).toFixed(field.step < 1 ? 1 : 0)}</span>
                  <input type="range" min={field.min} max={field.max} step={field.step} value={sliders[field.key] ?? 0} onChange={e => setSliders(s => ({ ...s, [field.key]: parseFloat(e.target.value) }))} aria-label={field.label} />
                </div>
              </div>
            ))}
            {error && <div className="sim-error"><AlertTriangle size={14} /> {error}</div>}
            <button className="button button-primary sim-run" onClick={runSimulation} disabled={busy || !studentId}>{busy ? 'Simulating…' : 'Run simulation'}</button>
          </div>
        )}
        {!student && <EmptyState icon={FlaskConical} title="Select a student above" body="Choose any student from the cohort to start the simulation." />}
      </Panel>

      <div className="simulator-results">
        {result ? (
          <>
            <Panel className="sim-score-panel">
              <PanelHeading title={result.student_name} subtitle="Hypothetical score comparison · does not modify any stored record" />
              <div className="sim-score-compare">
                <div className="sim-score-box sim-baseline"><span>BASELINE</span><b>{result.baseline_score}</b><small>/ 100</small></div>
                <div className={`sim-arrow ${result.delta > 0 ? 'arrow-up' : result.delta < 0 ? 'arrow-down' : 'arrow-flat'}`}>
                  {result.delta > 0 ? <ArrowUpRight size={28} /> : result.delta < 0 ? <ArrowDownRight size={28} /> : <ArrowRight size={28} />}
                  <span>{result.delta > 0 ? '+' : ''}{result.delta} pts</span>
                </div>
                <div className="sim-score-box sim-simulated"><span>SIMULATED</span><b>{result.simulated_score}</b><small>/ 100</small></div>
              </div>
              <div className="sim-note"><FlaskConical size={13} /> <span>{result.note}</span></div>
            </Panel>
            <Panel>
              <PanelHeading title="Component comparison" subtitle="Baseline vs. simulated score components" />
              <div className="radar-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="#2b3549" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca9bf', fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Baseline" dataKey="baseline" stroke="#59a8ff" fill="#59a8ff" fillOpacity={.15} strokeWidth={2} strokeDasharray="4 2" />
                    <Radar name="Simulated" dataKey="simulated" stroke="#9a86ff" fill="#8975ff" fillOpacity={.3} strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#8794aa' }} />
                    <Tooltip content={<ChartTip suffix=" / 100" />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel>
              <PanelHeading title="Changed indicators" subtitle="Inputs adjusted from baseline" />
              <div className="sim-changes">
                {Object.entries(result.adjusted_inputs).map(([key, val]) => {
                  const orig = student?.[key] ?? 0
                  const delta = val - orig
                  return (
                    <div className="sim-change-row" key={key}>
                      <span>{key.replace(/_/g, ' ')}</span>
                      <div className="sim-change-vals">
                        <b className="sim-orig-val">{Number(orig).toFixed(1)}</b>
                        <ArrowRight size={12} />
                        <b className={delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}>{Number(val).toFixed(1)}</b>
                        <span className={`sim-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
            <div className="sim-formula-note">
              <b>Formula reminder</b>
              <span>Success Score = 0.35 × Academic + 0.20 × Attendance + 0.15 × LMS + 0.15 × Skills + 0.15 × Placement readiness. All components normalized to 0–100. This is a hypothetical calculation — it does not predict actual student outcomes or modify any stored data.</span>
            </div>
          </>
        ) : (
          <Panel>
            <EmptyState icon={FlaskConical} title="Results will appear here" body="Select a student and run the simulation to see the score breakdown and comparison." />
          </Panel>
        )}
      </div>
    </div>
  )
}

function InsightsPage({ insights, students, onStudents, cohortMode }) {
  const icons = [Activity, Target, BookOpenCheck, GraduationCap, Sparkles]
  const tones = ['violet', 'amber', 'blue', 'red', 'mint']
  return (
    <>
      <div className="insight-page-hero">
        <div className="ai-badge"><Sparkles size={14} /> GENERATED FROM COHORT SIGNALS</div>
        <h2>From student signals to next steps.</h2>
        <p>These patterns are calculated from {cohortMode === 'uploaded cohort' ? 'your uploaded cohort' : 'synthetic demo data'} to help campus teams decide where to investigate and act.</p>
        <button className="button button-primary" onClick={onStudents}>Open student directory <ArrowRight size={15} /></button>
      </div>
      <section className="insight-cards">
        {insights.map((insight, i) => {
          const Icon = icons[i % icons.length]
          return (
            <article className={`insight-card insight-${tones[i % tones.length]}`} key={insight.title}>
              <div className="insight-card-top"><div className="insight-card-icon"><Icon size={18} /></div><span>COHORT INSIGHT 0{i + 1}</span></div>
              <div className="insight-number">{insight.value}</div>
              <h3>{insight.title}</h3>
              <p>{insight.detail}</p>
              <div className="suggested-action"><div><Zap size={14} /> SUGGESTED ACTION</div><span>{insight.action}</span></div>
              <button className="insight-link" onClick={onStudents}>Review affected students <ArrowRight size={14} /></button>
            </article>
          )
        })}
      </section>
      <div className="insight-disclaimer"><Sparkles size={15} /><span>Insights are decision-support prompts. Validate causes with students and faculty before acting.</span></div>
    </>
  )
}

function ReportsPage({ students, overview }) {
  const [exportType, setExportType] = useState('full')
  const formula = [
    { component: 'Academic', weight: '35%', calculation: '0.65 × (CGPA/10 × 100) + 0.35 × mean(internal, exam marks)' },
    { component: 'Attendance', weight: '20%', calculation: 'Overall attendance percentage' },
    { component: 'LMS activity', weight: '15%', calculation: '0.35 × min(logins/24×100, 100) + 0.65 × assignment_completion' },
    { component: 'Skills', weight: '15%', calculation: '0.60 × technical_score + 0.40 × soft_skill_score' },
    { component: 'Placement', weight: '15%', calculation: '0.45 × aptitude + 0.45 × coding + 0.10 × min(mock_interviews/5×100, 100)' },
  ]
  function doExport() {
    const cols = exportType === 'full'
      ? ['student_id', 'name', 'department', 'success_score', 'risk', 'attendance_pct', 'cgpa', 'academic_component', 'lms_component', 'placement_component', 'skills_component', 'engagement_component', 'placement_gap', 'placement_ready', 'segment', 'risk_reasons']
      : ['student_id', 'name', 'department', 'success_score', 'risk', 'placement_gap']
    const rows = [cols, ...students.map(s => cols.map(c => {
      const v = s[c]; if (Array.isArray(v)) return v.join('; '); return v ?? ''
    }))]
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `campuspulse-report-${exportType}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <>
      <div className="reports-grid">
        <Panel>
          <PanelHeading title="Export student data" subtitle="Download filtered cohort data as CSV" />
          <div className="export-options">
            {[['full', 'Full report', 'All indicators, components, risk flags, and segments'], ['summary', 'Summary report', 'Student ID, name, department, score, risk, placement gap']].map(([id, label, desc]) => (
              <label key={id} className={`export-option ${exportType === id ? 'export-option-active' : ''}`}>
                <input type="radio" name="export-type" value={id} checked={exportType === id} onChange={() => setExportType(id)} />
                <b>{label}</b><span>{desc}</span>
              </label>
            ))}
          </div>
          <button className="button button-primary" onClick={doExport}><Download size={16} /> Download {students.length} students as CSV</button>
        </Panel>

        <Panel>
          <PanelHeading title="Cohort snapshot" subtitle="Current session statistics" />
          <div className="snapshot-stats">
            {[
              ['Total students', fmt(overview.kpis.students)],
              ['Average success score', `${overview.kpis.avg_score} / 100`],
              ['High risk', fmt(overview.kpis.high_risk)],
              ['Need attention (H+M)', fmt(overview.kpis.need_attention)],
              ['Placement ready', fmt(overview.kpis.placement_ready)],
              ['Placement gap', fmt(overview.kpis.placement_gap)],
              ['Data coverage', `${fmt(overview.data_quality?.coverage)}%`],
            ].map(([label, value]) => (
              <div className="snapshot-stat-row" key={label}><span>{label}</span><b>{value}</b></div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeading title="Score methodology" subtitle="How the Success Score is calculated for each student" />
        <div className="methodology-table">
          <table className="student-table">
            <thead><tr><th>COMPONENT</th><th>WEIGHT</th><th>CALCULATION</th></tr></thead>
            <tbody>
              {formula.map(row => (
                <tr key={row.component}>
                  <td><b>{row.component}</b></td>
                  <td><span className="weight-badge">{row.weight}</span></td>
                  <td className="formula-cell">{row.calculation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="methodology-note">
          <div className="rule-box"><b>Risk thresholds</b>
            <ul>
              <li><b>High:</b> Score &lt; 55 or attendance &lt; 65% or ≥ 2 active backlogs</li>
              <li><b>Medium:</b> Not High, and score &lt; 70 or attendance &lt; 75% or LMS &lt; 45</li>
              <li><b>Low:</b> None of the above apply</li>
            </ul>
          </div>
          <p>All components are normalized to 0–100. Weights total 1.00. Missing data is imputed with the cohort median and tracked via coverage indicators. This formula is a prototype requiring validation before real-world use in high-stakes decisions.</p>
        </div>
      </Panel>
    </>
  )
}

function StudentDrawer({ student, onClose, onAssign }) {
  const components = student.score_components
    ? Object.entries(student.score_components).map(([subject, value]) => ({ subject, value: Number(value || 0) }))
    : [['Academic', student.academic], ['Attendance', student.attendance], ['LMS activity', student.lms], ['Placement', student.placement], ['Skills', student.skills], ['Engagement', student.engagement]].map(([subject, value]) => ({ subject, value: Number(value || 0) }))
  const [action, setAction] = useState(student.placement_gap ? 'Coding and aptitude bridge cohort' : student.risk === 'High' ? 'Advisor check-in' : 'Faculty mentor check-in')
  const [interventionType, setInterventionType] = useState(student.placement_gap ? 'Placement Bridge' : student.risk === 'High' ? 'Attendance Follow-up' : 'General Support')
  const [reason, setReason] = useState((student.risk_reasons?.[0]) || '')
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const reasons = student.risk_reasons || []
  async function handleAssign() {
    setSaving(true)
    await onAssign(student, { action, intervention_type: interventionType, reason, status: 'Planned' })
    setSaving(false)
  }
  return (
    <div className="drawer-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className="student-drawer" role="dialog" aria-label={`Profile: ${student.name}`}>
        <div className="drawer-top"><span>STUDENT PROFILE</span><button className="icon-button" onClick={onClose} aria-label="Close profile"><X size={18} /></button></div>
        <div className="drawer-student-head">
          <div className="drawer-avatar">{initials(student.name)}</div>
          <div><h2>{student.name}</h2><span>{student.student_id || student.id} <i>·</i> {student.department}</span></div>
          <RiskBadge risk={student.risk} />
        </div>
        <div className="profile-score">
          <ScoreRing score={student.success_score ?? student.score} size={72} />
          <div>
            <span>STUDENT SUCCESS SCORE</span>
            <b>{student.success_score ?? student.score}<small> / 100</small></b>
            <p>Semester {student.semester || 6} · {student.segment || '—'}</p>
          </div>
        </div>
        {student.data_coverage < 100 && (
          <div className="data-coverage-note">
            <AlertTriangle size={14} />
            <span>Data coverage: {student.data_coverage}% · Missing: {student.missing_indicators?.join(', ')}. Treat profile as incomplete.</span>
          </div>
        )}
        <div className="drawer-section">
          <div className="drawer-section-title">SUCCESS SCORE COMPONENTS <span>6 INDICATORS</span></div>
          <div className="radar-wrap">
            <ResponsiveContainer width="100%" height={245}>
              <RadarChart data={components} outerRadius="72%">
                <PolarGrid stroke="#2b3549" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca9bf', fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Student" dataKey="value" stroke="#9a86ff" fill="#8975ff" fillOpacity={.3} strokeWidth={2} />
                <Tooltip content={<ChartTip suffix=" / 100" />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="drawer-section">
          <div className="drawer-section-title">WHY THIS SCORE? <span>EXPLAINABLE · RULE-BASED</span></div>
          {reasons.length ? (
            <div className="reason-list">{reasons.map((reason, i) => <div key={i}><span>{i + 1}</span>{reason}</div>)}</div>
          ) : (
            <div className="no-reasons"><Check size={15} /> No immediate risk signals. Keep building momentum.</div>
          )}
        </div>
        {student.history?.length > 1 && (
          <div className="drawer-section">
            <div className="drawer-section-title" style={{ cursor: 'pointer' }} onClick={() => setShowHistory(h => !h)}>
              SEMESTER HISTORY <span>{showHistory ? 'HIDE' : 'SHOW'}</span>
            </div>
            {showHistory && (
              <div className="chart-wrap" style={{ height: 150, marginTop: 8 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={student.history} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <CartesianGrid stroke="#2b3549" vertical={false} />
                    <XAxis dataKey="semester" axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 9 }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#77859d', fontSize: 9 }} />
                    <Tooltip content={<ChartTip suffix=" / 100" />} />
                    <Line type="monotone" dataKey="score" stroke="#9a86ff" strokeWidth={2} dot={{ r: 3, fill: '#9a86ff' }} name="Success Score" />
                    <Line type="monotone" dataKey="attendance" stroke="#40d5aa" strokeWidth={2} dot={{ r: 3, fill: '#40d5aa' }} strokeDasharray="3 2" name="Attendance" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
        {student.placement_gap && (
          <div className="drawer-gap"><Target size={16} /><div><b>Placement Gap flagged</b><span>CGPA {student.cgpa} is strong, while coding ({student.coding_score || student.coding}) or aptitude ({student.aptitude_score || student.aptitude}) is below the cohort median.</span></div></div>
        )}
        <div className="drawer-section">
          <div className="drawer-section-title">ASSIGN INTERVENTION</div>
          <div className="assign-form">
            <select value={interventionType} onChange={e => setInterventionType(e.target.value)} className="assign-type-select">
              <option>General Support</option><option>Academic Remediation</option><option>Attendance Follow-up</option>
              <option>Placement Bridge</option><option>Counseling</option><option>Peer Mentoring</option>
            </select>
            <textarea className="assign-input" value={action} onChange={e => setAction(e.target.value)} rows={2} placeholder="Describe the support action…" />
            <input className="assign-input" type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Linked risk reason (optional)" />
            <button className="button button-primary assign-button" onClick={handleAssign} disabled={saving || !action.trim()}>
              {saving ? 'Saving…' : <><Zap size={15} /> Assign intervention</>}
            </button>
          </div>
        </div>
        {student.recommendations?.length > 0 && (
          <div className="drawer-section">
            <div className="drawer-section-title">RECOMMENDED NEXT STEPS</div>
            <div className="rec-list">{student.recommendations.slice(0, 3).map((r, i) => <div key={i}><Check size={13} />{r}</div>)}</div>
          </div>
        )}
      </aside>
    </div>
  )
}

function ChatWidget({ workspace, onStudent }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState(() => { try { return JSON.parse(localStorage.getItem('campuspulse-copilot') || '[]') } catch { return [] } })
  const endRef = useRef(null)
  useEffect(() => { localStorage.setItem('campuspulse-copilot', JSON.stringify(messages.slice(-30).map(({ role, content }) => ({ role, content })))) }, [messages])
  useEffect(() => { const open = () => setOpen(true); window.addEventListener('campuspulse:open-chat', open); return () => window.removeEventListener('campuspulse:open-chat', open) }, [])
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [open, messages, busy])
  const welcome = { role: 'assistant', content: 'Hello! I\'m your CampusPulse AI Copilot. Ask me about student risk, attendance, placement readiness, segments, interventions, or the score formula.', mode: 'demo' }
  const visibleMessages = messages.length ? messages : [welcome]
  async function send(text = question) {
    const value = text.trim(); if (!value || busy) return
    setQuestion(''); setMessages(c => [...(c.length ? c : [welcome]), { role: 'user', content: value }]); setBusy(true)
    try {
      const reply = await askAssistant(value, workspace)
      setMessages(c => [...c, { role: 'assistant', content: reply.answer, related: reply.related_students || [], mode: reply.mode || 'live' }])
    } catch { setMessages(c => [...c, { role: 'assistant', content: 'I couldn\'t read the cohort data. Please try again in a moment.', mode: 'demo' }]) }
    finally { setBusy(false) }
  }
  const PROMPTS = ['Who needs support today?', 'Which dept has lowest placement?', 'Show placement gap students', 'Explain the success score', 'Any pending interventions?']
  return (
    <>
      {open && (
        <section className="copilot-panel" aria-label="CampusPulse AI Copilot">
          <header className="copilot-head">
            <div className="copilot-brand"><div className="copilot-avatar"><Bot size={18} /></div><div><b>CampusPulse Copilot</b><span><i /> Cohort-aware · data-backed</span></div></div>
            <div className="copilot-head-actions">
              <button title="Clear chat" onClick={() => setMessages([])}><MoreHorizontal size={17} /></button>
              <button title="Close" onClick={() => setOpen(false)}><X size={17} /></button>
            </div>
          </header>
          <div className="copilot-context"><Sparkles size={13} /><span>Answers use real cohort indicators. No external LLM — deterministic, data-backed responses.</span></div>
          <div className="copilot-messages">
            {visibleMessages.map((message, index) => (
              <div className={`chat-message chat-${message.role}`} key={`${index}-${message.content.slice(0, 12)}`}>
                {message.role === 'assistant' && <div className="message-avatar"><Bot size={13} /></div>}
                <div className="message-body">
                  <div className="message-bubble">{message.content}</div>
                  {message.role === 'assistant' && <div className="message-source">{message.mode === 'live' ? 'LIVE COHORT DATA' : 'DEMO COHORT DATA'} <span>·</span> decision support</div>}
                  {message.related?.length > 0 && (
                    <div className="chat-related">
                      {message.related.slice(0, 4).map((student, i) => (
                        <button key={student.student_id || student.id || i} onClick={() => onStudent(student)}>
                          <span className="related-dot" /><span>{student.name}</span><b>{student.risk || 'Profile'}</b><ArrowUpRight size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="chat-prompts">
                <span>TRY ASKING</span>
                {PROMPTS.map(item => <button key={item} onClick={() => send(item)}>{item}<ArrowRight size={13} /></button>)}
              </div>
            )}
            {busy && <div className="chat-message chat-assistant"><div className="message-avatar"><Bot size={13} /></div><div className="message-bubble typing-bubble"><i /><i /><i /></div></div>}
            <div ref={endRef} />
          </div>
          <form className="copilot-composer" onSubmit={e => { e.preventDefault(); send() }}>
            <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about your students…" aria-label="Ask CampusPulse AI" />
            <button type="submit" disabled={!question.trim() || busy} aria-label="Send message"><Send size={16} /></button>
            <span>ENTER</span>
          </form>
        </section>
      )}
      <button className={`copilot-launch ${open ? 'copilot-launch-open' : ''}`} onClick={() => setOpen(!open)} aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}>
        {open ? <X size={20} /> : <><MessageCircle size={20} /><i /></>}
      </button>
    </>
  )
}

export default App
