import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { Search, Plus, Loader2, Users, X } from "lucide-react";
import { DataTable, type Column } from "../../shared/ui/DataTable";
import { Modal } from "../../shared/ui/Modal";
import { ParticipantsModal } from "../../shared/ui/ParticipantsModal";
import { OrganizationEngagementsModal } from "../../shared/ui/OrganizationEngagementsModal";
import { ManageReportSectionsModal } from "../../shared/ui/ManageReportSectionsModal";
import { CampEngagementsModal } from "../../shared/ui/CampEngagementsModal";
import { CampDepartmentsModal } from "../../shared/ui/CampDepartmentsModal";
import { CampReportInitMenu } from "../../shared/ui/CampReportInitMenu";
import {
  organizationsApi,
  employeesApi,
  uploadsApi,
  campReportsApi,
  type EmployeeListItem,
  type UserListItem,
  type OrganizationListItem,
  type Organization,
  type OrganizationCreate,
  type CampListItem,
  getApiError,
} from "../../lib/api";

const STATUS_OPTIONS = ["active", "inactive", "archived"];

type TabKey = "organizations" | "camps";
const TAB_KEYS: TabKey[] = ["organizations", "camps"];

export function Organisations() {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const activeTab: TabKey = TAB_KEYS.includes(tabParam as TabKey) ? (tabParam as TabKey) : "organizations";

  const [data, setData] = useState<OrganizationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string>("organization_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "add" | "edit">("view");
  const [selected, setSelected] = useState<Organization | null>(null);
  const [formData, setFormData] = useState<OrganizationCreate>({
    name: "",
    organization_type: "",
    logo: "",
    website_url: "",
    address: "",
    pin_code: "",
    city: "",
    state: "",
    country: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    contact_designation: "",
    bd_employee_id: undefined,
  });
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [usersById, setUsersById] = useState<Record<number, UserListItem>>({});
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OrganizationListItem | null>(null);

  const [participantsOrg, setParticipantsOrg] = useState<{
    orgId: number;
    orgName?: string;
  } | null>(null);
  const [engagementsOrg, setEngagementsOrg] = useState<{
    orgId: number;
    orgName?: string;
  } | null>(null);

  const [createEngagementPromptOpen, setCreateEngagementPromptOpen] = useState(false);
  const [createdOrgForEngagement, setCreatedOrgForEngagement] = useState<{
    organization_id: number;
    orgName?: string;
    city?: string;
  } | null>(null);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);
  const [departmentInput, setDepartmentInput] = useState("");

  const [campsData, setCampsData] = useState<CampListItem[]>([]);
  const [campsTotal, setCampsTotal] = useState(0);
  const [campsPage, setCampsPage] = useState(1);
  const [campsLimit] = useState(10);
  const [campsSearch, setCampsSearch] = useState("");
  const [campsSortKey, setCampsSortKey] = useState<string>("camp_no");
  const [campsSortDir, setCampsSortDir] = useState<"asc" | "desc">("desc");
  const [campsLoading, setCampsLoading] = useState(false);
  const [campsError, setCampsError] = useState<string | null>(null);
  const [selectedCamp, setSelectedCamp] = useState<CampListItem | null>(null);
  const [campViewOpen, setCampViewOpen] = useState(false);
  const [reportSectionsOpen, setReportSectionsOpen] = useState(false);
  const [campEngagements, setCampEngagements] = useState<{
    campNo: number;
    campName?: string;
    orgName?: string;
  } | null>(null);
  const [campDepartments, setCampDepartments] = useState<CampListItem | null>(null);
  const [campReportDeleteConfirm, setCampReportDeleteConfirm] = useState<CampListItem | null>(null);
  const [campActionMessage, setCampActionMessage] = useState<string | null>(null);
  const [campActionError, setCampActionError] = useState<string | null>(null);
  const [campReportDeleting, setCampReportDeleting] = useState(false);

  useEffect(() => {
    if (tabParam !== activeTab) {
      navigate(`/organisations/${activeTab}`, { replace: true });
    }
  }, [activeTab, navigate, tabParam]);

  useEffect(() => {
    organizationsApi
      .filterOptions()
      .then((res) => {
        setCityOptions(res.data.data.cities);
        setCountryOptions(res.data.data.countries);
      })
      .catch(() => {
        setCityOptions([]);
        setCountryOptions([]);
      });
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await organizationsApi.list({
        page,
        limit,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        city: cityFilter || undefined,
        country: countryFilter || undefined,
        sort_by: sortKey,
        sort_dir: sortDir,
      });
      setData(res.data.data);
      setTotal(res.data.meta.total);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, search, cityFilter, countryFilter, sortKey, sortDir]);

  const fetchCamps = useCallback(async () => {
    setCampsLoading(true);
    setCampsError(null);
    try {
      const res = await organizationsApi.listCamps({
        page: campsPage,
        limit: campsLimit,
        search: campsSearch.trim() || undefined,
        sort_by: campsSortKey,
        sort_dir: campsSortDir,
      });
      const rows = res.data.data;
      setCampsData(rows);
      setCampsTotal(res.data.meta.total);
      setSelectedCamp((curr) => {
        if (!curr) return curr;
        return rows.find((c) => c.camp_no === curr.camp_no) ?? curr;
      });
    } catch (err) {
      setCampsError(getApiError(err));
    } finally {
      setCampsLoading(false);
    }
  }, [campsPage, campsLimit, campsSearch, campsSortKey, campsSortDir]);

  const fetchEmployees = useCallback(async () => {
    setEmployeeLoading(true);
    setError(null);
    try {
      const employeeRes = await employeesApi.list({ status: "active", limit: 100, page: 1 });
      const list = employeeRes.data.data;
      setEmployees(list);
      const usersIndex = list.reduce<Record<number, UserListItem>>((acc, emp) => {
        if (emp.user_id) {
          acc[emp.user_id] = {
            user_id: emp.user_id,
            first_name: emp.first_name,
            last_name: emp.last_name,
          } as UserListItem;
        }
        return acc;
      }, {});
      setUsersById(usersIndex);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setEmployeeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "organizations") {
      fetchList();
    }
  }, [activeTab, fetchList]);

  useEffect(() => {
    if (activeTab === "camps") {
      fetchCamps();
    }
  }, [activeTab, fetchCamps]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, cityFilter, countryFilter]);

  useEffect(() => {
    setCampsPage(1);
  }, [campsSearch]);

  const addDepartmentName = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    setDepartmentNames((prev) => {
      const exists = prev.some((d) => d.toLowerCase() === name.toLowerCase());
      if (exists) return prev;
      return [...prev, name];
    });
    setDepartmentInput("");
  };

  const removeDepartmentName = (name: string) => {
    setDepartmentNames((prev) => prev.filter((d) => d !== name));
  };

  const handleDepartmentInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDepartmentName(departmentInput);
    } else if (e.key === "Backspace" && !departmentInput && departmentNames.length > 0) {
      setDepartmentNames((prev) => prev.slice(0, -1));
    }
  };

  const buildOrganizationPayload = (): OrganizationCreate => ({
    ...formData,
    departments:
      departmentNames.length > 0
        ? departmentNames.map((department) => ({ department }))
        : null,
  });

  const openView = (row: OrganizationListItem) => {
    organizationsApi.get(row.organization_id).then((res) => {
      setSelected(res.data.data);
      setModalMode("view");
      setModalOpen(true);
    }).catch((err) => setError(getApiError(err)));
  };

  const openAdd = () => {
    setSelected(null);
    setFormData({
      name: "",
      organization_type: "",
      logo: "",
      website_url: "",
      address: "",
      pin_code: "",
      city: "",
      state: "",
      country: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      contact_designation: "",
      bd_employee_id: undefined,
    });
    setDepartmentNames([]);
    setDepartmentInput("");
    setModalMode("add");
    setModalOpen(true);
    fetchEmployees();
  };

  const openEdit = (row: OrganizationListItem) => {
    organizationsApi.get(row.organization_id).then((res) => {
      const o = res.data.data;
      setSelected(o);
      setFormData({
        name: o.name ?? "",
        organization_type: o.organization_type ?? "",
        logo: o.logo ?? "",
        website_url: o.website_url ?? "",
        address: o.address ?? "",
        pin_code: o.pin_code ?? "",
        city: o.city ?? "",
        state: o.state ?? "",
        country: o.country ?? "",
        contact_name: o.contact_name ?? "",
        contact_email: o.contact_email ?? "",
        contact_phone: o.contact_phone ?? "",
        contact_designation: o.contact_designation ?? "",
        bd_employee_id: o.bd_employee_id ?? undefined,
      });
      setDepartmentNames((o.departments ?? []).map((d) => d.department));
      setDepartmentInput("");
      setModalMode("edit");
      setModalOpen(true);
      fetchEmployees();
    }).catch((err) => setError(getApiError(err)));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    setSubmitting(true);
    try {
      const payload = buildOrganizationPayload();
      let createdOrganizationId: number | null = null;
      if (modalMode === "add") {
        const created = await organizationsApi.create(payload);
        createdOrganizationId = created.data.data.organization_id;
      } else if (selected) {
        await organizationsApi.update(selected.organization_id, payload);
      }
      if (modalMode === "add") {
        setModalOpen(false);
        fetchList();
        if (createdOrganizationId != null) {
          setCreatedOrgForEngagement({
            organization_id: createdOrganizationId,
            orgName: formData.name,
            city: (formData.city ?? "").trim() || undefined,
          });
          setCreateEngagementPromptOpen(true);
        }
      } else {
        setModalOpen(false);
        fetchList();
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: OrganizationListItem) => {
    if (!deleteConfirm || deleteConfirm.organization_id !== row.organization_id) return;
    setSubmitting(true);
    try {
      await organizationsApi.updateStatus(row.organization_id, "archived");
      setDeleteConfirm(null);
      fetchList();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogoUpload = async (file?: File) => {
    if (!file) return;
    setLogoUploading(true);
    setError(null);
    try {
      const res = await uploadsApi.uploadOrganizationLogo(file);
      setFormData((prev) => ({ ...prev, logo: res.data.data.url }));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLogoUploading(false);
    }
  };

  const columns: Column<OrganizationListItem>[] = [
    { key: "name", label: "Name", sortable: true },
    { key: "organization_type", label: "Type", sortable: true, hideOnMobile: true },
    { key: "city", label: "City", sortable: true, hideOnMobile: true },
    { key: "country", label: "Country", sortable: true, hideOnTablet: true },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => {
        const isActive = (row.status ?? "").toLowerCase() === "active";
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const nextStatus = isActive ? "inactive" : "active";
              organizationsApi
                .updateStatus(row.organization_id, nextStatus)
                .then(() => fetchList())
                .catch((err) => setError(getApiError(err)));
            }}
            className={`inline-flex items-center w-12 h-6 rounded-full transition ${
              isActive ? "bg-emerald-500" : "bg-zinc-300"
            }`}
            aria-pressed={isActive}
            aria-label={`Set ${row.name ?? "organization"} ${isActive ? "inactive" : "active"}`}
          >
            <span
              className={`h-5 w-5 bg-white rounded-full shadow transform transition translate-x-0.5 ${
                isActive ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        );
      },
    },
  ];

  const handleSort = (key: string) => {
    setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
    setPage(1);
  };

  const handleCampsSort = (key: string) => {
    setCampsSortDir((d) => (campsSortKey === key ? (d === "asc" ? "desc" : "asc") : "asc"));
    setCampsSortKey(key);
    setCampsPage(1);
  };

  const openCampView = (row: CampListItem) => {
    setSelectedCamp(row);
    setCampViewOpen(true);
  };

  const openCampEngagements = (row: CampListItem) => {
    setCampEngagements({
      campNo: row.camp_no,
      campName: row.camp_name,
      orgName: row.organization_name,
    });
  };

  const openCampDepartments = (row: CampListItem) => {
    setCampDepartments(row);
  };

  const handleCampReportFeedback = (message: string, isError = false) => {
    if (isError) {
      setCampActionError(message);
      setCampActionMessage(null);
    } else {
      setCampActionMessage(message);
      setCampActionError(null);
      fetchCamps();
    }
  };

  const handleDeleteCampReports = async (row: CampListItem) => {
    setCampReportDeleting(true);
    setCampActionError(null);
    try {
      const orgRes = await organizationsApi.get(row.organization_id);
      const slugs = (orgRes.data.data.departments ?? []).map((d) => d.slug);
      const results = await Promise.allSettled([
        campReportsApi.deleteCamp(row.camp_no),
        ...slugs.map((slug) => campReportsApi.deleteDepartment(row.camp_no, slug)),
      ]);
      const hardFailures = results.filter((r) => {
        if (r.status === "fulfilled") return false;
        if (axios.isAxiosError(r.reason) && r.reason.response?.status === 404) return false;
        return true;
      });
      if (hardFailures.length > 0) {
        const first = hardFailures[0];
        setCampActionError(
          first.status === "rejected" ? getApiError(first.reason) : "Failed to delete camp reports"
        );
      } else {
        setCampActionMessage("Camp reports deleted successfully");
        setCampReportDeleteConfirm(null);
        fetchCamps();
      }
    } catch (err) {
      setCampActionError(getApiError(err));
    } finally {
      setCampReportDeleting(false);
    }
  };

  const campColumns: Column<CampListItem>[] = [
    { key: "camp_no", label: "Camp No", sortable: true },
    { key: "camp_name", label: "Camp name", sortable: true },
    {
      key: "engagement_count",
      label: "No of engagements",
      sortable: true,
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openCampEngagements(row);
          }}
          className="text-zinc-900 hover:underline font-medium"
        >
          {row.engagement_count}
        </button>
      ),
    },
    {
      key: "department_count",
      label: "No of departments",
      sortable: true,
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openCampDepartments(row);
          }}
          className="text-zinc-900 hover:underline font-medium"
        >
          {row.department_count}
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900">Organisations</h1>
        {activeTab === "organizations" && (
          <button
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Organisation</span>
          </button>
        )}
        {activeTab === "camps" && (
          <button
            onClick={() => setReportSectionsOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
          >
            <span className="hidden sm:inline">Manage Report Sections</span>
            <span className="sm:hidden">Sections</span>
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-5 border-b border-zinc-200">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            onClick={() => navigate(`/organisations/${tab}`)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === tab
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab === "organizations" ? "Organizations" : "Camps"}
          </button>
        ))}
      </div>

      {activeTab === "organizations" && (
        <>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="search"
            placeholder="Search by name, city, country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>
        <div className="flex flex-row gap-3 flex-wrap sm:flex-nowrap">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All cities</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All countries</option>
            {countryOptions.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-auto px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={data}
            keyExtractor={(r) => r.organization_id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onView={openView}
            onEdit={openEdit}
            onParticipants={(r) =>
              setParticipantsOrg({ orgId: r.organization_id, orgName: r.name ?? undefined })
            }
            onDelete={(r) => setDeleteConfirm(r)}
            pagination={{
              page,
              limit,
              total,
              onPageChange: setPage,
            }}
          />
        )}
      </div>
        </>
      )}

      {activeTab === "camps" && (
        <div>
          {campsError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              {campsError}
            </div>
          )}
          {campActionMessage && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm">
              {campActionMessage}
            </div>
          )}
          {campActionError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              {campActionError}
            </div>
          )}

          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="search"
                placeholder="Search by camp no or organisation name..."
                value={campsSearch}
                onChange={(e) => setCampsSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            {campsLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
              </div>
            ) : (
              <DataTable
                columns={campColumns}
                data={campsData}
                keyExtractor={(r) => r.camp_no}
                sortKey={campsSortKey}
                sortDir={campsSortDir}
                onSort={handleCampsSort}
                onView={openCampView}
                onViewEngagements={openCampEngagements}
                onViewDepartments={openCampDepartments}
                onDelete={(r) => setCampReportDeleteConfirm(r)}
                onDeleteLabel="Delete Camp Report"
                canDelete={(r) => r.report_count > 0}
                renderExtraMenuItems={(row, closeMenu) =>
                  row.report_count === 0 ? (
                    <CampReportInitMenu
                      campNo={row.camp_no}
                      organizationId={row.organization_id}
                      variant="menu"
                      onClose={closeMenu}
                      onFeedback={handleCampReportFeedback}
                      onInitialized={fetchCamps}
                    />
                  ) : null
                }
                pagination={{
                  page: campsPage,
                  limit: campsLimit,
                  total: campsTotal,
                  onPageChange: setCampsPage,
                }}
              />
            )}
          </div>
        </div>
      )}

      <Modal
        open={campViewOpen}
        onClose={() => {
          setCampViewOpen(false);
          setSelectedCamp(null);
        }}
        title="View Camp"
        maxWidthClassName="max-w-md"
      >
        {selectedCamp && (
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-zinc-500">Camp No:</span> {selectedCamp.camp_no}
            </div>
            <div>
              <span className="text-zinc-500">Camp name:</span> {selectedCamp.camp_name}
            </div>
            <div>
              <span className="text-zinc-500">Organisation:</span> {selectedCamp.organization_name}
            </div>
            <div>
              <span className="text-zinc-500">No of engagements:</span> {selectedCamp.engagement_count}
            </div>
            <div>
              <span className="text-zinc-500">No of departments:</span> {selectedCamp.department_count}
            </div>
            {selectedCamp.report_count === 0 && (
              <div className="pt-2">
                <CampReportInitMenu
                  campNo={selectedCamp.camp_no}
                  organizationId={selectedCamp.organization_id}
                  onFeedback={handleCampReportFeedback}
                  onInitialized={fetchCamps}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          modalMode === "add"
            ? "Add Organisation"
            : modalMode === "edit"
            ? "Edit Organisation"
            : "View Organisation"
        }
        maxWidthClassName={modalMode === "view" ? "max-w-xl" : "max-w-3xl"}
      >
        {modalMode === "view" && selected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><span className="text-zinc-500">Name:</span> {selected.name}</div>
              <div><span className="text-zinc-500">Type:</span> {selected.organization_type ?? "—"}</div>
              <div><span className="text-zinc-500">Logo URL:</span> {selected.logo ?? "—"}</div>
              <div><span className="text-zinc-500">Website:</span> {selected.website_url ?? "—"}</div>
              <div className="md:col-span-2">
                <span className="text-zinc-500">Departments:</span>{" "}
                {(selected.departments ?? []).length > 0 ? (
                  <span className="inline-flex flex-wrap gap-1.5 mt-1">
                    {(selected.departments ?? []).map((d) => (
                      <span
                        key={d.slug}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-xs"
                      >
                        {d.department}
                      </span>
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </div>
              <div className="md:col-span-2"><span className="text-zinc-500">Address:</span> {selected.address ?? "—"}</div>
              <div><span className="text-zinc-500">Pin Code:</span> {selected.pin_code ?? "—"}</div>
              <div><span className="text-zinc-500">City:</span> {selected.city ?? "—"}</div>
              <div><span className="text-zinc-500">State:</span> {selected.state ?? "—"}</div>
              <div><span className="text-zinc-500">Country:</span> {selected.country ?? "—"}</div>
              <div><span className="text-zinc-500">Contact:</span> {selected.contact_name ?? "—"}</div>
              <div><span className="text-zinc-500">Designation:</span> {selected.contact_designation ?? "—"}</div>
              <div><span className="text-zinc-500">Email:</span> {selected.contact_email ?? "—"}</div>
              <div><span className="text-zinc-500">Phone:</span> {selected.contact_phone ?? "—"}</div>
              <div><span className="text-zinc-500">BD Employee ID:</span> {selected.bd_employee_id ?? "—"}</div>
              <div><span className="text-zinc-500">Status:</span> {selected.status ?? "—"}</div>
            </div>
            <div className="pt-2 border-t border-zinc-100 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setParticipantsOrg({
                    orgId: selected.organization_id,
                    orgName: selected.name ?? undefined,
                  });
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium"
              >
                <Users className="w-4 h-4" />
                View Participants
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEngagementsOrg({
                    orgId: selected.organization_id,
                    orgName: selected.name ?? undefined,
                  });
                }}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium"
              >
                View Engagements
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Type</label>
                <input
                  type="text"
                  value={formData.organization_type ?? ""}
                  onChange={(e) => setFormData({ ...formData, organization_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={formData.logo ?? ""}
                  onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Upload Logo</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void handleLogoUpload(e.target.files?.[0])}
                  className="w-full text-sm"
                  disabled={logoUploading}
                />
                {logoUploading && (
                  <p className="mt-1 text-xs text-zinc-500">Uploading logo...</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Website</label>
                <input
                  type="url"
                  value={formData.website_url ?? ""}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="https://"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Departments</label>
                <div className="flex flex-wrap items-center gap-1.5 px-2 py-2 rounded-lg border border-zinc-300 text-sm focus-within:ring-2 focus-within:ring-zinc-900 min-h-[42px]">
                  {departmentNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-xs"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeDepartmentName(name)}
                        className="text-zinc-500 hover:text-zinc-800"
                        aria-label={`Remove ${name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={departmentInput}
                    onChange={(e) => setDepartmentInput(e.target.value)}
                    onKeyDown={handleDepartmentInputKeyDown}
                    onBlur={() => {
                      if (departmentInput.trim()) addDepartmentName(departmentInput);
                    }}
                    placeholder={departmentNames.length === 0 ? "Type a department and press Enter" : "Add another…"}
                    className="flex-1 min-w-[120px] border-0 p-0 focus:outline-none focus:ring-0 bg-transparent"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address ?? ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Pin Code</label>
                <input
                  type="text"
                  value={formData.pin_code ?? ""}
                  onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city ?? ""}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state ?? ""}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Country</label>
                <input
                  type="text"
                  value={formData.country ?? ""}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={formData.contact_name ?? ""}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Contact Designation</label>
                <input
                  type="text"
                  value={formData.contact_designation ?? ""}
                  onChange={(e) => setFormData({ ...formData, contact_designation: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={formData.contact_email ?? ""}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={formData.contact_phone ?? ""}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">BD Employee</label>
                <select
                  value={formData.bd_employee_id ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setFormData({
                      ...formData,
                      bd_employee_id: raw ? Number(raw) : undefined,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  disabled={employeeLoading}
                >
                  <option value="">Unassigned</option>
                  {employees.map((employee) => {
                    const user = usersById[employee.user_id];
                    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
                    return (
                      <option key={employee.employee_id} value={employee.employee_id}>
                        {name || `User ${employee.user_id}`} (#{employee.employee_id}){employee.role ? ` • ${employee.role}` : ""}
                      </option>
                    );
                  })}
                </select>
                {employeeLoading && (
                  <p className="mt-1 text-xs text-zinc-500">Loading employees...</p>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "Saving..." : modalMode === "add" ? "Create" : "Update"}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      {createEngagementPromptOpen && createdOrgForEngagement && (
        <Modal
          open={createEngagementPromptOpen}
          onClose={() => {
            setCreateEngagementPromptOpen(false);
            setCreatedOrgForEngagement(null);
          }}
          title="Create engagement?"
          maxWidthClassName="max-w-md"
        >
          <p className="text-zinc-600 text-sm mb-4">
            Want to create an engagement for{" "}
            <span className="font-medium text-zinc-900">{createdOrgForEngagement.orgName ?? "this organisation"}</span>
            ?
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => {
                const preset = createdOrgForEngagement;
                setCreateEngagementPromptOpen(false);
                setCreatedOrgForEngagement(null);
                navigate("/engagements", { state: { createEngagementFromOrg: preset } });
              }}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateEngagementPromptOpen(false);
                setCreatedOrgForEngagement(null);
              }}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              No
            </button>
          </div>
        </Modal>
      )}

      {participantsOrg && (
        <ParticipantsModal
          open={!!participantsOrg}
          onClose={() => setParticipantsOrg(null)}
          source={{
            kind: "organization",
            orgId: participantsOrg.orgId,
            orgName: participantsOrg.orgName,
          }}
        />
      )}

      {engagementsOrg && (
        <OrganizationEngagementsModal
          open={!!engagementsOrg}
          onClose={() => setEngagementsOrg(null)}
          orgId={engagementsOrg.orgId}
          orgName={engagementsOrg.orgName}
        />
      )}

      <ManageReportSectionsModal
        open={reportSectionsOpen}
        onClose={() => setReportSectionsOpen(false)}
      />

      {campEngagements && (
        <CampEngagementsModal
          open={!!campEngagements}
          onClose={() => setCampEngagements(null)}
          campNo={campEngagements.campNo}
          campName={campEngagements.campName}
          orgName={campEngagements.orgName}
        />
      )}

      <CampDepartmentsModal
        camp={campDepartments}
        onClose={() => setCampDepartments(null)}
      />

      {campReportDeleteConfirm && (
        <Modal
          open={!!campReportDeleteConfirm}
          onClose={() => setCampReportDeleteConfirm(null)}
          title="Delete Camp Reports"
        >
          <p className="text-zinc-600 text-sm mb-4">
            This will delete the overall camp report and all department reports for camp &quot;
            {campReportDeleteConfirm.camp_name}&quot;.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => campReportDeleteConfirm && handleDeleteCampReports(campReportDeleteConfirm)}
              disabled={campReportDeleting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {campReportDeleting ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={() => setCampReportDeleteConfirm(null)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Confirm Archive"
        >
          <p className="text-zinc-600 text-sm mb-4">
            Archive organisation &quot;{deleteConfirm.name}&quot;? This will set status to archived.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Archiving..." : "Archive"}
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
