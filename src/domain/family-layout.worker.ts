import { orderFamily, type LayoutEngine } from './family-layout';
import type { FamilySlice } from './family';

self.onmessage = (event: MessageEvent<{ family: FamilySlice; generations?: Map<string, number>; engine?: LayoutEngine }>) => {
  self.postMessage(orderFamily(event.data.family, event.data.generations, event.data.engine));
};
