/* Kreator-Vault — complete app.js */
const $=(sel,root=document)=>root.querySelector(sel);
const $all=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const esc=(str)=>(str||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function toast(msg){
  const t=$('#toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer=setTimeout(()=>t.classList.remove('show'),2200);
}

const LS={
  projects:'kreatorVault_projects',
  tasks:'kreatorVault_tasks',
  ideas:'kreatorVault_ideas',
  assets:'kreatorVault_assets',
  performance:'kreatorVault_performance',
  settings:'kreatorVault_settings'
};

function loadJSON(key,fallback){
  try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}
  catch(e){console.error('Storage read failed',key,e);return fallback}
}
function saveJSON(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}
  catch(e){console.error('Storage write failed',key,e);toast('Storage is full')}
}

const getProjects=()=>loadJSON(LS.projects,[]);
const saveProjects=v=>saveJSON(LS.projects,v);
const getTasks=()=>loadJSON(LS.tasks,[]);
const saveTasks=v=>saveJSON(LS.tasks,v);
const getIdeas=()=>loadJSON(LS.ideas,[]);
const saveIdeas=v=>saveJSON(LS.ideas,v);
const getAssets=()=>loadJSON(LS.assets,[]);
const saveAssets=v=>saveJSON(LS.assets,v);
const getPerformance=()=>loadJSON(LS.performance,[]);
const savePerformance=v=>saveJSON(LS.performance,v);
const getSettings=()=>loadJSON(LS.settings,{vaultName:'Kreator-Vault'});
const saveSettings=v=>saveJSON(LS.settings,v);

function projectName(id){
  if(!id) return 'No project';
  const p=getProjects().find(x=>x.id===id);
  return p?p.name:'No project';
}

function addProject(){
  const name=$('#projectName').value.trim();
  const goal=$('#projectGoal').value.trim();
  const nextStep=$('#projectNextStep').value.trim();
  if(!name) return toast('Project needs a name');
  const projects=getProjects();
  projects.unshift({id:uid(),name,goal,nextStep,status:'active',dateCreated:new Date().toISOString()});
  saveProjects(projects);
  $('#projectName').value=''; $('#projectGoal').value=''; $('#projectNextStep').value='';
  renderProjects(); populateTaskProjectSelect(); renderDashboard(); toast('Project saved ◈');
}

function renderProjects(){
  const projects=getProjects();
  $('#projectList').innerHTML=projects.map(p=>`
    <div class="project-card">
      <div class="project-title">${esc(p.name)}</div>
      <div class="project-goal">${esc(p.goal||'No goal added yet')}</div>
      <div class="project-next">Next step: ${esc(p.nextStep||'Choose the next smallest step')}</div>
      <button class="btn btn-secondary" data-project-task="${p.id}">Add task</button>
      <button class="btn btn-ghost danger" data-delete-project="${p.id}">Delete</button>
    </div>
  `).join('');
  $('#projectsEmpty').classList.toggle('hidden',projects.length>0);
}

function populateTaskProjectSelect(){
  const sel=$('#taskProject'); if(!sel) return;
  const projects=getProjects();
  sel.innerHTML='<option value="">No project / general task</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
}

function addTask(){
  const title=$('#taskTitle').value.trim();
  const projectId=$('#taskProject').value;
  const priority=$('#taskPriority').value;
  if(!title) return toast('Task needs a title');
  const tasks=getTasks();
  tasks.unshift({id:uid(),title,projectId,priority,done:false,dateCreated:new Date().toISOString()});
  saveTasks(tasks);
  $('#taskTitle').value='';
  renderTasks(); renderDashboard(); toast('Task added ✦');
}

function renderTasks(){
  const tasks=getTasks();
  $('#taskList').innerHTML=tasks.map(t=>taskCardHTML(t)).join('');
  $('#tasksEmpty').classList.toggle('hidden',tasks.length>0);
}

function taskCardHTML(t){
  return `<div class="task-card ${t.done?'done':''}">
    <div class="task-title">${esc(t.title)}</div>
    <div class="task-meta">Project: ${esc(projectName(t.projectId))}</div>
    <div class="task-meta priority-${esc(t.priority)}">${esc(t.priority)} priority</div>
    <button class="btn btn-secondary" data-toggle-task="${t.id}">${t.done?'Undo':'Complete'}</button>
    <button class="btn btn-ghost danger" data-delete-task="${t.id}">Delete</button>
  </div>`;
}

function addIdea(){
  const title=$('#ideaTitle').value.trim();
  const notes=$('#ideaNotes').value.trim();
  if(!title) return toast('Idea needs a title');
  const ideas=getIdeas();
  ideas.unshift({id:uid(),title,notes,dateCreated:new Date().toISOString(),status:'idea'});
  saveIdeas(ideas);
  $('#ideaTitle').value=''; $('#ideaNotes').value='';
  renderIdeas(); renderDashboard(); toast('Idea saved ✦');
}

