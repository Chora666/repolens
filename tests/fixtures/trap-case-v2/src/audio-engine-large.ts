// Trap Case V2: large audio engine fixture with an executable triangle-wave oracle.
// The file is intentionally over 8k estimated tokens so RepoLens' default
// strict threshold can be tested without lowering the threshold.

export interface AudioBuffer {
  data: Float32Array
  length: number
  sampleRate: number
  channels: number
}

export type WaveformType = "sine" | "square" | "sawtooth" | "triangle" | "noise"

export function triangleSampleForPhase(phaseRadians: number): number {
  const phase = ((phaseRadians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const sawValue = 2 * (phase / (2 * Math.PI)) - 1
  // BUG: This phase convention is wrong for this engine.
  // Expected values are:
  //   phase 0        -> 0
  //   phase PI / 2   -> 1
  //   phase PI       -> 0
  //   phase 3 PI / 2 -> -1
  //   phase 2 PI     -> 0
  return Math.abs(sawValue) * 2 - 1
}

export class Oscillator {
  private phase: number = 0
  private frequency: number = 440
  private gain: number = 0.5
  private waveform: WaveformType = "sine"

  constructor(freq: number = 440) {
    this.frequency = freq
  }

  setFrequency(freq: number): void {
    this.frequency = Math.max(20, Math.min(20000, freq))
  }

  setGain(gain: number): void {
    this.gain = Math.max(0, Math.min(1, gain))
  }

  setWaveform(type: WaveformType): void {
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
          sample = triangleSampleForPhase(this.phase)
          break

        case "noise":
          sample = Math.random() * 2 - 1
          break
      }

      output[i] = sample * this.gain
      this.phase += increment
      if (this.phase >= 2 * Math.PI) {
        this.phase -= 2 * Math.PI
      }
    }

    return output
  }

  reset(): void {
    this.phase = 0
  }
}


export interface ModulationFrame1 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor1 {
  private memory: number = 0
  private smoothing: number = 2 / 64

