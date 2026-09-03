const API_URL = "https://team-scheduler-api.everloop.workers.dev";
let projects = [];
let project = null;
let selectedProject = "";
let selectedPerson = "";
let projectPin = "";
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");

function status(msg, error=false){
  const el=$("status");
  if(!msg){el.classList.add("hidden"); return;}
  el.textContent=msg; el.classList.remove("hidden"); el.style.color=error?"#8b3030":"";
}
function sessionKey(name){return "scheduler_pin_"+name}
function savePin(){sessionStorage.setItem(sessionKey(selectedProject),projectPin)}
function getSavedPin(name){return sessionStorage.getItem(sessionKey(name))||""}
function defaultDates(){
  const now=new Date(); now.setHours(0,0,0,0);
  const s=new Date(now); s.setDate(s.getDate()+1);
  const e=new Date(s); e.setDate(e.getDate()+20);
  return {start:dateKey(s),end:dateKey(e)};
}
function big12Default(){
  const d=defaultDates();
  return {name:"BIG 12",timezone:"Europe/Paris",startDate:d.start,endDate:d.end,includeWeekends:false,slotMinutes:60,dayStart:"09:00",dayEnd:"18:00",people:["Clementine","Pascale","Johanna","Eva","Dejan","Tiphaine","Elena","EVA BS","Léonie"],hiddenPeople:[],unavailable:{}};
}
function newProjectDefault(name){
  const d=defaultDates();
  return {name,timezone:"Europe/Paris",startDate:d.start,endDate:d.end,includeWeekends:false,slotMinutes:60,dayStart:"09:00",dayEnd:"18:00",people:[],hiddenPeople:[],unavailable:{}};
}
async function api(path,options={}){
  const headers={"Content-Type":"application/json",...(options.headers||{})};
  if(projectPin) headers["X-Project-Pin"]=projectPin;
  const r=await fetch(API_URL+path,{...options,headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`HTTP ${r.status}`);
  return data;
}
async function loadProjects(){
  status("Loading projects…");
  try{projects=await api("/projects");status("");renderEntry();}
  catch(e){status("Could not load projects: "+e.message,true)}
}
function renderEntry(){
  $("entryScreen").classList.add("active"); $("workspaceScreen").classList.remove("active");
  $("projectStep").classList.remove("hidden"); $("selectedProjectBar").classList.add("hidden");
  $("pinStep").classList.add("hidden"); $("personStep").classList.add("hidden");
  const list=$("projectList"); list.innerHTML="";
  projects.forEach(p=>{
    const b=document.createElement("button"); b.className="project-card";
    b.innerHTML=`<span style="float:right">🔒</span><strong>${escapeHtml(p.name)}</strong><div class="muted" style="font-size:11px;margin-top:4px">${p.initialized?"Protected project":"Needs first-time setup"}</div>`;
    b.onclick=()=>selectProject(p.name,p.initialized); list.appendChild(b);
  });
}
function selectProject(name,initialized){
  selectedProject=name; selectedPerson=""; project=null; projectPin=getSavedPin(name);
  $("projectStep").classList.add("hidden"); $("selectedProjectName").textContent=name; $("selectedProjectBar").classList.remove("hidden");
  $("pinStep").classList.remove("hidden"); $("personStep").classList.add("hidden");
  $("projectPin").value=projectPin;
  $("pinTitle").textContent=initialized?"Enter project PIN":"Set project PIN";
  $("pinHelp").textContent=initialized?"Enter the 4-digit PIN for this project.":"This project is not initialized yet. Choose its 4-digit PIN.";
  $("unlockBtn").textContent=initialized?"Unlock project":"Initialize project";
  $("unlockBtn").dataset.initialized=initialized?"1":"0";
  if(projectPin && initialized) unlockCurrent();
}
async function unlockCurrent(){
  const initialized=$("unlockBtn").dataset.initialized==="1";
  const pin=$("projectPin").value.trim();
  if(!/^\d{4}$/.test(pin)){status("PIN must contain exactly 4 digits.",true);return}
  projectPin=pin;
  try{
    status(initialized?"Unlocking project…":"Initializing project…");
    if(initialized){
      const r=await api("/project/"+encodeURIComponent(selectedProject)); project=r.project;
    } else {
      const seed=selectedProject==="BIG 12"?big12Default():newProjectDefault(selectedProject);
      const r=await api("/project/"+encodeURIComponent(selectedProject)+"/initialize",{method:"POST",body:JSON.stringify({pin,project:seed})});
      project=r.project;
    }
    savePin(); status(""); $("pinStep").classList.add("hidden"); $("personStep").classList.remove("hidden"); renderPeople();
  } catch(e){projectPin="";status(e.message,true)}
}
function visiblePeople(){return project.people.filter(n=>!project.hiddenPeople.includes(n))}
function renderPeople(){
  const box=$("personList"); box.innerHTML="";
  visiblePeople().forEach(name=>{const b=document.createElement("button");b.className="pill";b.textContent=name;
  b.onclick=()=>{selectedPerson=name;openWorkspace()};box.appendChild(b)});
}
function resetEntry(){
  selectedProject="";selectedPerson="";project=null;projectPin="";
  $("newProjectForm").classList.add("hidden"); $("newPersonForm").classList.add("hidden"); status(""); loadProjects();
}
function openWorkspace(){ $("entryScreen").classList.remove("active"); $("workspaceScreen").classList.add("active"); renderAll(); }
async function persist(silent=false){
  if(!silent) status("Saving…");

  try{
    const r=await api(
      "/project/"+encodeURIComponent(selectedProject),
      {
        method:"PUT",
        body:JSON.stringify(project)
      }
    );

    project=r.project;

    if(!silent) status("");
    return true;

  } catch(e){
    status("Save failed: "+e.message,true);
    return false;
  }
}
function parseDate(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function isWeekend(d){return d.getDay()===0||d.getDay()===6}
function dateKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function fmtDate(d){return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
function mins(s){const [h,m]=s.split(":").map(Number);return h*60+m}
function labelTime12(t){const h=Math.floor(t/60),m=t%60,ap=h>=12?"PM":"AM",hh=((h+11)%12)+1;return `${hh}:${pad(m)} ${ap}`}
function datesForProject(){const out=[],start=parseDate(project.startDate),end=parseDate(project.endDate);for(let d=start;d<=end;d=addDays(d,1))if(project.includeWeekends||!isWeekend(d))out.push(new Date(d));return out}
function slotsForProject(){const out=[],s=mins(project.dayStart),e=mins(project.dayEnd),step=Number(project.slotMinutes);for(let t=s;t+step<=e;t+=step)out.push(t);return out}
function slotKey(d,t){return `${dateKey(d)}|${t}`}
function ensurePerson(n){if(!project.unavailable[n])project.unavailable[n]={}}
function isUnavailable(n,k){return !!(project.unavailable[n]&&project.unavailable[n][k])}
function setUnavailable(n,k,v){ensurePerson(n);if(v)project.unavailable[n][k]=true;else delete project.unavailable[n][k]}
function allAvailable(k){const ppl=visiblePeople();return ppl.length>0&&ppl.every(n=>!isUnavailable(n,k))}
function renderAll(){
  if(!selectedPerson||!visiblePeople().includes(selectedPerson))selectedPerson=visiblePeople()[0]||"";
  if(!selectedPerson){resetEntry();return}
  $("workspaceTitle").textContent=project.name; $("identityBadge").textContent=selectedPerson; $("workspaceSub").textContent=`Time zone: ${project.timezone}`;
  $("availabilityMeta").textContent=`HOURS → ${labelTime12(mins(project.dayStart))}–${labelTime12(mins(project.dayEnd))} · ${project.slotMinutes} min slots · Time zone: ${project.timezone}`;
  const sel=$("workspacePerson");sel.innerHTML="";visiblePeople().forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o)});sel.value=selectedPerson;
  renderMatrix();renderCommon();
}
function renderMatrix(){
  const dates=datesForProject(),slots=slotsForProject(),head=$("matrixHead"),body=$("matrixBody");
  head.style.setProperty("--cols",slots.length);head.innerHTML="";body.innerHTML="";
  ["DATE","DAY",...slots.map(labelTime12)].forEach(x=>{const d=document.createElement("div");d.textContent=x;head.appendChild(d)});
  dates.forEach(d=>{
    const row=document.createElement("div");row.className="matrix-row";row.style.setProperty("--cols",slots.length);
    const dc=document.createElement("div");dc.className="date-cell";dc.textContent=fmtDate(d);row.appendChild(dc);
    const da=document.createElement("div");da.className="day-action";const all=slots.every(t=>isUnavailable(selectedPerson,slotKey(d,t)));
    const db=document.createElement("button");db.textContent=all?"Available":"Unavailable";
    db.onclick=async()=>{
  const newUnavailable = !all;

  slots.forEach(t=>{
    setUnavailable(
      selectedPerson,
      slotKey(d,t),
      newUnavailable
    );
  });

  // Update only this row
  const slotCells = row.querySelectorAll(".slot");

  slotCells.forEach(cell=>{
    cell.classList.toggle(
      "unavailable",
      newUnavailable
    );
  });

  db.textContent =
    newUnavailable ? "Available" : "Unavailable";

  // Only refresh common availability
  renderCommon();

  // Save without moving the page
  await persist(true);
};
    da.appendChild(db);row.appendChild(da);
    slots.forEach(t=>{

  const k = slotKey(d,t);

  const cell =
    document.createElement("div");

  cell.className =
    "slot" +
    (
      isUnavailable(selectedPerson,k)
        ? " unavailable"
        : ""
    );

  const b =
    document.createElement("button");

  b.title =
    `${fmtDate(d)} ${labelTime12(t)}`;

  b.onclick = async () => {

    const newUnavailable =
      !isUnavailable(
        selectedPerson,
        k
      );

    setUnavailable(
      selectedPerson,
      k,
      newUnavailable
    );

    // Update only the clicked cell
    cell.classList.toggle(
      "unavailable",
      newUnavailable
    );

    // Check whether entire day
    // is now unavailable
    const dayIsUnavailable =
      slots.every(t2 =>
        isUnavailable(
          selectedPerson,
          slotKey(d,t2)
        )
      );

    // Update DAY button only
    db.textContent =
      dayIsUnavailable
        ? "Available"
        : "Unavailable";

    // Refresh only common availability
    renderCommon();

    // Silent background save
    await persist(true);
  };

  cell.appendChild(b);
  row.appendChild(cell);
});
    body.appendChild(row);
  });
}
function mergeRanges(slots){
  if(!slots.length)return[];const step=Number(project.slotMinutes),ranges=[];let start=slots[0],prev=slots[0];
  for(let i=1;i<slots.length;i++){if(slots[i]===prev+step){prev=slots[i];continue}ranges.push([start,prev+step]);start=prev=slots[i]}
  ranges.push([start,prev+step]);return ranges;
}
function renderCommon(){
  const box=$("commonList");box.innerHTML="";const found=[];
  for(const d of datesForProject()){const s=slotsForProject().filter(t=>allAvailable(slotKey(d,t)));if(s.length)found.push({d,slots:s});if(found.length===3)break}
  const table=document.createElement("table");table.className="common-table";table.innerHTML="<thead><tr><th>Date</th><th>Common availability</th></tr></thead>";const tbody=document.createElement("tbody");
  if(!found.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=2;td.textContent="No common date available.";td.className="muted";tr.appendChild(td);tbody.appendChild(tr)}
  found.forEach(x=>{const tr=document.createElement("tr"),d=document.createElement("td"),s=document.createElement("td");d.textContent=fmtDate(x.d);s.textContent=mergeRanges(x.slots).map(r=>`${labelTime12(r[0])}–${labelTime12(r[1])}`).join(" · ");tr.append(d,s);tbody.appendChild(tr)});
  table.appendChild(tbody);box.appendChild(table);
}
function renderManagePeople(){
  const box=$("managePeople");box.innerHTML="";
  project.people.forEach(name=>{const w=document.createElement("div");w.className="manage-person";const s=document.createElement("span");s.textContent=name+(project.hiddenPeople.includes(name)?" (hidden)":"");const h=document.createElement("button");h.textContent=project.hiddenPeople.includes(name)?"Show":"Hide";h.onclick=async()=>{project.hiddenPeople.includes(name)?project.hiddenPeople=project.hiddenPeople.filter(x=>x!==name):project.hiddenPeople.push(name);renderManagePeople();renderAll();await persist()};const d=document.createElement("button");d.textContent="Delete";d.onclick=async()=>{if(!confirm(`Delete ${name} from this project?`))return;project.people=project.people.filter(x=>x!==name);project.hiddenPeople=project.hiddenPeople.filter(x=>x!==name);delete project.unavailable[name];if(selectedPerson===name)selectedPerson=visiblePeople()[0]||"";renderManagePeople();renderAll();await persist()};w.append(s,h,d);box.appendChild(w)});
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

$("newProjectBtn").onclick=()=>$("newProjectForm").classList.remove("hidden");
$("cancelProjectBtn").onclick=()=>$("newProjectForm").classList.add("hidden");
$("createProjectBtn").onclick=async()=>{
  const name=$("newProject").value.trim(),pin=$("newProjectPin").value.trim();
  if(!name){status("Enter a project name.",true);return} if(!/^\d{4}$/.test(pin)){status("PIN must contain exactly 4 digits.",true);return}
  try{status("Creating project…");const p=newProjectDefault(name);const oldPin=projectPin;projectPin="";await api("/project",{method:"POST",body:JSON.stringify({name,pin,project:p})});projectPin=oldPin;$("newProject").value="";$("newProjectPin").value="";await loadProjects();selectProject(name,true);$("projectPin").value=pin;projectPin=pin;savePin();await unlockCurrent()}
  catch(e){status(e.message,true)}
};
$("changeProjectBtn").onclick=resetEntry; $("unlockBtn").onclick=unlockCurrent;
$("newTeammateBtn").onclick=()=>$("newPersonForm").classList.remove("hidden"); $("cancelPersonBtn").onclick=()=>$("newPersonForm").classList.add("hidden");
$("addPersonBtn").onclick=async()=>{const name=$("newPerson").value.trim();if(!name)return;if(project.people.some(x=>x.toLowerCase()===name.toLowerCase())){status("This teammate already exists.",true);return}project.people.push(name);project.unavailable[name]={};$("newPerson").value="";selectedPerson=name;await persist();openWorkspace()};
$("workspacePerson").onchange=e=>{selectedPerson=e.target.value;renderAll()}; $("backBtn").onclick=resetEntry;
$("settingsBtn").onclick=()=>{$("setStart").value=project.startDate;$("setEnd").value=project.endDate;$("setTimezone").value=project.timezone;$("setDayStart").value=project.dayStart;$("setDayEnd").value=project.dayEnd;$("setSlotMinutes").value=String(project.slotMinutes);$("setWeekends").checked=project.includeWeekends;renderManagePeople();$("settingsCard").classList.remove("hidden")};
$("cancelSettingsBtn").onclick=()=>$("settingsCard").classList.add("hidden");
$("saveSettingsBtn").onclick=async()=>{const s=$("setStart").value,e=$("setEnd").value;if(!s||!e||s>e){status("Choose a valid date range.",true);return}if(mins($("setDayStart").value)>=mins($("setDayEnd").value)){status("End time must be later than start time.",true);return}project.startDate=s;project.endDate=e;project.timezone=$("setTimezone").value;project.dayStart=$("setDayStart").value;project.dayEnd=$("setDayEnd").value;project.slotMinutes=Number($("setSlotMinutes").value);project.includeWeekends=$("setWeekends").checked;$("settingsCard").classList.add("hidden");renderAll();await persist()};
$("blockAllBtn").onclick=async()=>{for(const d of datesForProject())for(const t of slotsForProject())setUnavailable(selectedPerson,slotKey(d,t),true);renderAll();await persist()};
$("clearAllBtn").onclick=async()=>{ensurePerson(selectedPerson);project.unavailable[selectedPerson]={};renderAll();await persist()};
loadProjects();
