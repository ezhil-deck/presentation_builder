import * as engine from '../src/index.js';

describe('@pb/engine exports', () => {
  it.each([
    'parseMarkdown',
    'inferKind',
    'measure',
    'breakLines',
    'layoutText',
    'fitText',
    'layoutChart',
    'layoutTable',
    'resolve',
    'surfaceFor',
    'pick',
    'summarize',
    'composeDeck',
  ])('%s', (name) => expect(typeof engine[name]).toBe('function'));
});
