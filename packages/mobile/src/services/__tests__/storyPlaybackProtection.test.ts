import { acquireProtectedStoryPlayback, isProtectedStoryPlaybackActive } from '../storyPlaybackProtection';

describe('Story playback protection', () => {
  it('pauses listening and resumes only when the last story closes', () => {
    const pause = jest.fn(() => true);
    const resume = jest.fn();
    const closeA = acquireProtectedStoryPlayback(pause, resume);
    const closeB = acquireProtectedStoryPlayback(pause, resume);
    expect(isProtectedStoryPlaybackActive()).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
    closeA();
    expect(resume).not.toHaveBeenCalled();
    closeB();
    expect(isProtectedStoryPlaybackActive()).toBe(false);
    expect(resume).toHaveBeenCalledTimes(1);
    closeB();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('never resumes a session that was not listening before the story', () => {
    const resume = jest.fn();
    const close = acquireProtectedStoryPlayback(() => false, resume);
    close();
    expect(resume).not.toHaveBeenCalled();
  });
});
