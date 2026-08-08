let audioCtx;
let sourceNode;
let pitchNode;
let mediaStream;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. Ignore broadcast messages meant for the Background script (like GET_STATE)
    const engineActions = ['PROCESS_STREAM', 'UPDATE_PITCH', 'STOP_STREAM'];
    if (!engineActions.includes(message.action)) {
        return false; // Returning false tells Chrome this listener won't respond
    }

    // 2. Handle only audio engine commands
    handleMessage(message).then(sendResponse).catch((err) => {
        console.error('Audio engine error:', err);
        sendResponse({ success: false, error: err.message });
    });
    
    return true; // Keep the message channel open for the async response
});

async function handleMessage(message) {
    if (message.action === 'PROCESS_STREAM') {
        await startEngine(message.streamId);
        return { success: true };
    }

    if (message.action === 'UPDATE_PITCH' && pitchNode) {
        const semitones = parseFloat(message.value);
        pitchNode.port.postMessage({ pitch: semitones });
        return { success: true };
    }

    if (message.action === 'STOP_STREAM') {
        await stopEngine();
        return { success: true };
    }

    return undefined;
}

async function startEngine(streamId) {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            },
            video: false
        });

        audioCtx = new AudioContext();

        // Load our custom DSP Worklet file as an ES Module
        await audioCtx.audioWorklet.addModule('dsp_worklet.js', { type: 'module' });

        pitchNode = new AudioWorkletNode(audioCtx, 'pitch-shift-processor');

        sourceNode = audioCtx.createMediaStreamSource(mediaStream);

        // Connect: Stream -> Pitch Processor -> Speakers
        sourceNode.connect(pitchNode);
        pitchNode.connect(audioCtx.destination);

        console.log("ScaleShift engine live: audio routed through DSP worklet.");
    } catch (err) {
        console.error("Failed to start audio engine:", err);
        await stopEngine(); // don't leave a half-built graph or open tracks behind
        reportError(describeStartError(err));
        throw err;
    }
}

async function stopEngine() {
    try {
        if (mediaStream) {
            mediaStream.getTracks().forEach((track) => track.stop());
        }
        if (sourceNode) sourceNode.disconnect();
        if (pitchNode) pitchNode.disconnect();
        if (audioCtx && audioCtx.state !== 'closed') {
            await audioCtx.close();
        }
    } catch (err) {
        console.error("Error while tearing down audio engine:", err);
    } finally {
        mediaStream = null;
        sourceNode = null;
        pitchNode = null;
        audioCtx = null;
    }
}

function reportError(message) {
    chrome.runtime.sendMessage({ action: 'ENGINE_ERROR', error: message }).catch(() => {});
}

function describeStartError(err) {
    if (err?.name === 'NotAllowedError') {
        return 'Audio permission was blocked for this tab.';
    }
    if (err?.name === 'NotFoundError') {
        return 'No audio track was found on this tab.';
    }
    return err?.message || 'Could not start the audio engine.';
}
