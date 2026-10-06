import type { User } from "@nubera/db";

export type Role = User["role"];

export const PERMISSIONS = [
  "assets:read",
  "assets:write",
  "schedule:read",
  "schedule:write",
  "plays:read",
  "agents:manage",
  "users:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  programmer: ["assets:read", "assets:write", "schedule:read", "schedule:write", "plays:read"],
  announcer: ["assets:read", "schedule:read", "plays:read"],
  sales: ["plays:read"],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}