function renderIdeas(){
  const ideas=getIdeas();
  $('#ideaList').innerHTML=ideas.map(i=>`
    <div class="idea-card">
      <div class="item-title">${esc(i.title)}</div>
      <div class="item-meta">${esc(i.notes||'No notes')}</div>
      <button class="btn btn-secondary" data-script-from-idea="${i.id}">Make script</button>
      <button class="btn btn-ghost danger" data-delete-idea="${i.id}">Delete</button>
    </div>`).join('');
  $('#ideasEmpty').classList.toggle('hidden',ideas.length>0);
}

function generateScript(){
  const topic=$('#scriptTopic').value.trim();
  const style=$('#scriptStyle').value;
  if(!topic) return toast('Add a topic first');
  const hook = style==='hot-take'
    ? `Hot take: ${topic} is not what everyone thinks.`
    : style==='storytime'
    ? `Storytime about ${topic} — and why it changed everything.`
    : style==='educational'
    ? `Here is the simple breakdown of ${topic}.`
    : `The biggest myth about ${topic} is this:`;
  const script=`[0-2s] HOOK: "${hook}"
[2-8s] State the problem or belief your audience already has.
[8-20s] Reveal the twist, proof, or unexpected explanation.
[20-35s] Give one example that makes it feel real and specific.
[35-50s] Tell the viewer what to do next or what to watch for.
[50-60s] CTA: Save this, comment your question, or check the link in your bio.`;
  $('#scriptOutput').innerHTML=`
    <div class="glass-card">
      <div class="post-block"><div class="post-block-label">Hook</div><div class="post-block-body">${esc(hook)}</div></div>
      <div class="post-block"><div class="post-block-label">60-second script</div><div class="post-block-body">${esc(script)}</div></div>
      <button class="btn btn-primary" id="saveGeneratedIdea">Save as idea</button>
    </div>`;
  $('#saveGeneratedIdea').addEventListener('click',()=>{
    const ideas=getIdeas();
    ideas.unshift({id:uid(),title:topic,notes:script,dateCreated:new Date().toISOString(),status:'script'});
    saveIdeas(ideas); renderIdeas(); renderDashboard(); toast('Script saved to Ideas');
  });
}

function addAsset(){
  const name=$('#assetName').value.trim();
  const link=$('#assetLink').value.trim();
  if(!name) return toast('Asset needs a name');
  const assets=getAssets();
  assets.unshift({id:uid(),name,link,dateCreated:new Date().toISOString()});
  saveAssets(assets);
  $('#assetName').value=''; $('#assetLink').value='';
  renderAssets(); toast('Asset saved');
}

function renderAssets(){
  const assets=getAssets();
  $('#assetList').innerHTML=assets.map(a=>`
    <div class="asset-card">
      <div class="item-title">${esc(a.name)}</div>
      <div class="item-meta">${esc(a.link||'No location added')}</div>
      <button class="btn btn-ghost danger" data-delete-asset="${a.id}">Delete</button>
    </div>`).join('');
  $('#assetsEmpty').classList.toggle('hidden',assets.length>0);
}

function savePerf(){
  const title=$('#statPostTitle').value.trim();
  if(!title) return toast('Post needs a title');
  const record={
    id:uid(),title,date:new Date().toISOString(),
    views:Number($('#perfViews').value)||0,
    likes:Number($('#perfLikes').value)||0,
    comments:Number($('#perfComments').value)||0,
    shares:Number($('#perfShares').value)||0,
    saves:Number($('#perfSaves').value)||0,
    follows:Number($('#perfFollows').value)||0
  };
  const perf=getPerformance(); perf.unshift(record); savePerformance(perf);
  $('#statPostTitle').value=''; $all('.metric-grid input').forEach(i=>i.value='');
  renderStats(); toast('Stats logged');
}

function renderStats(){
  const perf=getPerformance();
  $('#perfHistory').innerHTML=perf.map(p=>`
    <div class="library-card">
      <div class="item-title">${esc(p.title)}</div>
      <div class="item-meta">${new Date(p.date).toLocaleDateString()}</div>
      <div class="item-meta">${p.views} views · ${p.likes} likes · ${p.comments} comments · ${p.shares} shares · ${p.saves} saves · ${p.follows} follows</div>
    </div>`).join('');
  $('#perfEmpty').classList.toggle('hidden',perf.length>0);
}

function renderDashboardStats(){
  const tasks=getTasks();
  $('#statProjects').textContent=getProjects().length;
  $('#statTasks').textContent=tasks.filter(t=>!t.done).length;
  $('#statIdeas').textContent=getIdeas().length;
  $('#statPosted').textContent=getPerformance().length;
}

