alter table public.score_trajectory
  drop constraint if exists score_trajectory_scan_type_check;

alter table public.score_trajectory
  add constraint score_trajectory_scan_type_check
  check (scan_type in (
    'weekly_debate',
    'collector_crop_progress',
    'collector_grain_monitor',
    'collector_export_sales',
    'collector_cgc',
    'collector_cftc_cot',
    'collector_wasde',
    'collector_producer_cars',
    'opus_review_crop_progress',
    'opus_review_grain_monitor',
    'opus_review_export_sales',
    'opus_review_cgc',
    'opus_review_cftc_cot',
    'opus_review_wasde',
    'opus_review_producer_cars',
    'opus_review_daily_pulse'
  ));

comment on constraint score_trajectory_scan_type_check on public.score_trajectory is
  'Allowed scan_type values for the CAD score_trajectory writer pipeline. opus_review_daily_pulse is the bounded daily official+price+X Pulse review lane; Friday weekly_debate remains thesis-of-record.';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'us_score_trajectory'
  ) then
    execute 'alter table public.us_score_trajectory drop constraint if exists us_score_trajectory_scan_type_check';
    execute $sql$
      alter table public.us_score_trajectory
      add constraint us_score_trajectory_scan_type_check
      check (scan_type in (
        'weekly_debate',
        'collector_crop_progress',
        'collector_grain_monitor',
        'collector_export_sales',
        'collector_cgc',
        'collector_cftc_cot',
        'collector_wasde',
        'collector_producer_cars',
        'opus_review_crop_progress',
        'opus_review_grain_monitor',
        'opus_review_export_sales',
        'opus_review_cgc',
        'opus_review_cftc_cot',
        'opus_review_wasde',
        'opus_review_producer_cars',
        'opus_review_daily_pulse'
      ))
    $sql$;
  end if;
end $$;

notify pgrst, 'reload schema';
