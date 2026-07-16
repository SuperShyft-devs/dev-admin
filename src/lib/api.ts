import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { authStorage, loginPathWithRedirect } from "./authStorage";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 120_000,
});

const authHttp = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token as string);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Default instance Content-Type is application/json; that breaks multipart uploads (FastAPI sees no file).
  if (config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError<{ error_code?: string; message?: string }>) => {
    const originalRequest = err.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (err.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = authStorage.getRefreshToken();
      if (refreshToken) {
        try {
          const res = await authHttp.post<{ data: { tokens: { access_token: string; refresh_token: string } } }>(
            "/auth/refresh-token",
            { refresh_token: refreshToken }
          );

          const newTokens = res.data.data.tokens;
          authStorage.setTokens(newTokens.access_token, newTokens.refresh_token);

          api.defaults.headers.common["Authorization"] = `Bearer ${newTokens.access_token}`;
          originalRequest.headers.Authorization = `Bearer ${newTokens.access_token}`;

          processQueue(null, newTokens.access_token);
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          authStorage.clearTokens();
          window.location.href = loginPathWithRedirect(
            window.location.pathname,
            window.location.search
          );
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        authStorage.clearTokens();
        window.location.href = loginPathWithRedirect(
          window.location.pathname,
          window.location.search
        );
        return Promise.reject(err);
      }
    }

    if (err.response?.status === 401) {
      authStorage.clearTokens();
      window.location.href = loginPathWithRedirect(
        window.location.pathname,
        window.location.search
      );
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
  age?: number;
  phone: string;
  email?: string | null;
  profile_photo?: string | null;
  employee?: {
    employee_id: number;
    role: "admin" | "onboarding_assistant" | "organization_manager" | "expert";
  } | null;
}

export interface UserListItem {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  age?: number;
  phone?: string | null;
  email?: string | null;
  profile_photo?: string | null;
  is_participant?: boolean | null;
  metsights_profile_id?: string | null;
  status?: string | null;
}

export function getApiError(err: unknown, context?: "auth" | "import"): string {
  return getApiErrorDetails(err, context).message;
}

export function getApiErrorDetails(
  err: unknown,
  context?: "auth" | "import"
): { code?: string; message: string; status?: number } {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (err.code === "ECONNABORTED") {
      if (context === "auth") {
        return {
          status,
          message:
            "Request timed out — check that the API is running and reachable, then try again.",
        };
      }
      return {
        status,
        message:
          "Request timed out — the server may still be processing. Wait, refresh stats, then retry this page.",
      };
    }
    if (status === 429) {
      return { status, message: "Too many requests — wait a minute, then retry." };
    }
    if (err.response?.data) {
      const d = err.response.data as { message?: string; error_code?: string };
      return { status, code: d.error_code, message: d.message || "Request failed" };
    }
    if (err.message === "Network Error" || err.code === "ERR_NETWORK") {
      if (context === "auth") {
        return {
          status,
          message:
            "Cannot reach the API. Check that it is up, CORS allows this admin origin " +
            `(API: ${API_BASE}), and try ${API_BASE.replace(/\/$/, "")}/health in your browser.`,
        };
      }
      if (context === "import") {
        return {
          status,
          message:
            "Network error — connection dropped or timed out. Large imports can take up to 2 minutes; wait and retry.",
        };
      }
      return {
        status,
        message:
          "Network error — could not reach the API. Check your connection and API status, then retry.",
      };
    }
  }
  return {
    message: err instanceof Error ? err.message : "Unknown error",
  };
}

// Support tickets
export type SupportTicketStatus = "open" | "resolved" | "closed";

export interface SupportTicket {
  ticket_id: number;
  user_id: number | null;
  contact_input: string;
  query_text: string;
  status: SupportTicketStatus;
  created_at: string;
}

export interface SupportTicketCreate {
  contact_input: string;
  query_text: string;
}

export const supportApi = {
  submitTicket: (payload: SupportTicketCreate) =>
    api.post<{ data: SupportTicket; meta: Record<string, unknown> }>("/support/tickets", payload),
  listTickets: (params?: { status?: SupportTicketStatus }) =>
    api.get<{ data: SupportTicket[]; meta: Record<string, unknown> }>("/support/tickets", { params }),
  getTicket: (ticketId: number) =>
    api.get<{ data: SupportTicket; meta: Record<string, unknown> }>(`/support/tickets/${ticketId}`),
  updateTicketStatus: (ticketId: number, status: SupportTicketStatus) =>
    api.patch<{ data: { ticket_id: number; status: SupportTicketStatus }; meta: Record<string, unknown> }>(
      `/support/tickets/${ticketId}/status`,
      { status }
    ),
};

// Platform settings (employee)
export interface B2cOnboardingDefaults {
  b2c_default_assessment_package_id: number;
  b2c_default_diagnostic_package_id: number;
}

export interface EngagementNotificationDefaults {
  default_onboarding_notification?: string | null;
  default_pretest_guidelines_notification?: string | null;
  default_questionnaire_reminder_1?: string | null;
  default_questionnaire_reminder_2?: string | null;
  default_blood_report_notification?: string | null;
  default_bioai_report_notification?: string | null;
}

export interface SupportQueryNotification {
  default_support_query_notification?: string | null;
}

export interface DefaultOnboardingAssistantItem {
  employee_id: number;
  user_id: number;
  role: string;
  status: string;
  first_name?: string | null;
  last_name?: string | null;
}

export interface DefaultOnboardingAssistants {
  employee_ids: number[];
  assistants: DefaultOnboardingAssistantItem[];
}

export interface MetsightsProfilesStats {
  local_total_users: number;
  local_with_metsights_profile_id: number;
  local_without_metsights_profile_id: number;
  metsights_total: number;
  estimated_not_imported: number;
}

export interface MetsightsProfilesImportPageResult {
  page: number;
  page_size: number;
  metsights_total: number;
  metsights_next: string | null;
  metsights_previous: string | null;
  created: number;
  linked: number;
  skipped: number;
  failed: number;
  failures: { metsights_profile_id: string; reason: string }[];
  skipped_items: { metsights_profile_id: string; reason: string }[];
}

export const platformSettingsApi = {
  getB2cOnboarding: () =>
    api.get<{ data: B2cOnboardingDefaults; meta: Record<string, unknown> }>("/platform-settings/b2c-onboarding"),
  patchB2cOnboarding: (payload: B2cOnboardingDefaults) =>
    api.patch<{ data: B2cOnboardingDefaults; meta: Record<string, unknown> }>(
      "/platform-settings/b2c-onboarding",
      payload
    ),
  getEngagementNotificationDefaults: () =>
    api.get<{ data: EngagementNotificationDefaults; meta: Record<string, unknown> }>(
      "/platform-settings/engagement-notification-defaults"
    ),
  patchEngagementNotificationDefaults: (payload: EngagementNotificationDefaults) =>
    api.patch<{ data: EngagementNotificationDefaults; meta: Record<string, unknown> }>(
      "/platform-settings/engagement-notification-defaults",
      payload
    ),
  getDefaultOnboardingAssistants: () =>
    api.get<{ data: DefaultOnboardingAssistants; meta: Record<string, unknown> }>(
      "/platform-settings/default-onboarding-assistants"
    ),
  patchDefaultOnboardingAssistants: (payload: { employee_ids: number[] }) =>
    api.patch<{ data: DefaultOnboardingAssistants; meta: Record<string, unknown> }>(
      "/platform-settings/default-onboarding-assistants",
      payload
    ),
  getSupportQueryNotification: () =>
    api.get<{ data: SupportQueryNotification; meta: Record<string, unknown> }>(
      "/platform-settings/support-query-notification"
    ),
  patchSupportQueryNotification: (payload: SupportQueryNotification) =>
    api.patch<{ data: SupportQueryNotification; meta: Record<string, unknown> }>(
      "/platform-settings/support-query-notification",
      payload
    ),
  getMetsightsProfileStats: () =>
    api.get<{ data: MetsightsProfilesStats; meta: Record<string, unknown> }>(
      "/platform-settings/metsights-profiles/stats"
    ),
  importMetsightsProfilesPage: (payload: { page: number }) =>
    api.post<{ data: MetsightsProfilesImportPageResult; meta: Record<string, unknown> }>(
      "/platform-settings/metsights-profiles/import-page",
      payload,
      { timeout: 120_000 }
    ),
};

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
    authHttp.post<{ data: { session_id: number } }>("/auth/send-otp", { phone }),
  verifyOtp: (phone: string, otp: string) =>
    authHttp.post<{ data: AuthTokens }>("/auth/verify-otp", { phone, otp }),
  refreshToken: (refreshToken: string) =>
    authHttp.post<{ data: { tokens: AuthTokens["tokens"] } }>("/auth/refresh-token", {
      refresh_token: refreshToken,
    }),
  logout: (refreshToken: string) =>
    authHttp.post("/auth/logout", { refresh_token: refreshToken }),
};

