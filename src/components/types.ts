export type TakeoffMode = "linear" | "area" | "count" | "polyline";

export interface Point {
  x: number;
  y: number;
}

export interface CostItem {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  category: string;
}

export interface LinkedCost {
  costItemId: string;
  ratio: number; // multiplier for takeoff quantity
}

export interface TakeoffItem {
  id: string;
  name: string;
  type: TakeoffMode;
  color: string;
  measurements: Measurement[];
  totalQuantity: number;
  unit: string;
  linkedCosts: LinkedCost[];
}

export interface Measurement {
  id: string;
  points: Point[];
  quantity: number;
  page: number;
}
