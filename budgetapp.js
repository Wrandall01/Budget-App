
/* =========================
   Utilitaires format / dates
   ========================= */
const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const monthNames = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
];

function pad2(n){ return String(n).padStart(2,'0'); }
function clamp(n, min, max){ return Math.min(max, Math.max(min, n)); }
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function parseISODate(iso){ // "YYYY-MM-DD" -> {y, m, d}
  const [y,m,d] = iso.split('-').map(v=>parseInt(v,10));
  return { y, m, d };
}
function ymKey(y,m){ return `${y}-${pad2(m)}`; }

/* =========================
   Persistance
   ========================= */
const LS_KEY = 'budgetTracker_v1';
function loadStore(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return { months:{}, years:{} };
    const data = JSON.parse(raw);
    if(!data.months) data.months = {};
    if(!data.years) data.years = {};
    return data;
  }catch(e){
    console.warn('Erreur parse localStorage', e);
    return { months:{}, years:{} };
  }
}
function saveStore(){ localStorage.setItem(LS_KEY, JSON.stringify(store)); }
let store = loadStore();

/* =========================
   État de période (Année + Mois)
   ========================= */
const periodPicker = document.querySelector('.period-picker');
const monthSelect  = document.querySelector('#periodSelect'); // utilisé comme sélecteur de mois
let yearSelect; // créé dynamiquement

const NOW = new Date();
let selectedYear  = clamp(NOW.getFullYear(), 2026, 2100);
let selectedMonth = NOW.getMonth() + 1; // 1..12
let selectedYM    = ymKey(selectedYear, selectedMonth);

function ensurePeriod(y, m){
  const ym = ymKey(y,m);
  if(!store.months[ym]) store.months[ym] = { monthlyCategories: {} };
  if(!store.years[y])   store.years[y]   = { annualCategories: {} };
}
function currentYear(){ return selectedYear; }
function currentMonth(){ return selectedMonth; }

