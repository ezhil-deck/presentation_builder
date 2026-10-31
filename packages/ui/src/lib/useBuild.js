import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/** The build of one brand: start it, poll its state while it runs, call `onDone` when it finishes. */
export function useBuild(id, onDone) {
  const [state, setState] = useState({ running: false, log: [], exitCode: null });
  const [error, setError] = useState(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let live = true;
    api
      .buildState(id)
      .then((s) => live && s && setState(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!state.running) return undefined;
    const t = setInterval(async () => {
      try {
        const s = await api.buildState(id);
        if (!s) return;
        setState(s);
        if (!s.running) done.current?.(s);
      } catch (err) {
        setError(err.message);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [id, state.running]);

  const start = useCallback(
    async (png) => {
      setError(null);
      try {
        setState(await api.build(id, png));
      } catch (err) {
        setError(err.message);
      }
    },
    [id],
  );

  return { state, error, start };
}
