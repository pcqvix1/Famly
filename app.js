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
    const settingsStatus = document.getElementById('settings-status');
    const settingsAvatar = document.getElementById('settings-avatar');
    
    if (settingsName) settingsName.textContent = userData.name || currentUser.displayName;
    if (settingsStatus) settingsStatus.textContent = userData.status || "Olá! Estou usando o FamlyChat";
    if (settingsAvatar) settingsAvatar.innerHTML = userData.photoURL 
        ? `<img src="${userData.photoURL}" alt="Avatar">` 
        : getInitials(userData.name || currentUser.displayName);
    
    loadConversations();
    initTheme();
    
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
                    const statusClass = contact.isOnline ? 'online' : '';
                    
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
        if (data?.isOnline) {
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
}

function loadMessages(collectionName) {
    chatMessages.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
    
    unsubscribeFromMessages = db.collection(collectionName)
        .doc(currentChatId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .onSnapshot((snapshot) => {
            chatMessages.innerHTML = '';
            
            snapshot.forEach((doc) => {
                const message = doc.data();
                const messageId = doc.id;
                renderMessage(message, messageId, collectionName);
            });
            
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
}

function renderMessage(message, messageId, collectionName) {
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
                    <a href="${message.text}" target="_blank" download>Baixar arquivo</a>
                </div>
            </div>
        `;
    } else {
        contentHTML += `<div class="message-text">${escapeHtml(message.text)}</div>`;
    }
    
    if (message.description && message.type !== 'text' && message.type !== 'file') {
        contentHTML += `<div class="message-text" style="margin-top: 4px;">${escapeHtml(message.description)}</div>`;
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
            ${isSent ? '<i class="bi bi-check2-all message-status read"></i>' : ''}
        </div>
    `;
    
    if (isSent && message.type === 'text') {
        messageEl.addEventListener('dblclick', () => openMessageOptions(messageId, message.text, collectionName));
        messageEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openMessageOptions(messageId, message.text, collectionName);
        });
        
        let pressTimer;
        messageEl.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => openMessageOptions(messageId, message.text, collectionName), 500);
        }, { passive: true });
        messageEl.addEventListener('touchend', () => clearTimeout(pressTimer));
        messageEl.addEventListener('touchmove', () => clearTimeout(pressTimer));
    }
    
    if (!isSent) {
        messageEl.addEventListener('dblclick', () => setReplyTo(message));
    }
    
    chatMessages.appendChild(messageEl);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openMessageOptions(messageId, text, collectionName) {
    selectedMessageDocRef = db.collection(collectionName).doc(currentChatId).collection('messages').doc(messageId);
    selectedMessageText = text;
    document.getElementById('modal-message-options').classList.add('show');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

document.getElementById('close-message-options').addEventListener('click', closeAllModals);
document.getElementById('opt-reply').addEventListener('click', () => {
    closeAllModals();
});

document.getElementById('opt-edit').addEventListener('click', () => {
    closeAllModals();
    document.getElementById('edit-message-text').value = selectedMessageText;
    document.getElementById('modal-edit-message').classList.add('show');
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
    document.getElementById('reply-to-name').textContent = message.senderName || 'Mensagem';
    document.getElementById('reply-to-text').textContent = message.text;
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
            const fileType = file.type.split('/')[0] || 'file';
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
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (replyToMessage) {
            messageData.replyTo = {
                senderName: replyToMessage.senderName,
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

document.addEventListener('click', () => {
    if (mainMenu) mainMenu.classList.remove('show');
    if (chatMenu) chatMenu.classList.remove('show');
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
