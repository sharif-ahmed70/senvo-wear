import type { TransactionContext, TransactionManager } from "@senvo/domain";
import type { ValidatedApplicationExecutionContext } from "./execution-context.js";

export type ApplicationTransactionContext =
  TransactionContext<ValidatedApplicationExecutionContext>;
export type ApplicationTransactionManager =
  TransactionManager<ValidatedApplicationExecutionContext>;
