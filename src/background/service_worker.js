const OFFSCREEN_PATH = 'offscreen/index.html';
const BADGE_ON_COLOR = '#30D158'; // Apple system green

// In-memory ground truth for which tab (if any) is currently being captured.
let capturedTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === "START_CAPTURE") {
        startAudioCapture()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.action === "STOP_CAPTURE") {
        stopAudioCapture()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.action === "UPDATE_PITCH") {
        // Forward pitch to the offscreen document
        chrome.runtime.sendMessage(message).catch(() => {});
        return true;
    }

    if (message.action === "GET_STATE") {
        getRealCaptureState().then((isActive) => {
            chrome.storage.local.get(['pitch', 'lastError'], (data) => {
                sendResponse({
                    isCapturing: isActive,
                    pitch: data.pitch || 0,
                    lastError: isActive ? null : (data.lastError || null)
                });
            });
        });
        return true;
    }

    if (message.action === "ENGINE_ERROR") {
        handleEngineError(message.error);
        chrome.runtime.sendMessage(message).catch(() => {});
        return;
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === capturedTabId) {
        stopAudioCapture();
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === capturedTabId && changeInfo.status === 'loading' && changeInfo.url) {
        stopAudioCapture();
    }
});

chrome.runtime.onStartup.addListener(() => {
    capturedTabId = null;
    chrome.storage.local.set({ isCapturing: false });
    updateBadge(false);
});

chrome.runtime.onInstalled.addListener(() => {
    capturedTabId = null;
    chrome.storage.local.set({ isCapturing: false });
    updateBadge(false);
});

async function startAudioCapture() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");

    await setupOffscreenDocument(OFFSCREEN_PATH);

    return new Promise((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, async (streamId) => {
            if (chrome.runtime.lastError || !streamId) {
                reject(new Error(chrome.runtime.lastError?.message || "Could not get a stream ID for this tab."));
                return;
            }

            try {
                await chrome.runtime.sendMessage({ action: 'PROCESS_STREAM', streamId });
                
                // HYDRATION: Force audio engine to match saved state
                const storageData = await chrome.storage.local.get(['pitch']);
                const savedPitch = storageData.pitch || 0;
                await chrome.runtime.sendMessage({ action: 'UPDATE_PITCH', value: savedPitch }).catch(() => {});
                
            } catch (e) {
                // Offscreen doc may still be finishing its first load — non-fatal.
            }

            capturedTabId = tab.id;
            await chrome.storage.local.set({ isCapturing: true, capturedTabId: tab.id, lastError: null });
            updateBadge(true);
            resolve();
        });
    });
}

async function stopAudioCapture() {
    try {
        await chrome.runtime.sendMessage({ action: 'STOP_STREAM' });
    } catch (e) {
        // Offscreen doc may already be gone
    }

    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });
    if (existingContexts.length > 0) {
        await chrome.offscreen.closeDocument();
    }

    capturedTabId = null;
    await chrome.storage.local.set({ isCapturing: false });
    updateBadge(false);
}

function handleEngineError(errorMessage) {
    capturedTabId = null;
    chrome.storage.local.set({ isCapturing: false, lastError: errorMessage || 'Unknown engine error.' });
    updateBadge(false);
}

async function setupOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
        url: path,
        reasons: ['USER_MEDIA'],
        justification: 'Real-time audio processing for pitch shifting'
    });
}

async function getRealCaptureState() {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });
    const isActive = existingContexts.length > 0;

    if (!isActive) {
        capturedTabId = null;
        chrome.storage.local.set({ isCapturing: false });
        updateBadge(false);
    }

    return isActive;
}

function updateBadge(isActive) {
    chrome.action.setBadgeText({ text: isActive ? 'ON' : '' });
    if (isActive) {
        chrome.action.setBadgeBackgroundColor({ color: BADGE_ON_COLOR });
    }
}