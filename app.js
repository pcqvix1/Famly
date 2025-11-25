// ===================================================================
// CONFIGURAÇÃO DO FIREBASE (SÓ AUTH E FIRESTORE)
// Substitua SEUS DADOS DE CONFIGURAÇÃO aqui:
// ===================================================================
const firebaseConfig = {
  apiKey: "AIzaSyANjWULYll8KXkKaofhZf-_7UdPQjp7Tf0",
  authDomain: "famly-8f61d.firebaseapp.com",
  projectId: "famly-8f61d",
  storageBucket: "famly-8f61d.firebasestorage.app",
  messagingSenderId: "977105798054",
  appId: "1:977105798054:web:31f6e74b18d6670b9cc567",
  measurementId: "G-0HHXK30GW8"
};

// Inicializar o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Inicializa messaging de forma segura.
const messaging = firebase.messaging ? firebase.messaging() : null;

// ===================================================================
// CONFIGURAÇÃO DO CLOUDINARY (PARA ANEXOS SEM FIREBASE STORAGE)
// ⚠️ SUBSTITUA COM SUAS CREDENCIAIS ⚠️
// ===================================================================
const CLOUDINARY_CLOUD_NAME = "dqn28emva";
const CLOUDINARY_UPLOAD_PRESET = "famly_chat";

// Função auxiliar para obter o tipo de recurso para o Cloudinary
function getResourceType(fileType) {
    if (fileType.includes('image')) return 'image';
    if (fileType.includes('video')) return 'video';
    if (fileType.includes('audio')) return 'video'; // Cloudinary processa audio/video juntos
    return 'raw'; // Para qualquer outro ficheiro (PDF, DOC, etc.)
}

// ===================================================================
// LÓGICA DE AUTENTICAÇÃO (index.html)
// ===================================================================

const btnLogin = document.getElementById("btn-login");

if (btnLogin) {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const btnRegister = document.getElementById("btn-register");
    const errorMessage = document.getElementById("error-message");

    // Persistência de sessão (mantém o usuário logado)
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch((error) => { console.error("Erro ao ativar persistência: ", error); });

    // Listener de Login
    btnLogin.addEventListener("click", () => {
        if (!emailInput || !passwordInput) return;

        auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value)
            .then(() => {
                window.location.href = "chat.html";
            })
            .catch((error) => {
                errorMessage.textContent = "Erro no Login: " + error.message;
            });
    });

    // Listener de Registo
    btnRegister.addEventListener("click", () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        const name = document.getElementById("name").value;

        if (!name || password.length < 6 || !email.includes('@')) {
            errorMessage.textContent = "Preencha Nome, Email e use senha com 6 ou mais caracteres.";
            return;
        }

        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;

                return user.updateProfile({ displayName: name })
                    .then(() => user);
            })
            .then((user) => {
                return db.collection("users").doc(user.email).set({
                    name: user.displayName || user.email.split('@')[0],
                    email: user.email,
                    contacts: [],
                    blockedUsers: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            })
            .then(() => {
                window.location.href = "chat.html";
            })
            .catch((error) => {
                errorMessage.textContent = "Erro no Registo: " + error.message;
            });
    });
}

// ===================================================================
// LÓGICA DO CHAT (chat.html)
// ===================================================================

const currentPage = window.location.pathname;

