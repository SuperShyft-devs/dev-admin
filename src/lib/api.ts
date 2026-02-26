import axios, { type AxiosError } from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error_code?: string; message?: string }>) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export interface ApiError {
  error_code?: string;
  message?: string;
}

export function getApiError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.data) {
    const d = err.response.data as { message?: string };
    return d.message || "Request failed";
  }
  return err instanceof Error ? err.message : "Unknown error";
}

// Auth
export interface AuthTokens {
  user_id: number;
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
  };
}

export const authApi = {
  sendOtp: (phone: string) =>
    api.post<{ data: { session_id: number } }>("/auth/send-otp", { phone }),
  verifyOtp: (phone: string, otp: string) =>
    api.post<{ data: AuthTokens }>("/auth/verify-otp", { phone, otp }),
  refreshToken: (refreshToken: string) =>
    api.post<{ data: { tokens: AuthTokens["tokens"] } }>("/auth/refresh-token", {
      refresh_token: refreshToken,
    }),
  logout: (refreshToken: string) =>
    api.post("/auth/logout", { refresh_token: refreshToken }),
};

// Organizations
export interface Organization {
  organization_id: number;
  name?: string | null;
  organization_type?: string | null;
  logo?: string | null;
  website_url?: string | null;
  address?: string | null;
  pin_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_designation?: string | null;
  bd_employee_id?: number | null;
  status?: string | null;
  created_at?: string | null;
  created_employee_id?: number | null;
  updated_at?: string | null;
  updated_employee_id?: number | null;
}

export interface OrganizationListItem {
  organization_id: number;
  name?: string | null;
  organization_type?: string | null;
  logo?: string | null;
  website_url?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  status?: string | null;
}

export interface OrganizationCreate {
  name: string;
  organization_type?: string | null;
  logo?: string | null;
  website_url?: string | null;
  address?: string | null;
  pin_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_designation?: string | null;
  bd_employee_id?: number | null;
}

export const organizationsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    organization_type?: string;
    bd_employee_id?: number;
  }) =>
    api.get<{ data: OrganizationListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/organizations",
      { params }
    ),
  get: (id: number) =>
    api.get<{ data: Organization }>(`/organizations/${id}`),
  create: (payload: OrganizationCreate) =>
    api.post<{ data: { organization_id: number } }>("/organizations", payload),
  update: (id: number, payload: OrganizationCreate) =>
    api.put<{ data: { organization_id: number } }>(`/organizations/${id}`, payload),
  updateStatus: (id: number, status: string) =>
    api.patch<{ data: { organization_id: number; status: string } }>(
      `/organizations/${id}/status`,
      { status }
    ),
};

// Engagements
export interface Engagement {
  engagement_id: number;
  engagement_name?: string | null;
  metsights_engagement_id?: string | null;
  organization_id?: number | null;
  engagement_code?: string | null;
  engagement_type?: string | null;
  assessment_package_id?: number | null;
  diagnostic_package_id?: number | null;
  city?: string | null;
  slot_duration?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  participant_count?: number | null;
}

export interface EngagementListItem {
  engagement_id: number;
  engagement_name?: string | null;
  organization_id?: number | null;
  engagement_code?: string | null;
  engagement_type?: string | null;
  assessment_package_id?: number | null;
  diagnostic_package_id?: number | null;
  city?: string | null;
  slot_duration?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  participant_count?: number | null;
}

export interface EngagementCreate {
  engagement_name?: string | null;
  organization_id: number;
  engagement_type: string;
  engagement_code?: string | null;
  assessment_package_id: number;
  diagnostic_package_id?: number | null;
  city?: string | null;
  slot_duration: number;
  start_date: string;
  end_date: string;
}

export const engagementsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    org_id?: number;
    status?: string;
    city?: string;
    date?: string;
  }) =>
    api.get<{ data: EngagementListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/engagements",
      { params }
    ),
  get: (id: number) =>
    api.get<{ data: Engagement }>(`/engagements/${id}`),
  create: (payload: EngagementCreate) =>
    api.post<{ data: { engagement_id: number } }>("/engagements", payload),
  update: (id: number, payload: Omit<EngagementCreate, "engagement_code"> & { metsights_engagement_id?: string | null }) =>
    api.put<{ data: { engagement_id: number } }>(`/engagements/${id}`, payload),
  updateStatus: (id: number, status: string) =>
    api.patch<{ data: { engagement_id: number; status: string } }>(
      `/engagements/${id}/status`,
      { status }
    ),
};

// Assessment packages (for engagement form dropdown)
export interface AssessmentPackage {
  package_id: number;
  package_code?: string | null;
  display_name?: string | null;
  status?: string | null;
}

export const assessmentPackagesApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<{ data: AssessmentPackage[]; meta: { page: number; limit: number; total: number } }>(
      "/assessment-packages",
      { params: { ...params, limit: params?.limit ?? 100 } }
    ),
};
