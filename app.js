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
const themeSwitch = document.getElementById('theme-switch');
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
let audioStream = null;
let attachmentFile = null;
let attachmentType = null;
let selectedMessageDocRef = null;
let selectedMessageText = "";
let replyToMessage = null;
// NOVO: Variável global para armazenar o objeto completo da mensagem
let selectedMessageData = null; 
let mutedChats = JSON.parse(localStorage.getItem('mutedChats') || '{}');


function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    if (themeSwitch) themeSwitch.checked = savedTheme === 'light';
    updateThemeIcon();
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    if (themeSwitch) themeSwitch.checked = newTheme === 'light';
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

function formatLastSeen(timestamp) {
    if (!timestamp) return 'offline';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'online agora';
    if (diff < 3600000) return `visto há ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `visto hoje às ${formatTime(timestamp)}`;
    return `visto em ${date.toLocaleDateString('pt-BR')}`;
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

function updatePresence(isOnline) {
    if (!currentUser) return;
    db.collection('users').doc(currentUser.email).update({
        isOnline: isOnline,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(console.error);
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


auth.onAuthStateChanged(async (user) => {
    if (!user) {
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
    
    updatePresence(true);
    
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
    
    window.addEventListener('beforeunload', () => updatePresence(false));
    document.addEventListener('visibilitychange', () => {
        updatePresence(!document.hidden);
    });
});

async function loadConversations() {
    if (!conversationList) return;
    conversationList.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Carregando...</p></div>';
    
    db.collection('users').doc(currentUser.email).onSnapshot(async (doc) => {
        const userData = doc.data();
        const contacts = userData?.contacts || [];
        
        let html = '';
        
        for (const contactEmail of contacts) {
            try {
                const contactDoc = await db.collection('users').doc(contactEmail).get();
                if (contactDoc.exists) {
                    const contact = contactDoc.data();
                    const chatId = getChatId(currentUser.email, contactEmail);
                    const initials = getInitials(contact.name);
                    
                    html += `
                        <div class="conversation-item" data-email="${contactEmail}" data-name="${contact.name}" data-type="chat" data-id="${chatId}">
                            <div class="avatar-wrapper">
                                <div class="avatar">${contact.photoURL ? `<img src="${contact.photoURL}">` : initials}</div>
                                ${contact.isOnline ? '<div class="online-indicator"></div>' : ''}
                            </div>
                            <div class="conversation-info">
                                <div class="conversation-name">${contact.name}</div>
                                <div class="conversation-preview">${contact.isOnline ? 'Online' : formatLastSeen(contact.lastSeen)}</div>
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error loading contact:', e);
            }
        }
        
        const groupsSnapshot = await db.collection('groups')
            .where('members', 'array-contains', currentUser.email)
            .get();
        
        groupsSnapshot.forEach((doc) => {
            const group = doc.data();
            const groupId = doc.id;
            const initials = getInitials(group.name);
            
            html += `
                <div class="conversation-item" data-name="${group.name}" data-type="group" data-id="${groupId}">
                    <div class="avatar group-avatar">${initials}</div>
                    <div class="conversation-info">
                        <div class="conversation-name">
                            ${group.name}
                            <span class="badge">Grupo</span>
                        </div>
                        <div class="conversation-preview">${group.members.length} membros</div>
                    </div>
                </div>
            `;
        });
        
        if (html === '') {
            conversationList.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-chat-dots"></i>
                    <h3>Nenhuma conversa</h3>
                    <p>Adicione contatos ou crie um grupo para começar a conversar</p>
                </div>
            `;
        } else {
            conversationList.innerHTML = html;
            attachConversationListeners();
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
        const now = new Date();
        let isReallyOnline = false;
        if (data?.lastSeen) {
            const last = data.lastSeen.toDate ? data.lastSeen.toDate() : new Date(data.lastSeen);
            const diff = now - last;
            isReallyOnline = !!data.isOnline && diff < 120000;
        }

        if (isReallyOnline) {
            chatStatus.textContent = 'online';
            chatStatus.classList.add('online');
            onlineIndicator.style.display = 'block';
        } else {
            chatStatus.textContent = formatLastSeen(data?.lastSeen);
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
    
    unsubscribeFromMessages = db.collection(collectionName)
        .doc(currentChatId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .onSnapshot((snapshot) => {
            const fragment = document.createDocumentFragment();
            chatMessages.innerHTML = '';
            
            snapshot.forEach((doc) => {
                const message = doc.data();
                const messageId = doc.id;
                
                // CORREÇÃO (2): Lógica de marcar a mensagem como lida
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
                                console.error("Erro ao marcar mensagem como lida:", e);
                            }
                        }, 10); 
                    }
                }

                const el = renderMessage(message, messageId, collectionName, true);
                if (el) fragment.appendChild(el);
            });
            
            chatMessages.appendChild(fragment);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
}

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
        contentHTML += `<a href="${message.text}" target="_blank"><img src="${message.text}" alt="Imagem"></a>`;
    } else if (message.type === 'video') {
        contentHTML += `<video src="${message.text}" controls></video>`;
    } else if (message.type === 'audio') {
        contentHTML += `<div class="audio-player-wrapper"><audio src="${message.text}" controls></audio></div>`;
    } else if (message.type && message.type !== 'text') {
        let filename = message.text.substring(message.text.lastIndexOf('/') + 1);
        filename = filename.split('?')[0];
        filename = filename.split('_').slice(1).join('_') || "Arquivo";
        
        contentHTML += `
            <div class="file-attachment">
                <div class="file-icon"><i class="bi bi-file-earmark"></i></div>
                <div class="file-info">
                    <div class="file-name">${message.description || filename}</div>
                    <a href="${message.text}" target="_blank" download class="download-link"><i class="bi bi-download"></i> Baixar</a>
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
    
    // CORREÇÃO (3): Lógica de status da mensagem (Visto / Entregue)
    const readBy = message.readBy || [];
    // Para chats 1:1, basta verificar se alguém (o destinatário) leu.
    // Para grupos, você pode querer verificar se todos leram, mas por enquanto:
    // se o array readBy tiver 1 ou mais elementos, consideramos "lido".
    // Em um chat 1:1, o remetente não está em readBy. Se o array tiver 1, é o destinatário.
    // No entanto, para grupos, o remetente PODE estar em readBy se ele também for um "leitor".
    // Pelo contexto do chat 1:1, vamos verificar se o array NÃO está vazio.
    const allRead = readBy.length >= 1; 
    
    const statusIcon = isSent 
        ? (allRead 
            ? '<i class="bi bi-check2-all message-status read-status"></i>' 
            : '<i class="bi bi-check2 message-status delivered-status"></i>'
          )
        : ''; // Mensagens recebidas não mostram ícone de status
    
    messageEl.innerHTML = `
        ${senderHTML}
        ${contentHTML}
        <div class="message-footer">
            ${editedBadge}
            <span class="message-time">${formatTime(message.createdAt)}</span>
            ${statusIcon}
        </div>
    `;
    
    // CORREÇÃO: Permite responder a TODAS as mensagens (enviadas e recebidas)
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
    
    
    if (returnElementOnly) {
        return messageEl;
    }

    chatMessages.appendChild(messageEl);
}

