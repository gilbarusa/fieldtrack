/* 
   FIELDTRACK v6  app.js
   New: assign jobs, NEW badge, API key setting,
        PDF export, admin edits completed jobs
 */

//  STATE 
var state = {
  owners:[], technicians:[], properties:[], jobs:[], users:[],
  _nextId:1, _initialized:false
};
var _stateSaveTimer = null;

var currentUser = null;
var _toastTimer = null;
var _theme = localStorage.getItem('ft_theme')||'dark';
if(_theme==='light'){
  if(document.body){ document.body.classList.add('light'); }
  else{ document.addEventListener('DOMContentLoaded',function(){ document.body.classList.add('light'); }); }
}

// Persist session across refreshes (sessionStorage = tab, localStorage = remember me)
(function(){
  var saved = localStorage.getItem('ft_remember') || sessionStorage.getItem('ft_session');
  if(saved){
    try{
      var u=JSON.parse(saved);
      var found=state.users.find(function(x){ return x.id===u.id&&x.status==='active'; });
      if(found) currentUser=found;
    }catch(e){}
  }
})();

//  HELPERS 
function save(){
  clearTimeout(_stateSaveTimer);
  _stateSaveTimer = setTimeout(function(){
    fetch('state.php',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({state:state})
    })
    .then(function(r){ return r.json(); })
    .then(function(d){ if(!d.ok) console.warn('Save failed:',d); })
    .catch(function(e){ console.warn('Save error:',e); });
  }, 600);
  var t=document.getElementById('save-toast');
  if(t){ t.style.display='block'; clearTimeout(_toastTimer); _toastTimer=setTimeout(function(){ t.style.display='none'; },1800); }
  updateStorageBar();
}
function uid(){ return state._nextId++; }
var COLORS=['#c47f00','#0a7c8e','#b02040','#1a7a4a','#7c3aed','#c2410c','#0369a1','#be185d'];
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt$(n){ return '$'+Number(n||0).toFixed(2); }
function fmtH(n){ return Number(n||0).toFixed(2)+'h'; }
function today(){ return new Date().toISOString().slice(0,10); }
function weekStart(){ var d=new Date(),dy=d.getDay(); d.setDate(d.getDate()-dy); return d.toISOString().slice(0,10); }
function weekEnd(){ var d=new Date(),dy=d.getDay(); d.setDate(d.getDate()+(6-dy)); return d.toISOString().slice(0,10); }
function getTech(id){ return state.technicians.find(function(t){ return t.id===+id; }); }
function getProp(id){ return state.properties.find(function(p){ return p.id===+id; }); }
function getOwner(id){ return state.owners.find(function(o){ return o.id===+id; }); }
function getUser(id){ return state.users.find(function(u){ return u.id===+id; }); }
function getJob(id){ return state.jobs.find(function(j){ return j.id===+id; }); }
function propFullAddr(p){ if(!p) return ''; return [p.address,p.unit,p.city].filter(Boolean).join(', '); }
function addrMatch(p,term){ if(!term) return true; return (p.name+' '+propFullAddr(p)).toLowerCase().indexOf(term.toLowerCase())>=0; }
function jobMatchesSearch(job,term){
  if(!term) return true;
  var prop=getProp(job.propId);
  var haystack=[prop?prop.name:'',prop?propFullAddr(prop):'',job.notes||'',
    (job.hours||[]).map(function(h){ return h.desc||''; }).join(' '),
    (job.expenses||[]).map(function(e){ return (e.store||'')+' '+(e.desc||''); }).join(' ')
  ].join(' ').toLowerCase();
  return haystack.indexOf(term.toLowerCase())>=0;
}
function jobTotalHours(job){ return (job.hours||[]).reduce(function(s,h){ return s+h.hours; },0); }
function jobTotalLabor(job){
  var tech=getTech(job.techId),prop=getProp(job.propId);
  var rate=prop?(prop.rateType==='tech'&&tech?+tech.rate:(prop.defaultRate?+prop.defaultRate:(tech?+tech.rate:0))):0;
  return jobTotalHours(job)*rate;
}
function jobTotalExp(job){ return (job.expenses||[]).reduce(function(s,e){ return s+e.cost; },0); }
function populateSelect(sel,items,valKey,labelFn,emptyLabel){
  var prev=sel.value; sel.innerHTML=emptyLabel?'<option value="">'+emptyLabel+'</option>':'';
  items.forEach(function(i){ var o=document.createElement('option'); o.value=i[valKey]; o.textContent=labelFn(i); sel.appendChild(o); });
  if(prev) sel.value=prev;
}
function hlTerm(text,term){
  if(!term||!text) return esc(text);
  var escaped=esc(text);
  var idx=escaped.toLowerCase().indexOf(esc(term).toLowerCase());
  if(idx<0) return escaped;
  return escaped.slice(0,idx)+'<mark>'+escaped.slice(idx,idx+esc(term).length)+'</mark>'+escaped.slice(idx+esc(term).length);
}

//  API KEY (stored server-side in state only — not in localStorage)
function getApiKey(){
  return state._apiKey || '';
}
function setApiKey(k){
  var key=k.trim();
  state._apiKey=key;
  save();
}

//  THEME 
function toggleTheme(){
  _theme=_theme==='dark'?'light':'dark';
  document.body.classList.toggle('light',_theme==='light');
  localStorage.setItem('ft_theme',_theme);
  var btn=document.getElementById('theme-toggle');
  if(btn) btn.textContent=_theme==='dark'?' Light':' Dark';
}

//  STORAGE BAR 
function updateStorageBar(){
  var ls=JSON.stringify(state).length;
  var lsKB=Math.round(ls/1024);
  var lsPct=Math.min(100,(ls/(5*1024*1024))*100).toFixed(1);
  var color=lsPct>80?'#b02040':lsPct>50?'#c47f00':'#1a7a4a';
  ['storage-fill','storage-fill2'].forEach(function(id){ var el=document.getElementById(id); if(el){ el.style.width=lsPct+'%'; el.style.background=color; } });
  ['storage-label','storage-label2'].forEach(function(id){ var el=document.getElementById(id); if(el) el.textContent='Text: '+lsKB+'KB / 5MB ('+lsPct+'%)'; });
  FT_DB.countBytes(function(err,bytes){
    var mb=(bytes/(1024*1024)).toFixed(1);
    ['storage-photo','storage-photo2'].forEach(function(id){ var el=document.getElementById(id); if(el) el.textContent='Photos: ~'+mb+'MB'; });
  });
}

