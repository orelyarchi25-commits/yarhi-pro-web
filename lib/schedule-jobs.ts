import type { ScheduleJob } from "@/lib/user-workspace-firestore";

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

export function getWorkStartDate(job: ScheduleJob): string {
  if (job.workStartDate) return job.workStartDate;
  if (job.installationDate && job.productionDays) {
    return subtractDays(job.installationDate, job.productionDays);
  }
  return job.installationDate || "";
}

export function getInstallationDate(job: ScheduleJob): string {
  const start = getWorkStartDate(job);
  if (start && job.productionDays) return addDays(start, job.productionDays);
  return job.installationDate || "";
}

export function getInstallationDays(job: ScheduleJob): number {
  const days = job.installationDays;
  if (typeof days === "number" && days > 0) return days;
  return 1;
}

/** סיום התקנה — יום אחרון בשטח (כולל יום ההתחלה) */
export function getInstallationEndDate(job: ScheduleJob): string {
  const start = getInstallationDate(job);
  if (!start) return "";
  return addDays(start, getInstallationDays(job) - 1);
}

export function formatInstallationRange(job: ScheduleJob): string {
  const start = getInstallationDate(job);
  if (!start) return "";
  const end = getInstallationEndDate(job);
  const days = getInstallationDays(job);
  const fmt = (d: string) => new Date(d).toLocaleDateString("he-IL");
  if (start === end) return `${fmt(start)} (${days === 1 ? "יום אחד" : `${days} ימים`})`;
  return `${fmt(start)} – ${fmt(end)} (${days} ימים)`;
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

export function scheduleStatusText(status: ScheduleJob["status"]): string {
  switch (status) {
    case "completed":
      return "הושלם";
    case "in-progress":
      return "בייצור";
    default:
      return "ממתין לייצור";
  }
}

export function nextScheduleStatus(status: ScheduleJob["status"]): ScheduleJob["status"] {
  if (status === "pending") return "in-progress";
  if (status === "in-progress") return "completed";
  return "pending";
}
