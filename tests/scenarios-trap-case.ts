export interface SimCall {
  tool: string
  args: Record<string, unknown>
}

const audioEngine = (args?: Record<string, unknown>): SimCall => ({
  tool: "Read",
  args: { filePath: "src/audio-engine.ts", ...args },
})

const read = (file: string, args?: Record<string, unknown>): SimCall => ({
  tool: "Read",
  args: { filePath: file, ...args },
})

const write = (file: string): SimCall => ({
  tool: "Write",
  args: { filePath: file },
})

const edit = (file: string): SimCall => ({
  tool: "Edit",
  args: { filePath: file },
})

const bash = (command: string): SimCall => ({
  tool: "Bash",
  args: { command },
})

export interface ScenarioDef {
  name: string
  description: string
  calls: SimCall[]
}

export const trapCaseScenarios: ScenarioDef[] = [
  {
    name: "trap-case-1: audio-engine bug find",
    description: `
Task: Find and fix the bug in audio-engine.ts where Oscillator.process()
may produce incorrect output for triangle waveform.

The file contains multiple classes (Oscillator, Filter, AmpEnvelope,
Delay, Reverb). The model should:
1. Read the file to understand the structure
2. Identify the bug in the triangle waveform calculation
3. Fix it

This tests whether the model naturally reads the full file vs uses
grep to find specific sections.
    `.trim(),
    calls: [
      audioEngine(),      // First read - should succeed
      audioEngine(),     // Second read - expected to be blocked by repeat-read guard
    ],
  },
  {
    name: "trap-case-2: audio-engine with large file warn (large_file_policy: warn)",
    description: `
Same task as trap-case-1, but with large_file_policy: warn.
The plugin should warn about the large file but allow the read.
    `.trim(),
    calls: [
      audioEngine(),      // First large file read - should warn but not block
    ],
  },
  {
    name: "trap-case-3: audio-engine with large file strict (large_file_policy: strict)",
    description: `
Same task as trap-case-1, but with large_file_policy: strict.
The plugin should block the first large file read and suggest
grep or range reads.
    `.trim(),
    calls: [
      audioEngine(),      // First large file read - should be blocked in strict mode
    ],
  },
  {
    name: "trap-case-4: grep before large file",
    description: `
Task: Use grep to find "triangle" keyword before attempting full read.
The model should use a smarter strategy and not trigger the guard.
    `.trim(),
    calls: [
      bash({ command: 'grep -n "triangle" "src/audio-engine.ts"' }),
      audioEngine(),     // Should be allowed after grep
    ],
  },
  {
    name: "trap-case-5: range read after block",
    description: `
Simulates the model receiving a block on first large read,
then using offset/limit to read specific sections.
    `.trim(),
    calls: [
      audioEngine(),              // #1 - block
      audioEngine({ offset: 0, limit: 50 }),  // #2 - allowed (range)
    ],
  },
]