//  SIDEBAR 
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebar-backdrop').classList.toggle('open'); }
function closeSidebar(){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-backdrop').classList.remove('open'); }
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(function(m){
  m.addEventListener('click',function(e){ if(e.target===m) m.classList.remove('open'); });
});

//  NAV GROUPS 
function toggleNavGroup(el){
  var key=el.getAttribute('data-group');
  var items=el.nextElementSibling;
  var chevron=el.querySelector('.nav-chevron');
  var isCollapsed=items.style.maxHeight==='0px'||items.style.maxHeight==='';
  if(isCollapsed){ items.style.maxHeight=items.scrollHeight+'px'; if(chevron) chevron.style.transform='rotate(0deg)'; }
  else { items.style.maxHeight='0px'; if(chevron) chevron.style.transform='rotate(-90deg)'; }
  var saved=JSON.parse(localStorage.getItem('ft_nav')||'{}');
  saved[key]=!isCollapsed;
  localStorage.setItem('ft_nav',JSON.stringify(saved));
}
function restoreNavState(){
  var saved=JSON.parse(localStorage.getItem('ft_nav')||'{}');
  document.querySelectorAll('.nav-group-header').forEach(function(el){
    var key=el.getAttribute('data-group');
    var items=el.nextElementSibling;
    var chevron=el.querySelector('.nav-chevron');
    if(saved[key]===true){ items.style.maxHeight='0px'; if(chevron) chevron.style.transform='rotate(-90deg)'; }
    else { items.style.maxHeight=items.scrollHeight+'px'; }
  });
}

//  AUTH 
var _lp=document.getElementById('login-pass'); if(_lp) _lp.addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
var _lu=document.getElementById('login-user'); if(_lu) _lu.addEventListener('keydown',function(e){ if(e.key==='Enter') document.getElementById('login-pass').focus(); });
function doLogin(){
  var uname=document.getElementById('login-user').value.trim().toLowerCase();
  var pass=document.getElementById('login-pass').value;
  var err=document.getElementById('login-err'); err.style.display='none';
  var user=state.users.find(function(u){ return u.username===uname&&u.password===pass&&u.status==='active'; });
  if(!user){ err.style.display='block'; return; }
  setCurrentUser(user);
}
function setCurrentUser(user){
  currentUser=user;
  var remember=(document.getElementById('remember-me')||{}).checked;
  if(remember){ localStorage.setItem('ft_remember',JSON.stringify({id:user.id})); }
  else { localStorage.removeItem('ft_remember'); }
  sessionStorage.setItem('ft_session',JSON.stringify({id:user.id}));
  document.getElementById('topbar-name').textContent=user.name;
  document.getElementById('topbar-role').textContent=user.role==='admin'?'Admin':'Tech';
  var btn=document.getElementById('theme-toggle'); if(btn) btn.textContent=_theme==='dark'?' Light':' Dark';
  document.getElementById('badge-name').textContent=user.name;
  document.getElementById('badge-role').textContent=user.role==='admin'?' Administrator':'&#x1F477; Technician';
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').classList.add('visible');
  renderNav(); updateStorageBar();
  if(user.role==='admin') showPage('jobs');
  else showPage('myjobs');
}
function doLogout(){
  currentUser=null; sessionStorage.removeItem('ft_session'); localStorage.removeItem('ft_remember');
  document.getElementById('app').classList.remove('visible');
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('login-user').value=''; document.getElementById('login-pass').value='';
  closeSidebar();
}
function isAdmin(){ return currentUser&&currentUser.role==='admin'; }

//  NAV 
function renderNav(){
  var nav=document.getElementById('sidebar-nav');
  var h='';
  if(isAdmin()){
    h+='<div class="nav-group"><button class="nav-group-header" data-group="main" onclick="toggleNavGroup(this)">Main <span class="nav-chevron">&#x25BE;</span></button><div class="nav-group-items">';
    h+='<button class="nav-btn" id="nav-dashboard" onclick="showPage(\'dashboard\');closeSidebar()"><span class="ico">&#x1F4CA;</span>Dashboard</button>';
    h+='<button class="nav-btn" id="nav-jobs" onclick="showPage(\'jobs\');closeSidebar()"><span class="ico">&#x1F4CB;</span>All Jobs</button>';
    h+='<button class="nav-btn" id="nav-reports" onclick="showPage(\'reports\');closeSidebar()"><span class="ico">&#x1F4C8;</span>Reports</button>';
    h+='</div></div>';
    h+='<div class="nav-group"><button class="nav-group-header" data-group="setup" onclick="toggleNavGroup(this)">Setup <span class="nav-chevron">&#x25BE;</span></button><div class="nav-group-items">';
    h+='<button class="nav-btn" id="nav-technicians" onclick="showPage(\'technicians\');closeSidebar()"><span class="ico">&#x1F477;</span>Technicians</button>';
    h+='<button class="nav-btn" id="nav-properties" onclick="showPage(\'properties\');closeSidebar()"><span class="ico">&#x1F3E2;</span>Properties</button>';
    h+='<button class="nav-btn" id="nav-owners" onclick="showPage(\'owners\');closeSidebar()"><span class="ico">&#x1F464;</span>Owners</button>';
    h+='<button class="nav-btn" id="nav-users" onclick="showPage(\'users\');closeSidebar()"><span class="ico">&#x1F510;</span>Users</button>';
    h+='</div></div>';
    h+='<div class="nav-group"><button class="nav-group-header" data-group="data" onclick="toggleNavGroup(this)">Data <span class="nav-chevron">&#x25BE;</span></button><div class="nav-group-items">';
    h+='<button class="nav-btn" id="nav-data" onclick="showPage(\'data\');closeSidebar()"><span class="ico">&#x1F4BE;</span>Manage Data</button>';
    h+='<button class="nav-btn" id="nav-settings" onclick="showPage(\'settings\');closeSidebar()"><span class="ico">&#x2699;&#xFE0F;</span>Settings</button>';
    h+='</div></div>';
    h+='<div class="nav-group"><button class="nav-group-header" data-group="booking" onclick="toggleNavGroup(this)">Booking <span class="nav-chevron">&#x25BE;</span></button><div class="nav-group-items">';
    h+='<button class="nav-btn" id="nav-requests" onclick="showPage(\'requests\');closeSidebar()"><span class="ico">&#x1F4E5;</span>Requests <span id="req-badge" style="background:#e05c7a;color:#fff;font-size:10px;padding:1px 6px;border-radius:99px;margin-left:4px;display:none">0</span></button>';
    h+='<button class="nav-btn" id="nav-availability" onclick="showPage(\'availability\');closeSidebar()"><span class="ico">&#x1F4C5;</span>Availability</button>';
    h+='<button class="nav-btn" id="nav-shares" onclick="showPage(\'shares\');closeSidebar()"><span class="ico">&#x1F517;</span>Share Links</button>';
    h+='</div></div>';
  } else {
    h+='<div class="nav-group"><button class="nav-group-header" data-group="mywork" onclick="toggleNavGroup(this)">My Work <span class="nav-chevron">&#x25BE;</span></button><div class="nav-group-items">';
    h+='<button class="nav-btn active" id="nav-myjobs" onclick="showPage(\'myjobs\');closeSidebar()"><span class="ico">&#x1F528;</span>My Jobs</button>';
    h+='</div></div>';
  }
  h+='<div class="nav-spacer"></div>';
  h+='<div class="nav-bottom"><button class="nav-btn" onclick="doLogout()" style="color:var(--accent3)"><span class="ico">&#x1F6AA;</span>Sign Out</button></div>';
  nav.innerHTML=h;
  setTimeout(restoreNavState,10);
}

function showPage(page){
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  var pg=document.getElementById('page-'+page); if(pg) pg.classList.add('active');
  var nb=document.getElementById('nav-'+page); if(nb) nb.classList.add('active');
  try{
    if(page==='myjobs'&&typeof renderMyJobs==='function')      renderMyJobs();
    if(page==='dashboard'&&typeof renderDashboard==='function') renderDashboard();
    if(page==='jobs'&&typeof renderAllJobs==='function')        renderAllJobs();
    if(page==='reports'&&typeof initReportsPage==='function')   initReportsPage();
    if(page==='data'){ if(typeof updateStorageBar==='function') updateStorageBar(); if(typeof populateDeleteSelects==='function') populateDeleteSelects(); }
    if(page==='settings'&&typeof renderSettingsPage==='function')    renderSettingsPage();
    if(page==='requests'&&typeof renderRequestsPage==='function')    renderRequestsPage();
    if(page==='availability'&&typeof renderAvailabilityPage==='function') renderAvailabilityPage();
    if(page==='shares'&&typeof renderSharesPage==='function')      renderSharesPage();
    if(page==='technicians'&&typeof renderTechs==='function') renderTechs();
    if(page==='properties'&&typeof renderProps==='function')  renderProps();
    if(page==='owners'&&typeof renderOwners==='function')      renderOwners();
    if(page==='users'&&typeof renderUsers==='function')       renderUsers();
  }catch(e){ console.error('showPage error:',e); }
  window.scrollTo(0,0);
}



//  PROPERTY AUTOCOMPLETE 
function hlMatch(str,term){
  if(!term) return esc(str);
  var idx=str.toLowerCase().indexOf(term.toLowerCase());
  if(idx<0) return esc(str);
  return esc(str.slice(0,idx))+'<span class="ac-match">'+esc(str.slice(idx,idx+term.length))+'</span>'+esc(str.slice(idx+term.length));
}
function buildPropAC(inputId,listId,hiddenId,selectedId){
  var term=((document.getElementById(inputId)||{}).value||'').trim();
  var list=document.getElementById(listId); if(!list) return;
  if(!term){ list.classList.remove('open'); return; }
  var matches=state.properties.filter(function(p){ return addrMatch(p,term); }).slice(0,12);
  if(!matches.length){ list.classList.remove('open'); return; }
  list.innerHTML=matches.map(function(p){
    return '<div class="ac-item" onclick="selectPropAC(\''+inputId+'\',\''+listId+'\',\''+hiddenId+'\',\''+selectedId+'\','+p.id+')">'
      +'<div>'+hlMatch(p.name,term)+'</div><div class="ac-sub">'+hlMatch(propFullAddr(p),term)+'</div></div>';
  }).join('');
  list.classList.add('open');
}
function selectPropAC(inputId,listId,hiddenId,selectedId,propId){
  var p=getProp(propId);
  var inp=document.getElementById(inputId); if(inp) inp.value='';
  var hid=document.getElementById(hiddenId); if(hid) hid.value=propId;
  var lst=document.getElementById(listId); if(lst) lst.classList.remove('open');
  var sel=document.getElementById(selectedId); if(sel){ sel.textContent=' '+p.name+(p.unit?' ('+p.unit+')':''); sel.style.display='block'; }
}
function njPropSearch(){ buildPropAC('nj-prop-search','nj-ac-list','nj-prop-id','nj-prop-selected'); }
function ajPropSearch(){ buildPropAC('aj-prop-search','aj-ac-list','aj-prop-id','aj-prop-selected'); }
document.addEventListener('click',function(e){
  if(!e.target.closest('.autocomplete-wrap')) document.querySelectorAll('.ac-list').forEach(function(l){ l.classList.remove('open'); });
});

//  NEW BADGE 
// seenJobs stored server-side in state: { userId: [jobId, ...] }
function hasSeenJob(jobId){
  if(!currentUser) return true;
  var seen=state.seenJobs||{};
  return (seen[currentUser.id]||[]).indexOf(+jobId)>=0;
}
function markJobSeen(jobId){
  if(!currentUser) return;
  if(!state.seenJobs) state.seenJobs={};
  if(!state.seenJobs[currentUser.id]) state.seenJobs[currentUser.id]=[];
  if(state.seenJobs[currentUser.id].indexOf(+jobId)<0){
    state.seenJobs[currentUser.id].push(+jobId);
    save();
  }
}

//  JOB CARD RENDER 
function renderJobCard(job, editable, searchTerm){
  var prop=getProp(job.propId);
  var tech=getTech(job.techId);
  var pname=prop?prop.name:'Unknown Property';
  var addr=prop?propFullAddr(prop):'';
  var hrs=jobTotalHours(job), exps=jobTotalExp(job), photos=(job.photos||[]).length;
  var statusTag='<span class="tag '+(job.status==='open'?'tag-open':'tag-complete')+'">'+job.status+'</span>';
  var st=searchTerm||'';
  // NEW badge: assigned by admin, tech hasn't opened yet
  var isNew=job.assignedByAdmin&&!hasSeenJob(job.id)&&!isAdmin();
  var newBadge=isNew?'<span style="background:#e05c7a;color:#fff;font-family:var(--fm);font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;letter-spacing:.5px;margin-left:6px">NEW</span>':'';
  // Assigned-by label for admin view
  var assignedTag=isAdmin()&&job.assignedByAdmin?'<span class="tag tag-purple" style="font-size:10px">assigned</span>':'';

  return '<div class="job-card" id="jcard-'+job.id+'">'
    +'<div class="job-card-header" onclick="toggleJobCard('+job.id+')">'
    +'<div style="flex:1;min-width:0">'
    +'<div class="job-name">'+hlTerm(pname,st)+newBadge+'</div>'
    +'<div class="job-addr">'+hlTerm(addr,st)+(isAdmin()&&tech?' <span style="font-size:11px;color:var(--muted)"> '+esc(tech.name)+'</span>':'')+'</div>'
    +'<div class="job-meta">'+job.date+' &nbsp;&nbsp; '+hrs.toFixed(1)+'h &nbsp;&nbsp; '+fmt$(exps)+' exp &nbsp;&nbsp; <span style="opacity:.7">[photo] '+photos+'</span></div>'
    +(job.notes?'<div style="font-size:12px;font-weight:700;color:var(--text);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:600px">'+esc(job.notes.length>80?job.notes.slice(0,80)+'…':job.notes)+'</div>':'')
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+assignedTag+statusTag+'<span class="job-chevron" id="jchev-'+job.id+'">&#x25BE;</span></div>'
    +'</div>'
    +'<div class="job-card-body" id="jbody-'+job.id+'">'+buildJobBody(job,editable,st)+'</div>'
    +'</div>';
}

function buildJobBody(job, editable, st){
  var tech=getTech(job.techId);
  var prop=getProp(job.propId);
  var rate=prop?(prop.rateType==='tech'&&tech?+tech.rate:(prop.defaultRate?+prop.defaultRate:(tech?+tech.rate:0))):0;
  var h=''; st=st||'';

  // Admin info bar on assigned jobs
  if(isAdmin()&&job.assignedByAdmin){
    h+='<div style="background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);border-radius:8px;padding:10px 14px;margin:10px 0;font-size:12px;display:flex;align-items:center;gap:8px">'
      +'<span style="color:#7c3aed;font-weight:600">&#x1F4CC; Assigned job</span>'
      +'<span style="color:var(--muted)">Assigned to: <strong style="color:var(--text)">'+esc(tech?tech.name:'?')+'</strong></span>'
      +'<button class="btn btn-secondary btn-xs ml-auto" onclick="openReassignJob('+job.id+')">Reassign</button>'
      +'</div>';
  }

  // ── TIMER + ACTION BUTTONS (top, before notes) ──────────────────────
  if(job.status==='open'||job.status==='in_progress'||job.status==='waiting_parts'){
    h+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 6px;align-items:center">';
    if(job.timerStart){
      h+='<button class="btn btn-secondary btn-sm" onclick="pauseJobTimer('+job.id+')">&#x23F8; Pause</button>';
      h+='<span class="blink" style="font-size:12px;color:#f59e0b;font-family:var(--fm);font-weight:600" id="timer-'+job.id+'">&#x23F1; Running</span>';
    } else {
      h+='<button class="btn btn-primary btn-sm" onclick="startJobTimer('+job.id+')">&#x25B6; Start</button>';
      if(job.status==='in_progress') h+='<span style="font-size:12px;color:#f59e0b;font-family:var(--fm)">&#x23F8; Paused</span>';
    }
    if(job.status!=='waiting_parts'){
      h+='<button class="btn btn-secondary btn-sm" onclick="setJobStatus('+job.id+',\'waiting_parts\')">&#x23F3; Waiting for Parts</button>';
    } else {
      h+='<button class="btn btn-secondary btn-sm" onclick="setJobStatus('+job.id+',\'open\')">&#x1F527; Back to Open</button>';
    }
    h+='<button class="btn btn-complete btn-sm" onclick="event.stopPropagation();markComplete('+job.id+')">&#x2713; Mark Complete</button>';
    if(isAdmin()) h+='<button class="btn btn-secondary btn-sm" onclick="exportJobPDF('+job.id+')">[pdf] PDF</button>';
    h+='</div>';
  }

  if(job.notes){ h+='<div style="font-size:13px;color:var(--muted);margin:10px 0;padding:10px;background:var(--surface2);border-radius:8px;line-height:1.5">'+hlTerm(job.notes,st)+'</div>'; }

  //  HOURS 
  h+='<div class="card-title" style="margin-top:12px;font-size:14px">[time] Hours</div>';
  if((job.hours||[]).length){
    h+='<div style="margin-bottom:8px">';
    job.hours.forEach(function(hr){
      h+='<div class="log-row"><div class="log-date">'+hr.date+'</div>'
        +'<div style="flex:1">'+hlTerm(hr.desc||'',st)+'</div>'
        +'<div style="font-family:var(--fm);color:var(--accent);font-weight:600;white-space:nowrap">'+hr.hours+'h</div>';
      if(editable) h+='<button class="btn btn-danger btn-xs" onclick="deleteHour('+job.id+','+hr.id+')"></button>';
      h+='</div>';
    });
    h+='<div style="text-align:right;font-size:11px;color:var(--muted);font-family:var(--fm);padding-top:4px">Total: <strong>'+jobTotalHours(job).toFixed(2)+'h</strong></div>';
    h+='</div>';
  } else { h+='<div style="color:var(--muted);font-size:13px;margin-bottom:8px">No hours logged yet.</div>'; }
  if(editable){
    h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px">'
      +'<div class="grid-2" style="gap:10px;margin-bottom:8px">'
      +'<div class="form-group" style="margin-bottom:0"><label>Date</label><input type="date" id="ah-date-'+job.id+'" value="'+today()+'"></div>'
      +'<div class="form-group" style="margin-bottom:0"><label>Hours</label><input type="number" id="ah-hrs-'+job.id+'" min="0.25" max="24" step="0.25" placeholder="e.g. 3.5" inputmode="decimal"></div>'
      +'</div>'
      +'<div class="form-group" style="margin-bottom:8px"><label>Work Description <button class="btn btn-ai btn-xs" style="margin-left:6px" onclick="rephraseWorkDesc('+job.id+')">&#x2728; Rephrase</button></label><textarea id="ah-desc-'+job.id+'" rows="2" placeholder="What did you do?"></textarea></div>'
      +'<button class="btn btn-primary btn-sm" onclick="addHour('+job.id+')">+ Add Hours</button>'
      +'</div>';
  }

  //  EXPENSES 
  h+='<div class="card-title" style="font-size:14px">[exp] Expenses</div>';
  if((job.expenses||[]).length){
    h+='<div style="margin-bottom:8px">';
    job.expenses.forEach(function(ex){
      h+='<div class="log-row"><div class="log-date">'+ex.date+'</div>'
        +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500">'+hlTerm(ex.store,st)+'</div>'
        +'<div style="font-size:11px;color:var(--muted)">'+hlTerm(ex.desc||'',st)+'</div></div>'
        +'<div style="font-family:var(--fm);color:var(--success);font-weight:600;white-space:nowrap">'+fmt$(ex.cost)+'</div>';
      if(isAdmin()) h+='<button class="btn btn-secondary btn-xs" title="Toggle property/owner link" onclick="setExpLink('+job.id+','+ex.id+')">'+(ex.linkType==='owner'?'Own':'Prop')+'</button>';
      if(editable) h+='<button class="btn btn-danger btn-xs" onclick="deleteExpense('+job.id+','+ex.id+')"></button>';
      h+='</div>';
    });
    h+='<div style="text-align:right;font-size:11px;color:var(--muted);font-family:var(--fm);padding-top:4px">Total: <strong>'+fmt$(jobTotalExp(job))+'</strong></div>';
    h+='</div>';
  } else { h+='<div style="color:var(--muted);font-size:13px;margin-bottom:8px">No expenses yet.</div>'; }
  if(editable){
    h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px">'
      +'<div class="grid-2" style="gap:10px;margin-bottom:8px">'
      +'<div class="form-group" style="margin-bottom:0"><label>Date</label><input type="date" id="ae-date-'+job.id+'" value="'+today()+'"></div>'
      +'<div class="form-group" style="margin-bottom:0"><label>Store / Vendor</label><input type="text" id="ae-store-'+job.id+'" placeholder="Home Depot..."></div>'
      +'</div>'
      +'<div class="form-group" style="margin-bottom:8px"><label>Total Cost ($)</label><input type="number" id="ae-cost-'+job.id+'" min="0" step="0.01" placeholder="0.00" inputmode="decimal"></div>'
      +'<div class="form-group" style="margin-bottom:8px"><label>Item Description</label><textarea id="ae-desc-'+job.id+'" rows="2" placeholder="What was purchased and why?"></textarea></div>'
      +'<button class="btn btn-success btn-sm" onclick="addExpense('+job.id+')">+ Add Expense</button>'
      +'</div>';
  }

  //  PHOTOS 
  h+='<div class="card-title" style="font-size:14px">[photo] Photos <span style="font-size:11px;color:var(--muted);font-weight:400;font-family:var(--fm)">'+(job.photos||[]).length+' attached</span></div>';
  h+='<div class="photos-grid" id="photos-'+job.id+'">';
  (job.photos||[]).forEach(function(ph){
    h+='<div class="photo-thumb" id="pt-'+ph.id+'" onclick="openLightbox('+ph.id+')">'
      +'<div class="photo-loading" id="pl-'+ph.id+'">...</div>'
      +'<img id="pimg-'+ph.id+'" src="" alt="'+esc(ph.label)+'" style="display:none" onload="this.style.display=\'block\';var l=document.getElementById(\'pl-'+ph.id+'\');if(l)l.style.display=\'none\'">'
      +'<div class="photo-label">'+esc(ph.label)+'</div>';
    if(editable) h+='<button class="photo-del" onclick="event.stopPropagation();deletePhoto('+job.id+','+ph.id+')"></button>';
    h+='</div>';
  });
  if(editable){
    h+='<label class="photo-add" for="ph-input-'+job.id+'"><span class="photo-add-ico">[photo]</span><span>Add Photo</span></label>'
      +'<input type="file" id="ph-input-'+job.id+'" accept="image/*" capture="environment" style="display:none" onchange="handlePhoto('+job.id+',this)">';
  }
  h+='</div>';

  //  AI REPAIR ASSISTANT 
  var apiKey=getApiKey();
  h+='<div class="card-title" style="font-size:14px;margin-top:12px">AI AI Repair Assistant</div>';
  if(!apiKey){
    h+='<div class="alert alert-warn" style="font-size:12px">[!] No API key configured. '+(isAdmin()?'Go to <strong>Settings</strong> to add your Anthropic API key.':'Ask your admin to configure the AI assistant.')+'</div>';
  } else {
    h+='<div id="ai-area-'+job.id+'">'
      +'<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">'
      +'<input type="text" id="ai-q-'+job.id+'" placeholder="Describe the problem... (e.g. AC not cooling, grinding noise)" style="flex:1;min-width:200px" onkeydown="if(event.key===\'Enter\') askAI('+job.id+')">'
      +'<button class="btn btn-ai btn-sm" onclick="askAI('+job.id+')">AI Ask AI</button>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--muted);margin-bottom:8px;font-family:var(--fm)">Photos attached to this job are automatically included in the analysis.</div>'
      +'<div id="ai-chat-'+job.id+'"></div>'
      +'</div>';
  }

  //  SUMMARY 
  var tH=jobTotalHours(job), tL=tH*rate, tE=jobTotalExp(job);
  h+='<div style="margin-top:14px;padding:12px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:13px">';
  h+='<div class="flex" style="justify-content:space-between;margin-bottom:4px"><span>Hours:</span><strong>'+tH.toFixed(2)+'h</strong></div>';
  if(isAdmin()){
    h+='<div class="flex" style="justify-content:space-between;margin-bottom:4px"><span>Labor:</span><strong>'+fmt$(tL)+'</strong></div>';
    h+='<div class="flex" style="justify-content:space-between;margin-bottom:4px"><span>Expenses:</span><strong>'+fmt$(tE)+'</strong></div>';
    h+='<div class="sep"></div>';
    h+='<div class="flex" style="justify-content:space-between"><span style="font-weight:600">Total:</span><strong style="font-size:16px;color:var(--accent)">'+fmt$(tL+tE)+'</strong></div>';
    // Payment status
    if(job.isPaid) h+='<div style="margin-top:8px"><span style="background:rgba(76,175,130,.15);color:var(--success);padding:3px 10px;border-radius:99px;font-size:11px;font-family:var(--fm)">[OK] PAID</span></div>';
    else h+='<div style="margin-top:8px"><span style="background:rgba(224,92,122,.15);color:var(--accent3);padding:3px 10px;border-radius:99px;font-size:11px;font-family:var(--fm)">... UNPAID</span></div>';
  } else {
    // Tech only sees expenses total
    h+='<div class="flex" style="justify-content:space-between;margin-bottom:4px"><span>Expenses:</span><strong>'+fmt$(tE)+'</strong></div>';
  }
  h+='</div>';

  // (action buttons moved to top — see below)
  if(job.status==='complete'){
    h+='<div class="complete-banner">[OK] Completed '+esc(job.completedDate||'')+'.</div>';
    if(isAdmin()){
      h+='<div class="flex flex-wrap" style="margin-top:8px;gap:8px">'
        +'<button class="btn btn-secondary btn-sm" onclick="adminReopenJob('+job.id+')"> Re-open</button>'
        +'<button class="btn btn-secondary btn-sm" onclick="exportJobPDF('+job.id+')">[pdf] PDF</button>'
        +'<button class="btn btn-success btn-sm" onclick="openShareModal('+job.id+')">&#x1F517; Share Link</button>'
        +'<button class="btn btn-secondary btn-sm" onclick="toggleJobPaid('+job.id+')">'+(job.isPaid?'Mark Unpaid':'Mark Paid')+'</button>'
        +'</div>';
      if(job.shareToken){
        var shareUrl='view.php?token='+job.shareToken;
        h+='<div style="margin-top:8px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
          +'<span style="font-family:var(--fm);color:var(--accent2)">&#x1F517; '+esc(shareUrl)+'</span>'
          +'<button class="btn btn-secondary btn-xs" onclick="copyShareLink(\''+shareUrl+'\')">Copy</button>'
          +'</div>';
      }
    }
  }
  // On My Way — tech only, open/in_progress jobs with client phone
  if(!isAdmin() && (job.status==='open'||job.status==='in_progress') && job.clientPhone){
    h+='<div style="margin-top:10px;padding:10px;background:rgba(196,127,0,.08);border:1px solid rgba(196,127,0,.2);border-radius:8px">';
    h+='<div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:8px">&#x1F697; On My Way</div>';
    h+='<div class="flex flex-wrap" style="gap:6px">';
    h+='<button class="btn btn-secondary btn-sm" onclick="sendOnMyWay('+job.id+',5)">5 min</button>';
    h+='<button class="btn btn-secondary btn-sm" onclick="sendOnMyWay('+job.id+',10)">10 min</button>';
    h+='<button class="btn btn-secondary btn-sm" onclick="sendOnMyWay('+job.id+',30)">30 min</button>';
    h+='</div></div>';
  }
  // Message client — admin only, any status, with client phone
  if(isAdmin() && job.clientPhone){
    h+='<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">';
    h+='<input type="text" id="msg-client-'+job.id+'" placeholder="&#x1F4AC; Message client..." style="flex:1;min-width:160px;font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)">';
    h+='<button class="btn btn-secondary btn-sm" onclick="sendJobClientMessage('+job.id+')">&#x1F4F2; Send</button>';
    h+='</div>';
  }
  // Delete job — admin only
  if(isAdmin()){
    h+='<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px">';
    h+='<button class="btn btn-danger btn-sm" onclick="deleteJob('+job.id+')">&#x1F5D1; Delete Job</button>';
    h+='</div>';
  }
  return h;
}

function toggleJobCard(jobId){
  var body=document.getElementById('jbody-'+jobId);
  var chev=document.getElementById('jchev-'+jobId);
  if(!body) return;
  var isOpen=body.classList.toggle('open');
  if(chev) chev.classList.toggle('open',isOpen);
  if(isOpen){
    loadThumbs(getJob(jobId));
    // Mark as seen when tech opens it
    if(!isAdmin()) markJobSeen(jobId);
    // Remove NEW badge from DOM immediately
    var card=document.getElementById('jcard-'+jobId);
    if(card){ var badge=card.querySelector('.job-card-header [style*="e05c7a"]'); if(badge) badge.remove(); }
  }
}
function loadThumbs(job){
  if(!job) return;
  (job.photos||[]).forEach(function(ph){
    var img=document.getElementById('pimg-'+ph.id);
    if(img&&!img.getAttribute('src')){
      FT_DB.getThumb(ph.id, function(err,data){
        if(data){ var i=document.getElementById('pimg-'+ph.id); if(i) i.src=data; }
      });
    }
  });
}
function refreshJobCard(jobId){
  var job=getJob(jobId); if(!job) return;
  var card=document.getElementById('jcard-'+jobId); if(!card) return;
  var editable=isAdmin()||(job.techId===currentUser.techId&&(job.status==='open'||job.status==='in_progress'||job.status==='waiting_parts'));
  var div=document.createElement('div');
  div.innerHTML=renderJobCard(job,editable,'');
  card.replaceWith(div.firstChild);
  var body=document.getElementById('jbody-'+jobId);
  if(body){ body.classList.add('open'); loadThumbs(job); }
  var chev=document.getElementById('jchev-'+jobId); if(chev) chev.classList.add('open');
}

//  ASSIGN JOB (admin) 
function openAssignJob(){
  document.getElementById('aj-date').value=today();
  document.getElementById('aj-prop-search').value='';
  document.getElementById('aj-prop-id').value='';
  var sel=document.getElementById('aj-prop-selected'); if(sel) sel.style.display='none';
  document.getElementById('aj-notes').value='';
  populateSelect(document.getElementById('aj-tech'), state.technicians.filter(function(t){ return t.status==='active'; }), 'id', function(t){ return t.name; }, 'Select technician...');
  openModal('modal-assignjob');
}
function createAssignedJob(){
  var date=document.getElementById('aj-date').value;
  var propId=+document.getElementById('aj-prop-id').value;
  var techId=+document.getElementById('aj-tech').value;
  if(!date||!propId||!techId){ alert('Date, property and technician are all required.'); return; }
  var job={id:uid(),propId:propId,techId:techId,date:date,
    notes:document.getElementById('aj-notes').value,
    status:'open',assignedByAdmin:true,
    hours:[],expenses:[],photos:[]};
  state.jobs.push(job); save(); closeModal('modal-assignjob');
  renderAllJobs();
  alert('[OK] Job assigned to '+getTech(techId).name+'! They will see it when they log in.');
}
function openReassignJob(jobId){
  var job=getJob(jobId);
  document.getElementById('ra-job-id').value=jobId;
  populateSelect(document.getElementById('ra-tech'), state.technicians.filter(function(t){ return t.status==='active'; }), 'id', function(t){ return t.name; }, 'Select...');
  document.getElementById('ra-tech').value=job.techId||'';
  openModal('modal-reassign');
}
function saveReassign(){
  var jobId=+document.getElementById('ra-job-id').value;
  var techId=+document.getElementById('ra-tech').value;
  if(!techId){ alert('Select a technician.'); return; }
  var job=getJob(jobId);
  job.techId=techId; job.assignedByAdmin=true;
  // Reset status to open if job was complete or pending
  if(job.status==='complete'||job.status==='pending_approval'){
    job.status='open'; job.completedDate=null;
  }
  // Reset seen so new tech gets NEW badge
  if(state.seenJobs){
    Object.keys(state.seenJobs).forEach(function(uid){ var idx=state.seenJobs[uid].indexOf(jobId); if(idx>=0) state.seenJobs[uid].splice(idx,1); });
  }
  save(); closeModal('modal-reassign'); renderAllJobs();
}
function adminReopenJob(jobId){
  if(!confirm('Re-open this job? It will be editable again.')) return;
  var job=getJob(jobId); job.status='open'; job.completedDate=null;
  save(); refreshJobCard(jobId);
}

//  HOURS 
function addHour(jobId){
  var job=getJob(jobId);
  var date=(document.getElementById('ah-date-'+jobId)||{}).value;
  var hours=parseFloat((document.getElementById('ah-hrs-'+jobId)||{}).value);
  var desc=(document.getElementById('ah-desc-'+jobId)||{}).value;
  if(!date||!hours){ alert('Date and hours required.'); return; }
  if(!job.hours) job.hours=[];
  job.hours.push({id:uid(),date:date,hours:hours,desc:desc});
  save(); refreshJobCard(jobId);
}
function deleteHour(jobId,hrId){
  var job=getJob(jobId);
  job.hours=(job.hours||[]).filter(function(h){ return h.id!==hrId; });
  save(); refreshJobCard(jobId);
}

//  EXPENSES 
function addExpense(jobId){
  var job=getJob(jobId);
  var date=(document.getElementById('ae-date-'+jobId)||{}).value;
  var store=((document.getElementById('ae-store-'+jobId)||{}).value||'').trim();
  var cost=parseFloat((document.getElementById('ae-cost-'+jobId)||{}).value);
  var desc=(document.getElementById('ae-desc-'+jobId)||{}).value;
  if(!date||!store||!cost){ alert('Date, store and cost required.'); return; }
  if(!job.expenses) job.expenses=[];
  job.expenses.push({id:uid(),date:date,store:store,cost:cost,desc:desc,linkType:'property'});
  save(); refreshJobCard(jobId);
}
function deleteExpense(jobId,expId){
  var job=getJob(jobId);
  job.expenses=(job.expenses||[]).filter(function(e){ return e.id!==expId; });
  save(); refreshJobCard(jobId);
}
function setExpLink(jobId,expId){
  var job=getJob(jobId);
  var exp=(job.expenses||[]).find(function(e){ return e.id===expId; });
  if(exp) exp.linkType=exp.linkType==='owner'?'property':'owner';
  save(); refreshJobCard(jobId);
}

//  PHOTOS 
function handlePhoto(jobId,input){
  var file=input.files[0]; if(!file) return;
  var label=prompt('Label this photo (e.g. Before, Invoice, After, During):','Photo')||'Photo';
  var photoId=uid();
  FT_DB.processAndStore(file, photoId, function(err, thumbData){
    if(err){ alert('Photo error: '+err.message); return; }
    var job=getJob(jobId);
    if(!job.photos) job.photos=[];
    job.photos.push({id:photoId,label:label,date:today()});
    input.value=''; save();
    var grid=document.getElementById('photos-'+jobId);
    if(grid){
      var addBtn=grid.querySelector('.photo-add');
      var thumbDiv=document.createElement('div');
      thumbDiv.className='photo-thumb'; thumbDiv.id='pt-'+photoId;
      thumbDiv.onclick=function(){ openLightbox(photoId); };
      thumbDiv.innerHTML='<img id="pimg-'+photoId+'" src="'+thumbData+'" alt="'+esc(label)+'">'
        +'<div class="photo-label">'+esc(label)+'</div>'
        +'<button class="photo-del" onclick="event.stopPropagation();deletePhoto('+jobId+','+photoId+')"></button>';
      if(addBtn) grid.insertBefore(thumbDiv,addBtn); else grid.appendChild(thumbDiv);
      var meta=document.querySelector('#jcard-'+jobId+' .job-meta');
      if(meta) meta.innerHTML=meta.innerHTML.replace(/[photo] \d+/,'[photo] '+job.photos.length);
    }
  });
}
function deletePhoto(jobId,photoId){
  if(!confirm('Delete this photo?')) return;
  var job=getJob(jobId);
  job.photos=(job.photos||[]).filter(function(p){ return p.id!==photoId; });
  FT_DB.delMany([photoId], function(){ save(); var t=document.getElementById('pt-'+photoId); if(t) t.remove(); });
}
var _lbPhotoId=null;
function openLightbox(photoId){
  _lbPhotoId=photoId;
  var lb=document.getElementById('lightbox'); lb.classList.add('open');
  document.getElementById('lightbox-img').src='';
  FT_DB.getFull(photoId, function(err,data){ if(data){ var i=document.getElementById('lightbox-img'); if(i) i.src=data; } });
  var label='Photo';
  state.jobs.forEach(function(j){ (j.photos||[]).forEach(function(p){ if(p.id===photoId) label=p.label+'  '+j.date; }); });
  var lbl=document.getElementById('lightbox-label'); if(lbl) lbl.textContent=label;
}
function closeLightbox(){ document.getElementById('lightbox').classList.remove('open'); document.getElementById('lightbox-img').src=''; }
var _lb=document.getElementById('lightbox'); if(_lb) _lb.addEventListener('click',function(e){ if(e.target===this) closeLightbox(); });
function markComplete(jobId){
  if(!confirm('Mark as complete?\n'+(isAdmin()?'Admin can still edit it after.':'You will not be able to edit this job anymore.'))) return;
  var job=getJob(jobId);
  if(job.timerStart){
    clearInterval(_timerIntervals[jobId]);
    var elapsed=Math.round((Date.now()-job.timerStart)/3600000*100)/100;
    if(elapsed>=0.01){ job.hours=job.hours||[]; job.hours.push({id:uid(),date:today(),hours:elapsed,desc:'Timer (auto)'}); }
    job.timerStart=null;
  }
  if(isAdmin()){
    job.status='complete'; job.completedDate=today();
  } else {
    job.status='pending_approval'; job.completedDate=today();
  }
  save();
  refreshJobCard(jobId);
}

var _timerIntervals={};

function startJobTimer(jobId){
  var job=getJob(jobId); if(!job) return;
  if(job.timerStart){ alert('Timer already running.'); return; }
  job.timerStart=Date.now();
  job.status='in_progress';
  save();
  setTimeout(function(){ refreshJobCard(jobId); }, 50);
  _timerIntervals[jobId]=setInterval(function(){
    var el=document.getElementById('timer-'+jobId);
    if(!el){ clearInterval(_timerIntervals[jobId]); return; }
    var j=getJob(jobId); if(!j||!j.timerStart){ clearInterval(_timerIntervals[jobId]); return; }
    var sec=Math.floor((Date.now()-j.timerStart)/1000);
    var hh=Math.floor(sec/3600), mm=Math.floor((sec%3600)/60), ss=sec%60;
    el.textContent='\u23f1 '+(hh?hh+'h ':'')+mm+'m '+ss+'s';
  },1000);
}

function pauseJobTimer(jobId){
  var job=getJob(jobId); if(!job||!job.timerStart){ alert('No timer running.'); return; }
  clearInterval(_timerIntervals[jobId]);
  var elapsed=Math.round((Date.now()-job.timerStart)/3600000*100)/100;
  var desc=prompt('Work description (optional):',job.lastTimerDesc||'')||'';
  if(elapsed>=0.01){ job.hours=job.hours||[]; job.hours.push({id:uid(),date:today(),hours:elapsed,desc:desc||'Timer (auto)'}); }
  job.lastTimerDesc=desc;
  job.timerStart=null;
  job.status='in_progress';
  save();
  setTimeout(function(){ refreshJobCard(jobId); }, 50);
}

function setJobStatus(jobId, status){
  var job=getJob(jobId); if(!job) return;
  if(job.timerStart){
    clearInterval(_timerIntervals[jobId]);
    var elapsed=Math.round((Date.now()-job.timerStart)/3600000*100)/100;
    if(elapsed>=0.01){ job.hours=job.hours||[]; job.hours.push({id:uid(),date:today(),hours:elapsed,desc:'Timer (auto)'}); }
    job.timerStart=null;
  }
  job.status=status;
  if(status==='open'||status==='waiting_parts') job.completedDate=null;
  save();
  refreshJobCard(jobId);
}

//  AI 
var _aiHistory={};
function askAI(jobId){
  var question=((document.getElementById('ai-q-'+jobId)||{}).value||'').trim();
  if(!question){ alert('Please describe the problem first.'); return; }
  var apiKey=getApiKey();
  if(!apiKey){ alert('No API key configured. Go to Settings to add your Anthropic API key.'); return; }
  var job=getJob(jobId); var prop=getProp(job.propId);
  if(!_aiHistory[jobId]) _aiHistory[jobId]=[];
  var systemPrompt='You are an expert field technician assistant for a property maintenance company. '
    +'Diagnose problems, suggest fixes, identify parts needed, and give safety warnings. '
    +'Be concise and practical. Use emojis as section headers: '
    +'[search] Likely Causes, [fix] Recommended Steps, [parts] Parts Needed, [!] Safety Notes. '
    +'Keep it actionable for a tech on-site.';
  var context='';
  if(_aiHistory[jobId].length===0){
    context='Property: '+(prop?prop.name+', '+propFullAddr(prop):'unknown')+'. '
      +'Notes: '+(job.notes||'none')+'. '
      +'Recent work: '+((job.hours||[]).slice(-3).map(function(h){ return h.desc; }).join(', ')||'none')+'. ';
  }
  _aiHistory[jobId].push({role:'user',content:context+question});
  var chatEl=document.getElementById('ai-chat-'+jobId); if(!chatEl) return;
  chatEl.innerHTML+=renderAIMsg('user',question);
  chatEl.innerHTML+='<div class="ai-thinking" id="ai-think-'+jobId+'"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span style="margin-left:4px">Analyzing...</span></div>';
  chatEl.scrollIntoView({behavior:'smooth',block:'nearest'});
  var qEl=document.getElementById('ai-q-'+jobId); if(qEl) qEl.value='';
  var photoMessages=[];
  var photoPromises=(job.photos||[]).slice(0,3).map(function(ph){
    return new Promise(function(resolve){
      FT_DB.getFull(ph.id, function(err,data){
        if(data) photoMessages.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:data.split(',')[1]}});
        resolve();
      });
    });
  });
  Promise.all(photoPromises).then(function(){
    var messages=_aiHistory[jobId].slice();
    if(photoMessages.length>0){
      var last=messages[messages.length-1];
      messages[messages.length-1]={role:'user',content:photoMessages.concat([{type:'text',text:last.content}])};
    }
    // Use local proxy to avoid CORS issues
    var payload=Object.assign({},{model:'claude-sonnet-4-20250514',max_tokens:1000,system:systemPrompt,messages:messages});
    fetch('proxy.php',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      var think=document.getElementById('ai-think-'+jobId); if(think) think.remove();
      var reply='';
      if(data.content&&data.content.length){ data.content.forEach(function(c){ if(c.type==='text') reply+=c.text; }); }
      else if(data.error) reply='[!] API error: '+data.error.message;
      _aiHistory[jobId].push({role:'assistant',content:reply});
      var chat=document.getElementById('ai-chat-'+jobId);
      if(chat){ chat.innerHTML+=renderAIMsg('assistant',reply); chat.scrollIntoView({behavior:'smooth',block:'nearest'}); }
    })
    .catch(function(err){
      var think=document.getElementById('ai-think-'+jobId); if(think) think.remove();
      var chat=document.getElementById('ai-chat-'+jobId);
      if(chat) chat.innerHTML+=renderAIMsg('assistant','[!] Connection error: '+err.message+'\n\nMake sure your API key is valid and you have internet access.');
    });
  });
}
function renderAIMsg(role,text){
  var html=esc(text)
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/^([search]|[fix]|[parts]|[!]|[OK]|&#x1F4CB;|[tip]) (.+)$/gm,'<strong>$1 $2</strong>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g,'<ul>$&</ul>')
    .replace(/\n/g,'<br>');
  return '<div class="ai-message '+role+'">'+html+'</div>';
}

//  PDF EXPORT 
function exportJobPDF(jobId){
  var job=getJob(jobId);
  var prop=getProp(job.propId);
  var tech=getTech(job.techId);
  var owner=prop?getOwner(prop.ownerId):null;
  var tH=jobTotalHours(job), tL=jobTotalLabor(job), tE=jobTotalExp(job);

  var html='<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<title>Job Report</title>'
    +'<style>'
    +'body{font-family:Arial,sans-serif;font-size:13px;color:#1a1d26;margin:0;padding:32px;max-width:760px}'
    +'h1{font-size:22px;margin-bottom:4px;color:#c47f00}'
    +'h2{font-size:15px;margin:20px 0 8px;border-bottom:2px solid #e5e7eb;padding-bottom:4px;color:#374151}'
    +'.meta{color:#6b7280;font-size:12px;margin-bottom:20px}'
    +'.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:16px}'
    +'.info-item label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;display:block}'
    +'.info-item span{font-weight:600}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}'
    +'th{background:#f3f4f6;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;border-bottom:2px solid #e5e7eb}'
    +'td{padding:8px 10px;border-bottom:1px solid #f3f4f6}'
    +'.total-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin-top:16px}'
    +'.total-row{display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px}'
    +'.total-row.grand{font-weight:700;font-size:15px;color:#c47f00;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px}'
    +'.status{display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;'
    +(job.status==='complete'?'background:#dcfce7;color:#166534':'background:#dbeafe;color:#1e40af')+'}'
    +'.footer{margin-top:32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}'
    +'@media print{body{padding:16px}}'
    +'</style></head><body>';

  html+='<h1>FieldTrack Job Report</h1>';
  html+='<div class="meta">Generated: '+new Date().toLocaleString()+' &nbsp;&nbsp; Status: <span class="status">'+job.status+'</span></div>';

  html+='<h2>Property Information</h2>';
  html+='<div class="info-grid">'
    +'<div class="info-item"><label>Property</label><span>'+(prop?prop.name:'')+'</span></div>'
    +'<div class="info-item"><label>Owner</label><span>'+(owner?owner.name:'')+'</span></div>'
    +'<div class="info-item"><label>Address</label><span>'+(prop?prop.address:'')+'</span></div>'
    +'<div class="info-item"><label>Unit</label><span>'+(prop&&prop.unit?prop.unit:'')+'</span></div>'
    +'<div class="info-item"><label>City</label><span>'+(prop&&prop.city?prop.city:'')+'</span></div>'
    +'<div class="info-item"><label>Technician</label><span>'+(tech?tech.name:'')+'</span></div>'
    +'<div class="info-item"><label>Job Date</label><span>'+job.date+'</span></div>'
    +(job.completedDate?'<div class="info-item"><label>Completed</label><span>'+job.completedDate+'</span></div>':'')
    +'</div>';

  if(job.notes){ html+='<h2>Job Notes</h2><p style="color:#374151;line-height:1.6">'+esc(job.notes)+'</p>'; }

  html+='<h2>Hours Logged</h2>';
  if((job.hours||[]).length){
    html+='<table><thead><tr><th>Date</th><th>Description</th><th>Hours</th></tr></thead><tbody>';
    job.hours.forEach(function(hr){ html+='<tr><td>'+hr.date+'</td><td>'+esc(hr.desc||'')+'</td><td>'+hr.hours+'h</td></tr>'; });
    html+='<tr style="font-weight:600"><td colspan="2" style="text-align:right">Total Hours:</td><td>'+tH.toFixed(2)+'h</td></tr>';
    html+='</tbody></table>';
  } else { html+='<p style="color:#9ca3af">No hours logged.</p>'; }

  html+='<h2>Expenses</h2>';
  if((job.expenses||[]).length){
    html+='<table><thead><tr><th>Date</th><th>Store</th><th>Description</th><th>Amount</th></tr></thead><tbody>';
    job.expenses.forEach(function(ex){ html+='<tr><td>'+ex.date+'</td><td>'+esc(ex.store||'')+'</td><td>'+esc(ex.desc||'')+'</td><td>'+fmt$(ex.cost)+'</td></tr>'; });
    html+='<tr style="font-weight:600"><td colspan="3" style="text-align:right">Total Expenses:</td><td>'+fmt$(tE)+'</td></tr>';
    html+='</tbody></table>';
  } else { html+='<p style="color:#9ca3af">No expenses.</p>'; }

  if((job.photos||[]).length){
    html+='<h2>Photos ('+job.photos.length+' attached)</h2>';
    html+='<p style="color:#6b7280;font-size:12px">'+job.photos.map(function(p){ return esc(p.label)+' ('+p.date+')'; }).join(' &nbsp;&nbsp; ')+'</p>';
  }

  html+='<div class="total-box">'
    +'<div class="total-row"><span>Total Hours:</span><span>'+tH.toFixed(2)+'h</span></div>'
    +'<div class="total-row"><span>Labor Cost:</span><span>'+fmt$(tL)+'</span></div>'
    +'<div class="total-row"><span>Total Expenses:</span><span>'+fmt$(tE)+'</span></div>'
    +'<div class="total-row grand"><span>TOTAL:</span><span>'+fmt$(tL+tE)+'</span></div>'
    +'</div>';

  html+='<div class="footer">FieldTrack &nbsp;&nbsp; tech.willowpa.com &nbsp;&nbsp; Report generated '+today()+'</div>';
  html+='</body></html>';

  var win=window.open('','_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(function(){ win.print(); },500);
}

//  TECH: MY JOBS 
function openNewJob(){
  document.getElementById('nj-date').value=today();
  document.getElementById('nj-prop-search').value='';
  document.getElementById('nj-prop-id').value='';
  var sel=document.getElementById('nj-prop-selected'); if(sel) sel.style.display='none';
  document.getElementById('nj-notes').value='';
  openModal('modal-newjob');
}
function createJob(){
  var date=document.getElementById('nj-date').value;
  var propId=+document.getElementById('nj-prop-id').value;
  if(!date||!propId){ alert('Date and property are required.'); return; }
  var job={id:uid(),propId:propId,techId:currentUser.techId,date:date,
    notes:document.getElementById('nj-notes').value,
    status:'open',assignedByAdmin:false,
    hours:[],expenses:[],photos:[]};
  state.jobs.push(job); save(); closeModal('modal-newjob'); renderMyJobs();
}
function renderMyJobs(){
  var searchTerm=(document.getElementById('myjobs-search')||{}).value||'';
  var myJobs=state.jobs.filter(function(j){
    return j.techId===currentUser.techId&&j.status==='open'&&jobMatchesSearch(j,searchTerm);
  });
  myJobs.sort(function(a,b){
    // NEW jobs first
    var aN=a.assignedByAdmin&&!hasSeenJob(a.id)?0:1;
    var bN=b.assignedByAdmin&&!hasSeenJob(b.id)?0:1;
    if(aN!==bN) return aN-bN;
    return b.date.localeCompare(a.date);
  });
  var el=document.getElementById('myjobs-list');
  if(!myJobs.length){
    el.innerHTML='<div class="empty-state"><span class="emoji">&#x1F528;</span>'+(searchTerm?'No jobs match "'+esc(searchTerm)+'"':'No open jobs.<br>Tap "+ New Job" to start one.')+'</div>';
    return;
  }
  el.innerHTML=myJobs.map(function(j){ return renderJobCard(j,true,searchTerm); }).join('');
}

//  ADMIN: ALL JOBS 
function renderAllJobs(){
  var statusF=(document.getElementById('jobs-filter-status')||{}).value||'';
  var techF=+((document.getElementById('jobs-filter-tech')||{}).value)||0;
  var searchTerm=(document.getElementById('jobs-search')||{}).value||'';
  populateSelect(document.getElementById('jobs-filter-tech'), state.technicians, 'id', function(t){ return t.name; }, 'All Techs');
  var jobs=state.jobs.slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
  if(statusF) jobs=jobs.filter(function(j){ return j.status===statusF; });
  if(techF)   jobs=jobs.filter(function(j){ return +j.techId===techF; });
  if(searchTerm) jobs=jobs.filter(function(j){ return jobMatchesSearch(j,searchTerm); });
  var el=document.getElementById('all-jobs-list');
  if(!jobs.length){ el.innerHTML='<div class="empty-state"><span class="emoji">&#x1F4CB;</span>No jobs found.</div>'; return; }
  el.innerHTML=jobs.map(function(j){ return renderJobCard(j,true,searchTerm); }).join('');
}

//  DASHBOARD 
function renderDashboard(){
  var ws=weekStart(),we=weekEnd();
  var wJobs=state.jobs.filter(function(j){ return j.date>=ws&&j.date<=we; });
  var openJobs=state.jobs.filter(function(j){ return j.status==='open'; });
  var wH=wJobs.reduce(function(s,j){ return s+jobTotalHours(j); },0);
  var wL=wJobs.reduce(function(s,j){ return s+jobTotalLabor(j); },0);
  var wE=wJobs.reduce(function(s,j){ return s+jobTotalExp(j); },0);
  document.getElementById('dash-stats').innerHTML=
    '<div class="stat-card"><div class="stat-label">Open Jobs</div><div class="stat-value" style="color:var(--accent2)">'+openJobs.length+'</div><div class="stat-sub">pending</div></div>'
    +'<div class="stat-card"><div class="stat-label">Week Hours</div><div class="stat-value" style="color:var(--accent)">'+wH.toFixed(1)+'</div><div class="stat-sub">'+wJobs.length+' jobs</div></div>'
    +'<div class="stat-card"><div class="stat-label">Week Labor</div><div class="stat-value" style="color:var(--success)">'+fmt$(wL)+'</div></div>'
    +'<div class="stat-card"><div class="stat-label">Week Expenses</div><div class="stat-value" style="color:var(--accent3)">'+fmt$(wE)+'</div></div>';
  var recent=state.jobs.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).slice(0,6);
  document.getElementById('dash-recent').innerHTML=recent.length?recent.map(function(j){
    var prop=getProp(j.propId),tech=getTech(j.techId);
    return '<div style="display:flex;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);gap:8px;flex-wrap:wrap">'
      +'<span style="font-family:var(--fm);font-size:11px;color:var(--muted);width:82px;flex-shrink:0">'+j.date+'</span>'
      +'<span style="flex:1;font-size:13px">'+(tech?esc(tech.name):'')+'</span>'
      +'<span class="tag tag-blue" style="font-size:10px">'+(prop?esc(prop.name):'')+'</span>'
      +'<span class="tag '+({'open':'tag-open','in_progress':'tag-yellow','waiting_parts':'tag-blue','pending_approval':'tag-pink','complete':'tag-complete'}[j.status]||'tag-open')+'">'+({'open':'Open','in_progress':'In Progress','waiting_parts':'Waiting Parts','pending_approval':'Pending Approval','complete':'Complete'}[j.status]||j.status)+'</span>'
      +'</div>';
  }).join(''):'<div class="empty-state" style="padding:20px"><span class="emoji">[empty]</span>No jobs yet</div>';
  var byP={};
  wJobs.forEach(function(j){ var p=getProp(j.propId),k=j.propId; if(!byP[k]) byP[k]={name:p?p.name:'?',hours:0}; byP[k].hours+=jobTotalHours(j); });
  var rows=Object.values(byP).sort(function(a,b){ return b.hours-a.hours; });
  document.getElementById('dash-props').innerHTML=rows.length?rows.map(function(p,i){
    var pct=wH?(p.hours/wH*100).toFixed(0):0;
    return '<div style="margin-bottom:12px"><div class="flex" style="margin-bottom:4px;font-size:13px">'
      +'<span class="color-dot" style="background:'+COLORS[i%COLORS.length]+'"></span><span>'+esc(p.name)+'</span>'
      +'<span class="ml-auto" style="font-family:var(--fm);color:var(--muted);font-size:11px">'+p.hours.toFixed(1)+'h</span>'
      +'</div><div style="height:4px;background:var(--surface2);border-radius:99px;overflow:hidden">'
      +'<div style="height:100%;width:'+pct+'%;background:'+COLORS[i%COLORS.length]+';border-radius:99px"></div></div></div>';
  }).join(''):'<div class="empty-state" style="padding:20px"><span class="emoji">&#x1F3E2;</span>No data this week</div>';
}

//  REPORTS 
var currentPeriod='today';
function initReportsPage(){
  populateSelect(document.getElementById('rep-filter-owner'), state.owners, 'id', function(o){ return o.name; }, 'All Owners');
  if(!document.getElementById('rep-from').value) document.getElementById('rep-from').value=weekStart();
  if(!document.getElementById('rep-to').value) document.getElementById('rep-to').value=weekEnd();
}
function setPeriod(p,btn){
  currentPeriod=p;
  document.querySelectorAll('.period-tab').forEach(function(t){ t.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('custom-range').style.display=p==='custom'?'flex':'none';
}
function generateReport(){
  var from,to;
  if(currentPeriod==='today'){ from=today(); to=today(); }
  else if(currentPeriod==='week'){ from=weekStart(); to=weekEnd(); }
  else{ from=document.getElementById('rep-from').value; to=document.getElementById('rep-to').value; }
  if(!from||!to){ alert('Select a date range.'); return; }
  var ownerF=+document.getElementById('rep-filter-owner').value||null;
  var addrF=(document.getElementById('rep-filter-addr').value||'').trim();
  var jobs=state.jobs.filter(function(j){ return j.date>=from&&j.date<=to; });
  if(ownerF){ var opids=state.properties.filter(function(p){ return p.ownerId===ownerF; }).map(function(p){ return p.id; }); jobs=jobs.filter(function(j){ return opids.indexOf(+j.propId)>=0; }); }
  if(addrF){ jobs=jobs.filter(function(j){ var p=getProp(j.propId); return p&&addrMatch(p,addrF); }); }
  var out=document.getElementById('report-output');
  if(!jobs.length){ out.innerHTML='<div class="empty-state"><span class="emoji">[search]</span>No jobs for this period.</div>'; return; }
  var totalH=jobs.reduce(function(s,j){ return s+jobTotalHours(j); },0);
  var totalL=jobs.reduce(function(s,j){ return s+jobTotalLabor(j); },0);
  var totalE=jobs.reduce(function(s,j){ return s+jobTotalExp(j); },0);
  var byP={},byO={},byT={};
  jobs.forEach(function(j){
    var p=getProp(j.propId),o=p?getOwner(p.ownerId):null,tech=getTech(j.techId);
    var h=jobTotalHours(j),l=jobTotalLabor(j),e=jobTotalExp(j);
    var pk=j.propId; if(!byP[pk]) byP[pk]={name:p?p.name:'?',addr:p?propFullAddr(p):'',hours:0,labor:0,exp:0};
    byP[pk].hours+=h; byP[pk].labor+=l; byP[pk].exp+=e;
    var ok=o?o.id:0; if(!byO[ok]) byO[ok]={name:o?o.name:'No Owner',hours:0,labor:0,exp:0,props:{}};
    byO[ok].hours+=h; byO[ok].labor+=l; byO[ok].exp+=e;
    var pn=p?p.name:'?'; if(!byO[ok].props[pn]) byO[ok].props[pn]={hours:0,labor:0,exp:0};
    byO[ok].props[pn].hours+=h; byO[ok].props[pn].labor+=l; byO[ok].props[pn].exp+=e;
    var tk=j.techId; if(!byT[tk]) byT[tk]={name:tech?tech.name:'?',hours:0,labor:0,jobs:0};
    byT[tk].hours+=h; byT[tk].labor+=l; byT[tk].jobs++;
  });
  var pl=currentPeriod==='today'?today():from+'  '+to;
  var html='<div class="flex flex-wrap" style="margin-bottom:16px;gap:8px">'
    +'<span style="font-family:var(--fm);font-size:13px;color:var(--muted)">Period: <strong style="color:var(--text)">'+pl+'</strong></span>'
    +'<div class="ml-auto flex flex-wrap" style="gap:8px">'
    +'<button class="btn btn-secondary btn-sm" onclick="window.print()"> Print</button>'
    +'<button class="btn btn-success btn-sm" onclick="exportExcel()">&#x1F4CA; Excel</button>'
    +'<button class="btn btn-secondary btn-sm" onclick="exportReportPDF()">[pdf] PDF</button>'
    +'</div></div>';
  html+='<div class="grid-4" style="margin-bottom:20px">'
    +'<div class="stat-card"><div class="stat-label">Hours</div><div class="stat-value" style="color:var(--accent)">'+totalH.toFixed(2)+'</div></div>'
    +'<div class="stat-card"><div class="stat-label">Labor</div><div class="stat-value" style="color:var(--success)">'+fmt$(totalL)+'</div></div>'
    +'<div class="stat-card"><div class="stat-label">Expenses</div><div class="stat-value" style="color:var(--accent3)">'+fmt$(totalE)+'</div></div>'
    +'<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value" style="color:var(--accent2)">'+fmt$(totalL+totalE)+'</div></div>'
    +'</div>';
  html+='<div class="report-section"><div class="report-header">&#x1F464; By Owner</div>';
  Object.values(byO).forEach(function(o){
    html+='<div class="card" style="margin-bottom:10px;padding:14px"><div class="flex flex-wrap" style="margin-bottom:8px;gap:6px">'
      +'<div style="font-family:var(--fd);font-size:14px;font-weight:600">'+esc(o.name)+'</div>'
      +'<div class="ml-auto flex flex-wrap" style="gap:5px"><span class="tag tag-yellow">'+o.hours.toFixed(1)+'h</span><span class="tag tag-green">'+fmt$(o.labor)+'</span><span class="tag tag-pink">Exp: '+fmt$(o.exp)+'</span><span class="tag tag-blue">Total: '+fmt$(o.labor+o.exp)+'</span></div>'
      +'</div><div class="table-wrap"><table style="font-size:12px"><thead><tr><th>Property</th><th>Hours</th><th>Labor</th><th>Expenses</th><th>Total</th></tr></thead><tbody>';
    Object.entries(o.props).forEach(function(kv){ var v=kv[1]; html+='<tr><td>'+esc(kv[0])+'</td><td>'+v.hours.toFixed(2)+'</td><td>'+fmt$(v.labor)+'</td><td>'+fmt$(v.exp)+'</td><td><strong>'+fmt$(v.labor+v.exp)+'</strong></td></tr>'; });
    html+='</tbody></table></div></div>';
  });
  html+='</div>';
  html+='<div class="report-section"><div class="report-header">&#x1F3E2; By Property</div><div class="table-wrap"><table><thead><tr><th>Property</th><th>Address</th><th>Hours</th><th>Labor</th><th>Exp</th><th>Total</th></tr></thead><tbody>';
  Object.values(byP).sort(function(a,b){ return b.hours-a.hours; }).forEach(function(p,i){ html+='<tr><td><span class="color-dot" style="background:'+COLORS[i%COLORS.length]+'"></span>'+esc(p.name)+'</td><td style="font-size:11px;color:var(--muted)">'+esc(p.addr)+'</td><td>'+p.hours.toFixed(2)+'</td><td>'+fmt$(p.labor)+'</td><td>'+fmt$(p.exp)+'</td><td><strong>'+fmt$(p.labor+p.exp)+'</strong></td></tr>'; });
  html+='</tbody></table></div></div>';
  html+='<div class="report-section"><div class="report-header">&#x1F477; By Technician</div><div class="table-wrap"><table><thead><tr><th>Tech</th><th>Jobs</th><th>Hours</th><th>Labor</th></tr></thead><tbody>';
  Object.values(byT).sort(function(a,b){ return b.hours-a.hours; }).forEach(function(t){ html+='<tr><td><strong>'+esc(t.name)+'</strong></td><td>'+t.jobs+'</td><td>'+t.hours.toFixed(2)+'</td><td>'+fmt$(t.labor)+'</td></tr>'; });
  html+='</tbody></table></div></div>';
  html+='<div class="report-section"><div class="report-header">&#x1F4CB; Job Detail</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Tech</th><th>Property</th><th>Status</th><th>Hours</th><th>Labor</th><th>Exp</th><th>Total</th><th></th></tr></thead><tbody>';
  jobs.sort(function(a,b){ return b.date.localeCompare(a.date); }).forEach(function(j){
    var tech=getTech(j.techId),prop=getProp(j.propId),h=jobTotalHours(j),l=jobTotalLabor(j),e=jobTotalExp(j);
    html+='<tr><td style="font-family:var(--fm);font-size:11px">'+j.date+'</td><td>'+(tech?esc(tech.name):'')+'</td><td>'+(prop?esc(prop.name):'')+'</td>'
      +'<td><span class="tag '+({'open':'tag-open','in_progress':'tag-yellow','waiting_parts':'tag-blue','pending_approval':'tag-pink','complete':'tag-complete'}[j.status]||'tag-open')+'">'+({'open':'Open','in_progress':'In Progress','waiting_parts':'Waiting Parts','pending_approval':'Pending Approval','complete':'Complete'}[j.status]||j.status)+'</span></td>'
      +'<td>'+h.toFixed(2)+'</td><td>'+fmt$(l)+'</td><td>'+fmt$(e)+'</td><td><strong>'+fmt$(l+e)+'</strong></td>'
      +'<td><button class="btn btn-secondary btn-xs" onclick="exportJobPDF('+j.id+')">[pdf]</button></td></tr>';
  });
  html+='</tbody></table></div></div>';
  // Store for PDF export
  window._lastReportHTML=html;
  window._lastReportPeriod=pl;
  out.innerHTML=html;
}

function exportReportPDF(){
  var period=window._lastReportPeriod||today();
  var reportEl=document.getElementById('report-output');
  if(!reportEl||!reportEl.innerHTML) return;
  var win=window.open('','_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>FieldTrack Report  '+period+'</title>'
    +'<style>body{font-family:Arial,sans-serif;font-size:12px;color:#1a1d26;padding:24px;max-width:900px}'
    +'.stat-card{display:inline-block;padding:12px 18px;border:1px solid #e5e7eb;border-radius:8px;margin:4px}'
    +'.stat-label{font-size:10px;text-transform:uppercase;color:#9ca3af}'
    +'.stat-value{font-size:22px;font-weight:700}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}'
    +'th{background:#f3f4f6;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb}'
    +'td{padding:7px 10px;border-bottom:1px solid #f3f4f6}'
    +'.report-header{font-size:14px;font-weight:700;margin:16px 0 8px;padding-bottom:6px;border-bottom:2px solid #e5e7eb}'
    +'.tag{padding:2px 8px;border-radius:99px;font-size:10px}'
    +'.tag-open{background:#dbeafe;color:#1e40af}.tag-complete{background:#dcfce7;color:#166534}.tag-yellow{background:#fef9c3;color:#854d0e}.tag-blue{background:#dbeafe;color:#1e40af}.tag-pink{background:#fce7f3;color:#9d174d}'
    +'mark{background:#fef9c3}h1{font-size:20px;color:#c47f00}@media print{button{display:none}}'
    +'</style></head><body>'
    +'<h1>FieldTrack Report</h1><p style="color:#6b7280;margin-bottom:20px">Period: <strong>'+period+'</strong> &nbsp;&nbsp; Generated: '+new Date().toLocaleString()+'</p>'
    +reportEl.innerHTML
    +'</body></html>');
  win.document.close();
  setTimeout(function(){ win.print(); },600);
}

//  SETTINGS PAGE 
function renderSettingsPage(){
  var key=getApiKey();
  var el=document.getElementById('settings-api-status');
  var inp=document.getElementById('settings-api-key');
  if(inp) inp.value=key;
  if(el){
    if(key){ el.textContent='[OK] API Key configured ('+key.length+' chars)'; el.style.color='var(--success)'; }
    else { el.textContent='[!] No API key  AI features disabled'; el.style.color='var(--accent3)'; }
  }
}
function saveApiKey(){
  var k=(document.getElementById('settings-api-key')||{}).value||'';
  setApiKey(k);
  renderSettingsPage();
  alert(k?'[OK] API key saved! AI features are now enabled.':'API key cleared. AI features disabled.');
}

//  TECHNICIANS 
function openAddTech(){ document.getElementById('tech-edit-id').value=''; document.getElementById('modal-tech-title').textContent='Add Technician'; ['tech-name','tech-email','tech-phone','tech-rate','tech-username','tech-pin'].forEach(function(id){ document.getElementById(id).value=''; }); document.getElementById('tech-status').value='active'; document.getElementById('tech-login-preview').textContent='username / PIN'; openModal('modal-tech'); }
var _tu=document.getElementById('tech-username'); if(_tu) _tu.addEventListener('input',function(){ document.getElementById('tech-login-preview').textContent=(this.value||'u')+' / '+(document.getElementById('tech-pin').value||'PIN'); });
var _tp=document.getElementById('tech-pin'); if(_tp) _tp.addEventListener('input',function(){ document.getElementById('tech-login-preview').textContent=(document.getElementById('tech-username').value||'u')+' / '+(this.value||'PIN'); });
function editTech(id){ var t=getTech(id); var u=state.users.find(function(u){ return u.techId===id; }); document.getElementById('tech-edit-id').value=id; document.getElementById('modal-tech-title').textContent='Edit Technician'; document.getElementById('tech-name').value=t.name; document.getElementById('tech-rate').value=t.rate; document.getElementById('tech-email').value=t.email||''; document.getElementById('tech-phone').value=t.phone||''; document.getElementById('tech-status').value=t.status; document.getElementById('tech-username').value=u?u.username:''; document.getElementById('tech-pin').value=u?u.password:''; document.getElementById('tech-login-preview').textContent=(u?u.username:'?')+' / '+(u?u.password:'?'); openModal('modal-tech'); }
function saveTech(){ var name=document.getElementById('tech-name').value.trim(); var rate=document.getElementById('tech-rate').value; var username=document.getElementById('tech-username').value.trim().toLowerCase(); var pin=document.getElementById('tech-pin').value.trim(); if(!name||!rate){ alert('Name and rate required.'); return; } if(!username||!pin){ alert('Username and PIN required.'); return; } var id=document.getElementById('tech-edit-id').value; var dup=state.users.find(function(u){ return u.username===username&&(!id||u.techId!==+id); }); if(dup){ alert('Username taken.'); return; } var obj={name:name,rate:parseFloat(rate),email:document.getElementById('tech-email').value,phone:document.getElementById('tech-phone').value,status:document.getElementById('tech-status').value}; if(id){ Object.assign(state.technicians.find(function(t){ return t.id===+id; }),obj); var u=state.users.find(function(u){ return u.techId===+id; }); if(u){ u.username=username; u.password=pin; u.name=name; u.status=obj.status; } else state.users.push({id:uid(),name:name,username:username,password:pin,role:'tech',techId:+id,status:obj.status}); } else { obj.id=uid(); state.technicians.push(obj); state.users.push({id:uid(),name:name,username:username,password:pin,role:'tech',techId:obj.id,status:obj.status}); } save(); closeModal('modal-tech'); renderTechs(); renderUsers(); }
function deleteTech(id){ if(!confirm('Delete this technician?')) return; state.technicians=state.technicians.filter(function(t){ return t.id!==+id; }); state.users=state.users.filter(function(u){ return u.techId!==+id; }); save(); renderTechs(); }
function renderTechs(){ var tb=document.getElementById('tech-tbody'); if(!state.technicians.length){ tb.innerHTML='<tr><td colspan="5"><div class="empty-state"><span class="emoji">&#x1F477;</span>No technicians.</div></td></tr>'; return; } tb.innerHTML=state.technicians.map(function(t){ var u=state.users.find(function(u){ return u.techId===t.id; }); return '<tr><td><strong>'+esc(t.name)+'</strong><br><small style="color:var(--muted)">'+esc(t.email||'')+'</small></td><td><span style="font-family:var(--fm);color:var(--accent2)">'+esc(u?u.username:'')+'</span></td><td><span class="tag tag-yellow">'+fmt$(t.rate)+'/h</span></td><td><span class="tag '+(t.status==='active'?'tag-green':'tag-pink')+'">'+t.status+'</span></td><td><button class="btn btn-secondary btn-sm" onclick="editTech('+t.id+')">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteTech('+t.id+')">Del</button></td></tr>'; }).join(''); }

//  OWNERS 
function openAddOwner(){ document.getElementById('owner-edit-id').value=''; document.getElementById('modal-owner-title').textContent='Add Owner'; ['owner-name','owner-company','owner-email','owner-phone'].forEach(function(id){ document.getElementById(id).value=''; }); openModal('modal-owner'); }
function editOwner(id){ var o=getOwner(id); document.getElementById('owner-edit-id').value=id; document.getElementById('modal-owner-title').textContent='Edit Owner'; document.getElementById('owner-name').value=o.name; document.getElementById('owner-company').value=o.company||''; document.getElementById('owner-email').value=o.email||''; document.getElementById('owner-phone').value=o.phone||''; openModal('modal-owner'); }
function saveOwner(){ var name=document.getElementById('owner-name').value.trim(); if(!name){ alert('Name required.'); return; } var id=document.getElementById('owner-edit-id').value; var obj={name:name,company:document.getElementById('owner-company').value,email:document.getElementById('owner-email').value,phone:document.getElementById('owner-phone').value}; if(id) Object.assign(state.owners.find(function(o){ return o.id===+id; }),obj); else{ obj.id=uid(); state.owners.push(obj); } save(); closeModal('modal-owner'); renderOwners(); }
function deleteOwner(id){ if(state.properties.some(function(p){ return p.ownerId===+id; })){ alert('Remove properties first.'); return; } if(!confirm('Delete?')) return; state.owners=state.owners.filter(function(o){ return o.id!==+id; }); save(); renderOwners(); }
function renderOwners(){ var tb=document.getElementById('owner-tbody'); if(!state.owners.length){ tb.innerHTML='<tr><td colspan="6"><div class="empty-state"><span class="emoji">&#x1F464;</span>No owners.</div></td></tr>'; return; } tb.innerHTML=state.owners.map(function(o){ var props=state.properties.filter(function(p){ return p.ownerId===o.id; }); return '<tr><td><strong>'+esc(o.name)+'</strong></td><td>'+esc(o.company||'')+'</td><td>'+esc(o.email||'')+'</td><td>'+esc(o.phone||'')+'</td><td>'+props.length+'</td><td><button class="btn btn-secondary btn-sm" onclick="editOwner('+o.id+')">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteOwner('+o.id+')">Del</button></td></tr>'; }).join(''); }

//  PROPERTIES 
function openAddProp(){ document.getElementById('prop-edit-id').value=''; document.getElementById('modal-prop-title').textContent='Add Property'; ['prop-name','prop-rate','prop-address','prop-unit','prop-city'].forEach(function(id){ document.getElementById(id).value=''; }); document.getElementById('prop-rate-type').value='flat'; populateSelect(document.getElementById('prop-owner'), state.owners, 'id', function(o){ return o.name; }, 'Select...'); openModal('modal-prop'); }
function editProp(id){ var p=getProp(id); populateSelect(document.getElementById('prop-owner'), state.owners, 'id', function(o){ return o.name; }, 'Select...'); document.getElementById('prop-edit-id').value=id; document.getElementById('modal-prop-title').textContent='Edit Property'; document.getElementById('prop-name').value=p.name; document.getElementById('prop-owner').value=p.ownerId||''; document.getElementById('prop-rate').value=p.defaultRate||''; document.getElementById('prop-rate-type').value=p.rateType||'flat'; document.getElementById('prop-address').value=p.address||''; document.getElementById('prop-unit').value=p.unit||''; document.getElementById('prop-city').value=p.city||''; openModal('modal-prop'); }
function saveProp(){ var name=document.getElementById('prop-name').value.trim(); if(!name){ alert('Name required.'); return; } var id=document.getElementById('prop-edit-id').value; var obj={name:name,ownerId:+document.getElementById('prop-owner').value||null,defaultRate:parseFloat(document.getElementById('prop-rate').value)||null,rateType:document.getElementById('prop-rate-type').value,address:document.getElementById('prop-address').value.trim(),unit:document.getElementById('prop-unit').value.trim(),city:document.getElementById('prop-city').value.trim()}; if(id) Object.assign(state.properties.find(function(p){ return p.id===+id; }),obj); else{ obj.id=uid(); state.properties.push(obj); } save(); closeModal('modal-prop'); renderProps(); }
function deleteProp(id){ if(!confirm('Delete?')) return; state.properties=state.properties.filter(function(p){ return p.id!==+id; }); save(); renderProps(); }
function renderProps(){ var filter=(document.getElementById('prop-search-filter')||{}).value||''; var tb=document.getElementById('prop-tbody'); var list=state.properties.filter(function(p){ return addrMatch(p,filter); }); if(!list.length){ tb.innerHTML='<tr><td colspan="6"><div class="empty-state"><span class="emoji">&#x1F3E2;</span>No properties.</div></td></tr>'; return; } tb.innerHTML=list.map(function(p){ var owner=getOwner(p.ownerId); return '<tr><td><strong>'+esc(p.name)+'</strong></td><td>'+esc(p.address||'')+'</td><td>'+(p.unit?'<span class="tag tag-blue">'+esc(p.unit)+'</span>':'')+'</td><td>'+(owner?esc(owner.name):'')+'</td><td>'+(p.defaultRate?fmt$(p.defaultRate)+'/h':'')+'</td><td><button class="btn btn-secondary btn-sm" onclick="editProp('+p.id+')">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteProp('+p.id+')">Del</button></td></tr>'; }).join(''); }

//  USERS 
function renderUsers(){ var tb=document.getElementById('users-tbody'); if(!state.users.length){ tb.innerHTML='<tr><td colspan="5">No users.</td></tr>'; return; } tb.innerHTML=state.users.map(function(u){ return '<tr><td><strong>'+esc(u.name)+'</strong></td><td><span style="font-family:var(--fm);color:var(--accent2)">'+esc(u.username)+'</span></td><td><span class="tag '+(u.role==='admin'?'tag-yellow':'tag-blue')+'">'+u.role+'</span></td><td><span class="tag '+(u.status==='active'?'tag-green':'tag-pink')+'">'+u.status+'</span></td><td><button class="btn btn-secondary btn-sm" onclick="openChangePW('+u.id+')">Change PW</button> <button class="btn btn-secondary btn-sm" onclick="toggleUserStatus('+u.id+')">Toggle</button></td></tr>'; }).join(''); }
function openChangePW(userId){ var u=getUser(userId); document.getElementById('pw-user-id').value=userId; document.getElementById('modal-pw-title').textContent='Change PW  '+u.name; document.getElementById('pw-new').value=''; openModal('modal-pw'); }
function savePassword(){ var id=+document.getElementById('pw-user-id').value; var pw=document.getElementById('pw-new').value.trim(); if(!pw){ alert('Enter password.'); return; } getUser(id).password=pw; save(); closeModal('modal-pw'); renderUsers(); }
function toggleUserStatus(id){ var u=getUser(id); u.status=u.status==='active'?'inactive':'active'; save(); renderUsers(); }

//  SMART DELETE 
function requireAdminPw(inputId,cb){ var val=(document.getElementById(inputId)||{}).value||''; var admin=state.users.find(function(u){ return u.role==='admin'; }); if(!admin||val!==admin.password){ alert(' Incorrect admin password.'); return; } cb(); }
function deleteByDateRange(){ requireAdminPw('del-range-pw',function(){ var from=(document.getElementById('del-from')||{}).value; var to=(document.getElementById('del-to')||{}).value; if(!from||!to){ alert('Select both dates.'); return; } var toDelete=state.jobs.filter(function(j){ return j.date>=from&&j.date<=to; }); if(!toDelete.length){ alert('No jobs found.'); return; } if(!confirm('Delete '+toDelete.length+' job(s) from '+from+' to '+to+'?')) return; var pids=[]; toDelete.forEach(function(j){ (j.photos||[]).forEach(function(p){ pids.push(p.id); }); }); var ids=toDelete.map(function(j){ return j.id; }); state.jobs=state.jobs.filter(function(j){ return ids.indexOf(j.id)<0; }); FT_DB.delMany(pids,function(){ save(); alert('[OK] Deleted '+toDelete.length+' jobs.'); document.getElementById('del-range-pw').value=''; }); }); }
function deleteByTech(){ requireAdminPw('del-tech-pw',function(){ var techId=+((document.getElementById('del-tech-sel')||{}).value||0); if(!techId){ alert('Select a technician.'); return; } var tech=getTech(techId); var toDelete=state.jobs.filter(function(j){ return +j.techId===techId; }); if(!toDelete.length){ alert('No jobs found.'); return; } if(!confirm('Delete '+toDelete.length+' job(s) for '+tech.name+'?')) return; var pids=[]; toDelete.forEach(function(j){ (j.photos||[]).forEach(function(p){ pids.push(p.id); }); }); var ids=toDelete.map(function(j){ return j.id; }); state.jobs=state.jobs.filter(function(j){ return ids.indexOf(j.id)<0; }); FT_DB.delMany(pids,function(){ save(); alert('[OK] Deleted '+toDelete.length+' jobs.'); document.getElementById('del-tech-pw').value=''; }); }); }
function deleteByProperty(){ requireAdminPw('del-prop-pw',function(){ var propId=+((document.getElementById('del-prop-sel')||{}).value||0); if(!propId){ alert('Select a property.'); return; } var prop=getProp(propId); var toDelete=state.jobs.filter(function(j){ return +j.propId===propId; }); if(!toDelete.length){ alert('No jobs found.'); return; } if(!confirm('Delete '+toDelete.length+' job(s) for '+prop.name+'?')) return; var pids=[]; toDelete.forEach(function(j){ (j.photos||[]).forEach(function(p){ pids.push(p.id); }); }); var ids=toDelete.map(function(j){ return j.id; }); state.jobs=state.jobs.filter(function(j){ return ids.indexOf(j.id)<0; }); FT_DB.delMany(pids,function(){ save(); alert('[OK] Deleted '+toDelete.length+' jobs.'); document.getElementById('del-prop-pw').value=''; }); }); }
function deleteByOwner(){ requireAdminPw('del-owner-pw',function(){ var ownerId=+((document.getElementById('del-owner-sel')||{}).value||0); if(!ownerId){ alert('Select an owner.'); return; } var owner=getOwner(ownerId); var propIds=state.properties.filter(function(p){ return p.ownerId===ownerId; }).map(function(p){ return p.id; }); var toDelete=state.jobs.filter(function(j){ return propIds.indexOf(+j.propId)>=0; }); if(!toDelete.length){ alert('No jobs found.'); return; } if(!confirm('Delete '+toDelete.length+' job(s) for '+owner.name+'?')) return; var pids=[]; toDelete.forEach(function(j){ (j.photos||[]).forEach(function(p){ pids.push(p.id); }); }); var ids=toDelete.map(function(j){ return j.id; }); state.jobs=state.jobs.filter(function(j){ return ids.indexOf(j.id)<0; }); FT_DB.delMany(pids,function(){ save(); alert('[OK] Deleted '+toDelete.length+' jobs.'); document.getElementById('del-owner-pw').value=''; }); }); }
function populateDeleteSelects(){ var ts=document.getElementById('del-tech-sel'); var ps=document.getElementById('del-prop-sel'); var os=document.getElementById('del-owner-sel'); if(ts) populateSelect(ts,state.technicians,'id',function(t){ return t.name; },'Select technician...'); if(ps) populateSelect(ps,state.properties,'id',function(p){ return p.name+' ('+p.address+')'; },'Select property...'); if(os) populateSelect(os,state.owners,'id',function(o){ return o.name; },'Select owner...'); }

//  DATA 
function exportJSON(){ var blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fieldtrack-backup-'+today()+'.json'; a.click(); }
function triggerImport(){ document.getElementById('import-file').click(); }
function importData(event){ var file=event.target.files[0]; if(!file) return; requireAdminPw('import-pw',function(){ var reader=new FileReader(); reader.onload=function(e){ try{ var imp=JSON.parse(e.target.result); if(!imp.owners||!imp.users){ alert('Invalid file.'); return; } if(!confirm('Replace all data?\nJobs: '+(imp.jobs||[]).length+', Props: '+imp.properties.length)) return; state=imp; if(!state.jobs) state.jobs=[]; state._initialized=true; save(); showPage('dashboard'); alert('[OK] Imported!'); } catch(err){ alert('Error: '+err.message); } }; reader.readAsText(file); event.target.value=''; }); }
function clearAllData(){ requireAdminPw('clear-pw',function(){ if(!confirm('[!] Delete ALL data permanently? Cannot be undone.')) return; if(!confirm('Are you 100% sure? Everything goes.')) return; state={owners:[],technicians:[],properties:[],jobs:[],users:[],_nextId:1,_initialized:true}; initAdminUser(); save(); FT_DB.clearAll(function(){ alert('[OK] Cleared. Admin re-created: admin / admin1234'); showPage('dashboard'); }); }); }
function exportExcel(){ if(typeof XLSX==='undefined'){ alert('Excel library not loaded.'); return; } var wb=XLSX.utils.book_new(); var jRows=state.jobs.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).map(function(j){ var tech=getTech(j.techId),prop=getProp(j.propId),owner=prop?getOwner(prop.ownerId):null; return {Date:j.date,Tech:tech?tech.name:'',Property:prop?prop.name:'',Address:prop?prop.address:'',Unit:prop?prop.unit:'',Owner:owner?owner.name:'',Status:j.status,Assigned:j.assignedByAdmin?'Yes':'No',Hours:jobTotalHours(j),'Labor($)':+jobTotalLabor(j).toFixed(2),'Exp($)':+jobTotalExp(j).toFixed(2),'Total($)':+(jobTotalLabor(j)+jobTotalExp(j)).toFixed(2),Photos:(j.photos||[]).length,Notes:j.notes||''}; }); var ws1=XLSX.utils.json_to_sheet(jRows.length?jRows:[{Note:'No jobs'}]); ws1['!cols']=[10,14,14,20,10,14,10,8,7,9,9,9,6,30].map(function(w){ return {wch:w}; }); XLSX.utils.book_append_sheet(wb,ws1,'Jobs'); var hRows=[]; state.jobs.forEach(function(j){ var t=getTech(j.techId),p=getProp(j.propId); (j.hours||[]).forEach(function(h){ hRows.push({JobDate:j.date,Tech:t?t.name:'',Prop:p?p.name:'',Addr:p?p.address:'',Unit:p?p.unit:'',Date:h.date,Hours:h.hours,Desc:h.desc||''}); }); }); var ws2=XLSX.utils.json_to_sheet(hRows.length?hRows:[{Note:'No hours'}]); ws2['!cols']=[10,14,14,20,10,10,7,40].map(function(w){ return {wch:w}; }); XLSX.utils.book_append_sheet(wb,ws2,'Hours'); var eRows=[]; state.jobs.forEach(function(j){ var t=getTech(j.techId),p=getProp(j.propId),o=p?getOwner(p.ownerId):null; (j.expenses||[]).forEach(function(e){ eRows.push({JobDate:j.date,Tech:t?t.name:'',Store:e.store,Prop:p?p.name:'',Addr:p?p.address:'',Unit:p?p.unit:'',Owner:o?o.name:'',' Cost':e.cost,Link:e.linkType,Desc:e.desc||''}); }); }); var ws3=XLSX.utils.json_to_sheet(eRows.length?eRows:[{Note:'No expenses'}]); ws3['!cols']=[10,14,16,14,20,10,14,8,8,40].map(function(w){ return {wch:w}; }); XLSX.utils.book_append_sheet(wb,ws3,'Expenses'); XLSX.writeFile(wb,'fieldtrack-'+today()+'.xlsx'); }


//  SHARE LINK GENERATION 
function openShareModal(jobId){
  var job=getJob(jobId); var prop=getProp(job.propId);
  document.getElementById('sm-job-id').value=jobId;
  document.getElementById('sm-show-price').checked=job.shareShowPrice||false;
  document.getElementById('sm-stripe').value=job.stripeLink||'';
  document.getElementById('sm-client-name').value=job.clientName||'';
  document.getElementById('sm-client-phone').value=job.clientPhone||'';
  document.getElementById('sm-job-info').textContent=(prop?prop.name+'  '+propFullAddr(prop):'?')+' | '+job.date;
  var ld=document.getElementById('sm-existing-link');
  if(job.shareToken){ ld.style.display='block'; document.getElementById('sm-link-url').textContent='view.php?token='+job.shareToken; }
  else { ld.style.display='none'; }
  openModal('modal-share');
}
function generateShareLink(){
  var jobId=+document.getElementById('sm-job-id').value;
  var job=getJob(jobId); var prop=getProp(job.propId);
  var showPrice=document.getElementById('sm-show-price').checked;
  var stripeLink=document.getElementById('sm-stripe').value.trim();
  var clientName=document.getElementById('sm-client-name').value.trim();
  var clientPhone=document.getElementById('sm-client-phone').value.trim();
  job.shareShowPrice=showPrice; job.stripeLink=stripeLink; job.clientName=clientName; job.clientPhone=clientPhone;
  var photoMeta=job.photos||[]; var photoDataArr=[]; var pending=photoMeta.length;
  function doCreate(){
    var jd={propName:prop?prop.name:'',propAddr:prop?prop.address:'',propUnit:prop?prop.unit:'',
      date:job.date,completedDate:job.completedDate||'',status:job.status,notes:job.notes||'',
      hours:job.hours||[],expenses:job.expenses||[],photos:photoDataArr,
      totalHours:jobTotalHours(job),totalLabor:jobTotalLabor(job),totalExp:jobTotalExp(job)};
    var btn=document.getElementById('sm-gen-btn'); btn.disabled=true; btn.textContent='Generating...';
    fetch('shares.php',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'create',jobId:jobId,job:jd,showPrice:showPrice,stripeLink:stripeLink,clientName:clientName,clientPhone:clientPhone,days:90})})
    .then(function(r){ return r.json(); })
    .then(function(data){
      btn.disabled=false; btn.textContent='Generate Link';
      if(data.ok){
        job.shareToken=data.token; save();
        document.getElementById('sm-existing-link').style.display='block';
        document.getElementById('sm-link-url').textContent='view.php?token='+data.token;
        if(clientPhone) sendSMS(clientPhone,'WillowPA Maintenance: Your job report is ready! https://tech.willowpa.com/view.php?token='+data.token+' (expires 90 days)');
        refreshJobCard(jobId);
      } else { alert('Error: '+(data.error||'Unknown')); }
    })
    .catch(function(e){ btn.disabled=false; btn.textContent='Generate Link'; alert('Error: '+e.message); });
  }
  if(!pending){ doCreate(); return; }
  photoMeta.forEach(function(ph){
    FT_DB.getThumb(ph.id,function(err,thumb){
      FT_DB.getFull(ph.id,function(err2,full){
        photoDataArr.push({label:ph.label,date:ph.date,thumbData:thumb||'',fullData:full||''});
        pending--; if(pending<=0) doCreate();
      });
    });
  });
}
function copyShareLink(url){
  var full=url.indexOf('http')===0?url:('https://tech.willowpa.com/'+url.replace(/^\/+/,''));
  if(navigator.clipboard){ navigator.clipboard.writeText(full).then(function(){ alert('Copied: '+full); }).catch(function(){ prompt('Copy this link:',full); }); }
  else { prompt('Copy this link:',full); }
}
function toggleJobPaid(jobId){
  var job=getJob(jobId); job.isPaid=!job.isPaid; save(); refreshJobCard(jobId);
}
function sendSMS(to,msg){
  fetch('sms.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:to,msg:msg})})
  .then(function(r){ return r.json(); }).then(function(d){ if(!d.ok) console.warn('SMS:',d); }).catch(function(e){ console.warn('SMS error:',e); });
}

//  REQUESTS PAGE 
var _requests=[];
function renderRequestsPage(){
  var el=document.getElementById('req-list'); if(!el) return;
  el.innerHTML='<div class="empty-state"><span class="emoji">...</span>Loading...</div>';
  fetch('requests.php').then(function(r){ return r.json(); })
  .then(function(data){
    _requests=Array.isArray(data)?data:[];
    renderReqList();
    var n=_requests.filter(function(r){ return r.status==='new'; }).length;
    var b=document.getElementById('req-badge'); if(b){ b.textContent=n; b.style.display=n>0?'inline':'none'; }
  })
  .catch(function(e){ el.innerHTML='<div class="alert alert-warn">Could not load requests.php: '+e.message+'</div>'; });
}
function renderReqList(showAll){
  var el=document.getElementById('req-list'); if(!el) return;
  var newReqs=_requests.filter(function(r){ return (r.status||'new')==='new'; });
  var linkedReqs=_requests.filter(function(r){ return r.status==='linked'||r.status==='done'; });
  var visible=showAll?_requests:newReqs;
  var toggleHtml='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
    +'<div style="font-size:13px;color:var(--muted)">'+newReqs.length+' new'+(linkedReqs.length?' &nbsp;|&nbsp; <span style="color:var(--accent2)">'+linkedReqs.length+' assigned</span>':'')+'</div>'
    +(linkedReqs.length?'<button class="btn btn-secondary btn-xs" onclick="renderReqList('+(showAll?'false':'true')+')">'+(showAll?'Hide Assigned':'Show All')+'</button>':'')
    +'</div>';
  if(!visible.length){ el.innerHTML=toggleHtml+'<div class="empty-state"><span class="emoji">&#x1F4ED;</span>No active requests.</div>'; return; }
  var sorted=visible.slice().sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });
  el.innerHTML=toggleHtml+sorted.map(function(req){
    var sc=req.status==='new'?'tag-pink':req.status==='linked'?'tag-blue':'tag-green';
    return '<div class="card" style="margin-bottom:12px">'
      +'<div class="flex flex-wrap" style="justify-content:space-between;margin-bottom:10px">'
      +'<div><div style="font-size:15px;font-weight:600">'+esc(req.name||'?')+'</div>'
      +'<div style="font-size:12px;color:var(--muted);font-family:var(--fm)">'+esc(req.phone||'')+'&nbsp;&nbsp;'+esc((req.createdAt||'').slice(0,10))+'</div></div>'
      +'<span class="tag '+sc+'">'+esc(req.status||'new')+'</span></div>'
      +(req.address?'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">&#x1F4CD; '+esc(req.address)+'</div>':'')
      +(req.block?'<div style="background:rgba(196,127,0,.1);border:1px solid rgba(196,127,0,.25);border-radius:6px;padding:7px 10px;font-size:12px;color:var(--accent);margin-bottom:8px">&#x1F4C5; '+esc(req.block)+'</div>':'')
      +(req.noAppointmentNeeded?'<div style="background:rgba(26,122,74,.08);border:1px solid rgba(26,122,74,.2);border-radius:6px;padding:5px 10px;font-size:11px;color:#166534;margin-bottom:8px">&#x1F511; No appointment needed</div>':'')
      +'<div style="font-size:13px;color:var(--muted);margin-bottom:10px;line-height:1.5">'+esc(req.description||'')+'</div>'
      +(req.photo?'<img src="'+req.photo+'" style="max-width:140px;border-radius:8px;margin-bottom:10px;display:block" alt="Photo">':'')
      +'<div class="req-btns flex flex-wrap" style="gap:8px" data-id="'+esc(req.id)+'">'
      +(req.status==='new'?'<button class="btn btn-primary btn-sm req-action" data-action="link">&#x1F517; Link to Job</button>':'')
      +(req.status==='linked'?'<button class="btn btn-success btn-sm req-action" data-action="notify">&#x2705; Notify</button>':'')
      +'<button class="btn btn-secondary btn-sm req-action" data-action="msg">&#x1F4AC; Message</button>'
      +'<button class="btn btn-danger btn-xs req-action" data-action="del" style="padding:4px 8px">&#x2715;</button>'
      +'</div>'
      +((req.messages||[]).length?'<div style="margin-top:10px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:12px;border:1px solid var(--border)">'+req.messages.map(function(m){ return '<div style="margin-bottom:4px"><strong style="color:var(--accent)">'+esc(m.from)+':</strong> '+esc(m.text)+'</div>'; }).join('')+'</div>':'')
      +'</div>';
  }).join('');
  el.querySelectorAll('.req-btns').forEach(function(div){
    var rid=div.getAttribute('data-id');
    div.querySelectorAll('.req-action').forEach(function(btn){
      btn.onclick=function(){
        var a=this.getAttribute('data-action');
        if(a==='link') openLinkRequest(rid);
        else if(a==='notify') notifyClientAssigned(rid);
        else if(a==='msg') openMsgClient(rid);
        else if(a==='del') deleteRequest(rid);
      };
    });
  });
}
function openLinkRequest(reqId){
  var req=_requests.find(function(r){ return r.id===reqId; });
  if(!req){ alert('Request not found. Please refresh and try again.'); return; }
  document.getElementById('lr-req-idx').value=reqId;
  document.getElementById('lr-block-display').textContent=req.block?'Requested: '+req.block:'No specific time requested';
  document.getElementById('lr-prop-search').value=''; document.getElementById('lr-prop-id').value='';
  var s=document.getElementById('lr-prop-selected'); if(s) s.style.display='none';
  populateSelect(document.getElementById('lr-tech'),state.technicians.filter(function(t){ return t.status==='active'; }),'id',function(t){ return t.name; },'Select technician...');
  document.getElementById('lr-notes').value=req.description||'';
  var lb=document.getElementById('lr-block'); if(lb) lb.value=req.block||'';
  openModal('modal-link-request');
}
function lrPropSearch(){ buildPropAC('lr-prop-search','lr-ac-list','lr-prop-id','lr-prop-selected'); }
function saveLinkRequest(){
  var idx=+document.getElementById('lr-req-idx').value; var req=_requests[idx];
  var propId=+document.getElementById('lr-prop-id').value;
  var techId=+document.getElementById('lr-tech').value;
  if(!propId||!techId){ alert('Select both property and technician.'); return; }
  var tech=getTech(techId); var prop=getProp(propId);
  var job={id:uid(),propId:propId,techId:techId,date:today(),
    notes:document.getElementById('lr-notes').value,
    status:'open',assignedByAdmin:true,block:req.block||'',
    clientName:req.name,clientPhone:req.phone,hours:[],expenses:[],photos:[]};
  state.jobs.push(job); save();
  req.status='linked'; req.linkedJobId=job.id;
  fetch('requests.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)}).catch(function(){});
  if(tech&&tech.phone) sendSMS(tech.phone,'WillowPA: New job at '+(prop?prop.name:'')+(req.block?' | '+req.block:'')+'. Login: tech.willowpa.com');
  if(req.phone) sendSMS(req.phone,'WillowPA Maintenance: Confirmed!'+(req.block?' Tech arrives: '+req.block:' We will call to confirm time.')+' Questions? Reply to this number.');
  closeModal('modal-link-request'); renderRequestsPage();
  alert('[OK] Job created and assigned to '+tech.name+'!');
}
function openMsgClient(reqId){
  var req=_requests.find(function(r){ return r.id===reqId; });
  if(!req){ alert('Request not found. Please refresh.'); return; }
  document.getElementById('mc-req-idx').value=reqId;
  document.getElementById('mc-msg').value='';
  openModal('modal-msg-client');
}
function sendMsgClient(){
  var reqId=document.getElementById('mc-req-idx').value;
  var req=_requests.find(function(r){ return r.id===reqId; });
  if(!req) return;
  var msg=document.getElementById('mc-msg').value.trim(); if(!msg){ alert('Enter a message.'); return; }
  if(!req.messages) req.messages=[];
  req.messages.push({from:'Admin',text:msg,at:new Date().toISOString()});
  if(req.phone) sendSMS(req.phone,'WillowPA Maintenance: '+msg);
  fetch('requests.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:req.id,messages:req.messages})})
  .then(function(r){ return r.json(); })
  .then(function(){ closeModal('modal-msg-client'); renderRequestsPage(); })
  .catch(function(){ closeModal('modal-msg-client'); renderRequestsPage(); });
}
function renderAvailabilityPage(){
  fetch('availability.php').then(function(r){ return r.json(); })
  .then(function(d){ renderAvailUI(d); })
  .catch(function(){ var c=document.getElementById('av-content'); if(c) c.innerHTML='<div class="alert alert-warn">Could not load availability.php</div>'; });
}
function renderAvailUI(d){
  var el=document.getElementById('av-content'); if(!el) return;
  var bd=d.blockedDates||[], bb=d.blockedBlocks||[];
  var html='<div class="card"><div class="card-title"> Booking Mode</div>'
    +'<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;text-transform:none;letter-spacing:0;font-weight:normal;margin-bottom:8px">'
    +'<input type="checkbox" id="av-anytime" '+(d.anyTimeMode?'checked':'')+' onchange="setAnyTime(this.checked)" style="width:18px;height:18px;flex-shrink:0">'
    +'<span><strong>Flexible timing</strong>  Booking page shows no time blocks, we contact client</span></label>'
    +'<p style="font-size:12px;color:var(--muted)">Uncheck to let clients pick a time block when booking.</p></div>';
  html+='<div class="card"><div class="card-title">[block] Block Dates &amp; Slots</div>'
    +'<div class="grid-2" style="gap:10px;margin-bottom:10px">'
    +'<div class="form-group" style="margin-bottom:0"><label>Date</label><input type="date" id="av-block-date"></div>'
    +'<div class="form-group" style="margin-bottom:0"><label>Slot</label>'
    +'<select id="av-block-slot"><option value="">Whole day</option><option value="_AM">Morning (9am1pm)</option><option value="_PM">Afternoon (1pm5pm)</option></select></div></div>'
    +'<button class="btn btn-danger btn-sm" onclick="addBlock()">[block] Block This</button></div>';
  if(bd.length||bb.length){
    html+='<div class="card"><div class="card-title">[lock] Currently Blocked ('+(bd.length+bb.length)+')</div>';
    bd.forEach(function(date){ html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">'
      +'<span style="font-family:var(--fm)">'+esc(date)+'  Entire day</span>'
      +'<button class="btn btn-secondary btn-xs" onclick="removeBlock(\''+date+'\',%27date%27)">Remove</button></div>'; });
    bb.forEach(function(blk){ html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">'
      +'<span style="font-family:var(--fm)">'+esc(blk.replace('_AM',' Morning').replace('_PM',' Afternoon'))+'</span>'
      +'<button class="btn btn-secondary btn-xs" onclick="removeBlock(\''+blk+'\',%27block%27)">Remove</button></div>'; });
    html+='</div>';
  } else { html+='<div class="alert alert-info" style="margin-top:0">No dates blocked  all slots available.</div>'; }
  el.innerHTML=html;
}
function setAnyTime(val){
  fetch('availability.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({anyTimeMode:val})})
  .then(function(r){ return r.json(); }).then(function(d){ renderAvailUI(d.data||d); });
}
function addBlock(){
  var date=document.getElementById('av-block-date').value; var slot=document.getElementById('av-block-slot').value;
  if(!date){ alert('Select a date.'); return; }
  fetch('availability.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(slot?{addBlockedBlock:date+slot}:{addBlockedDate:date})})
  .then(function(r){ return r.json(); }).then(function(d){ renderAvailUI(d.data||d); });
}
function removeBlock(val,type){
  fetch('availability.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(type==='date'?{removeBlockedDate:val}:{removeBlockedBlock:val})})
  .then(function(r){ return r.json(); }).then(function(d){ renderAvailUI(d.data||d); });
}

//  SHARES PAGE 
function renderSharesPage(){
  var sl=document.getElementById('shares-list'); if(!sl) return;
  sl.innerHTML='<div class="empty-state"><span class="emoji">...</span>Loading...</div>';
  fetch('shares.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list'})})
  .then(function(r){ return r.json(); })
  .then(function(data){
    var list=Array.isArray(data)?data:[];
    if(!list.length){ sl.innerHTML='<div class="empty-state"><span class="emoji">&#x1F517;</span>No share links yet.<br>Complete a job and click "&#x1F517; Share Link".</div>'; return; }
    list.sort(function(a,b){ return b.createdAt.localeCompare(a.createdAt); });
    sl.innerHTML=list.map(function(s){
      var expired=s.expiresAt&&new Date(s.expiresAt)<new Date();
      var url='view.php?token='+s.token;
      return '<div class="card" style="margin-bottom:10px">'
        +'<div class="flex flex-wrap" style="justify-content:space-between;margin-bottom:8px">'
        +'<div><div style="font-weight:600;font-size:14px">'+esc(s.clientName||s.job&&s.job.propName||'Job')+'</div>'
        +'<div style="font-size:11px;color:var(--muted);font-family:var(--fm)">'+esc(s.job&&s.job.date||'')+(s.clientPhone?' &nbsp;&nbsp; '+esc(s.clientPhone):'')+'</div></div>'
        +'<div class="flex" style="gap:6px">'+(s.isPaid?'<span class="tag tag-green">[OK] PAID</span>':'<span class="tag tag-pink">... UNPAID</span>')
        +(expired?'<span class="tag tag-pink">EXPIRED</span>':'<span class="tag tag-blue">ACTIVE</span>')+'</div></div>'
        +'<div style="font-size:11px;font-family:var(--fm);color:var(--accent2);margin-bottom:8px;word-break:break-all">'+esc(url)+'</div>'
        +'<div class="flex flex-wrap" style="gap:6px">'
        +'<button class="btn btn-secondary btn-xs" onclick="copyShareLink(\'+url+\')">&#x1F4CB; Copy Link</button>'
        +(expired?'<button class="btn btn-secondary btn-xs" onclick="renewShare(\'+s.token+\')">[renew] Renew</button>':'')
        +'<button class="btn btn-secondary btn-xs" onclick="toggleSharePaid(\''+s.token+'\','+(s.isPaid?'\'false\'':'\'true\'')+')">'+(s.isPaid?'Mark Unpaid':'[OK] Mark Paid')+'</button>'
        +(!s.stripeLink?'<button class="btn btn-secondary btn-xs" onclick="addStripeLink(\'+s.token+\')">+ Stripe</button>':'<a href="'+esc(s.stripeLink)+'" class="btn btn-secondary btn-xs" target="_blank">[pay] Stripe</a>')
        +'</div></div>';
    }).join('');
  })
  .catch(function(e){ sl.innerHTML='<div class="alert alert-warn">Could not load shares: '+e.message+'</div>'; });
}
function renewShare(token){
  fetch('shares.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update',token:token,renew:true})})
  .then(function(){ renderSharesPage(); alert('[OK] Renewed for 90 days.'); });
}
function toggleSharePaid(token,paid){
  fetch('shares.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update',token:token,isPaid:paid==='true'||paid===true})})
  .then(function(){ renderSharesPage(); });
}
function addStripeLink(token){
  var link=prompt('Paste your Stripe payment link:','https://buy.stripe.com/');
  if(!link||link==='https://buy.stripe.com/') return;
  fetch('shares.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update',token:token,stripeLink:link})})
  .then(function(){ renderSharesPage(); alert('[OK] Stripe link added.'); });
}

