importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

// Same values as firebaseConfig in index.html
firebase.initializeApp({
  apiKey: "AIzaSyDpXGqaD1E5rYza47taMp7MoGhoDq7Sb9Q",
  authDomain: "task-tracker-fd535.firebaseapp.com",
  projectId: "task-tracker-fd535",
  storageBucket: "task-tracker-fd535.firebasestorage.app",
  messagingSenderId: "596367601178",
  appId: "1:596367601178:web:27692ab5c2d6b7a156eba3"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Task reminder";
  const options = {
    body: payload.notification?.body || "",
    icon: "icon.png"
  };
  self.registration.showNotification(title, options);
});