function buildYearMonthSelects(){
  // Crée le select Année si absent
  if(!document.querySelector('#yearSelect')){
    yearSelect = document.createElement('select');
    yearSelect.id = 'yearSelect';
    periodPicker.insertBefore(yearSelect, monthSelect);
  }else{
    yearSelect = document.querySelector('#yearSelect');
  }

  // Années 2026..2100
  yearSelect.innerHTML = '';
  for(let y=2026; y<=2100; y++){
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
  yearSelect.value = String(selectedYear);

  // Mois 1..12
  monthSelect.innerHTML = '';
  for(let m=1; m<=12; m++){
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = monthNames[m-1];
    monthSelect.appendChild(opt);
  }
  monthSelect.value = String(selectedMonth);

  // Listeners
  if(!yearSelect._bound){
    yearSelect.addEventListener('change',()=>{
      selectedYear = clamp(parseInt(yearSelect.value,10), 2026, 2100);
      selectedYM = ymKey(selectedYear, selectedMonth);
      ensurePeriod(selectedYear, selectedMonth);
      refreshAll();
    });
    yearSelect._bound = true;
  }
  if(!monthSelect._bound){
    monthSelect.addEventListener('change',()=>{
      selectedMonth = clamp(parseInt(monthSelect.value,10), 1, 12);
      selectedYM = ymKey(selectedYear, selectedMonth);
      ensurePeriod(selectedYear, selectedMonth);
      refreshAll();
    });
    monthSelect._bound = true;
  }
}

/* =========================
   IDs et création
   ========================= */
function uid(){ return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }

function addCategory({ type, name, budget }){
  if(type === 'mensuel'){
    const ym = selectedYM;
    ensurePeriod(selectedYear, selectedMonth);
    const id = uid();
    store.months[ym].monthlyCategories[id] = { id, name, budget: Number(budget), expenses: [] };
  }else{
    const y = selectedYear;
    ensurePeriod(y, selectedMonth);
    const id = uid();
    store.years[y].annualCategories[id] = { id, name, budget: Number(budget), expenses: [] };
  }
  saveStore();
}

/* =========================
   Ajout dépense — IMPUTATION SELON LA DATE
   ========================= */
function addExpense({ dateISO, categoryKey, name, amount }){
  const amt = Number(amount);
  if(!dateISO){ toast('Date manquante.'); return; }
  const { y:dateY, m:dateM } = parseISODate(dateISO);
  if(!(dateY>=2026 && dateY<=2100) || !(dateM>=1 && dateM<=12)){
    toast('Date hors plage (années 2026–2100).'); return;
  }

  ensurePeriod(dateY, dateM);

  // categoryKey encodé comme :
  // Mensuel : "m:YYYY-MM:<id>"
  // Annuel  : "a:YYYY:<id>"
  const parts = categoryKey.split(':');
  const scope = parts[0]; // 'm' ou 'a'
  if(scope === 'm'){
    const srcYM = parts[1];
    const id    = parts[2];
    const srcCat = store.months[srcYM]?.monthlyCategories?.[id];
    if(!srcCat){ toast('Catégorie mensuelle introuvable.'); return; }

    const targetYM = ymKey(dateY, dateM);
    const targetCats = store.months[targetYM].monthlyCategories;

    // Cherche une catégorie du même NOM dans le mois cible
    let targetCat = Object.values(targetCats).find(c => c.name === srcCat.name);

    // Si absente, la créer (nom identique, budget copié)
    if(!targetCat){
      const newId = uid();
      targetCat = { id:newId, name:srcCat.name, budget:Number(srcCat.budget), expenses:[] };
      targetCats[newId] = targetCat;
    }

    // Ajoute la dépense
    targetCat.expenses.push({ date: dateISO, name, amount: amt });
    saveStore();
    toast(`Dépense imputée sur ${monthNames[dateM-1]} ${dateY}.`);

  }else if(scope === 'a'){
    const srcY = parseInt(parts[1],10);
    const id   = parts[2];
    const srcCat = store.years[srcY]?.annualCategories?.[id];
    if(!srcCat){ toast('Catégorie annuelle introuvable.'); return; }

    const targetY = dateY;
    const targetCats = store.years[targetY].annualCategories;

    // Cherche catégorie même NOM dans l'année cible
    let targetCat = Object.values(targetCats).find(c => c.name === srcCat.name);

    // Si absente, la créer (budget copié)
    if(!targetCat){
      const newId = uid();
      targetCat = { id:newId, name:srcCat.name, budget:Number(srcCat.budget), expenses:[] };
      targetCats[newId] = targetCat;
    }

    // Ajoute la dépense
    targetCat.expenses.push({ date: dateISO, name, amount: amt });
    saveStore();
    toast(`Dépense imputée sur l’année ${targetY}.`);
  }else{
    toast('Catégorie invalide.');
  }
}

/* =========================
   Calculs
   ========================= */
function sumExpenses(list){ return list.reduce((s,e)=> s + Number(e.amount||0), 0); }

function monthlyStats(){
  ensurePeriod(selectedYear, selectedMonth);
  const ym = selectedYM;
  const cats = store.months[ym].monthlyCategories;
  const rows = Object.values(cats).map(c=>{
    const spent = sumExpenses(c.expenses);
    const remaining = c.budget - spent;
    return { id:c.id, name:c.name, budget:c.budget, spent, remaining, expenses:c.expenses };
  });
  const totals = rows.reduce((acc,r)=>{
    acc.budget += r.budget; acc.spent += r.spent; acc.remaining += r.remaining;
    return acc;
  }, { budget:0, spent:0, remaining:0 });
  return { rows, totals };
}

function annualStats(){
  ensurePeriod(selectedYear, selectedMonth);
  const y = selectedYear;
  const cats = store.years[y].annualCategories;
  const rows = Object.values(cats).map(c=>{
    const spent = sumExpenses(c.expenses);
    const remaining = c.budget - spent;
    return { id:c.id, name:c.name, budget:c.budget, spent, remaining, expenses:c.expenses };
  });
  const totals = rows.reduce((acc,r)=>{
    acc.budget += r.budget; acc.spent += r.spent; acc.remaining += r.remaining;
    return acc;
  }, { budget:0, spent:0, remaining:0 });
  return { rows, totals };
}

/* ===== Global mensuel uniquement ===== */
function globalMonthlyStats(){
  const m = monthlyStats();
  return { budget: m.totals.budget, spent: m.totals.spent, remaining: m.totals.remaining };
}

/* =========================
   UI helpers
   ========================= */
function el(tag, attrs={}, children=[]){
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==='class') node.className = v;
    else if(k==='text') node.textContent = v;
    else node.setAttribute(k,v);
  });
  children.forEach(ch => node.appendChild(ch));
  return node;
}
function toast(msg){
  const t = document.querySelector('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(()=> t.classList.add('hidden'), 2200);
}

/* =========================
   Modales utilitaires dynamiques
   ========================= */
function openModal(contentEl){
  const overlay = el('div',{class:'modal'});
  const box = el('div',{class:'modal-content'}, [contentEl]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  function close(){ overlay.remove(); }
  return { close, overlay };
}

/* =========================
   Rendu : résumé mensuel (menus ⋯ cat + dépenses)
   ========================= */
function renderMonthlySummary(){
  const wrap = document.querySelector('#monthlySummary');
  wrap.innerHTML = '';

  const header = el('div', { class:'summary-header' }, [
    el('div', { text:'Catégorie' }),
    el('div', { text:'Budget initial' }),
    el('div', { text:'Dépenses imputées' }),
    el('div', { text:'Budget restant' }),
    el('div', { text:'' }),
  ]);
  wrap.appendChild(header);

  const { rows } = monthlyStats();
  if(rows.length===0){
    wrap.appendChild(el('div',{class:'chip',text:'Aucune catégorie mensuelle pour cette période.'}));
    return;
  }

  rows.forEach(r=>{
    const row = el('div',{class:'summary-row'});
    const title = el('div',{class:'title'},[
      el('span',{text:r.name}),
      el('div',{class:'chips'},[
        el('span',{class:'chip',text:'Mensuel'})
      ])
    ]);
    const b = el('div',{text:fmtEUR.format(r.budget)});
    const s = el('div',{text:fmtEUR.format(r.spent)});
    const remColor = r.remaining < 0 ? ' style="color: var(--violet); font-weight:700"' : '';
    const rDiv = el('div'); rDiv.innerHTML = `<span${remColor}>${fmtEUR.format(r.remaining)}</span>`;

    const kb = el('div',{style:'position:relative'});
    const btn = el('button',{class:'kebab'});
    const menu = el('div',{class:'kebab-menu'});
    const detailBtn = el('button',{text:'Afficher le détail'});
    const editBtn   = el('button',{text:'Modifier'});
    const delBtn    = el('button',{text:'Supprimer'});
    [detailBtn, editBtn, delBtn].forEach(x=> menu.appendChild(x));

    btn.addEventListener('click',(e)=>{
      e.stopPropagation();
      document.querySelectorAll('.kebab-menu').forEach(m=> m.style.display='none');
      menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
      menu.style.left = '0px';
      menu.style.top = '30px';
    });

    kb.appendChild(btn);
    kb.appendChild(menu);

    row.appendChild(title);
    row.appendChild(b);
    row.appendChild(s);
    row.appendChild(rDiv);
    row.appendChild(kb);

    const details = el('div',{class:'details',style:'display:none'});

    if(r.expenses.length===0){
      details.appendChild(el('div',{class:'details-row'},[
        el('div',{text:'—'}),
        el('div',{text:'Aucune dépense'}),
        el('div',{text:fmtEUR.format(0)}),
        el('div')
      ]));
    }else{
      r.expenses.forEach((e, idx)=>{
        details.appendChild(buildExpenseDetailRow({
          date: e.date, name: e.name, amount: e.amount,
          onEdit: ()=> openEditExpenseModal(r.id, idx),
          onDelete: ()=> openDeleteExpenseModal(r.id, idx)
        }));
      });
    }

    wrap.appendChild(row);
    wrap.appendChild(details);

    detailBtn.addEventListener('click',()=>{
      const visible = details.style.display !== 'none';
      details.style.display = visible ? 'none' : 'block';
      detailBtn.textContent = visible ? 'Afficher le détail' : 'Masquer le détail';
      menu.style.display='none';
    });

    editBtn.addEventListener('click',()=>{
      menu.style.display='none';
      openEditCategoryModal(r.id);
    });

    delBtn.addEventListener('click',()=>{
      menu.style.display='none';
      openDeleteCategoryModal(r.id);
    });
  });
}

/* Helper : ligne de dépense avec menu ⋯ */
function buildExpenseDetailRow({ date, name, amount, onEdit, onDelete }){
  const detailsRow = el('div',{class:'details-row'});

  const colDate = el('div',{text:date});
  const colName = el('div',{text:name});
  const colAmt  = el('div',{text:fmtEUR.format(amount)});
  const colMenuWrap = el('div',{style:'position:relative'});

  const expBtn = el('button',{class:'kebab'});
  const expMenu = el('div',{class:'kebab-menu'});
  const expEdit = el('button',{text:'Modifier'});
  const expDel  = el('button',{text:'Supprimer'});
  [expEdit, expDel].forEach(x=> expMenu.appendChild(x));

  expBtn.addEventListener('click',(ev)=>{
    ev.stopPropagation();
    document.querySelectorAll('.kebab-menu').forEach(m=> m.style.display='none');
    expMenu.style.display = (expMenu.style.display === 'block') ? 'none' : 'block';
    expMenu.style.left = '0px';
    expMenu.style.top = '30px';
  });

  expEdit.addEventListener('click',()=>{
    expMenu.style.display='none';
    onEdit?.();
  });
  expDel.addEventListener('click',()=>{
    expMenu.style.display='none';
    onDelete?.();
  });

  colMenuWrap.appendChild(expBtn);
  colMenuWrap.appendChild(expMenu);

  detailsRow.appendChild(colDate);
  detailsRow.appendChild(colName);
  detailsRow.appendChild(colAmt);
  detailsRow.appendChild(colMenuWrap);

  return detailsRow;
}

/* Fermer tous les menus si clic hors */
document.addEventListener('click',()=>{
  document.querySelectorAll('.kebab-menu').forEach(m=> m.style.display='none');
});

/* =========================
   Édition / Suppression cat. mensuelle
   ========================= */
function getMonthlyCategoryById(id){
  const ym = selectedYM;
  return store.months[ym]?.monthlyCategories?.[id] || null;
}
function openEditCategoryModal(catId){
  const cat = getMonthlyCategoryById(catId);
  if(!cat){ toast('Catégorie introuvable.'); return; }

  const form = el('form',{id:'editCatForm'},[
    el('h3',{text:'Modifier la catégorie'}),
    el('div',{class:'form-row'},[
      el('label',{for:'editCatName', text:'Intitulé'}),
      el('input',{id:'editCatName', type:'text', value:cat.name, required:'required'})
    ]),
    el('div',{class:'form-row'},[
      el('label',{for:'editCatBudget', text:'Budget (€)'}),
      el('input',{id:'editCatBudget', type:'number', step:'0.01', min:'0', value:cat.budget, required:'required'})
    ]),
    el('div',{class:'modal-actions'},[
      el('button',{type:'submit', class:'btn btn-primary', text:'Valider'}),
      el('button',{type:'button', class:'btn btn-ghost', text:'Annuler', id:'cancelEdit'})
    ])
  ]);

  const { close, overlay } = openModal(form);
  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const name = form.querySelector('#editCatName').value.trim();
    const budget = Number(form.querySelector('#editCatBudget').value);
    if(!name || !(budget>=0)){ toast('Veuillez renseigner correctement.'); return; }
    cat.name = name;
    cat.budget = budget;
    saveStore();
    close();
    refreshAll();
    toast('Catégorie modifiée.');
  });
  overlay.querySelector('#cancelEdit').addEventListener('click', close);
}
function openDeleteCategoryModal(catId){
  const cat = getMonthlyCategoryById(catId);
  if(!cat){ toast('Catégorie introuvable.'); return; }

  const box = el('div',{},[
    el('h3',{text:'Supprimer la catégorie'}),
    el('p',{text:`Êtes-vous sûr de vouloir supprimer « ${cat.name} » ? Cette action supprimera aussi ses dépenses.`}),
    el('div',{class:'modal-actions'},[
      el('button',{class:'btn btn-danger', text:'Valider', id:'confirmDel'}),
      el('button',{class:'btn btn-ghost', text:'Annuler', id:'cancelDel'})
    ])
  ]);

  const { close, overlay } = openModal(box);
  overlay.querySelector('#cancelDel').addEventListener('click', close);
  overlay.querySelector('#confirmDel').addEventListener('click', ()=>{
    const ym = selectedYM;
    if(store.months[ym]?.monthlyCategories?.[catId]){
      delete store.months[ym].monthlyCategories[catId];
      saveStore();
      refreshAll();
      toast('Catégorie supprimée.');
    }
    close();
  });
}

