-- 008_provider_output.sql — media produced by a provider (Gemini image/TTS).
-- payload holds the app URL of the stored file (/api/v1/generated/...).

ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_source_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_source_check
  CHECK (source IN ('local-draft', 'upload-session', 'provider-request', 'provider-output'));
