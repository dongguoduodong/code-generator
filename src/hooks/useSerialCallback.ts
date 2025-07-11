import { useMemoizedFn, useUpdate } from "ahooks";
import { useCallback, useRef } from "react";

type Fn<P extends unknown[], V, K extends boolean> = (
  ...args: P
) => K extends true ? Promise<V> : Promise<V | undefined>;

interface UseSerialCallbackOptions<K extends boolean> {
  /**
   * if true, return the last result when the function is called while it is busy, otherwise return undefined
   * @default false
   */
  returnLastResultOnBusy?: K;

  /**
   * if true, trigger a re-render when the function status changes
   * @default true
   */
  triggerReRenderOnBusyStatusChange?: boolean;
}

export interface SerialCallback<P extends unknown[], V, K extends boolean>
  extends Fn<P, V, K> {
  isBusy: () => boolean;
}

/**
 * add lock to an async function to prevent parallel executions.
 *
 * @template P arguments type
 * @template V return value type
 * @template K A boolean indicating whether to return the last result when busy. Inferred from the `returnLastResultOnBusy` option
 * @param {(...args: P) => Promise<V>} fn The async function to be executed.
 * @param {UseSerialCallbackOptions<K>} [options={}] The configuration options.
 * @returns {SerialCallback<P, V, K>} An enhanced **stable** async function with an `isBusy` method.
 */
export function useSerialCallback<
  P extends unknown[] = unknown[],
  V = unknown,
  K extends boolean = false
>(
  fn: (...args: P) => Promise<V>,
  options: UseSerialCallbackOptions<K> = {}
): SerialCallback<P, V, K> {
  const {
    returnLastResultOnBusy = false,
    triggerReRenderOnBusyStatusChange = true,
  } = options;
  const isBusyRef = useRef(false);
  const update = useUpdate();

  const lastResult = useRef<V | undefined>(undefined);

  const cb = useMemoizedFn(async (...args: P) => {
    if (isBusyRef.current) {
      return returnLastResultOnBusy ? lastResult.current : undefined;
    }
    isBusyRef.current = true;
    if (triggerReRenderOnBusyStatusChange) {
      update();
    }
    try {
      const result = await fn(...args);
      lastResult.current = result;
      return result;
    } finally {
      isBusyRef.current = false;
      if (triggerReRenderOnBusyStatusChange) {
        update();
      }
    }
  });

  return useCallback(
    Object.assign(cb, { isBusy: () => isBusyRef.current }) as SerialCallback<
      P,
      V,
      K
    >,
    []
  );
}
