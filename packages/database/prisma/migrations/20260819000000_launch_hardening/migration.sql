-- Launch-readiness indexes for audit investigations and reconciliation scans.
CREATE INDEX "audit_events_target_type_target_id_created_at_idx"
  ON "audit_events"("target_type", "target_id", "created_at");

CREATE INDEX "reconciliation_records_reconciled_at_idx"
  ON "reconciliation_records"("reconciled_at");
