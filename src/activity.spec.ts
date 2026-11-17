import { afterEach, describe, expect, it } from 'vitest';

import { ACTIVITY_KEY, ActivityTracker, activityChange, sharedActivity } from './activity';

afterEach(() => {
  delete (globalThis as unknown as Record<symbol, ActivityTracker | undefined>)[ACTIVITY_KEY];
});

describe('activityChange', () => {
  it('maps execution and status events to running', () => {
    expect(activityChange('session.execution.started')).toEqual({ running: true });
    expect(activityChange('session.execution.succeeded')).toEqual({ running: false });
    expect(activityChange('session.execution.failed')).toEqual({ running: false });
    expect(activityChange('session.execution.interrupted')).toEqual({ running: false });
    expect(activityChange('session.idle')).toEqual({ running: false });
    expect(activityChange('session.status', 'busy')).toEqual({ running: true });
    expect(activityChange('session.status', 'idle')).toEqual({ running: false });
    expect(activityChange('session.status', 'retry')).toBeUndefined();
  });

  it('maps permission and form events to waiting', () => {
    expect(activityChange('permission.asked')).toEqual({ waiting: true });
    expect(activityChange('permission.replied')).toEqual({ waiting: false });
    expect(activityChange('form.created')).toEqual({ waiting: true });
    expect(activityChange('form.replied')).toEqual({ waiting: false });
    expect(activityChange('form.cancelled')).toEqual({ waiting: false });
  });

  it('ignores unrelated events', () => {
    expect(activityChange('session.created')).toBeUndefined();
    expect(activityChange('message.updated')).toBeUndefined();
  });
});

describe('ActivityTracker', () => {
  it('tracks running and waiting per session', () => {
    const tracker = new ActivityTracker();
    tracker.apply('session.execution.started', 'ses_1');
    tracker.apply('permission.asked', 'ses_1');

    expect(tracker.isRunning('ses_1')).toBe(true);
    expect(tracker.isWaiting('ses_1')).toBe(true);
    expect(tracker.isRunning('ses_2')).toBe(false);

    tracker.apply('session.execution.succeeded', 'ses_1');
    tracker.apply('permission.replied', 'ses_1');
    expect(tracker.isRunning('ses_1')).toBe(false);
    expect(tracker.isWaiting('ses_1')).toBe(false);
  });

  it('forgets a deleted session', () => {
    const tracker = new ActivityTracker();
    tracker.apply('session.execution.started', 'ses_1');
    tracker.apply('permission.asked', 'ses_1');
    tracker.apply('session.deleted', 'ses_1');

    expect(tracker.snapshot()).toEqual({ running: new Set(), waiting: new Set() });
  });

  it('shares one tracker through globalThis', () => {
    expect(sharedActivity()).toBe(sharedActivity());
    sharedActivity().apply('session.execution.started', 'ses_1');
    expect(sharedActivity().isRunning('ses_1')).toBe(true);
  });
});
