/**
 * `ultracode-core/facade` — public types and adapters for the additive
 * `budget` / `authoring` / `learning` sub-APIs exposed on the {@link UltraCode}
 * facade (Modules A/B/C of v1.2.0).
 */

export {
  buildAuthoringFacade,
  buildBudgetFacade,
  buildLearningFacade,
} from "./ext-adapters.js";
export type {
  AuthoringFacade,
  BudgetFacade,
  BudgetPlanAnswers,
  BudgetPlanView,
  BudgetStatusView,
  LearningFacade,
  SourceAddInput,
} from "./ext-types.js";
