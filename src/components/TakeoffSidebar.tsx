"use client";

import React from "react";
import { TakeoffItem, TakeoffMode } from "./types";
import { Ruler, Square, Hash, Trash2, Plus } from "lucide-react";

interface TakeoffSidebarProps {
    items: TakeoffItem[];
    activeItemId: string | null;
    onSelectItem: (id: string) => void;
    onCreateItem: (type: TakeoffMode) => void;
    onDeleteItem: (id: string) => void;
    onUpdateItem: (id: string, updates: Partial<TakeoffItem>) => void;
}

const TakeoffSidebar: React.FC<TakeoffSidebarProps> = ({
    items,
    activeItemId,
    onSelectItem,
    onCreateItem,
    onDeleteItem,
    onUpdateItem,
}) => {
    const getIcon = (type: TakeoffMode) => {
        switch (type) {
            case "linear":
            case "polyline":
                return <Ruler className="w-4 h-4" />;
            case "area":
                return <Square className="w-4 h-4" />;
            case "count":
                return <Hash className="w-4 h-4" />;
        }
    };

    return (
        <div className="w-64 bg-white/80 backdrop-blur-md border-r border-gray-200 h-full flex flex-col shadow-xl">
            <div className="p-4 border-b border-gray-200 bg-gray-50/50">
                <h2 className="text-xl font-bold text-gray-800">Takeoffs</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {items.map((item) => (
                    <div
                        key={item.id}
                        onClick={() => onSelectItem(item.id)}
                        className={`group p-3 rounded-xl border transition-all cursor-pointer ${activeItemId === item.id
                            ? "bg-blue-50 border-blue-200 shadow-sm"
                            : "bg-white border-gray-100 hover:border-blue-100 hover:bg-gray-50"
                            }`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                                <div
                                    className="w-3 h-3 rounded-full mr-1"
                                    style={{ backgroundColor: item.color }}
                                />
                                <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => onUpdateItem(item.id, { name: e.target.value })}
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-transparent font-semibold text-gray-700 text-sm border-none focus:ring-0 w-full p-0"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteItem(item.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                            <div className="flex items-center space-x-1">
                                {getIcon(item.type)}
                                <span>{item.type}</span>
                            </div>
                            <span className="font-mono bg-white px-2 py-0.5 rounded border border-gray-100">
                                {item.totalQuantity.toFixed(2)} {item.unit}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50/50 grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => onCreateItem("linear")}
                    className="flex items-center justify-center space-x-1 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm text-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span>Linear</span>
                </button>
                <button
                    type="button"
                    onClick={() => onCreateItem("area")}
                    className="flex items-center justify-center space-x-1 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm text-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span>Area</span>
                </button>
                <button
                    type="button"
                    onClick={() => onCreateItem("count")}
                    className="flex items-center justify-center space-x-1 p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition shadow-sm text-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span>Count</span>
                </button>
            </div>
        </div>
    );
};

export default TakeoffSidebar;
