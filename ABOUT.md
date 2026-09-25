# About the Project: CaptaloxSubs

### Live Real-Time Subtitles and Streaming Translation for Nerdearla 2026

---

## 💡 Inspiration

Conferences like **Nerdearla** bring together world-class engineers, open-source contributors, and tech leaders from across the globe. However, live technical talks present a major accessibility barrier:
1. Non-native speakers often struggle to follow rapid-fire English or Spanish technical discourse filled with jargon, acronyms, and frameworks.
2. Hearing-impaired attendees are frequently left out when live human stenographers are unavailable due to prohibitive costs.
3. Conventional AI subtitling systems suffer from the **"sentence-completion trap"**: they wait for the speaker to finish a full sentence and pause, then send the whole block to a translation API. This introduces an immersion-breaking lag of $5\text{ to }15\text{ seconds}$, completely disconnecting the audience from the slides and live speaker.

Our inspiration was simple yet ambitious: **What if we could deliver word-by-word, real-time live translation with imperceptible latency, directly to the stage projector and attendees' phones, completely free ($0 budget)?** That vision became **CaptaloxSubs**.

---

## ⚡ What It Does

CaptaloxSubs is an end-to-end, multi-stage live captioning and translation platform:

- **Word-by-Word Live Streaming**: Instead of waiting for full paragraphs, subtitles stream token-by-token in real time ($\approx 200 - 300\text{ ms}$ per burst). As the speaker speaks in English, Spanish subtitles appear synchronously on screen.
- **Full Bidirectional Support**:
  $$\text{English} \longleftrightarrow \text{Spanish}$$
  Presenters can speak in English (translating to Spanish for regional audiences) or in Spanish (translating to English for international attendees).
- **Flexible Audio Ingestion**:
  - **Direct Chrome Tab Capture (YouTube / Streaming)**: Ingests tab audio via `getDisplayMedia` with zero virtual cables or hardware splitters.
  - **Microphone / Soundboard Line-In**: High-fidelity stage microphone capture.
  - **WAV File Player**: Deterministic local replay at 1x real-time speed for automated rehearsal.
- **Dual-Port Security Architecture**:
  - **Port 3000 (Operator/Stage Manager)**: Full control panel, session selection, audio monitoring, and stats.
  - **Port 3001 (Audience Visor)**: High-speed, read-only viewer isolated from sensitive routes and administrative settings.
- **Instant Mobile Access via Local QR Code**: The presenter dashboard dynamically generates a QR code bound to the venue's local Wi-Fi IP address. Attendees simply point their smartphone camera and view subtitles in their palm with zero app installs.
- **Auditorium & Broadcast Modes**:
  - **Stage / Fullscreen Mode**: High-contrast, scalable typography for giant LED auditorium screens.
  - **OBS / vMix Overlay**: Transparent background overlay (`/viewer?session=A&overlay=1`) for Twitch, YouTube, and hybrid event broadcasts.
  - **Instant Export**: Full transcription download in both `.txt` and time-synchronized `.srt` subtitle formats.

---

## 🛠️ How We Built It

CaptaloxSubs was engineered from the ground up with a clean, dependency-lean stack optimized for raw throughput and zero-allocation streaming:

```text
┌──────────────────────┐        16-bit 16kHz PCM        ┌─────────────────────────┐
│ Chrome Tab / Mic /   │ ─────────────────────────────> │ Custom AudioWorklet     │
│ WAV Audio Stream     │   (100 ms packetization)       │ (pcm-worklet.js)        │
└──────────────────────┘                                └───────────┬─────────────┘
                                                                    │ WebSocket
                                                                    ▼
┌──────────────────────┐        Low-Latency WebSocket   ┌─────────────────────────┐
│ Google Gemini Live   │ <════════════════════════════> │ Node.js Core Server     │
│ Live Translate Model │     Bidirectional Tokens       │ (server.js & room.js)   │
└──────────────────────┘                                └───────────┬─────────────┘
                                                                    │ Local Pub/Sub
                                                                    ▼
                                                       ┌───────────────────────────┐
                                                       │ Stage Screens & Audiences │
                                                       │ (localhost:3000 / 3001)   │
                                                       └───────────────────────────┘
```

1. **Frontend Digital Signal Processing (DSP)**:
   - Built a dedicated `AudioWorkletProcessor` ([`pcm-worklet.js`](public/pcm-worklet.js)) operating on dedicated audio render threads.
   - Downsamples and normalizes incoming audio to 16-bit Little-Endian signed linear PCM at $16{,}000\text{ Hz}$:
     $$x_{\text{mono}}[n] = \frac{1}{C}\sum_{c=1}^{C} x_c[n]$$
     $$y[n] = \text{round}\left(x_{\text{mono}}[n] \cdot \begin{cases} 32768, & x < 0 \\ 32767, & x \ge 0 \end{cases}\right)$$
   - Dispatches audio in $100\text{ ms}$ buffers ($1{,}600\text{ samples} = 3{,}200\text{ bytes}$), eliminating the $200-400\text{ ms}$ ring-buffer latency typical of standard WebRTC browser filters.

