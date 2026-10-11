// Tests en français (les textes attendus sont français) : avant tout import du
// module de traduction, qui lit la langue au chargement. jsdom annonce en-US.
localStorage.setItem('xlcab.corporate.lang', 'fr');

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// Recharts (ResponsiveContainer) a besoin de ResizeObserver, absent de jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