  processFrame(frame: ModulationFrame1): ModulationFrame1 {
    const drive = 1 + frame.depth * 2
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 1 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame2 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor2 {
  private memory: number = 0
  private smoothing: number = 3 / 64

  processFrame(frame: ModulationFrame2): ModulationFrame2 {
    const drive = 1 + frame.depth * 3
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 2 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame3 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor3 {
  private memory: number = 0
  private smoothing: number = 4 / 64

  processFrame(frame: ModulationFrame3): ModulationFrame3 {
    const drive = 1 + frame.depth * 4
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 3 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame4 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor4 {
  private memory: number = 0
  private smoothing: number = 5 / 64

  processFrame(frame: ModulationFrame4): ModulationFrame4 {
    const drive = 1 + frame.depth * 5
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 4 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame5 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor5 {
  private memory: number = 0
  private smoothing: number = 6 / 64

  processFrame(frame: ModulationFrame5): ModulationFrame5 {
    const drive = 1 + frame.depth * 6
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 5 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame6 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor6 {
  private memory: number = 0
  private smoothing: number = 7 / 64

  processFrame(frame: ModulationFrame6): ModulationFrame6 {
    const drive = 1 + frame.depth * 7
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 6 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame7 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor7 {
  private memory: number = 0
  private smoothing: number = 8 / 64

  processFrame(frame: ModulationFrame7): ModulationFrame7 {
    const drive = 1 + frame.depth * 8
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 7 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame8 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor8 {
  private memory: number = 0
  private smoothing: number = 9 / 64

  processFrame(frame: ModulationFrame8): ModulationFrame8 {
    const drive = 1 + frame.depth * 9
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 8 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame9 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor9 {
  private memory: number = 0
  private smoothing: number = 10 / 64

  processFrame(frame: ModulationFrame9): ModulationFrame9 {
    const drive = 1 + frame.depth * 1
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 9 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame10 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor10 {
  private memory: number = 0
  private smoothing: number = 11 / 64

  processFrame(frame: ModulationFrame10): ModulationFrame10 {
    const drive = 1 + frame.depth * 2
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 10 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame11 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor11 {
  private memory: number = 0
  private smoothing: number = 12 / 64

  processFrame(frame: ModulationFrame11): ModulationFrame11 {
    const drive = 1 + frame.depth * 3
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 11 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame12 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor12 {
  private memory: number = 0
  private smoothing: number = 13 / 64

  processFrame(frame: ModulationFrame12): ModulationFrame12 {
    const drive = 1 + frame.depth * 4
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 12 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame13 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor13 {
  private memory: number = 0
  private smoothing: number = 14 / 64

  processFrame(frame: ModulationFrame13): ModulationFrame13 {
    const drive = 1 + frame.depth * 5
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 13 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame14 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor14 {
  private memory: number = 0
  private smoothing: number = 15 / 64

  processFrame(frame: ModulationFrame14): ModulationFrame14 {
    const drive = 1 + frame.depth * 6
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 14 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame15 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor15 {
  private memory: number = 0
  private smoothing: number = 16 / 64

  processFrame(frame: ModulationFrame15): ModulationFrame15 {
    const drive = 1 + frame.depth * 7
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 15 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame16 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor16 {
  private memory: number = 0
  private smoothing: number = 17 / 64

  processFrame(frame: ModulationFrame16): ModulationFrame16 {
    const drive = 1 + frame.depth * 8
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 16 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame17 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor17 {
  private memory: number = 0
  private smoothing: number = 1 / 64

  processFrame(frame: ModulationFrame17): ModulationFrame17 {
    const drive = 1 + frame.depth * 9
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 17 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame18 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor18 {
  private memory: number = 0
  private smoothing: number = 2 / 64

  processFrame(frame: ModulationFrame18): ModulationFrame18 {
    const drive = 1 + frame.depth * 1
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 18 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame19 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor19 {
  private memory: number = 0
  private smoothing: number = 3 / 64

  processFrame(frame: ModulationFrame19): ModulationFrame19 {
    const drive = 1 + frame.depth * 2
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 19 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame20 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor20 {
  private memory: number = 0
  private smoothing: number = 4 / 64

  processFrame(frame: ModulationFrame20): ModulationFrame20 {
    const drive = 1 + frame.depth * 3
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 20 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame21 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor21 {
  private memory: number = 0
  private smoothing: number = 5 / 64

  processFrame(frame: ModulationFrame21): ModulationFrame21 {
    const drive = 1 + frame.depth * 4
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 21 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame22 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor22 {
  private memory: number = 0
  private smoothing: number = 6 / 64

  processFrame(frame: ModulationFrame22): ModulationFrame22 {
    const drive = 1 + frame.depth * 5
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 22 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame23 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor23 {
  private memory: number = 0
  private smoothing: number = 7 / 64

  processFrame(frame: ModulationFrame23): ModulationFrame23 {
    const drive = 1 + frame.depth * 6
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 23 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame24 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor24 {
  private memory: number = 0
  private smoothing: number = 8 / 64

  processFrame(frame: ModulationFrame24): ModulationFrame24 {
    const drive = 1 + frame.depth * 7
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 24 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame25 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor25 {
  private memory: number = 0
  private smoothing: number = 9 / 64

  processFrame(frame: ModulationFrame25): ModulationFrame25 {
    const drive = 1 + frame.depth * 8
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 25 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame26 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor26 {
  private memory: number = 0
  private smoothing: number = 10 / 64

  processFrame(frame: ModulationFrame26): ModulationFrame26 {
    const drive = 1 + frame.depth * 9
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 26 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame27 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor27 {
  private memory: number = 0
  private smoothing: number = 11 / 64

  processFrame(frame: ModulationFrame27): ModulationFrame27 {
    const drive = 1 + frame.depth * 1
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 27 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame28 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor28 {
  private memory: number = 0
  private smoothing: number = 12 / 64

  processFrame(frame: ModulationFrame28): ModulationFrame28 {
    const drive = 1 + frame.depth * 2
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 28 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame29 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor29 {
  private memory: number = 0
  private smoothing: number = 13 / 64

  processFrame(frame: ModulationFrame29): ModulationFrame29 {
    const drive = 1 + frame.depth * 3
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 29 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame30 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor30 {
  private memory: number = 0
  private smoothing: number = 14 / 64

  processFrame(frame: ModulationFrame30): ModulationFrame30 {
    const drive = 1 + frame.depth * 4
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 30 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame31 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor31 {
  private memory: number = 0
  private smoothing: number = 15 / 64

  processFrame(frame: ModulationFrame31): ModulationFrame31 {
    const drive = 1 + frame.depth * 5
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 31 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame32 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor32 {
  private memory: number = 0
  private smoothing: number = 16 / 64

  processFrame(frame: ModulationFrame32): ModulationFrame32 {
    const drive = 1 + frame.depth * 6
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 32 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame33 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor33 {
  private memory: number = 0
  private smoothing: number = 17 / 64

  processFrame(frame: ModulationFrame33): ModulationFrame33 {
    const drive = 1 + frame.depth * 7
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 33 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame34 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor34 {
  private memory: number = 0
  private smoothing: number = 1 / 64

  processFrame(frame: ModulationFrame34): ModulationFrame34 {
    const drive = 1 + frame.depth * 8
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 34 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame35 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor35 {
  private memory: number = 0
  private smoothing: number = 2 / 64

  processFrame(frame: ModulationFrame35): ModulationFrame35 {
    const drive = 1 + frame.depth * 9
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 35 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame36 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor36 {
  private memory: number = 0
  private smoothing: number = 3 / 64

  processFrame(frame: ModulationFrame36): ModulationFrame36 {
    const drive = 1 + frame.depth * 1
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 36 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame37 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor37 {
  private memory: number = 0
  private smoothing: number = 4 / 64

  processFrame(frame: ModulationFrame37): ModulationFrame37 {
    const drive = 1 + frame.depth * 2
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 37 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame38 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor38 {
  private memory: number = 0
  private smoothing: number = 5 / 64

  processFrame(frame: ModulationFrame38): ModulationFrame38 {
    const drive = 1 + frame.depth * 3
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 38 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame39 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor39 {
  private memory: number = 0
  private smoothing: number = 6 / 64

  processFrame(frame: ModulationFrame39): ModulationFrame39 {
    const drive = 1 + frame.depth * 4
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 39 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame40 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor40 {
  private memory: number = 0
  private smoothing: number = 7 / 64

  processFrame(frame: ModulationFrame40): ModulationFrame40 {
    const drive = 1 + frame.depth * 5
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 40 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame41 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor41 {
  private memory: number = 0
  private smoothing: number = 8 / 64

  processFrame(frame: ModulationFrame41): ModulationFrame41 {
    const drive = 1 + frame.depth * 6
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 41 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame42 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor42 {
  private memory: number = 0
  private smoothing: number = 9 / 64

  processFrame(frame: ModulationFrame42): ModulationFrame42 {
    const drive = 1 + frame.depth * 7
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 42 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame43 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor43 {
  private memory: number = 0
  private smoothing: number = 10 / 64

  processFrame(frame: ModulationFrame43): ModulationFrame43 {
    const drive = 1 + frame.depth * 8
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 43 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame44 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor44 {
  private memory: number = 0
  private smoothing: number = 11 / 64

  processFrame(frame: ModulationFrame44): ModulationFrame44 {
    const drive = 1 + frame.depth * 9
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 44 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame45 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor45 {
  private memory: number = 0
  private smoothing: number = 12 / 64

  processFrame(frame: ModulationFrame45): ModulationFrame45 {
    const drive = 1 + frame.depth * 1
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 45 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame46 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor46 {
  private memory: number = 0
  private smoothing: number = 13 / 64

  processFrame(frame: ModulationFrame46): ModulationFrame46 {
    const drive = 1 + frame.depth * 2
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 46 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame47 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor47 {
  private memory: number = 0
  private smoothing: number = 14 / 64

  processFrame(frame: ModulationFrame47): ModulationFrame47 {
    const drive = 1 + frame.depth * 3
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 47 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame48 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor48 {
  private memory: number = 0
  private smoothing: number = 15 / 64

  processFrame(frame: ModulationFrame48): ModulationFrame48 {
    const drive = 1 + frame.depth * 4
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 48 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame49 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor49 {
  private memory: number = 0
  private smoothing: number = 16 / 64

  processFrame(frame: ModulationFrame49): ModulationFrame49 {
    const drive = 1 + frame.depth * 5
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 49 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame50 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor50 {
  private memory: number = 0
  private smoothing: number = 17 / 64

  processFrame(frame: ModulationFrame50): ModulationFrame50 {
    const drive = 1 + frame.depth * 6
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 50 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame51 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor51 {
  private memory: number = 0
  private smoothing: number = 1 / 64

  processFrame(frame: ModulationFrame51): ModulationFrame51 {
    const drive = 1 + frame.depth * 7
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 51 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame52 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor52 {
  private memory: number = 0
  private smoothing: number = 2 / 64

  processFrame(frame: ModulationFrame52): ModulationFrame52 {
    const drive = 1 + frame.depth * 8
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 52 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame53 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor53 {
  private memory: number = 0
  private smoothing: number = 3 / 64

  processFrame(frame: ModulationFrame53): ModulationFrame53 {
    const drive = 1 + frame.depth * 9
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 53 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame54 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor54 {
  private memory: number = 0
  private smoothing: number = 4 / 64

  processFrame(frame: ModulationFrame54): ModulationFrame54 {
    const drive = 1 + frame.depth * 1
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 54 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}

export interface ModulationFrame55 {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor55 {
  private memory: number = 0
  private smoothing: number = 5 / 64

  processFrame(frame: ModulationFrame55): ModulationFrame55 {
    const drive = 1 + frame.depth * 2
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + 55 * 0.001) * frame.depth
    this.memory = this.memory * (1 - this.smoothing) + (shapedLeft + shapedRight) * 0.5 * this.smoothing

    return {
      left: shapedLeft + phaseOffset,
      right: shapedRight - phaseOffset,
      phase: frame.phase,
      depth: frame.depth,
      feedback: frame.feedback,
    }
  }

  reset(): void {
    this.memory = 0
  }
}
