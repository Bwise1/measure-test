"use client";

import React, { useState } from "react";
import { Copy, Trash2, X, FileEdit } from "lucide-react";
import UnitSelector, { UnitType } from "./UnitSelector";
import FormulaInput from "./FormulaInput";

export interface HistoryItem {
    id: string;
    value: string;
}

export interface EstimationCardData {
    id: string;
    unit: UnitType;
    header: string;
    description: string;
    qty: string;
    rate: string;
    history: HistoryItem[];
}

interface EstimationCardProps {
    data?: Partial<EstimationCardData>;
    onDelete?: (id: string) => void;
    onCopy?: (id: string) => void;
    onUpdate?: (id: string, data: Partial<EstimationCardData>) => void;
    className?: string;
}

export const EstimationCard: React.FC<EstimationCardProps> = ({
    data,
    onDelete,
    onCopy,
    onUpdate,
    className = "",
}) => {
    const [unit, setUnit] = useState<UnitType>(data?.unit || "m3");
    const [header, setHeader] = useState(data?.header || "Header");
    const [takeoff, setTakeoff] = useState("");
    const [qty, setQty] = useState(data?.qty || "0");
    const [rate, setRate] = useState(data?.rate || "0.00");
    const [history, setHistory] = useState<HistoryItem[]>(data?.history || []);

    const removeHistoryItem = (itemId: string) => {
        const newHistory = history.filter(item => item.id !== itemId);
        setHistory(newHistory);
        onUpdate?.(data?.id || "", { history: newHistory });
    };

    const updateUnit = (newUnit: UnitType) => {
        setUnit(newUnit);
        onUpdate?.(data?.id || "", { unit: newUnit });
    };

    return (
        <div className={`p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-4 hover:shadow-md transition-all duration-200 ${className}`}>
            {/* Unit Selector */}
            <UnitSelector selectedUnit={unit} onChange={updateUnit} />

            {/* Header Input */}
            <input
                type="text"
                value={header}
                onChange={(e) => { setHeader(e.target.value); onUpdate?.(data?.id || "", { header: e.target.value }); }}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#2da1a1]/20 focus:border-[#2da1a1] outline-none text-sm font-medium text-gray-700 transition-all"
            />

            {/* Description Area */}
            <div className="p-3 border border-gray-100 rounded-lg bg-gray-50/50">
                <div className="flex gap-2">
                    <span className="font-bold text-[#2da1a1] shrink-0 text-xs mt-0.5">A</span>
                    <p className="text-xs text-gray-500 leading-relaxed italic">
                        {data?.description || "Clear vegetation site of bushes and remove tree stump of over 1000mm width"}
                    </p>
                </div>
            </div>

            {/* Input Section */}
            <div className="space-y-3">
                <div className="flex gap-2 items-stretch">
                    <div className="flex-1">
                        <FormulaInput
                            value={takeoff}
                            onChange={setTakeoff}
                            placeholder="Takeoff (e.g. 250 or 10*3*1 + 5*3*1)"
                            className="w-full"
                        />
                    </div>
                    <div className="flex bg-[#2da1a1] text-white rounded-xl overflow-hidden shadow-sm">
                        <button className="px-2.5 hover:bg-[#258a8a] border-r border-white/20 transition-colors">
                            <FileEdit className="w-4 h-4" />
                        </button>
                        <button className="px-3 py-1 text-xs font-bold flex items-center gap-1 hover:bg-[#258a8a] transition-colors">
                            A <span className="opacity-70 text-[10px]">▼</span>
                        </button>
                    </div>
                </div>

                {/* History / Badges */}
                {history.length > 0 && (
                    <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Recent Calculations:</span>
                        <div className="flex flex-wrap gap-2 items-center text-[11px]">
                            {history.map((item, idx) => (
                                <React.Fragment key={item.id}>
                                    {idx > 0 && <span className="text-gray-300 font-bold mx-0.5">{idx === 1 ? '+' : '−'}</span>}
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${idx === 0 ? "bg-gray-50 border-gray-200 text-gray-600" :
                                            idx === 1 ? "bg-red-50/50 border-red-100 text-red-500" :
                                                "bg-amber-50/50 border-amber-100 text-amber-600 font-medium"
                                        }`}>
                                        <span>{item.value}</span>
                                        <button onClick={() => removeHistoryItem(item.id)} className="hover:text-gray-900 opacity-60 hover:opacity-100 transition-opacity">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Summary Section (Qty/Rate) */}
            <div className="flex gap-3">
                <div className="flex-1 flex items-center border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-[#2da1a1]/20 focus-within:border-[#2da1a1] transition-all">
                    <span className="px-2.5 py-2 text-[10px] font-bold text-gray-400 uppercase border-r border-gray-100 bg-gray-50/50">Qty</span>
                    <input
                        type="text"
                        value={qty}
                        onChange={(e) => { setQty(e.target.value); onUpdate?.(data?.id || "", { qty: e.target.value }); }}
                        className="flex-1 px-2 py-2 text-sm font-bold text-right outline-none text-gray-800"
                    />
                    <span className="px-2 py-2 text-[10px] font-bold text-gray-400 border-l border-gray-100 bg-gray-50/50 min-w-[35px] text-center">{unit}</span>
                </div>
                <div className="flex-1 flex items-center border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-[#2da1a1]/20 focus-within:border-[#2da1a1] transition-all">
                    <span className="px-2.5 py-2 text-[10px] font-bold text-gray-400 uppercase border-r border-gray-100 bg-gray-50/50">Rate</span>
                    <div className="flex-1 flex items-center justify-end px-3 py-2">
                        <span className="text-sm font-bold text-gray-700 mr-1 opacity-50">₦</span>
                        <input
                            type="text"
                            value={rate}
                            onChange={(e) => { setRate(e.target.value); onUpdate?.(data?.id || "", { rate: e.target.value }); }}
                            className="w-full text-sm font-bold text-right outline-none text-gray-800"
                        />
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-4 text-[11px] font-bold text-gray-400">
                    <span className="uppercase tracking-tighter opacity-70">Add:</span>
                    <button className="hover:text-[#2da1a1] transition-colors">Element</button>
                    <button className="hover:text-[#2da1a1] transition-colors">Item</button>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => onCopy?.(data?.id || "")} className="p-2 text-gray-400 hover:bg-[#2da1a1]/10 hover:text-[#2da1a1] rounded-lg transition-all" title="Copy Card">
                        <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => onDelete?.(data?.id || "")} className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all" title="Delete Card">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EstimationCard;
