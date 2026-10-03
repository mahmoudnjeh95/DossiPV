import { describe, it, expect } from 'vitest';
import { runEngine, type EngineResult } from '@dossipv/engine';

describe('workspace wiring', () => {
  it('apps/web can import and call @dossipv/engine\'s runEngine via the workspace link', () => {
    expect(typeof runEngine).toBe('function');
  });

  it('EngineResult type is usable from apps/web', () => {
    const fakeResult: EngineResult = { derived: {}, checks: [], hasBlockingFailure: false };
    expect(fakeResult.hasBlockingFailure).toBe(false);
  });
});
