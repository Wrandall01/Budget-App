/* ====== Configuration ====== */
const USE_FIREBASE = true; // mets à false pour rester 100% localStorage

/* ====== Utils (format / dates) ====== */
const fmtEUR = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2});
const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const pad2 = n=> String(n).padStart(2,'0');
const clamp=(n,min,max)=> Math.min(max,Math.max(min,n));
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`};
const parseISODate=iso=>{const [y,m,d]=iso.split('-').map(v=>parseInt(v,10));return {y,m,d}};
const ymKey=(y,m)=> `${y}-${pad2(m)}`;

/* ====== Storage (local + Firestore) ====== */
const LS_KEY='budgetTracker_v1';
let store={months:{},years:{}};
let selectedYear, selectedMonth, selectedYM;
let unsubscribe = null;

function loadLocal(){
  try{
    const raw=localStorage.getItem(LS_KEY);
    if(!raw) return {months:{},years:{}};
    const data=JSON.parse(raw);
    if(!data.months) data.months={};
    if(!data.years) data.years={};
    return data;
  }catch(e){
    return {months:{},years:{}};
  }
}
function saveLocal(){ localStorage.setItem(LS_KEY, JSON.stringify(store)); }

/* ====== Période : RESTAURATION INTELLIGENTE ====== */
function setInitialMonthYear(){
  const savedYear  = localStorage.getItem("selectedYear");
  const savedMonth = localStorage.getItem("selectedMonth");

  if (savedYear && savedMonth) {
    selectedYear  = parseInt(savedYear,10);
    selectedMonth = parseInt(savedMonth,10);
  } else {
    const now = new Date();
    selectedYear  = now.getFullYear();
    selectedMonth = now.getMonth() + 1;
  }
  selectedYM = ymKey(selectedYear, selectedMonth);
}

function ensurePeriod(y,m){
  const ym = ymKey(y,m);
  if(!store.months[ym]) store.months[ym]={monthlyCategories:{}};
  if(!store.years[y]) store.years[y]={annualCategories:{}};

  // 🔐 sauvegarde navigation
  localStorage.setItem("selectedYear", y);
  localStorage.setItem("selectedMonth", m);
}

/* ====== Sélecteurs ====== */
const periodPicker=document.querySelector('.period-picker');
const monthSelect=document.querySelector('#periodSelect');
let yearSelect;

function buildYearMonthSelects(){
  if(!document.querySelector('#yearSelect')){
    yearSelect=document.createElement('select');
    yearSelect.id='yearSelect';
    periodPicker.insertBefore(yearSelect, monthSelect);
  } else {
    yearSelect=document.querySelector('#yearSelect');
  }

  yearSelect.innerHTML='';
  for(let y=2026;y<=2100;y++){
    const o=document.createElement('option');
    o.value=y;
    o.textContent=y;
    yearSelect.appendChild(o);
  }
  yearSelect.value=selectedYear;

  monthSelect.innerHTML='';
  for(let m=1;m<=12;m++){
    const o=document.createElement('option');
    o.value=m;
    o.textContent=monthNames[m-1];
    monthSelect.appendChild(o);
  }
  monthSelect.value=selectedMonth;

  if(!yearSelect._bound){
    yearSelect.addEventListener('change',()=>{
      selectedYear=clamp(parseInt(yearSelect.value,10),2026,2100);
      selectedYM=ymKey(selectedYear,selectedMonth);
      ensurePeriod(selectedYear,selectedMonth);
      refreshAll();
    });
    yearSelect._bound=true;
  }

  if(!monthSelect._bound){
    monthSelect.addEventListener('change',()=>{
      selectedMonth=clamp(parseInt(monthSelect.value,10),1,12);
      selectedYM=ymKey(selectedYear,selectedMonth);
      ensurePeriod(selectedYear,selectedMonth);
      refreshAll();
    });
    monthSelect._bound=true;
  }
}

/* ====== Refresh global ====== */
function refreshAll(){
  renderMonthlySummary();
  renderGlobalCards();
  renderGlobalChart();
  renderAnnualSummary();
  renderMonthlyMiniCharts();
  updateAuthStatus();
}

/* ====== Firebase binding ====== */
async function bindStore(){
  if(!USE_FIREBASE || !window._fb || !window._fb.db || !window._fb.auth?.currentUser){ return; }
  const { db, doc, onSnapshot } = window._fb;
  const ref = doc(db,'budgets',window._fb.auth.currentUser.uid);
  if(unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(ref,(snap)=>{
    if(snap.exists()){
      const data = snap.data();
      store = { months: data.months||{}, years: data.years||{} };
    } else {
      store = { months:{}, years:{} };
    }
    setInitialMonthYear();
    ensurePeriod(selectedYear,selectedMonth);
    saveLocal();
    refreshAll();
  });
}

/* ====== Bootstrap ====== */
(function init(){
  store = loadLocal();
  setInitialMonthYear();
  ensurePeriod(selectedYear, selectedMonth);
  buildYearMonthSelects();
  refreshAll();
})();
