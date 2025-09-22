// Copia tu configuración de Firebase aquí:
/*
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
*/
if (typeof firebaseConfig === 'undefined') {
  console.warn('⚠️ Falta firebaseConfig en firebase-config.js');
}
// Inicializa Firebase
const app = firebase.initializeApp(typeof firebaseConfig !== 'undefined' ? firebaseConfig : {});
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
