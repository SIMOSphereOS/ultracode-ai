/**
 * `ultracode-core/facade` — public types and adapters for the additive
 * `budget` / `authoring` / `learning` sub-APIs exposed on the {@link UltraCode}
 * facade (Modules A/B/C of v1.2.0).
 */

export type {
  BudgetFacade,
  BudgetStatusView,
  BudgetPlanView,
  BudgetPlanAnswers,
  AuthoringFacade,
  LearningFacade,
  SourceAddInput,
} from "./ext-types.js";

export {
  buildBudgetFacade,
  buildAuthoringFacade,
  buildLearningFacade,
} from "./ext-adapters.js";
