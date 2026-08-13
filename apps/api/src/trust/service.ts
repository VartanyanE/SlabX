import type {
  ModerationActionInput,
  ReportInput,
  ReviewInput,
} from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { TrustRepository } from "./repository.js";

export class TrustService {
  constructor(private readonly repository: TrustRepository) {}
  async review(userId: string, input: ReviewInput) {
    const result = await this.repository.createReview(userId, input);
    if (result === "DUPLICATE")
      throw new CatalogError(
        "REVIEW_ALREADY_EXISTS",
        409,
        "You already reviewed this transaction.",
      );
    if (!result)
      throw new CatalogError(
        "REVIEW_NOT_ELIGIBLE",
        403,
        "Reviews are available only to participants after delivery.",
      );
    return result;
  }
  async profile(userId: string) {
    const [summary, reviews] = await Promise.all([
      this.repository.summary(userId),
      this.repository.reviews(userId),
    ]);
    return { summary, reviews };
  }
  report(userId: string, input: ReportInput) {
    return this.repository.createReport(userId, input);
  }
  queue(status?: string) {
    return this.repository.queue(status);
  }
  async moderate(
    userId: string,
    reportId: string,
    input: ModerationActionInput,
  ) {
    if (
      !(await this.repository.moderate(
        userId,
        reportId,
        input.decision,
        input.note,
      ))
    )
      throw new CatalogError("REPORT_NOT_FOUND", 404, "Report not found.");
  }
}