/* =========================
   Édition / Suppression dépense mensuelle
   ========================= */
function openEditExpenseModal(catId, expIndex){
  const cat = getMonthlyCategoryById(catId);
  if(!cat || !cat.expenses || !(expIndex in cat.expenses)){ toast('Dépense introuvable.'); return; }
  const exp = cat.expenses[expIndex];

  const form = el('form',{id:'editExpForm'},[
    el('h3',{text:'Modifier la dépense'}),
    el('div',{class:'form-row'},[
      el('label',{for:'editExpName', text:'Intitulé'}),
      el('input',{id:'editExpName', type:'text', value:exp.name, required:'required'})
    ]),
    el('div',{class:'form-row'},[
      el('label',{for:'editExpAmount', text:'Montant (€)'}),
      el('input',{id:'editExpAmount', type:'number', step:'0.01', min:'0', value:exp.amount, required:'required'})
    ]),
    el('div',{class:'modal-actions'},[
      el('button',{type:'submit', class:'btn btn-primary', text:'Valider'}),
      el('button',{type:'button', class:'btn btn-ghost', text:'Annuler', id:'cancelExpEdit'})
    ])
  ]);

  const { close, overlay } = openModal(form);
  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const name = form.querySelector('#editExpName').value.trim();
    const amount = Number(form.querySelector('#editExpAmount').value);
    if(!name || !(amount>=0)){ toast('Veuillez renseigner correctement.'); return; }
    exp.name = name;
    exp.amount = amount;
    saveStore();
    close();
    refreshAll();
    toast('Dépense modifiée.');
  });
  overlay.querySelector('#cancelExpEdit').addEventListener('click', close);
}
function openDeleteExpenseModal(catId, expIndex){
  const cat = getMonthlyCategoryById(catId);
  if(!cat || !cat.expenses || !(expIndex in cat.expenses)){ toast('Dépense introuvable.'); return; }
  const exp = cat.expenses[expIndex];

  const box = el('div',{},[
    el('h3',{text:'Supprimer la dépense'}),
    el('p',{text:`Confirmer la suppression de « ${exp.name} » (${fmtEUR.format(exp.amount)}) ?`}),
    el('div',{class:'modal-actions'},[
      el('button',{class:'btn btn-danger', text:'Valider', id:'confirmExpDel'}),
      el('button',{class:'btn btn-ghost', text:'Annuler', id:'cancelExpDel'})
    ])
  ]);

  const { close, overlay } = openModal(box);
  overlay.querySelector('#cancelExpDel').addEventListener('click', close);
  overlay.querySelector('#confirmExpDel').addEventListener('click', ()=>{
    cat.expenses.splice(expIndex, 1);
    saveStore();
    refreshAll();
    toast('Dépense supprimée.');
    close();
  });
}

