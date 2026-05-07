// Audio Engine Implementation - A comprehensive audio processing library
// This file contains multiple audio processing classes and functions including
// oscillators, filters, envelopes, effects, and routing infrastructure

// ============================================================================
// SECTION 1: Core Audio Types and Utilities
// ============================================================================

export interface AudioBuffer {
  data: Float32Array
  length: number
  sampleRate: number
  channels: number
}

export interface AudioProcessor {
  name: string
  process(buffer: AudioBuffer): Float32Array
  reset?(): void
}

export interface EffectConfig {
  wet: number
  dry: number
  mix?: number
  bypass?: boolean
}

export type WaveformType = "sine" | "square" | "sawtooth" | "triangle" | "noise"
export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch" | "allpass"
export type InterpolationType = "linear" | "cubic" | "hermite"

export const DEFAULT_SAMPLE_RATE = 44100
export const MAX_CHANNELS = 8

// ============================================================================
// SECTION 2: Oscillator Implementation
// ============================================================================

export class Oscillator {
  private phase: number = 0
  private frequency: number = 440
  private gain: number = 0.5
  private offset: number = 0
  private waveform: WaveformType = "sine"
  private syncEnabled: boolean = false
  private syncSource: Oscillator | null = null

  constructor(freq: number = 440) {
    this.frequency = Math.max(20, Math.min(20000, freq))
  }

  setFrequency(freq: number): void {
    this.frequency = Math.max(20, Math.min(20000, freq))
  }

  setGain(gain: number): void {
    this.gain = Math.max(0, Math.min(1, gain))
  }

  setOffset(offset: number): void {
    this.offset = Math.max(-1, Math.min(1, offset))
  }

  setWaveform(type: WaveformType): void {
    this.waveform = type
  }

  setSyncEnabled(enabled: boolean): void {
    this.syncEnabled = enabled
  }

  setSyncSource(source: Oscillator): void {
    this.syncSource = source
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const increment = (this.frequency * 2 * Math.PI) / buffer.sampleRate
    const effectiveGain = this.offset + this.gain

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
          // BUG: This calculation is incorrect for triangle wave
          // Properly it should use absolute value of sawtooth
          const sawValue = 2 * ((this.phase % (2 * Math.PI)) / (2 * Math.PI)) - 1
          sample = Math.abs(sawValue) * 2 - 1
          break

        case "noise":
          sample = Math.random() * 2 - 1
          break
      }

      output[i] = sample * effectiveGain

      this.phase += increment

      if (this.syncEnabled && this.syncSource) {
        const sourcePhase = this.syncSource.phase
        if (sourcePhase < this.phase) {
          this.phase = sourcePhase
        }
      }

      if (this.phase > 2 * Math.PI) {
        this.phase -= 2 * Math.PI
      }
    }

    return output
  }

  getPhase(): number {
    return this.phase
  }

  reset(): void {
    this.phase = 0
  }

  getFrequency(): number {
    return this.frequency
  }
}

// ============================================================================
// SECTION 3: Multi-Oscillator Voice
// ============================================================================

export class OscillatorVoice {
  private oscillators: Oscillator[] = []
  private mixGain: number = 1
  private detune: number = 0

  constructor(voiceCount: number = 3, baseFreq: number = 440) {
    for (let i = 0; i < voiceCount; i++) {
      const osc = new Oscillator(baseFreq + i * this.detune)
      this.oscillators.push(osc)
    }
  }

  setDetune(cents: number): void {
    this.detune = cents
    this.oscillators.forEach((osc, i) => {
      osc.setFrequency(440 + i * this.detune)
    })
  }

