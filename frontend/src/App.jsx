import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpenCheck, Bot, BriefcaseBusiness, CalendarDays,
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Download, FileUp, Filter, GraduationCap,
  LayoutDashboard, Menu, MessageCircle, MoreHorizontal, Search, Send, ShieldAlert, Sparkles, Target, Users, X, Zap,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid,
  PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import { askAssistant, loadWorkspace, saveIntervention, importCsvFiles } from './api.js'

const nav = [
  {id:'overview',label:'Overview',icon:LayoutDashboard,group:'WORKSPACE'},
  {id:'students',label:'Student directory',icon:Users,badge:true},
  {id:'risk',label:'Risk analysis',icon:ShieldAlert},
  {id:'placement',label:'Placement readiness',icon:BriefcaseBusiness},
  {id:'segments',label:'Student segments',icon:Target},
  {id:'insights',label:'AI insights',icon:Sparkles,group:'INTELLIGENCE'},
]
const fmt = (value) => Number(value || 0).toLocaleString('en-IN')
const avatarColors = ['#222d49','#27244b','#173c43','#44312c','#263b30']
const palette = {High:'#ff667b',Medium:'#f5bd57',Low:'#40d5aa',violet:'#c3a66e',blue:'#75b7d9'}
const dateLabel = new Intl.DateTimeFormat('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date())
const hour = new Date().getHours()
const greeting = hour < 12 ? 'Good morning, team' : hour < 17 ? 'Good afternoon, team' : 'Good evening, team'

function initials(name='Student'){return name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}
function displayTime(value){if(!value)return 'Just now';const date=new Date(value);return Number.isNaN(+date)?value:new Intl.DateTimeFormat('en-IN',{hour:'numeric',minute:'2-digit'}).format(date)}

function App(){
  const [workspace,setWorkspace]=useState(null)
  const [page,setPage]=useState('overview')
  const [query,setQuery]=useState('')
  const [department,setDepartment]=useState('All departments')
  const [riskFilter,setRiskFilter]=useState('All risk levels')
  const [showGap,setShowGap]=useState(false)
  const [selected,setSelected]=useState(null)
  const [toast,setToast]=useState('')
  const [mobileOpen,setMobileOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const uploadRef=useRef(null)

  const refresh=async()=>setWorkspace(await loadWorkspace())
  useEffect(()=>{refresh()},[])
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),3600);return()=>clearTimeout(id)},[toast])
  const students=workspace?.students || []
  const filtered=useMemo(()=>students.filter(s=>{
    const match=(s.name||'').toLowerCase().includes(query.toLowerCase())||(s.student_id||s.id||'').toLowerCase().includes(query.toLowerCase())
    return match&&(department==='All departments'||s.department===department)&&(riskFilter==='All risk levels'||s.risk===riskFilter)&&(!showGap||s.placement_gap)
  }),[students,query,department,riskFilter,showGap])
  const openStudent=(student)=>setSelected(student)

  async function onUpload(event){
    const files=[...(event.target.files||[])];if(!files.length)return
    setBusy(true)
    try{const result=await importCsvFiles(files);await refresh();setToast(`Imported ${fmt(result.students)} students from ${result.sources.length} source tables.`)}
    catch(error){setToast(`Import needs the FastAPI backend: ${error.message}`)}
    finally{setBusy(false);event.target.value=''}
  }

  async function assign(student,action){
    const saved=await saveIntervention({student_id:student.student_id||student.id,action,admin_name:'Academic Success Admin',student})
    setWorkspace(current=>({...current,actions:[saved,...(current?.actions||[])],overview:{...current?.overview,last_actions:[saved,...(current?.overview?.last_actions||[])]}}))
    setToast(saved.local?'Assigned in demo mode · saved on this device':'Intervention assigned and added to the action feed')
    setSelected(null)
  }

  if(!workspace)return <div className="loading-screen"><div className="brand-mark">cp</div><div className="loading-copy">Preparing your campus pulse<span /></div></div>
  const overview=workspace.overview
  const pageTitles={overview:[greeting,'Here’s your campus pulse. Let’s make every student count.'],students:['Student directory','Search the cohort, understand individual needs, and assign support.'],risk:['Risk analysis','Find the signals behind student risk and decide where to act first.'],placement:['Placement readiness','Turn skill signals into focused preparation pathways.'],segments:['Student segments','Four actionable student profiles, each with a focused playbook.'],insights:['AI insights','Cohort patterns translated into practical next steps.']}
  return <div className="app-shell min-h-screen bg-canvas text-ink">
    <aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
      <div className="brand"><div className="brand-mark">cp</div><div><div className="brand-name">campuspulse<span>AI</span></div><div className="brand-caption">STUDENT INTELLIGENCE</div></div><button className="icon-button sidebar-close" onClick={()=>setMobileOpen(false)}><X size={17}/></button></div>
      <div className="campus-switch"><div className="campus-avatar">N</div><div className="campus-name"><b>Northstar Campus</b><span>Academic workspace</span></div><ChevronDown size={15}/></div>
      <nav className="side-nav">
        {nav.map((item,i)=><div key={item.id}>{item.group&&<div className={`nav-group ${i?'nav-group-spaced':''}`}>{item.group}</div>}<button className={`nav-link ${page===item.id?'nav-active':''}`} onClick={()=>{setPage(item.id);setMobileOpen(false)}}><item.icon size={18}/><span>{item.label}</span>{item.badge&&<b className="nav-count">{fmt(overview.kpis.need_attention)}</b>}</button></div>)}
      </nav>
      <div className="sidebar-bottom"><div className="term-card"><div className="term-label"><CalendarDays size={14}/> ACTIVE TERM</div><b>AY 2025–26 <span>·</span> Semester 6</b><div className="term-progress"><i/></div></div><button className="user-card"><div className="user-avatar">AS</div><div><b>Academic success</b><span>Administrator</span></div><MoreHorizontal size={17}/></button><div className="sidebar-foot">CampusPulse AI <span>v1.0</span></div></div>
    </aside>

    {mobileOpen&&<button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" onClick={()=>setMobileOpen(true)}><Menu size={19}/></button><span>Workspace</span><ChevronRight size={14}/><b>{nav.find(item=>item.id===page)?.label||'Overview'}</b></div><div className="topbar-right"><div className={`sync-status ${workspace.mode==='live'?'is-live':''}`}><span/>{workspace.mode==='live'?'Connected to live data':'Demo data · offline ready'}</div><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-user"><div className="top-avatar">AS</div><div><b>Academic Success</b><span>Administrator</span></div><ChevronDown size={14}/></div><button className="help-button"><CircleHelp size={15}/> Help</button></div></header>
      <div className="page-wrap">
        <div className={`page-heading ${page==='overview'?'overview-heading':''}`}><div><div className="date-kicker">{dateLabel}<span>•</span> SEMESTER {overview.semester || 6}</div><h1>{pageTitles[page][0]}</h1><p>{pageTitles[page][1]}</p></div><div className="heading-actions"><input ref={uploadRef} type="file" accept=".csv" multiple hidden onChange={onUpload}/>{page==='overview'&&<button className="button copilot-shortcut" onClick={()=>window.dispatchEvent(new Event('campuspulse:open-chat'))}><Sparkles size={15}/> Ask AI Copilot</button>}<button className="button button-quiet" onClick={()=>uploadRef.current?.click()} disabled={busy}><FileUp size={16}/>{busy?'Importing…':'Import data'}</button><button className="button button-primary" onClick={()=>downloadStudents(students)}><Download size={16}/> Export report</button></div></div>
        {page==='overview'&&<section className="campus-snapshot"><div className="snapshot-copy"><div className="snapshot-label"><span/> CAMPUS PULSE <i>·</i> SEMESTER {overview.semester||6}</div><h2>One campus. <em>Every student.</em></h2><p>Signals from academics, attendance and career readiness, brought into one clear view.</p></div><div className="snapshot-score"><ScoreRing score={overview.kpis.avg_score} size={63}/><div><span>COHORT SUCCESS</span><b>{overview.kpis.avg_score}<small> / 100</small></b><i><ArrowUpRight size={12}/> Momentum rising</i></div></div><div className="snapshot-stat"><span>NEEDS A CHECK-IN</span><b>{fmt(overview.kpis.need_attention)}<small> students</small></b><i>Across the current cohort</i></div><div className="snapshot-art"><div className="snapshot-orbit orbit-one"/><div className="snapshot-orbit orbit-two"/><div className="snapshot-orbit orbit-three"/><div className="snapshot-core"><Activity size={25}/></div></div></section>}
        {page==='overview'&&<Overview data={overview} segments={workspace.segments} students={students} actions={workspace.actions} onPage={setPage} onStudent={openStudent}/>}
        {page==='students'&&<StudentsPage students={filtered} allStudents={students} departments={workspace.departments} query={query} setQuery={setQuery} department={department} setDepartment={setDepartment} riskFilter={riskFilter} setRiskFilter={setRiskFilter} showGap={showGap} setShowGap={setShowGap} onStudent={openStudent}/>}
        {page==='risk'&&<RiskPage students={students} onStudent={openStudent}/>}
        {page==='placement'&&<PlacementPage data={workspace.placement} students={students} onStudent={openStudent}/>}
        {page==='segments'&&<SegmentsPage segments={workspace.segments} onStudent={openStudent}/>}
        {page==='insights'&&<InsightsPage insights={workspace.insights} students={students} onStudents={()=>setPage('students')}/>}
        <footer className="page-footer"><span>CampusPulse AI <b>·</b> decision support for student success</span><span>All student records shown are synthetic demo data</span></footer>
      </div>
    </main>
    {selected&&<StudentDrawer student={selected} onClose={()=>setSelected(null)} onAssign={assign}/>}
    <ChatWidget workspace={workspace} onStudent={openStudent}/>
    {toast&&<div className="toast"><div className="toast-icon"><Check size={16}/></div><span>{toast}</span><button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>
}

function downloadStudents(students){
  const rows=[['student_id','name','department','success_score','risk','attendance','cgpa','placement_gap'],...students.map(s=>[s.student_id||s.id,s.name,s.department,s.success_score??s.score,s.risk,s.attendance_pct??s.attendance,s.cgpa,s.placement_gap])]
  const csv=rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n')
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='campuspulse-student-report.csv';a.click();URL.revokeObjectURL(url)
}

function KpiCard({label,value,unit,delta,icon:Icon,tone='violet',note}){return <div className={`kpi-card kpi-${tone}`}><div className="kpi-top"><span>{label}</span><div className="kpi-icon"><Icon size={17}/></div></div><div className="kpi-value">{value}<small>{unit}</small></div><div className="kpi-foot">{delta&&<b className={delta.startsWith('−')?'negative':'positive'}>{delta}</b>}<span>{note}</span></div></div>}
function PanelHeading({title,subtitle,action}){return <div className="panel-heading"><div><h3>{title}</h3><p>{subtitle}</p></div>{action}</div>}
function RiskBadge({risk}){return <span className={`risk-badge risk-${(risk||'Low').toLowerCase()}`}><i/>{risk||'Low'}</span>}
function ScoreRing({score,size=44}){const color=score<55?palette.High:score<70?palette.Medium:palette.Low;return <div className="score-ring" style={{'--score':`${score}%`,'--ring-color':color,width:size,height:size}}><span>{score}</span></div>}

function Overview({data,segments,students,actions,onPage,onStudent}){
  const k=data.kpis
  const recent=data.last_actions?.length?data.last_actions:actions
  return <>
    <section className="kpi-grid">
      <KpiCard label="STUDENTS TRACKED" value={fmt(k.students)} icon={Users} tone="blue" delta="↑ 8.2%" note="vs. last semester"/>
      <KpiCard label="AVG. SUCCESS SCORE" value={k.avg_score} unit={<em>/ 100</em>} icon={Activity} tone="violet" delta="↑ 3.4 pts" note="vs. last semester"/>
      <KpiCard label="NEED ATTENTION" value={fmt(k.need_attention)} icon={ShieldAlert} tone="red" delta={`${Math.round(k.need_attention/Math.max(k.students,1)*100)}%`} note="of students tracked"/>
      <KpiCard label="PLACEMENT READY" value={fmt(k.placement_ready)} icon={BriefcaseBusiness} tone="green" delta="↑ 6.1%" note="eligible & prepared"/>
      <KpiCard label="PLACEMENT GAP" value={fmt(k.placement_gap)} icon={Target} tone="amber" delta="!" note="CGPA > 7.5, skills below median"/>
    </section>

    <section className="insight-banner"><div className="insight-orb"><Sparkles size={19}/></div><div className="insight-text"><b>A pattern worth acting on</b><p>{data.priority_insight}</p></div><button onClick={()=>onPage('segments')}>View student segment <ArrowRight size={15}/></button><div className="banner-watermark">pulse</div></section>

    <section className="overview-grid">
      <Panel className="trend-panel"><PanelHeading title="Semester score trend" subtitle="Average student success score across semesters" action={<span className="mini-chip"><i/> COHORT AVERAGE</span>}/><div className="chart-wrap trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trends} margin={{top:14,right:10,left:-18,bottom:0}}><defs><linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8975ff" stopOpacity={.28}/><stop offset="96%" stopColor="#8975ff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#263247" vertical={false}/><XAxis dataKey="semester" axisLine={false} tickLine={false} tick={{fill:'#77859d',fontSize:11}} dy={12}/><YAxis domain={[40,100]} axisLine={false} tickLine={false} tick={{fill:'#77859d',fontSize:11}}/><Tooltip content={<ChartTip suffix=" / 100"/>}/><Area type="monotone" dataKey="score" stroke="#9682ff" strokeWidth={3} fill="url(#scoreFill)" activeDot={{r:5,stroke:'#fff',strokeWidth:2}}/></AreaChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="legend-violet"/> Success score / 100</span><span>Illustrative historical trend</span></div></Panel>
      <Panel className="distribution-panel"><PanelHeading title="Student distribution" subtitle="By current risk band" action={<button className="round-more"><MoreHorizontal size={18}/></button>}/><div className="donut-holder"><ResponsiveContainer width="55%" height={205}><PieChart><Pie data={data.risk_distribution} dataKey="value" nameKey="name" innerRadius={66} outerRadius={88} paddingAngle={3} stroke="none">{data.risk_distribution.map((entry)=><Cell key={entry.name} fill={palette[entry.name]}/>)}</Pie><Tooltip content={<ChartTip/>}/></PieChart></ResponsiveContainer><div className="donut-center"><b>{fmt(k.students)}</b><span>students</span></div><div className="risk-legend">{data.risk_distribution.map(item=><div key={item.name}><i style={{background:palette[item.name]}}/><span>{item.name==='Low'?'On track':item.name==='Medium'?'Watch':'At risk'}</span><b>{fmt(item.value)}</b></div>)}</div></div><div className="panel-footnote"><Sparkles size={15}/><span><b>{Math.round((k.students-k.need_attention)/Math.max(k.students,1)*100)}%</b> of this cohort is on track. Start with students in the watch and at-risk bands.</span></div></Panel>
    </section>

    <section className="overview-grid lower-overview">
      <Panel><PanelHeading title="Department pulse" subtitle="Average success score by department" action={<button className="text-action" onClick={()=>onPage('students')}>Explore students <ArrowRight size={14}/></button>}/><div className="chart-wrap dept-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.departments} layout="vertical" margin={{top:5,right:25,left:5,bottom:4}}><CartesianGrid stroke="#263247" horizontal={false}/><XAxis type="number" domain={[0,100]} axisLine={false} tickLine={false} tick={{fill:'#77859d',fontSize:10}}/><YAxis type="category" dataKey="department" width={130} axisLine={false} tickLine={false} tick={{fill:'#9aa7bb',fontSize:11}}/><Tooltip content={<ChartTip suffix=" / 100"/>}/><Line type="monotone" dataKey="avg_score" stroke="#47c9a2" strokeWidth={3} dot={{r:3,fill:'#47c9a2'}}/></LineChart></ResponsiveContainer></div></Panel>
      <Panel><PanelHeading title="Students to watch" subtitle="Priority outreach · sorted by success score" action={<button className="text-action" onClick={()=>onPage('risk')}>View all <ArrowRight size={14}/></button>}/><div className="watch-list">{students.filter(s=>s.risk!=='Low').sort((a,b)=>(a.success_score??a.score)-(b.success_score??b.score)).slice(0,4).map((s,i)=><button className="watch-row" key={s.student_id||s.id} onClick={()=>onStudent(s)}><div className="student-avatar" style={{background:avatarColors[i%avatarColors.length]}}>{initials(s.name)}</div><div className="watch-person"><b>{s.name}</b><span>{s.department} · {s.student_id||s.id}</span></div><div className="watch-reason">{s.risk_reasons?.[0]||`Attendance at ${s.attendance_pct??s.attendance}%`}</div><ScoreRing score={s.success_score??s.score} size={40}/></button>)}</div></Panel>
    </section>
    <Panel className="actions-panel"><PanelHeading title="Last actions" subtitle="Recent interventions assigned by your team" action={<span className="mini-chip"><i className="mint-dot"/> RECENT ACTIVITY</span>}/>{recent?.length?<div className="action-list">{recent.slice(0,5).map(action=><div className="action-row" key={action.id}><div className="action-check"><Check size={14}/></div><div className="action-copy"><b>{action.action}</b><span>{action.student_name} <i>·</i> {action.admin_name}</span></div><time>{displayTime(action.timestamp)}</time></div>)}</div>:<div className="empty-actions"><div className="empty-icon"><Zap size={18}/></div><div><b>No interventions assigned yet</b><span>Open a student profile to assign an advisor action. Your recent activity will show up here.</span></div><button onClick={()=>onPage('students')}>Explore students <ArrowRight size={14}/></button></div>}</Panel>
  </>
}

function Panel({children,className=''}){return <section className={`panel ${className}`}>{children}</section>}
function ChartTip({active,payload,label,suffix=''}){if(!active||!payload?.length)return null;return <div className="chart-tooltip"><span>{label||payload[0].name}</span>{payload.map((item)=><b key={item.dataKey} style={{color:item.color||item.fill}}>{item.name||item.dataKey}: {fmt(item.value)}{suffix}</b>)}</div>}

function StudentsPage({students,allStudents,departments,query,setQuery,department,setDepartment,riskFilter,setRiskFilter,showGap,setShowGap,onStudent}){
  const [pageIndex,setPageIndex]=useState(0);const perPage=10;const maxPage=Math.max(1,Math.ceil(students.length/perPage));const visible=students.slice(pageIndex*perPage,(pageIndex+1)*perPage)
  useEffect(()=>setPageIndex(0),[query,department,riskFilter,showGap])
  return <>
    <div className="student-summary-row"><div className="summary-chip"><Users size={16}/><b>{fmt(students.length)}</b><span>students match your filters</span></div><button className={`gap-filter ${showGap?'gap-filter-on':''}`} onClick={()=>setShowGap(!showGap)}><Target size={15}/> Placement Gap <b>{allStudents.filter(s=>s.placement_gap).length}</b><span>×</span></button></div>
    <Panel className="directory-panel"><div className="directory-toolbar"><div className="search-input"><Search size={17}/><input placeholder="Search by student name or ID…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')}><X size={14}/></button>}</div><div className="filter-select"><Filter size={15}/><select value={department} onChange={e=>setDepartment(e.target.value)}><option>All departments</option>{departments.map(d=><option key={d}>{d}</option>)}</select><ChevronDown size={14}/></div><div className="filter-select"><select value={riskFilter} onChange={e=>setRiskFilter(e.target.value)}><option>All risk levels</option><option>High</option><option>Medium</option><option>Low</option></select><ChevronDown size={14}/></div><button className="button button-quiet compact" onClick={()=>downloadStudents(students)}><Download size={15}/> Export</button></div>
      <div className="table-scroll"><table className="student-table"><thead><tr><th>STUDENT</th><th>DEPARTMENT</th><th>SUCCESS SCORE</th><th>ATTENDANCE</th><th>PLACEMENT</th><th>RISK LEVEL</th><th/></tr></thead><tbody>{visible.map((s,i)=><tr key={s.student_id||s.id} onClick={()=>onStudent(s)}><td><div className="table-student"><div className="student-avatar" style={{background:avatarColors[i%avatarColors.length]}}>{initials(s.name)}</div><div><b>{s.name}</b><span>{s.student_id||s.id}</span></div></div></td><td>{s.department}</td><td><div className="table-score"><ScoreRing score={s.success_score??s.score} size={36}/><b>{s.success_score??s.score}<small>/100</small></b></div></td><td><span className={(s.attendance_pct??s.attendance)<65?'text-red':''}>{s.attendance_pct??s.attendance}%</span></td><td>{s.placement_gap?<span className="gap-badge"><Target size={12}/> Gap</span>:s.placement_ready?<span className="ready-badge"><Check size={12}/> Ready</span>:<span className="table-muted">Building</span>}</td><td><RiskBadge risk={s.risk}/></td><td><button className="row-open"><ChevronRight size={17}/></button></td></tr>)}</tbody></table>{!visible.length&&<div className="empty-table"><Search size={20}/><b>No students match these filters</b><span>Try another name, department, or risk band.</span></div>}</div>
      <div className="table-footer"><span>Showing <b>{students.length?fmt(pageIndex*perPage+1):0}–{fmt(Math.min((pageIndex+1)*perPage,students.length))}</b> of <b>{fmt(students.length)}</b> students</span><div className="pagination"><button disabled={pageIndex===0} onClick={()=>setPageIndex(pageIndex-1)}><ChevronLeft size={15}/></button><span>{pageIndex+1} <i>/</i> {maxPage}</span><button disabled={pageIndex>=maxPage-1} onClick={()=>setPageIndex(pageIndex+1)}><ChevronRight size={15}/></button></div></div>
    </Panel>
  </>
}

function RiskPage({students,onStudent}){
  const watch=students.filter(s=>s.risk!=='Low').sort((a,b)=>(a.success_score??a.score)-(b.success_score??b.score))
  const drivers=[{label:'Attendance below 65%',count:students.filter(s=>(s.attendance_pct??s.attendance)<65).length,color:palette.High},{label:'Academic component below 55',count:students.filter(s=>(s.academic_component??s.academic)<55).length,color:palette.Medium},{label:'Low LMS engagement',count:students.filter(s=>(s.lms_component??s.lms)<45).length,color:palette.violet},{label:'Two or more active backlogs',count:students.filter(s=>(s.backlogs||0)>=2).length,color:palette.blue}]
  return <><div className="risk-metric-grid">{['High','Medium','Low'].map(band=><div className={`risk-summary risk-summary-${band.toLowerCase()}`} key={band}><span>{band==='High'?'HIGH RISK':band==='Medium'?'WATCHLIST':'ON TRACK'}</span><b>{fmt(students.filter(s=>s.risk===band).length)}</b><small>{Math.round(students.filter(s=>s.risk===band).length/Math.max(students.length,1)*100)}% of cohort</small></div>)}</div>
    <div className="two-column"><Panel><PanelHeading title="Common risk drivers" subtitle="Signals across the current cohort"/><div className="driver-list">{drivers.map((d,i)=><div className="driver-row" key={d.label}><div className="driver-rank">0{i+1}</div><div className="driver-main"><div><b>{d.label}</b><span>{d.count} students affected</span></div><div className="driver-bar"><i style={{width:`${Math.min(100,d.count/Math.max(students.length,1)*100*2.4)}%`,background:d.color}}/></div></div><b className="driver-count">{Math.round(d.count/Math.max(students.length,1)*100)}%</b></div>)}</div></Panel>
      <Panel><PanelHeading title="A supportive response" subtitle="Risk rules create a review queue, not a judgment"/><div className="response-steps">{[['01','Prioritize','Begin with High risk and rapid attendance declines.'],['02','Understand','Review each student’s reason flags and recent context.'],['03','Support','Assign a mentor, remedial session, or placement bridge.'],['04','Follow up','Check progress after two to four weeks.']].map(([n,title,detail])=><div className="response-step" key={n}><b>{n}</b><div><strong>{title}</strong><span>{detail}</span></div></div>)}</div></Panel></div>
    <Panel className="risk-table-panel"><PanelHeading title="Priority outreach list" subtitle={`${fmt(watch.length)} students could benefit from a timely faculty check-in`} action={<span className="mini-chip"><i className="red-dot"/> SUPPORT REVIEW</span>}/><div className="risk-student-list">{watch.slice(0,12).map((s,i)=><button className="risk-student-row" key={s.student_id||s.id} onClick={()=>onStudent(s)}><div className="student-avatar" style={{background:avatarColors[i%avatarColors.length]}}>{initials(s.name)}</div><div className="risk-student-name"><b>{s.name}</b><span>{s.department} · {s.student_id||s.id}</span></div><div className="risk-reasons">{(s.risk_reasons||[]).slice(0,2).map((reason,j)=><span key={j}><i/> {reason}</span>)}</div><ScoreRing score={s.success_score??s.score} size={39}/><RiskBadge risk={s.risk}/><ChevronRight size={17}/></button>)}</div></Panel>
  </>
}

function PlacementPage({data,students,onStudent}){
  const scatter=students.map(s=>({name:s.name,student_id:s.student_id||s.id,coding:s.coding_score||s.coding||0,aptitude:s.aptitude_score||s.aptitude||0,cgpa:s.cgpa,placement_gap:s.placement_gap,student:s}))
  const gap=students.filter(s=>s.placement_gap).sort((a,b)=>(a.placement_component??a.placement)-(b.placement_component??b.placement))
  return <><section className="placement-kpis"><KpiCard label="PLACEMENT READY" value={fmt(data.ready)} icon={BriefcaseBusiness} tone="green" note="meets readiness thresholds"/><KpiCard label="PLACEMENT GAP" value={fmt(data.gap)} icon={Target} tone="amber" note="strong CGPA · skill gap"/><KpiCard label="COHORT CODING MEDIAN" value={`${data.medians.coding}`} unit={<em>/ 100</em>} icon={Zap} tone="violet" note="coding assessment"/><KpiCard label="COHORT APTITUDE MEDIAN" value={`${data.medians.aptitude}`} unit={<em>/ 100</em>} icon={BookOpenCheck} tone="blue" note="aptitude assessment"/></section>
    <div className="two-column placement-layout"><Panel><PanelHeading title="Coding vs. aptitude" subtitle="Each dot is a student · upper-right indicates stronger readiness" action={<span className="mini-chip"><i className="blue-dot"/> SKILL MAP</span>}/><div className="chart-wrap scatter-chart"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:14,right:18,bottom:8,left:0}}><CartesianGrid stroke="#263247"/><XAxis type="number" dataKey="coding" domain={[20,100]} name="Coding" tick={{fill:'#77859d',fontSize:11}} axisLine={false} tickLine={false} label={{value:'CODING SCORE',position:'insideBottom',offset:-4,fill:'#77859d',fontSize:10}}/><YAxis type="number" dataKey="aptitude" domain={[20,100]} name="Aptitude" tick={{fill:'#77859d',fontSize:11}} axisLine={false} tickLine={false} label={{value:'APTITUDE',angle:-90,position:'insideLeft',fill:'#77859d',fontSize:10}}/><Tooltip cursor={{strokeDasharray:'3 3'}} content={({active,payload})=>active&&payload?.length?<div className="chart-tooltip"><b>{payload[0].payload.name}</b><span>Coding: {payload[0].payload.coding} · Aptitude: {payload[0].payload.aptitude}</span></div>:null}/><Scatter data={scatter} onClick={item=>item?.student&&onStudent(item.student)} cursor="pointer">{scatter.map((item,i)=><Cell key={i} fill={item.placement_gap?palette.Medium:item.cgpa>=7.5?palette.violet:palette.blue} fillOpacity={.78}/>)}</Scatter></ScatterChart></ResponsiveContainer><div className="scatter-legend"><span><i className="legend-amber"/> Placement gap</span><span><i className="legend-violet"/> CGPA ≥ 7.5</span><span><i className="legend-blue"/> Developing</span></div></div></Panel>
      <Panel><PanelHeading title="Readiness distribution" subtitle="Placement component by cohort band"/><div className="placement-donut"><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={data.bands} dataKey="value" nameKey="name" innerRadius={65} outerRadius={90} paddingAngle={4} stroke="none">{data.bands.map((item,i)=><Cell key={item.name} fill={[palette.Low,palette.violet,palette.Medium][i]}/>)}</Pie><Tooltip content={<ChartTip/>}/></PieChart></ResponsiveContainer><div className="donut-center"><b>{fmt(students.length)}</b><span>profiles</span></div></div><div className="band-legend">{data.bands.map((b,i)=><div key={b.name}><i style={{background:[palette.Low,palette.violet,palette.Medium][i]}}/><span>{b.name}</span><b>{fmt(b.value)}</b></div>)}</div></Panel></div>
    <Panel className="gap-panel"><PanelHeading title="Placement gap students" subtitle="High CGPA with coding or aptitude below the cohort median" action={<span className="gap-badge"><Target size={12}/> {fmt(gap.length)} flagged</span>}/><div className="compact-student-list">{gap.slice(0,8).map(s=><button className="compact-student" key={s.student_id||s.id} onClick={()=>onStudent(s)}><div className="student-avatar" style={{background:avatarColors[(s.name.length)%avatarColors.length]}}>{initials(s.name)}</div><div className="compact-student-main"><b>{s.name}</b><span>{s.department} · CGPA {s.cgpa}</span></div><span className="skill-pill">Coding <b>{s.coding_score||s.coding}</b></span><span className="skill-pill">Aptitude <b>{s.aptitude_score||s.aptitude}</b></span><span className="gap-badge"><Target size={12}/> Bridge</span><ChevronRight size={16}/></button>)}</div></Panel>
  </>
}

