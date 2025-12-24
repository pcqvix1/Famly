importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyANjWULYll8KXkKaofhZf-_7UdPQjp7Tf0",
    authDomain: "famly-8f61d.firebaseapp.com",
    projectId: "famly-8f61d",
    storageBucket: "famly-8f61d.firebasestorage.app",
    messagingSenderId: "977105798054",
    appId: "1:977105798054:web:31f6e74b18d6670b9cc567",
    measurementId: "G-0HHXK30GW8"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('Mensagem recebida em background:', payload);
    
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon.png',
        badge: '/badge.png',
        tag: payload.data.chatId,
        data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const chatId = event.notification.data.chatId;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (let client of clientList) {
                    if (client.url.includes('chat.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(`/chat.html?chatId=${chatId}`);
                }
            })
    );
});
