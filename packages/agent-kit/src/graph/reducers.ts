import type { Reducer } from "./types.js";

export function addReducer<T extends number>(): Reducer<T> {
  return (existing: T, incoming: T) => ((existing ?? 0) + (incoming ?? 0)) as T;
}

export function replaceReducer<T>(): Reducer<T> {
  return (_existing: T, incoming: T) => incoming;
}

export function mergeReducer<T extends Record<string, unknown>>(): Reducer<T> {
  return (existing: T, incoming: T) => ({
    ...(existing ?? {}),
    ...(incoming ?? {}),
  }) as T;
}

export function appendReducer<T>(): Reducer<T[]> {
  return (existing: T[], incoming: T[]) => [
    ...(existing ?? []),
    ...(incoming ?? []),
  ];
}

export function concatReducer(): Reducer<string> {
  return (existing: string, incoming: string) =>
    `${existing ?? ""}${incoming ?? ""}`;
}
