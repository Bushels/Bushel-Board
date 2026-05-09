-- Test harness for 20260419120000_bio_trial_vendor_status_derive.sql
--
-- Not a migration. Run this manually against the linked Supabase project
-- AFTER the fix migration has been applied:
--
--   psql "$(supabase db url)" -v ON_ERROR_STOP=1 \
--     -f supabase/migrations/20260419120000_bio_trial_vendor_status_derive.test.sql
--
-- Exercises forward + reverse transitions end-to-end. Restores the test
-- signup row to its pristine state on success. On failure, raises with the
-- observed vs expected values so the state is visible before rollback.

begin;

do $test$
declare
  v_vendor_uid constant uuid := '18558030-118e-4940-8155-eb71cfba0b6f';
  v_signup_id  constant uuid := '366d90a0-4f7c-42c1-8c11-aef4b595f35d';
  v_snapshot bio_trial.signups%rowtype;
  v_result jsonb;
  v_status text;
begin
  select * into v_snapshot from bio_trial.signups where id = v_signup_id;
  if not found then
    raise exception 'test precondition failed: signup % not found', v_signup_id;
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_vendor_uid::text, 'role', 'authenticated')::text,
    true
  );

  -- Forward 1: paid + liters → status='approved', payment_status='paid'.
  v_result := public.vendor_update_bio_trial_signup(v_signup_id, '{"paid":true,"liters":10}'::jsonb);
  v_status := v_result->>'status';
  if v_status <> 'approved' then
    raise exception 'forward 1 failed: expected status=approved, got %', v_status;
  end if;
  if (v_result->>'payment_status') <> 'paid' then
    raise exception 'forward 1 failed: expected payment_status=paid, got %', v_result->>'payment_status';
  end if;
  if (v_result->>'payment_confirmed_at') is null then
    raise exception 'forward 1 failed: payment_confirmed_at should be stamped';
  end if;

  -- Forward 2: delivered → status='completed', delivered_at + access_granted_at stamped.
  v_result := public.vendor_update_bio_trial_signup(v_signup_id, '{"delivered":true}'::jsonb);
  v_status := v_result->>'status';
  if v_status <> 'completed' then
    raise exception 'forward 2 failed: expected status=completed, got %', v_status;
  end if;
  if (v_result->>'product_delivered_at') is null then
    raise exception 'forward 2 failed: product_delivered_at should be stamped';
  end if;
  if (v_result->>'access_granted_at') is null then
    raise exception 'forward 2 failed: access_granted_at should be stamped';
  end if;

  -- Reverse 1: the originally-reported bug. Clearing delivered + paid + liters
  -- must demote status to 'new' (all timestamps null, payment_status='pending').
  v_result := public.vendor_update_bio_trial_signup(
    v_signup_id,
    '{"delivered":false,"paid":false,"liters":null}'::jsonb
  );
  v_status := v_result->>'status';
  if v_status <> 'new' then
    raise exception 'reverse 1 (primary regression) failed: expected status=new, got %  (full result: %)', v_status, v_result::text;
  end if;
  if (v_result->>'product_delivered_at') is not null then
    raise exception 'reverse 1 failed: product_delivered_at should be null';
  end if;
  if (v_result->>'access_granted_at') is not null then
    raise exception 'reverse 1 failed: access_granted_at should be null';
  end if;
  if (v_result->>'payment_confirmed_at') is not null then
    raise exception 'reverse 1 failed: payment_confirmed_at should be null';
  end if;
  if (v_result->>'payment_status') <> 'pending' then
    raise exception 'reverse 1 failed: expected payment_status=pending, got %', v_result->>'payment_status';
  end if;

  -- Reverse 2 (priority check): re-apply paid+delivered then flip ONLY delivered
  -- back — payment is still 'paid', so status must demote to 'approved' (not 'new').
  perform public.vendor_update_bio_trial_signup(v_signup_id, '{"paid":true,"liters":10,"delivered":true}'::jsonb);
  v_result := public.vendor_update_bio_trial_signup(v_signup_id, '{"delivered":false}'::jsonb);
  v_status := v_result->>'status';
  if v_status <> 'approved' then
    raise exception 'reverse 2 (priority) failed: expected status=approved (paid persists), got %', v_status;
  end if;

  -- Reverse 3 (shipped tier): add shipped=true to the 'approved' row above.
  -- Status should move to 'shipped'. Then clear shipped → back to 'approved'.
  v_result := public.vendor_update_bio_trial_signup(v_signup_id, '{"shipped":true}'::jsonb);
  v_status := v_result->>'status';
  if v_status <> 'shipped' then
    raise exception 'reverse 3a (shipped forward) failed: expected status=shipped, got %', v_status;
  end if;
  v_result := public.vendor_update_bio_trial_signup(v_signup_id, '{"shipped":false}'::jsonb);
  v_status := v_result->>'status';
  if v_status <> 'approved' then
    raise exception 'reverse 3b (shipped clear) failed: expected status=approved, got %', v_status;
  end if;

  -- Restore snapshot so the test signup row stays clean for re-runs.
  update bio_trial.signups set
    status               = v_snapshot.status,
    payment_status       = v_snapshot.payment_status,
    payment_confirmed_at = v_snapshot.payment_confirmed_at,
    liters_purchased     = v_snapshot.liters_purchased,
    product_shipped_at   = v_snapshot.product_shipped_at,
    product_delivered_at = v_snapshot.product_delivered_at,
    access_granted_at    = v_snapshot.access_granted_at,
    vendor_notes         = v_snapshot.vendor_notes
  where id = v_signup_id;

  raise notice 'ALL TESTS PASSED — forward + reverse paths verified, test row restored';
end;
$test$;

commit;
