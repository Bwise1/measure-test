"use client";

import React from "react";

interface FormulaToolbarProps {
    activeMode?: "add" | "deduct";
    onModeChange?: (mode: "add" | "deduct") => void;
    onSymbolClick?: (symbol: string) => void;
    disabled?: boolean;
    className?: string;
    compact?: boolean;
}

const symbols = ["()", "+", "*", "-", "/", "√"];

export const FormulaToolbar: React.FC<FormulaToolbarProps> = ({
    activeMode,
    onModeChange,
    onSymbolClick,
    disabled = false,
    className = "",
    compact = false,
}) => {
    return (
        <div
            className={`flex items-center gap-1 p-1 bg-[#141414] rounded-xl shadow-2xl border border-white/5 w-fit ${className} ${disabled ? "opacity-50 pointer-events-none" : ""
                }`}
        >
            {/* Mode Buttons */}
            <div className="flex items-center gap-1 pr-1 border-r border-white/10">
                <button
                    onClick={() => onModeChange?.("add")}
                    className={`px-2 py-1 rounded-lg font-semibold transition-all duration-200 transform active:scale-95 ${activeMode === "add"
                        ? "bg-[#eeb952] text-black shadow-[0_0_15px_rgba(238,185,82,0.3)]"
                        : "bg-[#eeb952]/10 text-[#eeb952] hover:bg-[#eeb952]/20"
                        } ${compact ? "px-3 py-1.5 text-sm" : "text-base"}`}
                >
                    Add
                </button>
                <button
                    onClick={() => onModeChange?.("deduct")}
                    className={`px-2 py-1 rounded-lg font-semibold transition-all duration-200 transform active:scale-95 ${activeMode === "deduct"
                        ? "bg-[#f8714b] text-white shadow-[0_0_15px_rgba(248,113,75,0.3)]"
                        : "bg-[#f8714b]/10 text-[#f8714b] hover:bg-[#f8714b]/20"
                        } ${compact ? "px-3 py-1.5 text-sm" : "text-base"}`}
                >
                    Deduct
                </button>
            </div>

            {/* Symbol Buttons */}
            <div className="flex items-center gap-1 pl-0.5">
                {symbols.map((symbol) => (
                    <button
                        key={symbol}
                        onClick={() => onSymbolClick?.(symbol)}
                        className={`flex items-center justify-center bg-white text-[#4a4a4a] font-bold rounded-lg transition-all duration-200 hover:bg-gray-100 active:scale-90 shadow-sm ${compact ? "w-8 h-8 text-sm" : "w-10 h-10 text-lg"
                            }`}
                    >
                        {symbol}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default FormulaToolbar;