/* =========================
   === Annual: menus ⋯ catégorie & dépenses, portée annuelle ===
   ========================= */
function getAnnualCategoryById(id){
  const y = selectedYear;
  return store.years[y]?.annualCategories?.[id] || null;
}
function openEditAnnualCategoryModal(catId){
  const cat = getAnnualCategoryById(catId);
  if(!cat){ toast('Catégorie annuelle introuvable.'); return; }

  const form = el('form',{id:'editAnnualCatForm'},[
    el('h3',{text:'Modifier la catégorie (annuel)'}),
    el('div',{class:'form-row'},[
      el('label',{for:'editAnnualCatName', text:'Intitulé'}),
      el('input',{id:'editAnnualCatName', type:'text', value:cat.name, required:'required'})
    ]),
    el('div',{class:'form-row'},[
      el('label',{for:'editAnnualCatBudget', text:'Budget (€)'}),
      el('input',{id:'editAnnualCatBudget', type:'number', step:'0.01', min:'0', value:cat.budget, required:'required'})
    ]),
    el('div',{class:'modal-actions'},[
      el('button',{type:'submit', class:'btn btn-primary', text:'Valider'}),
      el('button',{type:'button', class:'btn btn-ghost', text:'Annuler', id:'cancelAnnualEdit'})
    ])
  ]);

  const { close, overlay } = openModal(form);
  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const name = form.querySelector('#editAnnualCatName').value.trim();
    const budget = Number(form.querySelector('#editAnnualCatBudget').value);
    if(!name || !(budget>=0)){ toast('Veuillez renseigner correctement.'); return; }
    cat.name = name;
    cat.budget = budget;
    saveStore();
    close();
    refreshAll();
    toast('Catégorie annuelle modifiée (impacte toute l’année).');
  });
  overlay.querySelector('#cancelAnnualEdit').addEventListener('click', close);
}
function openDeleteAnnualCategoryModal(catId){
  const cat = getAnnualCategoryById(catId);
  if(!cat){ toast('Catégorie annuelle introuvable.'); return; }

  const box = el('div',{},[
    el('h3',{text:'Supprimer la catégorie (annuel)'}),
    el('p',{text:`Êtes-vous sûr de vouloir supprimer « ${cat.name} » ? Cette action supprimera aussi ses dépenses annuelles.`}),
    el('div',{class:'modal-actions'},[
      el('button',{class:'btn btn-danger', text:'Valider', id:'confirmAnnualDel'}),
      el('button',{class:'btn btn-ghost', text:'Annuler', id:'cancelAnnualDel'})
    ])
  ]);

  const { close, overlay } = openModal(box);
  overlay.querySelector('#cancelAnnualDel').addEventListener('click', close);
  overlay.querySelector('#confirmAnnualDel').addEventListener('click', ()=>{
    const y = selectedYear;
    if(store.years[y]?.annualCategories?.[catId]){
      delete store.years[y].annualCategories[catId];
      saveStore();
      refreshAll();
      toast('Catégorie annuelle supprimée (toute l’année).');
    }
    close();
  });
}
function openEditAnnualExpenseModal(catId, expIndex){
  const cat = getAnnualCategoryById(catId);
  if(!cat || !cat.expenses || !(expIndex in cat.expenses)){ toast('Dépense annuelle introuvable.'); return; }
  const exp = cat.expenses[expIndex];

  const form = el('form',{id:'editAnnualExpForm'},[
    el('h3',{text:'Modifier la dépense (annuel)'}),
    el('div',{class:'form-row'},[
      el('label',{for:'editAnnualExpName', text:'Intitulé'}),
      el('input',{id:'editAnnualExpName', type:'text', value:exp.name, required:'required'})
    ]),
    el('div',{class:'form-row'},[
      el('label',{for:'editAnnualExpAmount', text:'Montant (€)'}),
      el('input',{id:'editAnnualExpAmount', type:'number', step:'0.01', min:'0', value:exp.amount, required:'required'})
    ]),
    el('div',{class:'modal-actions'},[
      el('button',{type:'submit', class:'btn btn-primary', text:'Valider'}),
      el('button',{type:'button', class:'btn btn-ghost', text:'Annuler', id:'cancelAnnualExpEdit'})
    ])
  ]);

  const { close, overlay } = openModal(form);
  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const name = form.querySelector('#editAnnualExpName').value.trim();
    const amount = Number(form.querySelector('#editAnnualExpAmount').value);
    if(!name || !(amount>=0)){ toast('Veuillez renseigner correctement.'); return; }
    exp.name = name;
    exp.amount = amount;
    saveStore();
    close();
    refreshAll();
    toast('Dépense annuelle modifiée (impacte toute l’année).');
  });
  overlay.querySelector('#cancelAnnualExpEdit').addEventListener('click', close);
}
function openDeleteAnnualExpenseModal(catId, expIndex){
  const cat = getAnnualCategoryById(catId);
  if(!cat || !cat.expenses || !(expIndex in cat.expenses)){ toast('Dépense annuelle introuvable.'); return; }
  const exp = cat.expenses[expIndex];

  const box = el('div',{},[
    el('h3',{text:'Supprimer la dépense (annuel)'}),
    el('p',{text:`Confirmer la suppression de « ${exp.name} » (${fmtEUR.format(exp.amount)}) ?`}),
    el('div',{class:'modal-actions'},[
      el('button',{class:'btn btn-danger', text:'Valider', id:'confirmAnnualExpDel'}),
      el('button',{class:'btn btn-ghost', text:'Annuler', id:'cancelAnnualExpDel'})
    ])
  ]);

  const { close, overlay } = openModal(box);
  overlay.querySelector('#cancelAnnualExpDel').addEventListener('click', close);
  overlay.querySelector('#confirmAnnualExpDel').addEventListener('click', ()=>{
    cat.expenses.splice(expIndex, 1);
    saveStore();
    refreshAll();
    toast('Dépense annuelle supprimée (toute l’année).');
    close();
  });
}

