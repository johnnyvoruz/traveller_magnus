export const auditBacklog = [];

export function resetAuditBacklog() {
    auditBacklog.length = 0;
}

export function replaceAuditBacklog(items) {
    auditBacklog.splice(0, auditBacklog.length, ...items);
}
