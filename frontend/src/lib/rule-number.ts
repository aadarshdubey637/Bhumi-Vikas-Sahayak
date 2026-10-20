/** Path-safe link to a rule. Always pass the server's `rule_number`/`official_rule_id`; never derive "26-B" from "26b". */
export const ruleHref = (ruleNumber: string): string => `/rules/${encodeURIComponent(ruleNumber)}`;

export const decodeRuleParam = (param: string | undefined): string => {
  if (!param) return "";
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
};

/** Ids that go into paths: permissive but safe (no slashes, no whitespace). */
export const isSafeId = (id: string | undefined): id is string => !!id && /^[A-Za-z0-9_-]{1,64}$/.test(id);
