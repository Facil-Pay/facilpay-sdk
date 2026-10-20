import { afterEach, describe, expect, it } from 'vitest';
import { detectRuntime } from './version';

const g = globalThis as Record<string, unknown>;
const originalBun = g['Bun'];
const originalDeno = g['Deno'];
const originalEdge = g['EdgeRuntime'];
const originalWindow = g['window'];
const originalProcess = g['process'];

function resetGlobals(): void {
  if (typeof originalBun === 'undefined') delete g['Bun'];
  else g['Bun'] = originalBun;
  if (typeof originalDeno === 'undefined') delete g['Deno'];
  else g['Deno'] = originalDeno;
  if (typeof originalEdge === 'undefined') delete g['EdgeRuntime'];
  else g['EdgeRuntime'] = originalEdge;
  if (typeof originalWindow === 'undefined') delete g['window'];
  else g['window'] = originalWindow;
  if (typeof originalProcess === 'undefined') delete g['process'];
  else g['process'] = originalProcess;
}

afterEach(resetGlobals);

function clearRuntimeGlobals(): void {
  delete g['Bun'];
  delete g['Deno'];
  delete g['EdgeRuntime'];
  delete g['window'];
}

describe('detectRuntime', () => {
  it('detects bun', () => {
    clearRuntimeGlobals();
    g['Bun'] = {};
    expect(detectRuntime()).toBe('bun');
  });

  it('detects deno', () => {
    clearRuntimeGlobals();
    g['Deno'] = {};
    expect(detectRuntime()).toBe('deno');
  });

  it('detects node via process.versions.node', () => {
    clearRuntimeGlobals();
    expect(detectRuntime()).toBe('node');
  });

  it('detects edge runtimes that polyfill process', () => {
    clearRuntimeGlobals();
    g['process'] = {};
    g['EdgeRuntime'] = 'vercel-edge';
    expect(detectRuntime()).toBe('edge');
  });

  it('prefers node over edge when process.versions.node exists', () => {
    clearRuntimeGlobals();
    g['EdgeRuntime'] = 'vercel-edge';
    expect(detectRuntime()).toBe('node');
  });

  it('detects browser via window', () => {
    clearRuntimeGlobals();
    g['process'] = {};
    g['window'] = {};
    expect(detectRuntime()).toBe('browser');
  });
});
