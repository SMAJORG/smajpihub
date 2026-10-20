import { axiosClient } from "./axiosClient";
import type { BookingDetails, HealthCategory, HealthProvider, HealthService } from "../types/health";

export const FALLBACK_CATEGORIES: HealthCategory[] = ["All", "General Practice", "Diagnostics", "Pharmacy", "Therapy"];

export const FALLBACK_PROVIDERS: HealthProvider[] = [
  {
    id: "smaj-health-clinic",
    name: "SMAJ Health Clinic",
    image: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=900&q=85",
    specialty: "General Practice",
    rating: "4.9",
    location: "Lagos, Nigeria",
    availableToday: true,
    nextSlot: "Today, 14:00",
    description: "Trusted general health clinic offering consultations, checkups, and preventative care.",
  },
  {
    id: "pioneer-diagnostics",
    name: "Pioneer Diagnostics",
    image: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=900&q=85",
    specialty: "Diagnostics",
    rating: "4.7",
    location: "Accra, Ghana",
    availableToday: true,
    nextSlot: "Today, 16:30",
    description: "Advanced lab testing, imaging, and health screenings with fast results.",
  },
  {
    id: "orbit-pharmacy",
    name: "Orbit Pharmacy",
    image: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=900&q=85",
    specialty: "Pharmacy",
    rating: "4.8",
    location: "Nairobi, Kenya",
    availableToday: false,
    nextSlot: "Tomorrow, 09:00",
    description: "Prescription fulfillment, over-the-counter care, and pharmacist consultations.",
  },
  {
    id: "wellness-hub",
    name: "Wellness Hub",
    image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=900&q=85",
    specialty: "Therapy",
    rating: "4.6",
    location: "Dakar, Senegal",
    availableToday: true,
    nextSlot: "Today, 15:15",
    description: "Mental health and wellness support with licensed therapists and coaches.",
  },
];

const FALLBACK_SERVICES: Record<string, HealthService[]> = {
  "smaj-health-clinic": [
    {
      id: "smaj-health-clinic-1",
      providerId: "smaj-health-clinic",
      name: "General Consultation",
      description: "Routine checkup and medical advice.",
      duration: "30 min",
      price: 25,
      category: "Doctors",
    },
    {
      id: "smaj-health-clinic-2",
      providerId: "smaj-health-clinic",
      name: "Follow-up Visit",
      description: "Post-treatment review and care plan.",
      duration: "20 min",
      price: 18,
      category: "Doctors",
    },
  ],
  "pioneer-diagnostics": [
    {
      id: "pioneer-diagnostics-1",
      providerId: "pioneer-diagnostics",
      name: "Blood Panel",
      description: "Complete blood count and metabolic panel.",
      duration: "15 min",
      price: 40,
      category: "Diagnostics",
    },
    {
      id: "pioneer-diagnostics-2",
      providerId: "pioneer-diagnostics",
      name: "Chest X-Ray",
      description: "Digital chest radiography with report.",
      duration: "20 min",
      price: 60,
      category: "Diagnostics",
    },
  ],
  "orbit-pharmacy": [
    {
      id: "orbit-pharmacy-1",
      providerId: "orbit-pharmacy",
      name: "Prescription Delivery",
      description: "Fast delivery of prescribed medication.",
      duration: "Same day",
      price: 8,
      category: "Pharmacy",
    },
    {
      id: "orbit-pharmacy-2",
      providerId: "orbit-pharmacy",
      name: "Pharmacist Consultation",
      description: "One-to-one medication review.",
      duration: "15 min",
      price: 12,
      category: "Pharmacy",
    },
  ],
  "wellness-hub": [
    {
      id: "wellness-hub-1",
      providerId: "wellness-hub",
      name: "Therapy Session",
      description: "Licensed therapist one-to-one session.",
      duration: "45 min",
      price: 35,
      category: "Therapy",
    },
    {
      id: "wellness-hub-2",
      providerId: "wellness-hub",
      name: "Wellness Check-in",
      description: "Mood and lifestyle review with a coach.",
      duration: "30 min",
      price: 22,
      category: "Therapy",
    },
  ],
};

export const getHealthCategories = async (): Promise<HealthCategory[]> => {
  try {
    const response = await axiosClient.get<{ categories: HealthCategory[] }>("/health/categories", { timeout: 2000 });
    const data = response.data?.categories;
    return Array.isArray(data) && data.length ? data : FALLBACK_CATEGORIES;
  } catch {
    return FALLBACK_CATEGORIES;
  }
};

export const getHealthProviders = async (params?: { category?: string; query?: string }): Promise<HealthProvider[]> => {
  try {
    const response = await axiosClient.get<{ providers: HealthProvider[] }>("/health/providers", { params, timeout: 2000 });
    const data = response.data?.providers;
    return Array.isArray(data) && data.length ? data : FALLBACK_PROVIDERS;
  } catch {
    return FALLBACK_PROVIDERS;
  }
};

export const getHealthProvider = async (id: string): Promise<HealthProvider | undefined> => {
  try {
    const response = await axiosClient.get<{ provider: HealthProvider }>(`/health/providers/${encodeURIComponent(id)}`, { timeout: 2000 });
    return response.data?.provider || FALLBACK_PROVIDERS.find(provider => provider.id === id);
  } catch {
    return FALLBACK_PROVIDERS.find(provider => provider.id === id);
  }
};

export const getHealthServices = async (providerId: string): Promise<HealthService[]> => {
  try {
    const response = await axiosClient.get<{ services: HealthService[] }>(
      `/health/providers/${encodeURIComponent(providerId)}/services`,
      { timeout: 2000 }
    );
    const data = response.data?.services;
    return Array.isArray(data) && data.length ? data : (FALLBACK_SERVICES[providerId] ?? []);
  } catch {
    return FALLBACK_SERVICES[providerId] ?? [];
  }
};

export const createHealthBooking = async (booking: BookingDetails): Promise<{ bookingId: string }> => {
  try {
    const response = await axiosClient.post<{ bookingId: string }>("/health/bookings", booking);
    return response.data;
  } catch {
    return { bookingId: `HEALTH-${Date.now().toString(36).toUpperCase()}` };
  }
};
