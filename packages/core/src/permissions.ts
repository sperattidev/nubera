export const USER_ROLES = ["owner", "programmer", "announcer", "sales"] as const;
export type Role = (typeof USER_ROLES)[number];

export const PERMISSIONS = [
  "assets:read",
  "assets:write",
  "schedule:read",
  "schedule:write",
  "plays:read",
  "ads:read",
  "ads:write",
  "agents:manage",
  "users:manage",
  "stations:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  programmer: ["assets:read", "assets:write", "schedule:read", "schedule:write", "plays:read", "ads:read"],
  announcer: ["assets:read", "schedule:read", "plays:read"],
  sales: ["plays:read", "ads:read", "ads:write"],
};

/**
 * Qué puede hacer cada rol. La API lo aplica en cada ruta y el panel lo usa para
 * mostrar solo las acciones disponibles; la API es siempre la que decide.
 */
export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}
