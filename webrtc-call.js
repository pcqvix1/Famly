/**
 * ==========================================
 * FAMLY CHAT - WEBRTC VOICE CALLS
 * ==========================================
 * Sistema de chamadas de voz usando WebRTC
 * Funciona em Web e Capacitor
 */

(function() {
    'use strict';

    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ];

    class VoiceCallManager {
        constructor() {
            this.peerConnection = null;
            this.localStream = null;
            this.remoteStream = null;
            this.currentCallId = null;
            this.currentChatId = null;
            this.currentUserId = null;
            this.isInitiator = false;
            this.callStartTime = null;
            this.callTimerInterval = null;
            this.isMuted = false;
            this.ringtoneAudio = null;
            this.remoteAudio = null;

            this.callStateListeners = new Set();
        }

        async initialize(userId) {
            this.currentUserId = userId;
            this.setupUI();
            this.setupFirestoreListeners();
            console.log('WebRTC Voice Call Manager initialized for:', userId);
        }

        setupUI() {
            const btnVoiceCall = document.getElementById('btn-voice-call');
            const btnEndCall = document.getElementById('btn-end-call');
            const btnAcceptCall = document.getElementById('btn-accept-call');
            const btnDeclineCall = document.getElementById('btn-decline-call');
            const btnMuteCall = document.getElementById('btn-mute-call');
            const btnSpeaker = document.getElementById('btn-speaker');

            this.ringtoneAudio = document.getElementById('ringtone');
            this.remoteAudio = document.getElementById('remote-audio');

            if (btnVoiceCall) {
                btnVoiceCall.addEventListener('click', () => this.startCall());
            }

            if (btnEndCall) {
                btnEndCall.addEventListener('click', () => this.endCall());
            }

            if (btnAcceptCall) {
                btnAcceptCall.addEventListener('click', () => this.acceptCall());
            }

            if (btnDeclineCall) {
                btnDeclineCall.addEventListener('click', () => this.declineCall());
            }

            if (btnMuteCall) {
                btnMuteCall.addEventListener('click', () => this.toggleMute());
            }

            if (btnSpeaker) {
                btnSpeaker.addEventListener('click', () => this.toggleSpeaker());
            }
        }

        setupFirestoreListeners() {
            if (!firebase?.firestore || !this.currentUserId) return;

            const db = firebase.firestore();

            db.collection('calls')
                .where('participants', 'array-contains', this.currentUserId)
                .where('status', 'in', ['ringing', 'active'])
                .onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        const call = change.doc.data();
                        const callId = change.doc.id;

                        if (change.type === 'added' || change.type === 'modified') {
                            this.handleIncomingCallUpdate(callId, call);
                        }
                    });
                });
        }

        async handleIncomingCallUpdate(callId, call) {
            if (call.callerId === this.currentUserId) {
                if (call.status === 'declined' || call.status === 'ended') {
                    this.showCallStatus('Chamada recusada');
                    this.cleanup();
                } else if (call.status === 'active' && call.answer) {
                    await this.handleAnswer(call.answer);
                }
                return;
            }

            if (call.status === 'ringing' && !this.currentCallId) {
                this.showIncomingCallNotification(callId, call);
            } else if (call.status === 'ended') {
                this.cleanup();
            }
        }

        showIncomingCallNotification(callId, call) {
            this.currentCallId = callId;
            this.currentChatId = call.chatId;

            const notification = document.getElementById('incoming-call-notification');
            const avatar = document.getElementById('incoming-call-avatar');
            const name = document.getElementById('incoming-call-name');

            if (name) name.textContent = call.callerName || 'Contato';

            if (call.callerPhoto && avatar) {
                avatar.innerHTML = `<img src="${call.callerPhoto}" alt="Avatar">`;
            }

            if (notification) {
                notification.classList.add('show');
            }

            if (this.ringtoneAudio) {
                this.ringtoneAudio.play().catch(err => console.warn('Ringtone play failed:', err));
            }

            if (window.vibrate) {
                window.vibrate();
            }
        }

        async startCall() {
            try {
                if (!this.currentChatId) {
                    console.error('No chat selected');
                    return;
                }

                this.isInitiator = true;

                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });

                this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });

                this.setupPeerConnectionListeners();

                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);

                const callData = {
                    chatId: this.currentChatId,
                    callerId: this.currentUserId,
                    callerName: firebase.auth().currentUser?.displayName || 'Usuário',
                    callerPhoto: firebase.auth().currentUser?.photoURL || null,
                    participants: this.getParticipants(),
                    offer: {
                        type: offer.type,
                        sdp: offer.sdp
                    },
                    status: 'ringing',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                const db = firebase.firestore();
                const callRef = await db.collection('calls').add(callData);
                this.currentCallId = callRef.id;

                this.showCallOverlay('Chamando...');
                this.updateCallUI();

            } catch (error) {
                console.error('Error starting call:', error);
                this.showCallStatus('Erro ao iniciar chamada');
                this.cleanup();
            }
        }

        async acceptCall() {
            try {
                const db = firebase.firestore();
                const callDoc = await db.collection('calls').doc(this.currentCallId).get();
                const call = callDoc.data();

                if (!call || call.status !== 'ringing') {
                    console.error('Invalid call state');
                    return;
                }

                this.hideIncomingCallNotification();

                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });

                this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });

                this.setupPeerConnectionListeners();

                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));

                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);

                await db.collection('calls').doc(this.currentCallId).update({
                    answer: {
                        type: answer.type,
                        sdp: answer.sdp
                    },
                    status: 'active'
                });

                this.showCallOverlay('Conectado');
                this.startCallTimer();
                this.updateCallUI();

            } catch (error) {
                console.error('Error accepting call:', error);
                this.showCallStatus('Erro ao aceitar chamada');
                this.cleanup();
            }
        }

        async handleAnswer(answer) {
            try {
                if (!this.peerConnection) return;

                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

                this.showCallStatus('Conectado');
                this.startCallTimer();

            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }

        async declineCall() {
            if (this.currentCallId) {
                const db = firebase.firestore();
                await db.collection('calls').doc(this.currentCallId).update({
                    status: 'declined'
                });
            }
            this.hideIncomingCallNotification();
            this.cleanup();
        }

        async endCall() {
            if (this.currentCallId) {
                const db = firebase.firestore();
                await db.collection('calls').doc(this.currentCallId).update({
                    status: 'ended',
                    endedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            this.cleanup();
        }

        setupPeerConnectionListeners() {
            if (!this.peerConnection) return;

            this.peerConnection.ontrack = (event) => {
                if (event.streams && event.streams[0]) {
                    this.remoteStream = event.streams[0];
                    if (this.remoteAudio) {
                        this.remoteAudio.srcObject = this.remoteStream;
                    }
                }
            };

            this.peerConnection.onicecandidate = async (event) => {
                if (event.candidate && this.currentCallId) {
                    const db = firebase.firestore();
                    const field = this.isInitiator ? 'callerCandidates' : 'calleeCandidates';

                    await db.collection('calls').doc(this.currentCallId).update({
                        [field]: firebase.firestore.FieldValue.arrayUnion({
                            candidate: event.candidate.candidate,
                            sdpMid: event.candidate.sdpMid,
                            sdpMLineIndex: event.candidate.sdpMLineIndex
                        })
                    });
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);

                if (this.peerConnection.iceConnectionState === 'connected') {
                    this.showCallStatus('Conectado');
                    if (!this.callTimerInterval) {
                        this.startCallTimer();
                    }
                } else if (this.peerConnection.iceConnectionState === 'disconnected' ||
                           this.peerConnection.iceConnectionState === 'failed') {
                    this.showCallStatus('Desconectado');
                    this.endCall();
                }
            };

            if (this.currentCallId) {
                this.listenForIceCandidates();
            }
        }

        listenForIceCandidates() {
            const db = firebase.firestore();
            const field = this.isInitiator ? 'calleeCandidates' : 'callerCandidates';

            db.collection('calls').doc(this.currentCallId).onSnapshot(snapshot => {
                const call = snapshot.data();
                if (call && call[field]) {
                    call[field].forEach(candidate => {
                        if (this.peerConnection) {
                            this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                                .catch(err => console.warn('Error adding ICE candidate:', err));
                        }
                    });
                }
            });
        }

        toggleMute() {
            if (!this.localStream) return;

            this.isMuted = !this.isMuted;
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });

            const muteBtn = document.getElementById('btn-mute-call');
            if (muteBtn) {
                const icon = muteBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isMuted ? 'bi bi-mic-mute-fill' : 'bi bi-mic-fill';
                }
                muteBtn.classList.toggle('active', this.isMuted);
            }
        }

        toggleSpeaker() {
            if (!window.isCapacitor) return;

            const speakerBtn = document.getElementById('btn-speaker');
            if (speakerBtn) {
                speakerBtn.classList.toggle('active');
            }
        }

        showCallOverlay(status) {
            const overlay = document.getElementById('voice-call-overlay');
            const statusText = document.getElementById('call-status-text');
            const contactName = document.getElementById('call-contact-name');

            if (statusText) statusText.textContent = status;
            if (contactName && window.currentContactData) {
                contactName.textContent = window.currentContactData.name || 'Contato';
            }

            if (overlay) {
                overlay.classList.add('show');
            }

            this.hideIncomingCallNotification();
        }

        showCallStatus(message) {
            const statusText = document.getElementById('call-status-text');
            if (statusText) {
                statusText.textContent = message;
            }
        }

        updateCallUI() {
            const avatar = document.getElementById('call-avatar');
            const contactName = document.getElementById('call-contact-name');

            if (window.currentContactData) {
                if (contactName) {
                    contactName.textContent = window.currentContactData.name || 'Contato';
                }

                if (avatar && window.currentContactData.photoURL) {
                    avatar.innerHTML = `<img src="${window.currentContactData.photoURL}" alt="Avatar">`;
                }
            }
        }

        hideIncomingCallNotification() {
            const notification = document.getElementById('incoming-call-notification');
            if (notification) {
                notification.classList.remove('show');
            }

            if (this.ringtoneAudio) {
                this.ringtoneAudio.pause();
                this.ringtoneAudio.currentTime = 0;
            }
        }

        hideCallOverlay() {
            const overlay = document.getElementById('voice-call-overlay');
            if (overlay) {
                overlay.classList.remove('show');
            }
        }

        startCallTimer() {
            this.callStartTime = Date.now();
            const timerElement = document.getElementById('call-timer');

            if (timerElement) {
                timerElement.style.display = 'block';
            }

            const statusElement = document.getElementById('call-status-text');
            if (statusElement) {
                statusElement.style.display = 'none';
            }

            this.callTimerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;

                if (timerElement) {
                    timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                }
            }, 1000);
        }

        stopCallTimer() {
            if (this.callTimerInterval) {
                clearInterval(this.callTimerInterval);
                this.callTimerInterval = null;
            }

            const timerElement = document.getElementById('call-timer');
            if (timerElement) {
                timerElement.style.display = 'none';
            }

            const statusElement = document.getElementById('call-status-text');
            if (statusElement) {
                statusElement.style.display = 'block';
            }
        }

        getParticipants() {
            if (!this.currentChatId || !this.currentUserId) return [];

            const participants = [this.currentUserId];

            if (window.currentContactData?.email) {
                participants.push(window.currentContactData.email);
            }

            return participants;
        }

        cleanup() {
            this.stopCallTimer();

            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            if (this.remoteStream) {
                this.remoteStream = null;
            }

            if (this.remoteAudio) {
                this.remoteAudio.srcObject = null;
            }

            this.hideCallOverlay();
            this.hideIncomingCallNotification();

            this.currentCallId = null;
            this.isInitiator = false;
            this.isMuted = false;
            this.callStartTime = null;
        }

        setCurrentChat(chatId, contactData) {
            this.currentChatId = chatId;
            window.currentContactData = contactData;

            const btnVoiceCall = document.getElementById('btn-voice-call');
            if (btnVoiceCall && contactData && !contactData.isGroup) {
                btnVoiceCall.style.display = 'flex';
            } else if (btnVoiceCall) {
                btnVoiceCall.style.display = 'none';
            }
        }
    }

    window.VoiceCallManager = new VoiceCallManager();

    document.addEventListener('DOMContentLoaded', () => {
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                window.VoiceCallManager.initialize(user.email);
            }
        });
    });

    console.log('WebRTC Call Manager loaded');

})();
