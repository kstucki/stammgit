import { orderFamily } from './family-layout';
import type { FamilySlice } from './family';

self.onmessage = (event: MessageEvent<{ family: FamilySlice; generations?: Map<string, number> }>) => {
  self.postMessage(orderFamily(event.data.family, event.data.generations));
};