//  SEED / INIT 
function initAdminUser(){ if(!state.users.find(function(u){ return u.role==='admin'; })) state.users.push({id:uid(),name:'Administrator',username:'admin',password:'admin1234',role:'admin',status:'active'}); }
function seedDemo(){
  if(state._initialized) return; state._initialized=true;
  state.users.push({id:uid(),name:'Administrator',username:'admin',password:'admin1234',role:'admin',status:'active'});
  var o1={id:uid(),name:'Alice Johnson',email:'alice@demo.com',phone:'555-0101',company:'AJ Properties'};
  var o2={id:uid(),name:'Bob Martinez',email:'bob@demo.com',phone:'555-0202',company:'Martinez Realty'};
  state.owners.push(o1,o2);
  var t1={id:uid(),name:'Mike Chen',rate:45,email:'mike@co.com',phone:'555-1001',status:'active'};
  var t2={id:uid(),name:'Sara Davis',rate:55,email:'sara@co.com',phone:'555-1002',status:'active'};
  state.technicians.push(t1,t2);
  state.users.push({id:uid(),name:'Mike Chen',username:'mike',password:'1001',role:'tech',techId:t1.id,status:'active'});
  state.users.push({id:uid(),name:'Sara Davis',username:'sara',password:'1002',role:'tech',techId:t2.id,status:'active'});
  var props=[
    {id:uid(),name:'Sunset Apts A1',ownerId:o1.id,defaultRate:60,rateType:'flat',address:'100 Oak Street',unit:'Apt A1',city:'Miami, FL 33101'},
    {id:uid(),name:'Elm Plaza 202',ownerId:o1.id,defaultRate:65,rateType:'flat',address:'200 Elm Avenue',unit:'Unit 202',city:'Miami, FL 33102'},
    {id:uid(),name:'Main Blvd Site',ownerId:o2.id,defaultRate:70,rateType:'flat',address:'10 Main Boulevard',unit:'Suite 100',city:'Miami Beach, FL 33139'},
    {id:uid(),name:'West End Complex',ownerId:o2.id,defaultRate:80,rateType:'flat',address:'5 West End Road',unit:'',city:'Aventura, FL 33160'}
  ];
  state.properties=props;
  var ws=new Date(); ws.setDate(ws.getDate()-ws.getDay());
  var descs=['HVAC maintenance','Electrical inspection','Plumbing repair','Lock replacement'];
  for(var d=0;d<4;d++){
    var dt=new Date(ws.getTime()); dt.setDate(ws.getDate()+d);
    var ds=dt.toISOString().slice(0,10);
    var t=d%2===0?t1:t2, p=props[d%props.length];
    var job={id:uid(),propId:p.id,techId:t.id,date:ds,notes:'Sample demo job',status:d<2?'complete':'open',assignedByAdmin:d===1,completedDate:d<2?ds:null,hours:[],expenses:[],photos:[]};
    job.hours.push({id:uid(),date:ds,hours:[3,4,5,6][d],desc:descs[d]});
    if(d%2===0) job.expenses.push({id:uid(),date:ds,store:'Home Depot',cost:parseFloat((Math.random()*80+15).toFixed(2)),desc:'Replacement parts',linkType:'property'});
    state.jobs.push(job);
  }
  save();
}