function SegmentsPage({segments,onStudent}){
  const meta={
    'High Performers':{tone:'mint',icon:GraduationCap,caption:'Consistent momentum'},
    'Silent Strugglers':{tone:'amber',icon:BookOpenCheck,caption:'Strong attendance · marks need support'},
    'Placement Gap':{tone:'violet',icon:Target,caption:'Academic strength · readiness gap'},
    'Disengaged':{tone:'red',icon:Activity,caption:'Low attendance · low LMS activity'},
  }
  return <><div className="segment-intro"><div><div className="eyebrow"><Sparkles size={13}/> COHORT PROFILING</div><h2>Different students need different support.</h2><p>Profiles are grouped from academic, attendance, LMS, placement, skills, and engagement signals. Use these segments to tailor outreach.</p></div><div className="cluster-note"><span>MODEL</span><b>K-means · k = 4</b><small>standardized student indicators</small></div></div>
    <section className="segment-grid">{segments.map((segment,index)=>{const m=meta[segment.name]||meta['High Performers'];const Icon=m.icon;return <article className={`segment-card segment-${m.tone}`} key={segment.name}><div className="segment-card-head"><div className="segment-icon"><Icon size={19}/></div><span className="segment-index">0{index+1}</span></div><div className="segment-caption">{m.caption}</div><h3>{segment.name}</h3><div className="segment-count"><b>{fmt(segment.size)}</b><span>students</span><small>{Math.round(segment.size/Math.max(segments.reduce((a,s)=>a+s.size,0),1)*100)}% of cohort</small></div><div className="segment-metrics"><div><span>Avg. score</span><b>{segment.avg_score}<small>/100</small></b></div><div><span>Attendance</span><b>{segment.avg_attendance}%</b></div><div><span>Avg. CGPA</span><b>{segment.avg_cgpa}</b></div></div><div className="playbook"><div className="playbook-title"><Zap size={14}/> INTERVENTION PLAYBOOK</div>{segment.playbook.map((step,i)=><div className="playbook-step" key={step}><span>{i+1}</span>{step}</div>)}</div><div className="segment-students"><div className="segment-student-title">SAMPLE STUDENTS <button onClick={()=>onStudent(segment.students?.[0])}>View profile <ArrowRight size={13}/></button></div>{segment.students?.slice(0,3).map((s,i)=><button key={s.student_id||s.id} onClick={()=>onStudent(s)}><div className="student-avatar tiny" style={{background:avatarColors[i%avatarColors.length]}}>{initials(s.name)}</div><span>{s.name}</span><b>{s.success_score??s.score}</b></button>)}</div></article>})}</section>
    <div className="method-note"><div><ShieldAlert size={16}/></div><p><b>Use profiles as a starting point for support.</b> Clusters summarize patterns in synthetic cohort data; a faculty conversation and student context should guide each intervention.</p></div>
  </>
}