if (currentPage.includes("chat.html")) {

    // --- ELEMENTOS HTML ---
    const conversationListCol = document.getElementById("conversation-list-col");
    const conversationList = document.getElementById("conversation-list");
    const btnAddContact = document.getElementById("btn-add-contact");
    const btnCreateGroup = document.getElementById("btn-create-group");
    const btnLogoutPc = document.getElementById("btn-logout-pc");
    const chatMainCol = document.getElementById("chat-main-col");
    const chatWindow = document.getElementById("chat-window");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message-input");
    const fileUpload = document.getElementById("file-upload");
    const currentChatNameEl = document.getElementById("current-chat-name");
    const btnBackMobile = document.getElementById("btn-back-mobile");
    const btnLogoutMobile = document.getElementById("btn-logout-mobile");
    const btnRecordAudio = document.getElementById("btn-record-audio");
    const searchInput = document.getElementById("search-input");

    // ELEMENTOS DE PRÉ-VISUALIZAÇÃO
    const attachmentPreview = document.getElementById("attachment-preview");
    const previewContent = document.getElementById("preview-content");
    const btnRemoveAttachment = document.getElementById("btn-remove-attachment");

    // ELEMENTOS DOS MODAIS DE OPÇÕES/EDIÇÃO
    const messageOptionsMenu = new bootstrap.Modal(document.getElementById('messageOptionsMenu'));
    const btnEditMessage = document.getElementById("btn-edit-message");
    const btnDeleteMessage = document.getElementById("btn-delete-message");
    const btnForwardMessage = document.getElementById("btn-forward-message");

    const editMessageModal = new bootstrap.Modal(document.getElementById('editMessageModal'));
    const editMessageTextarea = document.getElementById("edit-message-text");
    const btnSaveEdit = document.getElementById("btn-save-edit");
    const accountModal = new bootstrap.Modal(document.getElementById('accountModal'));
    const btnAccount = document.getElementById("btn-account");
    const accountNameInput = document.getElementById("account-name");
    const accountEmailInput = document.getElementById("account-email");
    const accountPasswordInput = document.getElementById("account-password");
    const accountPasswordConfirmInput = document.getElementById("account-password-confirm");
    const btnSaveAccount = document.getElementById("btn-save-account");
    const forwardMessageModal = new bootstrap.Modal(document.getElementById('forwardMessageModal'));
    const forwardContactsList = document.getElementById("forward-contacts-list");
    const btnBlockUser = document.getElementById("btn-block-user");


    // --- ESTADO DA APLICAÇÃO ---
    let currentUser = null;
    let currentChatPartnerEmail = null;
    let currentChatId = null;
    let unsubscribeFromMessages = null;
    let mediaRecorder;
    let audioChunks = [];
    let audioStream = null;

    // VARIÁVEIS DE ESTADO PARA ANEXOS/ÁUDIO
    let attachmentFile = null;
    let attachmentType = null;

    // VARIÁVEIS DE ESTADO PARA EDIÇÃO/EXCLUSÃO
    let selectedMessageDocRef = null;
    let selectedMessageText = "";


    // ===========================================
    // FUNÇÕES DE UTILIDADE E RESPONSIVIDADE
    // ===========================================
    function getChatId(email1, email2) {
        return [email1, email2].sort().join('_');
    }

    function showChatMain() {
        if (window.innerWidth < 992) {
            conversationListCol.classList.add("d-none");
            chatMainCol.classList.remove("d-none");
        }
    }

    function showConversationList() {
        if (window.innerWidth < 992) {
            conversationListCol.classList.remove("d-none");
            chatMainCol.classList.add("d-none");
        }
    }

    function requestNotificationPermission() {
        if (!("Notification" in window)) {
            alert("This browser does not support desktop notification");
        } else if (Notification.permission === "granted") {
            return;
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(function (permission) {
                if (permission === "granted") {
                    console.log("Notification permission granted.");
                }
            });
        }
    }

    // Funções para gerir o estado da pré-visualização de anexo
    function displayAttachmentPreview(file, type) {
        attachmentFile = file;
        attachmentType = type;

        messageInput.placeholder = "Adicione uma descrição...";
        messageInput.value = "";

        let icon = '📎';
        let name = file.name;

        if (type === 'audio') {
            icon = '🎙️';
            name = 'Gravação de Áudio';
        } else if (type === 'image') {
            icon = '🖼️';
            name = file.name;
        } else if (type !== 'text') {
            icon = '📄';
        }

        previewContent.innerHTML = `
            <span style="font-size: 24px; margin-right: 10px;">${icon}</span>
            <div>
                <strong>${name}</strong>
                <div class="text-muted small">${(file.size / 1024).toFixed(0)} KB</div>
            </div>
        `;

        attachmentPreview.classList.remove("d-none");
        messageInput.disabled = false;
        btnRecordAudio.textContent = '🎙️';
    }

    function clearAttachmentPreview() {
        attachmentFile = null;
        attachmentType = null;
        messageInput.placeholder = "Escreva sua mensagem...";
        messageInput.value = "";
        attachmentPreview.classList.add("d-none");
        previewContent.innerHTML = '';
        messageInput.disabled = false;
        btnRecordAudio.textContent = '🎙️';
        if (audioStream) audioStream.getTracks().forEach(track => track.stop());
    }

    // Listener para o botão 'X' de remover anexo
    btnRemoveAttachment.addEventListener('click', clearAttachmentPreview);


    // ===========================================
    // AUTENTICAÇÃO E INICIALIZAÇÃO
    // ===========================================

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;

            const userDocRef = db.collection("users").doc(currentUser.email);
            const userDoc = await userDocRef.get();

            if (!userDoc.exists) {
                await userDocRef.set({
                    name: currentUser.displayName || currentUser.email.split('@')[0],
                    email: currentUser.email,
                    contacts: [],
                    blockedUsers: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            loadConversationList();
            requestNotificationPermission();

            if (window.innerWidth < 992 && !currentChatId) {
                chatMainCol.classList.add("d-none");
            }

        } else {
            window.location.href = "index.html";
        }
    });

    btnBackMobile.addEventListener('click', showConversationList);
    btnLogoutPc.addEventListener("click", () => auth.signOut());
    btnLogoutMobile.addEventListener("click", () => auth.signOut());

    // ===========================================
    // LÓGICA DE CONTACTOS E GRUPOS
    // ===========================================

    // Modal Add Contact (simplificado, como no código anterior)
    btnAddContact.addEventListener('click', async () => {
        const emailToAdd = prompt("Digite o email do contato que deseja adicionar:");

        if (!emailToAdd || emailToAdd === currentUser.email) return;

        const contactDoc = await db.collection("users").doc(emailToAdd).get();
        if (!contactDoc.exists) {
            alert(`O email ${emailToAdd} não está registado no chat.`);
            return;
        }

        try {
            await db.collection("users").doc(currentUser.email).update({
                contacts: firebase.firestore.FieldValue.arrayUnion(emailToAdd)
            });
            alert(`O contato ${contactDoc.data().name} foi adicionado!`);
        } catch (e) {
            alert("Erro ao adicionar contato.");
        }
    });

    // Modal Create Group (simplificado, como no código anterior)
    btnCreateGroup.addEventListener('click', async () => {
        const userDoc = await db.collection("users").doc(currentUser.email).get();
        const contacts = userDoc.data().contacts || [];

        if (contacts.length === 0) { alert("Adicione contatos primeiro para criar um grupo!"); return; }

        let selectedEmails = [currentUser.email];
        let groupName = prompt("Digite o nome do novo grupo:");

        if (!groupName) return;

        let emailsInput = prompt(`Digite os emails dos contatos (separados por vírgula): \nSeus contatos são: ${contacts.join(', ')}`);

        if (emailsInput) {
            const inputList = emailsInput.split(',').map(e => e.trim()).filter(e => e.length > 0);
            selectedEmails.push(...inputList);
        }

        selectedEmails = [...new Set(selectedEmails)].filter(email => email.includes('@'));

        if (selectedEmails.length < 2) {
            alert("Um grupo precisa de pelo menos 2 membros. Tente novamente.");
            return;
        }

        const sortedMembers = selectedEmails.sort();
        const groupId = sortedMembers.join('___');

        try {
            await db.collection("groups").doc(groupId).set({
                name: groupName,
                members: sortedMembers,
                admin: currentUser.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert(`O grupo "${groupName}" foi criado!`);
            startGroupChat(groupId, groupName);

        } catch (e) {
            console.error("Erro ao criar o grupo:", e);
            alert("Erro ao criar o grupo.");
        }
    });

    /**
     * NOVO: Destaca visualmente o chat ativo na lista de conversas.
     */
    function highlightActiveChat() {
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
            item.classList.remove('text-white');
        });

        if (currentChatId) {
            const activeItem = document.querySelector(`.chat-item[data-chat-id="${currentChatId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
                activeItem.classList.add('text-white'); // Para melhor contraste do texto
            }
        }
    }

    /**
     * FUNÇÃO CORRIGIDA: Carrega a lista de contatos e grupos do utilizador.
     * Agora substitui corretamente a mensagem de "A carregar...".
     */
    async function loadConversationList() {
        // Garante que a mensagem de carregamento apareça ANTES de qualquer dado
        conversationList.innerHTML = '<p class="text-center p-3 text-muted">A carregar conversas...</p>';

        // Listener que monitora mudanças no documento do utilizador (principalmente a lista de contatos)
        db.collection("users").doc(currentUser.email)
            .onSnapshot(async (doc) => {
                const userData = doc.data();
                const contacts = userData.contacts || [];
                let listHTML = '';
                let contactPromises = [];

                // 1. CARREGAR CONTATOS INDIVIDUAIS
                if (contacts.length === 0) {
                     // Não coloca nada aqui, para permitir a inserção da lista de grupos
                } else {
                    for (const contactEmail of contacts) {
                        contactPromises.push(
                            db.collection("users").doc(contactEmail).get().then(contactDoc => {
                                if (contactDoc.exists) {
                                    const contactName = contactDoc.data().name;
                                    const chatId = getChatId(currentUser.email, contactEmail);
                                    // Adiciona as classes para a função highlightActiveChat
                                    return `<a href="#" class="list-group-item list-group-item-action p-3 chat-item" data-chat-id="${chatId}" onclick="startChatWith('${contactEmail}', '${contactName}', event)">${contactName}</a>`;
                                }
                                return '';
                            })
                        );
                    }
                    listHTML += (await Promise.all(contactPromises)).join('');
                }

                let groupsHTML = '';

                // 2. CARREGAR GRUPOS
                db.collection("groups").where("members", "array-contains", currentUser.email)
                    .onSnapshot((querySnapshot) => {
                        groupsHTML = '';
                        querySnapshot.forEach((doc) => {
                            const group = doc.data();
                            const groupId = doc.id;

                            // Adiciona as classes para a função highlightActiveChat
                            groupsHTML += `<a href="#" class="list-group-item list-group-item-action p-3 bg-warning-subtle chat-item" data-chat-id="${groupId}" onclick="startGroupChat('${groupId}', '${group.name}', event)">${group.name} (Grupo)</a>`;
                        });

                        // FIX PRINCIPAL: Substitui o conteúdo da lista com os contatos e grupos carregados
                        conversationList.innerHTML = listHTML + groupsHTML;

                        // Se a lista estiver vazia, exibe a mensagem de 'Adicionar contatos'
                        if (listHTML === '' && groupsHTML === '') {
                             conversationList.innerHTML = '<p class="text-center p-3 text-muted">Adicione contatos 👥 ou crie um grupo 👨‍👩‍👧‍👦</p>';
                        }

                        highlightActiveChat();

                    }, (error) => {
                         console.error("Erro ao carregar grupos:", error);
                         conversationList.innerHTML = listHTML + '<p class="text-center p-3 text-danger">Erro ao carregar grupos. Verifique as regras do Firestore.</p>';
                    });
            });
    }

    // Funções de Início de Chat (Atualizadas para chamar highlightActiveChat)
    window.startChatWith = (partnerEmail, partnerName, event) => {
        if (event) event.preventDefault();

        if (unsubscribeFromMessages) unsubscribeFromMessages();
        clearAttachmentPreview();

        currentChatPartnerEmail = partnerEmail;
        currentChatId = getChatId(currentUser.email, partnerEmail);

        currentChatNameEl.textContent = partnerName;
        showChatMain();

        loadMessages(currentChatId, "chats");
        highlightActiveChat(); // Chama a função de destaque
    };

    window.startGroupChat = (groupId, groupName, event) => {
        if (event) event.preventDefault();

        if (unsubscribeFromMessages) unsubscribeFromMessages();
        clearAttachmentPreview();

        currentChatPartnerEmail = null;
        currentChatId = groupId;

        currentChatNameEl.textContent = `${groupName} (Grupo)`;
        showChatMain();

        loadMessages(groupId, "groups");
        highlightActiveChat(); // Chama a função de destaque
    };


    // ===========================================
    // MENSAGENS E UPLOAD (Lógica Cloudinary)
    // ===========================================

    // Universal: Carregar Mensagens (Com FIX para nome 'null' e opções)
    async function loadMessages(chatId, collectionName) {

        chatWindow.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div></div>';

        if (currentChatPartnerEmail) {
            const userDocRef = db.collection("users").doc(currentUser.email);
            const userDoc = await userDocRef.get();
            const blockedUsers = userDoc.data().blockedUsers || [];

            if (blockedUsers.includes(currentChatPartnerEmail)) {
                chatWindow.innerHTML = '<div class="text-center mt-5">Você bloqueou este usuário.</div>';
                return;
            }
        }

        unsubscribeFromMessages = db.collection(collectionName).doc(chatId).collection("messages")
            .orderBy("createdAt", "asc")
            .onSnapshot((querySnapshot) => {

                querySnapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        const message = change.doc.data();

                        if (message.senderEmail !== currentUser.email && document.hidden) {
                            if (Notification.permission === "granted") {
                                const body = message.type === 'text' ? message.text : `[${message.type.toUpperCase()}] Novo anexo`;
                                var notification = new Notification(message.senderName, {
                                    body: body,
                                });
                            }
                        }
                    }
                });

                chatWindow.innerHTML = "";

                querySnapshot.forEach((doc) => {
                    const message = doc.data();
                    let contentHTML = '';
                    const messageId = doc.id; // Capturar o ID do documento

                    const descriptionHtml = message.description ? `<p class="small text-muted">${message.description}</p>` : '';
                    const editedHtml = message.edited ? '<span class="small text-warning"> (editada)</span>' : '';


                    if (message.type === 'image') {
                        contentHTML = `<a href="${message.text}" target="_blank"><img src="${message.text}" alt="Imagem enviada"></a>${descriptionHtml}`;
                    } else if (message.type === 'video') {
                        contentHTML = `<video src="${message.text}" controls></video>${descriptionHtml}`;
                    } else if (message.type === 'audio') {
                        // AJUSTE: Usa o wrapper para garantir a largura mínima
                        contentHTML = `<div class="audio-player-wrapper"><audio src="${message.text}" controls></audio></div>${descriptionHtml}`;
                    } else if (message.type !== 'text') {
                        // 💡 CORREÇÃO APLICADA: Tratamento de anexos (PDF, DOCX, etc.)

                        // 1. Extração Limpa do Nome do Ficheiro.
                        let filename = message.text.substring(message.text.lastIndexOf('/') + 1);
                        filename = filename.split('?')[0]; // Remove query params
                        // Remove o prefixo de ID do Cloudinary (ex: 'a1b2c3d4_nome-real.pdf' -> 'nome-real.pdf')
                        filename = filename.split('_').slice(1).join('_') || "Arquivo Anexado";

                        // 2. Define o texto do link
                        const linkText = message.description || filename;

                        // 3. Constrói o HTML: Link azul, nome do ficheiro e forçar download.
                        contentHTML = `<div style="background-color: #f0f4ff; padding: 10px; border-radius: 8px; border: 1px solid #d4e0ff;">
                                📁 **FICHEIRO** (${message.type.toUpperCase()})<br>
                                <a href="${message.text}" download="${filename}" target="_blank"
                                   style="color: #007bff; text-decoration: none; font-weight: 600;">
                                    ${linkText}
                                </a>
                            </div>${descriptionHtml}`;
                    } else {
                        contentHTML = message.text;
                    }

                    const messageEl = document.createElement("div");
                    messageEl.classList.add("message");

                    const senderDisplay = (message.senderEmail === currentUser.email)
                        ? `Você${editedHtml}`
                        : (message.senderName || message.senderEmail.split('@')[0]) + editedHtml;

                    const isSentByCurrentUser = message.senderEmail === currentUser.email;

                    if (isSentByCurrentUser) {
                        messageEl.classList.add("sent");
                    } else {
                        messageEl.classList.add("received");
                    }

                    // ----------------------------------------------------
                    // Lógica de Opções (Editar, Excluir)
                    // ----------------------------------------------------
                    let optionsHTML = '';
                    if (isSentByCurrentUser && message.type === 'text') {
                        // FIX: Usa o ícone do Bootstrap em vez de "..."
                        optionsHTML = `
                            <div class="message-options">
                                <button class="btn btn-sm btn-link p-0" type="button" data-id="${messageId}">
                                    <i class="bi bi-three-dots-vertical"></i> </button>
                            </div>
                        `;
                    }
                    // ----------------------------------------------------

                    // Monta o HTML final (a ordem importa para a UX)
                    messageEl.innerHTML = `
                        <div class="sender">${senderDisplay}</div>
                        <div class="message-content-wrapper d-flex align-items-center">
                            <div class="message-text-content">${contentHTML}</div>
                            ${optionsHTML}
                        </div>`;

                    chatWindow.appendChild(messageEl);

                    // FIX: Adiciona os listeners APÓS o elemento messageEl ter o innerHTML definido
                    if (isSentByCurrentUser && message.type === 'text') {
                         const openOptionsMenu = () => {
                             selectedMessageDocRef = db.collection(collectionName).doc(chatId).collection("messages").doc(messageId);
                             selectedMessageText = message.text;
                             messageOptionsMenu.show();
                         };

                         // Listener para o botão de opções (três pontinhos)
                         messageEl.querySelector('.message-options button')?.addEventListener('click', openOptionsMenu);

                         // Listener para DOIS CLIQUES (PC)
                         messageEl.addEventListener('dblclick', (e) => {
                             e.stopPropagation();
                             openOptionsMenu();
                         });

                         // Listener de Long Press (celular)
                         let pressTimer;
                         messageEl.addEventListener('touchstart', (e) => {
                             e.stopPropagation();
                             pressTimer = setTimeout(openOptionsMenu, 700);
                         }, {passive: true});

                         messageEl.addEventListener('touchend', () => { clearTimeout(pressTimer); });
                         messageEl.addEventListener('touchmove', () => { clearTimeout(pressTimer); });
                    }
                });

                chatWindow.scrollTop = chatWindow.scrollHeight;
            });
    }

    // Listener de Envio de Mídia/Documentos (PRÉ-VISUALIZAÇÃO)
    fileUpload.addEventListener("change", (e) => {
        const files = e.target.files;

        if (files.length > 0) {
            const file = files[0];
            const fileType = file.type.split('/')[0] || 'file';

            displayAttachmentPreview(file, fileType);
        }
        fileUpload.value = '';
    });

    // FUNÇÃO: Faz o upload e envia a mensagem
    function executeUploadAndSendMessage(file, type, text) {

        if (!currentChatId) {
            alert("Selecione um contato primeiro para enviar arquivos!");
            clearAttachmentPreview();
            return;
        }

        const originalPlaceholder = messageInput.placeholder;
        messageInput.placeholder = `A carregar ${file.name}...`;
        messageInput.disabled = true;

        const resourceType = getResourceType(file.type);
        const formData = new FormData();

        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

        // UPLOAD PARA CLOUDINARY VIA FETCH
        fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                const downloadURL = data.secure_url;

                const parentCollection = currentChatPartnerEmail ? "chats" : "groups";
                const senderName = currentUser.displayName || currentUser.email.split('@')[0];

                // ENVIAR LINK PARA O FIRESTORE
                db.collection(parentCollection).doc(currentChatId).collection("messages").add({
                    text: downloadURL,
                    type: type,
                    senderEmail: currentUser.email,
                    senderName: senderName,
                    description: text,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                })
                .then(clearAttachmentPreview)
                .catch(err => { throw new Error("Erro ao salvar no Firestore: " + err.message); });

            } else {
                 throw new Error(data.error ? data.error.message : 'Upload falhou no Cloudinary');
            }
        })
        .catch(error => {
            alert(`Erro ao carregar ficheiro: ${error.message}.`);
            console.error("Erro no upload do Cloudinary:", error);
            clearAttachmentPreview();
        });
    }

    // ===========================================
    // LÓGICA DE GRAVAÇÃO DE ÁUDIO
    // ===========================================

    btnRecordAudio.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            stopRecording(true);
        } else {
            startRecording();
        }
    });

    function startRecording() {
        if (!currentChatId) { alert("Selecione uma conversa primeiro para gravar!"); return; }

        if (mediaRecorder && mediaRecorder.state === "recording") {
            stopRecording(false);
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                audioStream = stream;
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.start();
                btnRecordAudio.textContent = '⏹️ Parar';
                messageInput.placeholder = '🎙️ Gravando áudio...';
                messageInput.disabled = true;

                mediaRecorder.ondataavailable = event => {
                    audioChunks.push(event.data);
                };

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
                alert("Permissão de microfone negada.");
                console.error("Erro ao iniciar gravação:", err);
                messageInput.disabled = false;
                btnRecordAudio.textContent = '🎙️';
            });
    }

    function stopRecording(shouldKeepAudio = false) {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            if (!shouldKeepAudio) {
                audioChunks = [];
            }
            mediaRecorder.stop();
        }
    }

    // --- INTEGRAÇÃO COM O BOTÃO ENVIAR (messageForm) ---
    messageForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!currentChatId) { alert("Selecione uma conversa ou grupo primeiro!"); return; }

        if (currentChatPartnerEmail) {
            const userDocRef = db.collection("users").doc(currentUser.email);
            const userDoc = await userDocRef.get();
            const blockedUsers = userDoc.data().blockedUsers || [];

            if (blockedUsers.includes(currentChatPartnerEmail)) {
                alert("Você não pode enviar mensagens para um usuário bloqueado.");
                return;
            }
        }

        const text = messageInput.value;
        const parentCollection = currentChatPartnerEmail ? "chats" : "groups";
        const senderName = currentUser.displayName || currentUser.email.split('@')[0];

        // 1. SE HOUVER UM FICHEIRO EM PRÉ-VISUALIZAÇÃO (Áudio ou Anexo)
        if (attachmentFile) {
            executeUploadAndSendMessage(attachmentFile, attachmentType, text);
            return;
        }

        // 2. SE NÃO HOUVER FICHEIRO (Envio de texto puro)
        if (text.trim() === "") return;

        db.collection(parentCollection).doc(currentChatId).collection("messages").add({
            text: text,
            type: 'text',
            senderEmail: currentUser.email,
            senderName: senderName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            messageInput.value = "";
        })
        .catch((error) => {
            console.error("Erro ao enviar mensagem: ", error);
        });
    });

    // ===========================================
    // FUNÇÕES DE EXCLUIR E EDITAR MENSAGENS
    // ===========================================

    // Listener para o botão Excluir
    btnDeleteMessage.addEventListener('click', () => {
        if (selectedMessageDocRef && confirm("Tem certeza que deseja excluir esta mensagem?")) {
            selectedMessageDocRef.delete()
                .then(() => {
                    alert("Mensagem excluída com sucesso!");
                    messageOptionsMenu.hide();
                    selectedMessageDocRef = null;
                })
                .catch(error => {
                    alert("Erro ao excluir mensagem: " + error.message);
                });
        }
    });

    // Listener para o botão Editar (Abre o modal de edição)
    btnEditMessage.addEventListener('click', () => {
        if (selectedMessageDocRef) {
            editMessageTextarea.value = selectedMessageText;
            messageOptionsMenu.hide();
            editMessageModal.show();
        }
    });

    // Listener para o botão Salvar Edição
    btnSaveEdit.addEventListener('click', () => {
        const newText = editMessageTextarea.value.trim();
        if (!newText) return alert("A mensagem não pode estar vazia.");

        if (selectedMessageDocRef) {
            selectedMessageDocRef.update({
                text: newText,
                edited: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            })
            .then(() => {
                alert("Mensagem editada com sucesso!");
                editMessageModal.hide();
                selectedMessageDocRef = null;
            })
            .catch(error => {
                alert("Erro ao salvar edição: " + error.message);
            });
        }
    });

    // ===========================================
    // PESQUISA DE CONVERSAS
    // ===========================================
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const chatItems = document.querySelectorAll('.chat-item');

        chatItems.forEach(item => {
            const chatName = item.textContent.toLowerCase();
            if (chatName.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // ===========================================
    // GESTÃO DE CONTA
    // ===========================================
    btnAccount.addEventListener('click', () => {
        accountNameInput.value = currentUser.displayName;
        accountEmailInput.value = currentUser.email;
        accountPasswordInput.value = "";
        accountPasswordConfirmInput.value = "";
        accountModal.show();
    });

    btnSaveAccount.addEventListener('click', async () => {
        const newName = accountNameInput.value;
        const newPassword = accountPasswordInput.value;
        const newPasswordConfirm = accountPasswordConfirmInput.value;

        if (newName !== currentUser.displayName) {
            try {
                await currentUser.updateProfile({
                    displayName: newName
                });
                await db.collection("users").doc(currentUser.email).update({
                    name: newName
                });
                alert("Nome atualizado com sucesso!");
            } catch (error) {
                alert("Erro ao atualizar o nome: " + error.message);
            }
        }

        if (newPassword) {
            if (newPassword.length < 6) {
                alert("A nova senha deve ter pelo menos 6 caracteres.");
                return;
            }

            if (newPassword !== newPasswordConfirm) {
                alert("As senhas não coincidem.");
                return;
            }

            try {
                await currentUser.updatePassword(newPassword);
                alert("Senha atualizada com sucesso!");
            } catch (error) {
                alert("Erro ao atualizar a senha: " + error.message);
            }
        }

        accountModal.hide();
    });

    // ===========================================
    // ENCAMINHAR MENSAGEM
    // ===========================================
    btnForwardMessage.addEventListener('click', async () => {
        const userDoc = await db.collection("users").doc(currentUser.email).get();
        const contacts = userDoc.data().contacts || [];
        let listHTML = '';

        for (const contactEmail of contacts) {
            const contactDoc = await db.collection("users").doc(contactEmail).get();
            if (contactDoc.exists) {
                const contactName = contactDoc.data().name;
                listHTML += `<a href="#" class="list-group-item list-group-item-action" onclick="forwardMessageTo('${contactEmail}', 'user')">${contactName}</a>`;
            }
        }

        const groupsSnapshot = await db.collection("groups").where("members", "array-contains", currentUser.email).get();
        groupsSnapshot.forEach(doc => {
            const group = doc.data();
            listHTML += `<a href="#" class="list-group-item list-group-item-action" onclick="forwardMessageTo('${doc.id}', 'group')">${group.name} (Grupo)</a>`;
        });

        forwardContactsList.innerHTML = listHTML;
        messageOptionsMenu.hide();
        forwardMessageModal.show();
    });

    window.forwardMessageTo = async (targetId, type) => {
        if (!selectedMessageDocRef) {
            alert("Nenhuma mensagem selecionada para encaminhar.");
            return;
        }

        const messageToForward = await selectedMessageDocRef.get();
        const messageData = messageToForward.data();

        let newChatId;
        let collectionName;

        if (type === 'user') {
            newChatId = getChatId(currentUser.email, targetId);
            collectionName = 'chats';
        } else {
            newChatId = targetId;
            collectionName = 'groups';
        }

        try {
            await db.collection(collectionName).doc(newChatId).collection("messages").add({
                ...messageData,
                forwarded: true,
                originalSender: messageData.senderName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Mensagem encaminhada com sucesso!");
        } catch (error) {
            alert("Erro ao encaminhar a mensagem: " + error.message);
        }

        forwardMessageModal.hide();
    };

    // ===========================================
    // BLOQUEAR USUÁRIO
    // ===========================================
    btnBlockUser.addEventListener('click', async () => {
        if (!currentChatPartnerEmail) {
            alert("Selecione um contato para bloquear.");
            return;
        }

        const userDocRef = db.collection("users").doc(currentUser.email);
        const userDoc = await userDocRef.get();
        const blockedUsers = userDoc.data().blockedUsers || [];

        if (blockedUsers.includes(currentChatPartnerEmail)) {
            if (confirm("Você tem certeza que deseja desbloquear este usuário?")) {
                await userDocRef.update({
                    blockedUsers: firebase.firestore.FieldValue.arrayRemove(currentChatPartnerEmail)
                });
                alert("Usuário desbloqueado com sucesso!");
            }
        } else {
            if (confirm("Você tem certeza que deseja bloquear este usuário?")) {
                await userDocRef.update({
                    blockedUsers: firebase.firestore.FieldValue.arrayUnion(currentChatPartnerEmail)
                });
                alert("Usuário bloqueado com sucesso!");
            }
        }
    });
}