/* =========================
   Rendu : cartes globales (mensuel uniquement)
   ========================= */
function renderGlobalCards(){
  const stats = globalMonthlyStats();
  const wrap = document.querySelector('#globalCards');
  wrap.innerHTML = '';

  const cards = [
    { label:'Montant global', value:fmtEUR.format(stats.budget) },
    { label:'Dépenses globales', value:fmtEUR.format(stats.spent) },
    { label:'Budget global restant', value:fmtEUR.format(stats.remaining) },
  ];

  cards.forEach(c=>{
    const card = el('div',{class:'card'},[
      el('div',{class:'label',text:c.label}),
      el('div',{class:'value',text:c.value})
    ]);
    wrap.appendChild(card);
  });
}

/* =========================
   Donut (pie via conic-gradient)
   ========================= */
function buildDonut({ budget, spent, title }){
  const donut = el('div',{class:'donut'});
  const center = el('div',{class:'center'},[
    title ? el('div',{class:'title',text:title}) : el('div',{class:'title',text:''}),
    el('div',{class:'value'})
  ]);

  if(spent > budget){
    donut.classList.add('violet');
    center.querySelector('.value').textContent = `Dépassé : ${fmtEUR.format(spent - budget)}`;
  }else{
    const angle = budget <= 0 ? 0 : Math.min(360, Math.round(360 * (spent / budget)));
    donut.style.setProperty('--angle', `${angle}deg`);
    center.querySelector('.value').textContent = `Restant : ${fmtEUR.format(budget - spent)}`;
  }

  donut.appendChild(center);
  return donut;
}

