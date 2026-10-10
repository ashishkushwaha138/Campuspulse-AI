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
const score = (p) => Math.round(p.academic*.35 + p.attendance*.2 + p.lms*.15 + p.skills*.15 + p.placement*.15)

export function makeDemoStudents(count = 72) {
  return Array.from({length:count}, (_, i) => {
    const p = profiles[(i * 7 + Math.floor(i / 4)) % profiles.length]
    const wobble = (seed, range = 7) => Math.sin((i + 2) * seed) * range
    const s = { ...p }
    for (const key of ['academic','attendance','lms','placement','skills','engagement']) s[key] = clamp(p[key] + wobble((i%5+1)*.37))
    s.score = score(s)
    s.risk = s.score < 55 || s.attendance < 65 ? 'High' : s.score < 70 || s.attendance < 75 ? 'Medium' : 'Low'
    s.id = `CP${String(24001+i).padStart(5,'0')}`
    s.name = `${first[i%first.length]} ${last[(i*7+Math.floor(i/first.length))%last.length]}`
    s.department = departments[(i*5+Math.floor(i/6))%departments.length]
    s.cgpa = Math.max(4, Math.min(10, +(p.cgpa + wobble(.19,.45)).toFixed(1)))
    s.attendance_pct = s.attendance
    s.assignment_completion = clamp(p.assignment + wobble(.53,9))
    s.aptitude_score = clamp(p.aptitude + wobble(.71,10))
    s.coding_score = clamp(p.coding + wobble(.89,11))
    s.backlogs = s.academic < 55 ? (i%3===0 ? 2 : 1) : (i%13===0 ? 1 : 0)
    s.placement_gap = s.cgpa > 7.5 && (s.coding_score < 66 || s.aptitude_score < 68)
    s.placement_ready = s.cgpa >= 7.5 && s.coding_score >= 70 && s.aptitude_score >= 70
    s.score_components = {Academic:s.academic,Attendance:s.attendance,'LMS activity':s.lms,Placement:s.placement,Skills:s.skills,Engagement:s.engagement}
    s.risk_reasons = [s.attendance < 65 && 'Attendance is below the 65% support threshold', s.academic < 55 && 'Academic component is below 55/100', s.backlogs >= 2 && 'Two or more active backlogs', s.lms < 45 && 'LMS activity is below cohort expectations'].filter(Boolean)
    if (!s.risk_reasons.length && s.risk !== 'Low') s.risk_reasons.push('Success score or attendance trend needs a faculty check-in')
    s.recommendations = s.risk === 'High' ? ['Advisor check-in within 48 hours','Subject-level remedial support','Weekly attendance and LMS review'] : s.placement_gap ? ['Join the coding and aptitude bridge cohort','Review a mock test in four weeks'] : ['Faculty mentor check-in','Review progress at next assessment']
    return s
  })
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
