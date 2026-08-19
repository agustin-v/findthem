import { getLastReadAt, markReadUpTo, resetChatReadState } from './chat-read-state';

describe('chat-read-state', () => {
  afterEach(() => {
    resetChatReadState();
  });

  it('starts with no read marker', () => {
    expect(getLastReadAt()).toBeNull();
  });

  it('markReadUpTo sets the marker', () => {
    markReadUpTo('2026-08-01T09:32:00Z');
    expect(getLastReadAt()).toBe('2026-08-01T09:32:00Z');
  });

  it('markReadUpTo only advances, never moves backwards', () => {
    markReadUpTo('2026-08-01T09:32:00Z');
    markReadUpTo('2026-08-01T09:00:00Z');
    expect(getLastReadAt()).toBe('2026-08-01T09:32:00Z');
  });

  it('markReadUpTo advances when given a later timestamp', () => {
    markReadUpTo('2026-08-01T09:00:00Z');
    markReadUpTo('2026-08-01T09:32:00Z');
    expect(getLastReadAt()).toBe('2026-08-01T09:32:00Z');
  });

  it('resetChatReadState clears the marker', () => {
    markReadUpTo('2026-08-01T09:32:00Z');
    resetChatReadState();
    expect(getLastReadAt()).toBeNull();
  });
});
