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
  if(!el)return;
  if(!msg){el.classList.add("hidden"); return;}
  el.textContent=msg;
  el.classList.remove("hidden");
  el.style.color=error?"#8b3030":"";
}


function setWelcomeVisible(visible){
  const hero=$("welcomeHero");
  const tools=$("welcomeBottomTools");
  const footer=$("appFooter");
  const toggle=$("footerToggle");
  if(hero) hero.classList.toggle("hidden",!visible);
  if(tools) tools.classList.toggle("hidden",!visible);
  if(!visible && footer) footer.classList.add("hidden");
  if(!visible && toggle){
    toggle.setAttribute("aria-expanded","false");
    toggle.setAttribute("aria-label","Show information");
  }
}

function meetingSlug(name){
  return String(name||"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}


function findMeetingByInput(value){
  const raw=String(value||"").trim();
  const wanted=meetingSlug(raw);
  if(!wanted)return {match:null,matches:[]};

  // Search by meeting name, slug or exact meeting ID. Name matching is
  // intentionally forgiving: typing "BIG" finds "BIG 12".
  const rows=projects.map(p=>({
    project:p,
    nameSlug:meetingSlug(p.name),
    id:String(p.id||"").trim().toLowerCase(),
    explicitSlug:meetingSlug(p.slug||"")
  }));

  const exact=rows.filter(x=>
    x.nameSlug===wanted ||
    x.explicitSlug===wanted ||
    (x.id && x.id===raw.toLowerCase())
  );
  if(exact.length===1)return {match:exact[0].project,matches:[exact[0].project]};
  if(exact.length>1)return {match:null,matches:exact.map(x=>x.project)};

  const prefix=rows.filter(x=>
    x.nameSlug.startsWith(wanted) ||
    (x.explicitSlug && x.explicitSlug.startsWith(wanted))
  );
  if(prefix.length===1)return {match:prefix[0].project,matches:[prefix[0].project]};
  if(prefix.length>1)return {match:null,matches:prefix.map(x=>x.project)};

  const contains=rows.filter(x=>
    x.nameSlug.includes(wanted) ||
    (x.explicitSlug && x.explicitSlug.includes(wanted))
  );
  if(contains.length===1)return {match:contains[0].project,matches:[contains[0].project]};
  return {match:null,matches:contains.map(x=>x.project)};
}

function openMeetingFromInput(){
  const input=$("meetingIdInput");
  if(!input)return;
  const value=input.value.trim();
  if(!value){status("Enter a meeting ID or part of the meeting name.",true);return;}

  const result=findMeetingByInput(value);
  if(result.match){
    status("");
    selectProject(result.match.name,result.match.initialized,true);
    return;
  }

  if(result.matches.length>1){
    status(`Several meetings match “${value}”. Type a little more of the meeting name.`,true);
  }else{
    status(`No meeting found for “${value}”.`,true);
  }
}

function requestedMeeting(){
  return new URLSearchParams(window.location.search).get("meeting")||"";
}

function setMeetingQuery(name){
  const url=new URL(window.location.href);
  url.searchParams.set("meeting",meetingSlug(name));
  history.replaceState({},"",url);
}

function clearMeetingQuery(){
  const url=new URL(window.location.href);
  url.searchParams.delete("meeting");
  history.replaceState({},"",url);
}

function meetingUrl(name){
  const url=new URL(window.location.href);
  url.search="";
  url.hash="";
  url.searchParams.set("meeting",meetingSlug(name));
  return url.toString();
}

async function copyMeetingLink(){
  if(!selectedProject)return;
  const link=meetingUrl(selectedProject);
  try{
    await navigator.clipboard.writeText(link);
    status("Meeting link copied. Share the PIN separately.");
  }catch(e){
    window.prompt("Copy this meeting link:",link);
  }
}

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
  status("Loading meetings…");
  try{
    const projectResponse=await api("/projects");
    projects=Array.isArray(projectResponse)
      ? projectResponse
      : Array.isArray(projectResponse?.projects)
        ? projectResponse.projects
        : [];
    status("");

    const requested=requestedMeeting();
    if(requested){
      const wanted=meetingSlug(requested);
      const match=projects.find(p=>meetingSlug(p.name)===wanted);
      if(match){
        renderEntry(false);
        selectProject(match.name,match.initialized,false);
        return;
      }
      status("This meeting link is not valid or the meeting no longer exists.",true);
    }

    renderEntry(true);
  }catch(e){
    status("Could not load meetings: "+e.message,true);
  }
}

function renderEntry(showMeetingList=true){
  setWelcomeVisible(showMeetingList);
  $("entryScreen").classList.add("active");
  $("workspaceScreen").classList.remove("active");
  $("projectStep").classList.toggle("hidden",!showMeetingList);
  $("selectedProjectBar").classList.add("hidden");
  $("pinStep").classList.add("hidden");
  $("personStep").classList.add("hidden");
  const list=$("projectList");
  list.innerHTML="";
  projects.forEach(p=>{
    const b=document.createElement("button");
    b.className="project-card";
    b.innerHTML=`<span style="float:right">🔒</span><strong>${escapeHtml(p.name)}</strong><div class="muted" style="font-size:11px;margin-top:4px">${p.initialized?"Protected meeting":"Needs first-time setup"}</div>`;
    b.onclick=()=>selectProject(p.name,p.initialized,true);
    list.appendChild(b);
  });
}

function selectProject(name,initialized,updateUrl=true){
  setWelcomeVisible(false);
  selectedProject=name;
  selectedPerson="";
  project=null;
  projectPin="";

  if(updateUrl)setMeetingQuery(name);

  $("projectStep").classList.add("hidden");
  $("selectedProjectName").textContent=name;
  $("selectedProjectBar").classList.remove("hidden");
  $("pinStep").classList.remove("hidden");
  $("personStep").classList.add("hidden");

  // Password is deliberately never restored or auto-submitted.
  // A direct meeting link still always requires the PIN.
  $("projectPin").value="";
  $("pinHelp").textContent=initialized?"Enter the 4-digit PIN for this meeting.":"This meeting is not initialized yet. Choose its 4-digit PIN.";
  $("unlockBtn").textContent="Continue";
  $("unlockBtn").dataset.initialized=initialized?"1":"0";
  setTimeout(()=>$("projectPin").focus(),50);
}

async function unlockCurrent(){
  const initialized=$("unlockBtn").dataset.initialized==="1";
  const pin=$("projectPin").value.trim();
  if(!/^\d{4}$/.test(pin)){status("PIN must contain exactly 4 digits.",true);return}
  projectPin=pin;
  try{
    status(initialized?"Unlocking meeting…":"Initializing meeting…");
    if(initialized){
      const r=await api("/project/"+encodeURIComponent(selectedProject)); project=r.project;
    }else{
      const seed=selectedProject==="BIG 12"?big12Default():newProjectDefault(selectedProject);
      const r=await api("/project/"+encodeURIComponent(selectedProject)+"/initialize",{method:"POST",body:JSON.stringify({pin,project:seed})});
      project=r.project;
    }
    status("");
    $("pinStep").classList.add("hidden");
    $("personStep").classList.remove("hidden");
    renderPeople();
  }catch(e){
    projectPin="";
    $("projectPin").value="";
    status(e.message,true);
  }
}

function visiblePeople(){return project.people.filter(n=>!project.hiddenPeople.includes(n))}
function renderPeople(){
  const box=$("personList"); box.innerHTML="";
  visiblePeople().forEach(name=>{
    const b=document.createElement("button");
    b.className="pill";
    b.textContent=name;
    b.onclick=()=>{selectedPerson=name;openWorkspace()};
    box.appendChild(b);
  });
}

function resetEntry(){
  selectedProject="";
  selectedPerson="";
  project=null;
  projectPin="";
  clearMeetingQuery();
  $("newProjectForm").classList.add("hidden");
  $("newPersonForm").classList.add("hidden");
  status("");
  loadProjects();
}

function openWorkspace(){
  setWelcomeVisible(false);
  $("entryScreen").classList.remove("active");
  $("workspaceScreen").classList.add("active");
  renderAll();
}

async function persist(silent=false){
  if(!silent) status("Saving…");
  try{
    const r=await api(
      "/project/"+encodeURIComponent(selectedProject),
      {method:"PUT",body:JSON.stringify(project)}
    );
    project=r.project;
    if(!silent) status("");
    return true;
  }catch(e){
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
function datesForProject(){
  const out=[];
  const configuredStart=parseDate(project.startDate);
  const end=parseDate(project.endDate);
  const today=new Date();
  today.setHours(0,0,0,0);
  const start=configuredStart<today?today:configuredStart;
  for(let d=new Date(start);d<=end;d=addDays(d,1)){
    if(project.includeWeekends||!isWeekend(d)) out.push(new Date(d));
  }
  return out;
}
function slotsForProject(){const out=[],s=mins(project.dayStart),e=mins(project.dayEnd),step=Number(project.slotMinutes);for(let t=s;t+step<=e;t+=step)out.push(t);return out}
function slotKey(d,t){return `${dateKey(d)}|${t}`}
function ensurePerson(n){if(!project.unavailable[n])project.unavailable[n]={}}
function isUnavailable(n,k){return !!(project.unavailable[n]&&project.unavailable[n][k])}
function setUnavailable(n,k,v){ensurePerson(n);if(v)project.unavailable[n][k]=true;else delete project.unavailable[n][k]}
function allAvailable(k){const ppl=visiblePeople();return ppl.length>0&&ppl.every(n=>!isUnavailable(n,k))}

function renderAll(){
  if(!selectedPerson||!visiblePeople().includes(selectedPerson))selectedPerson=visiblePeople()[0]||"";
  if(!selectedPerson){resetEntry();return}
  $("workspaceTitle").textContent=project.name;
  $("identityBadge").textContent=selectedPerson;
  $("availabilityMeta").textContent=`HOURS → ${labelTime12(mins(project.dayStart))}–${labelTime12(mins(project.dayEnd))} · ${project.slotMinutes} min slots · Time zone: ${project.timezone}`;
  const sel=$("workspacePerson");
  sel.innerHTML="";
  visiblePeople().forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o)});
  sel.value=selectedPerson;
  renderMatrix();
  renderCommon();
}

