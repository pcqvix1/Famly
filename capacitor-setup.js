// Importar plugins do Capacitor
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Verificar se está rodando no Capacitor
window.isCapacitor = window.Capacitor !== undefined;

// Função para tirar foto
window.takePicture = async function() {
    try {
        const image = await Camera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera
        });
        
        return image.webPath;
    } catch (error) {
        console.error('Erro ao tirar foto:', error);
        return null;
    }
};

// Função para escolher arquivo
window.pickFile = async function() {
    try {
        const image = await Camera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.Uri,
            source: CameraSource.Photos
        });
        
        return image.webPath;
    } catch (error) {
        console.error('Erro ao escolher arquivo:', error);
        return null;
    }
};

// Função para vibrar
window.vibrate = async function(duration = 200) {
    if (window.isCapacitor) {
        await Haptics.impact({ style: ImpactStyle.Medium });
    } else if (navigator.vibrate) {
        navigator.vibrate(duration);
    }
};

// Função para mostrar notificação local
window.showLocalNotification = async function(title, body) {
    if (!window.isCapacitor) return;
    
    await LocalNotifications.schedule({
        notifications: [
            {
                title: title,
                body: body,
                id: Date.now(),
                schedule: { at: new Date(Date.now() + 1000) },
                sound: 'default',
                smallIcon: 'ic_stat_icon_config_sample'
            }
        ]
    });
};

// Monitorar conexão
if (window.isCapacitor) {
    Network.addListener('networkStatusChange', status => {
        if (status.connected) {
            console.log('Conectado à internet');
        } else {
            console.log('Sem conexão');
            if (window.showToast) {
                window.showToast('Sem conexão com a internet', 'error');
            }
        }
    });
}