//  BOOT 
fetch('state.php')
.then(function(r){ return r.json(); })
.then(function(d){
  if(d.ok && d.state && d.state._initialized){
    state = d.state;
  } else {
    initAdminUser();
    save();
  }
  if(currentUser){
    var found=state.users.find(function(u){ return u.id===currentUser.id&&u.status==='active'; });
    if(found) setCurrentUser(found);
    else { currentUser=null; document.getElementById('login-screen').style.display='flex'; }
  } else {
    document.getElementById('login-screen').style.display='flex';
  }
})
.catch(function(){
  initAdminUser();
  if(currentUser) setCurrentUser(currentUser);
  else document.getElementById('login-screen').style.display='flex';
});

function notifyClientAssigned(reqId){
  var req=_requests.find(function(r){ return r.id===reqId; }); if(!req) return;
  var job=state.jobs.find(function(j){ return j.id===req.linkedJobId; });
  var tech=job?getTech(job.techId):null;
  var block=req.block||(job&&job.block)||'';
  var msg='WillowPA Maintenance: A technician has been assigned to your service request.'
    +(tech?' Your technician is '+tech.name+'.':'')
    +(block?' Estimated time: '+block:' We will confirm the appointment time shortly.')
    +' Questions? Reply to this number.';
  document.getElementById('mc-req-idx').value=reqId;
  document.getElementById('mc-msg').value=msg;
  openModal('modal-msg-client');
}

