import type { Role } from "../types";

// The role that "represents" a member: highest position wins (that's the role
// hierarchy), ignoring @everyone. Used for name colors and list grouping.
export function topRole(roles: Role[] | undefined, opts?: { colored?: boolean; hoisted?: boolean }): Role | undefined {
  if (!roles?.length) return undefined;
  return [...roles]
    .filter((r) => !r.isDefault)
    .filter((r) => (opts?.colored ? !!r.color && r.color !== "#99aab5" : true))
    .filter((r) => (opts?.hoisted ? r.hoist : true))
    .sort((a, b) => b.position - a.position)[0];
}

/** Name color for a member, or undefined to keep the default text color. */
export function roleColor(roles: Role[] | undefined): string | undefined {
  return topRole(roles, { colored: true })?.color;
}