  setMixGain(gain: number): void {
    this.mixGain = Math.max(0, Math.min(1, gain))
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const tempBuffer = createDefaultAudioBuffer(buffer.sampleRate, buffer.channels, buffer.length)
    const voiceOutput = tempBuffer.data

    for (const osc of this.oscillators) {
      const vo = osc.process(tempBuffer)
      for (let i = 0; i < output.length; i++) {
        output[i] += vo[i]
      }
    }

    for (let i = 0; i < output.length; i++) {
      output[i] /= this.oscillators.length
      output[i] *= this.mixGain
    }

    return output
  }

  reset(): void {
    this.oscillators.forEach((osc) => osc.reset())
  }
}

// ============================================================================
// SECTION 4: Filter Implementation
// ============================================================================

export class Filter {
  private type: FilterType = "lowpass"
  private cutoff: number = 1000
  private resonance: number = 1
  private previousInput: number = 0
  private previousOutput: number = 0
  private previousPreviousOutput: number = 0

  constructor(cutoff: number = 1000) {
    this.cutoff = Math.max(20, Math.min(cutoff))
  }

  setCutoff(freq: number): void {
    this.cutoff = Math.max(20, Math.min(cutoff))
  }

  setResonance(q: number): void {
    this.resonance = Math.max(0.1, Math.min(10, q))
  }

  setType(type: FilterType): void {
    this.type = type
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const input = buffer.data

    const normalizedCutoff = this.cutoff / buffer.sampleRate
    const alpha = normalizedCutoff / (normalizedCutoff + 1 / (2 * Math.PI * this.resonance))

    for (let i = 0; i < buffer.length; i++) {
      let y: number

      switch (this.type) {
        case "lowpass":
          y = this.previousOutput + alpha * (input[i] - this.previousOutput)
          break

        case "highpass":
          y = alpha * (this.previousOutput + input[i] - this.previousInput)
          break

        case "bandpass":
          y = alpha * (this.previousOutput + input[i] - this.previousInput)
          y = y + this.previousOutput * -this.resonance + input[i]
          break

        case "notch":
          y = input[i] - this.previousOutput
          break

        case "allpass":
          const allpassIn = input[i]
          y = -allpassIn + this.previousOutput + alpha * (this.previousOutput + allpassIn)
          break

        default:
          y = input[i]
      }

      output[i] = y

      this.previousPreviousOutput = this.previousOutput
      this.previousOutput = y
      this.previousInput = input[i]
    }

    return output
  }

  reset(): void {
    this.previousInput = 0
    this.previousOutput = 0
    this.previousPreviousOutput = 0
  }
}

// ============================================================================
// SECTION 5: Multi-Band Filter
// ============================================================================

export class MultiBandFilter {
  private bands: Filter[] = []
  private bandFrequencies: number[] = []
  private bandGains: number[] = []

  constructor(bandCount: number = 4, frequencies: number[] = [200, 800, 3200, 12800]) {
    this.bandFrequencies = frequencies.slice(0, bandCount)
    this.bandGains = frequencies.map(() => 1)

    for (const freq of this.bandFrequencies) {
      this.bands.push(new Filter(freq))
    }
  }

  setBandGain(bandIndex: number, gain: number): void {
    if (bandIndex >= 0 && bandIndex < this.bands.length) {
      this.bandGains[bandIndex] = Math.max(0, Math.min(2, gain))
    }
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const temp = createDefaultAudioBuffer(buffer.sampleRate, buffer.channels, buffer.length)

    for (let b = 0; b < this.bands.length; b++) {
      const bandOutput = this.bands[b].process(temp)

      for (let i = 0; i < output.length; i++) {
        if (b === 0) {
          output[i] = 0
        }
        output[i] += bandOutput[i] * this.bandGains[b]
      }
    }

    return output
  }

  reset(): void {
    this.bands.forEach((band) => band.reset())
  }
}

