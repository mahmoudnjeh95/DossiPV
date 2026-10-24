-- An audit entry points at the installer it concerns; deleting the installer keeps the entry.
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