// CORREÇÃO: Atualizado para receber o objeto completo
function openMessageOptions(message, messageId, collectionName) {
    selectedMessageData = message; // Salva o objeto completo
    selectedMessageDocRef = db.collection(collectionName).doc(currentChatId).collection('messages').doc(messageId);
    selectedMessageText = message.text || '';
    
    const isSent = message.senderEmail === currentUser.email;
    
    // Mostra/Esconde opções irrelevantes
    document.getElementById('opt-edit').style.display = isSent && message.type === 'text' ? 'flex' : 'none';
    document.getElementById('opt-delete').style.display = isSent ? 'flex' : 'none';
    
    if (modalMessageOptions) modalMessageOptions.classList.add('show');
}

document.getElementById('opt-reply').addEventListener('click', () => {
    closeAllModals();
    if (selectedMessageData) {
        setReplyTo(selectedMessageData); 
        selectedMessageData = null; // Limpa o objeto após uso
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
    // A função setReplyTo já está preparada para receber o objeto message completo
    replyToMessage = message; 
    
    // Atualiza a pré-visualização para mostrar o texto/mídia corretamente
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
                senderEmail: currentUser.email,
                senderName: currentUser.displayName || currentUser.email.split('@')[0],
                description: text || null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                // CORREÇÃO (1): Remove a propriedade 'read: false'
                readBy: [] // Inicializa o array de leitores
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
            // CORREÇÃO (1): Remove a propriedade 'read: false'
            readBy: [] // Inicializa o array de leitores
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
    if (emojiPicker && emojiPicker.classList.contains('show') && e.target !== btnEmoji && !emojiPicker.contains(e.target)) {
        emojiPicker.classList.remove('show');
    }
});

const menuLogout = document.getElementById('menu-logout');
if (menuLogout) {
    menuLogout.addEventListener('click', () => {
        updatePresence(false);
        auth.signOut();
    });
}

const menuTheme = document.getElementById('menu-theme');
if (menuTheme) {
    menuTheme.addEventListener('click', () => {
        toggleTheme();
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
    themeSwitch.addEventListener('change', toggleTheme);
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
const chatMenuMute = document.getElementById('chat-menu-mute');
const chatMenuClear = document.getElementById('chat-menu-clear');

function saveMutedChats() {
    localStorage.setItem('mutedChats', JSON.stringify(mutedChats));
}

function isCurrentChatMuted() {
    if (!currentChatId) return false;
    return !!mutedChats[currentChatId];
}

function updateChatMenuMuteLabel() {
    if (!chatMenuMute) return;
    const span = chatMenuMute.querySelector('span');
    if (!span) return;
    span.textContent = isCurrentChatMuted() ? 'Reativar notificações' : 'Silenciar notificações';
}

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
                .limit(200)
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
                    if (m.type === 'image') {
                        return `<a href="${m.text}" target="_blank"><img src="${m.text}" alt="mídia"></a>`;
                    }
                    return `<video src="${m.text}" controls></video>`;
                }).join('');
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
                docsEl.innerHTML = docItems.map(m => `
                    <div class="media-list-item">
                        <i class="bi bi-file-earmark"></i>
                        <a href="${m.text}" target="_blank">${escapeHtml(m.description || 'Documento')}</a>
                    </div>
                `).join('');
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
                // Aviso: Alterar o email requer reautenticação em um app real.
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

const btnEmoji = document.getElementById('btn-emoji');
const emojiPicker = document.getElementById('emoji-picker');

function toggleEmojiPicker() {
    if (!emojiPicker) return;
    emojiPicker.classList.toggle('show');
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

if (btnEmoji && emojiPicker) {
    btnEmoji.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleEmojiPicker();
    });

    emojiPicker.querySelectorAll('.emoji-option').forEach(span => {
        span.addEventListener('click', (e) => {
            const emoji = e.target.textContent;
            insertAtCursor(messageInput, emoji);
            emojiPicker.classList.remove('show');
        });
    });
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