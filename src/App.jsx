import React, { useState, useMemo, useEffect } from "react";
import {
  LayoutDashboard,
  ListTodo,
  Archive,
  Plus,
  Trash2,
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

const STATUS = {
  todo: { label: "Chưa thực hiện", color: C.amber, soft: C.amberSoft, Icon: Circle },
  doing: { label: "Đang thực hiện", color: C.teal, soft: C.tealSoft, Icon: Clock3 },
  done: { label: "Đã hoàn thành", color: C.done, soft: C.doneSoft, Icon: CheckCircle2 },
};

const NAV_ITEMS = [
  { key: "dashboard", label: "Tổng quan", Icon: LayoutDashboard },
  { key: "tasks", label: "Công việc", Icon: ListTodo },
  { key: "archive", label: "Lưu trữ", Icon: Archive },
];

/* ---------- seed data ---------- */
const seedTasks = [
  {
    id: 1,
    title: "Soạn báo cáo tuần cho quản lý",
    status: "doing",
    createdAt: tsDaysAgo(5).slice(0, 10),
    startedAt: tsDaysAgo(4),
    completedAt: null,
    completedAtTs: null,
    requiresResult: true,
    expectedNote: "Đính kèm bản báo cáo hoàn chỉnh trước khi gửi cho quản lý.",
    result: null,
  },
  {
    id: 2,
    title: "Đặt lịch khám sức khỏe định kỳ",
    status: "todo",
    createdAt: tsDaysAgo(3).slice(0, 10),
    startedAt: null,
    completedAt: null,
    completedAtTs: null,
    requiresResult: false,
    expectedNote: null,
    result: null,
  },
  {
    id: 3,
    title: "Mua quà sinh nhật cho mẹ",
    status: "done",
    createdAt: tsDaysAgo(4).slice(0, 10),
    startedAt: tsDaysAgo(3),
    completedAt: tsDaysAgo(1).slice(0, 10),
    completedAtTs: new Date(tsDaysAgo(1)).getTime(),
    requiresResult: true,
    expectedNote: "Chụp ảnh hoặc ghi chú xác nhận đã mua và gói quà xong.",
    result: { text: "Đã mua ví da tặng mẹ và gói quà xong.", fileName: "vi-da-tang-me.jpg", fileUrl: null, isImage: false },
  },
  {
    id: 4,
    title: "Dọn dẹp lại góc làm việc",
    status: "done",
    createdAt: tsDaysAgo(6).slice(0, 10),
    startedAt: tsDaysAgo(5),
    completedAt: tsDaysAgo(1).slice(0, 10),
    completedAtTs: new Date(tsDaysAgo(1, 6)).getTime(),
    requiresResult: false,
    expectedNote: null,
    result: null,
  },
  {
    id: 5,
    title: "Trả sách đã mượn ở thư viện",
    status: "done",
    createdAt: tsDaysAgo(9).slice(0, 10),
    startedAt: tsDaysAgo(7),
    completedAt: tsDaysAgo(5).slice(0, 10),
    completedAtTs: new Date(tsDaysAgo(5)).getTime(),
    requiresResult: false,
    expectedNote: null,
    result: null,
  },
  {
    id: 6,
    title: "Lên kế hoạch chi tiêu tháng tới",
    status: "todo",
    createdAt: tsDaysAgo(1).slice(0, 10),
    startedAt: null,
    completedAt: null,
    completedAtTs: null,
    requiresResult: false,
    expectedNote: null,
    result: null,
  },
  {
    id: 7,
    title: "Ôn tập tiếng Anh 30 phút",
    status: "doing",
    createdAt: tsDaysAgo(1).slice(0, 10),
    startedAt: tsDaysAgo(0, 2),
    completedAt: null,
    completedAtTs: null,
    requiresResult: false,
    expectedNote: null,
    result: null,
  },
];

/* ==================== Supabase data layer ==================== */
// Converts a DB row (snake_case, task_results as a nested array) into the
// camelCase task shape the rest of the app already works with.
function mapRow(row) {
  const r = Array.isArray(row.task_results) ? row.task_results[0] : row.task_results;
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
    result: r ? { text: r.text, fileName: r.file_name, fileUrl: r.file_url, isImage: r.is_image } : null,
  };
}

async function dbFetchTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_results(*)")
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