function InsightsPage({insights,students,onStudents}){
  const icons=[Activity,Target,BookOpenCheck,GraduationCap,Sparkles];const tones=['violet','amber','blue','red','mint']
  return <><div className="insight-page-hero"><div className="ai-badge"><Sparkles size={14}/> GENERATED FROM COHORT SIGNALS</div><h2>From student signals to next steps.</h2><p>These patterns are calculated from the current synthetic cohort to help campus teams decide where to investigate and act.</p><button className="button button-primary" onClick={onStudents}>Open student directory <ArrowRight size={15}/></button></div><section className="insight-cards">{insights.map((insight,i)=>{const Icon=icons[i%icons.length];return <article className={`insight-card insight-${tones[i%tones.length]}`} key={insight.title}><div className="insight-card-top"><div className="insight-card-icon"><Icon size={18}/></div><span>COHORT INSIGHT 0{i+1}</span><MoreHorizontal size={17}/></div><div className="insight-number">{insight.value}</div><h3>{insight.title}</h3><p>{insight.detail}</p><div className="suggested-action"><div><Zap size={14}/> SUGGESTED ACTION</div><span>{insight.action}</span></div><button className="insight-link" onClick={onStudents}>Review affected students <ArrowRight size={14}/></button></article>})}</section><div className="insight-disclaimer"><Sparkles size={15}/><span>Insights are decision-support prompts based on demo data. Validate causes with students and faculty before acting.</span></div></>
}

