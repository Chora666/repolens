// Audio Engine Implementation - A medium-large TypeScript file to simulate a real large source file
// This file contains multiple audio processing classes and functions

export interface AudioBuffer {
  data: Float32Array
  length: number
  sampleRate: number
  channels: number
}

export class Oscillator {
  private phase: number = 0
  private frequency: number = 440
  private gain: number = 0.5
  private waveform: "sine" | "square" | "sawtooth" | "triangle" = "sine"

  constructor(freq: number = 440) {
    this.frequency = freq
  }

  setFrequency(freq: number): void {
    this.frequency = Math.max(20, Math.min(20000, freq))
  }

  setGain(gain: number): void {
    this.gain = Math.max(0, Math.min(1, gain))
  }

  setWaveform(type: Oscillator["waveform"]): void {
    this.waveform = type
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const increment = (this.frequency * 2 * Math.PI) / buffer.sampleRate

    for (let i = 0; i < buffer.length; i++) {
      let sample = 0

      switch (this.waveform) {
        case "sine":
          sample = Math.sin(this.phase)
          break
        case "square":
          sample = this.phase % (2 * Math.PI) < Math.PI ? 1 : -1
          break
        case "sawtooth":
          sample = 2 * ((this.phase % (2 * Math.PI)) / (2 * Math.PI)) - 1
          break
        case "triangle":
          sample = Math.abs(2 * ((this.phase % (2 * Math.PI)) / (2 * Math.PI)) - 1) * 2 - 1
          break
      }

      output[i] = sample * this.gain
      this.phase += increment
      if (this.phase > 2 * Math.PI) {
        this.phase -= 2 * Math.PI
      }
    }

    return output
  }

  reset(): void {
    this.phase = 0
  }

  getFrequency(): number {
    return this.frequency
  }
}

export class Filter {
  private type: "lowpass" | "highpass" | "bandpass" | "notch" = "lowpass"
  private cutoff: number = 1000
  private resonance: number = 1
  private previousInput: number = 0
  private previousOutput: number = 0

  setCutoff(freq: number): void {
    this.cutoff = Math.max(20, Math.min(buffer.sampleRate / 2, freq))
  }

  setResonance(q: number): void {
    this.resonance = Math.max(0.1, Math.min(10, q))
  }

  setType(type: Filter["type"]): void {
    this.type = type
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const input = buffer.data
    const rc = 1.0 / (this.cutoff * 2 * Math.PI * (1.0 / buffer.sampleRate))
    const alpha = rc / (rc + 1.0)

    for (let i = 0; i < buffer.length; i++) {
      let y = 0
      const x = input[i]

      switch (this.type) {
        case "lowpass":
          y = this.previousOutput + alpha * (x - this.previousOutput)
          break
        case "highpass":
          y = alpha * (this.previousOutput + x - previousInput)
          break
        case "bandpass":
          y = alpha * (this.previousOutput + x - previousInput)
          break
        case "notch":
          y = x - this.previousOutput
          break
      }

      output[i] = y
      this.previousInput = x
      this.previousOutput = y
    }

    return output
  }

  reset(): void {
    this.previousInput = 0
    this.previousOutput = 0
  }
}

export class AmpEnvelope {
  private attack: number = 0.01
  private decay: number = 0.1
  private sustain: number = 0.7
  private release: number = 0.3

  private state: "idle" | "attack" | "decay" | "sustain" | "release" = "idle"
  private currentLevel: number = 0

  setAttack(time: number): void {
    this.attack = Math.max(0.001, time)
  }

  setDecay(time: number): void {
    this.decay = Math.max(0.001, time)
  }

  setSustain(level: number): void {
    this.sustain = Math.max(0, Math.min(1, level))
  }

  setRelease(time: number): void {
    this.release = Math.max(0.001, time)
  }

  trigger(): void {
    this.state = "attack"
    this.currentLevel = 0
  }

