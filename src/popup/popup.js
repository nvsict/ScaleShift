document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.querySelector('.app');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const statusDot = document.getElementById('statusDot');
    const statusLabel = document.getElementById('statusLabel');
    const pitchSlider = document.getElementById('pitchSlider');
    const pitchValue = document.getElementById('pitchValue');
    const errorBanner = document.getElementById('errorBanner');

    const STATUS_LABELS = {
        idle: 'Idle',
        connecting: 'Connecting…',
        live: 'Live',
        error: 'Error'
    };

    function setStatus(state) {
        statusDot.className = `status__dot status__dot--${state}`;
        statusLabel.textContent = STATUS_LABELS[state] || 'Idle';
    }

    function showError(message) {
        errorBanner.textContent = message;
        errorBanner.hidden = false;
        setStatus('error');
    }

    function clearError() {
        errorBanner.hidden = true;
        errorBanner.textContent = '';
    }

    function setPitchDisplay(value) {
        const num = Number(value) || 0;
        pitchValue.textContent = num > 0 ? `+${num}` : `${num}`;
        pitchSlider.value = num;
    }

    function resetPitch() {
        if (pitchSlider.disabled) return;
        setPitchDisplay(0);
        chrome.storage.local.set({ pitch: 0 });
        chrome.runtime.sendMessage({ action: 'UPDATE_PITCH', value: 0 });
    }

    function enterIdleView() {
        appContainer.classList.remove('app--live');
        connectBtn.hidden = false;
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect to This Tab';
        disconnectBtn.hidden = true;
        pitchSlider.disabled = true;
        setStatus('idle');
    }

    function enterLiveView() {
        appContainer.classList.add('app--live');
        connectBtn.hidden = true;
        disconnectBtn.hidden = false;
        disconnectBtn.disabled = false;
        disconnectBtn.textContent = 'Disconnect';
        pitchSlider.disabled = false;
        setStatus('live');
        clearError();
    }

    function enterConnectingView() {
        appContainer.classList.remove('app--live');
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting…';
        setStatus('connecting');
        clearError();
    }

    chrome.runtime.sendMessage({ action: 'GET_STATE' }, (state) => {
        if (chrome.runtime.lastError || !state) {
            enterIdleView();
            return;
        }

        setPitchDisplay(state.pitch);

        if (state.isCapturing) {
            enterLiveView();
        } else {
            enterIdleView();
            if (state.lastError) {
                showError(state.lastError);
            }
        }
    });

    connectBtn.addEventListener('click', () => {
        enterConnectingView();

        chrome.runtime.sendMessage({ action: 'START_CAPTURE' }, (response) => {
            if (response && response.success) {
                enterLiveView();
            } else {
                enterIdleView();
                showError(response?.error || 'Could not connect to this tab.');
            }
        });
    });

    disconnectBtn.addEventListener('click', () => {
        disconnectBtn.disabled = true;
        disconnectBtn.textContent = 'Disconnecting…';

        chrome.runtime.sendMessage({ action: 'STOP_CAPTURE' }, () => {
            enterIdleView();
        });
    });

    pitchSlider.addEventListener('input', (event) => {
        const semitones = event.target.value;
        setPitchDisplay(semitones);
        chrome.storage.local.set({ pitch: Number(semitones) });
        chrome.runtime.sendMessage({ action: 'UPDATE_PITCH', value: semitones });
    });

    // Zero-out snap on double click
    pitchSlider.addEventListener('dblclick', resetPitch);
    pitchValue.addEventListener('dblclick', resetPitch);
    
    // Add visual hint that the number is interactive
    pitchValue.style.cursor = 'pointer';

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'ENGINE_ERROR') {
            enterIdleView();
            showError(message.error || 'The audio engine stopped unexpectedly.');
        }
    });
});