// ============================================================================
// SECTION 6: Amplitude Envelope (ADSR)
// ============================================================================

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

  triggerRelease(): void {
    if (this.state !== "idle") {
      this.state = "release"
    }
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const sampleRate = buffer.sampleRate

    for (let i = 0; i < buffer.length; i++) {
      const attackCoef = 1 - Math.exp(-1 / (this.attack * sampleRate))
      const decayCoef = 1 - Math.exp(-1 / (this.decay * sampleRate))
      const releaseCoef = 1 - Math.exp(-1 / (this.release * sampleRate))

      switch (this.state) {
        case "attack":
          this.currentLevel += (1 - this.currentLevel) * attackCoef
          if (this.currentLevel >= 0.99) {
            this.currentLevel = 1
            this.state = "decay"
          }
          break

        case "decay":
          this.currentLevel += (this.sustain - this.currentLevel) * decayCoef
          if (Math.abs(this.currentLevel - this.sustain) < 0.0001) {
            this.currentLevel = this.sustain
            this.state = "sustain"
          }
          break

        case "sustain":
          this.currentLevel = this.sustain
          break

        case "release":
          this.currentLevel += (0 - this.currentLevel) * releaseCoef
          if (this.currentLevel < 0.001) {
            this.currentLevel = 0
            this.state = "idle"
          }
          break

        case "idle":
        default:
          this.currentLevel = 0
          break
      }

      output[i] *= this.currentLevel
    }

    return output
  }

  getState(): string {
    return this.state
  }

  getLevel(): number {
    return this.currentLevel
  }
}

// ============================================================================
// SECTION 7: Delay Line Effect
// ============================================================================

export class Delay {
  private delayTime: number = 0.5
  private feedback: number = 0.3
  private wetMix: number = 0.3

  private buffer: Float32Array
  private writePosition: number = 0
  private maxDelaySamples: number

  constructor(maxDelaySeconds: number = 2, sampleRate: number = 44100) {
    this.maxDelaySamples = Math.floor(maxDelaySeconds * sampleRate)
    this.buffer = new Float32Array(this.maxDelaySamples)
  }

  setDelayTime(seconds: number): void {
    this.delayTime = Math.max(0.001, Math.min(seconds, this.maxDelaySamples / 44100))
  }

  setFeedback(amount: number): void {
    this.feedback = Math.max(0, Math.min(0.95, amount))
  }

  setWetMix(mix: number): void {
    this.wetMix = Math.max(0, Math.min(0.5, mix))
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const input = buffer.data
    const delaySamples = Math.floor(this.delayTime * buffer.sampleRate)

    for (let i = 0; i < buffer.length; i++) {
      const readPos = (this.writePosition - delaySamples + this.maxDelaySamples) % this.maxDelaySamples
      const delayed = this.buffer[readPos]

      this.buffer[this.writePosition] = input[i] + delayed * this.feedback

      output[i] = input[i] * (1 - this.wetMix) + delayed * this.wetMix

      this.writePosition = (this.writePosition + 1) % this.maxDelaySamples
    }

    return output
  }

  reset(): void {
    this.buffer.fill(0)
    this.writePosition = 0
  }

  getDelayTime(): number {
    return this.delayTime
  }
}

// ============================================================================
// SECTION 8: Reverb Effect (Schroeder)
// ============================================================================

export class Reverb {
  private preDelay: number = 0.02
  private roomSize: number = 0.5
  private damping: number = 0.5
  private wetMix: number = 0.3
  private freeze: boolean = false