  releaseNote(): void {
    if (this.state !== "idle") {
      this.state = "release"
    }
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data

    for (let i = 0; i < buffer.length; i++) {
      switch (this.state) {
        case "attack":
          this.currentLevel += (1 - this.currentLevel) * this.attack
          if (this.currentLevel >= 0.99) {
            this.currentLevel = 1
            this.state = "decay"
          }
          break

        case "decay":
          this.currentLevel += (this.sustain - this.currentLevel) * this.decay
          if (Math.abs(this.currentLevel - this.sustain) < 0.01) {
            this.currentLevel = this.sustain
            this.state = "sustain"
          }
          break

        case "sustain":
          this.currentLevel = this.sustain
          break

        case "release":
          this.currentLevel += (0 - this.currentLevel) * this.release
          if (this.currentLevel < 0.01) {
            this.currentLevel = 0
            this.state = "idle"
          }
          break

        case "idle":
        default:
          this.currentLevel = 0
          break
      }

      output[i] = this.currentLevel
    }

    return output
  }

  getState(): AmpEnvelope["state"] {
    return this.state
  }
}

export class Delay {
  private delayTime: number = 0.5
  private feedback: number = 0.3
  private wetMix: number = 0.3

  private buffer: Float32Array
  private writePosition: number = 0

  constructor(maxDelaySeconds: number = 2, sampleRate: number = 44100) {
    const size = Math.floor(maxDelaySeconds * sampleRate)
    this.buffer = new Float32Array(size)
  }

  setDelayTime(seconds: number): void {
    this.delayTime = Math.max(0.001, Math.min(seconds, this.buffer.length / 44100))
  }

  setFeedback(amount: number): void {
    this.feedback = Math.max(0, Math.min(0.95, amount))
  }

  setWetMix(mix: number): void {
    this.wetMix = Math.max(0, Math.min(0.5, mix))
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const delaySamples = Math.floor(this.delayTime * buffer.sampleRate)

    for (let i = 0; i < buffer.length; i++) {
      const readPos = (this.writePosition - delaySamples + this.buffer.length) % this.buffer.length
      const delayed = this.buffer[readPos]

      this.buffer[this.writePosition] = output[i] + delayed * this.feedback
      output[i] = output[i] * (1 - this.wetMix) + delayed * this.wetMix

      this.writePosition = (this.writePosition + 1) % this.buffer.length
    }

    return output
  }

  reset(): void {
    this.buffer.fill(0)
    this.writePosition = 0
  }
}

export class Reverb {
  private preDelay: number = 0.02
  private roomSize: number = 0.5
  private damping: number = 0.5
  private wetMix: number = 0.3

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const preDelaySamples = Math.floor(this.preDelay * buffer.sampleRate)

    for (let i = 0; i < buffer.length; i++) {
      const idx = (i + preDelaySamples) % buffer.length
      output[i] = output[i] * (1 - this.wetMix) + buffer.data[idx] * this.wetMix
    }

    return output
  }

  setRoomSize(size: number): void {
    this.roomSize = Math.max(0, Math.min(1, size))
  }

  setDamping(damping: number): void {
    this.damping = Math.max(0, Math.min(1, damping))
  }

  setWetMix(mix: number): void {
    this.wetMix = Math.max(0, Math.min(0.5, mix))
  }
}

export function createDefaultAudioBuffer(sampleRate: number = 44100, channels: number = 2, length: number = 44100): AudioBuffer {
  return {
    data: new Float32Array(length * channels),
    length,
    sampleRate,
    channels,
  }
}

export function applyGain(buffer: AudioBuffer, gain: number): Float32Array {
  const output = buffer.data
  for (let i = 0; i < buffer.length; i++) {
    output[i] *= gain
  }
  return output
}

export function mixBuffers(buf1: AudioBuffer, buf2: AudioBuffer, ratio: number = 0.5): AudioBuffer {
  const output = createDefaultAudioBuffer(buf1.sampleRate, buf1.channels, buf1.length)
  for (let i = 0; i < buf1.length; i++) {
    output.data[i] = buf1.data[i] * ratio + buf2.data[i] * (1 - ratio)
  }
  return output
}

export type AudioProcessor = (buffer: AudioBuffer) => Float32Array