// Full user detail (employee view)
export interface UserDetail {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  age?: number;
  phone: string;
  email?: string | null;
  profile_photo?: string | null;
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
  metsights_profile_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UserCreate {
  age: number;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  profile_photo?: string | null;
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

export type UserUpdate = UserCreate;

export interface UserParticipantStats {
  with_metsights_profile: number;
  total_participants: number;
}

export interface DuplicateUserGroupApi {
  key: string;
  users: Pick<UserListItem, "user_id" | "first_name" | "last_name" | "phone" | "email" | "status">[];
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
    search?: string;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) =>
    api.get<{ data: UserListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/users",
      { params }
    ),
  stats: () =>
    api.get<{ data: UserParticipantStats }>("/users/stats"),
  duplicates: () =>
    api.get<{ data: DuplicateUserGroupApi[] }>("/users/duplicates"),
  get: (id: number) =>
    api.get<{ data: UserDetail }>(`/users/${id}`),
  create: (payload: UserCreate) =>
    api.post<{ data: { user_id: number } }>("/users", payload),
  update: (id: number, payload: UserUpdate) =>
    api.put<{ data: { user_id: number; status: string } }>(`/users/${id}`, payload),
  updateMetsightsProfileId: (id: number, metsights_profile_id: string) =>
    api.put<{ data: { user_id: number; metsights_profile_id: string | null } }>(
      `/users/${id}/metsights-profile-id`,
      { metsights_profile_id }
    ),
  deactivate: (id: number) =>
    api.patch<{ data: { user_id: number; status: string } }>(`/users/${id}/deactivate`),
  deleteImpact: (id: number) =>
    api.get<{
      data: {
        engagements_to_orphan: {
          engagement_id: number;
          engagement_code: string;
          engagement_name?: string | null;
        }[];
      };
    }>(`/users/${id}/delete-impact`),
  delete: (id: number, params?: { delete_orphan_engagements?: boolean }) =>
    api.delete<{ data: { deleted_user_id: number; deleted_user_count: number } }>(
      `/users/${id}`,
      { params }
    ),
};

// Participant journey (employee: per-user assessments + questionnaire)
export interface ParticipantJourneyCategoryProgress {
  category_id: number;
  display_name?: string | null;
  category_key?: string | null;
  status: string;
  completed_at?: string | null;
}

export interface ParticipantJourneyQuestionnaireRollup {
  response_count: number;
  draft_count: number;
  submitted_count: number;
  categories_touched: number;
}

export interface ParticipantJourneyInstanceSummary {
  assessment_instance_id: number;
  status?: string | null;
  assigned_at?: string | null;
  completed_at?: string | null;
  metsights_record_id?: string | null;
  package_id: number;
  package_code?: string | null;
  package_display_name?: string | null;
  assessment_type_code?: string | null;
  engagement_id: number;
  engagement_name?: string | null;
  engagement_code?: string | null;
  has_blood_report_url?: boolean;
  has_bio_ai_report_url?: boolean;
  bio_ai_report_available?: boolean;
  has_fitprint_report_url?: boolean;
  category_progress: ParticipantJourneyCategoryProgress[];
  questionnaire: ParticipantJourneyQuestionnaireRollup;
}

export interface ParticipantJourneySummaryData {
  instances: ParticipantJourneyInstanceSummary[];
}

export type ParticipantJourneyAnswerState = "empty" | "draft" | "submitted";

export interface ParticipantJourneyQuestionRow {
  question_id: number;
  question_text?: string | null;
  question_type?: string | null;
  question_key?: string | null;
  answer: unknown;
  submitted_at?: string | null;
  answer_state: ParticipantJourneyAnswerState;
  options?: unknown;
  help_text?: string | null;
  is_required?: boolean;
  is_read_only?: boolean;
}

export interface ParticipantJourneyCategoryBlock {
  category_id: number;
  display_name?: string | null;
  category_key?: string | null;
  questions: ParticipantJourneyQuestionRow[];
}

export interface ParticipantJourneyDetail {
  assessment_instance_id: number;
  user_id: number;
  status?: string | null;
  assigned_at?: string | null;
  completed_at?: string | null;
  package: {
    package_id: number;
    package_code?: string | null;
    package_display_name?: string | null;
  };
  engagement: {
    engagement_id: number;
    engagement_name?: string | null;
    engagement_code?: string | null;
  };
  category_progress: ParticipantJourneyCategoryProgress[];
  categories: ParticipantJourneyCategoryBlock[];
}

export const participantJourneyApi = {
  summary: (userId: number, params?: { page?: number; limit?: number }) =>
    api.get<{ data: ParticipantJourneySummaryData; meta: { page: number; limit: number; total: number } }>(
      `/users/${userId}/participant-journey`,
      { params }
    ),
  detail: (userId: number, assessmentInstanceId: number) =>
    api.get<{ data: ParticipantJourneyDetail }>(
      `/users/${userId}/participant-journey/${assessmentInstanceId}`
    ),
};

export interface MetsightsImportAnswersResult {
  assessment_instance_id: number;
  metsights_record_id: string;
  responses_upserted: number;
  skipped_categories: string[];
  skipped_questions: string[];
}

export interface MetsightsCategoryImportRequest {
  category: string;
  category_of?: string;
  reload?: number;
}

export interface MetsightsCategoryImportResult {
  assessment_instance_id: number;
  category: string;
  metsights_record_id?: string;
  responses_imported?: number;
  skipped?: string[];
  status?: string;
  reason?: string;
}

export interface DraftBloodParametersResult {
  assessment_instance_id: number;
  package_code: string;
  responses_drafted: number;
  categories: {
    category: string;
    responses_drafted: number;
    skipped: string[];
  }[];
}

export const assessmentsApi = {
  importMetsightsCategoryAnswers: (
    assessmentInstanceId: number,
    payload: MetsightsCategoryImportRequest
  ) =>
    api.post<{ data: MetsightsCategoryImportResult }>(
      `/assessments/${assessmentInstanceId}/metsights/import-answers`,
      {
        category_of: "metsights",
        reload: 0,
        ...payload,
      },
      { timeout: 120_000 }
    ),
  importMetsightsAnswersLegacy: (assessmentInstanceId: number) =>
    api.post<{ data: MetsightsImportAnswersResult }>(
      `/assessments/${assessmentInstanceId}/metsights/import-answers-legacy`,
      undefined,
      { timeout: 120_000 }
    ),
  draftBloodParameters: (assessmentInstanceId: number) =>
    api.post<{ data: DraftBloodParametersResult }>(
      `/assessments/${assessmentInstanceId}/metsights/draft-blood-parameters`,
      undefined,
      { timeout: 120_000 }
    ),
  updateStatus: (assessmentInstanceId: number, status: "active" | "completed") =>
    api.patch<{
      data: { assessment_instance_id: number; status: string; completed_at: string | null };
    }>(`/assessments/${assessmentInstanceId}/status`, { status }),
};

// Uploads
export const uploadsApi = {
  uploadUserProfilePhoto: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ data: { url: string } }>("/uploads/users/profile-photo", formData);
  },
  uploadOrganizationLogo: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ data: { url: string } }>("/uploads/organizations/logo", formData);
  },
  uploadExpertProfilePhoto: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ data: { url: string } }>("/uploads/experts/profile-photo", formData);
  },
  uploadPackageImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ data: { url: string } }>("/uploads/packages/image", formData);
  },
};

// Employees
export type EmployeeRoleValue =
  | "admin"
  | "onboarding_assistant"
  | "organization_manager"
  | "expert";

export interface EmployeeListItem {
  employee_id: number;
  user_id: number;
  role?: EmployeeRoleValue | string | null;
  status?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface EmployeeCreate {
  user_id: number;
  role: EmployeeRoleValue | string;
  status?: string | null;
}

export interface EmployeeUpdate {
  user_id: number;
  role: EmployeeRoleValue | string;
}

export const employeesApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    role?: string;
    search?: string;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) =>
    api.get<{ data: EmployeeListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/employees",
      { params }
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
export interface OrganizationDepartment {
  department: string;
  slug: string;
}

export interface OrganizationDepartmentInput {
  department: string;
}

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
  industry_key?: string | null;
  industry?: string | null;
  contact_person_user_id?: number | null;
  bd_employee_id?: number | null;
  status?: string | null;
  created_at?: string | null;
  created_employee_id?: number | null;
  updated_at?: string | null;
  updated_employee_id?: number | null;
  departments?: OrganizationDepartment[] | null;
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
  industry_key?: string | null;
  industry?: string | null;
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
  industry_key?: string | null;
  contact_person_user_id?: number | null;
  bd_employee_id?: number | null;
  departments?: OrganizationDepartmentInput[] | null;
}

export interface Industry {
  id: number;
  industry_key: string;
  industry: string;
}

export const industriesApi = {
  getAll: () => api.get<{ data: Industry[] }>("/organizations/industries"),
  create: (data: { industry: string }) => api.post<{ data: Industry }>("/organizations/industries", data),
  update: (id: number, data: { industry: string }) =>
    api.put<{ data: Industry }>(`/organizations/industries/${id}`, data),
  delete: (id: number) => api.delete<{ data: { success: boolean } }>(`/organizations/industries/${id}`),
};

export const organizationsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    organization_type?: string;
    bd_employee_id?: number;
    search?: string;
    city?: string;
    country?: string;
    industry_key?: string;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) =>
    api.get<{ data: OrganizationListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/organizations",
      { params }
    ),
  filterOptions: () =>
    api.get<{ data: { cities: string[]; countries: string[]; industries: { industry_key: string; industry: string }[] } }>("/organizations/filter-options"),
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
  listCamps: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) =>
    api.get<{ data: CampListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/organizations/camps",
      { params }
    ),
  listCampsByOrganization: (
    organizationId: number,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      sort_by?: string;
      sort_dir?: "asc" | "desc";
    }
  ) =>
    api.get<{ data: CampListItem[]; meta: { page: number; limit: number; total: number } }>(
      `/organizations/${organizationId}/camps`,
      { params }
    ),
};

export interface CampListItem {
  camp_no: number;
  camp_name: string;
  organization_id: number;
  organization_name: string;
  start_date: string;
  engagement_count: number;
  department_count: number;
  report_count: number;
}

export interface CampReportSection {
  report_sections: number;
  section: string;
  section_key: string;
  description?: string | null;
}

export interface CampReportSectionCreate {
  section: string;
  section_key: string;
  description?: string | null;
}

export interface CampReportSectionUpdate {
  section?: string;
  section_key?: string;
  description?: string | null;
}

export const campReportSectionsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<{ data: CampReportSection[]; meta: { page: number; limit: number; total: number } }>(
      "/reports/camp-sections",
      { params }
    ),
  create: (payload: CampReportSectionCreate) =>
    api.post<{ data: { report_sections: number } }>("/reports/camp-sections", payload),
  update: (id: number, payload: CampReportSectionUpdate) =>
    api.put<{ data: CampReportSection }>(`/reports/camp-sections/${id}`, payload),
  delete: (id: number) =>
    api.delete<{ data: { deleted: boolean } }>(`/reports/camp-sections/${id}`),
};

export const campReportsApi = {
  listByCamp: (campNo: number) =>
    api.get<{ data: CampReportRow[] }>(`/reports/camps/${campNo}`),
  getMeta: (campNo: number) =>
    api.get<{ data: Record<string, unknown> }>(`/reports/camps/${campNo}/meta`),
  getDepartmentMeta: (campNo: number, slug: string) =>
    api.get<{ data: Record<string, unknown> }>(`/reports/camps/${campNo}/department/${slug}/meta`),
  listSections: (campNo: number) =>
    api.get<{ data: string[] }>(`/reports/camps/${campNo}/sections`),
  listDepartmentSections: (campNo: number, slug: string) =>
    api.get<{ data: string[] }>(`/reports/camps/${campNo}/department/${slug}/sections`),
  getDashboard: (campNo: number, section: string) =>
    api.get<{ data: Record<string, unknown> }>(`/reports/camps/${campNo}/dashboard`, {
      params: { section },
    }),
  getDepartmentDashboard: (campNo: number, slug: string, section: string) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/department/${slug}/dashboard`,
      { params: { section } }
    ),
  refreshCamp: (campNo: number, section: string) =>
    api.put<{ data: CampReportRefreshResult }>(`/reports/camps/${campNo}/refresh`, { section }),
  refreshDepartment: (campNo: number, slug: string, section: string) =>
    api.put<{ data: CampReportRefreshResult }>(
      `/reports/camps/${campNo}/department/${slug}/refresh`,
      { section }
    ),
  validateCompanyAverageScores: (campNo: number) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/validate/company-average-scores`
    ),
  validateDepartmentCompanyAverageScores: (campNo: number, slug: string) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/department/${slug}/validate/company-average-scores`
    ),
  validatePositiveWins: (campNo: number) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/validate/positive-wins`
    ),
  validateDepartmentPositiveWins: (campNo: number, slug: string) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/department/${slug}/validate/positive-wins`
    ),
  validatePhysicalActivity: (campNo: number) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/validate/physical-activity-frequency`
    ),
  validateDepartmentPhysicalActivity: (campNo: number, slug: string) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/department/${slug}/validate/physical-activity-frequency`
    ),
  validateSleepingHours: (campNo: number) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/validate/sleeping-hours`
    ),
  validateDepartmentSleepingHours: (campNo: number, slug: string) =>
    api.get<{ data: Record<string, unknown> }>(
      `/reports/camps/${campNo}/department/${slug}/validate/sleeping-hours`
    ),
  initCamp: (campNo: number) =>
    api.post<{ data: { report_id: number } }>(`/reports/camps/${campNo}/init`),
  initDepartment: (campNo: number, slug: string) =>
    api.post<{ data: { report_id: number } }>(`/reports/camps/${campNo}/department/${slug}/init`),
  deleteCamp: (campNo: number) =>
    api.delete<{ data: { deleted: boolean } }>(`/reports/camps/${campNo}`),
  deleteDepartment: (campNo: number, slug: string) =>
    api.delete<{ data: { deleted: boolean } }>(`/reports/camps/${campNo}/department/${slug}`),
};

