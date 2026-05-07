import * as fs from "node:fs"
import * as path from "node:path"

const projectRoot = path.resolve(import.meta.dirname!, "..")
const fixtureRoot = path.join(projectRoot, "tests", "fixtures", "trap-case-v2")
const srcDir = path.join(fixtureRoot, "src")

const header = `// Trap Case V2: large audio engine fixture with an executable triangle-wave oracle.
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

`

function makeFillerClass(index: number): string {
  return `
export interface ModulationFrame${index} {
  left: number
  right: number
  phase: number
  depth: number
  feedback: number
}

export class UtilityProcessor${index} {
  private memory: number = 0
  private smoothing: number = ${(index % 17) + 1} / 64

  processFrame(frame: ModulationFrame${index}): ModulationFrame${index} {
    const drive = 1 + frame.depth * ${(index % 9) + 1}
    const shapedLeft = Math.tanh((frame.left + this.memory * frame.feedback) * drive)
    const shapedRight = Math.tanh((frame.right - this.memory * frame.feedback) * drive)
    const phaseOffset = Math.sin(frame.phase + ${index} * 0.001) * frame.depth
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
`
}

function makePackageJson(): string {
  return `${JSON.stringify({
    name: "repolens-trap-case-v2",
    version: "1.0.0",
    type: "module",
    private: true,
  }, null, 2)}\n`
}

function makePrompt(): string {
  return `Find and fix the bug in src/audio-engine-large.ts where Oscillator.process() produces incorrect output for triangle waveform.

Expected triangle samples for a 1 Hz oscillator at sampleRate 4 with gain 1 are:

0, 1, 0, -1, 0

Make the smallest safe code change in src/audio-engine-large.ts, then briefly explain what you changed. No test run is required; do not search dependency directories or test directories.
`
}

fs.rmSync(fixtureRoot, { recursive: true, force: true })
fs.mkdirSync(srcDir, { recursive: true })

let source = header
for (let i = 1; i <= 55; i++) {
  source += makeFillerClass(i)
}

fs.writeFileSync(path.join(srcDir, "audio-engine-large.ts"), source)
fs.writeFileSync(path.join(fixtureRoot, "package.json"), makePackageJson())
fs.writeFileSync(path.join(fixtureRoot, "PROMPT.md"), makePrompt())

const bytes = Buffer.byteLength(source, "utf8")
const tokens = Math.ceil(bytes / 4)

console.log(`Generated ${path.relative(projectRoot, fixtureRoot)}`)
console.log(`audio-engine-large.ts: ${bytes} bytes, ~${tokens} estimated tokens`)