//  ADMIN APPROVE / SEND BACK
function adminApproveJob(jobId){
  var job=getJob(jobId); if(!job) return;
  job.status='complete';
  save();
  refreshJobCard(jobId);
  renderAllJobs();
  // SMS to client with summary
  if(job.clientPhone){
    var prop=getProp(job.propId);
    var hrs=jobTotalHours(job), exp=jobTotalExp(job), labor=jobTotalLabor(job);
    var msg='WillowPA Maintenance: Your service at '+(prop?prop.name:'your property')+' is complete.'+
      ' Hours: '+hrs.toFixed(2)+', Expenses: $'+exp.toFixed(2)+', Total: $'+(labor+exp).toFixed(2)+'.';
    if(job.stripeLink) msg+=' Pay: '+job.stripeLink;
    else if(job.shareToken) msg+=' View report: '+window.location.origin+'/view.php?token='+job.shareToken;
    sendSMS(job.clientPhone, msg);
  }
}
function adminSendBackJob(jobId){
  var job=getJob(jobId); if(!job) return;
  job.status='open'; job.completedDate=null;
  save();
  refreshJobCard(jobId);
}

//  ON MY WAY
function sendOnMyWay(jobId, minutes){
  var job=getJob(jobId); if(!job||!job.clientPhone){ alert('No client phone on this job.'); return; }
  var prop=getProp(job.propId);
  sendSMS(job.clientPhone,'WillowPA Maintenance: Your technician is on the way and will arrive in approximately '+minutes+' minute'+(minutes===1?'':'s')+'.'+(prop?' Location: '+prop.name:''));
  alert('SMS sent: On My Way ('+minutes+' min)');
}

