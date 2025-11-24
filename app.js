// ===================================================================
// CONFIGURAÇÃO DO FIREBASE (SÓ AUTH E FIRESTORE)
// Substitua SEUS DADOS DE CONFIGURAÇÃO aqui:
// ===================================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
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
const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUDINARY_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_CLOUDINARY_UPLOAD_PRESET";

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

    // ELEMENTOS DE PRÉ-VISUALIZAÇÃO
    const attachmentPreview = document.getElementById("attachment-preview");
    const previewContent = document.getElementById("preview-content");
    const btnRemoveAttachment = document.getElementById("btn-remove-attachment");

    // ELEMENTOS DOS MODAIS DE OPÇÕES/EDIÇÃO
    const messageOptionsMenu = new bootstrap.Modal(document.getElementById('messageOptionsMenu'));
    const btnEditMessage = document.getElementById("btn-edit-message");
    const btnDeleteMessage = document.getElementById("btn-delete-message");

    const editMessageModal = new bootstrap.Modal(document.getElementById('editMessageModal'));
    const editMessageTextarea = document.getElementById("edit-message-text");
    const btnSaveEdit = document.getElementById("btn-save-edit");


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

    // VARIÁVEIS DE ESTADO PARA RESPOSTA
    let repliedMessage = null;
    const btnReplyMessage = document.getElementById("btn-reply-message");
    const replyPreview = document.getElementById("reply-preview");
    const replyPreviewText = document.getElementById("reply-preview-text");
    const btnCancelReply = document.getElementById("btn-cancel-reply");

    // VARIÁVEIS DE ESTADO PARA ENCAMINHAMENTO
    let messageToForward = null;
    const forwardMessageModal = new bootstrap.Modal(document.getElementById('forwardMessageModal'));
    const btnForwardMessage = document.getElementById("btn-forward-message");
    const forwardConversationList = document.getElementById("forward-conversation-list");
    const btnConfirmForward = document.getElementById("btn-confirm-forward");

    // VARIÁVEIS DE ESTADO PARA BLOQUEIO
    const btnBlockUser = document.getElementById("btn-block-user");


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
        if (!("Notification" in window)) return;
        Notification.requestPermission();
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
    function loadMessages(chatId, collectionName) {

        chatWindow.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div></div>';

        unsubscribeFromMessages = db.collection(collectionName).doc(chatId).collection("messages")
            .orderBy("createdAt", "asc")
            .onSnapshot((querySnapshot) => {

                querySnapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        const message = change.doc.data();

                        if (message.senderEmail !== currentUser.email && document.hidden && messaging) {
                             new Notification(`Nova mensagem de ${message.senderName}`, {
                                 body: message.type === 'text' ? message.text : `[${message.type.toUpperCase()}] Novo anexo`,
                             });
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
                    const senderEl = document.createElement('div');
                    senderEl.className = 'sender';
                    senderEl.textContent = senderDisplay;

                    const contentWrapperEl = document.createElement('div');
                    contentWrapperEl.className = 'message-content-wrapper d-flex align-items-center';

                    const textContentEl = document.createElement('div');
                    textContentEl.className = 'message-text-content';
                    textContentEl.innerHTML = contentHTML; // innerHTML is still used here for rich content like images/videos

                    contentWrapperEl.appendChild(textContentEl);

                    if (optionsHTML) {
                        const optionsEl = document.createElement('div');
                        optionsEl.innerHTML = optionsHTML;
                        contentWrapperEl.appendChild(optionsEl);
                    }

                    messageEl.appendChild(senderEl);
                    messageEl.appendChild(contentWrapperEl);

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
    messageForm.addEventListener("submit", (e) => {
        e.preventDefault();

        if (!currentChatId) { alert("Selecione uma conversa ou grupo primeiro!"); return; }

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
    // FUNÇÕES DE ENCAMINHAMENTO DE MENSAGENS
    // ===========================================

    btnForwardMessage.addEventListener('click', async () => {
        if (selectedMessageDocRef) {
            const messageDoc = await selectedMessageDocRef.get();
            if (messageDoc.exists) {
                messageToForward = messageDoc.data();
                messageOptionsMenu.hide();
                await loadConversationsForForwarding();
                forwardMessageModal.show();
            } else {
                alert("A mensagem original não foi encontrada.");
            }
        }
    });

    async function loadConversationsForForwarding() {
        const userDoc = await db.collection("users").doc(currentUser.email).get();
        const contacts = userDoc.data().contacts || [];
        let conversationHTML = '';

        for (const contactEmail of contacts) {
            const contactDoc = await db.collection("users").doc(contactEmail).get();
            if (contactDoc.exists) {
                const contactName = contactDoc.data().name;
                const chatId = getChatId(currentUser.email, contactEmail);
                conversationHTML += `
                    <div class="list-group-item">
                        <input class="form-check-input me-1" type="checkbox" value="${chatId}" data-type="chats" data-name="${contactName}">
                        ${contactName}
                    </div>`;
            }
        }

        const groupsSnapshot = await db.collection("groups").where("members", "array-contains", currentUser.email).get();
        groupsSnapshot.forEach(doc => {
            const group = doc.data();
            conversationHTML += `
                <div class="list-group-item">
                    <input class="form-check-input me-1" type="checkbox" value="${doc.id}" data-type="groups" data-name="${group.name}">
                    ${group.name} (Grupo)
                </div>`;
        });

        forwardConversationList.innerHTML = conversationHTML;
    }

    btnConfirmForward.addEventListener('click', async () => {
        const selectedConversations = forwardConversationList.querySelectorAll('input[type="checkbox"]:checked');
        if (selectedConversations.length === 0) {
            alert("Selecione pelo menos uma conversa para encaminhar.");
            return;
        }

        for (const checkbox of selectedConversations) {
            const chatId = checkbox.value;
            const chatType = checkbox.dataset.type;

            const newMessage = { ...messageToForward };
            newMessage.forwarded = true;
            newMessage.createdAt = firebase.firestore.FieldValue.serverTimestamp();

            await db.collection(chatType).doc(chatId).collection("messages").add(newMessage);
        }

        alert("Mensagem encaminhada com sucesso!");
        forwardMessageModal.hide();
    });

    // ===========================================
    // FUNÇÕES DE RESPOSTA A MENSAGENS
    // ===========================================

    btnReplyMessage.addEventListener('click', async () => {
        if (selectedMessageDocRef) {
            const messageDoc = await selectedMessageDocRef.get();
            if (messageDoc.exists) {
                repliedMessage = messageDoc.data();
                messageOptionsMenu.hide();
                displayReplyPreview();
            }
        }
    });

    function displayReplyPreview() {
        if (repliedMessage) {
            replyPreviewText.textContent = repliedMessage.text;
            replyPreview.classList.remove('d-none');
        }
    }

    btnCancelReply.addEventListener('click', () => {
        repliedMessage = null;
        replyPreview.classList.add('d-none');
    });

    // ===========================================
    // FUNÇÕES DE BLOQUEIO DE USUÁRIO
    // ===========================================

    btnBlockUser.addEventListener('click', async () => {
        if (!currentChatPartnerEmail) return;

        if (confirm(`Tem certeza que deseja bloquear este usuário? Você não poderá mais enviar ou receber mensagens dele.`)) {
            await db.collection("users").doc(currentUser.email).update({
                blockedUsers: firebase.firestore.FieldValue.arrayUnion(currentChatPartnerEmail)
            });
            alert("Usuário bloqueado com sucesso.");
            startChatWith(currentChatPartnerEmail, currentChatNameEl.textContent);
        }
    });

    async function isUserBlocked(userEmail, partnerEmail) {
        const userDoc = await db.collection("users").doc(userEmail).get();
        const userData = userDoc.data();
        return userData.blockedUsers && userData.blockedUsers.includes(partnerEmail);
    }
}