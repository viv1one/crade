// Minimal synchronous pub/sub, in the spirit of vnpy's EventEngine — used
// where independent producers (e.g. per-symbol backtest runs) need to fan
// out to a decoupled aggregator. No queue/worker: this app has no
// long-running process, so dispatch is plain synchronous iteration.
export class EventEngine<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(type: K, handler: (payload: Events[K]) => void): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler as (payload: never) => void);
  }

  off<K extends keyof Events>(type: K, handler: (payload: Events[K]) => void): void {
    this.handlers.get(type)?.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const handler of this.handlers.get(type) ?? []) {
      (handler as (payload: Events[K]) => void)(payload);
    }
  }
}