/* =========================
   Rendu : diagramme global (mensuel uniquement)
   ========================= */
function renderGlobalChart(){
  const stats = globalMonthlyStats();
  const wrap = document.querySelector('#globalChart');
  wrap.innerHTML = '';

  const titleEl = el('div',{class:'donut-title', text:'Global'});
  wrap.appendChild(titleEl);

  const donut = buildDonut({ budget: stats.budget, spent: stats.spent, title:'' });
  wrap.appendChild(donut);
}

/* =========================
   Rendu : résumé annuel (menus ⋯ + détails)
   ========================= */
function renderAnnualSummary(){
  const wrap = document.querySelector('#annualSummary');
  wrap.innerHTML = '';

  const header = el('div', { class:'summary-header' }, [
    el('div', { text:'Catégorie' }),
    el('div', { text:'Budget initial' }),
    el('div', { text:'Dépenses imputées' }),
    el('div', { text:'Budget restant' }),
    el('div', { text:'' }),
  ]);
  wrap.appendChild(header);

  const { rows } = annualStats();
  if(rows.length===0){
    wrap.appendChild(el('div',{class:'chip',text:`Aucune catégorie annuelle pour ${selectedYear}.`}));
    return;
  }

  rows.forEach(r=>{
    const row = el('div',{class:'summary-row'});
    const title = el('div',{class:'title'},[
      el('span',{text:r.name}),
      el('div',{class:'chips'},[
        el('span',{class:'chip',text:'Annuel'})
      ])
    ]);
    const b = el('div',{text:fmtEUR.format(r.budget)});
    const s = el('div',{text:fmtEUR.format(r.spent)});
    const remColor = r.remaining < 0 ? ' style="color: var(--violet); font-weight:700"' : '';
    const rDiv = el('div'); rDiv.innerHTML = `<span${remColor}>${fmtEUR.format(r.remaining)}</span>`;

    const kb = el('div',{style:'position:relative'});
    const btn = el('button',{class:'kebab'});
    const menu = el('div',{class:'kebab-menu'});
    const detailBtn = el('button',{text:'Afficher le détail'});
    const editBtn   = el('button',{text:'Modifier'});
    const delBtn    = el('button',{text:'Supprimer'});
    [detailBtn, editBtn, delBtn].forEach(x=> menu.appendChild(x));

    btn.addEventListener('click',(e)=>{
      e.stopPropagation();
      document.querySelectorAll('.kebab-menu').forEach(m=> m.style.display='none');
      menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
      menu.style.left = '0px';
      menu.style.top = '30px';
    });

    kb.appendChild(btn);
    kb.appendChild(menu);

    row.appendChild(title);
    row.appendChild(b);
    row.appendChild(s);
    row.appendChild(rDiv);
    row.appendChild(kb);

    const details = el('div',{class:'details',style:'display:none'});
    if(r.expenses.length===0){
      details.appendChild(el('div',{class:'details-row'},[
        el('div',{text:'—'}),
        el('div',{text:'Aucune dépense annuelle'}),
        el('div',{text:fmtEUR.format(0)}),
        el('div')
      ]));
    }else{
      r.expenses.forEach((e, idx)=>{
        details.appendChild(buildExpenseDetailRow({
          date: e.date, name: e.name, amount: e.amount,
          onEdit: ()=> openEditAnnualExpenseModal(r.id, idx),
          onDelete: ()=> openDeleteAnnualExpenseModal(r.id, idx)
        }));
      });
    }

    wrap.appendChild(row);
    wrap.appendChild(details);

    detailBtn.addEventListener('click',()=>{
      const visible = details.style.display !== 'none';
      details.style.display = visible ? 'none' : 'block';
      detailBtn.textContent = visible ? 'Afficher le détail' : 'Masquer le détail';
      menu.style.display='none';
    });
    editBtn.addEventListener('click',()=>{
      menu.style.display='none';
      openEditAnnualCategoryModal(r.id);
    });
    delBtn.addEventListener('click',()=>{
      menu.style.display='none';
      openDeleteAnnualCategoryModal(r.id);
    });
  });
}

