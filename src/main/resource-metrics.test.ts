import test from 'node:test'
import assert from 'node:assert/strict'
import { cpuTimeSeconds, descendantProcesses } from './resource-metrics.ts'

test('hardware attribution includes descendants, excludes unrelated processes', () => {
  const processes = [
    { pid: 1, parent: 0, ram: 20, cpu: 1 },
    { pid: 3, parent: 2, ram: 50, cpu: 2 },
    { pid: 2, parent: 1, ram: 30, cpu: 3 },
    { pid: 4, parent: 0, ram: 99, cpu: 4 },
  ]
  assert.deepEqual(
    descendantProcesses(processes, 1)
      .map((p) => p.pid)
      .sort(),
    [1, 2, 3],
  )
  assert.equal(cpuTimeSeconds('1-02:03:04.50'), 93784.5)
  assert.equal(cpuTimeSeconds('03:04'), 184)
})
