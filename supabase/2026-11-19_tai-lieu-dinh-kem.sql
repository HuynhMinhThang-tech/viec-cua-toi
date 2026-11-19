-- ============================================================
-- CẬP NHẬT DB — Tài liệu đính kèm (tệp + liên kết) + vài sửa lỗi
-- Dán toàn bộ nội dung này vào Supabase → SQL Editor → Run.
--
-- QUAN TRỌNG — thứ tự: chạy file này TRƯỚC, rồi mới deploy bản code mới.
--   (Chỉ THÊM bảng / bucket / hàm; không xoá hay đổi dữ liệu cũ, nên bản code
--    cũ đang chạy vẫn dùng bình thường trong lúc chờ deploy.)
-- An toàn khi chạy lại nhiều lần.
-- ============================================================

-- ------------------------------------------------------------
-- 1) BẢNG TÀI LIỆU ĐÍNH KÈM
-- Mỗi việc có thể có nhiều tài liệu. Có 2 loại:
--   kind = 'file' : tệp tải lên bucket riêng tư "task-attachments" (storage_path)
--   kind = 'link' : liên kết dán vào dạng chữ (url) — VD link cuộc trò chuyện ChatGPT
-- Tài liệu sống cùng việc: xoá việc (hoặc việc quá 7 ngày lưu trữ) thì dòng tài liệu
-- tự xoá theo (ON DELETE CASCADE). Riêng TỆP THẬT trong Storage thì DB không tự xoá —
-- app tự dọn qua API mỗi khi xoá việc / gỡ tài liệu.
-- ------------------------------------------------------------
create table if not exists task_attachments (
  id              bigint generated always as identity primary key,
  task_id         bigint not null references tasks(id) on delete cascade,
  kind            text not null check (kind in ('file', 'link')),
  name            text not null,                 -- tên hiển thị (tên tệp gốc / tên liên kết)
  url             text,                          -- liên kết (kind='link'), hoặc URL cũ của tệp chuyển từ cơ chế "kết quả"
  storage_path    text,                          -- đường dẫn trong bucket (kind='file' tải lên mới)
  is_image        boolean not null default false,
  size_bytes      bigint,
  legacy_file_id  bigint unique,                 -- dấu vết chuyển từ task_result_files (để chạy lại không bị nhân đôi)
  created_at      timestamptz not null default now(),
  constraint task_attachments_has_target check (
    (kind = 'link' and url is not null)
    or (kind = 'file' and (storage_path is not null or url is not null))
  )
);

create index if not exists idx_task_attachments_task_id on task_attachments (task_id);

alter table task_attachments enable row level security;

-- Chỉ chủ của việc mới đọc/ghi được tài liệu của việc đó (cùng cách với task_result_files)
drop policy if exists "own task_attachments" on task_attachments;
create policy "own task_attachments"
  on task_attachments for all
  using (exists (select 1 from tasks t where t.id = task_attachments.task_id and t.user_id = auth.uid()))
  with check (exists (select 1 from tasks t where t.id = task_attachments.task_id and t.user_id = auth.uid()));

-- Chuyển các tệp minh chứng cũ (cơ chế "kết quả" đã bỏ) sang tài liệu đính kèm để không mất.
-- Tệp cũ nằm ở bucket công khai "task-files" nên giữ nguyên URL cũ. Bỏ qua link tạm "blob:" (đã hỏng từ lâu).
-- Ghi chú chữ cũ (bảng task_results) KHÔNG xoá — vẫn nằm nguyên trong DB, chỉ là app không còn hiển thị.
insert into task_attachments (task_id, kind, name, url, is_image, legacy_file_id, created_at)
select f.task_id, 'file', f.file_name, f.file_url, f.is_image, f.id, f.created_at
from task_result_files f
where f.file_url is not null
  and f.file_url not like 'blob:%'
on conflict (legacy_file_id) do nothing;

-- ------------------------------------------------------------
-- 2) BUCKET RIÊNG TƯ CHO TỆP ĐÍNH KÈM
-- Khác bucket cũ "task-files" (công khai — ai có link cũng xem được), bucket này riêng tư:
-- app xem tệp qua link ký tạm thời (signed URL), và mỗi tài khoản chỉ đụng được vào thư mục
-- có tên đúng user_id của mình (đường dẫn tệp: <user_id>/<task_id>/<tên ngẫu nhiên>).
-- Giới hạn 20 MB / tệp (khớp hằng ATTACH_MAX_BYTES trong App.jsx).
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "task_attachments_select_own" on storage.objects;
create policy "task_attachments_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "task_attachments_insert_own" on storage.objects;
create policy "task_attachments_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "task_attachments_delete_own" on storage.objects;
create policy "task_attachments_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- 3) SỬA: policy "admins read all profiles" tự truy vấn chính bảng profiles
-- → Postgres có thể báo lỗi "infinite recursion detected in policy". Đổi sang dùng hàm
-- is_admin() (security definer nên không bị policy chặn vòng lại).
-- ------------------------------------------------------------
drop policy if exists "admins read all profiles" on profiles;
create policy "admins read all profiles"
  on profiles for select
  using (public.is_admin());

-- ------------------------------------------------------------
-- 4) SỬA: App gọi supabase.rpc("ensure_profile") nhưng file SQL cũ không định nghĩa hàm này.
-- Hàm tạo bù dòng profiles cho tài khoản đang đăng nhập (nếu thiếu) rồi trả về dòng đó.
-- ------------------------------------------------------------
drop function if exists public.ensure_profile();
create function public.ensure_profile()
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Chưa đăng nhập';
  end if;

  insert into public.profiles (id, email, display_name)
  select u.id, u.email, u.raw_user_meta_data->>'display_name'
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;

  select * into result from public.profiles where id = auth.uid();
  return result;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

-- ------------------------------------------------------------
-- GHI CHÚ
-- • Bảng event_categories đã có sẵn trong schema cũ và giờ được app dùng thật
--   (danh mục lịch tự tạo không còn mất khi tải lại trang) — không cần sửa gì thêm.
-- • Cột tasks.requires_result / tasks.expected_note và bảng task_results / task_result_files
--   được GIỮ NGUYÊN (app không còn dùng) để không mất dữ liệu cũ. Muốn dọn có thể xoá sau.
-- • Nếu bật pg_cron để dọn việc quá 7 ngày phía server: lệnh xoá đó chỉ xoá DÒNG, tệp thật
--   trong Storage sẽ bị bỏ lại. Cứ để app tự dọn (mỗi lần mở app + mỗi phút) là đủ.
-- • Bucket cũ "task-files" không còn được app dùng; có thể xoá trong Supabase → Storage
--   khi không cần các tệp minh chứng cũ nữa (tệp cũ vẫn mở được cho tới lúc đó).
-- ------------------------------------------------------------

notify pgrst, 'reload schema';
