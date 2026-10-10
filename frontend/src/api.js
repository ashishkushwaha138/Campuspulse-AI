import { makeDemoInsights, makeDemoOverview, makeDemoSegments, makeDemoStudents } from './data.js'

const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const API = `${API_ORIGIN}/api`
export const demoStudents = makeDemoStudents()

function readLocalActions() {
  try {
    const value = JSON.parse(localStorage.getItem('campuspulse-actions') || '[]')
    return Array.isArray(value) ? value : []
  } catch { return [] }
}

function updateLocalAction(id, update) {
  const existing = readLocalActions()
  const index = existing.findIndex(action => action.id === id)
  if (index < 0) throw new Error('Intervention not found.')
  existing[index] = { ...existing[index], ...update, updated_at: new Date().toISOString() }
  localStorage.setItem('campuspulse-actions', JSON.stringify(existing))
  return { action: existing[index] }
}

async function get(path) {
  const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(45000) })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json()
}

async function post(path, body) {
  let response
  try {
    response = await fetch(`${API}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    })
  } catch (cause) {
    const error = new Error('Could not connect to the API.')
    error.networkError = true
    error.cause = cause
    throw error
  }
  let data = {}
  try { data = await response.json() } catch { /* ignore */ }
  if (!response.ok) throw new Error(data.detail || `Server error ${response.status}`)
  return data
}

async function patch(path, body) {
  let response
  try {
    response = await fetch(`${API}${path}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    })
  } catch (cause) {
    const error = new Error('Could not connect to the API.')
    error.networkError = true
    error.cause = cause
    throw error
  }
  let data = {}
  try { data = await response.json() } catch { /* ignore */ }
  if (!response.ok) throw new Error(data.detail || `Server error ${response.status}`)
  return data
}

export async function loadWorkspace() {
  try {
    const [overview, studentResponse, segments, insights, placement, actions] = await Promise.all([
      get('/overview'), get('/students?limit=1000'), get('/segments'),
      get('/insights'), get('/placement'), get('/actions'),
    ])
    const localActions = readLocalActions()
    return {
      overview, students: studentResponse.students, departments: studentResponse.departments,
      segments: segments.segments, insights: insights.insights, placement,
      actions: [...localActions, ...actions.actions.filter(a => !localActions.some(local => local.id === a.id))], mode: 'live',
      cohortMode: overview.cohort_mode || insights.generated_from,
    }
  } catch {
    const students = demoStudents
    let actions = []
    try { actions = JSON.parse(localStorage.getItem('campuspulse-actions') || '[]'); if (!Array.isArray(actions)) actions = [] } catch { actions = [] }
    return {
      overview: makeDemoOverview(students), students,
      departments: [...new Set(students.map(s => s.department))].sort(),
      segments: makeDemoSegments(students), insights: makeDemoInsights(students).insights,
      placement: {
        medians: { aptitude: 68, coding: 66 }, assessed: students.length,
        ready: students.filter(s => s.placement_ready).length,
        gap: students.filter(s => s.placement_gap).length,
        bands: [
          { name: 'Strong', value: students.filter(s => (s.placement || 0) >= 75).length },
          { name: 'Building', value: students.filter(s => (s.placement || 0) >= 55 && (s.placement || 0) < 75).length },
          { name: 'Needs support', value: students.filter(s => (s.placement || 0) < 55).length },
        ], students,
      },
      actions, mode: 'demo', cohortMode: 'synthetic demo',
    }
  }
}

export async function loadTrends() {
  try { return await get('/trends') }
  catch { return null }
}

export async function saveIntervention(payload) {
  const { student, ...request } = payload
  try {
    const body = await post('/interventions', request)
    if (!body.action) throw new Error('No confirmation from server. Please try again.')
    return { ...body.action, local: false }
  } catch (err) {
    if (err.networkError) {
      const localStudent = student || demoStudents.find(s => s.id === payload.student_id)
      const action = {
        id: `local-${Date.now()}`, student_id: payload.student_id,
        student_name: localStudent?.name || 'Student', department: localStudent?.department || '',
        action: payload.action, intervention_type: payload.intervention_type || 'General Support',
        reason: payload.reason || '', assigned_to: payload.assigned_to || payload.admin_name || 'Administrator',
        due_date: payload.due_date || '', status: payload.status || 'Planned',
        notes: payload.notes || '', admin_name: payload.admin_name,
        timestamp: new Date().toISOString(), updated_at: new Date().toISOString(), local: true,
      }
      let existing = []
      try { existing = JSON.parse(localStorage.getItem('campuspulse-actions') || '[]'); if (!Array.isArray(existing)) existing = [] } catch { existing = [] }
      localStorage.setItem('campuspulse-actions', JSON.stringify([action, ...existing].slice(0, 200)))
      return action
    }
    throw err
  }
}

