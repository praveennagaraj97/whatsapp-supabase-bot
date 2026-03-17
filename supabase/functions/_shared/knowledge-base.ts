// Knowledge base service — loads doctors, clinics, medicines, FAQs from Supabase
import { getSupabaseClient } from "./supabase-client.ts";

// Simple in-memory cache
const cache: Record<string, { data: unknown; expiry: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache[key];
  if (entry && entry.expiry > Date.now()) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache[key] = { data, expiry: Date.now() + CACHE_TTL_MS };
}

export function clearKnowledgeBaseCache(projectId?: string): void {
  if (!projectId) {
    for (const key of Object.keys(cache)) {
      delete cache[key];
    }
    return;
  }

  for (const key of Object.keys(cache)) {
    if (key.startsWith(`${projectId}:`)) {
      delete cache[key];
    }
  }
}

export interface Doctor {
  id: string;
  project_id: string;
  source_id?: string | null;
  name: string;
  specialization: string;
  clinic_id: string;
  clinic_name: string;
  experience_years: number;
  qualification: string;
  available_days: string;
  available_time_start: string;
  available_time_end: string;
  consultation_fee: number;
  rating: number;
  languages: string;
  bio: string;
  is_active: boolean;
}

export interface Clinic {
  id: string;
  project_id: string;
  source_id?: string | null;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  operating_hours: string;
  specializations: string;
  rating: number;
  is_active: boolean;
}

export interface Medicine {
  id: string;
  project_id: string;
  source_id?: string | null;
  name: string;
  generic_name: string;
  category: string;
  description: string;
  dosage_form: string;
  strength: string;
  price: number;
  requires_prescription: boolean;
  manufacturer: string;
  in_stock: boolean;
}

export interface FAQ {
  id: string;
  project_id: string;
  source_id?: string | null;
  category: string;
  question: string;
  answer: string;
  is_active: boolean;
}

export async function getDoctors(projectId: string): Promise<Doctor[]> {
  const cacheKey = `${projectId}:doctors`;
  const cached = getCached<Doctor[]>(cacheKey);
  if (cached) return cached;

  const { data } = await getSupabaseClient()
    .from("doctors")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true);

  const result = (data || []) as Doctor[];
  setCache(cacheKey, result);
  return result;
}

export async function getClinics(projectId: string): Promise<Clinic[]> {
  const cacheKey = `${projectId}:clinics`;
  const cached = getCached<Clinic[]>(cacheKey);
  if (cached) return cached;

  const { data } = await getSupabaseClient()
    .from("clinics")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true);

  const result = (data || []) as Clinic[];
  setCache(cacheKey, result);
  return result;
}

export async function getMedicines(projectId: string): Promise<Medicine[]> {
  const cacheKey = `${projectId}:medicines`;
  const cached = getCached<Medicine[]>(cacheKey);
  if (cached) return cached;

  const { data } = await getSupabaseClient()
    .from("medicines")
    .select("*")
    .eq("project_id", projectId)
    .eq("in_stock", true);

  const result = (data || []) as Medicine[];
  setCache(cacheKey, result);
  return result;
}

export async function getFAQs(projectId: string): Promise<FAQ[]> {
  const cacheKey = `${projectId}:faqs`;
  const cached = getCached<FAQ[]>(cacheKey);
  if (cached) return cached;

  const { data } = await getSupabaseClient()
    .from("faqs")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true);

  const result = (data || []) as FAQ[];
  setCache(cacheKey, result);
  return result;
}

/**
 * Format doctors as a compact table for AI context
 */
export function formatDoctorsTable(doctors: Doctor[]): string {
  if (doctors.length === 0) return "No doctors available.";

  const header = "ID | Name | Specialization | Clinic | Fee | Rating | Available Days | Time";
  const rows = doctors.map(
    (d) =>
      `${d.id} | ${d.name} | ${d.specialization} | ${d.clinic_name} | ₹${d.consultation_fee} | ${d.rating}★ | ${d.available_days} | ${d.available_time_start}-${d.available_time_end}`,
  );
  return [header, "-".repeat(80), ...rows].join("\n");
}

/**
 * Format medicines as a compact table for AI context
 */
export function formatMedicinesTable(medicines: Medicine[]): string {
  if (medicines.length === 0) return "No medicines available.";

  const header = "ID | Name | Generic | Category | Form | Strength | Price | Rx Required";
  const rows = medicines.map(
    (m) =>
      `${m.id} | ${m.name} | ${m.generic_name || "-"} | ${m.category} | ${m.dosage_form} | ${
        m.strength || "-"
      } | ₹${m.price} | ${m.requires_prescription ? "Yes" : "No"}`,
  );
  return [header, "-".repeat(80), ...rows].join("\n");
}

/**
 * Format FAQs for AI context
 */
export function formatFAQsForPrompt(faqs: FAQ[]): string {
  if (faqs.length === 0) return "No FAQ data available.";
  return faqs
    .map((f) => `[${f.category}] Q: ${f.question}\nA: ${f.answer}`)
    .join("\n\n");
}