/* =========================
   Rendu : mini-diagrammes mensuels
   ========================= */
function renderMonthlyMiniCharts(){
  const wrap = document.querySelector('#monthlyMiniCharts');
  wrap.innerHTML = '';
  const { rows } = monthlyStats();
  rows.forEach(r=>{
    const card = el('div',{class:'small-card'});
    card.appendChild(el('div',{class:'name',text:r.name}));
    const donut = buildDonut({ budget: r.budget, spent: r.spent, title:'' });
    card.appendChild(donut);
    wrap.appendChild(card);
  });
}

/* =========================
   Modales existantes
   ========================= */
const modalCategory = document.querySelector('#modalCategory');
const modalExpense  = document.querySelector('#modalExpense');

document.querySelector('#addCategoryBtn').addEventListener('click',()=>{
  modalCategory.classList.remove('hidden');
  document.querySelector('#catName').focus();
});
document.querySelector('#addExpenseBtn').addEventListener('click',()=>{
  modalExpense.classList.remove('hidden');

  const dateInput = document.querySelector('#expDate');
  const catSelect = document.querySelector('#expCategory');

  // Pré-remplir la date sur aujourd'hui
  dateInput.value = todayISO();

  // Peupler les catégories selon la date
  populateExpenseCategorySelect(dateInput.value);

  // Repeupler si la date change
  if(!dateInput._bound){
    dateInput.addEventListener('change', ()=>{
      populateExpenseCategorySelect(dateInput.value);
    });
    dateInput._bound = true;
  }

  // S'assure qu'on peut saisir tout de suite
  catSelect.focus();
});