export interface CampReportRow {
  report_id: number;
  camp_no: number;
  department: string | null;
  organization_id: number;
  report: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CampReportSectionPayload {
  name?: string;
  description?: string | null;
  /** @deprecated use data.total_enrolled */
  total_enrolled?: number;
  data?: {
    total_enrolled?: number;
    age_group?: string[];
    enrolled?: number[];
    percent?: number[];
    employees_enrolled?: number;
    male_enrolled?: number;
    female_enrolled?: number;
    total_blood_test?: number;
    blood_test_percent?: number;
    doctor_consultation?: number;
    nutritionist_consultation?: number;
    doctor_and_nutritionist_consultation?: number;
    high_risk_group?: number;
  };
}

export interface CampReportRefreshResult {
  report_id: number;
  section: CampReportSectionPayload;
}

// Expert Types (dynamic catalog)
export interface ExpertTypeItem {
  id: number;
  type_key: string;
  type: string;
}

export const expertTypesApi = {
  list: () =>
    api.get<{ data: ExpertTypeItem[] }>("/expert-types"),
  create: (payload: { type_key: string; type: string }) =>
    api.post<{ data: ExpertTypeItem }>("/expert-types", payload),
  update: (id: number, payload: { type_key?: string; type?: string }) =>
    api.put<{ data: ExpertTypeItem }>(`/expert-types/${id}`, payload),
  delete: (id: number) =>
    api.delete<{ data: { id: number } }>(`/expert-types/${id}`),
};

// Experts (doctors & nutritionists)
export type ExpertType = string;
export type ConsultationMode = "video" | "voice" | "chat";

export interface ExpertTag {
  tag_id: number;
  expert_id: number;
  tag_name: string;
  display_order?: number | null;
}

export interface ExpertListItem {
  expert_id: number;
  user_id?: number | null;
  expert_type: ExpertType | string;
  specialization: string;
  profile_photo?: string | null;
  rating: number;
  review_count: number;
  patient_count: number;
  experience_years?: number | null;
  qualifications?: string | null;
  about_text?: string | null;
  consultation_modes?: ConsultationMode[] | string[] | null;
  languages?: string[] | null;
  session_duration_mins?: number | null;
  appointment_fee_paise?: number | null;
  original_fee_paise?: number | null;
  effective_from?: string | null;
  effective_until?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ExpertDetail extends ExpertListItem {
  expertise_tags: ExpertTag[];
}

export interface ExpertPayload {
  user_id: number;
  expert_type: string;
  specialization: string;
  profile_photo?: string | null;
  experience_years?: number | null;
  qualifications?: string | null;
  about_text?: string | null;
  consultation_modes?: ConsultationMode[] | null;
  languages?: string[] | null;
  session_duration_mins?: number | null;
  appointment_fee_paise?: number | null;
  original_fee_paise?: number | null;
  patient_count?: number | null;
  effective_from?: string | null;
  effective_until?: string | null;
}

export interface ExpertReview {
  review_id: number;
  expert_id: number;
  user_id: number;
  rating: number;
  review_text?: string | null;
  created_at: string;
}

export const expertsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    expert_type?: string;
    status?: string;
    search?: string;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }) =>
    api.get<{ data: ExpertListItem[]; meta: { page: number; limit: number; total: number } }>("/experts", {
      params,
    }),
  get: (expertId: number) =>
    api.get<{ data: ExpertDetail }>(`/experts/${expertId}`),
  create: (payload: ExpertPayload) =>
    api.post<{ data: { expert_id: number } }>("/experts", payload),
  update: (expertId: number, payload: ExpertPayload) =>
    api.put<{ data: { expert_id: number } }>(`/experts/${expertId}`, payload),
  updateStatus: (expertId: number, status: "active" | "inactive") =>
    api.patch<{ data: { expert_id: number; status: string } }>(`/experts/${expertId}/status`, { status }),
  addTag: (expertId: number, payload: { tag_name: string; display_order?: number | null }) =>
    api.post<{ data: ExpertTag }>(`/experts/${expertId}/tags`, payload),
  deleteTag: (expertId: number, tagId: number) =>
    api.delete<{ data: { tag_id: number } }>(`/experts/${expertId}/tags/${tagId}`),
  listReviews: (expertId: number, params?: { page?: number; limit?: number }) =>
    api.get<{ data: ExpertReview[]; meta: { page: number; limit: number; total: number } }>(
      `/experts/${expertId}/reviews`,
      { params }
    ),
};

export type OverrideStatus = "available" | "unavailable" | "booked";

export interface ConsultationPreference {
  want: boolean;
  date?: string | null;
  slot?: string | null;
  expert_id?: number | null;
  done?: boolean;
}

export interface ConsultationRequestItem {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  engagement_id: number;
  engagement_code?: string | null;
  expert_type: string;
  date?: string | null;
  slot?: string | null;
  engagement_participant_id?: number;
  expert_id?: number | null;
}

export const expertsPortalApi = {
  me: () => api.get<{ data: ExpertDetail }>("/experts/portal/me"),
  listRequests: () =>
    api.get<{ data: ConsultationRequestItem[] }>("/experts/portal/requests"),
  confirmRequest: (payload: {
    user_id: number;
    engagement_id: number;
    expert_type: string;
    date: string;
    slot: string;
    expert_id?: number;
  }) => api.post<{ data: { message: string } }>("/experts/portal/confirm", payload),
  listUpcoming: () =>
    api.get<{ data: ConsultationRequestItem[] }>("/experts/portal/upcoming"),
  markConsultationDone: (payload: {
    user_id: number;
    engagement_id: number;
    expert_type: string;
    expert_id?: number;
  }) =>
    api.post<{ data: { message: string } }>("/experts/portal/consultations/done", payload),
};

export const expertsConsultationsApi = {
  slots: (params?: { expert_type?: string; expert_id?: number }) =>
    api.get<{
      data: Record<
        string,
        Record<string, Array<{ start_time: string; duration: number; available_slot: number }>>
      >;
    }>("/experts/consultations/slots", { params }),
  book: (payload: {
    engagement_id: number;
    expert_type: string;
    expert_id?: number;
    date: string;
    slot: string;
  }) => api.post<{ data: { message: string } }>("/experts/consultations/book", payload),
};

export interface AvailabilityBlock {
  id: number;
  expert_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration: number;
  buffer_time: number;
}

export interface AvailabilityOverride {
  id: number;
  expert_id: number;
  override_date: string;
  status: OverrideStatus;
  start_time?: string | null;
  end_time?: string | null;
  buffer_time?: number | null;
}

export interface AvailabilityBlockPayload {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration: number;
  buffer_time: number;
}

export interface AvailabilityOverridePayload {
  override_date: string;
  status: OverrideStatus;
  start_time?: string | null;
  end_time?: string | null;
  buffer_time?: number | null;
}

export const expertAvailabilityPortalApi = {
  listBlocks: () =>
    api.get<{ data: AvailabilityBlock[] }>("/experts/portal/availability"),
  createBlock: (payload: AvailabilityBlockPayload) =>
    api.post<{ data: AvailabilityBlock }>("/experts/portal/availability", payload),
  updateBlock: (blockId: number, payload: AvailabilityBlockPayload) =>
    api.put<{ data: AvailabilityBlock }>(`/experts/portal/availability/${blockId}`, payload),
  deleteBlock: (blockId: number) =>
    api.delete<{ data: { id: number } }>(`/experts/portal/availability/${blockId}`),
  bulkSave: (blocks: AvailabilityBlockPayload[]) =>
    api.put<{ data: AvailabilityBlock[] }>("/experts/portal/availability", { blocks }),
  listOverrides: () =>
    api.get<{ data: AvailabilityOverride[] }>("/experts/portal/overrides"),
  createOverride: (payload: AvailabilityOverridePayload) =>
    api.post<{ data: AvailabilityOverride }>("/experts/portal/overrides", payload),
  deleteOverride: (overrideId: number) =>
    api.delete<{ data: { id: number } }>(`/experts/portal/overrides/${overrideId}`),
};

export const expertAvailabilityAdminApi = {
  listBlocks: (expertId: number) =>
    api.get<{ data: AvailabilityBlock[] }>(`/experts/${expertId}/availability`),
  bulkSave: (expertId: number, blocks: AvailabilityBlockPayload[]) =>
    api.put<{ data: AvailabilityBlock[] }>(`/experts/${expertId}/availability`, { blocks }),
  listOverrides: (expertId: number) =>
    api.get<{ data: AvailabilityOverride[] }>(`/experts/${expertId}/overrides`),
  createOverride: (expertId: number, payload: AvailabilityOverridePayload) =>
    api.post<{ data: AvailabilityOverride }>(`/experts/${expertId}/overrides`, payload),
  deleteOverride: (expertId: number, overrideId: number) =>
    api.delete<{ data: { id: number } }>(`/experts/${expertId}/overrides/${overrideId}`),
};

// Checklists (readiness on engagement list + checklist APIs)
export interface ChecklistReadiness {
  done: number;
  total: number;
  percent: number;
}

// Engagements
export type EngagementKind = "bio_ai" | "blood_test" | "consultation" | "blood_test_with_consultation" | "bio_ai_with_consultation";
export type EngagementStatus = "draft" | "scheduled" | "running" | "completed" | "cancelled";
export type BloodCollectionType = "home_collection" | "camp_collection";

export interface EngagementLocationFields {
  city?: string | null;
  address?: string | null;
  sub_locality?: string | null;
  landmark?: string | null;
  pincode?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Engagement {
  engagement_id: number;
  engagement_name?: string | null;
  metsights_engagement_id?: string | null;
  organization_id?: number | null;
  camp_no?: number | null;
  engagement_code?: string | null;
  engagement_type?: EngagementKind | string | null;
  consultations?: Record<string, boolean> | null;
  assessment_package_id?: number | null;
  diagnostic_package_id?: number | null;
  city?: string | null;
  address?: string | null;
  sub_locality?: string | null;
  landmark?: string | null;
  pincode?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  slot_duration?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: EngagementStatus | string | null;
  participant_count?: number | null;
  created_at?: string | null;
  healthians_zone_id?: string | null;
  external_camp_id?: number | null;
  blood_collection_type?: BloodCollectionType | string | null;
  create_profile_on_metsights?: boolean | null;
  enroll_for_fitprint_full?: boolean | null;
  onboarding_notification?: string | null;
  pretest_guidelines_notification?: string | null;
  questionnaire_reminder_1?: string | null;
  questionnaire_reminder_2?: string | null;
  blood_report_notification?: string | null;
  bioai_report_notification?: string | null;
}

export interface EngagementListItem {
  engagement_id: number;
  engagement_name?: string | null;
  organization_id?: number | null;
  camp_no?: number | null;
  engagement_code?: string | null;
  engagement_type?: EngagementKind | string | null;
  consultations?: Record<string, boolean> | null;
  assessment_package_id?: number | null;
  diagnostic_package_id?: number | null;
  city?: string | null;
  address?: string | null;
  sub_locality?: string | null;
  landmark?: string | null;
  pincode?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  slot_duration?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: EngagementStatus | string | null;
  participant_count?: number | null;
  created_at?: string | null;
  healthians_zone_id?: string | null;
  external_camp_id?: number | null;
  blood_collection_type?: BloodCollectionType | string | null;
  create_profile_on_metsights?: boolean | null;
  enroll_for_fitprint_full?: boolean | null;
  onboarding_notification?: string | null;
  pretest_guidelines_notification?: string | null;
  questionnaire_reminder_1?: string | null;
  questionnaire_reminder_2?: string | null;
  blood_report_notification?: string | null;
  bioai_report_notification?: string | null;
  readiness?: ChecklistReadiness | null;
}

export interface EngagementCreate {
  engagement_name?: string | null;
  metsights_engagement_id?: string | null;
  organization_id?: number | null;
  camp_no?: number | null;
  engagement_type: EngagementKind;
  consultations?: Record<string, boolean> | null;
  engagement_code?: string | null;
  assessment_package_id?: number | null;
  diagnostic_package_id?: number | null;
  city?: string | null;
  address?: string | null;
  sub_locality?: string | null;
  landmark?: string | null;
  pincode?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  slot_duration: number;
  start_date: string;
  end_date: string;
  healthians_zone_id?: string | null;
  external_camp_id?: number | null;
  blood_collection_type?: BloodCollectionType | string | null;
  create_profile_on_metsights?: boolean;
  enroll_for_fitprint_full?: boolean;
  onboarding_notification?: string | null;
  pretest_guidelines_notification?: string | null;
  questionnaire_reminder_1?: string | null;
  questionnaire_reminder_2?: string | null;
  blood_report_notification?: string | null;
  bioai_report_notification?: string | null;
}

export interface GeocodeSuggestion extends EngagementLocationFields {
  display_name?: string | null;
}

export const geocodeApi = {
  search: (q: string, limit = 3) =>
    api.get<{ data: GeocodeSuggestion[] }>("/geocode/search", { params: { q, limit } }),
};


export const engagementsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    org_id?: number;
    camp_no?: number;
    status?: string;
    city?: string;
    engagement_type?: string;
    audience?: "b2b" | "b2c";
    search?: string;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
    date?: string;
  }) =>
    api.get<{ data: EngagementListItem[]; meta: { page: number; limit: number; total: number } }>(
      "/engagements",
      { params }
    ),
  filterOptions: () =>
    api.get<{ data: { engagement_types: string[]; cities: string[] } }>("/engagements/filter-options"),
  resolveHealthiansZone: (payload: {
    diagnostic_package_id: number;
    latitude: number;
    longitude: number;
    pincode: string;
  }) =>
    api.post<{ data: { serviceable: boolean; zone_id?: string | null; message: string } }>(
      "/engagements/resolve-healthians-zone",
      payload
    ),
  get: (id: number) =>
    api.get<{ data: Engagement }>(`/engagements/${id}`),
  create: (payload: EngagementCreate) =>
    api.post<{ data: { engagement_id: number } }>("/engagements", payload),
  update: (id: number, payload: Partial<EngagementCreate> & Pick<EngagementCreate, "engagement_type" | "start_date" | "end_date" | "slot_duration">) =>
    api.put<{ data: { engagement_id: number } }>(`/engagements/${id}`, payload),
  updateStatus: (id: number, status: EngagementStatus) =>
    api.patch<{ data: { engagement_id: number; status: EngagementStatus } }>(
      `/engagements/${id}/status`,
      { status }
    ),
  delete: (id: number) =>
    api.delete<{
      data: {
        engagement_id: number;
        engagement_code?: string | null;
        engagement_name?: string | null;
        deleted_engagement_participants: number;
        deleted_assessment_instances: number;
        deleted_questionnaire_responses: number;
        deleted_reports: number;
        deleted_category_progress_rows: number;
        deleted_camp_reports: number;
        deleted_onboarding_assistant_assignments: number;
        deleted_engagement_checklists: number;
      };
    }>(`/engagements/${id}`),
  assignParticipantsBatch: (
    engagementId: number,
    payload: { rows: { metsights_record_id: string; phone: string; email: string }[] },
    config?: { signal?: AbortSignal }
  ) =>
    api.post<{
      data: {
        results: {
          metsights_record_id: string;
          phone: string;
          email: string;
          status: string;
          reason?: string | null;
          user_id?: number | null;
          assessment_instance_id?: number | null;
          newly_enrolled?: boolean | null;
        }[];
      };
    }>(`/engagements/${engagementId}/assign-participants-batch`, payload, {
      timeout: 120_000,
      ...config,
    }),
  createMetsightsProfiles: (engagementId: number, mode: "enrol_force" | "enrol" | "profile" = "profile") =>
    api.post<{
      data: {
        engagement_id: number;
        total: number;
        created: number;
        skipped: number;
        failed: number;
        results: {
          user_id: number;
          status: string;
          metsights_profile_id?: string | null;
          reason?: string | null;
        }[];
      };
    }>(`/engagements/${engagementId}/create-metsights-profiles`, { mode }, {
      timeout: 120_000,
    }),
};

