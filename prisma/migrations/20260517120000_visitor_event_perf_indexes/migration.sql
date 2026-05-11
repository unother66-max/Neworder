-- Admin distinct-IP time windows + ipHash/path dedupe lookups
CREATE INDEX "VisitorEvent_createdAt_ipHash_idx" ON "VisitorEvent"("createdAt", "ipHash");

CREATE INDEX "VisitorEvent_ipHash_path_createdAt_idx" ON "VisitorEvent"("ipHash", "path", "createdAt");
