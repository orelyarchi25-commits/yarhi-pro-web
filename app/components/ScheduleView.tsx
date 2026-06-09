"use client";

import { useMemo, useState } from "react";
import type { ScheduleJob } from "@/lib/user-workspace-firestore";
import {
  addDays,
  formatInstallationRange,
  getInstallationDate,
  getInstallationDays,
  getInstallationEndDate,
  getWorkStartDate,
  nextScheduleStatus,
  scheduleStatusColor,
  scheduleStatusText,
} from "@/lib/schedule-jobs";

type FormData = {
  clientName: string;
  description: string;
  installationAddress: string;
  dateClosed: string;
  productionDays: string;
  installationDays: string;
  workStartDate: string;
};

const emptyForm = (): FormData => ({
  clientName: "",
  description: "",
  installationAddress: "",
  dateClosed: new Date().toISOString().split("T")[0],
  productionDays: "",
  installationDays: "1",
  workStartDate: "",
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
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => new Date(getWorkStartDate(a)).getTime() - new Date(getWorkStartDate(b)).getTime()),
    [jobs]
  );

  const previewInstallationDate =
    formData.workStartDate && formData.productionDays
      ? addDays(formData.workStartDate, Number(formData.productionDays))
      : "";
  const previewInstallationDays = Math.max(1, Number(formData.installationDays) || 1);
  const previewInstallationEndDate = previewInstallationDate
    ? addDays(previewInstallationDate, previewInstallationDays - 1)
    : "";

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const productionDays = Number(formData.productionDays);
    const installationDays = Math.max(1, Number(formData.installationDays) || 1);
    const workStartDate = formData.workStartDate;
    const newJob: ScheduleJob = {
      ...formData,
      id: Date.now().toString(),
      workStartDate,
      productionDays,
      installationDays,
      installationDate: addDays(workStartDate, productionDays),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
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

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditingJob((prev) => (prev ? { ...prev, [name]: value } : prev));
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;
    const productionDays = Number(editingJob.productionDays);
    const installationDays = Math.max(1, Number(editingJob.installationDays) || 1);
    const workStartDate = editingJob.workStartDate || getWorkStartDate(editingJob);
    const updated: ScheduleJob = {
      ...editingJob,
      workStartDate,
      productionDays,
      installationDays,
      installationDate: addDays(workStartDate, productionDays),
    };
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
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-800">רשימת עבודות</h2>
                <p className="text-sm text-slate-500">נהל את כל העבודות שסגרת כאן</p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                {showForm ? "ביטול" : "➕ עבודה חדשה"}
              </button>
            </div>

            {showForm && (
              <div className="mb-6 rounded-xl border border-indigo-100 bg-white p-6 shadow-md">
                <h3 className="mb-4 border-b pb-2 text-lg font-bold text-indigo-900">פרטי עבודה חדשה</h3>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-sm font-medium text-slate-700">👤 שם לקוח</label>
                    <input required type="text" name="clientName" value={formData.clientName} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" placeholder="לדוגמה: משפחת לוי" />
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-sm font-medium text-slate-700">📝 תיאור העבודה</label>
                    <input required type="text" name="description" value={formData.description} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" placeholder="לדוגמה: ויטרינות לסלון" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="flex items-center gap-1 text-sm font-medium text-slate-700">📍 כתובת התקנה</label>
                    <input required type="text" name="installationAddress" value={formData.installationAddress} onChange={handleInputChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" />
                  </div>
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
                        {new Date(previewInstallationDate).toLocaleDateString("he-IL")}
                        <span className="mr-1 text-indigo-700"> — לאחר {formData.productionDays} ימי ייצור</span>
                      </p>
                      <p className="mt-1">
                        <span className="font-bold">חלון התקנה:</span>{" "}
                        {previewInstallationDays === 1
                          ? new Date(previewInstallationDate).toLocaleDateString("he-IL")
                          : `${new Date(previewInstallationDate).toLocaleDateString("he-IL")} – ${new Date(previewInstallationEndDate).toLocaleDateString("he-IL")}`}
                        <span className="mr-1 text-indigo-700"> ({previewInstallationDays} {previewInstallationDays === 1 ? "יום" : "ימים"} בשטח)</span>
                      </p>
                    </div>
                  )}
                  <div className="pt-4 md:col-span-2">
                    <button type="submit" className="w-full rounded-lg bg-indigo-600 py-3 font-bold text-white transition-colors hover:bg-indigo-700">
                      שמור עבודה חדשה
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {jobs.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center">
                  <p className="text-5xl">📋</p>
                  <p className="mt-3 text-lg text-slate-500">אין עבודות כרגע. הוסף עבודה חדשה כדי להתחיל.</p>
                </div>
              ) : (
                jobs.map((job) => (
                  <div key={job.id} className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">{job.clientName}</h3>
                        <p className="text-sm text-slate-600">{job.description}</p>
                        {job.installationAddress && <p className="mt-1 text-sm text-slate-500">📍 {job.installationAddress}</p>}
                      </div>
                      <button
                        type="button"
                        className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold ${scheduleStatusColor(job.status)}`}
                        onClick={() => toggleJobStatus(job.id, job.status)}
                        title="לחץ לשינוי סטטוס"
                      >
                        {scheduleStatusText(job.status)}
                      </button>
                    </div>
                    <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                      <div className="flex justify-between"><span>סגירה:</span><span className="font-medium text-slate-800">{new Date(job.dateClosed).toLocaleDateString("he-IL")}</span></div>
                      <div className="flex justify-between"><span>זמן ייצור:</span><span className="font-medium text-slate-800">{job.productionDays} ימים</span></div>
                      <div className="flex justify-between font-bold text-blue-700"><span>תחילת עבודה:</span><span>{new Date(getWorkStartDate(job)).toLocaleDateString("he-IL")}</span></div>
                      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold text-indigo-700"><span>חלון התקנה:</span><span className="text-left">{formatInstallationRange(job)}</span></div>
                    </div>
                    <div className="absolute bottom-4 left-4 flex gap-4 opacity-0 transition-opacity group-hover:opacity-100">
                      <button type="button" onClick={() => setEditingJob({ ...job, workStartDate: getWorkStartDate(job), installationDays: getInstallationDays(job) })} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">✏️ ערוך</button>
                      <button type="button" onClick={() => deleteJob(job.id)} className="text-sm font-medium text-red-500 hover:text-red-700">🗑️ מחק</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="space-y-6">
            <div className="mb-6 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-slate-800">📅 לוח זמנים והיערכות לייצור</h2>
              <p className="text-sm text-slate-600">הזן תאריך תחילת עבודה, ימי ייצור וימי התקנה — המערכת מחשבת קדימה את חלון ההתקנה בשטח.</p>
            </div>
            <div className="relative space-y-8 border-r-4 border-indigo-200 pr-6">
              {sortedJobs.length === 0 ? (
                <p className="text-slate-500">אין עבודות בלוח הזמנים.</p>
              ) : (
                sortedJobs.map((job) => {
                  const workStartDate = getWorkStartDate(job);
                  const installationDate = getInstallationDate(job);
                  const installationEndDate = getInstallationEndDate(job);
                  const installDays = getInstallationDays(job);
                  const isCompleted = job.status === "completed";
                  return (
                    <div key={job.id} className={`relative rounded-xl border bg-white p-5 shadow-sm ${isCompleted ? "border-emerald-200 opacity-70" : "border-indigo-100"}`}>
                      <div className={`absolute top-6 -right-[35px] h-5 w-5 rounded-full border-4 border-slate-50 ${isCompleted ? "bg-emerald-500" : "bg-indigo-500"}`} />
                      <div className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                        <div>
                          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                            {job.clientName}
                            {isCompleted && <span>✅</span>}
                          </h3>
                          <p className="text-slate-600">{job.description}</p>
                          {job.installationAddress && <p className="mt-1 text-sm text-slate-500">📍 {job.installationAddress}</p>}
                        </div>
                        <div className="inline-block w-fit rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-blue-800">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">תחילת עבודה</p>
                          <p className="flex items-center justify-end gap-2 text-lg font-bold">📅 {new Date(workStartDate).toLocaleDateString("he-IL")}</p>
                        </div>
                      </div>
                      <div className={`flex items-start gap-3 rounded-lg p-4 ${isCompleted ? "bg-emerald-50 text-emerald-800" : "border border-orange-100 bg-orange-50 text-orange-900"}`}>
                        <span className="text-2xl">{isCompleted ? "✅" : "⚠️"}</span>
                        <div>
                          <p className="text-sm font-bold">{isCompleted ? "העבודה הושלמה!" : "חלון התקנה משוער:"}</p>
                          {!isCompleted && (
                            <p className="mt-1 text-lg font-black">
                              {installDays === 1
                                ? new Date(installationDate).toLocaleDateString("he-IL")
                                : `${new Date(installationDate).toLocaleDateString("he-IL")} – ${new Date(installationEndDate).toLocaleDateString("he-IL")}`}
                              <span className="mr-2 block text-sm font-normal text-orange-700 sm:inline">
                                ({installDays} {installDays === 1 ? "יום" : "ימים"} בשטח · לאחר {job.productionDays} ימי ייצור)
                              </span>
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
                  <button type="button" onClick={() => setEditingJob(null)} className="text-slate-400 hover:text-slate-700">✕</button>
                </div>
                <form onSubmit={saveEdit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">שם לקוח</label>
                    <input required type="text" name="clientName" value={editingJob.clientName} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">תיאור העבודה</label>
                    <input required type="text" name="description" value={editingJob.description} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">כתובת התקנה</label>
                    <input required type="text" name="installationAddress" value={editingJob.installationAddress || ""} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">תאריך סגירה</label>
                    <input required type="date" name="dateClosed" value={editingJob.dateClosed} onChange={handleEditChange} className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
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
                  <div className="flex gap-3 pt-4 md:col-span-2">
                    <button type="submit" className="flex-1 rounded-lg bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700">שמור שינויים</button>
                    <button type="button" onClick={() => setEditingJob(null)} className="flex-1 rounded-lg border border-slate-300 bg-slate-100 py-3 font-bold text-slate-700 hover:bg-slate-200">ביטול</button>
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
