class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(1600);
    this.position = 0;
    this.active = true;
    this.port.onmessage = ({ data }) => {
      if (data !== 'stop') return;
      this.active = false;
      if (this.position) this.port.postMessage(this.samples.slice(0, this.position).buffer);
      this.port.postMessage('flushed');
    };
  }
  process(inputs) {
    if (!this.active) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] / channels.length;
      sample = Math.max(-1, Math.min(1, sample));
      this.samples[this.position++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
      if (this.position === 1600) {
        this.port.postMessage(this.samples.buffer, [this.samples.buffer]);
        this.samples = new Int16Array(1600);
        this.position = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