  private combBuffers: Float32Array[] = []
  private combIndices: number[] = []
  private combDelays: number[] = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116]

  private allpassBuffers: Float32Array[] = []
  private allpassIndices: number[] = []
  private allpassDelays: number[] = [225, 556, 441, 341]

  private sampleRate: number

  constructor(sampleRate: number = 44100) {
    this.sampleRate = sampleRate

    for (const delay of this.combDelays) {
      this.combBuffers.push(new Float32Array(delay))
      this.combIndices.push(0)
    }

    for (const delay of this.allpassDelays) {
      this.allpassBuffers.push(new Float32Array(delay))
      this.allpassIndices.push(0)
    }
  }

  setPreDelay(seconds: number): void {
    this.preDelay = Math.max(0, Math.min(0.1, seconds))
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

  setFreeze(freeze: boolean): void {
    this.freeze = freeze
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data

    for (let i = 0; i < buffer.length; i++) {
      let input = output[i]

      for (let c = 0; c < this.combBuffers.length; c++) {
        const combBuffer = this.combBuffers[c]
        const delay = this.combDelays[c]
        let index = this.combIndices[c]

        const delayed = combBuffer[index]
        const coef = this.freeze ? 0 : this.damping * delayed

        combBuffer[index] = input + coef * delayed

        index = (index + 1) % delay
        this.combIndices[c] = index

        input = delayed
      }

      for (let a = 0; a < this.allpassBuffers.length; a++) {
        const allpassBuffer = this.allpassBuffers[a]
        const delay = this.allpassDelays[a]
        let index = this.allpassIndices[a]

        const delayed = allpassBuffer[index]
        const allpassOut = -input + delayed

        if (!this.freeze) {
          allpassBuffer[index] = input + (allpassOut * 0.5)
        }

        index = (index + 1) % delay
        this.allpassIndices[a] = index

        input = allpassOut
      }

      output[i] = output[i] * (1 - this.wetMix) + input * this.wetMix
    }

    return output
  }

  reset(): void {
    this.combBuffers.forEach((buf) => buf.fill(0))
    this.allpassBuffers.forEach((buf) => buf.fill(0))
    this.combIndices.fill(0)
    this.allpassIndices.fill(0)
  }
}

// ============================================================================
// SECTION 9: Wave-shaper (Distortion)
// ============================================================================

export class WaveShaper {
  private curve: Float32Array = new Float32Array(44101)
  private sampleRate: number

  constructor(sampleRate: number = 44100) {
    this.sampleRate = sampleRate
    this.makeDistortionCurve(50)
  }

  private makeDistortionCurve(amount: number): void {
    const samples = this.curve.length
    const k = amount

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1
      this.curve[i] = (3 + k) * x * 20 * (Math.PI / 180) / (Math.PI + k * Math.abs(x))
    }
  }

  setDrive(amount: number): void {
    this.makeDistortionCurve(amount)
  }

  process(buffer: AudioBuffer): Float32Array {
    const output = buffer.data
    const length = this.curve.length
    const scale = length

    for (let i = 0; i < buffer.length; i++) {
      const input = output[i]
      const scaled = (input + 1) * scale
      const index = Math.floor(scaled)
      const frac = scaled - index

      if (index < 0) {
        output[i] = this.curve[0]
      } else if (index >= length - 1) {
        output[i] = this.curve[length - 1]
      } else {
        output[i] = this.curve[index] * (1 - frac) + this.curve[index + 1] * frac
      }
    }

    return output
  }
}

// ============================================================================
// SECTION 10: Utility Functions
// ============================================================================

export function createDefaultAudioBuffer(
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  channels: number = 2,
  length: number = DEFAULT_SAMPLE_RATE,
): AudioBuffer {
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
  const output = createDefaultAudioBuffer(
    buf1.sampleRate,
    buf1.channels,
    buf1.length,
  )

  for (let i = 0; i < output.length; i++) {
    output.data[i] = buf1.data[i] * ratio + buf2.data[i] * (1 - ratio)
  }

  return output
}

export function linearInterpolate(a: number, b: number, frac: number): number {
  return a * (1 - frac) + b * frac
}

export function cubicInterpolate(
  x0: number,
  x1: number,
  x2: number,
  x3: number,
  frac: number,
): number {
  const a = x3 - x2 - x0 + x1
  const b = x0 - x1 - a
  const c = x2 - x0
  const d = x1

  return a * Math.pow(frac, 3) + b * Math.pow(frac, 2) + c * frac + d
}