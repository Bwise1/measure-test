import Dexie, { Table } from 'dexie';
import { TakeoffItem } from './components/types';

export interface ProjectState {
    id: string; // 'current' for the main project session
    takeoffItems: TakeoffItem[];
    scale?: number | null; // Legacy single scale
    scales?: Record<number, number>; // Per-page scales
    backgroundImage?: string; // Data URL
    calibrationLine?: { p1: { x: number, y: number }, p2: { x: number, y: number }, distance: number } | null; // Legacy
    calibrationLines?: Record<number, { p1: { x: number, y: number }, p2: { x: number, y: number }, distance: number }>;
}

export class BWiseDatabase extends Dexie {
    projectState!: Table<ProjectState>;

    constructor() {
        super('BWiseDatabase');
        this.version(1).stores({
            projectState: 'id'
        });
    }
}

export const db = new BWiseDatabase();
