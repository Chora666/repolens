Find and fix the bug in src/audio-engine-large.ts where Oscillator.process() produces incorrect output for triangle waveform.

Expected triangle samples for a 1 Hz oscillator at sampleRate 4 with gain 1 are:

0, 1, 0, -1, 0

Make the smallest safe code change in src/audio-engine-large.ts, then briefly explain what you changed. No test run is required; do not search dependency directories or test directories.