//  MESSAGE CLIENT
function sendJobClientMessage(jobId){
  var job=getJob(jobId); if(!job||!job.clientPhone){ alert('No client phone on this job.'); return; }
  var msg=((document.getElementById('msg-client-'+jobId)||{}).value||'').trim();
  if(!msg){ alert('Enter a message.'); return; }
  sendSMS(job.clientPhone,'WillowPA Maintenance: '+msg);
  var el=document.getElementById('msg-client-'+jobId); if(el) el.value='';
  alert('Message sent!');
}

//  DELETE JOB
function deleteJob(jobId){
  if(!confirm('Delete this job permanently? This cannot be undone.')) return;
  var job=getJob(jobId);
  var pids=(job&&job.photos||[]).map(function(p){ return p.id; });
  state.jobs=state.jobs.filter(function(j){ return j.id!==jobId; });
  save();
  if(pids.length) FT_DB.delMany(pids,function(){ renderAllJobs(); });
  else renderAllJobs();
  updateJobsBadge();
}

//  DELETE REQUEST
function deleteRequest(reqId){
  if(!confirm('Delete this request permanently?')) return;
  fetch('requests.php',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:reqId,status:'deleted',_delete:true})})
  .then(function(){
    _requests=_requests.filter(function(r){ return r.id!==reqId; });
    renderReqList();
    var n=_requests.filter(function(r){ return r.status==='new'; }).length;
    var b=document.getElementById('req-badge'); if(b){ b.textContent=n; b.style.display=n>0?'inline':'none'; }
  });
}