export async function updateIntervention(id, update) {
  if (id.startsWith('local-')) return updateLocalAction(id, update)
  try { return await patch(`/interventions/${id}`, update) }
  catch (err) {
    if (!err.networkError) throw err
    return updateLocalAction(id, update)
  }
}

export async function importCsvFiles(files) {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  let response
  try {
    response = await fetch(`${API}/import`, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) })
  } catch {
    throw new Error('Could not reach the import service. Check that the backend is running, then try again.')
  }
  let body = {}
  try { body = await response.json() } catch { /* ignore */ }
  if (!response.ok) throw new Error(body.detail || `Import failed (server ${response.status}). Check CSV headers and format.`)
  return body
}

export async function simulate(payload) {
  try { return await post('/simulate', payload) }
  catch (err) { throw new Error(err.message || 'Simulation failed. Try again.') }
}

export async function askAssistant(question, workspace) {
  try {
    const result = await post('/chat', { question, admin_name: 'Academic Success Admin' })
    return { ...result, mode: result.synthetic_data ? 'demo' : 'live' }
  } catch {
    const students = workspace.students || []
    const q = question.toLowerCase()
    const person = students.find(s => q.includes((s.name || '').toLowerCase()) || q.includes((s.student_id || s.id || '').toLowerCase()))
    if (person) {
      const reasons = person.risk_reasons?.join('; ') || 'No immediate risk drivers flagged.'
      return { answer: `${person.name} has a Success Score of ${person.success_score ?? person.score}/100 and is in the ${person.risk} band. Attendance: ${person.attendance_pct ?? person.attendance}%, CGPA: ${person.cgpa}. Key signals: ${reasons} Suggested next step: ${person.recommendations?.[0] || 'Schedule a faculty mentor check-in.'}`, related_students: [person], generated_from: 'local cohort analytics', mode: 'demo' }
    }
    if (/placement|coding|aptitude|job|ready/.test(q)) {
      const gap = students.filter(s => s.placement_gap)
      return { answer: `${workspace.overview.kpis.placement_ready} students meet the placement-ready rule. ${gap.length} have CGPA above 7.5 but below-cohort-median coding or aptitude. A four-week coding and aptitude bridge is a practical next step.`, related_students: gap.slice(0, 5), generated_from: 'local cohort analytics', mode: 'demo' }
    }
    if (/attendance|absent|presence/.test(q)) {
      const low = students.filter(s => (s.attendance_pct ?? s.attendance) < 65)
      return { answer: `${low.length} students (${Math.round(low.length / Math.max(students.length, 1) * 100)}%) are below 65% attendance. Start with advisor check-ins to understand schedule, commute, wellbeing, or access barriers.`, related_students: low.slice(0, 5), generated_from: 'local cohort analytics', mode: 'demo' }
    }
    if (/segment|cluster|silent struggler|disengaged|high performer/.test(q)) {
      const match = workspace.segments?.find(s => q.includes(s.name.toLowerCase()))
      if (match) return { answer: `${match.name} includes ${match.size} students with average Success Score ${match.avg_score}. Playbook: ${match.playbook.join('; ')}.`, related_students: match.students || [], generated_from: 'local cohort analytics', mode: 'demo' }
      return { answer: `Four segments: ${workspace.segments?.map(s => `${s.name} (${s.size})`).join(', ')}. Open Student Segments for playbooks.`, related_students: [], generated_from: 'local cohort analytics', mode: 'demo' }
    }
    if (/score|formula|weight|success/.test(q)) return { answer: `Cohort average: ${workspace.overview.kpis.avg_score}/100. Formula: 35% Academic + 20% Attendance + 15% LMS + 15% Skills + 15% Placement readiness.`, related_students: [], generated_from: 'local cohort analytics', mode: 'demo' }
    const watch = students.filter(s => s.risk !== 'Low').sort((a, b) => (a.success_score ?? a.score) - (b.success_score ?? b.score))
    return { answer: `Cohort: ${students.length} students, avg score ${workspace.overview.kpis.avg_score}/100. ${workspace.overview.kpis.need_attention} in review bands, ${workspace.overview.kpis.placement_ready} placement-ready. Ask about a student, attendance, placement, risk, segments, or the score formula.`, related_students: watch.slice(0, 5), generated_from: 'local cohort analytics', mode: 'demo' }
  }
}