function renderDashboard(){
  renderDashboardStats();
  const openTasks=getTasks().filter(t=>!t.done).sort((a,b)=>{
    const rank={high:0,medium:1,low:2}; return rank[a.priority]-rank[b.priority];
  });
  const projects=getProjects();
  if(openTasks[0]){
    $('#dashNextAction').textContent=openTasks[0].title;
    $('#dashNextWhy').textContent=`Priority: ${openTasks[0].priority}. Project: ${projectName(openTasks[0].projectId)}.`;
  }else if(projects[0]){
    $('#dashNextAction').textContent=projects[0].nextStep||`Move ${projects[0].name} forward`;
    $('#dashNextWhy').textContent=projects[0].goal||'No task is open. Choose the next smallest step.';
  }else{
    $('#dashNextAction').textContent='Build your first project';
    $('#dashNextWhy').textContent='Add a project and Kreator-Vault will keep the next step visible.';
  }
  $('#dashProjectList').innerHTML=projects.slice(0,3).map(p=>`
    <div class="project-card">
      <div class="project-title">${esc(p.name)}</div>
      <div class="project-goal">${esc(p.goal||'No goal added')}</div>
      <div class="project-next">Next: ${esc(p.nextStep||'Pick a next step')}</div>
    </div>`).join('') || '<p class="empty-state">No projects yet.</p>';
  $('#dashTaskList').innerHTML=openTasks.slice(0,4).map(taskCardHTML).join('') || '<p class="empty-state">No open tasks.</p>';
}

function loadSettingsIntoForm(){
  const s=getSettings();
  $('#vaultNameInput').value=s.vaultName||'Kreator-Vault';
}
function handleSaveSettings(){
  const s=getSettings();
  s.vaultName=$('#vaultNameInput').value.trim()||'Kreator-Vault';
  saveSettings(s);
  document.querySelector('.brand-name').textContent=s.vaultName;
  toast('Settings saved');
}
function applySettings(){
  const s=getSettings();
  document.querySelector('.brand-name').textContent=s.vaultName||'Kreator-Vault';
}
function exportData(){
  const payload={projects:getProjects(),tasks:getTasks(),ideas:getIdeas(),assets:getAssets(),performance:getPerformance(),settings:getSettings()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download='kreator-vault-export.json'; a.click(); URL.revokeObjectURL(url);
}
function resetData(){
  if(!confirm('Erase all Kreator-Vault data from this browser?')) return;
  Object.values(LS).forEach(k=>localStorage.removeItem(k));
  renderEverything(); toast('Vault erased');
}

function showView(name){
  $all('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  $all('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===name));
  window.scrollTo({top:0,behavior:'auto'});
  if(name==='dashboard') renderDashboard();
  if(name==='projects') renderProjects();
  if(name==='tasks'){populateTaskProjectSelect();renderTasks();}
  if(name==='ideas') renderIdeas();
  if(name==='assets') renderAssets();
  if(name==='stats') renderStats();
  if(name==='settings') loadSettingsIntoForm();
}

function renderEverything(){
  applySettings(); populateTaskProjectSelect(); renderDashboard(); renderProjects(); renderTasks(); renderIdeas(); renderAssets(); renderStats(); loadSettingsIntoForm();
}

function init(){
  $all('.nav-item').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
  $('#settingsShortcut').addEventListener('click',()=>showView('settings'));
  $('#dashGoProjects').addEventListener('click',()=>showView('projects'));
  $('#addProjectBtn').addEventListener('click',addProject);
  $('#addTaskBtn').addEventListener('click',addTask);
  $('#addIdeaBtn').addEventListener('click',addIdea);
  $('#generateScriptBtn').addEventListener('click',generateScript);
  $('#addAssetBtn').addEventListener('click',addAsset);
  $('#savePerfBtn').addEventListener('click',savePerf);
  $('#saveSettingsBtn').addEventListener('click',handleSaveSettings);
  $('#exportDataBtn').addEventListener('click',exportData);
  $('#resetDataBtn').addEventListener('click',resetData);

  document.addEventListener('click',e=>{
    if(e.target.matches('[data-delete-project]')){
      const id=e.target.dataset.deleteProject;
      saveProjects(getProjects().filter(p=>p.id!==id));
      saveTasks(getTasks().map(t=>t.projectId===id?{...t,projectId:''}:t));
      renderProjects(); populateTaskProjectSelect(); renderDashboard(); toast('Project deleted');
    }
    if(e.target.matches('[data-project-task]')){
      showView('tasks'); $('#taskProject').value=e.target.dataset.projectTask; $('#taskTitle').focus();
    }
    if(e.target.matches('[data-toggle-task]')){
      const id=e.target.dataset.toggleTask;
      saveTasks(getTasks().map(t=>t.id===id?{...t,done:!t.done}:t));
      renderTasks(); renderDashboard();
    }
    if(e.target.matches('[data-delete-task]')){
      saveTasks(getTasks().filter(t=>t.id!==e.target.dataset.deleteTask));
      renderTasks(); renderDashboard(); toast('Task deleted');
    }
    if(e.target.matches('[data-delete-idea]')){
      saveIdeas(getIdeas().filter(i=>i.id!==e.target.dataset.deleteIdea));
      renderIdeas(); renderDashboard(); toast('Idea deleted');
    }
    if(e.target.matches('[data-script-from-idea]')){
      const idea=getIdeas().find(i=>i.id===e.target.dataset.scriptFromIdea);
      showView('scripts'); $('#scriptTopic').value=idea?idea.title:'';
    }
    if(e.target.matches('[data-delete-asset]')){
      saveAssets(getAssets().filter(a=>a.id!==e.target.dataset.deleteAsset));
      renderAssets(); toast('Asset deleted');
    }
  });
  renderEverything();
}
document.addEventListener('DOMContentLoaded',init);