// Assessment packages
export interface AssessmentPackage {
  package_id: number;
  package_code?: string | null;
  display_name?: string | null;
  assessment_type_code?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AssessmentPackageCreate {
  package_code: string;
  display_name: string;
  assessment_type_code: string;
  status?: string;
}

export interface AssessmentPackageUpdate {
  package_code?: string;
  display_name?: string;
  assessment_type_code?: string;
}

export interface AssessmentPackageCategory {
  id: number;
  category_id: number;
  category_key?: string | null;
  display_name?: string | null;
  category_of?: string | null;
  display_order?: number | null;
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
  listCategories: (packageId: number) =>
    api.get<{ data: AssessmentPackageCategory[] }>(`/assessment-packages/${packageId}/categories`),
  addCategories: (packageId: number, category_ids: number[]) =>
    api.post<{ data: { package_id: number; added_category_ids: number[]; skipped_category_ids: number[] } }>(
      `/assessment-packages/${packageId}/categories`,
      { category_ids }
    ),
  reorderCategories: (packageId: number, payload: { category_ids: number[] }) =>
    api.patch<{ data: { package_id: number; category_ids: number[] } }>(
      `/assessment-packages/${packageId}/categories/order`,
      payload
    ),
  removeCategory: (packageId: number, categoryId: number) =>
    api.delete<{ data: { package_id: number; removed_category_id: number } }>(
      `/assessment-packages/${packageId}/categories/${categoryId}`
    ),
};

// Engagement-level assessment packages
export interface EngagementAssessmentPackageSummary {
  package_id: number;
  package_code: string;
  display_name: string;
  assessment_type_code: string;
  status: string;
  assigned_count: number;
  total_participants: number;
  synced_count: number;
}

export interface EngagementAssessmentInstanceRow {
  assessment_instance_id: number;
  user_id: number;
  package_id: number;
  package_code?: string | null;
  metsights_record_id?: string | null;
  status?: string | null;
}

export const engagementAssessmentPackagesApi = {
  list: (engagementId: number) =>
    api.get<{ data: EngagementAssessmentPackageSummary[] }>(
      `/engagements/${engagementId}/assessment-packages`
    ),
  listInstances: (engagementId: number, packageId?: number) =>
    api.get<{ data: EngagementAssessmentInstanceRow[] }>(
      `/engagements/${engagementId}/assessment-instances`,
      packageId != null ? { params: { package_id: packageId } } : undefined
    ),
  add: (engagementId: number, packageCode: string) =>
    api.post<{
      data: {
        package_id: number;
        package_code: string;
        created: { user_id: number; assessment_instance_id: number; metsights_record_id: string | null }[];
        skipped: { user_id: number; assessment_instance_id: number; reason: string }[];
        errors: { user_id: number; stage: string; reason: string }[];
      };
    }>(`/engagements/${engagementId}/assessment-packages`, {
      package_code: packageCode,
    }),
  remove: (engagementId: number, packageCode: string) =>
    api.delete<{
      data: { package_id: number; package_code: string; deleted_instances: number };
    }>(`/engagements/${engagementId}/assessment-packages/${packageCode}`),
  pushQuestionnaires: (
    engagementId: number,
    packageId: number,
    assessmentInstanceId?: number,
    categories?: string[]
  ) =>
    api.post<{
      data: { pushed: number; skipped: number; errors: number; details: unknown[] };
    }>(
      `/engagements/${engagementId}/push-questionnaires`,
      {
        package_id: packageId,
        ...(assessmentInstanceId != null
          ? { assessment_instance_id: assessmentInstanceId }
          : {}),
        ...(categories != null ? { categories } : {}),
      },
      { timeout: 120_000 }
    ),
  connectMetsightsRecords: (engagementId: number, packageId: number) =>
    api.post<{
      data: {
        engagement_id: number;
        package_id: number;
        package_code: string;
        assessment_type_code: string;
        total: number;
        connected: number;
        skipped: number;
        failed: number;
        results: {
          user_id: number;
          assessment_instance_id: number;
          status: string;
          metsights_record_id?: string | null;
          reason?: string | null;
        }[];
      };
    }>(`/engagements/${engagementId}/connect-metsights-records`, {
      package_id: packageId,
    }, { timeout: 120_000 }),
};

// Questionnaire questions
export interface QuestionnaireOption {
  option_value: string;
  display_name: string;
  tooltip_text?: string | null;
}

export interface QuestionnaireVisibilityCondition {
  type: "question_answer" | "user_preference";
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "in" | "not_in";
  question_key?: string;
  preference_key?: "diet_preference" | "allergies";
  value: unknown;
}

export interface QuestionnaireVisibilityRules {
  match: "all" | "any";
  conditions: QuestionnaireVisibilityCondition[];
}

export interface QuestionnairePrefillFrom {
  source: "user_preference";
  preference_key: "diet_preference" | "allergies";
}

export type QuestionnaireQuestionType =
  | "text"
  | "single_choice"
  | "multiple_choice"
  | "multi_choice"
  | "scale"
  | string;

export interface MetsightsSyncConfig {
  pull?: { enabled?: boolean; strategy?: string; [key: string]: unknown };
  push?: { enabled?: boolean; strategy?: string; [key: string]: unknown };
}

export interface QuestionnaireQuestion {
  question_id: number;
  question_key?: string | null;
  question_text?: string | null;
  question_type?: QuestionnaireQuestionType | null;
  is_required?: boolean;
  is_read_only?: boolean;
  help_text?: string | null;
  options?: QuestionnaireOption[] | null;
  visibility_rules?: QuestionnaireVisibilityRules | null;
  prefill_from?: QuestionnairePrefillFrom | null;
  metsights_sync?: MetsightsSyncConfig | null;
  status?: string | null;
  created_at?: string | null;
  category_id?: number | null;
  display_order?: number | null;
  answer?: unknown;
}

export interface QuestionnaireQuestionCreate {
  question_key: string;
  question_text: string;
  question_type: QuestionnaireQuestionType;
  is_required?: boolean;
  is_read_only?: boolean;
  help_text?: string | null;
  options?: QuestionnaireOption[] | null;
  visibility_rules?: QuestionnaireVisibilityRules | null;
  prefill_from?: QuestionnairePrefillFrom | null;
  status?: string;
}

export interface QuestionnaireQuestionUpdate {
  question_key: string;
  question_text: string;
  question_type: QuestionnaireQuestionType;
  is_required?: boolean;
  is_read_only?: boolean;
  help_text?: string | null;
  options?: QuestionnaireOption[] | null;
  visibility_rules?: QuestionnaireVisibilityRules | null;
  prefill_from?: QuestionnairePrefillFrom | null;
}

export interface QuestionnaireHealthyHabitRule {
  rule_id: number;
  question_id: number;
  habit_key?: string | null;
  habit_label: string;
  display_order?: number | null;
  condition_type: string;
  matched_option_values?: string[] | null;
  scale_min?: number | null;
  scale_max?: number | null;
  scale_unit?: string | null;
  status: string;
  created_at?: string | null;
  updated_employee_id?: number | null;
}

export type QuestionnaireHealthyHabitRulePayload = {
  habit_key?: string | null;
  habit_label: string;
  display_order?: number | null;
  condition_type: string;
  matched_option_values?: string[] | null;
  scale_min?: number | null;
  scale_max?: number | null;
  scale_unit?: string | null;
  status: string;
};

export interface QuestionnaireCategory {
  category_id: number;
  category_key: string;
  display_name: string;
  category_of?: string | null;
  status?: string | null;
}

export interface QuestionnaireCategoryCreate {
  category_key: string;
  display_name: string;
  category_of?: string;
}

export interface QuestionnaireCategoryUpdate {
  category_key: string;
  display_name: string;
  category_of?: string;
}

// Participants
export interface Participant {
  engagement_participant_id?: number;
  engagement_id?: number;
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  gender?: string | null;
  email?: string | null;
  age?: number | null;
  status?: string | null;
  slot_start_time?: string | null;
  engagement_date?: string | null;
  participants_employee_id?: string | null;
  participant_department?: string | null;
  participant_blood_group?: string | null;
  consultations?: Record<string, ConsultationPreference | boolean | null> | null;
  is_profile_created_on_metsights?: boolean | null;
  is_primary_record_id_synced?: boolean | null;
  is_fitprint_record_id_synced?: boolean | null;
  barcode?: string | null;
  booking_id?: string | null;
  booked_by_user_id?: number | null;
  engagement_name?: string | null;
  engagement_code?: string | null;
  engagement_type?: string | null;
  address?: string | null;
  pin_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface EngagementParticipantUpdatePayload {
  participant_department?: string | null;
  consultations?: Record<string, ConsultationPreference | boolean | null> | null;
}

export interface EngagementParticipantUpdateResponse {
  engagement_id: number;
  user_id: number;
  participant_department?: string | null;
  consultations?: Record<string, ConsultationPreference | boolean | null> | null;
}

export const participantsApi = {
  byEngagementId: (engagementId: number, params?: { page?: number; limit?: number }) =>
    api.get<{ data: Participant[]; meta?: { page?: number; limit?: number; total: number } }>(
      `/engagements/${engagementId}/participants`,
      { params }
    ),
  // B2B: participants for a specific engagement by code
  byEngagementCode: (code: string, params?: { page?: number; limit?: number }) =>
    api.get<{ data: Participant[]; meta?: { total: number } }>(
      `/engagements/code/${encodeURIComponent(code)}/participants`,
      { params }
    ),
  // B2C: participants for public/open engagements
  public: (params?: { page?: number; limit?: number }) =>
    api.get<{ data: Participant[]; meta?: { total: number } }>(
      "/engagements/public/participants",
      { params }
    ),
  // All participants across all engagements for an org
  byOrganization: (orgId: number, params?: { page?: number; limit?: number }) =>
    api.get<{ data: Participant[]; meta?: { page?: number; limit?: number; total: number } }>(
      `/organizations/${orgId}/participants`,
      { params }
    ),
  byCamp: (campNo: number, params?: { page?: number; limit?: number }) =>
    api.get<{ data: Participant[]; meta: { page: number; limit: number; total: number } }>(
      `/reports/camps/${campNo}/participants`,
      { params }
    ),
  removeFromEngagement: (engagementId: number, userId: number) =>
    api.delete<{ data: { engagement_id: number; user_id: number } }>(
      `/engagements/${engagementId}/participants/${userId}`
    ),
  removeAllFromEngagement: (engagementId: number) =>
    api.delete<{
      data: {
        engagement_id: number;
        deleted_users: number;
        deleted_engagement_participants: number;
        deleted_assessment_instances: number;
        deleted_questionnaire_responses: number;
        deleted_reports: number;
        deleted_category_progress_rows: number;
      };
    }>(`/engagements/${engagementId}/participants`),
  updateParticipant: (
    engagementId: number,
    userId: number,
    payload: EngagementParticipantUpdatePayload
  ) =>
    api.patch<{ data: EngagementParticipantUpdateResponse }>(
      `/engagements/${engagementId}/participants/${userId}`,
      payload
    ),
  updateDepartment: (
    engagementId: number,
    userId: number,
    participant_department: string | null
  ) =>
    api.patch<{ data: EngagementParticipantUpdateResponse }>(
      `/engagements/${engagementId}/participants/${userId}`,
      { participant_department }
    ),
};

// Engagement Questionnaire Status
export interface EngagementQuestionnaireStatusPackage {
  package_code?: string | null;
  package_display_name?: string | null;
  questionnaire_state: "drafted" | "submitted" | "not_started";
  responses_count: number;
}

export interface EngagementQuestionnaireStatusParticipant {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  questionnaire_state: "drafted" | "submitted" | "not_started";
  total_responses: number;
  packages: EngagementQuestionnaireStatusPackage[];
}

export interface EngagementQuestionnaireStatusResponse {
  summary: {
    drafted: number;
    submitted: number;
    not_started: number;
  };
  participants: EngagementQuestionnaireStatusParticipant[];
}

export const engagementQuestionnaireStatusApi = {
  get: (engagementId: number) =>
    api.get<{ data: EngagementQuestionnaireStatusResponse }>(
      `/engagements/${engagementId}/questionnaire-status`
    ),
};

// Onboarding Assistants
export interface OnboardingAssistant {
  employee_id: number;
  user_id: number;
  role?: string | null;
  status?: string | null;
  first_name?: string | null;
  last_name?: string | null;
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

export interface ConsoleEngagementListItem {
  engagement_id: number;
  engagement_name?: string | null;
  engagement_code?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  participant_count?: number | null;
}

export interface ConsoleParticipantBookResponse {
  status?: boolean;
  message?: string | null;
  lead_id?: number | null;
  booking_id?: string | null;
  resCode?: string | null;
  tatDetail?: Record<string, unknown> | null;
  barcode?: string | null;
  engagement_participant_id?: number | null;
  user_id?: number | null;
}

export interface ConsoleParticipantAssessment {
  assessment_instance_id: number;
  package_id?: number | null;
  package_code?: string | null;
  package_display_name?: string | null;
  assessment_type_code?: string | null;
  engagement_id?: number | null;
  status?: string | null;
  metsights_record_id?: string | null;
  assigned_at?: string | null;
  completed_at?: string | null;
}

export interface ConsoleAssessmentCategoryStatus {
  id?: number | null;
  category_id: number;
  category_key?: string | null;
  display_name?: string | null;
  category_of?: string | null;
  status: "complete" | "incomplete" | string;
}

export interface ConsoleQuestionnaireOption {
  option_id?: number | null;
  option_value?: string | null;
  display_name?: string | null;
  help_text?: string | null;
}

export interface ConsoleQuestionnaireQuestion {
  question_id: number;
  question_text?: string | null;
  question_type?: string | null;
  question_key?: string | null;
  category_id?: number | null;
  is_required?: boolean;
  is_read_only?: boolean;
  help_text?: string | null;
  options?: ConsoleQuestionnaireOption[] | null;
  is_visible?: boolean;
  answer?: unknown;
  answer_source?: string | null;
}

export interface ConsoleQuestionnairePayload {
  assessment_instance_id?: number;
  assessment_package?: string | null;
  category?: string | null;
  assessment_status?: string | null;
  category_status?: string | null;
  questions: ConsoleQuestionnaireQuestion[];
}

export const consoleApi = {
  listEngagements: () =>
    api.get<{ data: ConsoleEngagementListItem[] }>("/engagements/console/engagements"),
  getEngagement: (id: number) =>
    api.get<{ data: ConsoleEngagementListItem }>(`/engagements/${id}/console`),
  listParticipants: (id: number, params?: { page?: number; limit?: number }) =>
    api.get<{ data: Participant[]; meta: { page: number; limit: number; total: number } }>(
      `/engagements/${id}/console/participants`,
      { params }
    ),
  bookParticipant: (
    engagementId: number,
    userId: number,
    payload: { barcode: string }
  ) =>
    api.post<{ data: ConsoleParticipantBookResponse }>(
      `/engagements/${engagementId}/console/participants/${userId}/book`,
      payload
    ),
  cancelParticipantBooking: (
    engagementId: number,
    userId: number,
    remarks: string
  ) =>
    api.delete<{ data: { status: boolean; message?: string; booking_id?: string } }>(
      `/engagements/${engagementId}/console/participants/${userId}/book`,
      { params: { remarks } }
    ),
  listParticipantAssessments: (engagementId: number, userId: number) =>
    api.get<{ data: ConsoleParticipantAssessment[] }>(
      `/engagements/${engagementId}/console/participants/${userId}/assessments`
    ),
  getParticipantAssessmentStatus: (
    engagementId: number,
    userId: number,
    assessmentInstanceId: number,
    params?: { category_of?: string }
  ) =>
    api.get<{ data: ConsoleAssessmentCategoryStatus[] }>(
      `/engagements/${engagementId}/console/participants/${userId}/assessments/${assessmentInstanceId}/status`,
      { params }
    ),
  getParticipantQuestionnaire: (
    engagementId: number,
    userId: number,
    assessmentInstanceId: number,
    categoryId: number
  ) =>
    api.get<{ data: ConsoleQuestionnairePayload }>(
      `/engagements/${engagementId}/console/participants/${userId}/questionnaire/${assessmentInstanceId}/category/${categoryId}`
    ),
  upsertParticipantQuestionnaireResponses: (
    engagementId: number,
    userId: number,
    assessmentInstanceId: number,
    categoryId: number,
    payload: { responses: { question_id: number; answer: unknown }[] }
  ) =>
    api.put<{ data: { message: string } }>(
      `/engagements/${engagementId}/console/participants/${userId}/questionnaire/${assessmentInstanceId}/category/${categoryId}/responses`,
      payload
    ),
  submitParticipantAssessment: (
    engagementId: number,
    userId: number,
    assessmentInstanceId: number,
    payload: { category: string; category_of?: string }
  ) =>
    api.post<{ data: Record<string, unknown> }>(
      `/engagements/${engagementId}/console/participants/${userId}/assessments/${assessmentInstanceId}/submit`,
      payload
    ),
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
  list: (params?: { page?: number; limit?: number; status?: string; type?: string }) =>
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
  updateMetsightsSync: (id: number, metsights_sync: MetsightsSyncConfig) =>
    api.put<{ data: QuestionnaireQuestion }>(
      `/questionnaire/questions/${id}/metsights-sync`,
      { metsights_sync }
    ),
  listMetsightsSyncGaps: () =>
    api.get<{ data: MetsightsSyncGapsResponse }>("/questionnaire/questions/metsights-sync-gaps"),
  resetMetsightsSync: () =>
    api.post<{ data: MetsightsSyncResetResponse }>("/questionnaire/metsights-sync/reset"),
  reloadBloodParameters: () =>
    api.post<{ data: BloodParametersReloadResponse }>("/questionnaire/blood-parameters/reload"),
};

export interface MetsightsSyncGapsCategoryRef {
  category_id: number;
  category_key?: string | null;
  display_name?: string | null;
}

export interface MetsightsSyncGapsItem {
  question_id: number;
  question_key?: string | null;
  question_text?: string | null;
  metsights_categories: MetsightsSyncGapsCategoryRef[];
  sync_gaps: {
    not_configured: boolean;
    pull_disabled: boolean;
    push_disabled: boolean;
  };
}

export interface MetsightsSyncGapsResponse {
  count: number;
  summary: {
    not_configured: number;
    pull_disabled: number;
    push_disabled: number;
  };
  questions: MetsightsSyncGapsItem[];
}

export interface MetsightsSyncResetResponse {
  schema_upgraded?: boolean;
  categories_total: number;
  categories_created: number;
  categories_updated: number;
  categories_unchanged: number;
  question_links_total: number;
  links_added: number;
  questions_sync_updated: number;
  package_links_total: number;
  package_links_added: number;
  missing_question_keys: string[];
  missing_package_codes: string[];
}

export interface BloodParametersReloadResponse {
  questions_deleted: number;
  responses_deleted: number;
  questions_created: number;
  categories_created: number;
  categories_updated: number;
  question_links_total: number;
  links_added: number;
  package_links_added: number;
  package_links_total: number;
  missing_package_codes: string[];
}

export interface IntegrationSyncLog {
  sync_log_id: number;
  engagement_id?: number | null;
  user_id?: number | null;
  provider: string;
  api_endpoint_url: string;
  request_payload?: Record<string, unknown> | unknown[] | null;
  response_payload?: Record<string, unknown> | unknown[] | null;
  status?: string | null;
  error_message?: string | null;
  created_at: string;
}

export const integrationSyncLogsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    provider?: string;
    status?: string;
    user_id?: number;
    engagement_id?: number;
    search?: string;
    from?: string;
    to?: string;
  }) =>
    api.get<{ data: IntegrationSyncLog[]; meta: { page: number; limit: number; total: number } }>(
      "/audit/integration-sync-logs",
      { params }
    ),
};

