import { useEffect, useState } from "react";
import { ExpertPortalLayout } from "../../layouts/ExpertPortalLayout";
import { expertsPortalApi, type ExpertDetail } from "../../lib/api";

function formatPaise(paise?: number | null): string {
  if (paise == null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-4 py-3 border-b border-zinc-100 last:border-0">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-900 break-words">{value ?? "—"}</dd>
    </div>
  );
}

export function ExpertMePage() {
  const [expert, setExpert] = useState<ExpertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await expertsPortalApi.me();
        if (!cancelled) {
          setExpert(res.data.data);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load your expert profile.");
          setExpert(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ExpertPortalLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-zinc-900 mb-4">My profile</h1>
        {loading && <p className="text-sm text-zinc-500">Loading...</p>}
        {error && !loading && <p className="text-sm text-red-600">{error}</p>}
        {expert && !loading && (
          <div className="bg-white border border-zinc-200 rounded-lg p-4 sm:p-6">
            {expert.profile_photo ? (
              <img
                src={expert.profile_photo}
                alt=""
                className="w-20 h-20 rounded-lg object-cover mb-4"
              />
            ) : null}
            <dl>
              <DetailRow label="Expert ID" value={expert.expert_id} />
              <DetailRow label="User ID" value={expert.user_id ?? "—"} />
              <DetailRow label="Type" value={expert.expert_type} />
              <DetailRow label="Specialization" value={expert.specialization} />
              <DetailRow label="Status" value={expert.status ?? "—"} />
              <DetailRow
                label="Experience"
                value={
                  expert.experience_years != null ? `${expert.experience_years} years` : "—"
                }
              />
              <DetailRow label="Qualifications" value={expert.qualifications ?? "—"} />
              <DetailRow label="About" value={expert.about_text ?? "—"} />
              <DetailRow
                label="Consultation modes"
                value={
                  expert.consultation_modes?.length
                    ? expert.consultation_modes.join(", ")
                    : "—"
                }
              />
              <DetailRow
                label="Languages"
                value={expert.languages?.length ? expert.languages.join(", ") : "—"}
              />
              <DetailRow
                label="Session duration"
                value={
                  expert.session_duration_mins != null
                    ? `${expert.session_duration_mins} mins`
                    : "—"
                }
              />
              <DetailRow
                label="Appointment fee"
                value={formatPaise(expert.appointment_fee_paise)}
              />
              <DetailRow
                label="Original fee"
                value={formatPaise(expert.original_fee_paise)}
              />
              <DetailRow label="Rating" value={expert.rating} />
              <DetailRow label="Reviews" value={expert.review_count} />
              <DetailRow label="Patients" value={expert.patient_count} />
              <DetailRow
                label="Expertise tags"
                value={
                  expert.expertise_tags?.length
                    ? expert.expertise_tags.map((t) => t.tag_name).join(", ")
                    : "—"
                }
              />
            </dl>
          </div>
        )}
      </div>
    </ExpertPortalLayout>
  );
}
