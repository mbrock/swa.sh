const theSampleRate = globalThis.sampleRate;

class RmsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'threshold', defaultValue: 0.1, minValue: 0, maxValue: 1 }];
  }

  constructor() {
    super();
    this.silentChunks = 0;
    this.silence = true;
  }

  process(inputs, _outputs, parameters) {
    const input = inputs[0];
    const threshold = parameters.threshold[0] || 0.1;
    let rms = 0;

    for (const channel of input) {
      for (const sample of channel) {
        rms += sample * sample;
      }
    }

    rms = Math.sqrt(rms / input.length);

    if (rms <= threshold) {
      this.silentChunks++;
      if (this.silentChunks >= Math.ceil(1 * theSampleRate / input[0].length)) {
        if (!this.silence) {
          this.port.postMessage({ silent: true })
          this.silence = true;
        }
      }
    } else {
      if (this.silence) {
        this.port.postMessage({ silent: false })
        this.silence = false;
      }
      this.silentChunks = 0;
    }

    return true;
  }
}

registerProcessor('rms', RmsProcessor);