export const questionnaireHealthyHabitRulesApi = {
  list: (questionId: number) =>
    api.get<{ data: QuestionnaireHealthyHabitRule[] }>(
      `/questionnaire/questions/${questionId}/healthy-habit-rules`
    ),
  create: (questionId: number, payload: QuestionnaireHealthyHabitRulePayload) =>
    api.post<{ data: QuestionnaireHealthyHabitRule }>(
      `/questionnaire/questions/${questionId}/healthy-habit-rules`,
      payload
    ),
  update: (questionId: number, ruleId: number, payload: QuestionnaireHealthyHabitRulePayload) =>
    api.put<{ data: QuestionnaireHealthyHabitRule }>(
      `/questionnaire/questions/${questionId}/healthy-habit-rules/${ruleId}`,
      payload
    ),
  delete: (questionId: number, ruleId: number) =>
    api.delete<{ data: { deleted: boolean } }>(
      `/questionnaire/questions/${questionId}/healthy-habit-rules/${ruleId}`
    ),
};

export const questionnaireCategoriesApi = {
  list: (params?: { page?: number; limit?: number; category_of?: string; status?: string }) =>
    api.get<{ data: QuestionnaireCategory[]; meta: { page: number; limit: number; total: number } }>(
      "/questionnaire/categories",
      { params: { ...params, limit: params?.limit ?? 100 } }
    ),
  get: (id: number) =>
    api.get<{ data: QuestionnaireCategory }>(`/questionnaire/categories/${id}`),
  create: (payload: QuestionnaireCategoryCreate) =>
    api.post<{ data: { category_id: number } }>("/questionnaire/categories", payload),
  update: (id: number, payload: QuestionnaireCategoryUpdate) =>
    api.put<{ data: { category_id: number } }>(`/questionnaire/categories/${id}`, payload),
  updateStatus: (id: number, status: string) =>
    api.patch<{ data: { category_id: number; status: string } }>(`/questionnaire/categories/${id}/status`, { status }),
  listQuestions: (categoryId: number) =>
    api.get<{ data: QuestionnaireQuestion[] }>(`/questionnaire/categories/${categoryId}/questions`),
  assignQuestions: (categoryId: number, question_ids: number[]) =>
    api.post<{ data: { category_id: number; question_ids: number[] } }>(
      `/questionnaire/categories/${categoryId}/questions`,
      { question_ids }
    ),
  reorderQuestions: (categoryId: number, payload: { question_ids: number[] }) =>
    api.patch<{ data: { category_id: number; question_ids: number[] } }>(
      `/questionnaire/categories/${categoryId}/questions/order`,
      payload
    ),
  removeQuestion: (categoryId: number, questionId: number) =>
    api.delete<{ data: { category_id: number; question_id: number } }>(
      `/questionnaire/categories/${categoryId}/questions/${questionId}`
    ),
};

