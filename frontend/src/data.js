const first = ['Aarav','Aditi','Aditya','Ananya','Arjun','Diya','Ishaan','Kabir','Kavya','Meera','Neha','Priya','Rohan','Sana','Vihaan','Zoya','Aanya','Advait','Anika','Dev','Ira','Kartik','Mira','Nikhil','Reyansh','Rhea','Samar','Tara','Yash','Aarohi','Naina','Rahul']
const last = ['Mehta','Nair','Kapoor','Rao','Shah','Joshi','Verma','Menon','Singh','Patel','Kulkarni','Khan','Bose','Iyer','Malhotra','Das','Chatterjee','Reddy','Fernandes','Gupta','Pillai','Saxena','Mishra','Desai','Bhat','Mukherjee','Jain','Kaur','Thomas','Shetty']
const departments = ['Computer Science','Information Technology','Electronics','Mechanical','Civil','BCA']
const profiles = [
  {segment:'High Performers',academic:88,attendance:92,lms:88,placement:86,skills:87,engagement:79,cgpa:8.8,aptitude:84,coding:88,assignment:91},
  {segment:'Silent Strugglers',academic:48,attendance:87,lms:64,placement:54,skills:53,engagement:51,cgpa:6.4,aptitude:55,coding:51,assignment:62},
  {segment:'Placement Gap',academic:84,attendance:86,lms:79,placement:48,skills:72,engagement:65,cgpa:8.2,aptitude:55,coding:49,assignment:80},
  {segment:'Disengaged',academic:43,attendance:54,lms:39,placement:43,skills:46,engagement:32,cgpa:5.9,aptitude:44,coding:41,assignment:42},
  {segment:'Balanced Progress',academic:70,attendance:78,lms:73,placement:68,skills:70,engagement:65,cgpa:7.3,aptitude:69,coding:68,assignment:72},
]
const clamp = (v) => Math.max(25, Math.min(99, Math.round(v)))
const bounded = (v, min=0, max=100) => Math.max(min, Math.min(max, v))
const score = (s) => Math.round(s.academic*.35 + s.attendance*.2 + s.lms*.15 + s.skills*.15 + s.placement*.15)

export function makeDemoStudents(count = 72) {
  const students = Array.from({length:count}, (_, i) => {
    const p = profiles[(i * 7 + Math.floor(i / 4)) % profiles.length]
    const wobble = (seed, range = 7) => Math.sin((i + 2) * seed) * range
    const s = { ...p }
    s.id = `CP${String(24001+i).padStart(5,'0')}`
    s.name = `${first[i%first.length]} ${last[(i*7+Math.floor(i/first.length))%last.length]}`
    s.department = departments[(i*5+Math.floor(i/6))%departments.length]
    s.cgpa = Math.max(4, Math.min(10, +(p.cgpa + wobble(.19,.45)).toFixed(1)))
    s.internal_marks = clamp(p.academic + wobble(.31,8))
    s.exam_marks = clamp(p.academic + wobble(.43,9))
    s.academic = bounded((s.cgpa/10*100)*.65 + ((s.internal_marks+s.exam_marks)/2)*.35)
    s.attendance = bounded(p.attendance + wobble(.41,7))
    s.attendance_pct = s.attendance
    s.assignment_completion = clamp(p.assignment + wobble(.53,9))
    const targetLms = bounded(p.lms + wobble(.59,8))
    s.login_frequency = Math.round(bounded(((targetLms-s.assignment_completion*.65)/.35)*24/100,0,24))
    s.lms = bounded(Math.min(s.login_frequency/24*100,100)*.35 + s.assignment_completion*.65)
    s.aptitude_score = clamp(p.aptitude + wobble(.71,10))
    s.coding_score = clamp(p.coding + wobble(.89,11))
    s.mock_interviews = i%6
    s.placement = bounded(s.aptitude_score*.45+s.coding_score*.45+Math.min(s.mock_interviews/5*100,100)*.10)
    s.technical_score = clamp(p.skills + wobble(.97,7))
    s.soft_skill_score = clamp(p.skills + wobble(1.11,8))
    s.skills = bounded(s.technical_score*.6+s.soft_skill_score*.4)
    s.events = Math.round(bounded((p.engagement-20)/15 + wobble(1.27,1),0,8))
    s.certifications = i%4
    s.hackathons = i%3===0?1:0
    s.engagement = bounded(s.events*10+s.certifications*8+s.hackathons*15)
    s.backlogs = s.academic < 55 ? (i%3===0 ? 2 : 1) : (i%13===0 ? 1 : 0)
    s.score = score(s)
    s.risk = s.score < 55 || s.attendance < 65 || s.backlogs >= 2 ? 'High' : s.score < 70 || s.attendance < 75 || s.lms < 45 ? 'Medium' : 'Low'
    s.placement_ready = s.cgpa >= 7.5 && s.aptitude_score >= 70 && s.coding_score >= 65
    s.score_components = {Academic:s.academic,Attendance:s.attendance,'LMS activity':s.lms,Placement:s.placement,Skills:s.skills,Engagement:s.engagement}
    s.risk_reasons = [s.score < 55 && `Success Score is ${s.score}/100 (below 55)`, s.score >= 55 && s.score < 70 && `Success Score is ${s.score}/100 (below 70)`, s.attendance < 65 && `Attendance is ${Math.round(s.attendance)}% (below 65%)`, s.academic < 55 && `Academic component is ${Math.round(s.academic)}/100`, s.backlogs >= 2 && 'Two or more active backlogs', s.lms < 45 && `LMS activity is ${Math.round(s.lms)}/100`, s.skills < 50 && `Skills assessment is ${Math.round(s.skills)}/100`].filter(Boolean)
    if (!s.risk_reasons.length && s.risk !== 'Low') s.risk_reasons.push('Success score or attendance trend needs a faculty check-in')
    s.recommendations = s.risk === 'High' ? ['Advisor check-in within 48 hours','Subject-level remedial support','Weekly attendance and LMS review'] : s.placement_gap ? ['Join the coding and aptitude bridge cohort','Review a mock test in four weeks'] : ['Faculty mentor check-in','Review progress at next assessment']
    return s
  })
  const median = values => {
    const sorted = values.slice().sort((a,b)=>a-b)
    if (!sorted.length) return 0
    const middle = (sorted.length - 1) / 2
    return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2
  }
  const codingMedian = median(students.map(s=>s.coding_score))
  const aptitudeMedian = median(students.map(s=>s.aptitude_score))
  students.forEach(s=>{
    s.placement_gap=s.cgpa>7.5&&(s.coding_score<codingMedian||s.aptitude_score<aptitudeMedian)
    if(s.placement_gap&&!s.recommendations.some(action=>action.toLowerCase().includes('placement')||action.toLowerCase().includes('coding')))s.recommendations.push('Join the coding and aptitude bridge cohort; review a mock test in four weeks')
  })
  return students
}

