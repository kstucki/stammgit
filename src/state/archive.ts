export type ArchiveState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error' };