// Diagnostics
export interface DiagnosticTag {
  tag_id: number;
  diagnostic_package_id: number;
  tag_name: string;
  display_order?: number | null;
}

export interface DiagnosticReason {
  reason_id: number;
  diagnostic_package_id: number;
  display_order?: number | null;
  reason_text: string;
}

export interface DiagnosticTest {
  test_id: number;
  group_id: number;
  test_name: string;
  external_parameter_id?: number | null;
  parameter_key?: string | null;
  unit?: string | null;
  meaning?: string | null;
  low_risk_lower_range_male?: number | null;
  low_risk_higher_range_male?: number | null;
  moderate_risk_lower_range_male?: number | null;
  moderate_risk_higher_range_male?: number | null;
  high_risk_lower_range_male?: number | null;
  high_risk_higher_range_male?: number | null;
  low_risk_lower_range_female?: number | null;
  low_risk_higher_range_female?: number | null;
  moderate_risk_lower_range_female?: number | null;
  moderate_risk_higher_range_female?: number | null;
  high_risk_lower_range_female?: number | null;
  high_risk_higher_range_female?: number | null;
  causes_when_high?: string | null;
  causes_when_low?: string | null;
  effects_when_high?: string | null;
  effects_when_low?: string | null;
  what_to_do_when_low?: string | null;
  what_to_do_when_high?: string | null;
  display_order?: number | null;
  is_available?: boolean;
}

export interface DiagnosticTestGroup {
  group_id: number;
  diagnostic_package_id: number;
  group_name: string;
  test_count?: number | null;
  display_order?: number | null;
  tests?: DiagnosticTest[];
}

export interface DiagnosticSample {
  sample_id: number;
  diagnostic_package_id: number;
  sample_type: string;
  description?: string | null;
  display_order?: number | null;
}

export interface DiagnosticPreparation {
  preparation_id: number;
  diagnostic_package_id: number;
  preparation_title: string;
  steps?: string[] | null;
  display_order?: number | null;
}

export interface PackageFilterChip {
  filter_chip_id: number;
  chip_key: string;
  display_name: string;
  display_order?: number | null;
}

export type DiagnosticPackageListType = "public_package" | "custom_package";
export type DiagnosticFilterChipFor = "public_package" | "custom_package";

export interface DiagnosticPackageListItem {
  diagnostic_package_id: number;
  package_name: string;
  package_image?: string | null;
  diagnostic_provider?: string | null;
  external_package_id?: number | null;
  created_by_user_id?: number | null;
  no_of_tests?: number | null;
  report_duration_hours?: number | null;
  collection_type?: string | null;
  price?: number | null;
  original_price?: number | null;
  discount_percent?: number | null;
  is_most_popular?: boolean | null;
  complementary_consultation?: Record<string, boolean> | null;
  gender_suitability?: string | null;
  package_for?: "public" | "camp" | null;
  status?: string | null;
  display_order?: number | null;
  tags?: DiagnosticTag[];
  filter_chips?: PackageFilterChip[];
}

export interface DiagnosticPackageDetail extends DiagnosticPackageListItem {
  health_areas_covered?: string | null;
  about_text?: string | null;
  bookings_count?: number | null;
  reasons?: DiagnosticReason[];
  samples?: DiagnosticSample[];
  preparations?: DiagnosticPreparation[];
}

export interface DiagnosticPackageCreate {
  package_name: string;
  package_image?: string | null;
  diagnostic_provider?: string | null;
  external_package_id?: number | null;
  /** Public (false) vs custom/owned (true). Non-staff must use true; staff may use either. */
  custom?: boolean;
  report_duration_hours?: number | null;
  collection_type?: string | null;
  health_areas_covered?: string | null;
  about_text?: string | null;
  bookings_count?: number | null;
  price?: number | null;
  original_price?: number | null;
  is_most_popular?: boolean | null;
  complementary_consultation?: Record<string, boolean> | null;
  gender_suitability?: string | null;
  package_for?: "public" | "camp" | null;
}

export interface DiagnosticFilterChip {
  filter_chip_id: number;
  chip_key: string;
  display_name: string;
  display_order?: number | null;
  chip_for?: DiagnosticFilterChipFor | string;
  status?: string | null;
}

export const diagnosticPackagesApi = {
  list: (params?: {
    gender?: string;
    tag?: string;
    filter_chip?: string;
    type?: DiagnosticPackageListType;
    include_inactive?: boolean;
    package_for?: string;
  }) => api.get<{ data: DiagnosticPackageListItem[] }>("/diagnostic-packages", { params }),
  get: (id: number) =>
    api.get<{ data: DiagnosticPackageDetail }>(`/diagnostic-packages/${id}`),
  getTests: (id: number) =>
    api.get<{ data: PackageTestsResponse }>(`/diagnostic-packages/${id}/tests`),
  create: (payload: DiagnosticPackageCreate) =>
    api.post<{ data: { diagnostic_package_id: number } }>("/diagnostic-packages", payload),
  update: (id: number, payload: Partial<DiagnosticPackageCreate>) =>
    api.put<{ data: { diagnostic_package_id: number } }>(`/diagnostic-packages/${id}`, payload),
  updateStatus: (id: number, status: string) =>
    api.patch<{ data: { diagnostic_package_id: number; status: string } }>(
      `/diagnostic-packages/${id}/status`,
      { status }
    ),
  reorder: (payload: { package_ids: number[] }) =>
    api.patch<{ data: { reordered: boolean } }>("/diagnostic-packages/order", payload),
  delete: (id: number) => api.delete(`/diagnostic-packages/${id}`),
  addReason: (id: number, payload: { reason_text: string; display_order?: number }) =>
    api.post<{ data: DiagnosticReason }>(`/diagnostic-packages/${id}/reasons`, payload),
  updateReason: (id: number, reasonId: number, payload: { reason_text?: string; display_order?: number }) =>
    api.put<{ data: DiagnosticReason }>(`/diagnostic-packages/${id}/reasons/${reasonId}`, payload),
  deleteReason: (id: number, reasonId: number) =>
    api.delete<{ data: { reason_id: number; deleted: boolean } }>(`/diagnostic-packages/${id}/reasons/${reasonId}`),
  addTag: (id: number, payload: { tag_name: string; display_order?: number }) =>
    api.post<{ data: DiagnosticTag }>(`/diagnostic-packages/${id}/tags`, payload),
  deleteTag: (id: number, tagId: number) =>
    api.delete<{ data: { tag_id: number; deleted: boolean } }>(`/diagnostic-packages/${id}/tags/${tagId}`),
  addFilterChip: (id: number, payload: { filter_chip_id: number; display_order?: number }) =>
    api.post<{ data: PackageFilterChip }>(`/diagnostic-packages/${id}/filter-chips`, payload),
  removeFilterChip: (id: number, filterChipId: number) =>
    api.delete<{ data: { filter_chip_id: number; deleted: boolean } }>(
      `/diagnostic-packages/${id}/filter-chips/${filterChipId}`
    ),
  addTestGroup: (id: number, payload: { group_name: string; test_count?: number; display_order?: number }) =>
    api.post<{ data: DiagnosticTestGroup }>(`/diagnostic-packages/${id}/test-groups`, payload),
  updateTestGroup: (
    id: number,
    groupId: number,
    payload: { group_name?: string; test_count?: number; display_order?: number }
  ) => api.put<{ data: DiagnosticTestGroup }>(`/diagnostic-packages/${id}/test-groups/${groupId}`, payload),
  deleteTestGroup: (id: number, groupId: number) =>
    api.delete<{ data: { group_id: number; deleted: boolean } }>(`/diagnostic-packages/${id}/test-groups/${groupId}`),
  addTest: (
    id: number,
    groupId: number,
    payload: {
      test_name: string;
      parameter_key?: string | null;
      unit?: string | null;
      meaning?: string | null;
      low_risk_lower_range_male?: number | null;
      low_risk_higher_range_male?: number | null;
      moderate_risk_lower_range_male?: number | null;
      moderate_risk_higher_range_male?: number | null;
      high_risk_lower_range_male?: number | null;
      high_risk_higher_range_male?: number | null;
      low_risk_lower_range_female?: number | null;
      low_risk_higher_range_female?: number | null;
      moderate_risk_lower_range_female?: number | null;
      moderate_risk_higher_range_female?: number | null;
      high_risk_lower_range_female?: number | null;
      high_risk_higher_range_female?: number | null;
      causes_when_high?: string | null;
      causes_when_low?: string | null;
      effects_when_high?: string | null;
      effects_when_low?: string | null;
      what_to_do_when_low?: string | null;
      what_to_do_when_high?: string | null;
      is_available?: boolean;
      display_order?: number;
    }
  ) =>
    api.post<{ data: DiagnosticTest }>(
      `/diagnostic-packages/${id}/test-groups/${groupId}/tests`,
      payload
    ),
  updateTest: (
    id: number,
    groupId: number,
    testId: number,
    payload: {
      test_name?: string;
      parameter_key?: string | null;
      unit?: string | null;
      meaning?: string | null;
      low_risk_lower_range_male?: number | null;
      low_risk_higher_range_male?: number | null;
      moderate_risk_lower_range_male?: number | null;
      moderate_risk_higher_range_male?: number | null;
      high_risk_lower_range_male?: number | null;
      high_risk_higher_range_male?: number | null;
      low_risk_lower_range_female?: number | null;
      low_risk_higher_range_female?: number | null;
      moderate_risk_lower_range_female?: number | null;
      moderate_risk_higher_range_female?: number | null;
      high_risk_lower_range_female?: number | null;
      high_risk_higher_range_female?: number | null;
      causes_when_high?: string | null;
      causes_when_low?: string | null;
      effects_when_high?: string | null;
      effects_when_low?: string | null;
      what_to_do_when_low?: string | null;
      what_to_do_when_high?: string | null;
      is_available?: boolean;
      display_order?: number;
    }
  ) =>
    api.put<{ data: DiagnosticTest }>(
      `/diagnostic-packages/${id}/test-groups/${groupId}/tests/${testId}`,
      payload
    ),
  deleteTest: (id: number, groupId: number, testId: number) =>
    api.delete<{ data: { test_id: number; deleted: boolean } }>(
      `/diagnostic-packages/${id}/test-groups/${groupId}/tests/${testId}`
    ),
  addSample: (id: number, payload: { sample_type: string; description?: string; display_order?: number }) =>
    api.post<{ data: DiagnosticSample }>(`/diagnostic-packages/${id}/samples`, payload),
  updateSample: (
    id: number,
    sampleId: number,
    payload: { sample_type?: string; description?: string; display_order?: number }
  ) => api.put<{ data: DiagnosticSample }>(`/diagnostic-packages/${id}/samples/${sampleId}`, payload),
  deleteSample: (id: number, sampleId: number) =>
    api.delete<{ data: { sample_id: number; deleted: boolean } }>(`/diagnostic-packages/${id}/samples/${sampleId}`),
  addPreparation: (
    id: number,
    payload: { preparation_title: string; steps?: string[]; display_order?: number }
  ) => api.post<{ data: DiagnosticPreparation }>(`/diagnostic-packages/${id}/preparations`, payload),
  updatePreparation: (
    id: number,
    preparationId: number,
    payload: { preparation_title?: string; steps?: string[]; display_order?: number }
  ) =>
    api.put<{ data: DiagnosticPreparation }>(
      `/diagnostic-packages/${id}/preparations/${preparationId}`,
      payload
    ),
  deletePreparation: (id: number, preparationId: number) =>
    api.delete<{ data: { preparation_id: number; deleted: boolean } }>(
      `/diagnostic-packages/${id}/preparations/${preparationId}`
    ),
  assignTestGroups: (id: number, payload: { group_ids: number[] }) =>
    api.post<{ data: AssignGroupsToPackageResponse }>(`/diagnostic-packages/${id}/test-groups`, payload),
  reorderTestGroups: (id: number, payload: { group_ids: number[] }) =>
    api.patch<{ data: ReorderPackageGroupsResponse }>(`/diagnostic-packages/${id}/test-groups/order`, payload),
  removeTestGroup: (id: number, groupId: number) =>
    api.delete(`/diagnostic-packages/${id}/test-groups/${groupId}`),
};

