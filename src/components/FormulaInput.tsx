"use client";

import React, { useState, useRef, useEffect } from "react";
import FormulaToolbar from "./FormulaToolbar";
import { isValidSequence, getSmartBracket, validateFormula } from "../utils/formulaUtils";

interface FormulaInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export const FormulaInput: React.FC<FormulaInputProps> = ({
    value,
    onChange,
    placeholder = "Enter formula...",
    className = "",
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const [mode, setMode] = useState<"add" | "deduct">("add");
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { isValid, error } = validateFormula(value);

    // Handle clicks outside the component to close the toolbar
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSymbolClick = (symbol: string) => {
        let nextSymbol = symbol;

        // Handle smart brackets
        if (symbol === "()") {
            nextSymbol = getSmartBracket(value);
        }

        if (isValidSequence(value, nextSymbol)) {
            const newValue = value + nextSymbol;
            onChange(newValue);
        }

        // Keep focus on input after clicking a symbol
        inputRef.current?.focus();
    };

    return (
        <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
            {/* Floating Toolbar */}
            <div
                className={`absolute bottom-full left-0 mb-2 transition-all duration-300 transform origin-bottom ${isFocused ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2 pointer-events-none"
                    } z-50`}
            >
                <FormulaToolbar
                    activeMode={mode}
                    onModeChange={setMode}
                    onSymbolClick={handleSymbolClick}
                    compact
                />
                {/* Pointer Triangle */}
                {/* <div className="absolute top-full left-10 -mt-1 w-3 h-3 bg-[#141414] rotate-45 border-r border-b border-white/5" /> */}
            </div>

            {/* Input Field */}
            <div className="relative group">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    placeholder={placeholder}
                    className={`w-full px-4 py-2.5 bg-white border rounded-xl shadow-sm outline-none transition-all placeholder:text-gray-400 font-medium text-gray-700 ${!isValid && value.length > 0
                        ? "border-red-500 focus:ring-2 focus:ring-red-100"
                        : "border-gray-200 focus:ring-2 focus:ring-[#2da1a1]/20 focus:border-[#2da1a1]"
                        }`}
                />

                {/* Error Tooltip */}
                {!isValid && value.length > 0 && isFocused && (
                    <div className="absolute top-full left-0 mt-2 px-3 py-1 bg-red-600 text-white text-[10px] font-bold rounded shadow-lg z-[60]">
                        {error}
                        <div className="absolute -top-1 left-4 w-2 h-2 bg-red-600 rotate-45" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default FormulaInput;
