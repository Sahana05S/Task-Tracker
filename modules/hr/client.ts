// PUBLIC client-safe exports of the hr module: types and pure rules only.
export {
  CONDUCT_BODY_MAX,
  CONDUCT_TITLE_MAX,
  conductBlocks,
  DEFAULT_CONDUCT_BODY,
  DEFAULT_CONDUCT_TITLE,
  type ConductBlock,
} from '@/modules/hr/internal/rules';
export type { CodeOfConduct, ConductAcknowledgement, ConductVersion } from '@/modules/hr/internal/conduct';