export const diagnosticFilterChipsApi = {
  list: (forScope: DiagnosticFilterChipFor = "public_package") =>
    api.get<{ data: DiagnosticFilterChip[] }>("/diagnostic-packages/filters-chips", {
      params: { for: forScope },
    }),
  create: (payload: {
    display_name: string;
    chip_key: string;
    display_order?: number;
    chip_for?: DiagnosticFilterChipFor;
  }) => api.post<{ data: DiagnosticFilterChip }>("/diagnostic-packages/filters-chips", payload),
  update: (
    filterChipId: number,
    payload: {
      display_name?: string;
      chip_key?: string;
      display_order?: number;
      status?: string;
      chip_for?: DiagnosticFilterChipFor;
    }
  ) => api.put<{ data: DiagnosticFilterChip }>(`/diagnostic-packages/filters-chips/${filterChipId}`, payload),
  delete: (filterChipId: number) =>
    api.delete<{ data: { filter_chip_id: number; deleted: boolean } }>(
      `/diagnostic-packages/filters-chips/${filterChipId}`
    ),
};

export type HealthParameterType = "test" | "metric";

export interface DiagnosticTestStandalone {
  test_id: number;
  parameter_type: HealthParameterType;
  test_name: string;
  external_parameter_id?: number | null;
  parameter_key?: string | null;
  unit?: string | null;
  meaning?: string | null;
  low_risk_lower_range_male?: number | null;
  low_risk_higher_range_male?: number | null;
  moderate_risk_lower_range_male?: number | null;
  moderate_risk_higher_range_male?: number | null;
  high_risk_lower_range_male?: number | null;
  high_risk_higher_range_male?: number | null;
  low_risk_lower_range_female?: number | null;
  low_risk_higher_range_female?: number | null;
  moderate_risk_lower_range_female?: number | null;
  moderate_risk_higher_range_female?: number | null;
  high_risk_lower_range_female?: number | null;
  high_risk_higher_range_female?: number | null;
  causes_when_high?: string | null;
  causes_when_low?: string | null;
  effects_when_high?: string | null;
  effects_when_low?: string | null;
  what_to_do_when_low?: string | null;
  what_to_do_when_high?: string | null;
  is_available: boolean;
  display_order?: number | null;
  price?: number | null;
  original_price?: number | null;
  is_most_popular?: boolean | null;
  gender_suitability?: string | null;
}

export interface DiagnosticTestGroupStandalone {
  group_id: number;
  group_name: string;
  group_key: string;
  display_order?: number | null;
  test_count: number;
  price?: number | null;
  discount?: string | null;
  original_price?: number | null;
  is_most_popular?: boolean | null;
  gender_suitability?: string | null;
  package_for?: "public" | "camp" | null;
  tests?: DiagnosticTestStandalone[];
  filter_chips?: PackageFilterChip[];
}

export interface AssignTestsToGroupResponse {
  group_id: number;
  added_test_ids: number[];
  skipped_test_ids: number[];
}

export interface ReorderGroupTestsResponse {
  group_id: number;
  test_ids: number[];
}

export interface AssignGroupsToPackageResponse {
  diagnostic_package_id: number;
  added_group_ids: number[];
  skipped_group_ids: number[];
}

export interface ReorderPackageGroupsResponse {
  diagnostic_package_id: number;
  group_ids: number[];
}

export interface PackageTestsResponse {
  diagnostic_package_id: number;
  groups: DiagnosticTestGroupStandalone[];
}

export type HealthParameterCreatePayload = {
  parameter_type: HealthParameterType;
  test_name: string;
  external_parameter_id?: number | null;
  parameter_key?: string | null;
  unit?: string | null;
  meaning?: string | null;
  low_risk_lower_range_male?: number | null;
  low_risk_higher_range_male?: number | null;
  moderate_risk_lower_range_male?: number | null;
  moderate_risk_higher_range_male?: number | null;
  high_risk_lower_range_male?: number | null;
  high_risk_higher_range_male?: number | null;
  low_risk_lower_range_female?: number | null;
  low_risk_higher_range_female?: number | null;
  moderate_risk_lower_range_female?: number | null;
  moderate_risk_higher_range_female?: number | null;
  high_risk_lower_range_female?: number | null;
  high_risk_higher_range_female?: number | null;
  causes_when_high?: string | null;
  causes_when_low?: string | null;
  effects_when_high?: string | null;
  effects_when_low?: string | null;
  what_to_do_when_low?: string | null;
  what_to_do_when_high?: string | null;
  is_available?: boolean;
  display_order?: number;
  price?: number | null;
  original_price?: number | null;
  is_most_popular?: boolean | null;
  gender_suitability?: string | null;
};

export type HealthParameterUpdatePayload = {
  test_name?: string;
  external_parameter_id?: number | null;
  parameter_key?: string | null;
  unit?: string | null;
  meaning?: string | null;
  low_risk_lower_range_male?: number | null;
  low_risk_higher_range_male?: number | null;
  moderate_risk_lower_range_male?: number | null;
  moderate_risk_higher_range_male?: number | null;
  high_risk_lower_range_male?: number | null;
  high_risk_higher_range_male?: number | null;
  low_risk_lower_range_female?: number | null;
  low_risk_higher_range_female?: number | null;
  moderate_risk_lower_range_female?: number | null;
  moderate_risk_higher_range_female?: number | null;
  high_risk_lower_range_female?: number | null;
  high_risk_higher_range_female?: number | null;
  causes_when_high?: string | null;
  causes_when_low?: string | null;
  effects_when_high?: string | null;
  effects_when_low?: string | null;
  what_to_do_when_low?: string | null;
  what_to_do_when_high?: string | null;
  is_available?: boolean;
  display_order?: number;
  price?: number | null;
  original_price?: number | null;
  is_most_popular?: boolean | null;
  gender_suitability?: string | null;
};

export const diagnosticTestsApi = {
  list: (params?: { parameter_type?: HealthParameterType }) =>
    api.get<{ data: DiagnosticTestStandalone[] }>("/diagnostics/health-parameters", {
      params:
        params?.parameter_type !== undefined
          ? { parameter_type: params.parameter_type }
          : undefined,
    }),
  get: (testId: number) =>
    api.get<{ data: DiagnosticTestStandalone }>(`/diagnostics/health-parameters/${testId}`),
  create: (payload: HealthParameterCreatePayload) =>
    api.post<{ data: DiagnosticTestStandalone }>("/diagnostics/health-parameters", payload),
  update: (testId: number, payload: HealthParameterUpdatePayload) =>
    api.put<{ data: DiagnosticTestStandalone }>(`/diagnostics/health-parameters/${testId}`, payload),
  delete: (testId: number) =>
    api.delete<{ data: { deleted: boolean } }>(`/diagnostics/health-parameters/${testId}`),
};

export const diagnosticTestGroupsApi = {
  list: (params?: { filter_chip?: string; package_for?: string }) =>
    api.get<{ data: DiagnosticTestGroupStandalone[] }>("/diagnostic-test-groups", { params }),
  get: (groupId: number) =>
    api.get<{ data: DiagnosticTestGroupStandalone }>(`/diagnostic-test-groups/${groupId}`),
  create: (payload: {
    group_name: string;
    group_key: string;
    display_order?: number;
    price?: number | null;
    original_price?: number | null;
    is_most_popular?: boolean | null;
    gender_suitability?: string | null;
    package_for?: "public" | "camp" | null;
  }) => api.post<{ data: DiagnosticTestGroupStandalone }>("/diagnostic-test-groups", payload),
  update: (
    groupId: number,
    payload: {
      group_name?: string;
      group_key?: string;
      display_order?: number;
      price?: number | null;
      original_price?: number | null;
      is_most_popular?: boolean | null;
      gender_suitability?: string | null;
      package_for?: "public" | "camp" | null;
    }
  ) => api.put<{ data: DiagnosticTestGroupStandalone }>(`/diagnostic-test-groups/${groupId}`, payload),
  delete: (groupId: number) => api.delete(`/diagnostic-test-groups/${groupId}`),
  getTests: (groupId: number) =>
    api.get<{ data: DiagnosticTestStandalone[] }>(`/diagnostic-test-groups/${groupId}/tests`),
  assignTests: (groupId: number, payload: { test_ids: number[] }) =>
    api.post<{ data: AssignTestsToGroupResponse }>(`/diagnostic-test-groups/${groupId}/tests`, payload),
  reorderTests: (groupId: number, payload: { test_ids: number[] }) =>
    api.patch<{ data: ReorderGroupTestsResponse }>(`/diagnostic-test-groups/${groupId}/tests/order`, payload),
  removeTest: (groupId: number, testId: number) =>
    api.delete(`/diagnostic-test-groups/${groupId}/tests/${testId}`),
  addFilterChip: (groupId: number, payload: { filter_chip_id: number; display_order?: number }) =>
    api.post<{ data: PackageFilterChip }>(`/diagnostic-test-groups/${groupId}/filter-chips`, payload),
  removeFilterChip: (groupId: number, filterChipId: number) =>
    api.delete<{ data: { filter_chip_id: number; deleted: boolean } }>(
      `/diagnostic-test-groups/${groupId}/filter-chips/${filterChipId}`
    ),
};

// Healthians integration
export interface HealthiansConstituent {
  id: string;
  name: string;
}

export interface HealthiansConstituentsResponse {
  constituents: HealthiansConstituent[];
  package_name?: string | null;
}

export const healthiansApi = {
  getConstituents: (external_package_id: number) =>
    api.post<{ data: HealthiansConstituentsResponse }>(
      "/diagnostics/healthians/constituents",
      { external_package_id }
    ),
};

// Payments / bookings (employee)
export interface BookingListItem {
  booking_id: number;
  user_id: number;
  user_name: string;
  entity_type: string;
  entity_name: string;
  amount_paise: number;
  currency: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  booked_at: string;
  /** Present when this booking is linked to a Razorpay order */
  order_id?: number | null;
  razorpay_order_id?: string | null;
  order_amount_paise?: number | null;
  checkout_line_count?: number | null;
  /** Razorpay order payer (who paid); null if no order row */
  payer_user_id?: number | null;
  payer_user_name?: string | null;
}

