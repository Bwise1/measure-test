"use client";

import React from "react";

export type UnitType = "m" | "m2" | "m3" | "nrs" | "item";

interface UnitSelectorProps {
    selectedUnit: UnitType;
    onChange: (unit: UnitType) => void;
    className?: string;
}

const units: { label: React.ReactNode; value: UnitType }[] = [
    { label: "m", value: "m" },
    { label: <span>m<sup>2</sup></span>, value: "m2" },
    { label: <span>m<sup>3</sup></span>, value: "m3" },
    { label: "nrs", value: "nrs" },
    { label: "item", value: "item" },
];

export const UnitSelector: React.FC<UnitSelectorProps> = ({
    selectedUnit,
    onChange,
    className = "",
}) => {
    return (
        <div className={`flex border border-gray-200 rounded-md overflow-hidden bg-white w-full ${className}`}>
            {units.map((unit) => (
                <button
                    key={unit.value}
                    onClick={() => onChange(unit.value)}
                    className={`flex-1 py-1.5 px-3 text-sm font-medium transition-all duration-200 ${selectedUnit === unit.value
                            ? "bg-[#2da1a1] text-white"
                            : "text-gray-600 hover:bg-gray-50 bg-white"
                        } ${unit.value !== "item" ? "border-r border-gray-200" : ""}`}
                >
                    {unit.label}
                </button>
            ))}
        </div>
    );
};

export default UnitSelector;
