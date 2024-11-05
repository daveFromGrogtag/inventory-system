import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCVY94DKSY8bGHMHDLzIPxvegSmKkOObDg",
    authDomain: "inventory-apple-fix.firebaseapp.com",
    projectId: "inventory-apple-fix",
    storageBucket: "inventory-apple-fix.appspot.com",
    messagingSenderId: "913395103554",
    appId: "1:913395103554:web:04b93cd4845954bbda3adb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore();

export {auth, db}
