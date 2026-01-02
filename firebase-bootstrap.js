
// firebase-bootstrap.js
const firebaseConfig = {
  apiKey: "AIzaSyAuEDYAueA4mNTDahmJgyESeQPR-0NxvR0",
  authDomain: "budget-app-febce.firebaseapp.com",
  projectId: "budget-app-febce",
  storageBucket: "budget-app-febce.appspot.com", // corrigé
  messagingSenderId: "45135884864",
  appId: "1:45135884864:web:e92bec700bec7935fea5a5",
  measurementId: "G-4MB5T3CZ4L"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ✅ Persistance locale (reste connecté après fermeture navigateur)
await setPersistence(auth, browserLocalPersistence);

// (Optionnel) Analytics
let analytics;
try { analytics = getAnalytics(app); } catch { /* ignore en local */ }

// Expose API pour script.js
window._fb = {
  app,
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,

  db: getFirestore(app),
  doc,
  onSnapshot,
  setDoc,

  analytics
};