function StudentDrawer({student,onClose,onAssign}){
  const components=student.score_components?Object.entries(student.score_components).map(([subject,value])=>({subject,value:Number(value||0)})):[['Academic',student.academic],['Attendance',student.attendance],['LMS activity',student.lms],['Placement',student.placement],['Skills',student.skills],['Engagement',student.engagement]].map(([subject,value])=>({subject,value:Number(value||0)}))
  const [action,setAction]=useState(student.placement_gap?'Coding and aptitude bridge cohort':student.risk==='High'?'Advisor check-in':'Faculty mentor check-in')
  const [saving,setSaving]=useState(false)
  async function handleAssign(){setSaving(true);await onAssign(student,action);setSaving(false)}
  const reasons=student.risk_reasons||[]
  return <div className="drawer-overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><aside className="student-drawer"><div className="drawer-top"><span>STUDENT PROFILE</span><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="drawer-student-head"><div className="drawer-avatar">{initials(student.name)}</div><div><h2>{student.name}</h2><span>{student.student_id||student.id} <i>·</i> {student.department}</span></div><RiskBadge risk={student.risk}/></div><div className="profile-score"><ScoreRing score={student.success_score??student.score} size={72}/><div><span>STUDENT SUCCESS SCORE</span><b>{student.success_score??student.score}<small> / 100</small></b><p>Current semester · {student.semester||6}</p></div></div><div className="drawer-section"><div className="drawer-section-title">SUCCESS SCORE COMPONENTS <span>6 INDICATORS</span></div><div className="radar-wrap"><ResponsiveContainer width="100%" height={245}><RadarChart data={components} outerRadius="72%"><PolarGrid stroke="#2b3549"/><PolarAngleAxis dataKey="subject" tick={{fill:'#9ca9bf',fontSize:10}}/><PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/><Radar name="Student" dataKey="value" stroke="#9a86ff" fill="#8975ff" fillOpacity={.3} strokeWidth={2}/><Tooltip content={<ChartTip suffix=" / 100"/>}/></RadarChart></ResponsiveContainer></div></div><div className="drawer-section"><div className="drawer-section-title">WHY THIS SCORE? <span>EXPLAINABLE SIGNALS</span></div>{reasons.length?<div className="reason-list">{reasons.map((reason,i)=><div key={i}><span>{i+1}</span>{reason}</div>)}</div>:<div className="no-reasons"><Check size={15}/> No immediate risk signals. Keep building momentum.</div>}</div>{student.placement_gap&&<div className="drawer-gap"><Target size={16}/><div><b>Placement Gap flagged</b><span>CGPA {student.cgpa} is strong, while coding ({student.coding_score||student.coding}) or aptitude ({student.aptitude_score||student.aptitude}) is below the cohort median.</span></div></div>}<div className="drawer-section"><div className="drawer-section-title">RECOMMENDED SUPPORT <span>REVIEW WITH FACULTY</span></div><div className="recommend-list">{(student.recommendations||['Faculty mentor check-in','Review progress at next assessment']).slice(0,3).map((item,i)=><div key={i}><Check size={14}/>{item}</div>)}</div></div><div className="assign-box"><label htmlFor="support-action">ASSIGN AN INTERVENTION</label><select id="support-action" value={action} onChange={e=>setAction(e.target.value)}><option>Advisor check-in within 48 hours</option><option>Subject-level remedial support</option><option>Weekly attendance and LMS review</option><option>Coding and aptitude bridge cohort</option><option>Faculty mentor check-in</option><option>Peer mentor pairing</option></select><button className="button button-primary assign-button" onClick={handleAssign} disabled={saving}><Check size={16}/>{saving?'Assigning…':'Assign intervention'}</button></div></aside></div>
}

