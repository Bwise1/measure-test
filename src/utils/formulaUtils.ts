/**
 * Utilities for validating and managing mathematical formulas.
 */

const OPERATORS = ["+", "-", "*", "/", "√"];

/**
 * Checks if adding a new symbol to the current formula creates an invalid sequence.
 */
export const isValidSequence = (current: string, next: string): boolean => {
    const lastChar = current.trim().slice(-1);

    // Rule: Cannot have two operators in a row (except for negative numbers or specific functions)
    if (OPERATORS.includes(lastChar) && OPERATORS.includes(next)) {
        // Special case: - after * or / or ( is often allowed, but for simplicity we'll follow user's "++ wrong" rule
        return false;
    }

    // Rule: Cannot start with certain operators
    if (current.trim() === "" && ["+", "*", "/", ")"].includes(next)) {
        return false;
    }

    // Rule: Cannot have an operator immediately after an open bracket
    if (lastChar === "(" && ["+", "*", "/", ")"].includes(next)) {
        return false;
    }

    return true;
};

/**
 * Determines whether the next bracket should be '(' or ')' based on stack count.
 */
export const getSmartBracket = (formula: string): "(" | ")" => {
    const openBrackets = (formula.match(/\(/g) || []).length;
    const closeBrackets = (formula.match(/\)/g) || []).length;
    const lastChar = formula.trim().slice(-1);

    // If there are open brackets to close, and the last char isn't an operator or an open bracket
    if (openBrackets > closeBrackets) {
        if (!OPERATORS.includes(lastChar) && lastChar !== "(") {
            return ")";
        }
    }

    return "(";
};

/**
 * Validates if the entire formula is mathematically balanced and doesn't end with an operator.
 */
export const validateFormula = (formula: string): { isValid: boolean; error?: string } => {
    if (formula.trim() === "") return { isValid: true };

    const lastChar = formula.trim().slice(-1);
    if (OPERATORS.includes(lastChar)) {
        return { isValid: false, error: "Formula cannot end with an operator" };
    }

    const openBrackets = (formula.match(/\(/g) || []).length;
    const closeBrackets = (formula.match(/\)/g) || []).length;
    if (openBrackets !== closeBrackets) {
        return { isValid: false, error: "Brackets are not balanced" };
    }

    // Basic check for empty brackets ()
    if (/\(\)/.test(formula)) {
        return { isValid: false, error: "Empty brackets are not allowed" };
    }

    return { isValid: true };
};