export function makeDemoOverview(students) {
  const avg = Math.round(students.reduce((sum,s)=>sum+s.score,0)/students.length)
  const groups = ['Low','Medium','High'].map(name=>({name,value:students.filter(s=>s.risk===name).length}))
  const trends = [61,64,66,68,70,avg].map((score,i)=>({semester:`Sem ${i+1}`,score:Math.round(score+(avg-72)*.35)}))
  const depts = departments.map((department)=>{
    const group=students.filter(s=>s.department===department)
    return {department,students:group.length,avg_score:Math.round(group.reduce((x,s)=>x+s.score,0)/Math.max(group.length,1)),high_risk:group.filter(s=>s.risk==='High').length}
  })
  return {kpis:{students:students.length,avg_score:avg,need_attention:students.filter(s=>s.risk!=='Low').length,placement_ready:students.filter(s=>s.placement_ready).length,placement_gap:students.filter(s=>s.placement_gap).length,high_risk:students.filter(s=>s.risk==='High').length},semester:6,trends,risk_distribution:groups,departments:depts,last_actions:[],priority_insight:`${students.filter(s=>s.placement_gap).length} students have strong CGPA but below-cohort placement skills. A focused placement bridge can address this gap.`}
}

export function makeDemoSegments(students) {
  const playbooks={
    'High Performers':['Invite students to mentor peers in gateway subjects','Connect top talent to advanced projects and internships','Recognize progress and capture what is working'],
    'Silent Strugglers':['Review subject-level marks and pending assessments','Offer remedial tutoring with a short study plan','Faculty follow-up before the next internal exam'],
    'Placement Gap':['Enroll in a coding and aptitude bridge cohort','Schedule two peer-practice sessions each week','Review mock-test progress after four weeks'],
    'Disengaged':['Advisor outreach within 48 hours','Check wellbeing, timetable, commute, and access barriers','Agree on weekly attendance and LMS check-ins'],
  }
  return Object.entries(playbooks).map(([name,playbook])=>{
    const group=students.filter(s=>s.segment===name)
    return {name,size:group.length,avg_score:Math.round(group.reduce((a,s)=>a+s.score,0)/Math.max(group.length,1)),avg_attendance:Math.round(group.reduce((a,s)=>a+s.attendance,0)/Math.max(group.length,1)),avg_cgpa:+(group.reduce((a,s)=>a+s.cgpa,0)/Math.max(group.length,1)).toFixed(1),avg_placement:Math.round(group.reduce((a,s)=>a+s.placement,0)/Math.max(group.length,1)),playbook,students:group.slice(0,5)}
  })
}

export function makeDemoInsights(students) {
  const watch=students.filter(s=>s.risk!=='Low')
  return {generated_from:'synthetic demo cohort',insights:[
    {title:'Watchlist students with attendance decline',value:`${Math.round(watch.filter(s=>s.attendance<70).length/Math.max(watch.length,1)*100)}%`,detail:'Students on the watchlist have attendance below 70% this semester.',action:'Start advisor outreach and identify timetable, commute, wellbeing, or access barriers.'},
    {title:'Strong academics, placement gap',value:String(students.filter(s=>s.placement_gap).length),detail:'Students have CGPA above 7.5 but below-median coding or aptitude.',action:'Create a four-week placement bridge with coding drills and mock tests.'},
    {title:'Assignment completion opportunity',value:`${Math.round(students.reduce((a,s)=>a+s.assignment_completion,0)/students.length)}%`,detail:'Cohort average for assignment completion.',action:'Prioritize LMS nudges and faculty check-ins for students below 60%.'},
    {title:'Students needing academic support',value:String(students.filter(s=>s.academic<55).length),detail:'Students have an academic component below 55/100.',action:'Offer subject-level remedial sessions and fortnightly progress reviews.'},
    {title:'Engagement and belonging',value:`${Math.round(students.reduce((a,s)=>a+s.engagement,0)/students.length)}/100`,detail:'Average engagement based on campus participation signals.',action:'Connect students to clubs, peer groups, hackathons, or project teams.'},
  ]}
}
