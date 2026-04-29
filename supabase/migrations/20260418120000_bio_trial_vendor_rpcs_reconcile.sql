-- Bio trial vendor RPCs — rename + signature reconcile
--
-- Replaces the two this-session-named RPCs (bio_trial_list_signups,
-- bio_trial_vendor_update) with the design-doc names plus a jsonb-patch
-- signature on the update function. Rationale: the patch-jsonb shape is
-- easier to extend (e.g. adding a "shipped" key) without bumping callers'
-- positional argument lists.
--
-- Patch keys are intent-level rather than column-level so the function can
-- preserve the idempotent timestamping behavior internally:
--   paid      -> sets payment_status + stamps payment_confirmed_at on
--                false→true transitions, clears on true→false
--   liters    -> sets liters_purchased (null clears)
--   shipped   -> stamps product_shipped_at on false→true transition
--   delivered -> stamps product_delivered_at AND access_granted_at on
--                false→true transition (they move together — delivery is
--                the gate that grants trial access)
--   notes    -> sets vendor_notes

-- New name: list_bio_trial_signups (verb-first convention from design doc)
create or replace function public.list_bio_trial_signups()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'bio_trial'
as $$
declare
  rows jsonb;
begin
  if not bio_trial.is_vendor() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  into rows
  from (
    select
      created_at,
      jsonb_build_object(
        'id', id,
        'created_at', created_at,
        'name', name,
        'farm_name', farm_name,
        'email', email,
        'phone', phone,
        'province_state', province_state,
        'rm_county', rm_county,
        'crops', crops,
        'crops_other', crops_other,
        'acres_requested', acres,
        'logistics_method', logistics_method,
        'delivery_street', delivery_street,
        'delivery_city', delivery_city,
        'delivery_postal', delivery_postal,
        'status', status,
        'payment_status', payment_status,
        'payment_confirmed_at', payment_confirmed_at,
        'liters_purchased', liters_purchased,
        'acres_from_liters',
            case when liters_purchased is not null
                 then (liters_purchased * 2)::numeric
                 else null end,
        'product_shipped_at', product_shipped_at,
        'product_delivered_at', product_delivered_at,
        'access_granted_at', access_granted_at,
        'vendor_notes', vendor_notes
      ) as row_json
    from bio_trial.signups
  ) s;

  return rows;
end;
$$;

grant execute on function public.list_bio_trial_signups() to authenticated;

-- New name + signature: vendor_update_bio_trial_signup(id uuid, patch jsonb)
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

  update bio_trial.signups
  set
    payment_status = case
      when not (p_patch ? 'paid') then payment_status
      when v_paid then 'paid'
      else 'pending'
    end,
    payment_confirmed_at = case
      when not (p_patch ? 'paid') then payment_confirmed_at
      when v_paid and payment_confirmed_at is null then now()
      when not v_paid then null
      else payment_confirmed_at
    end,
    liters_purchased = case
      when p_patch ? 'liters' then v_liters
      else liters_purchased
    end,
    product_shipped_at = case
      when not (p_patch ? 'shipped') then product_shipped_at
      when v_shipped and product_shipped_at is null then now()
      when not v_shipped then null
      else product_shipped_at
    end,
    product_delivered_at = case
      when not (p_patch ? 'delivered') then product_delivered_at
      when v_delivered and product_delivered_at is null then now()
      when not v_delivered then null
      else product_delivered_at
    end,
    access_granted_at = case
      when not (p_patch ? 'delivered') then access_granted_at
      when v_delivered and access_granted_at is null then now()
      when not v_delivered then null
      else access_granted_at
    end,
    status = case
      when (p_patch ? 'delivered') and v_delivered then 'completed'
      when (p_patch ? 'paid') and v_paid then 'approved'
      else status
    end,
    vendor_notes = case
      when p_patch ? 'notes' then v_notes
      else vendor_notes
    end
  where id = p_signup_id
  returning * into v_row;

  if not found then
    raise exception 'signup not found: %', p_signup_id;
  end if;

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

-- Drop the this-session variants now that callers will move to the new names.
drop function if exists public.bio_trial_list_signups();
drop function if exists public.bio_trial_vendor_update(uuid, boolean, numeric, boolean, text);