export interface BookingCheckoutLine {
  booking_id: number;
  user_id: number;
  user_name: string;
  entity_name: string;
  amount_paise: number;
  amount_rupees: number;
  booking_status: string;
}

export interface BookingCheckoutSummary {
  order_id: number;
  razorpay_order_id: string;
  order_amount_paise: number;
  order_amount_rupees: number;
  checkout_line_count: number;
  payer_user_id: number;
  payer_user_name: string;
  lines: BookingCheckoutLine[];
}

export interface BookingDetail {
  booking_id: number;
  user_id: number;
  user_name: string;
  entity_type: string;
  entity_name: string;
  amount_paise: number;
  currency: string;
  booking_status: string;
  payment_status: string | null;
  payment_method: string | null;
  razorpay_payment_id: string | null;
  signature_verified: boolean | null;
  failure_reason: string | null;
  paid_at: string | null;
  booked_at: string;
  /** Employee views only: same checkout (multi-line) context */
  checkout?: BookingCheckoutSummary | null;
}

export const paymentsApi = {
  listBookings: (params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    sort_key?: string;
    sort_dir?: "asc" | "desc";
  }) =>
    api.get<{ data: { items: BookingListItem[]; total: number }; meta: Record<string, unknown> }>(
      "/payments/bookings",
      { params }
    ),

  getBooking: (bookingId: number) =>
    api.get<BookingDetail>(`/payments/booking/${bookingId}/status`),
};

// Checklist templates & tasks (extends ChecklistReadiness above)
export interface ChecklistTemplateItem {
  item_id: number;
  template_id: number;
  title: string;
  description?: string | null;
  display_order?: number | null;
}

export interface ChecklistTemplate {
  template_id: number;
  name: string;
  description?: string | null;
  status: string;
  audience?: "internal" | "user";
  created_at: string;
  created_employee_id?: number | null;
}

export interface ChecklistTemplateDetail extends ChecklistTemplate {
  items: ChecklistTemplateItem[];
}

export interface ChecklistTask {
  task_id: number;
  checklist_id: number;
  item_id: number;
  item_title: string;
  item_description?: string | null;
  assigned_employee_id?: number | null;
  status: string;
  notes?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  completed_by_employee_id?: number | null;
}

export interface EngagementChecklist {
  checklist_id: number;
  engagement_id: number;
  template_id: number;
  template_name: string;
  created_at: string;
  readiness: ChecklistReadiness;
  tasks: ChecklistTask[];
}

export interface MyTask extends ChecklistTask {
  engagement_id: number;
  engagement_name?: string | null;
}

export const checklistTemplatesApi = {
  list: () => api.get<{ data: ChecklistTemplate[]; meta: Record<string, unknown> }>("/checklist-templates"),
  get: (id: number) =>
    api.get<{ data: ChecklistTemplateDetail; meta: Record<string, unknown> }>(`/checklist-templates/${id}`),
  create: (body: { name: string; description?: string; audience?: "internal" | "user" }) =>
    api.post<{ data: ChecklistTemplate; meta: Record<string, unknown> }>("/checklist-templates", body),
  update: (id: number, body: { name?: string; description?: string; audience?: "internal" | "user" }) =>
    api.put<{ data: ChecklistTemplate; meta: Record<string, unknown> }>(`/checklist-templates/${id}`, body),
  updateStatus: (id: number, body: { status: string }) =>
    api.patch(`/checklist-templates/${id}/status`, body),
  addItem: (
    templateId: number,
    body: { title: string; description?: string; display_order?: number }
  ) =>
    api.post<{ data: ChecklistTemplateItem; meta: Record<string, unknown> }>(
      `/checklist-templates/${templateId}/items`,
      body
    ),
  updateItem: (
    templateId: number,
    itemId: number,
    body: { title?: string; description?: string; display_order?: number }
  ) =>
    api.put<{ data: ChecklistTemplateItem; meta: Record<string, unknown> }>(
      `/checklist-templates/${templateId}/items/${itemId}`,
      body
    ),
  deleteItem: (templateId: number, itemId: number) =>
    api.delete(`/checklist-templates/${templateId}/items/${itemId}`),
};

export const engagementChecklistsApi = {
  list: (engagementId: number) =>
    api.get<{ data: EngagementChecklist[]; meta: Record<string, unknown> }>(
      `/engagements/${engagementId}/checklists`
    ),
  apply: (engagementId: number, body: { template_id: number }) =>
    api.post<{ data: EngagementChecklist; meta: Record<string, unknown> }>(
      `/engagements/${engagementId}/checklists`,
      body
    ),
  remove: (engagementId: number, checklistId: number) =>
    api.delete(`/engagements/${engagementId}/checklists/${checklistId}`),
  readiness: (engagementId: number) =>
    api.get<{ data: ChecklistReadiness; meta: Record<string, unknown> }>(
      `/engagements/${engagementId}/readiness`
    ),
};

export const checklistTasksApi = {
  assign: (taskId: number, body: { assigned_employee_id: number | null }) =>
    api.patch<{ data: ChecklistTask; meta: Record<string, unknown> }>(`/checklist/tasks/${taskId}/assign`, body),
  updateStatus: (taskId: number, body: { status: string; notes?: string }) =>
    api.patch<{ data: ChecklistTask; meta: Record<string, unknown> }>(`/checklist/tasks/${taskId}/status`, body),
  update: (taskId: number, body: { notes?: string | null; due_date?: string | null }) =>
    api.put<{ data: ChecklistTask; meta: Record<string, unknown> }>(`/checklist/tasks/${taskId}`, body),
  myTasks: (params?: { status?: string }) =>
    api.get<{ data: MyTask[]; meta: Record<string, unknown> }>("/checklist/my-tasks", { params }),
};

// Notifications
export interface NotificationRecipient {
  user_id: number;
  first_name: string | null;
  last_name: string | null;
}

export interface NotificationItem {
  notification_id: number;
  service_key: string;
  service_display_name?: string | null;
  status: "pending" | "sent" | "failed";
  channel: "email" | "whatsapp";
  user: { user_ids: number[] } | null;
  recipients?: NotificationRecipient[];
  engagement_id: number | null;
  engagement_name?: string | null;
  engagement_code?: string | null;
  assessment_instance_id: number | null;
  message: string | null;
  triggered_by_user_id: number | null;
  dispatched_at: string | null;
  completed_at: string | null;
}

export interface NotificationServiceItem {
  notification_service_id: number;
  service_key: string;
  display_name: string;
  channel: "email" | "whatsapp";
  webhook_path: string;
  is_active: boolean;
  require_blood_report_url: boolean;
  require_bio_ai_report_url: boolean;
  require_participant_detail: boolean;
  require_otp: boolean;
  created_at: string | null;
}

export const notificationsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    service_key?: string;
    channel?: string;
    user_id?: number;
    engagement_id?: number;
    dispatched_from?: string;
    dispatched_to?: string;
  }) =>
    api.get<{ data: NotificationItem[]; meta: { page: number; limit: number; total: number } }>(
      "/notifications",
      { params }
    ),
  dispatch: (body: {
    service_key: string;
    user_ids: number[];
    engagement_id: number | null;
    assessment_instance_id?: number | null;
    participant_details?: Record<string, string> | null;
    otp?: string | null;
  }) => api.post<{ data: { notification_id: number; status: string; message: string }; meta: Record<string, unknown> }>("/notifications/dispatch", body),

  prepareReports: (body: {
    user_id: number;
    require_blood_report_url: boolean;
    require_bio_ai_report_url: boolean;
  }) =>
    api.post<{
      data: {
        instances: ParticipantJourneyInstanceSummary[];
        prepare_details: Array<{
          assessment_instance_id: number;
          engagement_id: number;
          assessment_type_code: string;
          blood?: { status: string; message?: string };
          bio_ai?: { status: string; message?: string };
        }>;
      };
      meta: Record<string, unknown>;
    }>("/notifications/prepare-reports", body),

  listServices: () =>
    api.get<{ data: NotificationServiceItem[]; meta: Record<string, unknown> }>("/notifications/services"),
  createService: (body: {
    service_key: string;
    display_name: string;
    channel: string;
    webhook_path: string;
    is_active?: boolean;
    require_blood_report_url?: boolean;
    require_bio_ai_report_url?: boolean;
    require_participant_detail?: boolean;
    require_otp?: boolean;
  }) =>
    api.post<{ data: NotificationServiceItem; meta: Record<string, unknown> }>("/notifications/services", body),
  updateService: (
    id: number,
    body: {
      display_name?: string;
      channel?: string;
      webhook_path?: string;
      is_active?: boolean;
      require_blood_report_url?: boolean;
      require_bio_ai_report_url?: boolean;
      require_participant_detail?: boolean;
      require_otp?: boolean;
    }
  ) =>
    api.put<{ data: NotificationServiceItem; meta: Record<string, unknown> }>(
      `/notifications/services/${id}`,
      body
    ),
  delete: (notificationId: number) =>
    api.delete<{ data: { notification_id: number; deleted: boolean } }>(
      `/notifications/${notificationId}`
    ),
  deleteService: (notificationServiceId: number) =>
    api.delete<{ data: { notification_service_id: number; deleted: boolean } }>(
      `/notifications/services/${notificationServiceId}`
    ),
};

// Booking flow APIs
export const bookingApi = {
  getMyDrafts: () =>
    api.get<{
      data: {
        engagements: Array<{
          engagement_id: number;
          status: string;
          resume_step: "address" | "booking_date";
          address: string | null;
        }>;
      };
    }>("/book/me/drafts"),
  checkServiceAvailability: (payload: {
    members: Array<{
      user_id: number;
      house_flat_no: string;
      building_area: string;
      landmark?: string;
      city: string;
      pincode: string;
      diagnostic_package_id: number;
    }>;
  }) =>
    api.post<{ data: { members: Array<{ user_id: number; engagement_id?: number; status: string; message?: string; zone_id?: string }> } }>(
      "/book/check-service-availability",
      payload
    ),
  getAvailableSlots: (payload: {
    members: Array<{ user_id: number; engagement_id: number; blood_collection_date: string }>;
  }) =>
    api.post<{
      data: {
        members: Array<{
          user_id: number;
          engagement_id: number;
          status: string;
          slots?: Array<{
            end_time: string;
            slot_date: string;
            slot_time: string;
            stm_id: string;
          }>;
          message?: string;
        }>;
      };
    }>("/book/available-slots", payload),
  lockSlot: (payload: {
    members: Array<{
      user_id: number;
      engagement_id: number;
      blood_collection_date: string;
      blood_collection_time_slot_id: string;
      blood_collection_time_slot: string;
    }>;
  }) =>
    api.post<{ data: { members: Array<{ user_id: number; engagement_id: number; status: string; message?: string }> } }>(
      "/book/lock",
      payload
    ),
  pay: (payload: {
    members: Array<{ user_id: number; engagement_id: number }>;
  }) =>
    api.post<{
      data: {
        razorpay_order_id: string;
        amount_paise: number;
        amount_rupees: number;
        currency: string;
        key_id: string;
        booking_ids: number[];
        booking_id: number;
        members: Array<{ user_id: number; engagement_id: number; status: string }>;
      };
    }>("/book/pay", payload),
  bookBioAi: (payload: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) =>
    api.post<{
      data: {
        payment_verified: boolean;
        razorpay_order_id: string;
        razorpay_payment_id: string;
        booking_ids: number[];
        members: Array<{
          user_id: number;
          engagement_id: number;
          status: string;
          message?: string;
          booking_id?: string;
        }>;
      };
    }>("/book/bio-ai", payload),
  bookBloodTest: (payload: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) =>
    api.post<{
      data: {
        payment_verified: boolean;
        razorpay_order_id: string;
        razorpay_payment_id: string;
        booking_ids: number[];
        members: Array<{
          user_id: number;
          engagement_id: number;
          status: string;
          message?: string;
          booking_id?: string;
        }>;
      };
    }>("/book/blood-test", payload),
};
