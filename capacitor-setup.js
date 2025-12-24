// ==========================================
// CAPACITOR SETUP - VERSÃO CORRIGIDA (SEM IMPORTS)
// ==========================================

(async function() {
    'use strict';

    // Detectar plataforma
    window.isCapacitor = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
    
    console.log('🚀 Plataforma:', window.isCapacitor ? 'Android/iOS Nativo' : 'Web Browser');

    if (!window.isCapacitor) {
        console.log('🌐 Modo Web - Recursos nativos desabilitados');
        window.capacitorReady = Promise.resolve(false);
        return;
    }

    // ==========================================
    // AGUARDAR CAPACITOR ESTAR PRONTO
    // ==========================================
    
    await new Promise(resolve => {
        if (Capacitor.isPluginAvailable('App')) {
            resolve();
        } else {
            setTimeout(resolve, 100);
        }
    });

    console.log('✅ Capacitor pronto!');

    // ==========================================
    // 1. UTILITÁRIOS
    // ==========================================

    // Tirar foto
    window.takePicture = async function() {
        try {
            if (!Capacitor.isPluginAvailable('Camera')) {
                throw new Error('Plugin Camera não disponível');
            }

            const photo = await Capacitor.Plugins.Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: 'Uri',
                source: 'CAMERA'
            });

            return photo.webPath;
        } catch (error) {
            console.error('❌ Erro ao tirar foto:', error);
            return null;
        }
    };

    // Escolher da galeria
    window.pickFile = async function() {
        try {
            if (!Capacitor.isPluginAvailable('Camera')) {
                throw new Error('Plugin Camera não disponível');
            }

            const photo = await Capacitor.Plugins.Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: 'Uri',
                source: 'PHOTOS'
            });

            return photo.webPath;
        } catch (error) {
            console.error('❌ Erro ao escolher arquivo:', error);
            return null;
        }
    };

    // Vibrar
    window.vibrate = async function() {
        try {
            if (!Capacitor.isPluginAvailable('Haptics')) return;
            
            await Capacitor.Plugins.Haptics.impact({ style: 'MEDIUM' });
        } catch (error) {
            console.error('❌ Erro ao vibrar:', error);
        }
    };

    // ==========================================
    // 2. NOTIFICAÇÕES PUSH (CRÍTICO)
    // ==========================================

    window.initNativeNotifications = async function() {
        console.log('🔔 Configurando notificações push...');

        if (!Capacitor.isPluginAvailable('PushNotifications')) {
            console.error('❌ Plugin PushNotifications não disponível');
            return;
        }

        try {
            const PushNotifications = Capacitor.Plugins.PushNotifications;

            // A. Solicitar permissão
            const permResult = await PushNotifications.requestPermissions();
            
            if (permResult.receive !== 'granted') {
                console.warn('⚠️ Permissão negada pelo usuário');
                return;
            }

            console.log('✅ Permissão concedida!');

            // Canal de alta prioridade para heads-up (Android)
            if (Capacitor.getPlatform && Capacitor.getPlatform() === 'android') {
                try {
                    if (PushNotifications.createChannel) {
                        await PushNotifications.createChannel({
                            id: 'high_messages',
                            name: 'Mensagens',
                            description: 'Notificações de mensagens',
                            importance: 5, // IMPORTANCE_HIGH
                            visibility: 1, // PUBLIC
                            sound: 'default',
                            vibration: true,
                            lights: true,
                            lightColor: '#00a884'
                        });
                    }
                } catch (channelErr) {
                    console.warn('Não foi possível criar canal de alta prioridade', channelErr);
                }
            }

            // B. Registrar no FCM
            await PushNotifications.register();
            console.log('📡 Registro FCM iniciado...');

            // C. Token recebido
            await PushNotifications.addListener('registration', (token) => {
                console.log('🎯 FCM Token:', token.value);
                
                // Apenas notifica o app.js, que será responsável por salvar o token.
                window.dispatchEvent(new CustomEvent('native-token-ready', { 
                    detail: { token: token.value } 
                }));
            });

            // D. Erro no registro
            await PushNotifications.addListener('registrationError', (error) => {
                console.error('❌ Erro FCM:', error);
            });

            // E. Notificação recebida (app aberto)
            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('📬 Notificação recebida:', notification.title);
                
                window.vibrate();
                
                window.dispatchEvent(new CustomEvent('push-received', { 
                    detail: notification 
                }));
            });

            // F. Clique na notificação
            await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                console.log('👆 Notificação clicada');
                
                const chatId = action.notification.data?.chatId;
                
                if (chatId) {
                    localStorage.setItem('pending_chat_redirect', chatId);
                    
                    if (window.location.pathname.includes('chat.html')) {
                        window.location.reload();
                    } else {
                        window.location.href = 'chat.html';
                    }
                }
            });

            // G. Limpar badges ao retomar
            if (Capacitor.isPluginAvailable('App')) {
                await Capacitor.Plugins.App.addListener('resume', async () => {
                    await PushNotifications.removeAllDeliveredNotifications();
                });
            }

            console.log('✅ Sistema de notificações configurado!');

        } catch (error) {
            console.error('❌ Erro fatal nas notificações:', error);
        }
    };

    // ==========================================
    // 3. INICIALIZAÇÃO AUTOMÁTICA
    // ==========================================

    // A inicialização será controlada pelo app.js após o login do usuário.

    // Sinalizar que está pronto
    window.capacitorReady = Promise.resolve(true);
    window.dispatchEvent(new Event('capacitor-ready'));

    console.log('🎉 Capacitor inicializado com sucesso!');

})();