function renderMatrix(){
  const dates=datesForProject(),slots=slotsForProject(),head=$("matrixHead"),body=$("matrixBody");
  head.style.setProperty("--cols",slots.length);
  head.innerHTML="";
  body.innerHTML="";

  const dateHead=document.createElement("div");
  dateHead.textContent="DATE";
  head.appendChild(dateHead);

  const dayHead=document.createElement("div");
  dayHead.textContent="ALL DAY";
  head.appendChild(dayHead);

  slots.forEach(t=>{
    const h=document.createElement("div");
    const hb=document.createElement("button");
    hb.type="button";
    hb.className="time-head-btn";
    hb.textContent=labelTime12(t);
    const columnAllUnavailable=()=>dates.length>0&&dates.every(d=>isUnavailable(selectedPerson,slotKey(d,t)));
    const updateTitle=()=>{
      hb.title=columnAllUnavailable()
        ? `Click to make ${labelTime12(t)} available for all days`
        : `Click to make ${labelTime12(t)} unavailable for all days`;
    };
    updateTitle();
    hb.onclick=async()=>{
      const makeUnavailable=!columnAllUnavailable();
      dates.forEach(d=>setUnavailable(selectedPerson,slotKey(d,t),makeUnavailable));
      renderMatrix();
      renderCommon();
      await persist(true);
    };
    h.appendChild(hb);
    head.appendChild(h);
  });

  dates.forEach(d=>{
    const row=document.createElement("div");
    row.className="matrix-row";
    row.style.setProperty("--cols",slots.length);

    const dc=document.createElement("div");
    dc.className="date-cell";
    dc.textContent=fmtDate(d);
    row.appendChild(dc);

    const da=document.createElement("div");
    da.className="day-action";
    const all=slots.every(t=>isUnavailable(selectedPerson,slotKey(d,t)));
    const db=document.createElement("button");
    db.textContent=all?"Make available":"Make unavailable";
    db.onclick=async()=>{
      const newUnavailable=!slots.every(t=>isUnavailable(selectedPerson,slotKey(d,t)));
      slots.forEach(t=>setUnavailable(selectedPerson,slotKey(d,t),newUnavailable));
      row.querySelectorAll(".slot").forEach(cell=>cell.classList.toggle("unavailable",newUnavailable));
      db.textContent=newUnavailable?"Make available":"Make unavailable";
      renderCommon();
      await persist(true);
    };
    da.appendChild(db);
    row.appendChild(da);

    slots.forEach(t=>{
      const k=slotKey(d,t);
      const cell=document.createElement("div");
      cell.className="slot"+(isUnavailable(selectedPerson,k)?" unavailable":"");
      const b=document.createElement("button");
      b.title=`${fmtDate(d)} ${labelTime12(t)} — click to ${isUnavailable(selectedPerson,k)?"make available":"make unavailable"}`;
      b.onclick=async()=>{
        const newUnavailable=!isUnavailable(selectedPerson,k);
        setUnavailable(selectedPerson,k,newUnavailable);
        cell.classList.toggle("unavailable",newUnavailable);
        const dayIsUnavailable=slots.every(t2=>isUnavailable(selectedPerson,slotKey(d,t2)));
        db.textContent=dayIsUnavailable?"Make available":"Make unavailable";
        renderCommon();
        await persist(true);
      };
      cell.appendChild(b);
      row.appendChild(cell);
    });

    body.appendChild(row);
  });
}

