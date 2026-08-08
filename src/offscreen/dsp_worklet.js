import { SoundTouch, SimpleFilter } from './soundtouch.js?v=2';

// Hard cap on how much un-consumed audio we'll hold in the input buffer.
// Under normal conditions extract() keeps this near-empty every process()
// call. This cap only matters if the tab stalls or the filter falls behind —
// without it, a lagging stream would grow this buffer unbounded and leak
// memory for as long as the tab stays captured.
const MAX_BUFFERED_SECONDS = 2;
const MAX_BUFFERED_SAMPLES = 44100 * MAX_BUFFERED_SECONDS * 2; // stereo

const MIN_SEMITONES = -24;
const MAX_SEMITONES = 24;

class PitchShiftProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // A fresh AudioContext (and therefore a fresh instance of this
        // processor) is created on every capture start/stop cycle, so
        // inputBuffer always begins empty here — no stale audio can
        // survive a stop/restart by construction.
        this.soundTouch = new SoundTouch();
        this.pitchRatio = 1.0;
        this.inputBuffer = new Float32Array(0);

        // ==========================================
        // DSP MUSIC OPTIMIZATION
        // Forces SoundTouch out of "Speech Mode"
        // Parameters: SampleRate, SequenceMs, SeekWindowMs, OverlapMs
        // ==========================================
        this.soundTouch.stretch.setParameters(44100, 82, 28, 8);

        // THE BULLETPROOF STREAM ADAPTER
        const liveStreamSource = {
            extract: (targetArray, numFrames, position) => {
                const requestedSamples = numFrames * 2; // Stereo
                const availableSamples = this.inputBuffer.length;

                const samplesToExtract = Math.min(availableSamples, requestedSamples);

                // 1. Copy available live audio into the target array
                targetArray.set(this.inputBuffer.subarray(0, samplesToExtract));
                this.inputBuffer = this.inputBuffer.subarray(samplesToExtract);

                // 2. CRITICAL FIX: If the live stream lags, pad the remaining space with silence.
                // Never return less than numFrames, or SoundTouch triggers EOF and shuts down.
                if (samplesToExtract < requestedSamples) {
                    targetArray.fill(0, samplesToExtract);
                }

                return numFrames;
            }
        };

        this.filter = new SimpleFilter(liveStreamSource, this.soundTouch);

        this.port.onmessage = (event) => {
            if (event.data.pitch !== undefined) {
                const parsed = parseFloat(event.data.pitch);
                if (Number.isNaN(parsed)) return; // ignore garbage input, keep last good pitch

                const semitones = Math.min(MAX_SEMITONES, Math.max(MIN_SEMITONES, parsed));
                this.pitchRatio = Math.pow(2, semitones / 12);
                this.soundTouch.pitch = this.pitchRatio;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || input.length === 0 || !input[0]) return true;

        const leftInput = input[0];
        const rightInput = input.length > 1 ? input[1] : input[0];
        const frameCount = leftInput.length;

        // Interleave the incoming audio
        const interleaved = new Float32Array(frameCount * 2);
        for (let i = 0; i < frameCount; i++) {
            interleaved[i * 2] = leftInput[i];
            interleaved[i * 2 + 1] = rightInput[i];
        }

        // Append to our holding buffer
        const newBuffer = new Float32Array(this.inputBuffer.length + interleaved.length);
        newBuffer.set(this.inputBuffer);
        newBuffer.set(interleaved, this.inputBuffer.length);
        this.inputBuffer = newBuffer;

        // Safety valve: if the buffer has grown past our cap (filter falling
        // behind for a sustained period), drop the oldest samples rather
        // than let memory grow without bound. Keeps a fixed worst-case
        // memory footprint no matter how long a session runs.
        if (this.inputBuffer.length > MAX_BUFFERED_SAMPLES) {
            this.inputBuffer = this.inputBuffer.subarray(this.inputBuffer.length - MAX_BUFFERED_SAMPLES);
        }

        // Extract processed audio
        const processedAudio = new Float32Array(frameCount * 2);
        const framesExtracted = this.filter.extract(processedAudio, frameCount);

        const leftOutput = output[0];
        const rightOutput = output.length > 1 ? output[1] : output[0];

        // De-interleave and push to speakers
        for (let i = 0; i < frameCount; i++) {
            if (i < framesExtracted) {
                leftOutput[i] = processedAudio[i * 2];
                if (output.length > 1) rightOutput[i] = processedAudio[i * 2 + 1];
            } else {
                leftOutput[i] = 0;
                if (output.length > 1) rightOutput[i] = 0;
            }
        }

        return true;
    }
}

registerProcessor('pitch-shift-processor', PitchShiftProcessor);
