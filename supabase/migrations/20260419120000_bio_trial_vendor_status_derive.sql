-- Bio trial vendor RPC — status derivation fix
--
-- Bug (verified 2026-04-18): a patch that clears forward flags leaves a stale
-- status. E.g. {delivered: true} stamps status='completed'; a follow-up call
-- with {delivered: false, paid: false, liters: null} correctly clears
-- product_delivered_at, access_granted_at, payment_confirmed_at, and resets
-- payment_status='pending' — but status stays 'completed'.
--
-- Root cause: the previous UPDATE expressed status as a CASE over the *patch*
-- deltas (forward transitions only), with `else status` preserving the stale
-- value on reverse paths.
--
-- Fix: compute the effective post-update values in PL/pgSQL locals first, then
-- derive status as a pure function of those effectives. Priority is
-- completed > shipped > approved > new, so the status is symmetric in both
-- directions by construction — no enumeration of forward/reverse deltas
-- needed. SELECT ... FOR UPDATE locks the row so the read-compute-write
-- sequence is race-free.

create or replace function public.vendor_update_bio_trial_signup(
  p_signup_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'bio_trial'
as $$
declare
  v_row bio_trial.signups%rowtype;
  v_paid boolean;
  v_liters numeric;
  v_delivered boolean;
  v_shipped boolean;
  v_notes text;
  v_allowed_keys constant text[] := array['paid','liters','delivered','shipped','notes'];
  k text;

  -- Effective post-update values. Populated by merging the patch over v_row.
  v_eff_payment_status text;
  v_eff_payment_confirmed_at timestamptz;
  v_eff_liters_purchased numeric;
  v_eff_product_shipped_at timestamptz;
  v_eff_product_delivered_at timestamptz;
  v_eff_access_granted_at timestamptz;
  v_eff_vendor_notes text;
  v_new_status text;
begin
  if not bio_trial.is_vendor() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  -- Fail closed on unknown keys so typos don't silently become no-ops.
  for k in select jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) loop
    if not (k = any(v_allowed_keys)) then
      raise exception 'unknown patch key: %', k using errcode = '22023';
    end if;
  end loop;

  v_paid      := case when p_patch ? 'paid'      then (p_patch->>'paid')::boolean      end;
  v_liters    := case when p_patch ? 'liters'    then (p_patch->>'liters')::numeric    end;
  v_delivered := case when p_patch ? 'delivered' then (p_patch->>'delivered')::boolean end;
  v_shipped   := case when p_patch ? 'shipped'   then (p_patch->>'shipped')::boolean   end;
  v_notes     := case when p_patch ? 'notes'     then p_patch->>'notes'                end;

  if v_liters is not null and v_liters < 0 then
    raise exception 'liters must be >= 0';
  end if;

  -- Row lock prevents concurrent vendor updates from interleaving their
  -- effective-state computations against the same signup.
  select * into v_row from bio_trial.signups where id = p_signup_id for update;
  if not found then
    raise exception 'signup not found: %', p_signup_id;
  end if;

  -- Payment: paid=true → 'paid' + stamp confirmed_at on false→true; paid=false
  -- clears confirmed_at. Unpatched keys preserve the current row value.
  if p_patch ? 'paid' then
    v_eff_payment_status := case when v_paid then 'paid' else 'pending' end;
    v_eff_payment_confirmed_at := case
      when v_paid and v_row.payment_confirmed_at is null then now()
      when v_paid then v_row.payment_confirmed_at
      else null
    end;
  else
    v_eff_payment_status := v_row.payment_status;
    v_eff_payment_confirmed_at := v_row.payment_confirmed_at;
  end if;

  -- Liters: null in the patch clears the column.
  v_eff_liters_purchased := case when p_patch ? 'liters' then v_liters else v_row.liters_purchased end;

  -- Shipped: stamps product_shipped_at on false→true; clears on true→false.
  if p_patch ? 'shipped' then
    v_eff_product_shipped_at := case
      when v_shipped and v_row.product_shipped_at is null then now()
      when v_shipped then v_row.product_shipped_at
      else null
    end;
  else
    v_eff_product_shipped_at := v_row.product_shipped_at;
  end if;

  -- Delivered + access_granted move together (delivery gates trial access).
  if p_patch ? 'delivered' then
    v_eff_product_delivered_at := case
      when v_delivered and v_row.product_delivered_at is null then now()
      when v_delivered then v_row.product_delivered_at
      else null
    end;
    v_eff_access_granted_at := case
      when v_delivered and v_row.access_granted_at is null then now()
      when v_delivered then v_row.access_granted_at
      else null
    end;
  else
    v_eff_product_delivered_at := v_row.product_delivered_at;
    v_eff_access_granted_at := v_row.access_granted_at;
  end if;

  v_eff_vendor_notes := case when p_patch ? 'notes' then v_notes else v_row.vendor_notes end;

  -- Derive status as a pure function of effective state.
  -- Priority: completed > shipped > approved > new.
  v_new_status := case
    when v_eff_product_delivered_at is not null then 'completed'
    when v_eff_product_shipped_at is not null then 'shipped'
    when v_eff_payment_status = 'paid' then 'approved'
    else 'new'
  end;

  update bio_trial.signups set
    payment_status       = v_eff_payment_status,
    payment_confirmed_at = v_eff_payment_confirmed_at,
    liters_purchased     = v_eff_liters_purchased,
    product_shipped_at   = v_eff_product_shipped_at,
    product_delivered_at = v_eff_product_delivered_at,
    access_granted_at    = v_eff_access_granted_at,
    status               = v_new_status,
    vendor_notes         = v_eff_vendor_notes
  where id = p_signup_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'payment_status', v_row.payment_status,
    'payment_confirmed_at', v_row.payment_confirmed_at,
    'liters_purchased', v_row.liters_purchased,
    'acres_from_liters',
        case when v_row.liters_purchased is not null
             then (v_row.liters_purchased * 2)::numeric
             else null end,
    'product_shipped_at', v_row.product_shipped_at,
    'product_delivered_at', v_row.product_delivered_at,
    'access_granted_at', v_row.access_granted_at,
    'status', v_row.status,
    'vendor_notes', v_row.vendor_notes
  );
end;
$$;

grant execute on function public.vendor_update_bio_trial_signup(uuid, jsonb) to authenticated;
