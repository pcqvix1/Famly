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
    
    const title = payload.notification?.title || payload.data?.title || 'Nova mensagem';
    const body = payload.notification?.body || payload.data?.body || '';
    const chatId = payload.data?.chatId;

    const notificationOptions = {
        body,
        icon: '/icon.png',
        badge: '/badge.png',
        tag: chatId,
        data: payload.data,
        requireInteraction: false,
        renotify: true,
        vibrate: [150, 80, 150],
        actions: chatId ? [{ action: 'open_chat', title: 'Abrir chat' }] : undefined
    };

    return self.registration.showNotification(title, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const chatId = event.notification.data.chatId;
    const targetUrl = new URL('/chat.html', self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Tenta focar em uma janela já aberta
                for (const client of clientList) {
                    if (client.url.startsWith(targetUrl) && 'focus' in client) {
                        client.postMessage({ type: 'navigate', chatId: chatId });
                        return client.focus();
                    }
                }
                // Se não houver janela aberta, abre uma nova
                if (clients.openWindow) {
                    // Passa o chatId via um parâmetro que o app.js pode ler
                    return clients.openWindow(`/chat.html#${chatId}`);
                }
            })
    );
});
