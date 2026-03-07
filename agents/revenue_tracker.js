/**
 * REVENUE TRACKER – Track performance of deployed apps.
 *
 * Stores: product_name, deploy_date, visitors, signups, revenue, conversion_rate.
 * Rules: conversion_rate = signups / visitors.
 * - visitors < 100 after 30 days → mark for review
 * - conversion_rate > 5% → mark as scale candidate.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const METRICS_FILE = path.join(root, "data", "revenue_metrics.json");

const REVIEW_VISITOR_THRESHOLD = 100;
const REVIEW_DAYS_AFTER_DEPLOY = 30;
const SCALE_CONVERSION_THRESHOLD = 0.05; // 5%

async function loadMetrics() {
  try {
    const raw = await fs.readFile(METRICS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.products) ? data.products : [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

async function saveMetrics(products) {
  await fs.mkdir(path.dirname(METRICS_FILE), { recursive: true });
  await fs.writeFile(
    METRICS_FILE,
    JSON.stringify({ products, updated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

function normalizeProductName(name) {
  return String(name || "").trim() || "unknown";
}

/**
 * Compute conversion_rate from signups / visitors (avoid division by zero).
 */
function computeConversionRate(signups, visitors) {
  const v = Number(visitors);
  const s = Number(signups);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (!Number.isFinite(s) || s < 0) return 0;
  return Math.min(1, s / v);
}

/**
 * Record or update metrics for a product.
 *
 * @param {string} product_name - Product identifier
 * @param {Object} metrics - { deploy_date?, visitors?, signups?, revenue?, conversion_rate? }
 * @returns {Promise<Object>} The stored record (with conversion_rate computed if not provided)
 */
export async function recordMetrics(product_name, metrics) {
  const name = normalizeProductName(product_name);
  const products = await loadMetrics();

  let visitors = metrics?.visitors;
  let signups = metrics?.signups;
  if (visitors == null) visitors = 0;
  if (signups == null) signups = 0;

  const conversion_rate =
    typeof metrics?.conversion_rate === "number" && Number.isFinite(metrics.conversion_rate)
      ? Math.min(1, Math.max(0, metrics.conversion_rate))
      : computeConversionRate(signups, visitors);

  const record = {
    product_name: name,
    deploy_date: metrics?.deploy_date ?? new Date().toISOString().slice(0, 10),
    visitors: Number(visitors) || 0,
    signups: Number(signups) || 0,
    revenue: Number(metrics?.revenue) || 0,
    conversion_rate,
    last_updated: new Date().toISOString()
  };

  const idx = products.findIndex((p) => normalizeProductName(p.product_name) === name);
  if (idx >= 0) {
    products[idx] = { ...products[idx], ...record };
  } else {
    products.push(record);
  }

  await saveMetrics(products);
  return record;
}

/**
 * Evaluate performance for a product: apply rules and return flags.
 *
 * @param {string} product_name - Product identifier
 * @returns {Promise<Object>} { product_name, metrics, mark_for_review, scale_candidate, reason? }
 */
export async function evaluatePerformance(product_name) {
  const name = normalizeProductName(product_name);
  const products = await loadMetrics();
  const product = products.find((p) => normalizeProductName(p.product_name) === name);

  if (!product) {
    return {
      product_name: name,
      metrics: null,
      mark_for_review: false,
      scale_candidate: false,
      reason: "No metrics recorded"
    };
  }

  const deployDate = product.deploy_date ? new Date(product.deploy_date) : null;
  const now = new Date();
  const daysSinceDeploy =
    deployDate && !isNaN(deployDate.getTime())
      ? Math.floor((now - deployDate) / (24 * 60 * 60 * 1000))
      : 0;

  let mark_for_review = false;
  let scale_candidate = false;
  const reasons = [];

  if (daysSinceDeploy >= REVIEW_DAYS_AFTER_DEPLOY && product.visitors < REVIEW_VISITOR_THRESHOLD) {
    mark_for_review = true;
    reasons.push(
      `Visitors (${product.visitors}) < ${REVIEW_VISITOR_THRESHOLD} after ${REVIEW_DAYS_AFTER_DEPLOY} days`
    );
  }

  if (product.conversion_rate > SCALE_CONVERSION_THRESHOLD) {
    scale_candidate = true;
    reasons.push(
      `Conversion rate (${(product.conversion_rate * 100).toFixed(1)}%) > ${SCALE_CONVERSION_THRESHOLD * 100}%`
    );
  }

  return {
    product_name: name,
    metrics: product,
    mark_for_review,
    scale_candidate,
    reason: reasons.length ? reasons.join("; ") : "No flags triggered"
  };
}
