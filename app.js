const firebaseConfig = {
    apiKey: "AIzaSyANjWULYll8KXkKaofhZf-_7UdPQjp7Tf0",
    authDomain: "famly-8f61d.firebaseapp.com",
    projectId: "famly-8f61d",
    storageBucket: "famly-8f61d.firebasestorage.app",
    messagingSenderId: "977105798054",
    appId: "1:977105798054:web:31f6e74b18d6670b9cc567",
    measurementId: "G-0HHXK30GW8"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ========================================
// NOVA LÓGICA HÍBRIDA DE NOTIFICAÇÕES
// ========================================

const DEVICE_ID_KEY = 'famly_device_id';

function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) || `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

async function saveDeviceToken(user, token, platform) {
    if (!token || !user?.email) return;
    const deviceId = getDeviceId();
    const payload = {
        token,
        platform,
        deviceId,
        userAgent: navigator.userAgent,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Salva por dispositivo (permite múltiplos tokens por usuário)
    await db.collection('users')
        .doc(user.email)
        .collection('devices')
        .doc(deviceId)
        .set(payload, { merge: true });

    // Mantém campos de compatibilidade e lista de tokens
    await db.collection('users').doc(user.email).set({
        fcmToken: token, // último token usado
        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token)
    }, { merge: true });
}

/**
 * Sincroniza o token de notificação com o Firestore dependendo da plataforma.
 * @param {Object} user - Objeto do usuário autenticado.
 */
async function syncNotificationToken(user) {

    if (!user) return;

    // Se for app nativo, inicia o processo de registro de notificação.
    if (window.isCapacitor) {
        // Adiciona um listener que só executa UMA VEZ para pegar o token.
        window.addEventListener('native-token-ready', async (event) => {
            const token = event.detail.token;
            if (token) {
                await saveDeviceToken(user, token, 'native');
                console.log('Token Nativo sincronizado para:', user.email);
            }
        }, { once: true });

        // Chama a função em capacitor-setup.js para iniciar o registro.
        if (window.initNativeNotifications) {

            window.initNativeNotifications();
        }
    }
    // Se for web, usa o método tradicional.
    else if ('Notification' in window) {
        try {
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }
            if (Notification.permission === 'granted') {
                const messaging = firebase.messaging();

                // 1. Get current browser token (might be old or shared)
                let token = await messaging.getToken({
                    vapidKey: 'BEQytQ4RClE8O3WQAUJ_gafF95L2rA-1vSAOyvkLu-8Id8M0hlEMHVyvg7_frwKdT5XTm0a94J1wKLznEtfk4CQ'
                });

                if (token) {
                    // 2. FIRESTORE OWNERSHIP CHECK
                    // We check who owns this token in our dedicated map
                    const tokenDocRef = db.collection('fcm_tokens_map').doc(token);
                    const tokenDoc = await tokenDocRef.get();

                    let mustRotate = false;

                    if (tokenDoc.exists) {
                        const ownerEmail = tokenDoc.data().userId;
                        if (ownerEmail && ownerEmail !== user.email) {
                            console.log(`[FCM] Token pertence a outro usuário (${ownerEmail}). Rotacionando...`);
                            mustRotate = true;
                        }
                    }

                    // 3. Conflict Resolution
                    if (mustRotate) {
                        try {
                            await messaging.deleteToken();
                            // Force get new token
                            token = await messaging.getToken({
                                vapidKey: 'BEQytQ4RClE8O3WQAUJ_gafF95L2rA-1vSAOyvkLu-8Id8M0hlEMHVyvg7_frwKdT5XTm0a94J1wKLznEtfk4CQ'
                            });
                        } catch (e) {
                            console.warn('[FCM] Error rotating token:', e);
                        }
                    }

                    // 4. Register/Update Ownership (Set "Forever" for this user)
                    if (token) {
                        // Write to specialized map
                        await db.collection('fcm_tokens_map').doc(token).set({
                            userId: user.email,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });

                        // Write to user profile
                        await saveDeviceToken(user, token, 'web');
                    }
                }

                // Listener for refresh
                // Listener for refresh
                messaging.onTokenRefresh(async () => {
                    // ... existing logic ...
                });
            }
        } catch (e) {
            console.log('Erro Web Notify:', e);
        }
    }
}

/**
 * Registra o Service Worker (CRITICAL FOR NOTIFICATIONS)
 * CORREÇÃO: Agora funciona tanto na Web quanto no Capacitor (Android/iOS)
 */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./firebase-messaging-sw.js')
        .then((registration) => {
            console.log('[SW] Service Worker registrado com sucesso:', registration.scope);
        })
        .catch((err) => {
            console.error('[SW] Falha ao registrar Service Worker:', err);
        });
}

/**
 * Mostra notificações em primeiro plano (web) e garante navegação.
 */
function initWebForegroundNotifications() {
    if (!('Notification' in window)) return;

    // Check permission state
    if (Notification.permission === 'denied') {
        console.warn('Permissão de notificação negada pelo usuário.');
        return;
    }

    const messaging = firebase.messaging();
    messaging.onMessage((payload) => {
        // ... existing logic ...
        const chatId = payload.data?.chatId;
        const title = payload.notification?.title || 'Nova mensagem';
        const body = payload.notification?.body || '';

        // Tenta notificação nativa; se falhar, cai para toast
        if (Notification.permission === 'granted') {
            const n = new Notification(title, {
                body,
                tag: chatId,
                data: { chatId },
                icon: '/icon.png',
                badge: '/badge.png'
            });
            n.onclick = () => {
                window.focus();
                openChatById(chatId);
                n.close();
            };
        } else {
            showToast(`${title}: ${body}`);
        }
    });
}

/**
 * Abre uma conversa por ID (chat ou grupo) quando possível.
 */
function openChatById(chatId) {
    if (!chatId) return;
    const chatEl = document.querySelector(`.conversation-item[data-id="${chatId}"]`);
    if (chatEl) {
        chatEl.click();
    } else {
        // Se ainda não carregou a lista, aguarda evento e tenta de novo
        const retry = () => {
            const el = document.querySelector(`.conversation-item[data-id="${chatId}"]`);
            if (el) {
                el.click();
                window.removeEventListener('conversations-loaded', retry);
            }
        };
        window.addEventListener('conversations-loaded', retry);
    }
}

const CLOUDINARY_CLOUD_NAME = "dqn28emva";
const CLOUDINARY_UPLOAD_PRESET = "famly_chat";

function getResourceType(fileType) {
    if (fileType.includes('image')) return 'image';
    if (fileType.includes('video')) return 'video';
    if (fileType.includes('audio')) return 'video';
    return 'raw';
}

const sidebar = document.getElementById('sidebar');
const chatMain = document.getElementById('chat-main');
const welcomeScreen = document.getElementById('welcome-screen');
const chatContainer = document.getElementById('chat-container');
const conversationList = document.getElementById('conversation-list');
const chatMessages = document.getElementById('chat-messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const fileUpload = document.getElementById('file-upload');
const btnRecord = document.getElementById('btn-record');
const btnSend = document.getElementById('btn-send');
const btnBack = document.getElementById('btn-back');
const btnMenu = document.getElementById('btn-menu');
const mainMenu = document.getElementById('main-menu');
const btnChatMenu = document.getElementById('btn-chat-menu');
const chatMenu = document.getElementById('chat-menu');
const settingsPanel = document.getElementById('settings-panel');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const chatName = document.getElementById('chat-name');
const chatStatus = document.getElementById('chat-status');
const chatAvatar = document.getElementById('chat-avatar');
const onlineIndicator = document.getElementById('online-indicator');
const attachmentPreview = document.getElementById('attachment-preview');
const replyPreview = document.getElementById('reply-preview');
const searchInput = document.getElementById('search-input');
// FIX: Correct ID for theme switch (is a div item)
const themeSwitch = document.getElementById('menu-theme');

const modalMessageOptions = document.getElementById('modal-message-options');
const modalContactInfo = document.getElementById('modal-contact-info');
const modalMedia = document.getElementById('modal-media');
const modalProfileEdit = document.getElementById('modal-profile-edit');
const modalNotifications = document.getElementById('modal-notifications');
const modalPrivacy = document.getElementById('modal-privacy');
const modalEditMessage = document.getElementById('modal-edit-message');

let currentUser = null;
let currentChatId = null;
let currentChatPartnerEmail = null;
let currentChatType = null;
let unsubscribeFromMessages = null;
let unsubscribeFromPresence = null;
let mediaRecorder = null;
let audioChunks = [];
let attachmentFile = null;
let attachmentType = null;
let selectedMessageDocRef = null;
let selectedMessageText = "";
let replyToMessage = null;
let selectedMessageData = null;
let presenceInterval = null;
let presenceHooksInitialized = false;
let pendingHeaderPresence = null;
const HEARTBEAT_INTERVAL = 10000; // 10s
const ONLINE_THRESHOLD = 15000;   // 15s (tolerância para latência)

// FIX: Global vars for audio and muted chats
let audioStream = null;
let mutedChats = {};

function saveMutedChats() {
    localStorage.setItem('mutedChats', JSON.stringify(mutedChats));
}

function isCurrentChatMuted() {
    return !!mutedChats[currentChatId];
}

function updateChatMenuMuteLabel() {
    const chatMenuMute = document.getElementById('chat-menu-mute');
    if (!chatMenuMute || !currentChatId) return;

    // Ensure mutedChats is populated if empty (lazy load)
    if (Object.keys(mutedChats).length === 0) {
        try {
            const stored = localStorage.getItem('mutedChats');
            if (stored) mutedChats = JSON.parse(stored);
        } catch (e) { }
    }

    const isMuted = !!mutedChats[currentChatId];
    // This ID might need to be verified in HTML, assuming chat-menu-mute exists
    // If not, we skip.
}


function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    // Removed legacy .checked logic as themeSwitch is now a Div
    updateThemeIcon();
}

function updateThemeIcon() {
    const themeItem = document.getElementById('menu-theme');
    if (!themeItem) return;
    const icon = themeItem.querySelector('i');
    const text = themeItem.querySelector('span');
    if (icon && text) {
        if (document.body.getAttribute('data-theme') === 'dark') {
            icon.className = 'bi bi-sun-fill';
            text.textContent = 'Modo claro';
        } else {
            icon.className = 'bi bi-moon-fill';
            text.textContent = 'Modo escuro';
        }
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    if (!toast || !toastMessage) return;

    const icon = toast.querySelector('i');
    toastMessage.textContent = message;
    toast.className = 'toast ' + type;
    if (icon) icon.className = type === 'success' ? 'bi bi-check-circle-fill' : 'bi bi-exclamation-circle-fill';

    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
}

function getChatId(email1, email2) {
    return [email1, email2].sort().join('_');
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================================
// FORMATAÇÃO INTELIGENTE DE STATUS
// ============================================================================

/**
 * Retorna o estado real de presença baseado no timestamp.
 * @param {Object} userData - Dados do usuário do Firestore
 * @returns {Object} { isOnline: boolean, label: string }
 */
function getPresenceState(userData) {
    if (!userData || !userData.lastSeen) {
        return { isOnline: false, label: 'visto por último: desconhecido' };
    }

    const lastSeenDate = userData.lastSeen.toDate ? userData.lastSeen.toDate() : new Date(userData.lastSeen);
    const now = new Date();
    const diff = now - lastSeenDate;

    // 1. Se o usuário marcou explicitamente que saiu (isOnline: false), respeitamos imediatamente
    if (userData.isOnline === false) {
        return { isOnline: false, label: formatSmartDate(lastSeenDate) };
    }

    // 2. Se isOnline é true (ou undefined), verificamos se o heartbeat é recente (timeout)
    // Isso previne que o status fique preso em 'online' se o app fechar abruptamente
    const isOnline = diff < ONLINE_THRESHOLD;

    if (isOnline) {
        return { isOnline: true, label: 'online' };
    }

    // Formatação "WhatsApp style" para offline
    return { isOnline: false, label: formatSmartDate(lastSeenDate) };
}

function formatSmartDate(date) {
    const now = new Date();
    const isToday = date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

    // Ontem?
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();

    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (isToday) {
        return `visto hoje às ${timeStr}`;
    }

    if (isYesterday) {
        return `visto ontem às ${timeStr}`;
    }

    // Data completa
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `visto em ${dateStr}`;
}

// Wrapper legado apenas para manter compatibilidade se algo ainda chamar diretamente
function formatLastSeen(timestamp) {
    // Não usado mais na nova lógica, mas mantido para evitar crash
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatSmartDate(date);
}


function toggleMobileView(showChat) {
    if (window.innerWidth <= 768 && sidebar && chatMain) {
        if (showChat) {
            sidebar.classList.add('hidden');
            chatMain.classList.remove('hidden');
        } else {
            sidebar.classList.remove('hidden');
            chatMain.classList.add('hidden');
        }
    }
}

// ============================================================================
// SISTEMA DE PRESENÇA (HEARTBEAT) - WHATSAPP STYLE
// ============================================================================

function updatePresenceHeartbeat() {
    if (!currentUser) return;

    // Atualiza apenas o timestamp ('lastSeen'). 
    // O status 'online' será derivado dinamicamente por quem lê (diff < threshold).
    db.collection('users').doc(currentUser.email).update({
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        // Mantemos isOnline como legacy/backup, mas a verdade será o timestamp
        isOnline: true
    }).catch(err => console.error("Erro no heartbeat:", err));
}

function setOfflineStatus() {
    if (!currentUser) return;
    // Tenta marcar explicitamente como offline ao fechar
    // Isso ajuda a atualizar a UI mais rápido, mas não é a única fonte da verdade.
    const batch = db.batch();
    const userRef = db.collection('users').doc(currentUser.email);

    batch.update(userRef, {
        isOnline: false,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.commit().catch(() => { });
}

function startPresenceTracking() {
    if (!currentUser) return;

    // 1. Envia heartbeat imediato
    updatePresenceHeartbeat();

    // 2. Limpa anterior se houver
    if (presenceInterval) clearInterval(presenceInterval);

    // 3. Configura loop de 10s
    presenceInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            updatePresenceHeartbeat();
        }
    }, HEARTBEAT_INTERVAL);
}

function stopPresenceTracking() {
    if (presenceInterval) clearInterval(presenceInterval);
    presenceInterval = null;
    setOfflineStatus();
}

function initPresenceHooks() {
    if (presenceHooksInitialized) return;
    presenceHooksInitialized = true;

    // Web visibility
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            startPresenceTracking();
        } else {
            // Em mobile/background, podemos querer parar o heartbeat para economizar recursos
            // ou mantê-lo se o SO permitir. Por segurança, paramos o intervalo agressivo.
            if (presenceInterval) clearInterval(presenceInterval);
            // Tenta avisar que saiu
            setOfflineStatus();
        }
    });

    // Unload / Fechar aba
    window.addEventListener('beforeunload', () => {
        setOfflineStatus();
    });

    // Capacitor / Mobile Lifecycle
    if (window.isCapacitor && window.Capacitor && Capacitor.Plugins?.App) {
        Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
                startPresenceTracking();
            } else {
                stopPresenceTracking();
            }
        });
    }
}


function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
    if (mainMenu) mainMenu.classList.remove('show');
    if (chatMenu) chatMenu.classList.remove('show');
    if (settingsPanel) settingsPanel.classList.remove('show');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Inicializa hooks de presença uma única vez
initPresenceHooks();

// AUTH LISTENER (ATUALIZADO)
// ========================================
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        stopPresenceTracking();
        if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
            window.location.href = 'index.html';
        }
        return;
    }

    if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
        window.location.href = 'chat.html';
        return;
    }

    currentUser = user;

    const userDoc = await db.collection('users').doc(currentUser.email).get();
    let userData = userDoc.data();

    if (!userDoc.exists) {
        userData = {
            name: currentUser.displayName || currentUser.email.split('@')[0],
            email: currentUser.email,
            photoURL: null,
            status: "Olá! Estou usando o FamlyChat",
            contacts: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            isOnline: true
        };
        await db.collection('users').doc(currentUser.email).set(userData);
    }

    startPresenceTracking();

    // Inicia configuração de notificações (Nova Função)
    syncNotificationToken(user);

    // Inicializa notificações em primeiro plano (web) e listener nativo
    initWebForegroundNotifications();
    window.addEventListener('push-received', (event) => {
        const data = event.detail?.data || {};
        const chatId = data.chatId;
        const title = event.detail?.title || 'Nova mensagem';
        const body = event.detail?.body || '';

        // Mostra toast rápido em app nativo
        showToast(`${title}: ${body}`);

        // Se já está na conversa, nada a fazer; senão, tenta abrir
        if (chatId) {
            openChatById(chatId);
        }
    });

    // Nova lógica para lidar com cliques em notificações
    function handleNotificationRedirect() {
        const chatIdFromHash = window.location.hash.substring(1);
        if (chatIdFromHash) {
            setTimeout(() => {
                const chatEl = document.querySelector(`.conversation-item[data-id="${chatIdFromHash}"]`);
                if (chatEl) {
                    chatEl.click();
                    // Limpa o hash para não interferir na navegação
                    history.replaceState(null, null, ' ');
                }
            }, 1500);
        }
    }

    // Lidar com clique quando o app já está aberto
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'navigate') {
            const chatEl = document.querySelector(`.conversation-item[data-id="${event.data.chatId}"]`);
            if (chatEl) chatEl.click();
        }
    });

    // Chama a função para verificar o hash da URL
    handleNotificationRedirect();

    if (userName) userName.textContent = userData.name || currentUser.displayName || 'Usuário';

    if (userAvatar) {
        if (userData.photoURL) {
            userAvatar.innerHTML = `<img src="${userData.photoURL}" alt="Avatar">`;
        } else {
            userAvatar.innerHTML = getInitials(userData.name || currentUser.displayName);
        }
    }

    const settingsName = document.getElementById('settings-name');
    const settingsEmail = document.getElementById('settings-email');
    const settingsAvatar = document.getElementById('settings-avatar');

    if (settingsName) settingsName.textContent = userData.name || currentUser.displayName;
    if (settingsEmail) settingsEmail.textContent = userData.email || currentUser.email;
    if (settingsAvatar) settingsAvatar.innerHTML = userData.photoURL
        ? `<img src="${userData.photoURL}" alt="Avatar">`
        : getInitials(userData.name || currentUser.displayName);

    loadConversations();
    initTheme();
    updateChatMenuMuteLabel();

    window.addEventListener('beforeunload', () => stopPresenceTracking());
    window.addEventListener('offline', () => stopPresenceTracking());
    window.addEventListener('online', () => startPresenceTracking());
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // pausa o refresh sem marcar offline para não oscilar status
            if (presenceInterval) clearInterval(presenceInterval);
        } else {
            startPresenceTracking();
        }
    });
});

let contactPresenceListeners = [];

async function loadConversations() {
    if (!conversationList) return;
    conversationList.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Carregando...</p></div>';

    contactPresenceListeners.forEach(unsub => unsub());
    contactPresenceListeners = [];

    db.collection('users').doc(currentUser.email).onSnapshot(async (doc) => {
        const userData = doc.data();
        const contacts = userData?.contacts || [];

        contactPresenceListeners.forEach(unsub => unsub());
        contactPresenceListeners = [];

        const groupsSnapshot = await db.collection('groups')
            .where('members', 'array-contains', currentUser.email)
            .get();

        const groups = [];
        groupsSnapshot.forEach((doc) => {
            groups.push({ id: doc.id, ...doc.data() });
        });

        const now = new Date();
        const seenIds = new Set();

        function renderConversationList(contactsData) {
            // Remove estado de carregamento, se ainda existir
            const loadingEl = conversationList.querySelector('.loading-state');
            if (loadingEl) loadingEl.remove();

            // Atualiza/insere contatos
            for (const contact of contactsData) {
                const chatId = getChatId(currentUser.email, contact.email);
                const initials = getInitials(contact.name);

                // USANDO A NOVA LÓGICA CENTRALIZADA
                const presence = getPresenceState(contact);
                const isReallyOnline = presence.isOnline;
                const statusLabel = presence.isOnline ? 'Online' : presence.label;

                let item = conversationList.querySelector(`.conversation-item[data-id="${chatId}"]`);
                if (!item) {
                    item = document.createElement('div');
                    item.className = 'conversation-item';
                    item.dataset.email = contact.email;
                    item.dataset.name = contact.name;
                    item.dataset.type = 'chat';
                    item.dataset.id = chatId;
                    item.innerHTML = `
                        <div class="avatar-wrapper">
                            <div class="avatar">${contact.photoURL ? `<img src="${contact.photoURL}">` : initials}</div>
                            ${isReallyOnline ? '<div class="online-indicator"></div>' : ''}
                        </div>
                        <div class="conversation-info">
                            <div class="conversation-name">${contact.name}</div>
                            <div class="conversation-preview">${statusLabel}</div>
                        </div>
                    `;
                    conversationList.appendChild(item);
                    item.addEventListener('click', () => {
                        document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        startChat(contact.email, contact.name);
                    });
                } else {
                    const onlineDot = item.querySelector('.online-indicator');
                    if (onlineDot) onlineDot.remove();
                    const avatarWrapper = item.querySelector('.avatar-wrapper');
                    if (isReallyOnline && avatarWrapper) {
                        const dot = document.createElement('div');
                        dot.className = 'online-indicator';
                        avatarWrapper.appendChild(dot);
                    }
                    const nameEl = item.querySelector('.conversation-name');
                    const prevEl = item.querySelector('.conversation-preview');
                    if (nameEl) nameEl.textContent = contact.name;
                    if (prevEl) prevEl.textContent = statusLabel;
                }
                seenIds.add(chatId);
            }

            // Atualiza/insere grupos
            for (const group of groups) {
                const groupId = group.id;
                const initials = getInitials(group.name);
                let item = conversationList.querySelector(`.conversation-item[data-id="${groupId}"]`);
                if (!item) {
                    item = document.createElement('div');
                    item.className = 'conversation-item';
                    item.dataset.name = group.name;
                    item.dataset.type = 'group';
                    item.dataset.id = groupId;
                    item.innerHTML = `
                        <div class="avatar group-avatar">${initials}</div>
                        <div class="conversation-info">
                            <div class="conversation-name">
                                ${group.name}
                                <span class="badge">Grupo</span>
                            </div>
                            <div class="conversation-preview">${group.members.length} membros</div>
                        </div>
                    `;
                    conversationList.appendChild(item);
                    item.addEventListener('click', () => {
                        document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        startGroupChat(groupId, group.name);
                    });
                } else {
                    const nameEl = item.querySelector('.conversation-name');
                    const prevEl = item.querySelector('.conversation-preview');
                    if (nameEl) nameEl.firstChild.textContent = `\n                                ${group.name}\n                                `;
                    if (prevEl) prevEl.textContent = `${group.members.length} membros`;
                }
                seenIds.add(groupId);
            }

            // Remove conversas que não estão mais na lista
            conversationList.querySelectorAll('.conversation-item').forEach(item => {
                if (!seenIds.has(item.dataset.id)) {
                    item.remove();
                }
            });

            if (seenIds.size === 0) {
                conversationList.innerHTML = `
                    <div class="empty-state">
                        <i class="bi bi-chat-dots"></i>
                        <h3>Nenhuma conversa</h3>
                        <p>Adicione contatos ou crie um grupo para começar a conversar</p>
                    </div>
                `;
            }
        }

        const contactsData = [];

        if (contacts.length === 0 && groups.length === 0) {
            renderConversationList([]);
            return;
        }

        if (contacts.length === 0) {
            renderConversationList([]);
            return;
        }

        for (const contactEmail of contacts) {
            const unsub = db.collection('users').doc(contactEmail).onSnapshot((contactDoc) => {
                if (contactDoc.exists) {
                    const contact = contactDoc.data();
                    const existingIndex = contactsData.findIndex(c => c.email === contactEmail);
                    if (existingIndex >= 0) {
                        contactsData[existingIndex] = contact;
                    } else {
                        contactsData.push(contact);
                    }
                    renderConversationList(contactsData);
                }
            }, (e) => {
                console.error('Error loading contact:', e);
            });
            contactPresenceListeners.push(unsub);
        }
    });
}

function attachConversationListeners() {
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            const name = item.dataset.name;
            const id = item.dataset.id;
            const email = item.dataset.email;

            document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            if (type === 'chat') {
                startChat(email, name);
            } else {
                startGroupChat(id, name);
            }
        });
    });
}

async function startChat(partnerEmail, partnerName) {
    if (unsubscribeFromMessages) unsubscribeFromMessages();
    if (unsubscribeFromPresence) unsubscribeFromPresence();

    currentChatPartnerEmail = partnerEmail;
    currentChatId = getChatId(currentUser.email, partnerEmail);
    currentChatType = 'chat';

    chatName.textContent = partnerName;

    const contactDoc = await db.collection('users').doc(partnerEmail).get();
    const contact = contactDoc.data();

    if (contact?.photoURL) {
        chatAvatar.innerHTML = `<img src="${contact.photoURL}">`;
    } else {
        chatAvatar.innerHTML = getInitials(partnerName);
    }

    unsubscribeFromPresence = db.collection('users').doc(partnerEmail).onSnapshot((doc) => {
        const data = doc.data();

        // USANDO A MESMA LÓGICA DO LIST LIST
        const presence = getPresenceState(data);

        if (presence.isOnline) {
            chatStatus.textContent = 'online';
            chatStatus.classList.add('online');
            onlineIndicator.style.display = 'block';
        } else {
            chatStatus.textContent = presence.label;
            chatStatus.classList.remove('online');
            onlineIndicator.style.display = 'none';
        }
    });

    welcomeScreen.style.display = 'none';
    chatContainer.style.display = 'flex';
    chatContainer.style.flexDirection = 'column';
    chatContainer.style.height = '100%';

    toggleMobileView(true);
    loadMessages('chats');
    clearAttachmentPreview();
    updateChatMenuMuteLabel();
}

async function startGroupChat(groupId, groupName) {
    if (unsubscribeFromMessages) unsubscribeFromMessages();
    if (unsubscribeFromPresence) unsubscribeFromPresence();

    currentChatPartnerEmail = null;
    currentChatId = groupId;
    currentChatType = 'group';

    chatName.textContent = groupName;
    chatAvatar.innerHTML = getInitials(groupName);
    chatAvatar.classList.add('group-avatar');
    chatStatus.textContent = 'Grupo';
    chatStatus.classList.remove('online');
    onlineIndicator.style.display = 'none';

    welcomeScreen.style.display = 'none';
    chatContainer.style.display = 'flex';
    chatContainer.style.flexDirection = 'column';
    chatContainer.style.height = '100%';

    toggleMobileView(true);
    loadMessages('groups');
    clearAttachmentPreview();
    updateChatMenuMuteLabel();
}

function loadMessages(collectionName) {
    chatMessages.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    let initialLoad = true;

    unsubscribeFromMessages = db.collection(collectionName)
        .doc(currentChatId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .onSnapshot((snapshot) => {
            const shouldStickToBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 80;

            if (initialLoad) {
                chatMessages.innerHTML = '';
            }

            snapshot.docChanges().forEach((change) => {
                const doc = change.doc;
                const message = doc.data();
                const messageId = doc.id;

                if (message.senderEmail !== currentUser.email) {
                    const readBy = message.readBy || [];
                    if (!readBy.includes(currentUser.email)) {
                        setTimeout(async () => {
                            try {
                                const messagesRef = db.collection(collectionName).doc(currentChatId).collection('messages');
                                await messagesRef.doc(messageId).update({
                                    readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.email)
                                });
                            } catch (e) {
                                console.error('Erro ao marcar mensagem como lida:', e);
                            }
                        }, 10);
                    }
                }

                if (change.type === 'added') {
                    const existing = chatMessages.querySelector(`.message[data-id="${messageId}"]`);
                    if (!existing) {
                        const el = renderMessage(message, messageId, collectionName, true);
                        if (el) chatMessages.appendChild(el);
                    }
                } else if (change.type === 'modified') {
                    const existing = chatMessages.querySelector(`.message[data-id="${messageId}"]`);
                    if (existing) {
                        const newEl = renderMessage(message, messageId, collectionName, true);
                        chatMessages.replaceChild(newEl, existing);
                    }
                } else if (change.type === 'removed') {
                    const existing = chatMessages.querySelector(`.message[data-id="${messageId}"]`);
                    if (existing) existing.remove();
                }
            });

            if (shouldStickToBottom || initialLoad) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            initialLoad = false;
        });
}

// ============================================================================
// FILE DOWNLOAD AND IMAGE VIEWER HELPERS
// ============================================================================

/**
 * Extracts the original filename from a Cloudinary URL
 * Falls back to description, originalName, or generates a default name
 */
function extractFilenameFromUrl(url, description, fileType, originalName) {
    try {
        // Cloudinary URL format: .../upload/v{timestamp}/{filename}.{ext}
        const urlParts = url.split('/');
        const lastPart = urlParts[urlParts.length - 1];

        // Remove query parameters
        const cleanPart = lastPart.split('?')[0];

        // If there's an underscore, the part after it is usually the original filename
        if (cleanPart.includes('_')) {
            const parts = cleanPart.split('_');
            parts.shift(); // Remove the first part (timestamp/id)
            const filename = parts.join('_');
            if (filename) return decodeURIComponent(filename);
        }

        // Use originalName if available (Highest Priority)
        if (originalName) {
            return originalName;
        }

        // Use description if available (Secondary, usually for legacy messages)
        if (description) {
            // Add extension if not present
            const hasExtension = description.includes('.');
            if (!hasExtension && cleanPart.includes('.')) {
                const ext = cleanPart.split('.').pop();
                return `${description}.${ext}`;
            }
            return description;
        }

        // Default filename based on type
        const timestamp = Date.now();
        const ext = cleanPart.split('.').pop() || 'file';
        return `${fileType || 'arquivo'}_${timestamp}.${ext}`;
    } catch (e) {
        console.error('Error extracting filename:', e);
        return `arquivo_${Date.now()}.file`;
    }
}

/**
 * Detects if running on mobile/Android
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Downloads a file with the correct filename
 * On desktop: forces download
 * On mobile: opens file (triggers "Abrir com..." dialog)
 */
async function downloadFile(url, filename) {
    try {
        if (isMobileDevice()) {
            // On mobile, open in new tab which will trigger "Open with" dialog
            window.open(url, '_blank');
        } else {
            // On desktop, force download with correct filename
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // Cleanup
            setTimeout(() => {
                window.URL.revokeObjectURL(blobUrl);
                document.body.removeChild(a);
            }, 100);
        }
    } catch (e) {
        console.error('Error downloading file:', e);
        // Fallback: open in new tab
        window.open(url, '_blank');
    }
}

/**
 * Opens image viewer modal
 */
function openImageViewer(imageUrl, filename) {
    const viewer = document.getElementById('image-viewer');
    const img = document.getElementById('image-viewer-img');
    const downloadBtn = document.getElementById('download-image-viewer');

    if (!viewer || !img) return;

    img.src = imageUrl;
    img.alt = filename || 'Imagem';
    viewer.classList.add('show');

    // Update download button handler
    downloadBtn.onclick = () => {
        const fname = filename || extractFilenameFromUrl(imageUrl, null, 'imagem');
        downloadFile(imageUrl, fname);
    };
}

/**
 * Closes image viewer modal
 */
function closeImageViewer() {
    const viewer = document.getElementById('image-viewer');
    if (viewer) viewer.classList.remove('show');
}

// Setup image viewer event listeners
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-image-viewer');
    const viewer = document.getElementById('image-viewer');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeImageViewer);
    }

    if (viewer) {
        // Click outside image to close
        viewer.addEventListener('click', (e) => {
            if (e.target === viewer) {
                closeImageViewer();
            }
        });
    }
});

function renderMessage(message, messageId, collectionName, returnElementOnly = false) {
    const isSent = message.senderEmail === currentUser.email;
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
    messageEl.dataset.id = messageId;

    let contentHTML = '';

    if (message.replyTo) {
        contentHTML += `
            <div class="quoted-message">
                <div class="quoted-sender">${message.replyTo.senderName}</div>
                <div class="quoted-text">${message.replyTo.text}</div>
            </div>
        `;
    }

    if (message.type === 'image') {
        const filename = extractFilenameFromUrl(message.text, message.description, 'imagem', message.fileName);
        contentHTML += `<img src="${message.text}" alt="Imagem" class="message-image" data-image-url="${message.text}" data-filename="${filename}">`;
    } else if (message.type === 'video') {
        contentHTML += `<video src="${message.text}" controls></video>`;
    } else if (message.type === 'audio') {
        contentHTML += `<div class="audio-player-wrapper"><audio src="${message.text}" controls></audio></div>`;
    } else if (message.type && message.type !== 'text') {
        const filename = extractFilenameFromUrl(message.text, message.description, 'arquivo', message.fileName);
        const displayName = message.description || filename;
        const buttonLabel = isMobileDevice() ? 'Abrir' : 'Baixar';

        contentHTML += `
            <div class="file-attachment">
                <div class="file-icon"><i class="bi bi-file-earmark"></i></div>
                <div class="file-info">
                    <div class="file-name">${displayName}</div>
                    <button class="download-link" data-file-url="${message.text}" data-filename="${filename}">
                        <i class="bi bi-download"></i> ${buttonLabel}
                    </button>
                </div>
            </div>
        `;
    } else {
        const escapedText = escapeHtml(message.text || '');
        const linkified = escapedText.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1<\/a>');
        contentHTML += `<div class="message-text">${linkified}</div>`;
    }

    if (message.description && message.type !== 'text' && message.type !== 'file' && message.type !== 'audio') {
        contentHTML += `<div class="message-caption">${escapeHtml(message.description)}</div>`;
    }

    const senderHTML = !isSent && currentChatType === 'group'
        ? `<div class="sender">${message.senderName || 'Desconhecido'}</div>`
        : '';

    const editedBadge = message.edited ? '<span class="edited-badge">editada</span>' : '';

    messageEl.innerHTML = `
        ${senderHTML}
        ${contentHTML}
        <div class="message-footer">
            ${editedBadge}
            <span class="message-time">${formatTime(message.createdAt)}</span>
        </div>
    `;

    const openOptions = () => openMessageOptions(message, messageId, collectionName);

    messageEl.addEventListener('dblclick', openOptions);
    messageEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openOptions();
    });

    let pressTimer;
    messageEl.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            pressTimer = setTimeout(() => openOptions(), 500);
        }
    }, { passive: true });
    messageEl.addEventListener('touchend', () => clearTimeout(pressTimer));
    messageEl.addEventListener('touchmove', () => clearTimeout(pressTimer));

    // Add event listeners for images and file downloads
    const messageImages = messageEl.querySelectorAll('.message-image');
    messageImages.forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent message options from opening
            const imageUrl = img.dataset.imageUrl;
            const filename = img.dataset.filename;
            openImageViewer(imageUrl, filename);
        });
        img.style.cursor = 'pointer';
    });

    const downloadButtons = messageEl.querySelectorAll('.download-link');
    downloadButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const fileUrl = btn.dataset.fileUrl;
            const filename = btn.dataset.filename;
            downloadFile(fileUrl, filename);
        });
    });

    if (returnElementOnly) {
        return messageEl;
    }

    chatMessages.appendChild(messageEl);
}

function openMessageOptions(message, messageId, collectionName) {
    selectedMessageData = message;
    selectedMessageDocRef = db.collection(collectionName).doc(currentChatId).collection('messages').doc(messageId);
    selectedMessageText = message.text || '';

    const isSent = message.senderEmail === currentUser.email;

    document.getElementById('opt-edit').style.display = isSent && message.type === 'text' ? 'flex' : 'none';
    document.getElementById('opt-delete').style.display = isSent ? 'flex' : 'none';

    if (modalMessageOptions) modalMessageOptions.classList.add('show');
}

document.getElementById('opt-reply').addEventListener('click', () => {
    closeAllModals();
    if (selectedMessageData) {
        setReplyTo(selectedMessageData);
        selectedMessageData = null;
    }
});

document.getElementById('close-message-options').addEventListener('click', closeAllModals);

document.getElementById('opt-edit').addEventListener('click', () => {
    closeAllModals();
    if (modalEditMessage) {
        document.getElementById('edit-message-text').value = selectedMessageText;
        modalEditMessage.classList.add('show');
    }
});

document.getElementById('opt-delete').addEventListener('click', async () => {
    if (confirm('Tem certeza que deseja excluir esta mensagem?')) {
        try {
            await selectedMessageDocRef.delete();
            showToast('Mensagem excluída');
        } catch (e) {
            showToast('Erro ao excluir', 'error');
        }
    }
    closeAllModals();
});

document.getElementById('close-edit-message').addEventListener('click', closeAllModals);
document.getElementById('cancel-edit-message').addEventListener('click', closeAllModals);
document.getElementById('save-edit-message').addEventListener('click', async () => {
    const newText = document.getElementById('edit-message-text').value.trim();
    if (!newText) {
        showToast('A mensagem não pode estar vazia', 'error');
        return;
    }

    try {
        await selectedMessageDocRef.update({
            text: newText,
            edited: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Mensagem editada');
        closeAllModals();
    } catch (e) {
        showToast('Erro ao editar', 'error');
    }
});

function setReplyTo(message) {
    replyToMessage = message;

    let replyText = message.text;
    if (message.type !== 'text') {
        replyText = `[${message.type.charAt(0).toUpperCase() + message.type.slice(1)}] ${message.description || ''}`;
        if (!message.description) replyText = `[${message.type.charAt(0).toUpperCase() + message.type.slice(1)}]`;
    }

    const senderName = message.senderEmail === currentUser.email
        ? 'Você'
        : message.senderName || message.senderEmail;

    document.getElementById('reply-to-name').textContent = senderName;
    document.getElementById('reply-to-text').textContent = replyText.substring(0, 100);
    replyPreview.classList.add('show');
    messageInput.focus();
}

document.getElementById('btn-cancel-reply').addEventListener('click', () => {
    replyToMessage = null;
    replyPreview.classList.remove('show');
});

function displayAttachmentPreview(file, type) {
    attachmentFile = file;
    attachmentType = type;

    let icon = '📎';
    if (type === 'audio') icon = '🎙️';
    else if (type === 'image') icon = '🖼️';
    else if (type === 'video') icon = '🎬';

    document.getElementById('attachment-icon').textContent = icon;
    document.getElementById('attachment-name').textContent = type === 'audio' ? 'Gravação de áudio' : file.name;
    document.getElementById('attachment-size').textContent = `${(file.size / 1024).toFixed(0)} KB`;

    attachmentPreview.classList.add('show');
    messageInput.placeholder = 'Adicione uma legenda...';
}

function clearAttachmentPreview() {
    attachmentFile = null;
    attachmentType = null;
    if (attachmentPreview) attachmentPreview.classList.remove('show');
    if (messageInput) messageInput.placeholder = 'Mensagem';
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    if (btnRecord) {
        btnRecord.classList.remove('recording');
        btnRecord.innerHTML = '<i class="bi bi-mic-fill"></i>';
    }
}

const btnRemoveAttachment = document.getElementById('btn-remove-attachment');
if (btnRemoveAttachment) {
    btnRemoveAttachment.addEventListener('click', clearAttachmentPreview);
}

if (fileUpload) {
    fileUpload.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            const file = files[0];
            const fileType = getResourceType(file.type) || 'file';
            displayAttachmentPreview(file, fileType);
        }
        fileUpload.value = '';
    });
}

if (btnRecord) {
    btnRecord.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording(true);
        } else {
            startRecording();
        }
    });
}

function startRecording() {
    if (!currentChatId) {
        showToast('Selecione uma conversa primeiro', 'error');
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            audioStream = stream;
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.start();
            btnRecord.classList.add('recording');
            btnRecord.innerHTML = '<i class="bi bi-stop-fill"></i>';
            messageInput.placeholder = '🎙️ Gravando...';

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

            mediaRecorder.onstop = () => {
                if (audioStream) audioStream.getTracks().forEach(track => track.stop());

                if (audioChunks.length > 0) {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
                    displayAttachmentPreview(audioFile, 'audio');
                }
                audioChunks = [];
            };
        })
        .catch(err => {
            showToast('Permissão de microfone negada', 'error');
            console.error('Recording error:', err);
        });
}

function stopRecording(keepAudio) {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        if (!keepAudio) audioChunks = [];
        mediaRecorder.stop();
    }
    btnRecord.classList.remove('recording');
    btnRecord.innerHTML = '<i class="bi bi-mic-fill"></i>';
}

async function uploadAndSend(file, type, text) {
    const resourceType = getResourceType(file.type);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

    messageInput.disabled = true;
    btnSend.disabled = true;

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.secure_url) {
            const collectionName = currentChatType === 'chat' ? 'chats' : 'groups';
            const messageData = {
                text: data.secure_url,
                type: type,
                fileName: file.name,
                senderEmail: currentUser.email,
                senderName: currentUser.displayName || currentUser.email.split('@')[0],
                description: text || (type === 'file' ? file.name : null),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                readBy: []
            };

            if (replyToMessage) {
                messageData.replyTo = {
                    senderName: replyToMessage.senderName,
                    text: replyToMessage.text.substring(0, 100)
                };
                replyToMessage = null;
                replyPreview.classList.remove('show');
            }

            await db.collection(collectionName).doc(currentChatId).collection('messages').add(messageData);
            clearAttachmentPreview();
            showToast('Arquivo enviado');
        } else {
            throw new Error('Upload failed');
        }
    } catch (e) {
        showToast('Erro ao enviar arquivo', 'error');
        console.error('Upload error:', e);
    }

    messageInput.disabled = false;
    btnSend.disabled = false;
    messageInput.value = '';
}

if (messageForm) {
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentChatId) {
            showToast('Selecione uma conversa primeiro', 'error');
            return;
        }

        const text = messageInput.value.trim();

        if (attachmentFile) {
            await uploadAndSend(attachmentFile, attachmentType, text);
            return;
        }

        if (!text) return;

        const collectionName = currentChatType === 'chat' ? 'chats' : 'groups';
        const messageData = {
            text: text,
            type: 'text',
            senderEmail: currentUser.email,
            senderName: currentUser.displayName || currentUser.email.split('@')[0],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            readBy: []
        };

        if (replyToMessage) {
            messageData.replyTo = {
                senderName: replyToMessage.senderName || 'Mensagem',
                text: replyToMessage.text.substring(0, 100)
            };
            replyToMessage = null;
            replyPreview.classList.remove('show');
        }

        try {
            await db.collection(collectionName).doc(currentChatId).collection('messages').add(messageData);
            messageInput.value = '';
        } catch (e) {
            showToast('Erro ao enviar mensagem', 'error');
        }
    });
}

if (btnBack) {
    btnBack.addEventListener('click', () => {
        toggleMobileView(false);
        welcomeScreen.style.display = 'flex';
        chatContainer.style.display = 'none';
        currentChatId = null;
        currentChatPartnerEmail = null;
        document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('active'));
        if (unsubscribeFromMessages) unsubscribeFromMessages();
        if (unsubscribeFromPresence) unsubscribeFromPresence();
    });
}

if (btnMenu) {
    btnMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        mainMenu.classList.toggle('show');
        if (chatMenu) chatMenu.classList.remove('show');
    });
}

if (btnChatMenu) {
    btnChatMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        chatMenu.classList.toggle('show');
        if (mainMenu) mainMenu.classList.remove('show');
    });
}

document.addEventListener('click', (e) => {
    if (mainMenu && e.target !== btnMenu && !mainMenu.contains(e.target)) {
        mainMenu.classList.remove('show');
    }
    if (chatMenu && e.target !== btnChatMenu && !chatMenu.contains(e.target)) {
        chatMenu.classList.remove('show');
    }
});

const menuLogout = document.getElementById('menu-logout');
if (menuLogout) {
    menuLogout.addEventListener('click', () => {
        setOfflineStatus();
        // NOTE: We do NOT delete the token here anymore. 
        // Rotation happens ONLY on login if a DIFFERENT user appears.
        auth.signOut();
    });
}

const menuTheme = document.getElementById('menu-theme');
if (menuTheme) {
    menuTheme.addEventListener('click', () => {
        // Updated logic to match the fix at end of file
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon();
        if (mainMenu) mainMenu.classList.remove('show');
    });
}

const menuSettings = document.getElementById('menu-settings');
if (menuSettings) {
    menuSettings.addEventListener('click', () => {
        if (settingsPanel) settingsPanel.classList.add('show');
        if (mainMenu) mainMenu.classList.remove('show');
    });
}

const btnCloseSettings = document.getElementById('btn-close-settings');
if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
        if (settingsPanel) settingsPanel.classList.remove('show');
    });
}

if (themeSwitch) {
    themeSwitch.addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon();
    });
}

const btnNewChat = document.getElementById('btn-new-chat');
if (btnNewChat) {
    btnNewChat.addEventListener('click', () => {
        const modal = document.getElementById('modal-add-contact');
        if (modal) modal.classList.add('show');
        if (mainMenu) mainMenu.classList.remove('show');
    });
}

const closeAddContact = document.getElementById('close-add-contact');
const cancelAddContact = document.getElementById('cancel-add-contact');
if (closeAddContact) closeAddContact.addEventListener('click', closeAllModals);
if (cancelAddContact) cancelAddContact.addEventListener('click', closeAllModals);

const confirmAddContact = document.getElementById('confirm-add-contact');
if (confirmAddContact) {
    confirmAddContact.addEventListener('click', async () => {
        const emailInput = document.getElementById('add-contact-email');
        const errorEl = document.getElementById('add-contact-error');
        if (!emailInput || !errorEl) return;

        const email = emailInput.value.trim().toLowerCase();

        if (!email || email === currentUser.email) {
            errorEl.textContent = 'Email inválido';
            errorEl.classList.add('show');
            return;
        }

        try {
            const contactDoc = await db.collection('users').doc(email).get();
            if (!contactDoc.exists) {
                errorEl.textContent = 'Este usuário não está registrado';
                errorEl.classList.add('show');
                return;
            }

            await db.collection('users').doc(currentUser.email).update({
                contacts: firebase.firestore.FieldValue.arrayUnion(email)
            });

            showToast(`${contactDoc.data().name} adicionado!`);
            closeAllModals();
            emailInput.value = '';
            errorEl.classList.remove('show');
        } catch (e) {
            errorEl.textContent = 'Erro ao adicionar contato';
            errorEl.classList.add('show');
        }
    });
}

const menuNewGroup = document.getElementById('menu-new-group');
if (menuNewGroup) {
    menuNewGroup.addEventListener('click', async () => {
        if (mainMenu) mainMenu.classList.remove('show');

        const userDoc = await db.collection('users').doc(currentUser.email).get();
        const contacts = userDoc.data()?.contacts || [];

        const contactsContainer = document.getElementById('contacts-for-group');
        if (!contactsContainer) return;

        if (contacts.length === 0) {
            contactsContainer.innerHTML = '<p style="color: var(--text-muted);">Adicione contatos primeiro</p>';
        } else {
            contactsContainer.innerHTML = '';
            for (const email of contacts) {
                const contactDoc = await db.collection('users').doc(email).get();
                if (contactDoc.exists) {
                    const contact = contactDoc.data();
                    contactsContainer.innerHTML += `
                        <div class="contact-list-item" data-email="${email}">
                            <input type="checkbox" id="member-${email}">
                            <div class="avatar small">${getInitials(contact.name)}</div>
                            <label for="member-${email}">${contact.name}</label>
                        </div>
                    `;
                }
            }
        }

        const modal = document.getElementById('modal-create-group');
        if (modal) modal.classList.add('show');
    });
}

const closeCreateGroup = document.getElementById('close-create-group');
const cancelCreateGroup = document.getElementById('cancel-create-group');
if (closeCreateGroup) closeCreateGroup.addEventListener('click', closeAllModals);
if (cancelCreateGroup) cancelCreateGroup.addEventListener('click', closeAllModals);

const confirmCreateGroup = document.getElementById('confirm-create-group');
if (confirmCreateGroup) {
    confirmCreateGroup.addEventListener('click', async () => {
        const groupNameInput = document.getElementById('group-name-input');
        const errorEl = document.getElementById('create-group-error');
        if (!groupNameInput || !errorEl) return;

        const groupName = groupNameInput.value.trim();

        if (!groupName) {
            errorEl.textContent = 'Digite um nome para o grupo';
            errorEl.classList.add('show');
            return;
        }

        const selectedMembers = [currentUser.email];
        document.querySelectorAll('#contacts-for-group input:checked').forEach(cb => {
            selectedMembers.push(cb.id.replace('member-', ''));
        });

        if (selectedMembers.length < 2) {
            errorEl.textContent = 'Selecione pelo menos 1 membro';
            errorEl.classList.add('show');
            return;
        }

        const sortedMembers = selectedMembers.sort();
        const groupId = sortedMembers.join('___');

        try {
            await db.collection('groups').doc(groupId).set({
                name: groupName,
                members: sortedMembers,
                admin: currentUser.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            showToast(`Grupo "${groupName}" criado!`);
            closeAllModals();
            groupNameInput.value = '';
            startGroupChat(groupId, groupName);
        } catch (e) {
            errorEl.textContent = 'Erro ao criar grupo';
            errorEl.classList.add('show');
        }
    });
}

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.conversation-item').forEach(item => {
            const name = item.dataset.name.toLowerCase();
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });
    });
}

const userProfileBtn = document.getElementById('user-profile-btn');
if (userProfileBtn) {
    userProfileBtn.addEventListener('click', () => {
        settingsPanel.classList.add('show');
    });
}

const btnEditAvatar = document.getElementById('btn-edit-avatar');
if (btnEditAvatar) {
    btnEditAvatar.addEventListener('click', () => {
        document.getElementById('avatar-upload').click();
    });
}

const avatarUpload = document.getElementById('avatar-upload');
if (avatarUpload) {
    avatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.secure_url) {
                await db.collection('users').doc(currentUser.email).update({
                    photoURL: data.secure_url
                });

                await currentUser.updateProfile({ photoURL: data.secure_url });

                document.getElementById('settings-avatar').innerHTML = `<img src="${data.secure_url}">`;
                userAvatar.innerHTML = `<img src="${data.secure_url}">`;

                showToast('Foto atualizada!');
            }
        } catch (e) {
            showToast('Erro ao atualizar foto', 'error');
        }
    });
}

document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAllModals();
    });
});

const chatMenuInfo = document.getElementById('chat-menu-info');
const chatMenuMedia = document.getElementById('chat-menu-media');
const chatMenuMute = null;
const chatMenuClear = null;

if (chatMenuInfo) {
    chatMenuInfo.addEventListener('click', async () => {
        if (!currentChatId) {
            showToast('Selecione uma conversa primeiro', 'error');
            return;
        }
        if (chatMenu) chatMenu.classList.remove('show');

        const nameEl = document.getElementById('contact-info-name');
        const statusEl = document.getElementById('contact-info-status');
        const emailEl = document.getElementById('contact-info-email');
        const lastSeenEl = document.getElementById('contact-info-last-seen');
        const avatarEl = document.getElementById('contact-info-avatar');
        const typeRow = document.getElementById('contact-info-type-row');
        const typeText = document.getElementById('contact-info-type');
        const membersContainer = document.getElementById('contact-info-members-container');
        const membersList = document.getElementById('contact-info-members');

        if (!nameEl || !statusEl || !emailEl || !lastSeenEl || !avatarEl) return;

        if (currentChatType === 'chat' && currentChatPartnerEmail) {
            try {
                const doc = await db.collection('users').doc(currentChatPartnerEmail).get();
                if (doc.exists) {
                    const data = doc.data();
                    nameEl.textContent = data.name || currentChatPartnerEmail;
                    statusEl.textContent = data.status || '';
                    emailEl.textContent = data.email || currentChatPartnerEmail;
                    lastSeenEl.textContent = formatLastSeen(data.lastSeen);

                    if (data.photoURL) {
                        avatarEl.innerHTML = `<img src="${data.photoURL}" alt="Avatar">`;
                    } else {
                        avatarEl.innerHTML = getInitials(data.name || currentChatPartnerEmail);
                    }
                }
                if (typeRow && membersContainer) {
                    typeRow.style.display = 'none';
                    membersContainer.style.display = 'none';
                }
            } catch (e) {
                showToast('Erro ao carregar contato', 'error');
            }
        } else if (currentChatType === 'group') {
            try {
                const doc = await db.collection('groups').doc(currentChatId).get();
                if (doc.exists) {
                    const data = doc.data();
                    nameEl.textContent = data.name || 'Grupo';
                    statusEl.textContent = `Admin: ${data.admin || ''}`;
                    emailEl.textContent = '-';
                    lastSeenEl.textContent = '';
                    avatarEl.innerHTML = getInitials(data.name || 'Grupo');

                    if (typeRow && typeText) {
                        typeRow.style.display = 'flex';
                        typeText.textContent = 'Grupo';
                    }

                    if (membersContainer && membersList) {
                        membersContainer.style.display = 'block';
                        membersList.innerHTML = '';
                        for (const email of data.members || []) {
                            const userDoc = await db.collection('users').doc(email).get();
                            const userData = userDoc.data() || {};
                            const displayName = userData.name || email;
                            membersList.innerHTML += `
                                <div class="contact-list-item">
                                    <div class="avatar small">${getInitials(displayName)}</div>
                                    <div>${displayName}<br><span style="font-size: 12px; color: var(--text-muted);">${email}</span></div>
                                </div>
                            `;
                        }
                    }
                }
            } catch (e) {
                showToast('Erro ao carregar grupo', 'error');
            }
        }

        if (modalContactInfo) modalContactInfo.classList.add('show');
    });
}

if (chatMenuMedia) {
    chatMenuMedia.addEventListener('click', async () => {
        if (!currentChatId) {
            showToast('Selecione uma conversa primeiro', 'error');
            return;
        }
        if (chatMenu) chatMenu.classList.remove('show');

        const photosEl = document.getElementById('media-photos');
        const audiosEl = document.getElementById('media-audios');
        const docsEl = document.getElementById('media-docs');
        const linksEl = document.getElementById('media-links');
        if (!photosEl || !audiosEl || !docsEl || !linksEl) return;

        photosEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        audiosEl.innerHTML = '';
        docsEl.innerHTML = '';
        linksEl.innerHTML = '';

        const collectionName = currentChatType === 'chat' ? 'chats' : 'groups';
        try {
            const snapshot = await db.collection(collectionName)
                .doc(currentChatId)
                .collection('messages')
                .orderBy('createdAt', 'desc')
                .limit(1000)
                .get();

            const photoItems = [];
            const audioItems = [];
            const docItems = [];
            const linkItems = [];

            snapshot.forEach(doc => {
                const msg = doc.data();
                if (!msg) return;

                if (msg.type === 'image' || msg.type === 'video') {
                    photoItems.push(msg);
                } else if (msg.type === 'audio') {
                    audioItems.push(msg);
                } else if (msg.type && msg.type !== 'text') {
                    docItems.push(msg);
                }

                if (msg.type === 'text' && typeof msg.text === 'string') {
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    if (urlRegex.test(msg.text)) {
                        linkItems.push(msg);
                    }
                }
            });

            if (photoItems.length) {
                photosEl.innerHTML = photoItems.map(m => {
                    const filename = extractFilenameFromUrl(m.text, m.description, m.type, m.fileName);
                    if (m.type === 'image') {
                        return `<img src="${m.text}" alt="mídia" class="media-gallery-image" data-image-url="${m.text}" data-filename="${filename}">`;
                    }
                    return `<video src="${m.text}" controls></video>`;
                }).join('');

                // Add click handlers for gallery images
                photosEl.querySelectorAll('.media-gallery-image').forEach(img => {
                    img.addEventListener('click', () => {
                        openImageViewer(img.dataset.imageUrl, img.dataset.filename);
                    });
                    img.style.cursor = 'pointer';
                });
            } else {
                photosEl.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Nenhuma mídia encontrada.</p>';
            }

            if (audioItems.length) {
                audiosEl.innerHTML = audioItems.map(m => `
                    <div class="media-list-item">
                        <i class="bi bi-mic-fill"></i>
                        <audio src="${m.text}" controls></audio>
                    </div>
                `).join('');
            } else {
                audiosEl.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Nenhum áudio encontrado.</p>';
            }

            if (docItems.length) {
                docsEl.innerHTML = docItems.map(m => {
                    const filename = extractFilenameFromUrl(m.text, m.description, 'documento', m.fileName);
                    const displayName = escapeHtml(m.description || filename);
                    return `
                        <div class="media-list-item">
                            <i class="bi bi-file-earmark"></i>
                            <span>${displayName}</span>
                            <button class="media-download-btn" data-file-url="${m.text}" data-filename="${filename}">
                                <i class="bi bi-download"></i>
                            </button>
                        </div>
                    `;
                }).join('');

                // Add download handlers
                docsEl.querySelectorAll('.media-download-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        downloadFile(btn.dataset.fileUrl, btn.dataset.filename);
                    });
                });
            } else {
                docsEl.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Nenhum documento encontrado.</p>';
            }

            if (linkItems.length) {
                linksEl.innerHTML = linkItems.map(m => {
                    const escaped = escapeHtml(m.text || '');
                    const linkified = escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1<\/a>');
                    return `<div class="media-list-item"><i class="bi bi-link-45deg"></i><div>${linkified}</div></div>`;
                }).join('');
            } else {
                linksEl.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Nenhum link encontrado.</p>';
            }
        } catch (e) {
            photosEl.innerHTML = '<p style="color: var(--danger); font-size: 13px;">Erro ao carregar mídia.</p>';
        }

        if (modalMedia) modalMedia.classList.add('show');
    });
}

if (chatMenuMute) {
    chatMenuMute.addEventListener('click', () => {
        if (!currentChatId) {
            showToast('Selecione uma conversa primeiro', 'error');
            return;
        }
        if (chatMenu) chatMenu.classList.remove('show');

        if (isCurrentChatMuted()) {
            delete mutedChats[currentChatId];
            showToast('Notificações reativadas');
        } else {
            mutedChats[currentChatId] = true;
            showToast('Conversa silenciada');
        }
        saveMutedChats();
        updateChatMenuMuteLabel();
    });
}

if (chatMenuClear) {
    chatMenuClear.addEventListener('click', async () => {
        if (!currentChatId) {
            showToast('Selecione uma conversa primeiro', 'error');
            return;
        }
        if (!confirm('Tem certeza que deseja limpar esta conversa?')) return;
        if (chatMenu) chatMenu.classList.remove('show');

        const collectionName = currentChatType === 'chat' ? 'chats' : 'groups';
        try {
            const snapshot = await db.collection(collectionName)
                .doc(currentChatId)
                .collection('messages')
                .get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            showToast('Conversa limpa');
        } catch (e) {
            showToast('Erro ao limpar conversa', 'error');
        }
    });
}

const closeContactInfo = document.getElementById('close-contact-info');
const closeContactInfoFooter = document.getElementById('close-contact-info-footer');
if (closeContactInfo) closeContactInfo.addEventListener('click', closeAllModals);
if (closeContactInfoFooter) closeContactInfoFooter.addEventListener('click', closeAllModals);

const closeMediaBtn = document.getElementById('close-media');
const closeMediaFooter = document.getElementById('close-media-footer');
if (closeMediaBtn) closeMediaBtn.addEventListener('click', closeAllModals);
if (closeMediaFooter) closeMediaFooter.addEventListener('click', closeAllModals);

const settingsProfileEdit = document.getElementById('settings-profile-edit');
const modalProfileEditEl = document.getElementById('modal-profile-edit');

if (settingsProfileEdit) {
    settingsProfileEdit.addEventListener('click', async () => {
        if (!currentUser) return;
        if (settingsPanel) settingsPanel.classList.remove('show');

        const nameInput = document.getElementById('profile-name-input');
        const emailInput = document.getElementById('profile-email-input');
        const errorEl = document.getElementById('profile-edit-error');
        if (!nameInput || !emailInput || !errorEl) return;

        try {
            const doc = await db.collection('users').doc(currentUser.email).get();
            const data = doc.data() || {};
            nameInput.value = data.name || currentUser.displayName || '';
            emailInput.value = currentUser.email || data.email || '';
            const passInput = document.getElementById('profile-password-input');
            if (passInput) passInput.value = '';
            errorEl.classList.remove('show');
            if (modalProfileEditEl) modalProfileEditEl.classList.add('show');
        } catch (e) {
            showToast('Erro ao carregar perfil', 'error');
        }
    });
}

const closeProfileEdit = document.getElementById('close-profile-edit');
const cancelProfileEdit = document.getElementById('cancel-profile-edit');
if (closeProfileEdit) closeProfileEdit.addEventListener('click', closeAllModals);
if (cancelProfileEdit) cancelProfileEdit.addEventListener('click', closeAllModals);

const saveProfileEdit = document.getElementById('save-profile-edit');
if (saveProfileEdit) {
    saveProfileEdit.addEventListener('click', async () => {
        if (!currentUser) return;
        const nameInput = document.getElementById('profile-name-input');
        const emailInput = document.getElementById('profile-email-input');
        const passInput = document.getElementById('profile-password-input');
        const errorEl = document.getElementById('profile-edit-error');
        if (!nameInput || !emailInput || !errorEl) return;

        const name = nameInput.value.trim();
        const newEmail = emailInput.value.trim();
        const newPassword = passInput ? passInput.value.trim() : '';

        if (!name) {
            errorEl.textContent = 'O nome não pode ficar vazio';
            errorEl.classList.add('show');
            return;
        }
        if (!newEmail) {
            errorEl.textContent = 'O email não pode ficar vazio';
            errorEl.classList.add('show');
            return;
        }

        try {
            await currentUser.updateProfile({ displayName: name });

            if (newEmail !== currentUser.email) {
                await currentUser.updateEmail(newEmail);
            }

            if (newPassword) {
                await currentUser.updatePassword(newPassword);
            }

            await db.collection('users').doc(currentUser.email).update({
                name,
                email: currentUser.email
            });

            if (userName) userName.textContent = name;
            const settingsName = document.getElementById('settings-name');
            const settingsEmail = document.getElementById('settings-email');
            if (settingsName) settingsName.textContent = name;
            if (settingsEmail) settingsEmail.textContent = currentUser.email;

            if (!userAvatar.querySelector('img')) {
                userAvatar.textContent = getInitials(name);
            }

            showToast('Dados da conta atualizados');
            closeAllModals();
        } catch (e) {
            console.error(e);
            errorEl.textContent = 'Erro ao salvar dados (verifique email/senha e reautenticação)';
            errorEl.classList.add('show');
        }
    });
}

function insertAtCursor(input, text) {
    if (!input) return;
    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || input.value.length;
    input.value = input.value.substring(0, start) + text + input.value.substring(end);
    const newPos = start + text.length;
    input.selectionStart = input.selectionEnd = newPos;
    input.focus();
}

const btnSearchMessages = document.getElementById('btn-search-messages');
let searchTerm = '';
let lastFoundIndex = -1;

function highlightAndScrollToNext() {
    if (!chatMessages || !searchTerm) return;
    const msgs = Array.from(chatMessages.querySelectorAll('.message'));
    if (!msgs.length) return;

    msgs.forEach(m => m.classList.remove('search-hit'));

    const startIndex = (lastFoundIndex + 1) % msgs.length;
    let foundIndex = -1;

    for (let i = 0; i < msgs.length; i++) {
        const idx = (startIndex + i) % msgs.length;
        const textEl = msgs[idx].querySelector('.message-text');
        if (textEl && textEl.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
            foundIndex = idx;
            break;
        }
    }

    if (foundIndex >= 0) {
        lastFoundIndex = foundIndex;
        const hit = msgs[foundIndex];
        hit.classList.add('search-hit');
        hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        showToast('Nenhuma mensagem encontrada', 'error');
        lastFoundIndex = -1;
    }
}

if (btnSearchMessages) {
    btnSearchMessages.addEventListener('click', () => {
        if (!currentChatId) {
            showToast('Selecione uma conversa primeiro', 'error');
            return;
        }
        const term = prompt('Buscar mensagem por texto:');
        if (!term) return;
        searchTerm = term;
        lastFoundIndex = -1;
        highlightAndScrollToNext();
    });
}

// ===========================================
// FIX: Restored missing listeners (Theme & Logout) & Input Logic
// ===========================================

// 1. Enter to Send, Shift+Enter to NewLine
if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Dispara o evento de submit do form ou clica no botão enviar
            if (messageForm) {
                // Dispara evento de submit manualmente ou extrai a logica
                // Como o listener é no submit do form, vamos achar o botão e clicar ou disparar evento error-proof
                const event = new Event('submit', { cancelable: true });
                messageForm.dispatchEvent(event);
            }
        }
    });
}

// 2. Theme Switch (Div Button)
if (themeSwitch) {
    themeSwitch.addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        updateThemeIcon();
    });
}

// 3. Logout (Div Button)
const logoutBtn = document.getElementById('menu-logout');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm('Tem certeza que deseja sair?')) {
            try {
                // Força status offline antes de sair
                setOfflineStatus();
                // Pequeno delay para garantir que o write do firestore saia
                await new Promise(r => setTimeout(r, 500));
                await auth.signOut();
                window.location.href = 'index.html';
            } catch (e) {
                console.error('Erro ao sair:', e);
                window.location.href = 'index.html';
            }
        }
    });
}