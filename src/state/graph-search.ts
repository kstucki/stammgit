import type { GraphMode } from '../domain/tree-selection';
export interface GraphSearch { mode: GraphMode; center: string; exclude: string[]; choose(id: string): void; add?: (id: string) => void; showFamily(id: string): void; connectPair(from: string, to: string): void }
