const fs = require('fs');

// We need to test findIV
function cndf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = (x < 0) ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);
    const t = 1.0 / (1.0 + p * x);
    const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * erf);
}
function npdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

function bsCalc(isCall, S, K, T, r, sigma) {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return isCall ? (S * cndf(d1) - K * Math.exp(-r * T) * cndf(d2)) : (K * Math.exp(-r * T) * cndf(-d2) - S * cndf(-d1));
}

function findIV(isCall, S, K, T, r, marketPrice) {
    if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return null;
    let intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    if (marketPrice < intrinsic) return null;

    let sigma = 0.4;
    for (let i = 0; i < 35; i++) {
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const p = bsCalc(isCall, S, K, T, r, sigma);
        const diff = p - marketPrice;
        if (Math.abs(diff) < 0.1) return sigma * 100;
        const vega = S * Math.sqrt(T) * npdf(d1);
        if (vega < 1e-6) break;
        sigma -= diff / vega;
        if (sigma <= 0.001) sigma = 0.001;
        if (sigma > 5.0) return null;
    }

    // Bisection Fallback
    let low = 0.001, high = 5.0;
    for (let i = 0; i < 50; i++) {
        let mid = (low + high) / 2;
        let p = bsCalc(isCall, S, K, T, r, mid);
        if (Math.abs(p - marketPrice) < 0.1) return mid * 100;
        if (p < marketPrice) low = mid;
        else high = mid;
    }
    return null;
}

// Test 1: valid IV
const S = 1000, K = 1000, T = 30/365, r = 0.3;
const p = bsCalc(true, S, K, T, r, 0.5);
const iv = findIV(true, S, K, T, r, p);
if (Math.abs(iv - 50) > 1) {
    console.error("Test 1 failed. IV:", iv);
    process.exit(1);
}

// Test 2: intrinsic > price
const p2 = 10;
const iv2 = findIV(true, 1200, 1000, T, r, p2);
if (iv2 !== null) {
    console.error("Test 2 failed. IV:", iv2);
    process.exit(1);
}

console.log("IV tests passed.");
