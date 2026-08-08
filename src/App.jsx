import React, { useState, useMemo, useEffect } from "react";
import {
  LayoutDashboard,
  ListTodo,
  Archive,
  Plus,
  Trash2,
  Pencil,
  RotateCcw,
  Monitor,
  Smartphone,
  Circle,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  PartyPopper,
  Paperclip,
  FileCheck2,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  X,
  Lock,
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";
import { supabase } from "./supabaseClient";

/* ---------- design tokens ---------- */
const C = {
  paper: "#EDEFE7",
  card: "#FFFFFF",
  ink: "#20261F",
  inkSoft: "#646B5D",
  inkFaint: "#9BA294",
  line: "#D9DCCE",
  teal: "#2F6F5E",
  tealSoft: "#E1EDE8",
  amber: "#B8792C",
  amberSoft: "#F3E7D2",
  done: "#3E6B45",
  doneSoft: "#E1EAE0",
  danger: "#AD3B34",
  dangerSoft: "#F5E1DF",
};

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const DAY_MS = 86400000;
const DOING_FUSE_MS = 3 * DAY_MS; // reference length for the "doing" progress fuse
const CONFIRMED_AUTO_DELETE_MS = 3 * DAY_MS; // a confirmed calendar event auto-deletes 3 days after being confirmed
const ARCHIVE_RETENTION_DAYS = 7; // archived (done) tasks auto-delete this many days after completion

// True once a confirmed event has passed its 3-day auto-delete window.
function isConfirmedExpired(ev) {
  if (!ev.confirmedAt) return false;
  return Date.now() - new Date(ev.confirmedAt).getTime() >= CONFIRMED_AUTO_DELETE_MS;
}

// True once an archived (done) task has passed the 7-day retention window,
// i.e. it fell out of the "7 ngày qua" trend chart's range and can be purged.
function isArchivedTaskExpired(task) {
  if (task.status !== "done" || !task.completedAt) return false;
  return daysSince(task.completedAt) >= ARCHIVE_RETENTION_DAYS;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
// Formats a Date (or anything Date-parseable) as YYYY-MM-DD using the LOCAL
// timezone/calendar day, not UTC. toISOString() always converts to UTC first,
// which silently shifts the date backwards for any local time before the UTC
// offset catches up (e.g. in UTC+7, anything before 07:00 local still reads
// as "yesterday" once converted to UTC) — that was the bug where a 7am
// schedule update showed up as the previous day on the dashboard.
function localISODate(dateLike = new Date()) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function todayISO() {
  return localISODate(new Date());
}
function formatVN(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} Thg ${MONTHS[m - 1]}, ${y}`;
}
function tsDaysAgo(days, hours = 0) {
  return new Date(Date.now() - days * DAY_MS - hours * 3600000).toISOString();
}
function daysSince(dateOrIso) {
  const t = new Date(dateOrIso).getTime();
  return Math.floor((Date.now() - t) / DAY_MS);
}
// Returns the Date (local midnight) of the Monday that starts the week containing dateLike.
function getWeekStart(dateLike) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d;
}
function addDays(dateLike, n) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  d.setDate(d.getDate() + n);
  return d;
}
// Rounds a Date up to the next `stepMinutes` boundary — used to suggest a sensible
// default time (e.g. "the next half hour") that's never already in the past.
function roundUpTime(date = new Date(), stepMinutes = 30) {
  const ms = stepMinutes * 60000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}
// "HH:MM" for right now — used to enforce that new events can't be scheduled in the past.
function nowHM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
// True when (dateStr, timeStr) already lies in the past relative to right now.
// A date with no time chosen yet is only considered past once the date itself has passed
// (so picking today with time still blank isn't flagged prematurely).
function isPastDateTime(dateStr, timeStr) {
  if (!dateStr) return false;
  const today = todayISO();
  if (dateStr < today) return true;
  if (dateStr === today && timeStr) return timeStr < nowHM();
  return false;
}

const WEEKDAY_LABELS_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_LABELS_FULL = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
function formatDuration(ms) {
  if (ms == null || ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  return `${minutes} phút`;
}

// Detects whether the app should default to the mobile ("App") layout.
// Checks the user agent (catches iPhone/Android Safari even if the viewport
// width is misreported) as well as screen width, so it's reliable across browsers.
function detectDevice() {
  if (typeof window === "undefined") return "web";
  const ua = navigator.userAgent || "";
  const isPhoneUA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  const isNarrowScreen = window.matchMedia("(max-width: 768px)").matches;
  return isPhoneUA || isNarrowScreen ? "mobile" : "web";
}

const STATUS = {
  todo: { label: "Chưa thực hiện", color: C.amber, soft: C.amberSoft, Icon: Circle },
  doing: { label: "Đang thực hiện", color: C.teal, soft: C.tealSoft, Icon: Clock3 },
  done: { label: "Đã hoàn thành", color: C.done, soft: C.doneSoft, Icon: CheckCircle2 },
};

const NAV_ITEMS = [
  { key: "dashboard", label: "Tổng quan", Icon: LayoutDashboard },
  { key: "tasks", label: "Công việc", Icon: ListTodo },
  { key: "calendar", label: "Lịch", Icon: CalendarDays },
  { key: "archive", label: "Lưu trữ", Icon: Archive },
];

// Built-in categories. Users can add their own on top of these (see customEventTypes
// state in the main App component) — "Khác" was removed in favor of that.
const BASE_EVENT_TYPES = {
  appointment: { label: "Lịch hẹn", color: C.teal, soft: C.tealSoft },
  meeting: { label: "Lịch họp", color: C.amber, soft: C.amberSoft },
  reminder: { label: "Nhắc nhở", color: C.danger, soft: C.dangerSoft },
};

// Colors auto-assigned to new custom categories, cycled in order of creation.
const CUSTOM_TYPE_PALETTE = [
  { color: "#6B5B95", soft: "#EDE8F5" },
  { color: "#3D7EA6", soft: "#DCEAF2" },
  { color: "#A65DA6", soft: "#F2E2F2" },
  { color: "#4C7A57", soft: "#E1EDE4" },
  { color: "#B4652A", soft: "#F4E3D3" },
  { color: "#5D6D7E", soft: "#E4E8EC" },
];

// Sentinel option value used by the "Loại lịch" dropdown to trigger the inline
// "add new category" flow instead of selecting a real category.
const NEW_CATEGORY_VALUE = "__new_category__";

function emptyEventForm() {
  // Suggest "the next half hour" so the default is never already in the past
  // (a fixed 08:00 default would be past by the time someone opens the form at, say, 9am).
  const suggested = roundUpTime(new Date(), 30);
  return {
    title: "",
    eventType: "appointment",
    eventDate: localISODate(suggested),
    eventTime: `${pad2(suggested.getHours())}:${pad2(suggested.getMinutes())}`,
    location: "",
    description: "",
  };
}

// Formats HH:MM:SS (from Postgres "time") or HH:MM down to HH:MM for display.
function formatTimeHM(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

// Positions a day's events proportionally by exact hour+minute (not just the
// hour bucket), so e.g. 9:15 renders visibly below the 9:00 line instead of
// looking identical to a 9:00 event. `rowH` is the pixel height of one hour.
// Events are sorted by time and nudged down just enough to avoid overlapping
// (simple sequential stacking rather than full side-by-side collision layout).
function layoutDayEvents(dayEvents, rowH, minGap = 22) {
  const sorted = [...dayEvents]
    .filter((ev) => ev.eventTime)
    .sort((a, b) => a.eventTime.localeCompare(b.eventTime));
  let lastBottom = -Infinity;
  return sorted.map((ev) => {
    const hour = parseInt(ev.eventTime.slice(0, 2), 10) || 0;
    const minute = parseInt(ev.eventTime.slice(3, 5), 10) || 0;
    let top = hour * rowH + (minute / 60) * rowH;
    if (top < lastBottom) top = lastBottom;
    lastBottom = top + minGap;
    return { ev, top };
  });
}

/* ==================== Supabase data layer ==================== */
// Converts a DB row (snake_case, task_results/task_result_files nested) into
// the camelCase task shape the rest of the app already works with.
function mapRow(row) {
  const r = Array.isArray(row.task_results) ? row.task_results[0] : row.task_results;
  const files = (row.task_result_files || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((f) => ({ id: String(f.id), fileName: f.file_name, fileUrl: f.file_url, isImage: f.is_image }));
  const hasResult = !!(r && (r.text || files.length > 0));
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    requiresResult: row.requires_result,
    expectedNote: row.expected_note,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completedAtTs: row.completed_at_ts ? new Date(row.completed_at_ts).getTime() : null,
    result: hasResult ? { text: r?.text || "", files } : null,
  };
}

async function dbFetchTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_results(*), task_result_files(*)")
    .order("inserted_at", { ascending: false });
  if (error) throw error;
  return data.map(mapRow);
}

async function dbInsertTask(task) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: task.title,
      status: task.status,
      requires_result: task.requiresResult,
      expected_note: task.expectedNote,
      created_at: task.createdAt,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

async function dbUpdateTask(id, { title, requiresResult, expectedNote }) {
  const { error } = await supabase
    .from("tasks")
    .update({ title, requires_result: requiresResult, expected_note: expectedNote })
    .eq("id", id);
  if (error) throw error;
}

async function dbUpdateTaskStatus(id, { status, startedAt, completedAt, completedAtTs }) {
  const { error } = await supabase
    .from("tasks")
    .update({
      status,
      started_at: startedAt,
      completed_at: completedAt,
      completed_at_ts: completedAtTs ? new Date(completedAtTs).toISOString() : null,
    })
    .eq("id", id);
  if (error) throw error;
}

// Saves the note text + replaces the full set of attached files for a task's result.
async function dbSaveResult(taskId, result) {
  const { error: textErr } = await supabase
    .from("task_results")
    .upsert({ task_id: taskId, text: result.text || null, updated_at: new Date().toISOString() });
  if (textErr) throw textErr;

  const { error: delErr } = await supabase.from("task_result_files").delete().eq("task_id", taskId);
  if (delErr) throw delErr;

  const files = result.files || [];
  if (files.length > 0) {
    const { error: insErr } = await supabase.from("task_result_files").insert(
      files.map((f, i) => ({
        task_id: taskId,
        file_name: f.fileName,
        file_url: f.fileUrl,
        is_image: f.isImage,
        position: i,
      }))
    );
    if (insErr) throw insErr;
  }
}

async function dbDeleteTask(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ---------- calendar events data layer ----------
function mapEventRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    eventType: row.event_type,
    eventDate: row.event_date,
    eventTime: row.event_time,
    location: row.location,
    confirmedAt: row.confirmed_at,
  };
}

async function dbFetchEvents() {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .order("event_date", { ascending: true });
  if (error) throw error;
  return data.map(mapEventRow);
}

async function dbInsertEvent(ev) {
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      title: ev.title,
      description: ev.description || null,
      event_type: ev.eventType,
      event_date: ev.eventDate,
      event_time: ev.eventTime || null,
      location: ev.location || null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapEventRow(data);
}

async function dbUpdateEvent(id, ev) {
  const { error } = await supabase
    .from("calendar_events")
    .update({
      title: ev.title,
      description: ev.description || null,
      event_type: ev.eventType,
      event_date: ev.eventDate,
      event_time: ev.eventTime || null,
      location: ev.location || null,
    })
    .eq("id", id);
  if (error) throw error;
}

// Sets (or clears, when confirmedAt is null) the "Xác nhận" timestamp on an event.
// A confirmed event is auto-deleted CONFIRMED_AUTO_DELETE_MS after this timestamp
// (see pruneExpiredConfirmedEvents in the main App component).
async function dbSetEventConfirmed(id, confirmedAt) {
  const { error } = await supabase.from("calendar_events").update({ confirmed_at: confirmedAt }).eq("id", id);
  if (error) throw error;
}

async function dbDeleteEvent(id) {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw error;
}

// Uploads a File to the "task-files" storage bucket and returns a public URL.
// Falls back to a local (non-persistent) preview URL if the bucket isn't set up yet.
async function uploadResultFile(file) {
  const isImage = file.type.startsWith("image/");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
  const { error } = await supabase.storage.from("task-files").upload(path, file);
  if (error) {
    console.warn("Tải tệp lên Supabase Storage thất bại, dùng xem trước cục bộ:", error.message);
    return { fileName: file.name, fileUrl: isImage ? URL.createObjectURL(file) : null, isImage };
  }
  const { data } = supabase.storage.from("task-files").getPublicUrl(path);
  return { fileName: file.name, fileUrl: data.publicUrl, isImage };
}



/* ==================== small presentational pieces (all module-scope: stable identity) ==================== */

function StatusPill({ status, size = "sm" }) {
  const s = STATUS[status];
  const Icon = s.Icon;
  const pad = size === "sm" ? "3px 9px" : "5px 12px";
  const font = size === "sm" ? 11 : 12.5;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: pad,
        borderRadius: 999,
        background: s.soft,
        color: s.color,
        fontSize: font,
        fontWeight: 600,
        fontFamily: "Inter, sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={size === "sm" ? 11 : 13} strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

function StatCard({ label, value, color, mobile, small }) {
  return (
    <div
      style={{
        background: C.card,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: mobile ? "12px 14px" : "16px 18px",
        boxShadow: "0 1px 2px rgba(32,38,31,0.06)",
      }}
    >
      <div
        style={{
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: small ? (mobile ? 16 : 19) : mobile ? 22 : 28,
          fontWeight: 500,
          color: C.ink,
          lineHeight: 1.25,
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: mobile ? 11 : 12, color: C.inkSoft, fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
        {label}
      </div>
    </div>
  );
}

function EmptyState({ text, positive }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "40px 20px",
        color: positive ? C.done : C.inkFaint,
        fontFamily: "Inter, sans-serif",
        fontSize: 13.5,
        border: `1px dashed ${positive ? C.done : C.line}`,
        borderRadius: 10,
        background: positive ? C.doneSoft : "rgba(255,255,255,0.4)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      {positive && <PartyPopper size={20} />}
      {text}
    </div>
  );
}

function SectionCard({ title, mobile, children }) {
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: mobile ? "14px" : "16px 18px", boxShadow: "0 1px 2px rgba(32,38,31,0.06)" }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: mobile ? 12.5 : 13.5, color: C.ink, marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* task timer strip: a "burning fuse" whose ember position reflects real elapsed time */
function TaskTimerStrip({ task }) {
  let text, textColor, Icon;
  let percent = null;
  let emberColor = C.teal;
  let overdue = false;

  if (task.status === "todo") {
    Icon = Circle;
    textColor = C.inkFaint;
    text = "Chưa bắt đầu tính giờ";
  } else if (task.status === "doing") {
    Icon = Clock3;
    const elapsed = Date.now() - new Date(task.startedAt).getTime();
    overdue = elapsed >= DOING_FUSE_MS;
    percent = Math.max(2, Math.min(100, (elapsed / DOING_FUSE_MS) * 100));
    emberColor = overdue ? C.danger : C.teal;
    textColor = emberColor;
    text = `Đang thực hiện được ${formatDuration(elapsed)}${overdue ? " · đã quá 3 ngày" : ""}`;
  } else {
    Icon = CheckCircle2;
    textColor = C.done;
    percent = 100;
    emberColor = C.done;
    const dur = task.completedAtTs && task.startedAt ? task.completedAtTs - new Date(task.startedAt).getTime() : null;
    text = dur != null ? `Hoàn thành sau ${formatDuration(dur)}` : "Không rõ thời gian thực hiện";
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 7, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: C.line }} />
        {percent != null && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${percent}%`,
              borderRadius: 999,
              background: `linear-gradient(90deg, rgba(32,38,31,0.3), ${emberColor})`,
              transition: "width 1.2s linear, background 0.4s linear",
            }}
          />
        )}
        {task.status === "doing" && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: `${percent}%`,
              transform: "translate(-50%, -50%)",
              width: 11,
              height: 11,
              borderRadius: 999,
              background: `radial-gradient(circle, #FFE3AC 0%, ${emberColor} 55%, transparent 78%)`,
              boxShadow: `0 0 7px 2px ${emberColor}66`,
              animation: "fuse-flicker 1.1s ease-in-out infinite",
              transition: "left 1.2s linear",
            }}
          />
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <Icon size={11} color={textColor} strokeWidth={2.5} />
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: textColor, fontWeight: overdue ? 600 : 400 }}>
          {text}
        </span>
      </div>
    </div>
  );
}

