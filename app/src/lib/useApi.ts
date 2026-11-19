import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './api';

/** 화면에 들어올 때마다 다시 불러오고, pollMs 를 주면 화면이 열려 있는 동안 주기적으로 갱신한다. */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[] = [], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    try {
      setData(await loaderRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', String(e)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      reload();
      if (!pollMs) return undefined;
      const t = setInterval(reload, pollMs);
      return () => clearInterval(t);
    }, [reload, pollMs]),
  );

  useEffect(() => {
    setLoading(true);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload, setData };
}