2. **Backend Engine**:
   - Native Node.js HTTP and WebSocket server (`ws`).
   - Stateful room managers ([`room.js`](src/room.js)) isolating concurrent stages ($A, B, C, D, E, F$) with zero cross-talk.
   - Sentence streaming accumulator that renders the current in-flight clause live while automatically committing completed sentences upon punctuation boundaries ($[\text{.!?}]$).

3. **Google Gemini Live Integration**:
   - Direct connection to **Gemini Multimodal Live API** (`gemini-3.5-live-translate-preview` and `gemini-3.5-transcribe-live`) over persistent bi-directional WebSockets.
   - Google's neural model receives the continuous raw PCM stream and outputs `outputTranscription.text` tokens incrementally as speech is recognized.

---

## 🧮 Challenges We Faced & The Math of Latency

### 1. Breaking the Sentence-Batching Latency Barrier
In traditional REST-based translation architectures, total latency $T_{\text{latency}}$ is bounded from below by the sentence duration:
$$T_{\text{latency}} = T_{\text{speech\_chunk}} + T_{\text{VAD\_silence}} + T_{\text{network\_RTT}} + T_{\text{LLM\_generation}}$$

When an orator speaks a $15$-word clause:
$$T_{\text{speech\_chunk}} \approx 4.5\text{ s}, \quad T_{\text{VAD\_silence}} \approx 1.5\text{ s}, \quad T_{\text{network\_RTT}} \approx 0.3\text{ s}, \quad T_{\text{LLM}} \approx 1.5\text{ s} \implies T_{\text{latency}} \approx 7.8\text{ s}$$

A delay of nearly $8$ seconds is unusable in a live conference. We eliminated $T_{\text{speech\_chunk}}$ and $T_{\text{LLM}}$ waiting time by transitioning to **Native Live Audio-to-Text Streaming Translation**. In this paradigm, tokens stream with pipeline overlap:
$$T_{\text{streaming\_latency}} \approx \tau_{\text{audio\_worklet}} + \tau_{\text{acoustic\_model}} \approx 100\text{ ms} + 600\text{ ms} \approx 700\text{ ms}$$

### 2. Tuning Voice Activity Detection (VAD) Thresholds
By default, remote conversational models wait for $\tau_{\text{default}} = 1500\text{ ms}$ of silence before concluding a turn. By injecting custom `realtimeInputConfig`:
$$\tau_{\text{silence}} = 100\text{ ms}, \quad \tau_{\text{prefix\_padding}} = 50\text{ ms}$$
we instructed Gemini to emit intermediate phonetic hypotheses immediately, slashing turn-detection latency by $93\%$.

### 3. Avoiding Browser DSP Lag
Chromium browsers apply aggressive WebRTC acoustic echo cancellation (AEC), noise suppression (NS), and automatic gain control (AGC). These filters buffer audio in internal analysis windows, adding $200-300\text{ ms}$ of hidden lag.
By enforcing:
```javascript
run.context = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
```
and setting `noiseSuppression: false` for direct clean line feeds, we forced Windows WASAPI to allocate hardware buffers under $10\text{ ms}$.

### 4. Overcoming CPU Freezes and Memory Limits
Early experiments with running local ONNX models on CPU pegged Node's single-threaded event loop at $100\%$ CPU for $15+$ seconds per translation, crashing sessions. Decoupling the pipeline and leveraging Gemini's cloud inference resolved CPU starvation, keeping server CPU utilization under $1.5\%$ even with concurrent rooms.

---

## 🏆 Accomplishments That We're Proud Of

- **True Real-Time Word-by-Word Streaming**: Hearing an English word and watching its Spanish translation appear on the auditorium screen in under a second feels like magic.
- **38/38 Unit Tests Passing in $\approx 1.4\text{ s}$**: Complete unit and integration test coverage for WAV parsing, AudioWorklet quantization, bidirectional glossary translation, simulated Gemini protocols, room isolation, and concurrency.
- **Zero Cost ($0 Budget)**: Completely functional within Google AI Studio's Free Tier with zero recurring infrastructure expenses.
- **Rock-Solid Fault Tolerance**: Isolated rooms ensure that a network hiccup or disconnection in Stage B will never interrupt Stage A.

---

## 📚 What We Learned

- How to implement and fine-tune low-level bidirectional WebSockets with Google's newest Gemini 3.5 Live models.
- The intricacies of real-time Web Audio API and AudioWorklets, including memory transfer with zero-copy `ArrayBuffer` detachment.
- The critical distinction between *sentence-level batch translation* and *incremental acoustic token streaming* in high-stakes live production environments.

---

## 🚀 What's Next for CaptaloxSubs

- **Multi-Language Fan-Out**: Broadcasting one English source talk into Spanish, Portuguese, French, and German simultaneously using parallel WebSocket worker streams.
- **Speaker Diarization**: Color-coding subtitles based on multiple speaker detection in roundtables and panels.
- **WebRTC Data Channel Relay**: Scaling the audience distribution server to $10{,}000+$ concurrent mobile attendees over peer-assisted mesh relays.
