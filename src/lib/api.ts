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
  profile_photo?: string | null;
}

export interface UserListItem {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  profile_photo?: string | null;
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
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UserCreate {
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
  package_id: number;
  package_code?: string | null;
  package_display_name?: string | null;
  engagement_id: number;
  engagement_name?: string | null;
  engagement_code?: string | null;
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

// Uploads
export const uploadsApi = {
  uploadUserProfilePhoto: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ data: { url: string } }>("/uploads/users/profile-photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  uploadOrganizationLogo: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ data: { url: string } }>("/uploads/organizations/logo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
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

// Checklists (readiness on engagement list + checklist APIs)
export interface ChecklistReadiness {
  done: number;
  total: number;
  percent: number;
}

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
  readiness?: ChecklistReadiness | null;
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

export interface AssessmentPackageCategory {
  id: number;
  category_id: number;
  category_key?: string | null;
  display_name?: string | null;
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

export interface QuestionnaireCategory {
  category_id: number;
  category_key: string;
  display_name: string;
  status?: string | null;
}

export interface QuestionnaireCategoryCreate {
  category_key: string;
  display_name: string;
}

export interface QuestionnaireCategoryUpdate {
  category_key: string;
  display_name: string;
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
};

export const questionnaireCategoriesApi = {
  list: (params?: { page?: number; limit?: number }) =>
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

export interface DiagnosticPackageListItem {
  diagnostic_package_id: number;
  package_name: string;
  diagnostic_provider?: string | null;
  no_of_tests?: number | null;
  report_duration_hours?: number | null;
  collection_type?: string | null;
  price?: number | null;
  original_price?: number | null;
  discount_percent?: number | null;
  is_most_popular?: boolean | null;
  gender_suitability?: string | null;
  status?: string | null;
  tags?: DiagnosticTag[];
}

export interface DiagnosticPackageDetail extends DiagnosticPackageListItem {
  about_text?: string | null;
  bookings_count?: number | null;
  reasons?: DiagnosticReason[];
  samples?: DiagnosticSample[];
  preparations?: DiagnosticPreparation[];
}

export interface DiagnosticPackageCreate {
  package_name: string;
  diagnostic_provider?: string | null;
  no_of_tests?: number | null;
  report_duration_hours?: number | null;
  collection_type?: string | null;
  about_text?: string | null;
  bookings_count?: number | null;
  price?: number | null;
  original_price?: number | null;
  is_most_popular?: boolean | null;
  gender_suitability?: string | null;
}

export interface DiagnosticFilter {
  filter_id: number;
  filter_key: string;
  display_name: string;
  display_order?: number | null;
  filter_type?: string | null;
  status?: string | null;
}

export const diagnosticPackagesApi = {
  list: (params?: { gender?: string; tag?: string }) =>
    api.get<{ data: DiagnosticPackageListItem[] }>("/diagnostic-packages", { params }),
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
    payload: { test_name: string; is_available?: boolean; display_order?: number }
  ) =>
    api.post<{ data: DiagnosticTest }>(
      `/diagnostic-packages/${id}/test-groups/${groupId}/tests`,
      payload
    ),
  updateTest: (
    id: number,
    groupId: number,
    testId: number,
    payload: { test_name?: string; is_available?: boolean; display_order?: number }
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

export const diagnosticFiltersApi = {
  list: () => api.get<{ data: DiagnosticFilter[] }>("/diagnostic-packages/filters"),
  create: (payload: {
    display_name: string;
    filter_key: string;
    filter_type?: string;
    display_order?: number;
  }) => api.post<{ data: DiagnosticFilter }>("/diagnostic-packages/filters", payload),
  update: (
    filterId: number,
    payload: {
      display_name?: string;
      filter_key?: string;
      filter_type?: string;
      display_order?: number;
      status?: string;
    }
  ) => api.put<{ data: DiagnosticFilter }>(`/diagnostic-packages/filters/${filterId}`, payload),
  delete: (filterId: number) =>
    api.delete<{ data: { filter_id: number; deleted: boolean } }>(`/diagnostic-packages/filters/${filterId}`),
};

export interface DiagnosticTestStandalone {
  test_id: number;
  test_name: string;
  is_available: boolean;
  display_order?: number | null;
}

export interface DiagnosticTestGroupStandalone {
  group_id: number;
  group_name: string;
  display_order?: number | null;
  test_count: number;
  tests?: DiagnosticTestStandalone[];
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

export const diagnosticTestsApi = {
  list: () => api.get<{ data: DiagnosticTestStandalone[] }>("/diagnostic-tests"),
  get: (testId: number) =>
    api.get<{ data: DiagnosticTestStandalone }>(`/diagnostic-tests/${testId}`),
  create: (payload: { test_name: string; is_available?: boolean; display_order?: number }) =>
    api.post<{ data: DiagnosticTestStandalone }>("/diagnostic-tests", payload),
  update: (
    testId: number,
    payload: { test_name?: string; is_available?: boolean; display_order?: number }
  ) => api.put<{ data: DiagnosticTestStandalone }>(`/diagnostic-tests/${testId}`, payload),
  delete: (testId: number) => api.delete(`/diagnostic-tests/${testId}`),
};

export const diagnosticTestGroupsApi = {
  list: () => api.get<{ data: DiagnosticTestGroupStandalone[] }>("/diagnostic-test-groups"),
  get: (groupId: number) =>
    api.get<{ data: DiagnosticTestGroupStandalone }>(`/diagnostic-test-groups/${groupId}`),
  create: (payload: { group_name: string; display_order?: number }) =>
    api.post<{ data: DiagnosticTestGroupStandalone }>("/diagnostic-test-groups", payload),
  update: (groupId: number, payload: { group_name?: string; display_order?: number }) =>
    api.put<{ data: DiagnosticTestGroupStandalone }>(`/diagnostic-test-groups/${groupId}`, payload),
  delete: (groupId: number) => api.delete(`/diagnostic-test-groups/${groupId}`),
  getTests: (groupId: number) =>
    api.get<{ data: DiagnosticTestStandalone[] }>(`/diagnostic-test-groups/${groupId}/tests`),
  assignTests: (groupId: number, payload: { test_ids: number[] }) =>
    api.post<{ data: AssignTestsToGroupResponse }>(`/diagnostic-test-groups/${groupId}/tests`, payload),
  reorderTests: (groupId: number, payload: { test_ids: number[] }) =>
    api.patch<{ data: ReorderGroupTestsResponse }>(`/diagnostic-test-groups/${groupId}/tests/order`, payload),
  removeTest: (groupId: number, testId: number) =>
    api.delete(`/diagnostic-test-groups/${groupId}/tests/${testId}`),
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
  create: (body: { name: string; description?: string }) =>
    api.post<{ data: ChecklistTemplate; meta: Record<string, unknown> }>("/checklist-templates", body),
  update: (id: number, body: { name?: string; description?: string }) =>
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
