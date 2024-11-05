// AUTHENTICATION - - - -
import {auth} from "./init.js"
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"; 


const signOutButton = document.getElementById('signOutBtn')
const emailSignInButton = document.getElementById('emailSignIn')
const signInButton = document.getElementById('googleSignInBtn')

signInButton.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
    .then((result) => {
        const user = result.user;
        console.log(user);
        // Redirect or handle signed-in user
        location.reload();
    })
    .catch((error) => {
        const errorMessage = error.message;
        console.error(errorMessage);
    });
});


signOutButton.addEventListener('click', () => {
    signOut(auth)
    .then(() => {
    // Sign-out successful.
    console.log('User signed out');
    location.reload();
    // Redirect or update UI as needed after sign-out
    })
    .catch((error) => {
    // An error happened.
    console.error('Sign Out Error', error);
    });
})



onAuthStateChanged(auth, (user) => {
    if (user) {
    // User is signed in
    signInButton.style.display = 'none'; // Hide sign-in button
    emailSignInButton.style.display = 'none';
    signOutButton.style.display = 'block'; // Show sign-out button
    } else {
    // User is signed out
    signInButton.style.display = 'block'; // Show sign-in button
    emailSignInButton.style.display = 'block';
    signOutButton.style.display = 'none'; // Hide sign-out button
    }
});