function ChatWidget({workspace,onStudent}){
  const [open,setOpen]=useState(false)
  const [question,setQuestion]=useState('')
  const [busy,setBusy]=useState(false)
  const [messages,setMessages]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('campuspulse-copilot')||'[]')}catch{return []}
  })
  const endRef=useRef(null)
  useEffect(()=>{localStorage.setItem('campuspulse-copilot',JSON.stringify(messages.slice(-30).map(({role,content})=>({role,content}))))},[messages])
  useEffect(()=>{const openChat=()=>setOpen(true);window.addEventListener('campuspulse:open-chat',openChat);return()=>window.removeEventListener('campuspulse:open-chat',openChat)},[])
  useEffect(()=>{if(open)endRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[open,messages,busy])
  const welcome={role:'assistant',content:'Namaste! I’m your CampusPulse AI Copilot. Ask me about student risk, attendance patterns, placement readiness, segments, or what support to try next.',mode:'demo'}
  const visibleMessages=messages.length?messages:[welcome]

  async function send(text=question){
    const value=text.trim();if(!value||busy)return
    setQuestion('');setMessages(current=>[...(current.length?current:[welcome]),{role:'user',content:value}]);setBusy(true)
    try{const reply=await askAssistant(value,workspace);setMessages(current=>[...current,{role:'assistant',content:reply.answer,related:reply.related_students||[],mode:reply.mode||'live'}])}
    catch{setMessages(current=>[...current,{role:'assistant',content:'I couldn’t read the cohort data just now. Please try again in a moment.',mode:'demo'}])}
    finally{setBusy(false)}
  }

  return <>
    {open&&<section className="copilot-panel" aria-label="CampusPulse AI Copilot">
      <header className="copilot-head"><div className="copilot-brand"><div className="copilot-avatar"><Bot size={18}/></div><div><b>CampusPulse Copilot</b><span><i/> Cohort-aware assistant</span></div></div><div className="copilot-head-actions"><button title="Clear chat" onClick={()=>setMessages([])}><MoreHorizontal size={17}/></button><button title="Close chat" onClick={()=>setOpen(false)}><X size={17}/></button></div></header>
      <div className="copilot-context"><Sparkles size={13}/><span>Answers use this cohort’s student indicators and score methodology.</span></div>
      <div className="copilot-messages">
        {visibleMessages.map((message,index)=><div className={`chat-message chat-${message.role}`} key={`${index}-${message.content.slice(0,14)}`}>
          {message.role==='assistant'&&<div className="message-avatar"><Bot size={13}/></div>}
          <div className="message-body"><div className="message-bubble">{message.content}</div>{message.role==='assistant'&&<div className="message-source">{message.mode==='live'?'LIVE COHORT DATA':'DEMO COHORT DATA'} <span>·</span> decision support</div>}
            {message.related?.length>0&&<div className="chat-related">{message.related.slice(0,4).map((student,i)=><button key={student.student_id||student.id||i} onClick={()=>onStudent(student)}><span className="related-dot"/><span>{student.name}</span><b>{student.risk||'Profile'}</b><ArrowUpRight size={12}/></button>)}</div>}
          </div>
        </div>)}
        {messages.length===0&&<div className="chat-prompts"><span>TRY ASKING</span>{['Who needs support today?','Show placement gaps','Explain the success score'].map(item=><button key={item} onClick={()=>send(item)}>{item}<ArrowRight size={13}/></button>)}</div>}
        {busy&&<div className="chat-message chat-assistant"><div className="message-avatar"><Bot size={13}/></div><div className="message-bubble typing-bubble"><i/><i/><i/></div></div>}
        <div ref={endRef}/>
      </div>
      <form className="copilot-composer" onSubmit={e=>{e.preventDefault();send()}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about your students…" aria-label="Ask CampusPulse AI"/><button type="submit" disabled={!question.trim()||busy} aria-label="Send message"><Send size={16}/></button><span>ENTER TO SEND</span></form>
    </section>}
    <button className={`copilot-launch ${open?'copilot-launch-open':''}`} onClick={()=>setOpen(!open)} aria-label={open?'Close AI assistant':'Open AI assistant'}>{open?<X size={20}/>:<><MessageCircle size={20}/><i/></>}</button>
  </>
}

export default App