document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const sel = btn.getAttribute('data-close');
    const m = document.querySelector(sel);
    if(m) m.classList.add('hidden');
  });
});

/* =========================
   Formulaires existants
   ========================= */
document.querySelector('#categoryForm').addEventListener('submit',(e)=>{
  e.preventDefault();
  const name   = document.querySelector('#catName').value.trim();
  const budget = Number(document.querySelector('#catBudget').value);
  const type   = document.querySelector('#catType').value;
  if(!name || !(budget>=0)){
    toast('Veuillez renseigner correctement la catégorie.');
    return;
  }
  addCategory({ type, name, budget });
  modalCategory.classList.add('hidden');
  document.querySelector('#categoryForm').reset();
  refreshAll();
  toast(`Catégorie ${type} créée.`);
});

/* =========================
   Sélecteur de catégorie basé sur la DATE de dépense
   ========================= */
function populateExpenseCategorySelect(dateISO){
  const sel = document.querySelector('#expCategory');
  sel.innerHTML = '';

  if(!dateISO){
    const info = document.createElement('option');
    info.value = '';
    info.textContent = 'Choisissez une date';
    sel.appendChild(info);
    sel.setAttribute('disabled','disabled');
    return;
  }

  const { y, m } = parseISODate(dateISO);
  ensurePeriod(y, m);

  const ymDate = ymKey(y,m);
  const monthlyCats = Object.values(store.months[ymDate].monthlyCategories);
  const annualCats  = Object.values(store.years[y].annualCategories);

  sel.removeAttribute('disabled');

  if(monthlyCats.length===0 && annualCats.length===0){
    const info = document.createElement('option');
    info.value = '';
    info.textContent = `Aucune catégorie pour ${monthNames[m-1]} ${y}.`;
    sel.appendChild(info);
    // On laisse actif pour que l’utilisateur puisse changer la date ou créer une catégorie
    return;
  }

  if(monthlyCats.length>0){
    const groupM = document.createElement('optgroup');
    groupM.label = `Mensuelles – ${monthNames[m-1]} ${y}`;
    monthlyCats.forEach(c=>{
      const opt = document.createElement('option');
      opt.value = `m:${ymDate}:${c.id}`; // encode mois + id
      opt.textContent = c.name;
      groupM.appendChild(opt);
    });
    sel.appendChild(groupM);
  }

  if(annualCats.length>0){
    const groupA = document.createElement('optgroup');
    groupA.label = `Annuelles – ${y}`;
    annualCats.forEach(c=>{
      const opt = document.createElement('option');
      opt.value = `a:${y}:${c.id}`; // encode année + id
      opt.textContent = c.name;
      groupA.appendChild(opt);
    });
    sel.appendChild(groupA);
  }
}

document.querySelector('#expenseForm').addEventListener('submit',(e)=>{
  e.preventDefault();
  const dateISO = document.querySelector('#expDate').value;
  const categoryKey = document.querySelector('#expCategory').value;
  const name = document.querySelector('#expName').value.trim();
  const amount = Number(document.querySelector('#expAmount').value);
  if(!dateISO || !categoryKey || !name || !(amount>=0)){
    toast('Veuillez renseigner correctement la dépense.');
    return;
  }
  addExpense({ dateISO, categoryKey, name, amount });
  modalExpense.classList.add('hidden');
  document.querySelector('#expenseForm').reset();
  refreshAll();
});

/* =========================
   Refresh global
   ========================= */
function refreshAll(){
  const globalTitle = document.querySelector('#globalCards')?.closest('.section')?.querySelector('h2');
  if(globalTitle) globalTitle.textContent = 'Budget global mensuel';

  renderMonthlySummary();
  renderGlobalCards();   // mensuel only
  renderGlobalChart();   // mensuel only
  renderAnnualSummary(); // annuel avec menus ⋯ et détails
  renderMonthlyMiniCharts();
}

/* =========================
   Bootstrap
   ========================= */
(function init(){
  ensurePeriod(selectedYear, selectedMonth);
  buildYearMonthSelects();
  refreshAll();
})();
