"use client";

import { useMemo, useState } from "react";
import type { ScheduleJob, ScheduleJobType } from "@/lib/user-workspace-firestore";
import {
  addDays,
  buildScheduleJobFromForm,
  compareScheduleJobs,
  formatFieldTimeRange,
  formatInstallationRange,
  formatScheduleDate,
  getInstallationDate,
  getInstallationDays,
  getInstallationEndDate,
  getJobType,
  getWorkStartDate,
  isFieldJob,
  jobTypeLabel,
  nextScheduleStatus,
  scheduleStatusColor,
  scheduleStatusText,
} from "@/lib/schedule-jobs";

type FormData = {
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

const emptyForm = (jobType: ScheduleJobType = "project"): FormData => ({
  jobType,
  clientName: "",
  description: "",
  installationAddress: "",
  dateClosed: jobType === "project" ? new Date().toISOString().split("T")[0] : "",
  productionDays: jobType === "field" ? "0" : "",
  installationDays: "1",
  workStartDate: "",
  fieldStartTime: "",
  fieldEndTime: "",
});

type Props = {
  jobs: ScheduleJob[];
  onJobsChange: (jobs: ScheduleJob[]) => void;
  loading?: boolean;
};

export default function ScheduleView({ jobs, onJobsChange, loading = false }: Props) {
  const [activeTab, setActiveTab] = useState<"jobs" | "schedule">("jobs");
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduleJob | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm());

  const sortedJobs = useMemo(() => [...jobs].sort(compareScheduleJobs), [jobs]);

  const isFieldForm = formData.jobType === "field";

  const previewInstallationDate = isFieldForm
    ? formData.workStartDate
    : formData.workStartDate && formData.productionDays
      ? addDays(formData.workStartDate, Number(formData.productionDays))
      : "";
  const previewInstallationDays = Math.max(1, Number(formData.installationDays) || 1);
  const previewInstallationEndDate = previewInstallationDate
    ? previewInstallationDays <= 1
      ? previewInstallationDate
      : addDays(previewInstallationDate, previewInstallationDays)
    : "";

  const setFormJobType = (jobType: ScheduleJobType) => {
    setFormData(emptyForm(jobType));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newJob = buildScheduleJobFromForm(formData);
    onJobsChange([...jobs, newJob]);
    setFormData(emptyForm());
    setShowForm(false);
  };

  const toggleJobStatus = (id: string, currentStatus: ScheduleJob["status"]) => {
    onJobsChange(jobs.map((j) => (j.id === id ? { ...j, status: nextScheduleStatus(currentStatus) } : j)));
  };

  const deleteJob = (id: string) => {
    onJobsChange(jobs.filter((j) => j.id !== id));
  };

  const openEdit = (job: ScheduleJob) => {
    setEditingJob({
      ...job,
      jobType: getJobType(job),
      workStartDate: getWorkStartDate(job),
      installationDays: getInstallationDays(job),
    });
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditingJob((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [name]: value } as ScheduleJob;
      if (name === "jobType") {
        const type = value as ScheduleJobType;
        next.jobType = type;
        if (type === "field") {
          next.productionDays = 0;
          next.installationDays = 1;
        } else {
          if (!next.productionDays || next.productionDays < 1) next.productionDays = 1;
          delete next.fieldStartTime;
          delete next.fieldEndTime;
        }
      }
      return next;
    });
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;
    const jobType = getJobType(editingJob);
    const updated = buildScheduleJobFromForm(
      {
        jobType,
        clientName: editingJob.clientName,
        description: editingJob.description,
        installationAddress: editingJob.installationAddress,
        dateClosed: editingJob.dateClosed ?? "",
        productionDays: String(jobType === "field" ? 0 : editingJob.productionDays),
        installationDays: String(editingJob.installationDays ?? 1),
        workStartDate: editingJob.workStartDate || getWorkStartDate(editingJob),
        fieldStartTime: editingJob.fieldStartTime ?? "",
        fieldEndTime: editingJob.fieldEndTime ?? "",
      },
      editingJob
    );
    onJobsChange(jobs.map((j) => (j.id === editingJob.id ? updated : j)));
    setEditingJob(null);
  };

  if (loading) {
    return (
      <div dir="rtl" className="flex min-h-[50vh] flex-col items-center justify-center bg-slate-50">
        <div className="loader mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        <p className="text-lg font-medium text-slate-600">טוען נתוני לו&quot;ז מהענן...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-full bg-slate-50 font-sans text-slate-800">
      <main className="mx-auto max-w-5xl px-4 py-4">
        <div className="mb-8 flex w-fit gap-2 rounded-xl bg-slate-200 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("jobs")}
            className={`flex items-center gap-2 rounded-lg px-6 py-2.5 font-medium transition-all ${activeTab === "jobs" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:bg-slate-300 hover:text-slate-900"}`}
          >
            📋 כל העבודות
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`flex items-center gap-2 rounded-lg px-6 py-2.5 font-medium transition-all ${activeTab === "schedule" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:bg-slate-300 hover:text-slate-900"}`}
          >
            📅 לוח זמנים חכם
          </button>
        </div>

        {activeTab === "jobs" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">רשימת עבודות</h2>
                <p className="text-sm text-slate-500">פרויקטים עם ייצור ועבודות שטח / תיקונים</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormData(emptyForm("project"));
                    setShowForm(true);
                  }}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  ➕ פרויקט חדש
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormData(emptyForm("field"));
                    setShowForm(true);
                  }}
                  className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 font-medium text-amber-900 transition-colors hover:bg-amber-100"
                >
                  🔧 תיקון / שטח
                </button>
                {showForm && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setFormData(emptyForm());
                    }}
                    className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-600 hover:bg-slate-100"
                  >
                    ביטול
                  </button>
                )}
              </div>
            </div>

            {showForm && (
              <div className={`mb-6 rounded-xl border bg-white p-6 shadow-md ${isFieldForm ? "border-amber-200" : "border-indigo-100"}`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                  <h3 className="text-lg font-bold text-slate-900">
                    {isFieldForm ? "תיקון / עבודת שטח" : "פרויקט חדש"}
                  </h3>
                  <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setFormJobType("project")}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${!isFieldForm ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}
                    >
                      פרויקט
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormJobType("field")}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${isFieldForm ? "bg-white text-amber-800 shadow-sm" : "text-slate-600"}`}
                    >
                      שטח / תיקון
                    </button>
                  </div>
                </div>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-sm font-medium text-slate-700">👤 שם לקוח</label>
                    <input required type="text" name="clientName" value={formData.clientName} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" placeholder="לדוגמה: משפחת לוי" />
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-sm font-medium text-slate-700">📝 תיאור העבודה</label>
                    <input required type="text" name="description" value={formData.description} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" placeholder={isFieldForm ? "לדוגמה: תיקון ציר" : "לדוגמה: ויטרינות לסלון"} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="flex items-center gap-1 text-sm font-medium text-slate-700">📍 כתובת</label>
                    <input required type="text" name="installationAddress" value={formData.installationAddress} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" />
                  </div>

                  {isFieldForm ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">📅 תאריך ביקור בשטח</label>
                        <input required type="date" name="workStartDate" value={formData.workStartDate} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">✅ תאריך סגירה (אופציונלי)</label>
                        <input type="date" name="dateClosed" value={formData.dateClosed} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">🕐 שעת התחלה (אופציונלי)</label>
                        <input type="time" name="fieldStartTime" value={formData.fieldStartTime} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">🕐 שעת סיום (אופציונלי)</label>
                        <input type="time" name="fieldEndTime" value={formData.fieldEndTime} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      {formData.workStartDate && (
                        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950 md:col-span-2">
                          <span className="font-bold">ביקור בשטח:</span>{" "}
                          {formatScheduleDate(formData.workStartDate)}
                          {(formData.fieldStartTime || formData.fieldEndTime) && (
                            <span>
                              {" "}
                              ·{" "}
                              {formData.fieldStartTime && formData.fieldEndTime
                                ? `${formData.fieldStartTime} – ${formData.fieldEndTime}`
                                : formData.fieldStartTime
                                  ? `מ-${formData.fieldStartTime}`
                                  : `עד ${formData.fieldEndTime}`}
                            </span>
                          )}
                          <span className="mr-1 text-amber-800"> — ללא ייצור במפעל</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">✅ תאריך סגירה</label>
                        <input required type="date" name="dateClosed" value={formData.dateClosed} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">📅 תאריך תחילת עבודה</label>
                        <input required type="date" name="workStartDate" value={formData.workStartDate} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">⏱️ ימי ייצור דרושים</label>
                        <input required type="number" min={1} name="productionDays" value={formData.productionDays} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" placeholder="כמה ימי עבודה?" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">🔧 ימי התקנה בשטח</label>
                        <input required type="number" min={1} name="installationDays" value={formData.installationDays} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" placeholder="כמה ימים בשטח?" />
                      </div>
                      {previewInstallationDate && (
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 md:col-span-2">
                          <p>
                            <span className="font-bold">תחילת התקנה משוערת:</span>{" "}
                            {formatScheduleDate(previewInstallationDate)}
                            <span className="mr-1 text-indigo-700"> — לאחר {formData.productionDays} ימי ייצור</span>
                          </p>
                          <p className="mt-1">
                            <span className="font-bold">חלון התקנה:</span>{" "}
                            {previewInstallationDays === 1
                              ? formatScheduleDate(previewInstallationDate)
                              : `${formatScheduleDate(previewInstallationDate)} – ${formatScheduleDate(previewInstallationEndDate)}`}
                            <span className="mr-1 text-indigo-700"> ({previewInstallationDays} {previewInstallationDays === 1 ? "יום" : "ימים"} בשטח)</span>
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  <div className="pt-4 md:col-span-2">
                    <button
                      type="submit"
                      className={`w-full rounded-lg py-3 font-bold text-white transition-colors ${isFieldForm ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
                    >
                      {isFieldForm ? "שמור עבודת שטח" : "שמור פרויקט"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {jobs.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center">
                  <p className="text-5xl">📋</p>
                  <p className="mt-3 text-lg text-slate-500">אין עבודות כרגע. הוסף פרויקט או עבודת שטח.</p>
                </div>
              ) : (
                jobs.map((job) => {
                  const field = isFieldJob(job);
                  return (
                    <div
                      key={job.id}
                      className={`group relative rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${field ? "border-amber-200" : "border-slate-200"}`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${field ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>
                              {jobTypeLabel(job)}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-slate-800">{job.clientName}</h3>
                          <p className="text-sm text-slate-600">{job.description}</p>
                          {job.installationAddress && <p className="mt-1 text-sm text-slate-500">📍 {job.installationAddress}</p>}
                        </div>
                        <button
                          type="button"
                          className={`shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-bold ${scheduleStatusColor(job.status)}`}
                          onClick={() => toggleJobStatus(job.id, job.status)}
                          title="לחץ לשינוי סטטוס"
                        >
                          {scheduleStatusText(job)}
                        </button>
                      </div>
                      <div className={`mt-4 space-y-2 rounded-lg p-3 text-sm text-slate-600 ${field ? "bg-amber-50" : "bg-slate-50"}`}>
                        {job.dateClosed && (
                          <div className="flex justify-between">
                            <span>סגירה:</span>
                            <span className="font-medium text-slate-800">{formatScheduleDate(job.dateClosed)}</span>
                          </div>
                        )}
                        {field ? (
                          <>
                            <div className="flex justify-between font-bold text-amber-900">
                              <span>ביקור בשטח:</span>
                              <span>{formatInstallationRange(job)}</span>
                            </div>
                            <div className="text-xs text-amber-800">ללא ייצור במפעל</div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between">
                              <span>זמן ייצור:</span>
                              <span className="font-medium text-slate-800">{job.productionDays} ימים</span>
                            </div>
                            <div className="flex justify-between font-bold text-blue-700">
                              <span>תחילת עבודה:</span>
                              <span>{formatScheduleDate(getWorkStartDate(job))}</span>
                            </div>
                            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold text-indigo-700">
                              <span>חלון התקנה:</span>
                              <span className="text-left">{formatInstallationRange(job)}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="absolute bottom-4 left-4 flex gap-4 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" onClick={() => openEdit(job)} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                          ✏️ ערוך
                        </button>
                        <button type="button" onClick={() => deleteJob(job.id)} className="text-sm font-medium text-red-500 hover:text-red-700">
                          🗑️ מחק
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="space-y-6">
            <div className="mb-6 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-slate-800">📅 לוח זמנים והיערכות</h2>
              <p className="text-sm text-slate-600">פרויקטים לפי ייצור והתקנה · עבודות שטח לפי תאריך ושעות (אם הוזנו)</p>
            </div>
            <div className="relative space-y-8 border-r-4 border-indigo-200 pr-6">
              {sortedJobs.length === 0 ? (
                <p className="text-slate-500">אין עבודות בלוח הזמנים.</p>
              ) : (
                sortedJobs.map((job) => {
                  const field = isFieldJob(job);
                  const workStartDate = getWorkStartDate(job);
                  const installationDate = getInstallationDate(job);
                  const installationEndDate = getInstallationEndDate(job);
                  const installDays = getInstallationDays(job);
                  const timeRange = formatFieldTimeRange(job);
                  const isCompleted = job.status === "completed";
                  return (
                    <div
                      key={job.id}
                      className={`relative rounded-xl border bg-white p-5 shadow-sm ${isCompleted ? "border-emerald-200 opacity-70" : field ? "border-amber-200" : "border-indigo-100"}`}
                    >
                      <div className={`absolute top-6 -right-[35px] h-5 w-5 rounded-full border-4 border-slate-50 ${isCompleted ? "bg-emerald-500" : field ? "bg-amber-500" : "bg-indigo-500"}`} />
                      <div className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                        <div>
                          <div className="mb-1">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${field ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>
                              {jobTypeLabel(job)}
                            </span>
                          </div>
                          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                            {job.clientName}
                            {isCompleted && <span>✅</span>}
                          </h3>
                          <p className="text-slate-600">{job.description}</p>
                          {job.installationAddress && <p className="mt-1 text-sm text-slate-500">📍 {job.installationAddress}</p>}
                        </div>
                        <div className={`inline-block w-fit rounded-lg border px-4 py-2 ${field ? "border-amber-100 bg-amber-50 text-amber-900" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
                          <p className={`mb-1 text-xs font-semibold uppercase tracking-wider ${field ? "text-amber-700" : "text-blue-600"}`}>
                            {field ? "ביקור בשטח" : "תחילת עבודה"}
                          </p>
                          <p className="flex items-center justify-end gap-2 text-lg font-bold">
                            📅 {formatScheduleDate(field ? installationDate : workStartDate)}
                          </p>
                          {field && timeRange && <p className="mt-1 text-sm font-medium">🕐 {timeRange}</p>}
                        </div>
                      </div>
                      <div
                        className={`flex items-start gap-3 rounded-lg p-4 ${isCompleted ? "bg-emerald-50 text-emerald-800" : field ? "border border-amber-100 bg-amber-50 text-amber-950" : "border border-orange-100 bg-orange-50 text-orange-900"}`}
                      >
                        <span className="text-2xl">{isCompleted ? "✅" : field ? "🔧" : "⚠️"}</span>
                        <div>
                          <p className="text-sm font-bold">
                            {isCompleted ? "העבודה הושלמה!" : field ? "עבודת שטח מתוזמנת:" : "חלון התקנה משוער:"}
                          </p>
                          {!isCompleted && (
                            <p className="mt-1 text-lg font-black">
                              {field ? (
                                <>
                                  {formatScheduleDate(installationDate)}
                                  {timeRange && <span className="mr-2 text-base font-semibold"> · {timeRange}</span>}
                                  <span className="mr-2 block text-sm font-normal text-amber-800 sm:inline">(ללא ייצור במפעל)</span>
                                </>
                              ) : (
                                <>
                                  {installDays === 1
                                    ? formatScheduleDate(installationDate)
                                    : `${formatScheduleDate(installationDate)} – ${formatScheduleDate(installationEndDate)}`}
                                  <span className="mr-2 block text-sm font-normal text-orange-700 sm:inline">
                                    ({installDays} {installDays === 1 ? "יום" : "ימים"} בשטח · לאחר {job.productionDays} ימי ייצור)
                                  </span>
                                </>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {editingJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-indigo-100 bg-white shadow-xl">
              <div className="p-6">
                <div className="mb-6 flex items-center justify-between border-b pb-4">
                  <h3 className="text-xl font-bold text-indigo-900">עריכת עבודה: {editingJob.clientName}</h3>
                  <button type="button" onClick={() => setEditingJob(null)} className="text-slate-400 hover:text-slate-700">
                    ✕
                  </button>
                </div>
                <form onSubmit={saveEdit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">סוג עבודה</label>
                    <select
                      name="jobType"
                      value={getJobType(editingJob)}
                      onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="project">פרויקט</option>
                      <option value="field">תיקון / עבודת שטח</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">שם לקוח</label>
                    <input required type="text" name="clientName" value={editingJob.clientName} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">תיאור העבודה</label>
                    <input required type="text" name="description" value={editingJob.description} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">כתובת</label>
                    <input required type="text" name="installationAddress" value={editingJob.installationAddress || ""} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>

                  {isFieldJob(editingJob) ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">תאריך ביקור בשטח</label>
                        <input required type="date" name="workStartDate" value={editingJob.workStartDate || getWorkStartDate(editingJob)} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">תאריך סגירה (אופציונלי)</label>
                        <input type="date" name="dateClosed" value={editingJob.dateClosed ?? ""} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">שעת התחלה (אופציונלי)</label>
                        <input type="time" name="fieldStartTime" value={editingJob.fieldStartTime ?? ""} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">שעת סיום (אופציונלי)</label>
                        <input type="time" name="fieldEndTime" value={editingJob.fieldEndTime ?? ""} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">תאריך סגירה</label>
                        <input required type="date" name="dateClosed" value={editingJob.dateClosed ?? ""} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">תאריך תחילת עבודה</label>
                        <input required type="date" name="workStartDate" value={editingJob.workStartDate || getWorkStartDate(editingJob)} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">ימי ייצור</label>
                        <input required type="number" min={1} name="productionDays" value={editingJob.productionDays} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">ימי התקנה בשטח</label>
                        <input required type="number" min={1} name="installationDays" value={editingJob.installationDays ?? getInstallationDays(editingJob)} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </>
                  )}

                  <div className="flex gap-3 pt-4 md:col-span-2">
                    <button type="submit" className="flex-1 rounded-lg bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700">
                      שמור שינויים
                    </button>
                    <button type="button" onClick={() => setEditingJob(null)} className="flex-1 rounded-lg border border-slate-300 bg-slate-100 py-3 font-bold text-slate-700 hover:bg-slate-200">
                      ביטול
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
