-- Migration 64: company branding (Settings > Company > Branding).
--
-- The product is Stellar; each company shows its own logo inside the signed-in
-- workspace (top bar) and on reports, so a second company never sees the
-- first one's mark.
--
-- 1. organization_settings gains four optional image addresses: the full logo
--    and the compact mark, each with a dark-theme variant (a missing dark
--    variant falls back to the light one in the app). An address is either
--    app-relative ('/brands/...', served from public/) or https; anything
--    else (javascript:, data:, protocol-relative '//') is refused by
--    taskpulse_private.is_brand_url, used by the column checks and the command.
-- 2. company_settings() returns `branding` {companyName, logoUrl, logoDarkUrl,
--    markUrl, markDarkUrl} to every member; company_settings_command gains the
--    'branding' section for the managing director (same version, receipt and
--    audit rules as the other sections). Both are patched by replacing one
--    known fragment of the deployed definition, as 52, 53 and 61 did.
-- 3. Company #1: "Saahithyaa Realtors and Builders" is now Arkensys Realtors
--    (user decision, 23 October 2026). Only the default company is renamed,
--    and only while it still has the old name; its four addresses point at the
--    logo files committed under public/brands/arkensys/.
--
-- The company name itself stays platform-owned (no command changes it).

BEGIN;

CREATE FUNCTION taskpulse_private.is_brand_url(p_url text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p_url IS NULL OR (length(p_url)<=500 AND p_url !~ '^//'
  AND p_url ~ '^(/[A-Za-z0-9._~/-]+|https://[^[:space:]"''<>()\\]+)$')
$$;

ALTER TABLE taskpulse_private.organization_settings
 ADD COLUMN logo_url text CHECK (taskpulse_private.is_brand_url(logo_url)),
 ADD COLUMN logo_dark_url text CHECK (taskpulse_private.is_brand_url(logo_dark_url)),
 ADD COLUMN mark_url text CHECK (taskpulse_private.is_brand_url(mark_url)),
 ADD COLUMN mark_dark_url text CHECK (taskpulse_private.is_brand_url(mark_dark_url));

DO $$
DECLARE def text; fn regprocedure; frag text; spec record; BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.company_settings()',
   '''defaultScaleMode'',coalesce(s.default_scale_mode,''manual''),',
   '''defaultScaleMode'',coalesce(s.default_scale_mode,''manual''),
  ''branding'',jsonb_build_object(''companyName'',(SELECT o.name FROM public.organizations o WHERE o.id=org),
   ''logoUrl'',s.logo_url,''logoDarkUrl'',s.logo_dark_url,''markUrl'',s.mark_url,''markDarkUrl'',s.mark_dark_url),'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'p_section NOT IN (''agenda'',''categories'',''meeting_types'',''standing_missions'',''holidays'',''mission_defaults'')',
   'p_section NOT IN (''agenda'',''categories'',''meeting_types'',''standing_missions'',''holidays'',''mission_defaults'',''branding'')'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'ELSIF p_section=''categories'' THEN',
   'ELSIF p_section=''branding'' THEN
  IF p_payload-ARRAY[''logoUrl'',''logoDarkUrl'',''markUrl'',''markDarkUrl'']<>''{}'' THEN
   RAISE EXCEPTION ''Branding takes logoUrl, logoDarkUrl, markUrl and markDarkUrl only'' USING ERRCODE=''23514''; END IF;
  FOREACH code IN ARRAY ARRAY[''logoUrl'',''logoDarkUrl'',''markUrl'',''markDarkUrl''] LOOP
   IF coalesce(jsonb_typeof(p_payload->code),''null'') NOT IN (''string'',''null'')
    OR NOT taskpulse_private.is_brand_url(nullif(btrim(p_payload->>code),'''')) THEN
    RAISE EXCEPTION ''Each logo address must start with / (a file of this site) or https://, up to 500 characters'' USING ERRCODE=''23514''; END IF;
  END LOOP;
  UPDATE taskpulse_private.organization_settings SET
   logo_url=nullif(btrim(p_payload->>''logoUrl''),''''),logo_dark_url=nullif(btrim(p_payload->>''logoDarkUrl''),''''),
   mark_url=nullif(btrim(p_payload->>''markUrl''),''''),mark_dark_url=nullif(btrim(p_payload->>''markDarkUrl''),'''')
  WHERE organization_id=org;

 ELSIF p_section=''categories'' THEN')
 ) v(sig,old_text,new_text) LOOP
  fn:=spec.sig::regprocedure; frag:=spec.old_text;
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one "%"; update migration 64',spec.sig,frag; END IF;
  EXECUTE replace(def,frag,spec.new_text);
 END LOOP;
END $$;

-- Company #1 becomes Arkensys Realtors, with its logo files.
DO $$
DECLARE org uuid; BEGIN
 SELECT o.id INTO org FROM public.organizations o WHERE o.is_default AND o.name='Saahithyaa Realtors and Builders';
 IF org IS NULL THEN RETURN; END IF;
 UPDATE public.organizations SET name='Arkensys Realtors',updated_at=now() WHERE id=org;
 INSERT INTO taskpulse_private.organization_settings(organization_id,logo_url,logo_dark_url,mark_url,mark_dark_url)
 VALUES(org,'/brands/arkensys/logo.svg','/brands/arkensys/logo-dark.svg','/brands/arkensys/mark.svg','/brands/arkensys/mark-dark.svg')
 ON CONFLICT (organization_id) DO UPDATE SET logo_url=excluded.logo_url,logo_dark_url=excluded.logo_dark_url,
  mark_url=excluded.mark_url,mark_dark_url=excluded.mark_dark_url;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