//  TASKS SYSTEM
function renderTasksPage(){
  var el=document.getElementById('page-tasks'); if(!el) return;
  var tasks=state.tasks||[];
  var contacts=state.taskContacts||[];
  var today_=today();
  // Update task badge
  var due=tasks.filter(function(t){
    if(t.status==='complete') return false;
    if(!t.dueDate) return false;
    if(t.reminderDay){
      var d=new Date(t.dueDate); d.setDate(d.getDate()-1);
      var rem=d.toISOString().slice(0,10);
      return today_>=rem;
    }
    return today_>=t.dueDate;
  }).length;
  var b=document.getElementById('task-badge'); if(b){ b.textContent=due; b.style.display=due>0?'inline':'none'; }
  // Build contacts datalist
  var cl=contacts.map(function(c){ return '<option value="'+esc(c.name)+'">'; }).join('');
  var h='<div class="page-header"><div class="page-title">Tasks</div></div>';
  h+='<div style="margin-bottom:12px"><datalist id="task-contacts-list">'+cl+'</datalist>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">';
  h+='<div class="form-group" style="flex:1;min-width:180px;margin:0"><label>Title</label><input type="text" id="new-task-title" placeholder="Task title..."></div>';
  h+='<div class="form-group" style="width:140px;margin:0"><label>Assign To</label><input type="text" id="new-task-assignee" list="task-contacts-list" placeholder="Name..."></div>';
  h+='<div class="form-group" style="width:130px;margin:0"><label>Due Date</label><input type="date" id="new-task-due"></div>';
  h+='<div class="form-group" style="width:120px;margin:0"><label>Repeat</label><select id="new-task-repeat"><option value="">None</option><option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option><option value="monthly">Monthly</option></select></div>';
  h+='<div class="form-group" style="margin:0"><label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" id="new-task-reminder"> Remind 1 day before</label></div>';
  h+='<button class="btn btn-primary" onclick="saveTask()">+ Add Task</button>';
  h+='</div>';
  h+='<div class="form-group" style="margin-top:8px"><label>Notes</label><textarea id="new-task-notes" rows="2" placeholder="Optional notes..."></textarea></div></div>';
  // Filter buttons
  h+='<div style="display:flex;gap:8px;margin-bottom:12px">';
  h+='<button class="btn btn-secondary btn-sm" onclick="renderTasksPage()" id="task-filter-all">All ('+tasks.length+')</button>';
  h+='<button class="btn btn-secondary btn-sm" onclick="renderTasksFiltered(&quot;open&quot;)">Open ('+tasks.filter(function(t){return t.status==='open';}).length+')</button>';
  h+='<button class="btn btn-secondary btn-sm" onclick="renderTasksFiltered(&quot;complete&quot;)">Done ('+tasks.filter(function(t){return t.status==='complete';}).length+')</button>';
  h+='<button class="btn btn-secondary btn-sm" onclick="renderTasksFiltered(&quot;due&quot;)">Due/Upcoming ('+due+')</button>';
  h+='</div>';
  h+='<div id="task-list">'+buildTaskList(tasks)+'</div>';
  el.innerHTML=h;
}
function renderTasksFiltered(filter){
  var tasks=state.tasks||[];
  var today_=today();
  var filtered;
  if(filter==='open') filtered=tasks.filter(function(t){ return t.status==='open'; });
  else if(filter==='complete') filtered=tasks.filter(function(t){ return t.status==='complete'; });
  else if(filter==='due') filtered=tasks.filter(function(t){
    if(t.status==='complete') return false;
    if(!t.dueDate) return false;
    if(t.reminderDay){ var d=new Date(t.dueDate); d.setDate(d.getDate()-1); return today_>=d.toISOString().slice(0,10); }
    return today_>=t.dueDate;
  });
  else filtered=tasks;
  var el=document.getElementById('task-list'); if(el) el.innerHTML=buildTaskList(filtered);
}
function buildTaskList(tasks){
  if(!tasks.length) return '<div class="empty-state"><span class="emoji">&#x2705;</span>No tasks.</div>';
  var today_=today();
  return tasks.slice().sort(function(a,b){ return (a.dueDate||'9999')>(b.dueDate||'9999')?1:-1; }).map(function(t){
    var isDue=t.status==='open'&&t.dueDate&&today_>=t.dueDate;
    var isReminder=t.status==='open'&&t.dueDate&&t.reminderDay&&(function(){ var d=new Date(t.dueDate); d.setDate(d.getDate()-1); return today_>=d.toISOString().slice(0,10)&&today_<t.dueDate; })();
    var bg=t.status==='complete'?'rgba(34,197,94,.06)':isDue?'rgba(224,92,122,.06)':isReminder?'rgba(245,158,11,.06)':'var(--surface)';
    var border=isDue?'1px solid rgba(224,92,122,.3)':isReminder?'1px solid rgba(245,158,11,.2)':'1px solid var(--border)';
    var h='<div style="padding:10px 14px;border-radius:8px;margin-bottom:8px;background:'+bg+';border:'+border+'">';
    h+='<div style="display:flex;align-items:flex-start;gap:8px">';
    h+='<input type="checkbox" style="margin-top:3px;cursor:pointer" '+(t.status==='complete'?'checked':'')+' onchange="toggleTaskStatus(&quot;'+t.id+'&quot;)">';
    h+='<div style="flex:1">';
    h+='<div style="font-weight:600;'+(t.status==='complete'?'text-decoration:line-through;opacity:.5':'')+'">'+(isDue?'&#x26A0;&#xFE0F; ':isReminder?'&#x1F514; ':'')+esc(t.title)+'</div>';
    if(t.assignedTo) h+='<div style="font-size:12px;color:var(--muted)">&#x1F464; '+esc(t.assignedTo)+'</div>';
    if(t.dueDate) h+='<div style="font-size:12px;color:var(--muted)">Due: '+t.dueDate+(t.repeat?' · Repeats '+t.repeat:'')+'</div>';
    if(t.notes) h+='<div style="font-size:12px;margin-top:4px;color:var(--muted)">'+esc(t.notes)+'</div>';
    h+='</div>';
    h+='<button class="btn btn-danger btn-xs" onclick="deleteTask(&quot;'+t.id+'&quot;)">&#x2715;</button>';
    h+='</div></div>';
    return h;
  }).join('');
}
function saveTask(){
  var title=((document.getElementById('new-task-title')||{}).value||'').trim();
  if(!title){ alert('Task title required.'); return; }
  var assignee=((document.getElementById('new-task-assignee')||{}).value||'').trim();
  var due=((document.getElementById('new-task-due')||{}).value||'');
  var repeat=((document.getElementById('new-task-repeat')||{}).value||'');
  var reminder=(document.getElementById('new-task-reminder')||{}).checked||false;
  var notes=((document.getElementById('new-task-notes')||{}).value||'').trim();
  // Add new contact if not known
  if(assignee){
    var contacts=state.taskContacts||[];
    if(!contacts.find(function(c){ return c.name===assignee; })){
      contacts.push({id:'tc_'+Date.now(),name:assignee,phone:''});
      state.taskContacts=contacts;
    }
  }
  var task={id:'task_'+Date.now(),title:title,notes:notes,dueDate:due,assignedTo:assignee,repeat:repeat,repeatDays:'',reminderDay:reminder,status:'open',createdAt:new Date().toISOString()};
  if(!state.tasks) state.tasks=[];
  state.tasks.push(task);
  save();
  // Clear form
  ['new-task-title','new-task-assignee','new-task-due','new-task-notes'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  var rs=document.getElementById('new-task-repeat'); if(rs) rs.value='';
  var rb=document.getElementById('new-task-reminder'); if(rb) rb.checked=false;
  renderTasksPage();
}
function toggleTaskStatus(taskId){
  var task=(state.tasks||[]).find(function(t){ return t.id===taskId; });
  if(!task) return;
  if(task.status==='complete'){
    task.status='open'; task.completedDate=null;
  } else {
    task.status='complete'; task.completedDate=today();
    // Handle repeat
    if(task.repeat&&task.dueDate){
      var d=new Date(task.dueDate);
      if(task.repeat==='weekly') d.setDate(d.getDate()+7);
      else if(task.repeat==='biweekly') d.setDate(d.getDate()+14);
      else if(task.repeat==='monthly') d.setMonth(d.getMonth()+1);
      var newTask={id:'task_'+Date.now(),title:task.title,notes:task.notes,dueDate:d.toISOString().slice(0,10),assignedTo:task.assignedTo,repeat:task.repeat,repeatDays:task.repeatDays||'',reminderDay:task.reminderDay,status:'open',createdAt:new Date().toISOString()};
      state.tasks.push(newTask);
    }
  }
  save();
  renderTasksPage();
}
function deleteTask(taskId){
  if(!confirm('Delete this task?')) return;
  state.tasks=(state.tasks||[]).filter(function(t){ return t.id!==taskId; });
  save(); renderTasksPage();
}

//  REPHRASE WORK DESCRIPTION
function rephraseWorkDesc(jobId){
  var el=document.getElementById('ah-desc-'+jobId);
  if(!el||!el.value.trim()){ alert('Type a work description first, then click Rephrase.'); return; }
  var apiKey=getApiKey();
  if(!apiKey){ alert('No API key configured. Go to Settings.'); return; }
  var original=el.value.trim();
  el.disabled=true; el.value='Rephrasing...';
  fetch('proxy.php',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:300,
      messages:[{role:'user',content:'Rephrase this field technician work note into clear, professional language suitable for a maintenance report. Keep it concise (1-3 sentences). Only return the rephrased text, nothing else. Original note: '+original}]
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    el.disabled=false;
    var reply='';
    if(data.content&&data.content.length) data.content.forEach(function(c){ if(c.type==='text') reply+=c.text; });
    el.value=reply.trim()||original;
  })
  .catch(function(){ el.disabled=false; el.value=original; alert('Rephrase failed.'); });
}

