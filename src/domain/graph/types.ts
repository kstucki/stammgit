/** Pure input/output contracts shared by both comparison engines. */
export interface Size { w: number; h: number }
export interface GraphNode {
  id: string;
  type: string;
  persons: string[];
  ph?: { person: string; offset: number };
}
export interface GraphEdge {
  from: string;
  to: string;
  dashed: boolean;
  layoutOnly?: boolean;
  ring?: string;
}
export interface GraphRing { id: string; a: string; b: string; na: string; nb: string }
export interface LayoutGraph { nodes: GraphNode[]; edges: GraphEdge[]; rings?: GraphRing[] }
export interface LayoutNode extends GraphNode, Size { x: number; y: number; gen: number; desired: number }
export interface GraphLayout {
  nodes: LayoutNode[];
  edges: GraphEdge[];
  rings: GraphRing[];
  width: number;
  height: number;
}
