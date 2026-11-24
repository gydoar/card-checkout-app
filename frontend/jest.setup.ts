import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

// jsdom no expone TextEncoder/TextDecoder (los usa React Router 7)
Object.assign(globalThis, { TextEncoder, TextDecoder });

// jsdom no implementa estas APIs del navegador que usa la app
if (!('timeout' in AbortSignal)) {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;
}

beforeEach(() => {
  window.localStorage.clear();
});