function DeviceToggle({ device, onChange, compact }) {
  return (
    <div style={{ display: "inline-flex", background: "#E4E7DC", borderRadius: 8, padding: 3, gap: 2 }}>
      {[
        { key: "web", Icon: Monitor, label: "Web" },
        { key: "mobile", Icon: Smartphone, label: "App" },
      ].map(({ key, Icon, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            border: "none",
            cursor: "pointer",
            padding: compact ? "5px 8px" : "6px 12px",
            borderRadius: 6,
            background: device === key ? C.ink : "transparent",
            color: device === key ? C.paper : C.inkSoft,
            fontFamily: "Inter, sans-serif",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Icon size={13} strokeWidth={2.5} />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}

/* simple description-only field used at task creation (no file — that only happens at completion) */
function NoteField({ value, onChange, label, placeholder }) {
  return (
    <div>
      <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: "100%",
          marginTop: 6,
          border: `1.5px solid ${C.line}`,
          borderRadius: 10,
          padding: "10px 12px",
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: C.ink,
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          background: C.paper,
        }}
      />
    </div>
  );
}

/* shared description + file dropzone, used at the completion review step */
function ResultEditor({ idPrefix, text, onTextChange, files, onAddFiles, onRemoveFile, placeholder }) {
  return (
    <div>
      <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>
        Ghi chú thực tế khi hoàn thành
      </label>
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: "100%",
          marginTop: 6,
          marginBottom: 12,
          border: `1.5px solid ${C.line}`,
          borderRadius: 10,
          padding: "10px 12px",
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: C.ink,
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          background: C.paper,
        }}
      />

      <label htmlFor={`${idPrefix}-file-input`} className="file-drop">
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: C.tealSoft,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <UploadCloud size={16} color={C.teal} strokeWidth={2.2} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            {files.length > 0 ? "Thêm tệp khác" : "Chọn tệp minh chứng (không bắt buộc)"}
          </div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: C.inkFaint, marginTop: 1 }}>
            Có thể chọn nhiều tệp · Hình ảnh, Word hoặc PDF
          </div>
        </div>
      </label>
      <input
        id={`${idPrefix}-file-input`}
        type="file"
        accept="image/*,.doc,.docx,.pdf"
        multiple
        onChange={(e) => {
          onAddFiles(e.target.files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {files.map((f) => (
            <div key={f.id}>
              {f.isImage && f.fileUrl && (
                <img
                  src={f.fileUrl}
                  alt={f.fileName || "minh chứng"}
                  style={{ width: "100%", maxHeight: 150, objectFit: "cover", borderRadius: 10, marginBottom: 6 }}
                />
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  border: `1px solid ${C.line}`,
                  borderRadius: 10,
                  background: C.paper,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: C.tealSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {f.isImage ? <ImageIcon size={13} color={C.teal} strokeWidth={2.2} /> : <FileText size={13} color={C.teal} strokeWidth={2.2} />}
                </div>
                <div
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 11.5,
                    color: C.ink,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.fileName}
                </div>
                <button
                  onClick={() => onRemoveFile(f.id)}
                  title="Bỏ tệp này"
                  style={{ border: "none", background: "transparent", color: C.inkFaint, cursor: "pointer", padding: 3, flexShrink: 0 }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultModal({ task, resultDraft, onTextChange, onAddFiles, onRemoveFile, onCancel, onConfirm }) {
  if (!task) return null;
  const canConfirm = resultDraft.text.trim().length > 0 || resultDraft.files.length > 0;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(32,38,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.card, borderRadius: 16, padding: 22, width: 400, maxWidth: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: C.tealSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileCheck2 size={18} color={C.teal} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 17, color: C.ink }}>Xem lại trước khi hoàn thành</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Lock size={11} color={C.inkFaint} strokeWidth={2.5} />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.inkSoft }}>
              Mô tả mong đợi (đã ghi khi tạo việc)
            </span>
          </div>
          <div
            style={{
              border: `1.5px solid ${C.line}`,
              borderRadius: 10,
              padding: "10px 12px",
              background: "#F1F2ED",
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: task.expectedNote ? C.inkSoft : C.inkFaint,
              fontStyle: task.expectedNote ? "normal" : "italic",
              lineHeight: 1.5,
            }}
          >
            {task.expectedNote || "(Không có mô tả nào được ghi khi tạo việc)"}
          </div>
        </div>

        <ResultEditor
          idPrefix="complete-task"
          text={resultDraft.text}
          onTextChange={onTextChange}
          files={resultDraft.files}
          onAddFiles={onAddFiles}
          onRemoveFile={onRemoveFile}
          placeholder="Mô tả kết quả đạt được..."
        />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button
            onClick={onCancel}
            style={{
              border: `1px solid ${C.line}`,
              background: "transparent",
              borderRadius: 8,
              padding: "8px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              color: C.inkSoft,
              cursor: "pointer",
            }}
          >
            Huỷ
          </button>
          <button
            disabled={!canConfirm}
            onClick={onConfirm}
            title={!canConfirm ? "Cần nhập ghi chú hoặc chọn tệp trước khi hoàn thành" : undefined}
            style={{
              border: "none",
              background: canConfirm ? C.ink : C.line,
              color: canConfirm ? C.paper : C.inkFaint,
              borderRadius: 8,
              padding: "8px 16px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Xác nhận hoàn thành
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTaskModal({ task, draft, onTitleChange, onToggleNeedsResult, onExpectedNoteChange, onCancel, onConfirm }) {
  if (!task) return null;
  const canConfirm = draft.title.trim().length > 0;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(32,38,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.card, borderRadius: 16, padding: 22, width: 400, maxWidth: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: C.tealSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Pencil size={17} color={C.teal} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 17, color: C.ink }}>Chỉnh sửa công việc</div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>Tên công việc</label>
          <textarea
            value={draft.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Nhập tên công việc..."
            rows={3}
            style={{
              width: "100%",
              marginTop: 6,
              border: `1.5px solid ${C.line}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: C.ink,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              background: C.paper,
              whiteSpace: "pre-wrap",
            }}
          />
        </div>

        <div style={{ marginBottom: draft.requiresResult ? 10 : 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>Khi hoàn thành:</span>
            <div style={{ display: "inline-flex", background: "#E4E7DC", borderRadius: 999, padding: 3, gap: 2 }}>
              {[
                { key: false, label: "Không có kết quả" },
                { key: true, label: "Có kết quả" },
              ].map((opt) => (
                <button
                  key={String(opt.key)}
                  onClick={() => onToggleNeedsResult(opt.key)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: draft.requiresResult === opt.key ? C.ink : "transparent",
                    color: draft.requiresResult === opt.key ? C.paper : C.inkSoft,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {draft.requiresResult && (
          <div style={{ padding: 12, border: `1px solid ${C.line}`, borderRadius: 10, background: "rgba(255,255,255,0.5)" }}>
            <NoteField
              value={draft.expectedNote}
              onChange={onExpectedNoteChange}
              label="Mô tả mong đợi / ghi chú minh chứng"
              placeholder="Mô tả bạn cần làm gì để chứng minh đã hoàn thành việc này..."
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button
            onClick={onCancel}
            style={{
              border: `1px solid ${C.line}`,
              background: "transparent",
              borderRadius: 8,
              padding: "8px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              color: C.inkSoft,
              cursor: "pointer",
            }}
          >
            Huỷ
          </button>
          <button
            disabled={!canConfirm}
            onClick={onConfirm}
            title={!canConfirm ? "Cần nhập tên công việc" : undefined}
            style={{
              border: "none",
              background: canConfirm ? C.ink : C.line,
              color: canConfirm ? C.paper : C.inkFaint,
              borderRadius: 8,
              padding: "8px 16px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}

/* shared form fields for creating/editing a calendar event */
function EventFormFields({ draft, onChange, idPrefix, eventTypes, onAddCategory, restrictPast = false }) {
  const set = (patch) => onChange({ ...draft, ...patch });
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const todayStr = todayISO();
  const isToday = draft.eventDate === todayStr;
  const minTime = restrictPast && isToday ? nowHM() : undefined;
  const inputStyle = {
    width: "100%",
    marginTop: 6,
    border: `1.5px solid ${C.line}`,
    borderRadius: 10,
    padding: "9px 12px",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    color: C.ink,
    outline: "none",
    boxSizing: "border-box",
    background: C.paper,
  };

  const confirmNewCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const newKey = onAddCategory(name);
    if (newKey) set({ eventType: newKey });
    setAddingCategory(false);
    setNewCategoryName("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>Tiêu đề</label>
        <textarea
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="VD: Họp nhóm dự án, Khám răng định kỳ..."
          rows={2}
          style={{ ...inputStyle, resize: "vertical", whiteSpace: "pre-wrap" }}
        />
      </div>

      <div>
        <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>Loại lịch</label>
        <select
          value={draft.eventType}
          onChange={(e) => {
            if (e.target.value === NEW_CATEGORY_VALUE) {
              setAddingCategory(true);
              setNewCategoryName("");
            } else {
              set({ eventType: e.target.value });
            }
          }}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {Object.entries(eventTypes).map(([key, t]) => (
            <option key={key} value={key}>
              {t.label}
            </option>
          ))}
          <option value={NEW_CATEGORY_VALUE}>+ Thêm danh mục mới</option>
        </select>

        {addingCategory && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              autoFocus
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmNewCategory();
                }
              }}
              placeholder="Tên danh mục mới..."
              style={{ ...inputStyle, marginTop: 0, flex: 1 }}
            />
            <button
              onClick={confirmNewCategory}
              disabled={!newCategoryName.trim()}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "0 14px",
                background: newCategoryName.trim() ? C.ink : C.line,
                color: newCategoryName.trim() ? C.paper : C.inkFaint,
                fontFamily: "Inter, sans-serif",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: newCategoryName.trim() ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              Thêm
            </button>
            <button
              onClick={() => {
                setAddingCategory(false);
                setNewCategoryName("");
              }}
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: "0 12px",
                background: "transparent",
                color: C.inkSoft,
                fontFamily: "Inter, sans-serif",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Huỷ
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>Ngày</label>
          <input
            type="date"
            value={draft.eventDate}
            min={restrictPast ? todayStr : undefined}
            onChange={(e) => {
              let v = e.target.value;
              if (restrictPast && v && v < todayStr) v = todayStr;
              const patch = { eventDate: v };
              // Landing on today with an already-past time selected: bump the time forward too,
              // so the pair (date, time) never ends up in the past together.
              if (restrictPast && v === todayStr && draft.eventTime && draft.eventTime < nowHM()) {
                patch.eventTime = nowHM();
              }
              set(patch);
            }}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>Giờ</label>
          <input
            type="time"
            value={draft.eventTime}
            min={minTime}
            onChange={(e) => {
              let v = e.target.value;
              if (restrictPast && isToday && v && v < nowHM()) v = nowHM();
              set({ eventTime: v });
            }}
            style={inputStyle}
          />
        </div>
      </div>
      {restrictPast && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, color: C.inkFaint, margin: "-6px 0 0" }}>
          Không thể đặt lịch cho ngày/giờ đã qua.
        </p>
      )}

      <div>
        <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>Địa điểm (không bắt buộc)</label>
        <input
          type="text"
          value={draft.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="VD: Phòng họp A, Bệnh viện..."
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: C.ink }}>Ghi chú (không bắt buộc)</label>
        <textarea
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Chi tiết thêm về lịch này..."
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>
    </div>
  );
}

/* modal used to edit an existing calendar event */
function EditEventModal({ event, draft, onChange, onCancel, onConfirm, onDelete, onToggleConfirm, eventTypes, onAddCategory }) {
  if (!event) return null;
  const canConfirm = draft.title.trim().length > 0 && draft.eventDate;
  const isConfirmed = !!event.confirmedAt;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(32,38,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
        overflowY: "auto",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.card, borderRadius: 16, padding: 22, width: 400, maxWidth: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", margin: "24px 0" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: isConfirmed ? 10 : 16 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: C.tealSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <CalendarClock size={18} color={C.teal} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 17, color: C.ink }}>Chỉnh sửa lịch</div>
          </div>
          <button
            onClick={() => onDelete(event.id)}
            title="Xoá lịch này"
            style={{ border: "none", background: "transparent", color: C.danger, cursor: "pointer", padding: 4, flexShrink: 0 }}
          >
            <Trash2 size={16} />
          </button>
        </div>

        {isConfirmed && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: C.doneSoft,
              color: C.done,
              borderRadius: 8,
              padding: "7px 10px",
              marginBottom: 14,
              fontFamily: "Inter, sans-serif",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={13} strokeWidth={2.5} />
            Đã xác nhận · tự động xoá sau 3 ngày kể từ lúc xác nhận
          </div>
        )}

        <EventFormFields draft={draft} onChange={onChange} idPrefix="edit-event" eventTypes={eventTypes} onAddCategory={onAddCategory} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
          <button
            onClick={onCancel}
            style={{
              border: `1px solid ${C.line}`,
              background: "transparent",
              borderRadius: 8,
              padding: "8px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              color: C.inkSoft,
              cursor: "pointer",
            }}
          >
            Huỷ
          </button>
          <button
            onClick={() => onToggleConfirm(event.id, !isConfirmed)}
            title={isConfirmed ? "Bỏ xác nhận" : "Đánh dấu đã xác nhận — lịch vẫn hiện, tự xoá sau 3 ngày"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              border: `1px solid ${isConfirmed ? C.line : C.done}`,
              background: isConfirmed ? "transparent" : C.doneSoft,
              borderRadius: 8,
              padding: "8px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              color: isConfirmed ? C.inkSoft : C.done,
              cursor: "pointer",
            }}
          >
            <CheckCircle2 size={14} strokeWidth={2.5} />
            {isConfirmed ? "Bỏ xác nhận" : "Xác nhận"}
          </button>
          <button
            disabled={!canConfirm}
            onClick={onConfirm}
            title={!canConfirm ? "Cần nhập tiêu đề và ngày" : undefined}
            style={{
              border: "none",
              background: canConfirm ? C.ink : C.line,
              color: canConfirm ? C.paper : C.inkFaint,
              borderRadius: 8,
              padding: "8px 16px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== tab content components ==================== */

function DashboardContent({ mobile, stats, staleTasks, statusChartData, trendData, eventsToday, eventsThisWeek, eventTypeChartData }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: mobile ? 10 : 14 }}>
        <StatCard label="Tổng công việc" value={stats.total} color={C.ink} mobile={mobile} />
        <StatCard label="Chưa thực hiện" value={stats.todo} color={C.amber} mobile={mobile} />
        <StatCard label="Đang thực hiện" value={stats.doing} color={C.teal} mobile={mobile} />
        <StatCard label="Đã hoàn thành" value={stats.done} color={C.done} mobile={mobile} />
        <StatCard label="Hoàn thành hôm nay" value={stats.doneToday} color={C.done} mobile={mobile} />
        <StatCard label="Tỷ lệ hoàn thành" value={`${stats.rate}%`} color={C.ink} mobile={mobile} />
        <StatCard label="Thời gian hoàn thành TB" value={stats.avgMs != null ? formatDuration(stats.avgMs) : "—"} color={C.teal} mobile={mobile} small />
        <StatCard label="Việc tồn đọng > 2 ngày" value={staleTasks.length} color={staleTasks.length ? C.danger : C.done} mobile={mobile} />
        <StatCard label="Lịch hôm nay" value={eventsToday} color={C.teal} mobile={mobile} />
        <StatCard label="Lịch tuần này" value={eventsThisWeek} color={C.amber} mobile={mobile} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: mobile ? 12 : 14, marginTop: mobile ? 18 : 22 }}>
        <SectionCard title="Phân bổ trạng thái" mobile={mobile}>
          {stats.total === 0 ? (
            <EmptyState text="Chưa có dữ liệu để hiển thị." />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: mobile ? 110 : 130, height: mobile ? 110 : 130, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
                      {statusChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, n) => [`${v} việc`, n]}
                      contentStyle={{ fontFamily: "Inter, sans-serif", fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {statusChartData.map((s) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: C.inkSoft }}>{s.name}</span>
                    <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: C.ink, marginLeft: "auto" }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Phân bổ lịch theo danh mục" mobile={mobile}>
          {eventTypeChartData.length === 0 ? (
            <EmptyState text="Chưa có lịch nào để hiển thị." />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: mobile ? 110 : 130, height: mobile ? 110 : 130, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={eventTypeChartData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
                      {eventTypeChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, n) => [`${v} lịch`, n]}
                      contentStyle={{ fontFamily: "Inter, sans-serif", fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                {eventTypeChartData.map((s) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, flexShrink: 0 }} />
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 12,
                        color: C.inkSoft,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.name}
                    </span>
                    <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: C.ink, marginLeft: "auto", flexShrink: 0 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: mobile ? 12 : 14 }}>
        <SectionCard title="Tạo mới &amp; hoàn thành trong 7 ngày qua" mobile={mobile}>
          <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: C.amber }} />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: C.inkSoft }}>Tạo mới</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: C.teal }} />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: C.inkSoft }}>Hoàn thành</span>
            </div>
          </div>
          <div style={{ width: "100%", height: mobile ? 160 : 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 18, right: 4, left: -20, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke={C.line} />
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, fill: C.inkFaint }}
                  axisLine={{ stroke: C.line }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, fill: C.inkFaint }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip
                  formatter={(v, n) => [`${v} việc`, n === "created" ? "Tạo mới" : "Hoàn thành"]}
                  contentStyle={{ fontFamily: "Inter, sans-serif", fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                />
                <Bar dataKey="created" fill={C.amber} radius={[4, 4, 0, 0]} maxBarSize={28}>
                  <LabelList dataKey="created" position="top" formatter={(v) => (v > 0 ? v : "")} style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, fill: C.amber }} />
                </Bar>
                <Bar dataKey="completed" fill={C.teal} radius={[4, 4, 0, 0]} maxBarSize={28}>
                  <LabelList dataKey="completed" position="top" formatter={(v) => (v > 0 ? v : "")} style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, fill: C.teal }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <h3 style={{ fontFamily: "Fraunces, serif", fontSize: mobile ? 16 : 18, fontWeight: 600, color: C.ink, margin: mobile ? "22px 0 10px" : "28px 0 12px" }}>
        Công việc tồn đọng
      </h3>
      {staleTasks.length === 0 ? (
        <EmptyState positive text="Không có công việc nào bị tồn đọng — bạn đang theo kịp tiến độ rất tốt!" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staleTasks.map((t) => (
            <div
              key={t.id}
              style={{
                background: C.card,
                borderLeft: `3px solid ${C.danger}`,
                borderRadius: 8,
                padding: mobile ? "10px 12px" : "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                boxShadow: "0 1px 2px rgba(32,38,31,0.06)",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: mobile ? 13 : 14,
                    color: C.ink,
                    fontWeight: 500,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {t.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                  <AlertTriangle size={11} color={C.danger} strokeWidth={2.5} />
                  <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: C.danger }}>{t.reason}</span>
                </div>
              </div>
              <StatusPill status={t.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TasksContent({
  mobile,
  input,
  onInputChange,
  onAddTask,
  newTaskNeedsResult,
  onToggleNeedsResult,
  newTaskExpectedNote,
  onNewExpectedNoteChange,
  activeTasks,
  onStatusClick,
  onDelete,
  onEdit,
}) {
  return (
    <div>
      <div style={{ marginBottom: mobile ? 16 : 20 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onAddTask();
              }
            }}
            placeholder="Nhập công việc mới... "
            rows={1}
            style={{
              flex: 1,
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              padding: mobile ? "10px 12px" : "11px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: mobile ? 13 : 14,
              color: C.ink,
              outline: "none",
              background: C.card,
              resize: "vertical",
              minHeight: mobile ? 38 : 42,
              boxSizing: "border-box",
              whiteSpace: "pre-wrap",
            }}
          />
          <button
            onClick={onAddTask}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "none",
              borderRadius: 8,
              padding: mobile ? "10px 14px" : "11px 18px",
              background: C.ink,
              color: C.paper,
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: mobile ? 12.5 : 13.5,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            {!mobile && "Thêm"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: C.inkSoft }}>Khi hoàn thành:</span>
          <div style={{ display: "inline-flex", background: "#E4E7DC", borderRadius: 999, padding: 3, gap: 2 }}>
            {[
              { key: false, label: "Không có kết quả" },
              { key: true, label: "Có kết quả" },
            ].map((opt) => (
              <button
                key={String(opt.key)}
                onClick={() => onToggleNeedsResult(opt.key)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: newTaskNeedsResult === opt.key ? C.ink : "transparent",
                  color: newTaskNeedsResult === opt.key ? C.paper : C.inkSoft,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {newTaskNeedsResult && (
          <div style={{ marginTop: 10, padding: 12, border: `1px solid ${C.line}`, borderRadius: 10, background: "rgba(255,255,255,0.5)" }}>
            <NoteField
              value={newTaskExpectedNote}
              onChange={onNewExpectedNoteChange}
              label="Mô tả mong đợi / ghi chú minh chứng"
              placeholder="Mô tả bạn cần làm gì để chứng minh đã hoàn thành việc này..."
            />
          </div>
        )}
      </div>

      {activeTasks.length === 0 ? (
        <EmptyState text="Chưa có công việc nào đang chờ. Thêm việc đầu tiên của bạn ở trên." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeTasks.map((t) => {
            const lockTodo = t.status === "doing";
            return (
              <div
                key={t.id}
                style={{
                  background: C.card,
                  borderLeft: `3px solid ${STATUS[t.status].color}`,
                  borderRadius: 8,
                  padding: mobile ? "12px" : "14px 16px",
                  boxShadow: "0 1px 2px rgba(32,38,31,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: mobile ? 13.5 : 14.5,
                        fontWeight: 500,
                        color: C.ink,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {t.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: C.inkFaint }}>Tạo ngày {formatVN(t.createdAt)}</span>
                      {t.requiresResult && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontFamily: "Inter, sans-serif",
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: C.teal,
                            background: C.tealSoft,
                            padding: "2px 8px",
                            borderRadius: 999,
                          }}
                        >
                          <FileCheck2 size={10} strokeWidth={2.5} />
                          Yêu cầu kết quả
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button
                      onClick={() => onEdit(t)}
                      style={{ border: "none", background: "transparent", color: C.inkFaint, cursor: "pointer", padding: 4 }}
                      title="Sửa công việc"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => onDelete(t.id)}
                      style={{ border: "none", background: "transparent", color: C.inkFaint, cursor: "pointer", padding: 4 }}
                      title="Xoá công việc"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {Object.keys(STATUS).map((s) => {
                    const disabled = s === "todo" && lockTodo;
                    const active = t.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => !disabled && onStatusClick(t, s)}
                        disabled={disabled}
                        title={disabled ? "Đã bắt đầu thực hiện — không thể quay lại" : undefined}
                        style={{
                          border: active ? "none" : `1px solid ${C.line}`,
                          cursor: disabled ? "not-allowed" : "pointer",
                          borderRadius: 999,
                          padding: "4px 10px",
                          background: active ? STATUS[s].color : "transparent",
                          color: active ? "#fff" : disabled ? C.inkFaint : C.inkSoft,
                          opacity: disabled ? 0.45 : 1,
                          fontFamily: "Inter, sans-serif",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {STATUS[s].label}
                      </button>
                    );
                  })}
                </div>

                <TaskTimerStrip task={t} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CAL_ROW_H = { mobile: 40, desktop: 46 };
const CAL_TIME_COL_W = { mobile: 38, desktop: 52 };
const CAL_DAY_COL_W = { mobile: 84, desktop: 112 };
const CAL_HOURS = Array.from({ length: 24 }, (_, i) => i);

function WeekCalendarGrid({ mobile, weekStart, events, onEventClick, eventTypes }) {
  const scrollRef = React.useRef(null);
  const rowH = mobile ? CAL_ROW_H.mobile : CAL_ROW_H.desktop;
  const timeColW = mobile ? CAL_TIME_COL_W.mobile : CAL_TIME_COL_W.desktop;
  const dayColW = mobile ? CAL_DAY_COL_W.mobile : CAL_DAY_COL_W.desktop;
  const today = todayISO();

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // group events by day so each day column can lay itself out by exact hour+minute
  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      if (!ev.eventTime) return;
      if (!map[ev.eventDate]) map[ev.eventDate] = [];
      map[ev.eventDate].push(ev);
    });
    return map;
  }, [events]);

  // auto-scroll to a sensible starting hour whenever the visible week changes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 6 * rowH;
  }, [weekStart, rowH]);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", background: C.card }}>
      <div ref={scrollRef} style={{ maxHeight: mobile ? 440 : 560, overflow: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${timeColW}px repeat(7, minmax(${dayColW}px, 1fr))`,
            gridTemplateRows: `auto repeat(24, minmax(${rowH}px, auto))`,
            minWidth: timeColW + dayColW * 7,
          }}
        >
          <div
            style={{
              gridColumn: 1,
              gridRow: 1,
              position: "sticky",
              top: 0,
              left: 0,
              zIndex: 3,
              background: C.card,
              borderBottom: `1px solid ${C.line}`,
              borderRight: `1px solid ${C.line}`,
            }}
          />
          {weekDates.map((d, i) => {
            const iso = localISODate(d);
            const isToday = iso === today;
            return (
              <div
                key={i}
                style={{
                  gridColumn: i + 2,
                  gridRow: 1,
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: C.card,
                  borderBottom: `1px solid ${C.line}`,
                  borderLeft: `1px solid ${C.line}`,
                  textAlign: "center",
                  padding: "7px 4px",
                }}
              >
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 600, color: isToday ? C.teal : C.inkFaint }}>
                  {WEEKDAY_LABELS_SHORT[d.getDay()]}
                </div>
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: mobile ? 12.5 : 14,
                    fontWeight: 700,
                    color: isToday ? "#fff" : C.ink,
                    marginTop: 3,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: isToday ? C.teal : "transparent",
                  }}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}

          {CAL_HOURS.map((hour) => (
            <React.Fragment key={hour}>
              <div
                style={{
                  gridColumn: 1,
                  gridRow: hour + 2,
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  background: C.card,
                  borderRight: `1px solid ${C.line}`,
                  borderTop: `1px solid ${C.line}`,
                  textAlign: "right",
                  padding: "2px 5px",
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: 9.5,
                  color: C.inkFaint,
                  whiteSpace: "nowrap",
                }}
              >
                {pad2(hour)}:00
              </div>
              {weekDates.map((d, di) => {
                const iso = localISODate(d);
                const isToday = iso === today;
                return (
                  <div
                    key={di}
                    style={{
                      gridColumn: di + 2,
                      gridRow: hour + 2,
                      borderTop: `1px solid ${C.line}`,
                      borderLeft: `1px solid ${C.line}`,
                      background: isToday ? "rgba(47,111,94,0.05)" : "transparent",
                      minHeight: rowH,
                    }}
                  />
                );
              })}
            </React.Fragment>
          ))}

          {/* overlay: one relative-positioned wrapper per day, spanning all 24 hour rows,
              so events can be placed by exact hour+minute instead of snapping to the hour */}
          {weekDates.map((d, di) => {
            const iso = localISODate(d);
            const positioned = layoutDayEvents(eventsByDay[iso] || [], rowH);
            if (positioned.length === 0) return null;
            return (
              <div key={`ov-${di}`} style={{ gridColumn: di + 2, gridRow: "2 / span 24", position: "relative", pointerEvents: "none" }}>
                {positioned.map(({ ev, top }) => {
                  const t = eventTypes[ev.eventType] || eventTypes.appointment;
                  const confirmed = !!ev.confirmedAt;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onEventClick(ev)}
                      title={confirmed ? `${ev.title} · Đã xác nhận` : ev.title}
                      style={{
                        position: "absolute",
                        top: top + 1,
                        left: 2,
                        right: 2,
                        pointerEvents: "auto",
                        textAlign: "left",
                        border: confirmed ? `1px dashed ${t.color}` : "none",
                        cursor: "pointer",
                        borderRadius: 5,
                        padding: mobile ? "2px 4px" : "3px 6px",
                        background: confirmed ? "transparent" : t.soft,
                        color: t.color,
                        opacity: confirmed ? 0.6 : 1,
                        fontFamily: "Inter, sans-serif",
                        fontSize: mobile ? 9.5 : 10.5,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        textDecoration: confirmed ? "line-through" : "none",
                        zIndex: 1,
                      }}
                    >
                      {confirmed ? "✓ " : ""}
                      {formatTimeHM(ev.eventTime)} {ev.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* mobile: compact 7-day selector strip shown above the day timeline */
function DayStrip({ weekDates, selectedDate, onSelect, events }) {
  const todayIso = todayISO();
  const selIso = localISODate(selectedDate);
  const datesWithEvents = useMemo(() => new Set(events.map((e) => e.eventDate)), [events]);
  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
      {weekDates.map((d, i) => {
        const iso = localISODate(d);
        const isSel = iso === selIso;
        const isToday = iso === todayIso;
        return (
          <button
            key={i}
            onClick={() => onSelect(d)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              border: "none",
              cursor: "pointer",
              borderRadius: 10,
              padding: "6px 2px 7px",
              background: isSel ? C.ink : "transparent",
            }}
          >
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 9.5,
                fontWeight: 600,
                color: isSel ? C.paper : isToday ? C.teal : C.inkFaint,
              }}
            >
              {WEEKDAY_LABELS_SHORT[d.getDay()]}
            </span>
            <span
              style={{
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: 13,
                fontWeight: 700,
                color: isSel ? C.paper : isToday ? C.teal : C.ink,
              }}
            >
              {d.getDate()}
            </span>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: 999,
                background: datesWithEvents.has(iso) ? (isSel ? C.paper : C.teal) : "transparent",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/* mobile: single-day hour-by-hour timeline (columns=day is implicit since there's only one) */
function DayTimeline({ selectedDate, events, onEventClick, eventTypes }) {
  const rowH = 52;
  const dateIso = localISODate(selectedDate);
  const isToday = dateIso === todayISO();

  const dayEvents = useMemo(() => events.filter((e) => e.eventDate === dateIso && e.eventTime), [events, dateIso]);

  // hide the quiet late-night/early-morning hours by default, but always show any hour that has an event
  const [expanded, setExpanded] = useState(false);
  const hasEventOutsideRange = dayEvents.some((ev) => {
    const h = parseInt(ev.eventTime.slice(0, 2), 10);
    return h < 6 || h > 21;
  });
  const visibleHours = expanded || hasEventOutsideRange ? CAL_HOURS : CAL_HOURS.filter((h) => h >= 6 && h <= 21);
  const startHour = visibleHours[0];
  const endHour = visibleHours[visibleHours.length - 1];

  // position events by exact hour+minute within the visible range (not snapped to the hour)
  const positioned = useMemo(() => {
    const inRange = dayEvents.filter((ev) => {
      const h = parseInt(ev.eventTime.slice(0, 2), 10);
      return h >= startHour && h <= endHour;
    });
    return layoutDayEvents(inRange, rowH).map((p) => ({ ...p, top: p.top - startHour * rowH }));
  }, [dayEvents, startHour, endHour]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: "Fraunces, serif", fontSize: 14.5, fontWeight: 600, color: C.ink }}>
          {isToday ? "Hôm nay" : WEEKDAY_LABELS_FULL[selectedDate.getDay()]}, {selectedDate.getDate()} Thg {MONTHS[selectedDate.getMonth()]}
        </span>
        {dayEvents.length > 0 && (
          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: C.inkFaint }}>{dayEvents.length} lịch</span>
        )}
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", background: C.card }}>
        {!expanded && !hasEventOutsideRange && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              width: "100%",
              border: "none",
              borderBottom: `1px solid ${C.line}`,
              background: "transparent",
              cursor: "pointer",
              padding: "6px 10px",
              fontFamily: "Inter, sans-serif",
              fontSize: 10.5,
              fontWeight: 600,
              color: C.inkFaint,
              textAlign: "center",
            }}
          >
            Xem thêm giờ trong ngày (0:00–5:00, 22:00–23:00)
          </button>
        )}
        <div style={{ display: "flex" }}>
          <div style={{ width: 46, flexShrink: 0 }}>
            {visibleHours.map((hour, idx) => (
              <div
                key={hour}
                style={{
                  height: rowH,
                  borderTop: idx === 0 ? "none" : `1px solid ${C.line}`,
                  textAlign: "right",
                  padding: "3px 8px",
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: 10,
                  color: C.inkFaint,
                  boxSizing: "border-box",
                }}
              >
                {pad2(hour)}:00
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative", borderLeft: `1px solid ${C.line}`, height: visibleHours.length * rowH }}>
            {visibleHours.map((hour, idx) => (
              <div
                key={hour}
                style={{
                  position: "absolute",
                  top: idx * rowH,
                  left: 0,
                  right: 0,
                  height: rowH,
                  borderTop: idx === 0 ? "none" : `1px solid ${C.line}`,
                  boxSizing: "border-box",
                }}
              />
            ))}
            {positioned.map(({ ev, top }) => {
              const t = eventTypes[ev.eventType] || eventTypes.appointment;
              const confirmed = !!ev.confirmedAt;
              return (
                <button
                  key={ev.id}
                  onClick={() => onEventClick(ev)}
                  style={{
                    position: "absolute",
                    top: top + 2,
                    left: 6,
                    right: 6,
                    textAlign: "left",
                    border: confirmed ? `1px dashed ${t.color}` : "none",
                    cursor: "pointer",
                    borderRadius: 8,
                    padding: "6px 9px",
                    background: confirmed ? "transparent" : t.soft,
                    opacity: confirmed ? 0.6 : 1,
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: t.color }}>
                    {confirmed && <CheckCircle2 size={11} strokeWidth={2.5} />}
                    {formatTimeHM(ev.eventTime)} · {t.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: C.ink,
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textDecoration: confirmed ? "line-through" : "none",
                    }}
                  >
                    {ev.title}
                  </div>
                  {ev.location && <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 2 }}>{ev.location}</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarContent({ mobile, eventDraft, onEventDraftChange, onAddEvent, events, onEdit, eventTypes, onAddCategory }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showAddForm, setShowAddForm] = useState(!mobile);
  const missingRequired = eventDraft.title.trim().length === 0 || !eventDraft.eventDate;
  const isPast = !missingRequired && isPastDateTime(eventDraft.eventDate, eventDraft.eventTime);
  const canAdd = !missingRequired && !isPast;

  // default the add-event panel to collapsed on mobile / expanded on web, but only
  // when switching between the two — the person can still toggle it manually after
  useEffect(() => {
    setShowAddForm(!mobile);
  }, [mobile]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // if the selected day ever falls outside the displayed week (e.g. after a reload), snap back to Monday
  useEffect(() => {
    const selIso = localISODate(selectedDate);
    if (!weekDates.some((d) => localISODate(d) === selIso)) setSelectedDate(weekDates[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const goPrevWeek = () => {
    setWeekStart((w) => addDays(w, -7));
    setSelectedDate((d) => addDays(d, -7));
  };
  const goNextWeek = () => {
    setWeekStart((w) => addDays(w, 7));
    setSelectedDate((d) => addDays(d, 7));
  };
  const goToday = () => {
    setWeekStart(getWeekStart(new Date()));
    setSelectedDate(new Date());
  };

  const handleAdd = async () => {
    await onAddEvent();
    if (mobile) setShowAddForm(false);
  };

  const weekEnd = addDays(weekStart, 6);
  const rangeLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getDate()} – ${weekEnd.getDate()} Thg ${MONTHS[weekStart.getMonth()]}, ${weekStart.getFullYear()}`
      : `${weekStart.getDate()} Thg ${MONTHS[weekStart.getMonth()]} – ${weekEnd.getDate()} Thg ${MONTHS[weekEnd.getMonth()]}, ${weekEnd.getFullYear()}`;

  return (
    <div>
      {mobile && !showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            border: `1.5px dashed ${C.line}`,
            borderRadius: 10,
            padding: "10px 14px",
            background: C.card,
            color: C.teal,
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: 12.5,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Thêm lịch mới
        </button>
      ) : (
        <div style={{ background: C.card, borderRadius: 10, padding: mobile ? 14 : "16px 18px", boxShadow: "0 1px 2px rgba(32,38,31,0.06)", marginBottom: mobile ? 16 : 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: mobile ? 12.5 : 13.5, color: C.ink }}>Thêm lịch mới</div>
            {mobile && (
              <button
                onClick={() => setShowAddForm(false)}
                title="Thu gọn"
                style={{ border: "none", background: "transparent", color: C.inkFaint, cursor: "pointer", padding: 2 }}
              >
                <ChevronLeft size={14} style={{ transform: "rotate(90deg)" }} />
              </button>
            )}
          </div>
          <EventFormFields draft={eventDraft} onChange={onEventDraftChange} idPrefix="new-event" eventTypes={eventTypes} onAddCategory={onAddCategory} restrictPast />
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            title={!canAdd ? (missingRequired ? "Cần nhập tiêu đề và ngày" : "Không thể đặt lịch cho thời điểm đã qua") : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "none",
              borderRadius: 8,
              padding: mobile ? "10px 14px" : "10px 16px",
              background: canAdd ? C.ink : C.line,
              color: canAdd ? C.paper : C.inkFaint,
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: mobile ? 12.5 : 13.5,
              cursor: canAdd ? "pointer" : "not-allowed",
              marginTop: 14,
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Thêm vào lịch
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: mobile ? 6 : 10, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: "Fraunces, serif", fontSize: mobile ? 13.5 : 16, fontWeight: 600, color: C.ink }}>{rangeLabel}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={goPrevWeek}
            title="Tuần trước"
            style={{ border: `1px solid ${C.line}`, background: C.card, borderRadius: 6, padding: "5px 6px", cursor: "pointer", color: C.inkSoft, display: "flex" }}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={goToday}
            style={{
              border: `1px solid ${C.line}`,
              background: C.card,
              borderRadius: 6,
              padding: "5px 10px",
              cursor: "pointer",
              color: C.inkSoft,
              fontFamily: "Inter, sans-serif",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            Hôm nay
          </button>
          <button
            onClick={goNextWeek}
            title="Tuần sau"
            style={{ border: `1px solid ${C.line}`, background: C.card, borderRadius: 6, padding: "5px 6px", cursor: "pointer", color: C.inkSoft, display: "flex" }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {mobile ? (
        <>
          <DayStrip weekDates={weekDates} selectedDate={selectedDate} onSelect={setSelectedDate} events={events} />
          <DayTimeline selectedDate={selectedDate} events={events} onEventClick={onEdit} eventTypes={eventTypes} />
        </>
      ) : (
        <WeekCalendarGrid mobile={false} weekStart={weekStart} events={events} onEventClick={onEdit} eventTypes={eventTypes} />
      )}
    </div>
  );
}

function ArchiveContent({ mobile, archiveGroups, onRestore, onDelete }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: C.tealSoft,
          color: C.teal,
          borderRadius: 8,
          padding: "7px 10px",
          marginBottom: 16,
          fontFamily: "Inter, sans-serif",
          fontSize: 11.5,
          fontWeight: 600,
        }}
      >
        <Clock3 size={13} strokeWidth={2.5} />
        Chỉ lưu {ARCHIVE_RETENTION_DAYS} ngày gần nhất · việc hoàn thành quá {ARCHIVE_RETENTION_DAYS} ngày sẽ tự động bị xoá
      </div>

      {archiveGroups.length === 0 ? (
        <EmptyState text="Chưa có công việc nào được lưu trữ. Hoàn thành một việc để lưu vào đây." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {archiveGroups.map(([date, items]) => (
            <div key={date}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, borderBottom: `1px solid ${C.line}`, paddingBottom: 6 }}>
                <span style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: mobile ? 14 : 15.5, color: C.ink }}>{formatVN(date)}</span>
                <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: C.inkFaint }}>{items.length} việc</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((t) => (
                  <div key={t.id} style={{ background: C.card, borderRadius: 8, padding: mobile ? "10px 12px" : "11px 14px", boxShadow: "0 1px 2px rgba(32,38,31,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: mobile ? 13 : 14,
                            color: C.ink,
                            fontWeight: 500,
                            textDecoration: "line-through",
                            textDecorationColor: C.inkFaint,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {t.title}
                        </div>
                        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: C.inkFaint, marginTop: 3 }}>Tạo {formatVN(t.createdAt)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => onRestore(t.id)}
                          title="Khôi phục về đang thực hiện"
                          style={{ border: `1px solid ${C.line}`, background: "transparent", borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: C.inkSoft }}
                        >
                          <RotateCcw size={13} />
                        </button>
                        <button
                          onClick={() => onDelete(t.id)}
                          title="Xoá vĩnh viễn"
                          style={{ border: `1px solid ${C.line}`, background: "transparent", borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: C.danger }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <TaskTimerStrip task={t} />
                    {t.expectedNote && (
                      <div style={{ marginTop: 8, fontFamily: "Inter, sans-serif", fontSize: 11, color: C.inkFaint, fontStyle: "italic" }}>
                        Yêu cầu ban đầu: {t.expectedNote}
                      </div>
                    )}
                    {t.result && (t.result.text || (t.result.files && t.result.files.length > 0)) && (
                      <div style={{ marginTop: 6, padding: "8px 10px", background: C.doneSoft, borderRadius: 8 }}>
                        {t.result.text && (
                          <div
                            style={{
                              fontFamily: "Inter, sans-serif",
                              fontSize: 11.5,
                              color: C.ink,
                              marginBottom: t.result.files && t.result.files.length > 0 ? 6 : 0,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {t.result.text}
                          </div>
                        )}
                        {t.result.files && t.result.files.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {t.result.files.map((f, i) => (
                              <div key={f.id || i}>
                                {f.isImage && f.fileUrl && (
                                  <img
                                    src={f.fileUrl}
                                    alt={f.fileName}
                                    style={{ width: "100%", maxHeight: 130, objectFit: "cover", borderRadius: 8, marginBottom: 4 }}
                                  />
                                )}
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    fontFamily: "IBM Plex Mono, monospace",
                                    fontSize: 10.5,
                                    color: C.done,
                                  }}
                                >
                                  <Paperclip size={11} strokeWidth={2.5} />
                                  {f.fileName}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
  @keyframes fuse-flicker { 0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 50% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.7; } }
  .file-drop {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1.5px dashed ${C.line};
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    background: ${C.paper};
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .file-drop:hover {
    border-color: ${C.teal};
    background: ${C.tealSoft};
  }
`;

/* ==================== main app: owns all state, renders layout + tabs ==================== */
export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState("dashboard");
  const [device, setDevice] = useState(detectDevice);
  const [input, setInput] = useState("");
  const [newTaskNeedsResult, setNewTaskNeedsResult] = useState(false);
  const [newTaskExpectedNote, setNewTaskExpectedNote] = useState("");
  const [completingTaskId, setCompletingTaskId] = useState(null);
  const [resultDraft, setResultDraft] = useState({ text: "", files: [] });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: "", requiresResult: false, expectedNote: "" });
  const [events, setEvents] = useState([]);
  const [eventDraft, setEventDraft] = useState(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editEventDraft, setEditEventDraft] = useState(emptyEventForm);
  // user-created calendar categories, layered on top of BASE_EVENT_TYPES (see "+ Thêm danh mục mới")
  const [customEventTypes, setCustomEventTypes] = useState({
    personal: { label: "Cá nhân", color: CUSTOM_TYPE_PALETTE[0].color, soft: CUSTOM_TYPE_PALETTE[0].soft },
  });
  const eventTypes = useMemo(() => ({ ...BASE_EVENT_TYPES, ...customEventTypes }), [customEventTypes]);
  const [, setTick] = useState(0);

  // load tasks + calendar events from Supabase once when the app opens
  useEffect(() => {
    Promise.all([dbFetchTasks(), dbFetchEvents()])
      .then(([taskRows, eventRows]) => {
        // drop any archived (done) tasks that already fell outside the 7-day
        // retention window while the app was closed (and clean them up in storage too)
        const expiredTasks = taskRows.filter(isArchivedTaskExpired);
        expiredTasks.forEach((t) => dbDeleteTask(t.id).catch(() => {}));
        setTasks(taskRows.filter((t) => !isArchivedTaskExpired(t)));

        // drop any confirmed events that already passed their 3-day auto-delete window
        // while the app was closed (and clean them up in storage too)
        const expiredEvents = eventRows.filter(isConfirmedExpired);
        expiredEvents.forEach((ev) => dbDeleteEvent(ev.id).catch(() => {}));
        setEvents(eventRows.filter((ev) => !isConfirmedExpired(ev)));
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // re-render every minute so live "doing" timers stay accurate, and sweep away
  // archived tasks past their 7-day retention window and confirmed calendar
  // events that have just crossed their 3-day auto-delete window
  useEffect(() => {
    const id = setInterval(() => {
      setTick((n) => n + 1);
      setTasks((prev) => {
        const expired = prev.filter(isArchivedTaskExpired);
        if (expired.length === 0) return prev;
        expired.forEach((t) => dbDeleteTask(t.id).catch(() => {}));
        return prev.filter((t) => !isArchivedTaskExpired(t));
      });
      setEvents((prev) => {
        const expired = prev.filter(isConfirmedExpired);
        if (expired.length === 0) return prev;
        expired.forEach((ev) => dbDeleteEvent(ev.id).catch(() => {}));
        return prev.filter((ev) => !isConfirmedExpired(ev));
      });
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const mobile = device === "mobile";

  // Appends every file picked in a multi-select to the draft's file list
  // (rather than replacing a single slot), and tags each with a unique id
  // so it can be individually removed later. Uploads each file to Supabase
  // Storage right away so fileUrl is a real, persistent URL (not a local
  // blob: URL that disappears on reload).
  const addFilesInto = (setter) => async (fileList) => {
    const picked = Array.from(fileList || []);
    if (picked.length === 0) return;

    // Show files immediately with a temporary local preview while uploading.
    const pending = picked.map((file) => ({
      file,
      isImage: file.type.startsWith("image/"),
      tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    setter((prev) => ({
      ...prev,
      files: [
        ...prev.files,
        ...pending.map((p) => ({
          id: p.tempId,
          fileName: p.file.name,
          fileUrl: p.isImage ? URL.createObjectURL(p.file) : null,
          isImage: p.isImage,
          uploading: true,
        })),
      ],
    }));

    for (const p of pending) {
      try {
        const uploaded = await uploadResultFile(p.file);
        setter((prev) => ({
          ...prev,
          files: prev.files.map((f) => (f.id === p.tempId ? { ...f, fileUrl: uploaded.fileUrl, uploading: false } : f)),
        }));
      } catch (err) {
        setter((prev) => ({
          ...prev,
          files: prev.files.map((f) => (f.id === p.tempId ? { ...f, uploading: false, uploadError: err.message } : f)),
        }));
      }
    }
  };

  const removeFileFrom = (setter) => (fileId) => {
    setter((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== fileId) }));
  };

  const addTask = async () => {
    const title = input.trim();
    if (!title) return;
    const draft = {
      title,
      status: "todo",
      createdAt: todayISO(),
      requiresResult: newTaskNeedsResult,
      expectedNote: newTaskNeedsResult ? newTaskExpectedNote.trim() : null,
    };
    setInput("");
    setNewTaskNeedsResult(false);
    setNewTaskExpectedNote("");
    try {
      const saved = await dbInsertTask(draft);
      setTasks((prev) => [saved, ...prev]);
    } catch (err) {
      alert("Không thêm được việc: " + err.message);
    }
  };

  const setStatus = async (id, newStatus) => {
    const current = tasks.find((t) => t.id === id);
    if (!current) return;
    if (current.status === "doing" && newStatus === "todo") return;
    let { startedAt, completedAt, completedAtTs } = current;
    if (newStatus === "doing" && !startedAt) startedAt = new Date().toISOString();
    if (newStatus === "done") {
      if (!startedAt) startedAt = new Date().toISOString();
      completedAt = todayISO();
      completedAtTs = Date.now();
    } else {
      completedAt = null;
      completedAtTs = null;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus, startedAt, completedAt, completedAtTs } : t)));
    try {
      await dbUpdateTaskStatus(id, { status: newStatus, startedAt, completedAt, completedAtTs });
    } catch (err) {
      alert("Không lưu được thay đổi: " + err.message);
    }
  };

  const handleStatusClick = (task, newStatus) => {
    if (newStatus === "todo" && task.status === "doing") return;
    if (newStatus === "done" && task.requiresResult) {
      setResultDraft({
        text: task.result?.text || "",
        files: task.result?.files || [],
      });
      setCompletingTaskId(task.id);
      return;
    }
    setStatus(task.id, newStatus);
  };

  const confirmCompletionWithResult = async () => {
    if (!resultDraft.text.trim() && resultDraft.files.length === 0) return;
    const id = completingTaskId;
    const current = tasks.find((t) => t.id === id);
    const startedAt = current?.startedAt || new Date().toISOString();
    const completedAt = todayISO();
    const completedAtTs = Date.now();
    const result = { text: resultDraft.text.trim(), files: resultDraft.files };
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "done", startedAt, completedAt, completedAtTs, result } : t)));
    setCompletingTaskId(null);
    try {
      await dbUpdateTaskStatus(id, { status: "done", startedAt, completedAt, completedAtTs });
      await dbSaveResult(id, result);
    } catch (err) {
      alert("Không lưu được kết quả: " + err.message);
    }
  };

  const restoreTask = (id) => setStatus(id, "doing");

  const deleteTask = async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await dbDeleteTask(id);
    } catch (err) {
      alert("Không xoá được việc: " + err.message);
    }
  };

  const openEditTask = (task) => {
    setEditDraft({
      title: task.title,
      requiresResult: task.requiresResult,
      expectedNote: task.expectedNote || "",
    });
    setEditingTaskId(task.id);
  };

  const confirmEditTask = async () => {
    const title = editDraft.title.trim();
    if (!title) return;
    const id = editingTaskId;
    const requiresResult = editDraft.requiresResult;
    const expectedNote = requiresResult ? editDraft.expectedNote.trim() : null;

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title, requiresResult, expectedNote } : t))
    );
    setEditingTaskId(null);

    try {
      await dbUpdateTask(id, { title, requiresResult, expectedNote });
    } catch (err) {
      alert("Không lưu được thay đổi: " + err.message);
    }
  };

  const addEvent = async () => {
    const title = eventDraft.title.trim();
    if (!title || !eventDraft.eventDate) return;
    // Belt-and-suspenders: re-check here too, in case the form sat open long enough
    // for the originally-valid time to slip into the past before the button was pressed.
    if (isPastDateTime(eventDraft.eventDate, eventDraft.eventTime)) {
      alert("Không thể đặt lịch cho thời điểm đã qua. Vui lòng chọn lại ngày/giờ.");
      return;
    }
    const draft = {
      ...eventDraft,
      title,
      description: eventDraft.description.trim(),
      location: eventDraft.location.trim(),
    };
    setEventDraft(emptyEventForm());
    try {
      const saved = await dbInsertEvent(draft);
      setEvents((prev) => [...prev, saved]);
    } catch (err) {
      alert("Không thêm được lịch: " + err.message);
    }
  };

  // creates a new calendar category from the "+ Thêm danh mục mới" dropdown option
  // and returns its key so the form can select it immediately
  const addEventCategory = (name) => {
    const key = `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const palette = CUSTOM_TYPE_PALETTE[Object.keys(customEventTypes).length % CUSTOM_TYPE_PALETTE.length];
    setCustomEventTypes((prev) => ({ ...prev, [key]: { label: name, color: palette.color, soft: palette.soft } }));
    return key;
  };

  const openEditEvent = (event) => {
    setEditEventDraft({
      title: event.title,
      eventType: event.eventType,
      eventDate: event.eventDate,
      eventTime: event.eventTime ? formatTimeHM(event.eventTime) : "",
      location: event.location || "",
      description: event.description || "",
    });
    setEditingEventId(event.id);
  };

  const confirmEditEvent = async () => {
    const title = editEventDraft.title.trim();
    if (!title || !editEventDraft.eventDate) return;
    const id = editingEventId;
    const draft = { ...editEventDraft, title, description: editEventDraft.description.trim(), location: editEventDraft.location.trim() };

    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === id
          ? {
              ...ev,
              title: draft.title,
              eventType: draft.eventType,
              eventDate: draft.eventDate,
              eventTime: draft.eventTime || null,
              location: draft.location || null,
              description: draft.description || null,
            }
          : ev
      )
    );
    setEditingEventId(null);

    try {
      await dbUpdateEvent(id, draft);
    } catch (err) {
      alert("Không lưu được thay đổi: " + err.message);
    }
  };

  const deleteEvent = async (id) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setEditingEventId((cur) => (cur === id ? null : cur));
    try {
      await dbDeleteEvent(id);
    } catch (err) {
      alert("Không xoá được lịch: " + err.message);
    }
  };

  // marks/unmarks a calendar event as "Xác nhận" — the event keeps showing (with a
  // distinct look) rather than being deleted right away; it only auto-deletes
  // CONFIRMED_AUTO_DELETE_MS after confirmedAt (see the pruning effects above)
  const toggleEventConfirm = async (id, confirm) => {
    const confirmedAt = confirm ? new Date().toISOString() : null;
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, confirmedAt } : ev)));
    try {
      await dbSetEventConfirmed(id, confirmedAt);
    } catch (err) {
      alert("Không cập nhật được trạng thái xác nhận: " + err.message);
    }
  };

  // count of events today or later, used for the sidebar badge on the calendar tab
  const upcomingEventCount = useMemo(() => events.filter((ev) => ev.eventDate >= todayISO()).length, [events]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [tasks]
  );
  const doneTasks = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const todo = tasks.filter((t) => t.status === "todo").length;
    const doing = tasks.filter((t) => t.status === "doing").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const doneToday = tasks.filter((t) => t.status === "done" && t.completedAt === todayISO()).length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    const durations = tasks
      .filter((t) => t.status === "done" && t.completedAtTs && t.startedAt)
      .map((t) => t.completedAtTs - new Date(t.startedAt).getTime());
    const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    return { total, todo, doing, done, doneToday, rate, avgMs };
  }, [tasks]);

  const staleTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (t.status === "todo") return daysSince(t.createdAt) >= 2;
        if (t.status === "doing") return t.startedAt && daysSince(t.startedAt) >= 3;
        return false;
      })
      .map((t) => ({
        ...t,
        days: t.status === "todo" ? daysSince(t.createdAt) : daysSince(t.startedAt),
        reason: t.status === "todo" ? `Chưa bắt đầu sau ${daysSince(t.createdAt)} ngày` : `Đang thực hiện ${daysSince(t.startedAt)} ngày chưa xong`,
      }))
      .sort((a, b) => b.days - a.days);
  }, [tasks]);

  const archiveGroups = useMemo(() => {
    const groups = {};
    doneTasks.forEach((t) => {
      const key = t.completedAt || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [doneTasks]);

  const statusChartData = useMemo(
    () => [
      { name: "Chưa thực hiện", value: stats.todo, color: C.amber },
      { name: "Đang thực hiện", value: stats.doing, color: C.teal },
      { name: "Đã hoàn thành", value: stats.done, color: C.done },
    ],
    [stats]
  );

  const trendData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = localISODate(d);
      days.push({
        iso,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        created: tasks.filter((t) => t.createdAt === iso).length,
        completed: tasks.filter((t) => t.completedAt === iso).length,
      });
    }
    return days;
  }, [tasks]);

  // calendar stats for the dashboard: today / this-week counts, category breakdown
  const eventsToday = useMemo(() => events.filter((ev) => ev.eventDate === todayISO()).length, [events]);
  const eventsThisWeek = useMemo(() => {
    const start = getWeekStart(new Date());
    const startIso = localISODate(start);
    const endIso = localISODate(addDays(start, 6));
    return events.filter((ev) => ev.eventDate >= startIso && ev.eventDate <= endIso).length;
  }, [events]);

  const eventTypeChartData = useMemo(
    () =>
      Object.entries(eventTypes)
        .map(([key, t]) => ({ name: t.label, value: events.filter((ev) => ev.eventType === key).length, color: t.color }))
        .filter((d) => d.value > 0),
    [events, eventTypes]
  );

  const titleFor = (key) => NAV_ITEMS.find((n) => n.key === key)?.label;

  const renderView = () => {
    if (view === "dashboard")
      return (
        <DashboardContent
          mobile={mobile}
          stats={stats}
          staleTasks={staleTasks}
          statusChartData={statusChartData}
          trendData={trendData}
          eventsToday={eventsToday}
          eventsThisWeek={eventsThisWeek}
          eventTypeChartData={eventTypeChartData}
        />
      );
    if (view === "tasks")
      return (
        <TasksContent
          mobile={mobile}
          input={input}
          onInputChange={setInput}
          onAddTask={addTask}
          newTaskNeedsResult={newTaskNeedsResult}
          onToggleNeedsResult={setNewTaskNeedsResult}
          newTaskExpectedNote={newTaskExpectedNote}
          onNewExpectedNoteChange={setNewTaskExpectedNote}
          activeTasks={activeTasks}
          onStatusClick={handleStatusClick}
          onDelete={deleteTask}
          onEdit={openEditTask}
        />
      );
    if (view === "calendar")
      return (
        <CalendarContent
          mobile={mobile}
          eventDraft={eventDraft}
          onEventDraftChange={setEventDraft}
          onAddEvent={addEvent}
          events={events}
          onEdit={openEditEvent}
          eventTypes={eventTypes}
          onAddCategory={addEventCategory}
        />
      );
    return <ArchiveContent mobile={mobile} archiveGroups={archiveGroups} onRestore={restoreTask} onDelete={deleteTask} />;
  };

  const completingTask = completingTaskId != null ? tasks.find((t) => t.id === completingTaskId) : null;
  const editingTask = editingTaskId != null ? tasks.find((t) => t.id === editingTaskId) : null;
  const editingEvent = editingEventId != null ? events.find((ev) => ev.id === editingEventId) : null;
  const modal = completingTask ? (
    <ResultModal
      task={completingTask}
      resultDraft={resultDraft}
      onTextChange={(v) => setResultDraft((prev) => ({ ...prev, text: v }))}
      onAddFiles={addFilesInto(setResultDraft)}
      onRemoveFile={removeFileFrom(setResultDraft)}
      onCancel={() => setCompletingTaskId(null)}
      onConfirm={confirmCompletionWithResult}
    />
  ) : editingTask ? (
    <EditTaskModal
      task={editingTask}
      draft={editDraft}
      onTitleChange={(v) => setEditDraft((prev) => ({ ...prev, title: v }))}
      onToggleNeedsResult={(v) => setEditDraft((prev) => ({ ...prev, requiresResult: v }))}
      onExpectedNoteChange={(v) => setEditDraft((prev) => ({ ...prev, expectedNote: v }))}
      onCancel={() => setEditingTaskId(null)}
      onConfirm={confirmEditTask}
    />
  ) : editingEvent ? (
    <EditEventModal
      event={editingEvent}
      draft={editEventDraft}
      onChange={setEditEventDraft}
      onCancel={() => setEditingEventId(null)}
      onConfirm={confirmEditEvent}
      onDelete={deleteEvent}
      onToggleConfirm={toggleEventConfirm}
      eventTypes={eventTypes}
      onAddCategory={addEventCategory}
    />
  ) : null;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", color: C.inkSoft }}>
        <style>{GLOBAL_STYLE}</style>
        Đang tải dữ liệu...
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 24, textAlign: "center" }}>
        <style>{GLOBAL_STYLE}</style>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontWeight: 700, color: C.danger, marginBottom: 8 }}>Không tải được dữ liệu</div>
          <div style={{ color: C.inkSoft, fontSize: 13 }}>{loadError}</div>
          <div style={{ color: C.inkFaint, fontSize: 12, marginTop: 10 }}>
            Kiểm tra lại VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong file .env, và đảm bảo đã chạy schema.sql trong Supabase.
          </div>
        </div>
      </div>
    );
  }

  if (mobile) {
    return (
      <div style={{ minHeight: "100vh", background: C.paper, display: "flex", justifyContent: "center", padding: "24px 12px", fontFamily: "Inter, sans-serif" }}>
        <style>{GLOBAL_STYLE}</style>
        <div
          style={{
            width: 380,
            maxWidth: "100%",
            background: C.paper,
            borderRadius: 34,
            border: `8px solid ${C.ink}`,
            boxShadow: "0 12px 34px rgba(32,38,31,0.22)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "16px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 17, color: C.ink }}>Việc Của Tôi</div>
              <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 1 }}>{titleFor(view)}</div>
            </div>
            <DeviceToggle device={device} onChange={setDevice} compact />
          </div>

          <div style={{ height: 560, overflowY: "auto", padding: "6px 16px 16px" }}>{renderView()}</div>

          <div style={{ display: "flex", borderTop: `1px solid ${C.line}`, background: C.card, padding: "8px 6px", gap: 4 }}>
            {NAV_ITEMS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  padding: "6px 0",
                  color: view === key ? C.teal : C.inkFaint,
                }}
              >
                <Icon size={18} strokeWidth={2.3} />
                <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
        {modal}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.paper, fontFamily: "Inter, sans-serif", display: "flex", justifyContent: "center", padding: "28px 32px" }}>
      <style>{GLOBAL_STYLE}</style>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", gap: 24 }}>
        <aside style={{ width: 216, flexShrink: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: C.ink }}>Việc Của Tôi</div>
            <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2 }}>Danh sách cá nhân</div>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {NAV_ITEMS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: "10px 10px 0 0",
                  background: view === key ? C.card : "transparent",
                  color: view === key ? C.ink : C.inkSoft,
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 600,
                  fontSize: 13.5,
                  boxShadow: view === key ? "0 1px 2px rgba(32,38,31,0.08)" : "none",
                  position: "relative",
                }}
              >
                <Icon size={16} strokeWidth={2.3} />
                {label}
                {key === "tasks" && activeTasks.length > 0 && (
                  <span style={{ marginLeft: "auto", fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: C.inkFaint }}>{activeTasks.length}</span>
                )}
                {key === "archive" && doneTasks.length > 0 && (
                  <span style={{ marginLeft: "auto", fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: C.inkFaint }}>{doneTasks.length}</span>
                )}
                {key === "calendar" && upcomingEventCount > 0 && (
                  <span style={{ marginLeft: "auto", fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: C.inkFaint }}>
                    {upcomingEventCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div>
            <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 6, fontWeight: 600 }}>GIAO DIỆN</div>
            <DeviceToggle device={device} onChange={setDevice} />
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 24, color: C.ink, margin: "4px 0 18px" }}>{titleFor(view)}</h2>
          {renderView()}
        </main>
      </div>
      {modal}
    </div>
  );
}