//  BACKUP BROWSER
function loadBackupList(){
  var el=document.getElementById('backup-list'); if(!el) return;
  el.innerHTML='<div style="color:var(--muted);font-size:13px">Loading backups...</div>';
  fetch('backup_list.php')
  .then(function(r){ return r.json(); })
  .then(function(files){
    if(files._error){ el.innerHTML='<div style="color:var(--accent3);font-size:13px">[!] '+files._error+'</div>'; return; }
    if(!Array.isArray(files)||!files.length){ el.innerHTML='<div style="color:var(--muted);font-size:13px">No backup files found in data/backups/</div>'; return; }
    el.innerHTML=files.map(function(f){
      var row='<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">';
      row+='<span style="flex:1;font-family:var(--fm);font-size:12px">'+esc(f.name)+'</span>';
      row+='<span style="color:var(--muted);font-size:11px">'+f.size+'</span>';
      row+='<span style="color:var(--muted);font-size:11px">'+f.date+'</span>';
      row+='<button class="btn btn-secondary btn-xs" onclick="window._previewBackup(this)" data-fn="'+esc(f.name)+'">Preview</button>';
      row+='<button class="btn btn-primary btn-xs" onclick="window._restoreBackup(this)" data-fn="'+esc(f.name)+'">Restore</button>';
      row+='</div>';
      return row;
    }).join('');
  })
  .catch(function(){ el.innerHTML='<div style="color:var(--accent3);font-size:13px">[!] Could not load backup list. Make sure backup_list.php is on the server.</div>'; });
}
// button onclick wrappers using data-fn attribute
window._previewBackup=function(btn){ previewBackup(btn.getAttribute('data-fn')); };
window._restoreBackup=function(btn){ restoreBackup(btn.getAttribute('data-fn')); };

function previewBackup(filename){
  fetch('backup_list.php?preview='+encodeURIComponent(filename))
  .then(function(r){ return r.json(); })
  .then(function(data){
    var info='Backup: '+filename+'\n\nContents:\n'
      +'  Jobs: '+(data.jobs||[]).length+'\n'
      +'  Properties: '+(data.properties||[]).length+'\n'
      +'  Owners: '+(data.owners||[]).length+'\n'
      +'  Technicians: '+(data.technicians||[]).length+'\n'
      +'  Saved at: '+(data._savedAt||'unknown');
    alert(info);
  })
  .catch(function(){ alert('Could not preview '+filename); });
}
function restoreBackup(filename){
  if(!confirm('Restore from backup: '+filename+'?\n\nThis will REPLACE all current data. This cannot be undone.')) return;
  if(!confirm('Are you 100% sure? All current jobs, hours and data will be replaced.')) return;
  fetch('backup_list.php?restore='+encodeURIComponent(filename))
  .then(function(r){ return r.json(); })
  .then(function(data){
    if(data.ok){
      state=data.state;
      save();
      alert('[OK] Restored from '+filename+'! Reloading...');
      setTimeout(function(){ location.reload(); },800);
    } else {
      alert('[!] Restore failed: '+(data.error||'unknown error'));
    }
  })
  .catch(function(){ alert('Restore request failed.'); });
}
