import { makeDemoInsights, makeDemoOverview, makeDemoSegments, makeDemoStudents } from './data.js'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
export const demoStudents = makeDemoStudents()

async function get(path) {
  const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(2800) })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json()
}

export async function loadWorkspace() {
  try {
    const [overview, studentResponse, segments, insights, placement, actions] = await Promise.all([
      get('/overview'), get('/students?limit=1000'), get('/segments'), get('/insights'), get('/placement'), get('/actions'),
    ])
    return { overview, students: studentResponse.students, departments: studentResponse.departments, segments: segments.segments, insights: insights.insights, placement, actions: actions.actions, mode: 'live' }
  } catch {
    const students = demoStudents
    return {
      overview: makeDemoOverview(students), students,
      departments: [...new Set(students.map(s=>s.department))].sort(),
      segments: makeDemoSegments(students), insights: makeDemoInsights(students).insights,
      placement: {medians:{aptitude:68,coding:66},ready:students.filter(s=>s.placement_ready).length,gap:students.filter(s=>s.placement_gap).length,bands:[{name:'Strong',value:students.filter(s=>s.placement>=75).length},{name:'Building',value:students.filter(s=>s.placement>=55&&s.placement<75).length},{name:'Needs support',value:students.filter(s=>s.placement<55).length}],students},
      actions: JSON.parse(localStorage.getItem('campuspulse-actions') || '[]'), mode: 'demo',
    }
  }
}

export async function saveIntervention(payload) {
  try {
    const response = await fetch(`${API}/interventions`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(3000)})
    if (!response.ok) throw new Error('API unavailable')
    return { ...(await response.json()).action, local: false }
  } catch {
    const student = demoStudents.find(s=>s.id===payload.student_id) || payload.student
    const action = { id:`local-${Date.now()}`,student_id:payload.student_id,student_name:student?.name || 'Student',department:student?.department || '',action:payload.action,status:'Assigned',admin_name:payload.admin_name,timestamp:new Date().toISOString(),local:true }
    const existing = JSON.parse(localStorage.getItem('campuspulse-actions') || '[]')
    localStorage.setItem('campuspulse-actions',JSON.stringify([action,...existing].slice(0,100)))
    return action
  }
}

export async function importCsvFiles(files) {
  const form = new FormData()
  for (const file of files) form.append('files',file)
  const response = await fetch(`${API}/import`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)})
  const body = await response.json()
  if (!response.ok) throw new Error(body.detail || 'Import failed')
  return body
}

export async function askAssistant(question, workspace) {
  try {
    const response = await fetch(`${API}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,admin_name:'Academic Success Admin'}),signal:AbortSignal.timeout(4500)})
    if (!response.ok) throw new Error('API unavailable')
    const result=await response.json()
    return {...result,mode:result.synthetic_data?'demo':'live'}
  } catch {
    const students=workspace.students||[]
    const q=question.toLowerCase()
    const person=students.find(s=>q.includes((s.name||'').toLowerCase())||q.includes((s.student_id||s.id||'').toLowerCase()))
    if(person){
      const reasons=person.risk_reasons?.join('; ')||'No immediate risk drivers are currently flagged.'
      return {answer:`${person.name} has a Success Score of ${person.success_score??person.score}/100 and is in the ${person.risk} band. Attendance is ${person.attendance_pct??person.attendance}%, with CGPA ${person.cgpa}. Key signals: ${reasons} Suggested next step: ${person.recommendations?.[0]||'Schedule a faculty mentor check-in.'}`,related_students:[person],generated_from:'local cohort analytics',mode:'demo'}
    }
    if(/placement|coding|aptitude|job|ready/.test(q)){const gap=students.filter(s=>s.placement_gap);return {answer:`${workspace.overview.kpis.placement_ready} students meet the current placement-ready rule. ${gap.length} students have CGPA above 7.5 but a coding or aptitude score below the cohort median. A four-week coding and aptitude bridge with a mock-test review is a practical next step.`,related_students:gap.slice(0,5),generated_from:'local cohort analytics',mode:'demo'}}
    if(/attendance|absent|presence/.test(q)){const low=students.filter(s=>(s.attendance_pct??s.attendance)<65);return {answer:`${low.length} students (${Math.round(low.length/Math.max(students.length,1)*100)}%) are below 65% attendance. Start with supportive advisor check-ins to understand schedule, commute, wellbeing, or access barriers.`,related_students:low.slice(0,5),generated_from:'local cohort analytics',mode:'demo'}}
    if(/segment|cluster|silent struggler|disengaged|high performer/.test(q)){const match=workspace.segments.find(s=>q.includes(s.name.toLowerCase()));if(match)return {answer:`${match.name} includes ${match.size} students (${Math.round(match.size/Math.max(students.length,1)*100)}% of the cohort), with an average Success Score of ${match.avg_score}. Suggested playbook: ${match.playbook.join('; ')}.`,related_students:match.students||[],generated_from:'local cohort analytics',mode:'demo'};return {answer:`The four cohort segments are ${workspace.segments.map(s=>`${s.name} (${s.size})`).join(', ')}. Open Student Segments to review their targeted intervention playbooks.`,related_students:[],generated_from:'local cohort analytics',mode:'demo'}}
    if(/score|formula|weight|success/.test(q))return {answer:`The cohort average Success Score is ${workspace.overview.kpis.avg_score}/100. The formula weights Academic 35%, Attendance 20%, LMS activity 15%, Skills 15%, and Placement readiness 15%. Each student profile shows the score components and the main risk drivers.`,related_students:[],generated_from:'local cohort analytics',mode:'demo'}
    const watch=students.filter(s=>s.risk!=='Low').sort((a,b)=>(a.success_score??a.score)-(b.success_score??b.score))
    return {answer:`This cohort has ${students.length} students and an average Success Score of ${workspace.overview.kpis.avg_score}/100. ${workspace.overview.kpis.need_attention} students are in the High or Medium review bands, ${workspace.overview.kpis.placement_ready} meet placement-ready thresholds, and ${workspace.overview.kpis.placement_gap} have a placement gap. Ask me about a student, attendance, placement, segments, risk, or the score formula.`,related_students:watch.slice(0,5),generated_from:'local cohort analytics',mode:'demo'}
  }
}
