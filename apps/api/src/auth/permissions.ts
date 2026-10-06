import type { User } from "@nubera/db";

export type Role = User["role"];

export const PERMISSIONS = ["assets:read", "assets:write", "users:manage"] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  programmer: ["assets:read", "assets:write"],
  announcer: ["assets:read"],
  sales: [],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}
