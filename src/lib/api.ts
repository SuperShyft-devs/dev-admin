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

// Users
export interface UserProfile {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
}

export interface UserListItem {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  is_participant?: boolean | null;
  status?: string | null;
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

// Full user detail (employee view)
export interface UserDetail {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  pin_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  referred_by?: string | null;
  is_participant?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UserCreate {
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  pin_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  referred_by?: string | null;
  is_participant?: boolean | null;
  status?: string | null;
}

export interface UserUpdate extends UserCreate {
  // phone is required for update too
}

export const usersApi = {
  me: () => api.get<{ data: UserProfile }>("/users/me"),
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    is_participant?: boolean;
    phone?: string;
    email?: string;
  }) =>
    api.get<{ data: UserListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/users",
      { params: { ...params, limit: params?.limit ?? 100 } }
    ),
  get: (id: number) =>
    api.get<{ data: UserDetail }>(`/users/${id}`),
  create: (payload: UserCreate) =>
    api.post<{ data: { user_id: number } }>("/users", payload),
  update: (id: number, payload: UserUpdate) =>
    api.put<{ data: { user_id: number; status: string } }>(`/users/${id}`, payload),
  deactivate: (id: number) =>
    api.patch<{ data: { user_id: number; status: string } }>(`/users/${id}/deactivate`),
};

// Employees
export interface EmployeeListItem {
  employee_id: number;
  user_id: number;
  role?: string | null;
  status?: string | null;
}

export interface EmployeeCreate {
  user_id: number;
  role: string;
  status?: string | null;
}

export interface EmployeeUpdate {
  user_id: number;
  role: string;
}

export const employeesApi = {
  list: (params?: { page?: number; limit?: number; status?: string; role?: string }) =>
    api.get<{ data: EmployeeListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/employees",
      { params: { ...params, limit: params?.limit ?? 100 } }
    ),
  get: (id: number) =>
    api.get<{ data: EmployeeListItem }>(`/employees/${id}`),
  create: (payload: EmployeeCreate) =>
    api.post<{ data: { employee_id: number } }>("/employees", payload),
  update: (id: number, payload: EmployeeUpdate) =>
    api.put<{ data: { employee_id: number } }>(`/employees/${id}`, payload),
  updateStatus: (id: number, status: string) =>
    api.patch<{ data: { employee_id: number; status: string } }>(
      `/employees/${id}/status`,
      { status }
    ),
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

// Assessment packages
export interface AssessmentPackage {
  package_id: number;
  package_code?: string | null;
  display_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AssessmentPackageCreate {
  package_code: string;
  display_name: string;
  status?: string;
}

export interface AssessmentPackageUpdate {
  package_code?: string;
  display_name?: string;
}

export interface PackageQuestion {
  question_id: number;
  question_text?: string | null;
  question_type?: string | null;
  status?: string | null;
}

export const assessmentPackagesApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<{ data: AssessmentPackage[]; meta: { page: number; limit: number; total: number } }>(
      "/assessment-packages",
      { params: { ...params, limit: params?.limit ?? 100 } }
    ),
  get: (id: number) =>
    api.get<{ data: AssessmentPackage }>(`/assessment-packages/${id}`),
  create: (payload: AssessmentPackageCreate) =>
    api.post<{ data: { package_id: number } }>("/assessment-packages", payload),
  update: (id: number, payload: AssessmentPackageUpdate) =>
    api.put<{ data: { package_id: number } }>(`/assessment-packages/${id}`, payload),
  updateStatus: (id: number, status: string) =>
    api.patch<{ data: { package_id: number; status: string } }>(`/assessment-packages/${id}/status`, { status }),
  listQuestions: (packageId: number) =>
    api.get<{ data: PackageQuestion[] }>(`/assessment-packages/${packageId}/questions`),
  addQuestions: (packageId: number, question_ids: number[]) =>
    api.post(`/assessment-packages/${packageId}/questions`, { question_ids }),
  removeQuestion: (packageId: number, questionId: number) =>
    api.delete(`/assessment-packages/${packageId}/questions/${questionId}`),
};

// Questionnaire questions
export interface QuestionnaireQuestion {
  question_id: number;
  question_text?: string | null;
  question_type?: string | null;
  options?: string[] | null;
  status?: string | null;
  created_at?: string | null;
}

export interface QuestionnaireQuestionCreate {
  question_text: string;
  question_type: string;
  options?: string[] | null;
  status?: string;
}

export interface QuestionnaireQuestionUpdate {
  question_text: string;
  question_type: string;
  options?: string[] | null;
}

// Participants
export interface Participant {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
  engagement_name?: string | null;
  engagement_code?: string | null;
  engagement_type?: string | null;
  city?: string | null;
}

export const participantsApi = {
  // B2B: participants for a specific engagement by code
  byEngagementCode: (code: string) =>
    api.get<{ data: Participant[]; meta?: { total: number } }>(
      `/engagements/code/${encodeURIComponent(code)}/participants`
    ),
  // B2C: participants for public/open engagements
  public: () =>
    api.get<{ data: Participant[]; meta?: { total: number } }>(
      "/engagements/public/participants"
    ),
  // All participants across all engagements for an org
  byOrganization: (orgId: number) =>
    api.get<{ data: Participant[]; meta?: { total: number } }>(
      `/organizations/${orgId}/participants`
    ),
};

// Onboarding Assistants
export interface OnboardingAssistant {
  employee_id: number;
  user_id: number;
  role?: string | null;
  status?: string | null;
}

// Occupied Slots
export interface OccupiedSlots {
  occupied_slots: Record<string, string[]>;
}

export const occupiedSlotsApi = {
  // B2B: occupied slots for a specific engagement by code (public, no auth)
  byEngagementCode: (code: string) =>
    api.get<{ data: OccupiedSlots }>(
      `/engagements/code/${encodeURIComponent(code)}/occupied-slots`
    ),
  // B2C: occupied slots for all active public engagements (public, no auth)
  public: () =>
    api.get<{ data: OccupiedSlots }>("/engagements/public/occupied-slots"),
};

export const onboardingAssistantsApi = {
  list: (engagementId: number) =>
    api.get<{ data: OnboardingAssistant[] }>(
      `/engagements/${engagementId}/onboarding-assistants`
    ),
  assign: (engagementId: number, employee_ids: number[]) =>
    api.post<{ data: { engagement_id: number; added_employee_ids: number[]; skipped_employee_ids: number[] } }>(
      `/engagements/${engagementId}/onboarding-assistants`,
      { employee_ids }
    ),
  remove: (engagementId: number, employeeId: number) =>
    api.delete(`/engagements/${engagementId}/onboarding-assistants/${employeeId}`),
};

export const questionnaireQuestionsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; question_type?: string }) =>
    api.get<{ data: QuestionnaireQuestion[]; meta: { page: number; limit: number; total: number } }>(
      "/questionnaire/questions",
      { params: { ...params, limit: params?.limit ?? 100 } }
    ),
  get: (id: number) =>
    api.get<{ data: QuestionnaireQuestion }>(`/questionnaire/questions/${id}`),
  create: (payload: QuestionnaireQuestionCreate) =>
    api.post<{ data: { question_id: number } }>("/questionnaire/questions", payload),
  update: (id: number, payload: QuestionnaireQuestionUpdate) =>
    api.put<{ data: { question_id: number } }>(`/questionnaire/questions/${id}`, payload),
  updateStatus: (id: number, status: string) =>
    api.patch<{ data: { question_id: number; status: string } }>(
      `/questionnaire/questions/${id}/status`,
      { status }
    ),
};
