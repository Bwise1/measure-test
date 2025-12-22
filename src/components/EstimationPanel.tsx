"use client";

import React from "react";
import { TakeoffItem, CostItem } from "./types";
import { DollarSign, PieChart, Package, ArrowRight } from "lucide-react";

interface EstimationPanelProps {
    items: TakeoffItem[];
    catalog: CostItem[];
}

const EstimationPanel: React.FC<EstimationPanelProps> = ({ items, catalog }) => {
    const getLinkedCostItems = (item: TakeoffItem) => {
        return item.linkedCosts.map(lc => {
            const costItem = catalog.find(c => c.id === lc.costItemId);
            if (!costItem) return null;
            const totalCost = item.totalQuantity * lc.ratio * costItem.unitPrice;
            return { ...costItem, ratio: lc.ratio, totalCost };
        }).filter((c): c is (CostItem & { ratio: number, totalCost: number }) => c !== null);
    };

    const projectTotal = items.reduce((sum, item) => {
        const itemCosts = getLinkedCostItems(item);
        return sum + itemCosts.reduce((s, c) => s + (c?.totalCost || 0), 0);
    }, 0);

    const exportToCSV = () => {
        const rows = [
            ["Category", "Takeoff Item", "Cost Component", "Quantity", "Unit", "Rate", "Total"],
        ];

        items.forEach(item => {
            const costs = getLinkedCostItems(item);
            costs.forEach((c) => {
                rows.push([
                    c.category,
                    item.name,
                    c.name,
                    item.totalQuantity.toFixed(2),
                    c.unit,
                    c.unitPrice.toString(),
                    c.totalCost.toFixed(2)
                ]);
            });
        });

        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Estimate_Export_${new Date().toLocaleDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="w-80 bg-white/90 backdrop-blur-xl border-l border-gray-200 h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-500">
            <div className="p-6 border-b border-gray-200/50 flex flex-col space-y-1">
                <h2 className="text-xl font-extrabold text-gray-900 flex items-center space-x-2 tracking-tight">
                    <DollarSign className="w-6 h-6 text-green-600" />
                    <span>Project Estimate</span>
                </h2>
                <div className="flex flex-col space-y-2 mt-2">
                    <input
                        type="text"
                        placeholder="Project Name..."
                        className="bg-transparent text-xs font-bold border-b border-gray-100 focus:border-blue-500 outline-none pb-1 text-gray-600"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                {items.filter(i => i.totalQuantity > 0).map(item => {
                    const costs = getLinkedCostItems(item);
                    const itemTotal = costs.reduce((s, c) => s + (c?.totalCost || 0), 0);

                    if (costs.length === 0) return null;

                    return (
                        <div key={item.id} className="group animate-in fade-in duration-700">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">{item.name}</span>
                                </div>
                                <span className="text-sm font-mono font-bold text-blue-600">${itemTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>

                            <div className="space-y-2 pl-4 border-l-2 border-gray-100 group-hover:border-blue-200 transition-colors border-dashed">
                                {costs.map((c) => (
                                    <div key={c.id} className="flex flex-col text-xs space-y-0.5">
                                        <div className="flex items-center justify-between text-gray-600 font-medium">
                                            <span>{c.name}</span>
                                            <span className="text-gray-900 font-bold">${c.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 italic">
                                            {item.totalQuantity.toFixed(2)} {item.unit} × {c.ratio} multiplier @ ${c.unitPrice}/{c.unit}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {projectTotal === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-center space-y-3 opacity-40">
                        <PieChart className="w-12 h-12 text-gray-300" />
                        <p className="text-sm text-gray-500 italic">Start measuring to generate<br />a live project estimate.</p>
                    </div>
                )}
            </div>

            <div className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-inner">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest leading-none text-green-400/70">Estimated Proposal Total</span>
                        <div className="text-3xl font-mono font-extrabold text-green-400 drop-shadow-sm">
                            ${projectTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="bg-green-500/10 p-2 rounded-full">
                        <Package className="w-6 h-6 text-green-400" />
                    </div>
                </div>
                <button
                    onClick={exportToCSV}
                    className="w-full flex items-center justify-center space-x-2 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg active:scale-95 font-bold uppercase tracking-widest text-xs"
                >
                    <span>Download Estimate (CSV)</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default EstimationPanel;