async function dbUpdateTaskStatus(id, { status, startedAt, completedAt, completedAtTs }) {
  const { error } = await supabase
    .from("tasks")
    .update({ status, started_at: startedAt, completed_at: completedAt, completed_at_ts: completedAtTs ? new Date(completedAtTs).toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

async function dbUpsertResult(taskId, result) {
  const { error } = await supabase.from("task_results").upsert({
    task_id: taskId,
    text: result.text || null,
    file_name: result.fileName || null,
    file_url: result.fileUrl || null,
    is_image: result.isImage || false,
  });
  if (error) throw error;
}

async function dbDeleteTask(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// Uploads a File to the "task-files" storage bucket and returns a public URL.
// Falls back to a local (non-persistent) preview URL if the bucket isn't set up yet.
async function uploadResultFile(file) {
  const isImage = file.type.startsWith("image/");
  const path = `${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("task-files").upload(path, file);
  if (error) {
    console.warn("Tải tệp lên Supabase Storage thất bại, dùng xem trước cục bộ:", error.message);
    return { fileName: file.name, fileUrl: isImage ? URL.createObjectURL(file) : null, isImage };
  }
  const { data } = supabase.storage.from("task-files").getPublicUrl(path);
  return { fileName: file.name, fileUrl: isImage ? data.publicUrl : null, isImage };
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
function ResultEditor({ idPrefix, text, onTextChange, fileName, fileUrl, isImage, onPickFile, onRemoveFile, placeholder }) {
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
            {fileName ? "Đổi tệp khác" : "Chọn tệp minh chứng (không bắt buộc)"}
          </div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: C.inkFaint, marginTop: 1 }}>Hình ảnh, Word hoặc PDF</div>
        </div>
      </label>
      <input
        id={`${idPrefix}-file-input`}
        type="file"
        accept="image/*,.doc,.docx,.pdf"
        onChange={(e) => onPickFile(e.target.files[0] || null)}
        style={{ display: "none" }}
      />

      {isImage && fileUrl && (
        <img src={fileUrl} alt={fileName || "minh chứng"} style={{ width: "100%", maxHeight: 150, objectFit: "cover", borderRadius: 10, marginTop: 10 }} />
      )}
      {fileName && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: isImage && fileUrl ? 6 : 10,
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
            {isImage ? <ImageIcon size={13} color={C.teal} strokeWidth={2.2} /> : <FileText size={13} color={C.teal} strokeWidth={2.2} />}
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
            {fileName}
          </div>
          <button
            onClick={onRemoveFile}
            title="Bỏ chọn tệp"
            style={{ border: "none", background: "transparent", color: C.inkFaint, cursor: "pointer", padding: 3, flexShrink: 0 }}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function ResultModal({ task, resultDraft, onTextChange, onPickFile, onRemoveFile, onCancel, onConfirm }) {
  if (!task) return null;
  const canConfirm = resultDraft.text.trim().length > 0 || !!resultDraft.fileName;
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
          fileName={resultDraft.fileName}
          fileUrl={resultDraft.fileUrl}
          isImage={resultDraft.isImage}
          onPickFile={onPickFile}
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

/* ==================== tab content components ==================== */

function DashboardContent({ mobile, stats, staleTasks, statusChartData, trendData }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: mobile ? 10 : 14 }}>
        <StatCard label="Tổng công việc" value={stats.total} color={C.ink} mobile={mobile} />
        <StatCard label="Chưa thực hiện" value={stats.todo} color={C.amber} mobile={mobile} />
        <StatCard label="Đang thực hiện" value={stats.doing} color={C.teal} mobile={mobile} />
        <StatCard label="Đã hoàn thành" value={stats.done} color={C.done} mobile={mobile} />
        <StatCard label="Hoàn thành hôm nay" value={stats.doneToday} color={C.done} mobile={mobile} />
        <StatCard label="Tỷ lệ hoàn thành" value={`${stats.rate}%`} color={C.ink} mobile={mobile} />
        <StatCard label="Thời gian hoàn thành TB" value={stats.avgMs != null ? formatDuration(stats.avgMs) : "—"} color={C.teal} mobile={mobile} small />
        <StatCard label="Việc tồn đọng > 2 ngày" value={staleTasks.length} color={staleTasks.length ? C.danger : C.done} mobile={mobile} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1.4fr", gap: mobile ? 12 : 14, marginTop: mobile ? 18 : 22 }}>
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
          <div style={{ width: "100%", height: mobile ? 150 : 170 }}>
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
                <Bar dataKey="created" fill={C.amber} radius={[4, 4, 0, 0]} maxBarSize={16}>
                  <LabelList dataKey="created" position="top" formatter={(v) => (v > 0 ? v : "")} style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, fill: C.amber }} />
                </Bar>
                <Bar dataKey="completed" fill={C.teal} radius={[4, 4, 0, 0]} maxBarSize={16}>
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
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: mobile ? 13 : 14,
                    color: C.ink,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
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
}) {
  return (
    <div>
      <div style={{ marginBottom: mobile ? 16 : 20 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddTask()}
            placeholder="Nhập công việc mới..."
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
              padding: mobile ? "0 14px" : "0 18px",
              background: C.ink,
              color: C.paper,
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: mobile ? 12.5 : 13.5,
              cursor: "pointer",
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
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: mobile ? 13.5 : 14.5, fontWeight: 500, color: C.ink }}>{t.title}</div>
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
                  <button
                    onClick={() => onDelete(t.id)}
                    style={{ border: "none", background: "transparent", color: C.inkFaint, cursor: "pointer", padding: 4, flexShrink: 0 }}
                    title="Xoá công việc"
                  >
                    <Trash2 size={15} />
                  </button>
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

function ArchiveContent({ mobile, archiveGroups, onRestore, onDelete }) {
  return (
    <div>
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
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: mobile ? 13 : 14,
                            color: C.ink,
                            fontWeight: 500,
                            textDecoration: "line-through",
                            textDecorationColor: C.inkFaint,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
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
                    {t.result && (t.result.text || t.result.fileName) && (
                      <div style={{ marginTop: 6, padding: "8px 10px", background: C.doneSoft, borderRadius: 8 }}>
                        {t.result.text && (
                          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: C.ink, marginBottom: t.result.fileName ? 6 : 0 }}>{t.result.text}</div>
                        )}
                        {t.result.isImage && t.result.fileUrl && (
                          <img src={t.result.fileUrl} alt={t.result.fileName} style={{ width: "100%", maxHeight: 130, objectFit: "cover", borderRadius: 8, marginBottom: 6 }} />
                        )}
                        {t.result.fileName && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: C.done }}>
                            <Paperclip size={11} strokeWidth={2.5} />
                            {t.result.fileName}
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
  const [resultDraft, setResultDraft] = useState({ text: "", fileName: null, fileUrl: null, isImage: false });
  const [, setTick] = useState(0);

  // load tasks from Supabase once when the app opens
  useEffect(() => {
    dbFetchTasks()
      .then((rows) => setTasks(rows))
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // re-render every minute so live "doing" timers stay accurate
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const mobile = device === "mobile";

  // picking a file now uploads it to Supabase Storage and stores the public URL
  const pickFileInto = (setter) => async (file) => {
    if (!file) {
      setter((prev) => ({ ...prev, fileName: null, fileUrl: null, isImage: false }));
      return;
    }
    setter((prev) => ({ ...prev, fileName: file.name, uploading: true }));
    const uploaded = await uploadResultFile(file);
    setter((prev) => ({ ...prev, ...uploaded, uploading: false }));
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
        fileName: task.result?.fileName || null,
        fileUrl: task.result?.fileUrl || null,
        isImage: task.result?.isImage || false,
      });
      setCompletingTaskId(task.id);
      return;
    }
    setStatus(task.id, newStatus);
  };

  const confirmCompletionWithResult = async () => {
    if (!resultDraft.text.trim() && !resultDraft.fileName) return;
    const id = completingTaskId;
    const startedAt = tasks.find((t) => t.id === id)?.startedAt || new Date().toISOString();
    const completedAt = todayISO();
    const completedAtTs = Date.now();
    const result = { text: resultDraft.text.trim(), fileName: resultDraft.fileName, fileUrl: resultDraft.fileUrl, isImage: resultDraft.isImage };
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "done", startedAt, completedAt, completedAtTs, result } : t)));
    setCompletingTaskId(null);
    try {
      await dbUpdateTaskStatus(id, { status: "done", startedAt, completedAt, completedAtTs });
      await dbUpsertResult(id, result);
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

  function detectDevice() {
  if (typeof window === "undefined") return "web";
  const ua = navigator.userAgent || "";
  const isPhoneUA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  const isNarrowScreen = window.matchMedia("(max-width: 768px)").matches;
  return isPhoneUA || isNarrowScreen ? "mobile" : "web";
  }

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
      const iso = d.toISOString().slice(0, 10);
      days.push({
        iso,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        created: tasks.filter((t) => t.createdAt === iso).length,
        completed: tasks.filter((t) => t.completedAt === iso).length,
      });
    }
    return days;
  }, [tasks]);

  const titleFor = (key) => NAV_ITEMS.find((n) => n.key === key)?.label;

  const renderView = () => {
    if (view === "dashboard") return <DashboardContent mobile={mobile} stats={stats} staleTasks={staleTasks} statusChartData={statusChartData} trendData={trendData} />;
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
        />
      );
    return <ArchiveContent mobile={mobile} archiveGroups={archiveGroups} onRestore={restoreTask} onDelete={deleteTask} />;
  };

  const completingTask = completingTaskId != null ? tasks.find((t) => t.id === completingTaskId) : null;
  const modal = completingTask ? (
    <ResultModal
      task={completingTask}
      resultDraft={resultDraft}
      onTextChange={(v) => setResultDraft((prev) => ({ ...prev, text: v }))}
      onPickFile={pickFileInto(setResultDraft)}
      onRemoveFile={() => setResultDraft((prev) => ({ ...prev, fileName: null, fileUrl: null, isImage: false }))}
      onCancel={() => setCompletingTaskId(null)}
      onConfirm={confirmCompletionWithResult}
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
    <div style={{ minHeight: "100vh", background: C.paper, fontFamily: "Inter, sans-serif", display: "flex", justifyContent: "center", padding: "28px 20px" }}>
      <style>{GLOBAL_STYLE}</style>
      <div style={{ width: "100%", maxWidth: 1040, display: "flex", gap: 20 }}>
        <aside style={{ width: 208, flexShrink: 0, display: "flex", flexDirection: "column", gap: 18 }}>
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
