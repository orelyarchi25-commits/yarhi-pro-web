import type { ScheduleJob, ScheduleJobType } from "@/lib/user-workspace-firestore";

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().split("T")[0];
}

export function subtractDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - Number(days));
  return date.toISOString().split("T")[0];
}

export function isFieldJob(job: ScheduleJob): boolean {
  return job.jobType === "field" || job.productionDays === 0;
}

export function getJobType(job: ScheduleJob): ScheduleJobType {
  return isFieldJob(job) ? "field" : "project";
}

export function getWorkStartDate(job: ScheduleJob): string {
  if (job.workStartDate) return job.workStartDate;
  if (job.installationDate && job.productionDays > 0) {
    return subtractDays(job.installationDate, job.productionDays);
  }
  return job.installationDate || "";
}

export function getInstallationDate(job: ScheduleJob): string {
  const start = getWorkStartDate(job);
  if (!start) return job.installationDate || "";
  if (isFieldJob(job)) return start;
  if (job.productionDays > 0) return addDays(start, job.productionDays);
  return job.installationDate || start;
}

export function getInstallationDays(job: ScheduleJob): number {
  const days = job.installationDays;
  if (typeof days === "number" && days > 0) return days;
  return 1;
}

/** סיום התקנה — תחילת שלב + מספר ימים (10.6 + 3 ייצור → 13.6, 13.6 + 3 התקנה → 16.6) */
export function getInstallationEndDate(job: ScheduleJob): string {
  const start = getInstallationDate(job);
  if (!start) return "";
  const days = getInstallationDays(job);
  if (days <= 1) return start;
  return addDays(start, days);
}

export function formatScheduleDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const day = date.toLocaleDateString("he-IL");
  const weekday = date.toLocaleDateString("he-IL", { weekday: "short" });
  return `${day} · ${weekday}`;
}

export function formatFieldTimeRange(job: ScheduleJob): string {
  const { fieldStartTime, fieldEndTime } = job;
  if (fieldStartTime && fieldEndTime) return `${fieldStartTime} – ${fieldEndTime}`;
  if (fieldStartTime) return `מ-${fieldStartTime}`;
  if (fieldEndTime) return `עד ${fieldEndTime}`;
  return "";
}

export function formatInstallationRange(job: ScheduleJob): string {
  const start = getInstallationDate(job);
  if (!start) return "";
  const end = getInstallationEndDate(job);
  const days = getInstallationDays(job);
  const time = formatFieldTimeRange(job);
  const fmt = (d: string) => formatScheduleDate(d);
  let range: string;
  if (start === end) {
    range = `${fmt(start)} (${days === 1 ? "יום אחד" : `${days} ימים`})`;
  } else {
    range = `${fmt(start)} – ${fmt(end)} (${days} ימים)`;
  }
  return time ? `${range} · ${time}` : range;
}

export function scheduleStatusColor(status: ScheduleJob["status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "in-progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-orange-100 text-orange-800 border-orange-200";
  }
}

export function scheduleStatusText(job: ScheduleJob): string {
  const field = isFieldJob(job);
  switch (job.status) {
    case "completed":
      return "הושלם";
    case "in-progress":
      return field ? "בביצוע" : "בייצור";
    default:
      return field ? "מתוזמן" : "ממתין לייצור";
  }
}

export function nextScheduleStatus(status: ScheduleJob["status"]): ScheduleJob["status"] {
  if (status === "pending") return "in-progress";
  if (status === "in-progress") return "completed";
  return "pending";
}

export function jobTypeLabel(job: ScheduleJob): string {
  return isFieldJob(job) ? "עבודת שטח" : "פרויקט";
}

/** מיון ללוח: תאריך, ואז שעות לעבודות שטח */
export function compareScheduleJobs(a: ScheduleJob, b: ScheduleJob): number {
  const dateA = getInstallationDate(a) || getWorkStartDate(a);
  const dateB = getInstallationDate(b) || getWorkStartDate(b);
  const diff = new Date(dateA).getTime() - new Date(dateB).getTime();
  if (diff !== 0) return diff;
  if (isFieldJob(a) && isFieldJob(b) && a.fieldStartTime && b.fieldStartTime) {
    return a.fieldStartTime.localeCompare(b.fieldStartTime);
  }
  return 0;
}

export type ScheduleJobFormInput = {
  jobType: ScheduleJobType;
  clientName: string;
  description: string;
  installationAddress: string;
  dateClosed: string;
  productionDays: string;
  installationDays: string;
  workStartDate: string;
  fieldStartTime: string;
  fieldEndTime: string;
};

export function buildScheduleJobFromForm(
  input: ScheduleJobFormInput,
  existing?: Partial<ScheduleJob> & { id: string }
): ScheduleJob {
  const isField = input.jobType === "field";
  const workStartDate = input.workStartDate;
  const productionDays = isField ? 0 : Math.max(1, Number(input.productionDays) || 1);
  const installationDays = Math.max(1, Number(input.installationDays) || 1);
  const installationDate = isField ? workStartDate : addDays(workStartDate, productionDays);

  const job: ScheduleJob = {
    id: existing?.id ?? Date.now().toString(),
    jobType: input.jobType,
    clientName: input.clientName.trim(),
    description: input.description.trim(),
    installationAddress: input.installationAddress.trim(),
    productionDays,
    installationDays,
    workStartDate,
    installationDate,
    status: existing?.status ?? "pending",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  if (input.dateClosed.trim()) job.dateClosed = input.dateClosed.trim();
  if (isField && input.fieldStartTime.trim()) job.fieldStartTime = input.fieldStartTime.trim();
  if (isField && input.fieldEndTime.trim()) job.fieldEndTime = input.fieldEndTime.trim();

  return job;
}