function mergeRanges(slots){
  if(!slots.length)return[];
  const step=Number(project.slotMinutes),ranges=[];
  let start=slots[0],prev=slots[0];
  for(let i=1;i<slots.length;i++){
    if(slots[i]===prev+step){prev=slots[i];continue}
    ranges.push([start,prev+step]);
    start=prev=slots[i];
  }
  ranges.push([start,prev+step]);
  return ranges;
}

function renderCommon(){
  const box=$("commonList");
  box.innerHTML="";
  const found=[];
  for(const d of datesForProject()){
    const s=slotsForProject().filter(t=>allAvailable(slotKey(d,t)));
    if(s.length)found.push({d,slots:s});
    if(found.length===3)break;
  }
  const table=document.createElement("table");
  table.className="common-table";
  table.innerHTML="<thead><tr><th>Date</th><th>Common availability</th></tr></thead>";
  const tbody=document.createElement("tbody");
  if(!found.length){
    const tr=document.createElement("tr"),td=document.createElement("td");
    td.colSpan=2;
    td.textContent="No common date available.";
    td.className="muted";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  found.forEach(x=>{
    const tr=document.createElement("tr"),d=document.createElement("td"),s=document.createElement("td");
    d.textContent=fmtDate(x.d);
    s.textContent=mergeRanges(x.slots).map(r=>`${labelTime12(r[0])}–${labelTime12(r[1])}`).join(" · ");
    tr.append(d,s);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  box.appendChild(table);
}

function renderManagePeople(){
  const box=$("managePeople");
  box.innerHTML="";
  project.people.forEach(name=>{
    const w=document.createElement("div");
    w.className="manage-person";
    const s=document.createElement("span");
    s.textContent=name+(project.hiddenPeople.includes(name)?" (hidden)":"");
    const h=document.createElement("button");
    h.textContent=project.hiddenPeople.includes(name)?"Show":"Hide";
    h.onclick=async()=>{
      project.hiddenPeople.includes(name)?project.hiddenPeople=project.hiddenPeople.filter(x=>x!==name):project.hiddenPeople.push(name);
      renderManagePeople();
      renderAll();
      await persist();
    };
    const d=document.createElement("button");
    d.textContent="Delete";
    d.onclick=async()=>{
      if(!confirm(`Delete ${name} from this meeting?`))return;
      project.people=project.people.filter(x=>x!==name);
      project.hiddenPeople=project.hiddenPeople.filter(x=>x!==name);
      delete project.unavailable[name];
      if(selectedPerson===name)selectedPerson=visiblePeople()[0]||"";
      renderManagePeople();
      renderAll();
      await persist();
    };
    w.append(s,h,d);
    box.appendChild(w);
  });
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}


const meetingIdInput=$("meetingIdInput");
const openMeetingIdBtn=$("openMeetingIdBtn");
if(openMeetingIdBtn) openMeetingIdBtn.onclick=openMeetingFromInput;
if(meetingIdInput) meetingIdInput.addEventListener("keydown",e=>{if(e.key==="Enter")openMeetingFromInput()});

$("newProjectBtn").onclick=()=>{setWelcomeVisible(false);$("newProjectForm").classList.remove("hidden")};
$("cancelProjectBtn").onclick=()=>{$("newProjectForm").classList.add("hidden");setWelcomeVisible(true)};
$("createProjectBtn").onclick=async()=>{
  const name=$("newProject").value.trim(),pin=$("newProjectPin").value.trim();
  if(!name){status("Enter a meeting name.",true);return}
  if(!/^\d{4}$/.test(pin)){status("PIN must contain exactly 4 digits.",true);return}
  try{
    status("Creating meeting…");
    const p=newProjectDefault(name);
    projectPin="";
    await api("/project",{method:"POST",body:JSON.stringify({name,pin,project:p})});
    $("newProject").value="";
    $("newProjectPin").value="";
    await loadProjects();
    selectProject(name,true,true);
    $("projectPin").value=pin;
    projectPin=pin;
    await unlockCurrent();
  }catch(e){status(e.message,true)}
};

$("changeProjectBtn").onclick=resetEntry;
$("copyMeetingLinkBtn").onclick=copyMeetingLink;
$("unlockBtn").onclick=unlockCurrent;
$("projectPin").addEventListener("keydown",e=>{if(e.key==="Enter")unlockCurrent()});
$("newTeammateBtn").onclick=()=>$("newPersonForm").classList.remove("hidden");
$("cancelPersonBtn").onclick=()=>$("newPersonForm").classList.add("hidden");
$("addPersonBtn").onclick=async()=>{
  const name=$("newPerson").value.trim();
  if(!name)return;
  if(project.people.some(x=>x.toLowerCase()===name.toLowerCase())){status("This teammate already exists.",true);return}
  project.people.push(name);
  project.unavailable[name]={};
  $("newPerson").value="";
  selectedPerson=name;
  await persist();
  openWorkspace();
};
$("workspacePerson").onchange=e=>{selectedPerson=e.target.value;renderAll()};
$("backBtn").onclick=resetEntry;
$("settingsBtn").onclick=()=>{
  $("setStart").value=project.startDate;
  $("setEnd").value=project.endDate;
  $("setTimezone").value=project.timezone;
  $("setDayStart").value=project.dayStart;
  $("setDayEnd").value=project.dayEnd;
  $("setSlotMinutes").value=String(project.slotMinutes);
  $("setWeekends").checked=project.includeWeekends;
  renderManagePeople();
  $("settingsCard").classList.remove("hidden");
};
$("cancelSettingsBtn").onclick=()=>$("settingsCard").classList.add("hidden");
$("saveSettingsBtn").onclick=async()=>{
  const s=$("setStart").value,e=$("setEnd").value;
  if(!s||!e||s>e){status("Choose a valid date range.",true);return}
  if(mins($("setDayStart").value)>=mins($("setDayEnd").value)){status("End time must be later than start time.",true);return}
  project.startDate=s;
  project.endDate=e;
  project.timezone=$("setTimezone").value;
  project.dayStart=$("setDayStart").value;
  project.dayEnd=$("setDayEnd").value;
  project.slotMinutes=Number($("setSlotMinutes").value);
  project.includeWeekends=$("setWeekends").checked;
  $("settingsCard").classList.add("hidden");
  renderAll();
  await persist();
};
$("blockAllBtn").onclick=async()=>{for(const d of datesForProject())for(const t of slotsForProject())setUnavailable(selectedPerson,slotKey(d,t),true);renderAll();await persist()};
$("clearAllBtn").onclick=async()=>{ensurePerson(selectedPerson);project.unavailable[selectedPerson]={};renderAll();await persist()};

loadProjects();

// ----- Public feedback / questions -----
let feedbackLoaded = false;
let feedbackLoading = false;

function feedbackStatus(message, error=false){
  const el=$("feedbackStatus");
  if(!el)return;
  el.textContent=message||"";
  el.style.color=error?"#8b3030":"";
}

function formatFeedbackDate(value){
  if(!value)return "";
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return "";
  return d.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}

function renderFeedback(messages){
  const list=$("feedbackList");
  if(!list)return;
  list.innerHTML="";
  if(!Array.isArray(messages)||!messages.length){
    const empty=document.createElement("div");
    empty.className="feedback-empty";
    empty.textContent="No messages yet. Be the first to leave feedback or ask a question.";
    list.appendChild(empty);
    return;
  }
  messages.forEach(item=>{
    const row=document.createElement("div");
    row.className="feedback-item";
    const meta=document.createElement("div");
    meta.className="feedback-meta";
    const name=document.createElement("span");
    name.className="feedback-name";
    name.textContent=item.name||"Anonymous";
    const time=document.createElement("span");
    time.className="feedback-time";
    time.textContent=formatFeedbackDate(item.createdAt);
    const actions=document.createElement("div");
    actions.className="feedback-actions";
    const deleteBtn=document.createElement("button");
    deleteBtn.type="button";
    deleteBtn.className="feedback-delete";
    deleteBtn.setAttribute("aria-label",`Delete message from ${item.name||"Anonymous"}`);
    deleteBtn.title="Delete message";
    deleteBtn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 10v6M14 10v6"/></svg>';
    deleteBtn.addEventListener("click",()=>deleteFeedbackMessage(item));
    actions.appendChild(deleteBtn);
    const msg=document.createElement("div");
    msg.className="feedback-message";
    msg.textContent=item.message||"";
    meta.append(name,time,actions);
    row.append(meta,msg);
    list.appendChild(row);
  });
  list.scrollTop=list.scrollHeight;
}


let feedbackAdminPin = "";

async function deleteFeedbackMessage(item){
  if(!item?.id)return;
  const label=item.name?`Delete ${item.name}'s message?`:'Delete this message?';
  if(!window.confirm(label+" This cannot be undone."))return;

  if(!feedbackAdminPin){
    const entered=window.prompt("Admin PIN/password for deleting feedback messages:");
    if(entered===null)return;
    feedbackAdminPin=entered.trim();
    if(!feedbackAdminPin){feedbackStatus("Admin PIN/password is required to delete messages.",true);return}
  }

  feedbackStatus("Deleting…");
  try{
    const r=await fetch(`${API_URL}/feedback/${encodeURIComponent(item.id)}`,{
      method:"DELETE",
      headers:{"X-Feedback-Admin":feedbackAdminPin}
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      if(r.status===401||r.status===403)feedbackAdminPin="";
      throw new Error(data.error||`HTTP ${r.status}`);
    }
    feedbackLoaded=false;
    await loadFeedback(true);
    feedbackStatus("Message deleted.");
  }catch(e){
    feedbackStatus("Could not delete: "+e.message,true);
  }
}

async function loadFeedback(force=false){
  if(feedbackLoading || (feedbackLoaded && !force))return;
  const list=$("feedbackList");
  if(!list)return;
  feedbackLoading=true;
  try{
    const r=await fetch(API_URL+"/feedback",{headers:{"Accept":"application/json"}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);
    renderFeedback(data.messages||[]);
    feedbackLoaded=true;
    feedbackStatus("");
  }catch(e){
    renderFeedback([]);
    feedbackStatus("Feedback is temporarily unavailable. "+e.message,true);
  }finally{feedbackLoading=false}
}

async function postFeedback(){
  const nameEl=$("feedbackName"), messageEl=$("feedbackMessage"), button=$("feedbackSend");
  if(!nameEl||!messageEl||!button)return;
  const name=nameEl.value.trim();
  const message=messageEl.value.trim();
  if(!name){feedbackStatus("Please enter your name.",true);nameEl.focus();return}
  if(!message){feedbackStatus("Please write a message.",true);messageEl.focus();return}
  if(name.length>40||message.length>1000){feedbackStatus("Your message is too long.",true);return}
  button.disabled=true;
  feedbackStatus("Posting…");
  try{
    const r=await fetch(API_URL+"/feedback",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name,message})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);
    messageEl.value="";
    feedbackLoaded=false;
    await loadFeedback(true);
    feedbackStatus("Posted. Thank you.");
  }catch(e){feedbackStatus("Could not post: "+e.message,true)}
  finally{button.disabled=false}
}

const feedbackSend=$("feedbackSend");
if(feedbackSend)feedbackSend.onclick=postFeedback;
const feedbackMessage=$("feedbackMessage");
if(feedbackMessage)feedbackMessage.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==="Enter")postFeedback();
});
