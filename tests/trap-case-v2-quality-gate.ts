import * as path from "node:path"
import { pathToFileURL } from "node:url"

const workspace = process.argv[2]

if (!workspace) {
  console.error("Usage: tsx tests/trap-case-v2-quality-gate.ts <workspace>")
  process.exit(2)
}

const targetPath = path.resolve(workspace, "src", "audio-engine-large.ts")
const moduleUrl = pathToFileURL(targetPath).href

interface AudioBuffer {
  data: Float32Array
  length: number
  sampleRate: number
  channels: number
}

interface OscillatorCtor {
  new(freq?: number): {
    setWaveform(type: "triangle"): void
    setGain(gain: number): void
    process(buffer: AudioBuffer): Float32Array
  }
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6
}

try {
  const mod = await import(`${moduleUrl}?cacheBust=${Date.now()}`)
  const Oscillator = mod.Oscillator as OscillatorCtor | undefined

  if (!Oscillator) {
    throw new Error("Oscillator export is missing")
  }

  const osc = new Oscillator(1)
  osc.setWaveform("triangle")
  osc.setGain(1)

  const buffer: AudioBuffer = {
    data: new Float32Array(5),
    length: 5,
    sampleRate: 4,
    channels: 1,
  }

  const output = Array.from(osc.process(buffer))
  const expected = [0, 1, 0, -1, 0]
  const mismatches = expected
    .map((value, index) => ({ index, expected: value, actual: output[index] }))
    .filter(({ expected: value, actual }) => !nearlyEqual(actual, value))

  if (mismatches.length > 0) {
    console.error("FAIL: triangle waveform output mismatch")
    console.error(JSON.stringify({ expected, actual: output, mismatches }, null, 2))
    process.exit(1)
  }

  console.log("PASS: triangle waveform output matches executable oracle")
  console.log(JSON.stringify({ expected, actual: output }))
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
