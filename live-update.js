/**
 * ==========================================
 * FAMLY CHAT - LIVE UPDATE SIMPLES
 * ==========================================
 * Usa Capawesome Cloud para gerenciar atualizações
 */

(async function() {
    'use strict';

    // Só funciona em ambiente nativo
    if (!window.isCapacitor) {
        console.log('Live Update: Modo Web - Desabilitado');
        return;
    }

    const LiveUpdate = window.Capacitor?.Plugins?.LiveUpdate;
    if (!LiveUpdate) {
        console.warn('Plugin Live Update não encontrado');
        return;
    }

    console.log('🔄 Live Update inicializado');

    // ==========================================
    // FUNÇÕES SIMPLES
    // ==========================================

    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        if (!toast || !toastMessage) return;

        const icon = toast.querySelector('i');
        toastMessage.textContent = message;
        toast.className = 'toast ' + type;
        if (icon) {
            icon.className = type === 'success' 
                ? 'bi bi-check-circle-fill' 
                : 'bi bi-info-circle-fill';
        }

        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    /**
     * Verifica e aplica atualizações automaticamente
     */
    async function checkAndUpdate(silent = true) {
        try {
            if (!silent) {
                showToast('Verificando atualizações...', 'info');
            }

            // Busca atualizações da Capawesome Cloud
            const result = await LiveUpdate.sync();

            if (result?.nextBundleId) {
                console.log('📦 Nova atualização disponível:', result.nextBundleId);
                
                if (!silent) {
                    showToast('Atualização aplicada!', 'success');
                }

                // Aplica a atualização
                await LiveUpdate.reload();
            } else {
                console.log('✅ App está atualizado');
                
                if (!silent) {
                    showToast('Você já está na versão mais recente', 'success');
                }
            }

        } catch (error) {
            console.error('❌ Erro ao atualizar:', error);
            
            if (!silent) {
                showToast('Erro ao verificar atualizações', 'error');
            }
        }
    }

    /**
     * Obtém informações sobre o bundle atual
     */
    async function getCurrentVersion() {
        try {
            const bundle = await LiveUpdate.getBundle();
            return bundle || { id: 'original', version: '1.0.0' };
        } catch (error) {
            console.error('Erro ao obter versão:', error);
            return { id: 'original', version: '1.0.0' };
        }
    }

    /**
     * Reseta para a versão original da loja
     */
    async function resetToOriginal() {
        try {
            const result = confirm('Deseja reverter para a versão original da loja?');
            if (!result) return;

            showToast('Revertendo...', 'info');

            await LiveUpdate.reset();
            await LiveUpdate.reload();

        } catch (error) {
            console.error('Erro ao reverter:', error);
            showToast('Erro ao reverter', 'error');
        }
    }

    // ==========================================
    // VERIFICAÇÃO AUTOMÁTICA
    // ==========================================

    // Verifica ao iniciar (depois de 3 segundos)
    setTimeout(() => checkAndUpdate(true), 3000);

    // Verifica a cada 1 hora
    setInterval(() => checkAndUpdate(true), 3600000);

    // Verifica quando o app volta do background
    if (window.Capacitor?.Plugins?.App) {
        window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
                checkAndUpdate(true);
            }
        });
    }

    // ==========================================
    // API PÚBLICA (para usar nas configurações)
    // ==========================================

    window.LiveUpdateManager = {
        checkForUpdates: () => checkAndUpdate(false),
        getCurrentVersion,
        resetToOriginal,
        sync: () => LiveUpdate.sync(),
        reload: () => LiveUpdate.reload()
    };

    console.log('✅ Live Update pronto!');

})();